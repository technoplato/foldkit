import { Array, Effect, Match as M, Option } from 'effect'
import { Command, Navigation } from 'foldkit'

import {
  ChapterPage,
  ContentsSheet,
  DeleteBookmarkQuestion,
  type Destination,
  PlayerPage,
  SpeedSheet,
  TitlePage,
  isContentsSheet,
  isDeleteBookmarkQuestion,
  isSpeedSheet,
  isTitlePage,
} from './destination.js'
import {
  type BookmarkId,
  type ChapterNumber,
  Milliseconds,
  type TitleSlug,
} from './ids.js'
import {
  AddBookmarkAt,
  FinishTitle,
  LibraryStore,
  LibraryWrite,
  RemoveBookmark,
  SavePlace,
} from './library.js'
import {
  CompletedWriteLibrary,
  FailedWriteLibrary,
  type Message,
} from './message.js'
import {
  Loaded,
  type Model,
  Paused,
  Playing,
  ShelfReady,
  ShelfUnavailable,
  bookmarkOf,
  chapterOf,
  loadedTitleOf,
  resumePlaceOf,
  titleOf,
} from './model.js'
import { navigation } from './navigation.js'
import type { BooksServices } from './services.js'
import { isOnPlayer, shownTitleOf, titlePageSlugOf } from './stack.js'

// COMMAND

/**
 * Asks the library store to save a place, a finish, or a bookmark change.
 * A refusal becomes FailedWriteLibrary with the store's reason, so a lost
 * connection never crashes the player.
 */
export const WriteLibrary = Command.define(
  'WriteLibrary',
  { write: LibraryWrite },
  CompletedWriteLibrary,
  FailedWriteLibrary,
)(({ write }) =>
  Effect.gen(function* () {
    const store = yield* LibraryStore
    yield* store.write(write)
    return CompletedWriteLibrary()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedWriteLibrary({ reason: error.reason })),
    ),
  ),
)

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, BooksServices>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const skipMs = 30_000

const saveEveryMs = 30_000

const withStack = (
  model: Model,
  stack: Navigation.NavigationStack<Destination>,
): Model => ({ ...model, navigation: stack })

const pushedPage = (model: Model, page: Destination): Model =>
  withStack(
    model,
    Navigation.pushed(
      model.navigation,
      Navigation.presented<Destination>(page, Navigation.Push()),
    ),
  )

const presentedSheet = (model: Model, sheet: Destination): Model =>
  withStack(
    model,
    Navigation.pushed(
      model.navigation,
      Navigation.presented<Destination>(sheet, Navigation.Sheet()),
    ),
  )

const withoutModal = (
  model: Model,
  isModal: (destination: unknown) => boolean,
): Model =>
  withStack(model, Navigation.withoutDestinations(model.navigation, isModal))

/** The title's page, right above the library. */
const openedTitle = (model: Model, slug: TitleSlug): Model =>
  Option.isSome(titleOf(model, slug))
    ? withStack(
        model,
        Navigation.pushed(
          { ...model.navigation, pages: [] },
          Navigation.presented<Destination>(
            TitlePage({ slug }),
            Navigation.Push(),
          ),
        ),
      )
    : model

/**
 * The player on top of the pages: above the title's page when that title
 * is open, else right above the library. Already there, nothing moves.
 */
const openedPlayer = (model: Model, slug: TitleSlug): Model => {
  if (isOnPlayer(model)) {
    return model
  } else if (Option.contains(titlePageSlugOf(model), slug)) {
    return pushedPage(
      withStack(model, {
        ...model.navigation,
        pages: Array.filter(model.navigation.pages, isTitlePage),
      }),
      PlayerPage(),
    )
  } else {
    return pushedPage(
      withStack(model, { ...model.navigation, pages: [] }),
      PlayerPage(),
    )
  }
}

const nextCueOf = (model: Model): Model => ({
  ...model,
  nextCue: model.nextCue + 1,
})

const playingAt = (
  model: Model,
  slug: TitleSlug,
  placeMs: Milliseconds,
): Model => ({
  ...nextCueOf(model),
  listening: Loaded({
    slug,
    placeMs,
    transport: Playing({ cue: model.nextCue }),
    savedPlaceMs: placeMs,
  }),
})

