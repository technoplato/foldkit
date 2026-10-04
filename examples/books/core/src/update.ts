import { Array, Effect, Match as M, Option } from 'effect'
import { Command, Navigation } from 'foldkit'
import * as TranscriptPlayer from 'transcript-player-core-example'

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
  type Milliseconds,
  type Speed,
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
  ShelfReady,
  ShelfUnavailable,
  type Title,
  bookmarkOf,
  chapterOf,
  mediaOf,
  placeOf,
  resumePlaceOf,
  titleOf,
} from './model.js'
import { navigation } from './navigation.js'
import type { BooksServices } from './services.js'
import {
  isOnPlayer,
  loadedSlugOf,
  shownTitleOf,
  titlePageSlugOf,
} from './stack.js'

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
  if (isOnPlayer(model) && Option.contains(titlePageSlugOf(model), slug)) {
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
      withStack(model, {
        ...model.navigation,
        pages: [TitlePage({ slug })],
      }),
      PlayerPage(),
    )
  }
}

type Commands = UpdateReturn[1]

const saveOf = (slug: TitleSlug, placeMs: Milliseconds): Commands => [
  WriteLibrary({ write: SavePlace({ slug, placeMs }) }),
]

const withLoaded = (model: Model, loaded: Loaded): Model => ({
  ...model,
  listening: loaded,
})

const savedAt = (
  model: Model,
  loaded: Loaded,
  placeMs: Milliseconds,
): UpdateReturn =>
  placeMs === loaded.savedPlaceMs
    ? [withLoaded(model, loaded), []]
    : [
        withLoaded(model, Loaded({ ...loaded, savedPlaceMs: placeMs })),
        saveOf(loaded.slug, placeMs),
      ]

/**
 * Acts on what the player reports: a save every 30 seconds of listening,
 * a save where it stopped or was moved while paused, and the finish.
 */
const heldOut = (
  model: Model,
  loaded: Loaded,
  maybeOutMessage: Option.Option<TranscriptPlayer.OutMessage>,
): UpdateReturn =>
  Option.match(maybeOutMessage, {
    onNone: () => [withLoaded(model, loaded), []],
    onSome: M.type<TranscriptPlayer.OutMessage>().pipe(
      withUpdateReturn,
      M.tagsExhaustive({
        Advanced: ({ placeMs }) =>
          placeMs - loaded.savedPlaceMs >= saveEveryMs
            ? savedAt(model, loaded, placeMs)
            : [withLoaded(model, loaded), []],
        Stopped: ({ placeMs }) => savedAt(model, loaded, placeMs),
        Moved: ({ placeMs }) =>
          TranscriptPlayer.isSounding(loaded.player)
            ? [withLoaded(model, loaded), []]
            : savedAt(model, loaded, placeMs),
        Finished: () => [
          withLoaded(
            model,
            Loaded({ ...loaded, savedPlaceMs: placeOf(loaded) }),
          ),
          [WriteLibrary({ write: FinishTitle({ slug: loaded.slug }) })],
        ],
      }),
    ),
  })

/** Hands one player Message to the loaded player, then acts on its report. */
const playerUpdated = (
  model: Model,
  message: TranscriptPlayer.Message,
): UpdateReturn =>
  M.value(model.listening).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Idle: () => [model, []],
      Loaded: loaded => {
        const [player, commands, maybeOutMessage] = TranscriptPlayer.update(
          loaded.player,
          message,
        )
        const [next, saves] = heldOut(
          model,
          Loaded({ ...loaded, player }),
          maybeOutMessage,
        )
        return [next, [...commands, ...saves]]
      },
    }),
  )

const savedBeforeSwitch = (model: Model): Commands =>
  model.listening._tag === 'Loaded' &&
  placeOf(model.listening) !== model.listening.savedPlaceMs
    ? saveOf(model.listening.slug, placeOf(model.listening))
    : []

const loadedWith = (model: Model, title: Title): Model => {
  if (Option.contains(loadedSlugOf(model), title.slug)) {
    return model
  } else {
    const placeMs = resumePlaceOf(model, title.slug)
    return withLoaded(
      model,
      Loaded({
        slug: title.slug,
        savedPlaceMs: placeMs,
        player: TranscriptPlayer.init(mediaOf(title), {
          placeMs,
          speed: model.speed,
        }),
      }),
    )
  }
}

type Showing = 'ShowsPlayer' | 'StaysHere'