const placeToPlayOf = (model: Model, slug: TitleSlug): Milliseconds =>
  model.listening._tag === 'Loaded' && model.listening.slug === slug
    ? model.listening.placeMs
    : resumePlaceOf(model, slug)

const hasAudio = (model: Model, slug: TitleSlug): boolean =>
  Option.exists(titleOf(model, slug), title =>
    Option.isSome(title.maybeAudioUrl),
  )

const played = (model: Model, slug: TitleSlug): Model =>
  hasAudio(model, slug)
    ? openedPlayer(playingAt(model, slug, placeToPlayOf(model, slug)), slug)
    : model

const saveOf = (
  slug: TitleSlug,
  placeMs: Milliseconds,
): ReadonlyArray<Command.Command<Message, never, BooksServices>> => [
  WriteLibrary({ write: SavePlace({ slug, placeMs }) }),
]

const paused = (model: Model): UpdateReturn =>
  M.value(model.listening).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Idle: () => [model, []],
      Loaded: loaded => [
        {
          ...model,
          listening: Loaded({
            ...loaded,
            transport: Paused(),
            savedPlaceMs: loaded.placeMs,
          }),
        },
        loaded.placeMs === loaded.savedPlaceMs
          ? []
          : saveOf(loaded.slug, loaded.placeMs),
      ],
    }),
  )

const movedTo = (model: Model, placeMs: Milliseconds): Model =>
  M.value(model.listening).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      Idle: () => model,
      Loaded: loaded => ({
        ...nextCueOf(model),
        listening: Loaded({
          ...loaded,
          placeMs,
          transport:
            loaded.transport._tag === 'Playing'
              ? Playing({ cue: model.nextCue })
              : Paused(),
        }),
      }),
    }),
  )

const skipped = (model: Model, byMs: number): Model =>
  Option.match(loadedTitleOf(model), {
    onNone: () => model,
    onSome: ({ title, loaded }) =>
      movedTo(
        model,
        Milliseconds.make(
          Math.min(title.durationMs, Math.max(0, loaded.placeMs + byMs)),
        ),
      ),
  })

const jumpedToChapter = (model: Model, chapterNumber: ChapterNumber): Model =>
  Option.match(
    Option.flatMap(shownTitleOf(model), slug =>
      Option.flatMap(titleOf(model, slug), title =>
        Option.map(chapterOf(title, chapterNumber), chapter => ({
          slug,
          chapter,
        })),
      ),
    ).pipe(Option.filter(({ slug }) => hasAudio(model, slug))),
    {
      onNone: () => model,
      onSome: ({ slug, chapter }) =>
        withoutModal(playingAt(model, slug, chapter.startMs), isContentsSheet),
    },
  )

const openedChapter = (model: Model, chapterNumber: ChapterNumber): Model =>
  Option.isSome(titlePageSlugOf(model))
    ? pushedPage(
        withStack(model, {
          ...model.navigation,
          pages: Array.filter(model.navigation.pages, isTitlePage),
        }),
        ChapterPage({ chapterNumber }),
      )
    : model

const playedBookmark = (model: Model, bookmarkId: BookmarkId): Model =>
  Option.match(
    Option.filter(bookmarkOf(model, bookmarkId), bookmark =>
      hasAudio(model, bookmark.slug),
    ),
    {
      onNone: () => model,
      onSome: bookmark =>
        openedPlayer(
          playingAt(model, bookmark.slug, bookmark.atMs),
          bookmark.slug,
        ),
    },
  )

const askedToDelete = (model: Model, bookmarkId: BookmarkId): Model =>
  Option.isSome(bookmarkOf(model, bookmarkId))
    ? withStack(
        model,
        Navigation.pushed(
          model.navigation,
          Navigation.presented<Destination>(
            DeleteBookmarkQuestion({ bookmarkId }),
            Navigation.Dialog(),
          ),
        ),
      )
    : model

const reachedPlace = (model: Model, placeMs: Milliseconds): UpdateReturn =>
  M.value(model.listening).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Idle: () => [model, []],
      Loaded: loaded => {
        const isDue = placeMs - loaded.savedPlaceMs >= saveEveryMs
        return [
          {
            ...model,
            listening: Loaded({
              ...loaded,
              placeMs,
              savedPlaceMs: isDue ? placeMs : loaded.savedPlaceMs,
            }),
          },
          isDue ? saveOf(loaded.slug, placeMs) : [],
        ]
      },
    }),
  )

const reachedEnd = (model: Model): UpdateReturn =>
  Option.match(loadedTitleOf(model), {
    onNone: () => [model, []],
    onSome: ({ title, loaded }) => [
      {
        ...model,
        listening: Loaded({
          ...loaded,
          placeMs: title.durationMs,
          transport: Paused(),
          savedPlaceMs: title.durationMs,
        }),
      },
      [WriteLibrary({ write: FinishTitle({ slug: title.slug }) })],
    ],
  })

const bookmarkedPlace = (model: Model): UpdateReturn =>
  M.value(model.listening).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Idle: () => [model, []],
      Loaded: loaded => [
        model,
        [
          WriteLibrary({
            write: AddBookmarkAt({ slug: loaded.slug, atMs: loaded.placeMs }),
          }),
        ],
      ],
    }),
  )

/**
 * Applies one Books Message. Navigation moves the stack and the player;
 * a change to the shelf goes to the library store as a Command, and the
 * shelf comes back from the store on every device, so the Model never
 * keeps a copy that disagrees with it. A title or bookmark another device
 * removed first changes nothing.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Open: ({ slug }) => [openedTitle(model, slug), []],
      Play: ({ slug }) => [played(model, slug), []],
      Pause: () => paused(model),
      SkipBack: () => [skipped(model, -skipMs), []],
      SkipForward: () => [skipped(model, skipMs), []],
      OpenPlayer: () => [
        model.listening._tag === 'Loaded'
          ? openedPlayer(model, model.listening.slug)
          : model,
        [],
      ],
      ShowContents: () => [presentedSheet(model, ContentsSheet()), []],
      JumpToChapter: ({ chapterNumber }) => [
        jumpedToChapter(model, chapterNumber),
        [],
      ],
      OpenChapter: ({ chapterNumber }) => [
        openedChapter(model, chapterNumber),
        [],
      ],
      ShowSpeeds: () => [presentedSheet(model, SpeedSheet()), []],
      SetSpeed: ({ speed }) => [
        withoutModal({ ...model, speed }, isSpeedSheet),
        [],
      ],
      AddBookmark: () => bookmarkedPlace(model),
      PlayBookmark: ({ bookmarkId }) => [playedBookmark(model, bookmarkId), []],
      DeleteBookmark: ({ bookmarkId }) => [
        askedToDelete(model, bookmarkId),
        [],
      ],
      ConfirmDeleteBookmark: ({ bookmarkId }) => [
        withoutModal(model, isDeleteBookmarkQuestion),
        [WriteLibrary({ write: RemoveBookmark({ bookmarkId }) })],
      ],
      CancelDeleteBookmark: () => [
        withoutModal(model, isDeleteBookmarkQuestion),
        [],
      ],
      ReceivedShelf: ({ shelf }) => [
        { ...model, library: ShelfReady({ shelf }) },
        [],
      ],
      FailedReadShelf: ({ reason }) => [
        { ...model, library: ShelfUnavailable({ reason }) },
        [],
      ],
      ReachedPlace: ({ placeMs }) => reachedPlace(model, placeMs),
      ReachedEnd: () => reachedEnd(model),
      CompletedWriteLibrary: () => [
        { ...model, maybeProblem: Option.none() },
        [],
      ],
      FailedWriteLibrary: ({ reason }) => [
        { ...model, maybeProblem: Option.some(reason) },
        [],
      ],
      OpenedUri: fact => [Navigation.foldMessage(navigation, model, fact), []],
      NavigatedBack: fact => [
        Navigation.foldMessage(navigation, model, fact),
        [],
      ],
    }),
  )