/**
 * Plays a title in the player, from `maybePlaceMs` or else where the
 * listener is: another title loaded first saves its place and gives way.
 * `ShowsPlayer` opens the title's player too.
 */
const listened = (
  model: Model,
  slug: TitleSlug,
  maybePlaceMs: Option.Option<Milliseconds>,
  showing: Showing,
): UpdateReturn =>
  Option.match(
    Option.filter(titleOf(model, slug), title =>
      Option.isSome(title.maybeAudioUrl),
    ),
    {
      onNone: () => [model, []],
      onSome: title => {
        const switchSaves = Option.contains(loadedSlugOf(model), slug)
          ? []
          : savedBeforeSwitch(model)
        const [sought, seekSaves] = Option.match(maybePlaceMs, {
          onNone: (): UpdateReturn => [loadedWith(model, title), []],
          onSome: placeMs =>
            playerUpdated(
              loadedWith(model, title),
              TranscriptPlayer.SeekTo({ placeMs }),
            ),
        })
        const [played, playCommands] = playerUpdated(
          sought,
          TranscriptPlayer.Play(),
        )
        return [
          showing === 'ShowsPlayer' ? openedPlayer(played, slug) : played,
          [...switchSaves, ...seekSaves, ...playCommands],
        ]
      },
    },
  )

const jumpedToChapter = (
  model: Model,
  chapterNumber: ChapterNumber,
): UpdateReturn =>
  Option.match(
    Option.flatMap(shownTitleOf(model), slug =>
      Option.flatMap(titleOf(model, slug), title =>
        Option.map(chapterOf(title, chapterNumber), chapter => ({
          slug,
          chapter,
        })),
      ),
    ),
    {
      onNone: () => [model, []],
      onSome: ({ slug, chapter }) => {
        const [next, commands] = listened(
          model,
          slug,
          Option.some(chapter.startMs),
          'StaysHere',
        )
        return [withoutModal(next, isContentsSheet), commands]
      },
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

const playedBookmark = (model: Model, bookmarkId: BookmarkId): UpdateReturn =>
  Option.match(bookmarkOf(model, bookmarkId), {
    onNone: () => [model, []],
    onSome: bookmark =>
      listened(model, bookmark.slug, Option.some(bookmark.atMs), 'ShowsPlayer'),
  })

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

const bookmarkedPlace = (model: Model): UpdateReturn =>
  M.value(model.listening).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Idle: () => [model, []],
      Loaded: loaded => [
        model,
        [
          WriteLibrary({
            write: AddBookmarkAt({ slug: loaded.slug, atMs: placeOf(loaded) }),
          }),
        ],
      ],
    }),
  )

const spedTo = (model: Model, speed: Speed): UpdateReturn => {
  const [next, commands] = playerUpdated(
    { ...model, speed },
    TranscriptPlayer.SetSpeed({ speed }),
  )
  return [withoutModal(next, isSpeedSheet), commands]
}

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
      Listen: ({ slug }) => listened(model, slug, Option.none(), 'ShowsPlayer'),
      Play: message => playerUpdated(model, message),
      Pause: message => playerUpdated(model, message),
      SkipBack: message => playerUpdated(model, message),
      SkipForward: message => playerUpdated(model, message),
      SeekTo: message => playerUpdated(model, message),
      SeekToWord: message => playerUpdated(model, message),
      OpenPlayer: () => [
        model.listening._tag === 'Loaded'
          ? openedPlayer(model, model.listening.slug)
          : model,
        [],
      ],
      ShowContents: () => [presentedSheet(model, ContentsSheet()), []],
      JumpToChapter: ({ chapterNumber }) =>
        jumpedToChapter(model, chapterNumber),
      OpenChapter: ({ chapterNumber }) => [
        openedChapter(model, chapterNumber),
        [],
      ],
      ShowSpeeds: () => [presentedSheet(model, SpeedSheet()), []],
      SetSpeed: ({ speed }) => spedTo(model, speed),
      AddBookmark: () => bookmarkedPlace(model),
      PlayBookmark: ({ bookmarkId }) => playedBookmark(model, bookmarkId),
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
      ReachedPlace: message => playerUpdated(model, message),
      ReachedEnd: message => playerUpdated(model, message),
      FailedPlayAudio: message => playerUpdated(model, message),
      ReceivedPassages: message => playerUpdated(model, message),
      FailedLoadTranscript: message => playerUpdated(model, message),
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
