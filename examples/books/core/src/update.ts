import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command, Navigation } from 'foldkit'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  audibleUpdated,
  openedAudibleImport,
  presentedAddBooks,
  reconnectedAudible,
} from './addBooks.js'
import {
  ContentsSheet,
  DeleteBookmarkQuestion,
  type Destination,
  PlayerPage,
  ProfilePage,
  SpeedSheet,
  TitlePage,
  isContentsSheet,
  isDeleteBookmarkQuestion,
  isPlayerPage,
  isPlayerScreen,
  isSpeedSheet,
  isTitlePage,
} from './destination.js'
import {
  type BookmarkId,
  type ChapterNumber,
  Milliseconds,
  type Speed,
  type TitleSlug,
  clockOf,
} from './ids.js'
import {
  AddBookmarkAt,
  FinishTitle,
  LibraryStore,
  LibraryWrite,
  RemoveBookmark,
  SavePlace,
} from './library.js'
import { placePathOf, secondOf } from './links.js'
import {
  CompletedWriteLibrary,
  FailedShareLink,
  FailedWriteLibrary,
  type Message,
  SharedLink,
} from './message.js'
import {
  Loaded,
  type Model,
  ShelfReady,
  ShelfUnavailable,
  type Title,
  bookmarkOf,
  chapterOf,
  loadedTitleOf,
  mediaOf,
  placeOf,
  resumePlaceOf,
  titleOf,
} from './model.js'
import { navigation } from './navigation.js'
import type { BooksServices } from './services.js'
import { LinkSharing, type SharedHow } from './share.js'
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

/**
 * Shares a link to a moment through the host's link sharing. A refusal
 * becomes FailedShareLink with its reason, so a blocked clipboard never
 * crashes the player.
 */
export const ShareLink = Command.define(
  'ShareLink',
  { path: S.String, title: S.String },
  SharedLink,
  FailedShareLink,
)(({ path, title }) =>
  Effect.gen(function* () {
    const sharing = yield* LinkSharing
    const how = yield* sharing.share({ path, title })
    return SharedLink({ how })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedShareLink({ reason: error.reason })),
    ),
  ),
)

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, BooksServices>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const saveEveryMs = 10_000

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
const placeOfSlug = (model: Model, slug: TitleSlug): Milliseconds =>
  model.listening._tag === 'Loaded' && model.listening.slug === slug
    ? placeOf(model.listening)
    : resumePlaceOf(model, slug)

const playerPageFor = (model: Model, slug: TitleSlug): Destination =>
  PlayerPage({ atMs: secondOf(placeOfSlug(model, slug)) })

const openedPlayer = (model: Model, slug: TitleSlug): Model => {
  if (isOnPlayer(model) && Option.contains(titlePageSlugOf(model), slug)) {
    return model
  } else if (Option.contains(titlePageSlugOf(model), slug)) {
    return pushedPage(
      withStack(model, {
        ...model.navigation,
        pages: Array.filter(model.navigation.pages, isTitlePage),
      }),
      playerPageFor(model, slug),
    )
  } else {
    return pushedPage(
      withStack(model, {
        ...model.navigation,
        pages: [TitlePage({ slug })],
      }),
      playerPageFor(model, slug),
    )
  }
}

/**
 * Keeps the player's address on the second being heard, so it is always a
 * link back to this moment, and gives a placeless `/listen` its place.
 * Only while the title is on the shelf and in the player, so a link
 * opened before either keeps the place it names until the player gets
 * there.
 */
const withPlayerAddress = (model: Model): Model =>
  Option.match(
    Option.all({
      top: Option.filter(Array.last(model.navigation.pages), isPlayerScreen),
      title: Option.flatMap(titlePageSlugOf(model), slug =>
        titleOf(model, slug),
      ),
    }),
    {
      onNone: () => model,
      onSome: ({ top, title }) => {
        const atMs = secondOf(placeOfSlug(model, title.slug))
        const isLoaded = Option.contains(loadedSlugOf(model), title.slug)
        return isPlayerPage(top) && (top.atMs === atMs || !isLoaded)
          ? model
          : withStack(model, {
              ...model.navigation,
              pages: [
                ...Array.dropRight(model.navigation.pages, 1),
                PlayerPage({ atMs }),
              ],
            })
      },
    },
  )

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
          'ShowsPlayer',
        )
        return [withoutModal(next, isContentsSheet), commands]
      },
    },
  )

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
        {
          ...model,
          maybeNotice: Option.some(
            `Bookmark added at ${clockOf(placeOf(loaded))}`,
          ),
        },
        [
          WriteLibrary({
            write: AddBookmarkAt({ slug: loaded.slug, atMs: placeOf(loaded) }),
          }),
        ],
      ],
    }),
  )

const sharedPlace = (model: Model): UpdateReturn =>
  Option.match(loadedTitleOf(model), {
    onNone: () => [model, []],
    onSome: ({ title, loaded }) => [
      { ...model, maybeNotice: Option.none() },
      [
        ShareLink({
          path: placePathOf(title.slug, placeOf(loaded)),
          title: `${title.name}, at ${clockOf(placeOf(loaded))}`,
        }),
      ],
    ],
  })

const updatedReadAloud = ReadAloud.updateReadAloud<Model, Destination>({
  stack: Navigation.fieldLens<Model, Destination>(),
  place: place => place,
})

const readAloudUpdated = (
  model: Model,
  message: ReadAloud.ReadAloudMessage,
): UpdateReturn => [updatedReadAloud(model, message), []]

/**
 * Shares a link to the page of the book read aloud on screen, the way a
 * moment is shared: `/books/read-aloud/9780063342705/page/4`, with the
 * book's title and the page.
 */
const sharedReadAloudPage = (model: Model): UpdateReturn =>
  Option.match(ReadAloud.pageLinkOf(model), {
    onNone: () => [model, []],
    onSome: link => [
      { ...model, maybeNotice: Option.none() },
      [ShareLink({ path: link.path, title: link.title })],
    ],
  })

const noticeOf = (how: SharedHow): Option.Option<string> =>
  M.value(how).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('Copied', () => Option.some('Link copied')),
    M.when('Shared', () => Option.some('Link shared')),
    M.when('Cancelled', () => Option.none()),
    M.exhaustive,
  )

const spedTo = (model: Model, speed: Speed): UpdateReturn => {
  const [next, commands] = playerUpdated(
    { ...model, speed },
    TranscriptPlayer.SetSpeed({ speed }),
  )
  return [withoutModal(next, isSpeedSheet), commands]
}

const updated = (model: Model, message: Message): UpdateReturn =>
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
      PreviousSection: message => playerUpdated(model, message),
      NextSection: message => playerUpdated(model, message),
      SetSeekScope: message => playerUpdated(model, message),
      ExpandControls: () => [{ ...model, controls: 'Expanded' }, []],
      CollapseControls: () => [{ ...model, controls: 'Collapsed' }, []],
      ShowLibrary: () => [
        withStack(model, {
          ...model.navigation,
          pages: [],
          maybeModal: Option.none(),
        }),
        [],
      ],
      ShowProfile: () => [
        withStack(model, {
          ...model.navigation,
          pages: [ProfilePage()],
          maybeModal: Option.none(),
        }),
        [],
      ],
      ShowReadAloud: () => [
        withStack(model, {
          ...model.navigation,
          pages: [ReadAloud.ReadAloudShelf()],
          maybeModal: Option.none(),
        }),
        [],
      ],
      OpenBook: message => readAloudUpdated(model, message),
      PreviousPage: message => readAloudUpdated(model, message),
      NextPage: message => readAloudUpdated(model, message),
      TurnToPage: message => readAloudUpdated(model, message),
      FollowReading: message => readAloudUpdated(model, message),
      SharePage: () => sharedReadAloudPage(model),
      ReceivedReadings: message => readAloudUpdated(model, message),
      FailedReadReadings: message => readAloudUpdated(model, message),
      ReceivedPreview: message => readAloudUpdated(model, message),
      FailedCheckPreview: message => readAloudUpdated(model, message),
      ReceivedMember: ({ maybeEmail }) => [
        { ...model, maybeMember: maybeEmail },
        [],
      ],
      OpenPlayer: () => [
        model.listening._tag === 'Loaded'
          ? openedPlayer(model, model.listening.slug)
          : model,
        [],
      ],
      ShowContents: () => [presentedSheet(model, ContentsSheet()), []],
      JumpToChapter: ({ chapterNumber }) =>
        jumpedToChapter(model, chapterNumber),
      ShowSpeeds: () => [presentedSheet(model, SpeedSheet()), []],
      SetSpeed: ({ speed }) => spedTo(model, speed),
      SharePlace: () => sharedPlace(model),
      SharedLink: ({ how }) => [{ ...model, maybeNotice: noticeOf(how) }, []],
      FailedShareLink: ({ reason }) => [
        { ...model, maybeNotice: Option.some(`Could not share: ${reason}`) },
        [],
      ],
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
      OpenedPlace: ({ slug, atMs }) => openedPlace(model, slug, atMs),
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
      ShowAddBooks: () => [presentedAddBooks(model), []],
      ImportFromAudible: () => [openedAudibleImport(model), []],
      ReconnectAudible: () => [reconnectedAudible(model), []],
      ConnectAudible: message => audibleUpdated(model, message),
      TryAudibleSignInAgain: message => audibleUpdated(model, message),
      ToggleAudibleTitle: message => audibleUpdated(model, message),
      SelectAllAudibleTitles: message => audibleUpdated(model, message),
      DeselectAudibleTitles: message => audibleUpdated(model, message),
      ImportAudibleTitles: message => audibleUpdated(model, message),
      ReadAudibleLibraryAgain: message => audibleUpdated(model, message),
      StartedAudibleSignIn: message => audibleUpdated(model, message),
      FailedStartAudibleSignIn: message => audibleUpdated(model, message),
      ConnectedAudible: message => audibleUpdated(model, message),
      FailedConnectAudible: message => audibleUpdated(model, message),
      ReceivedAudibleLibrary: message => audibleUpdated(model, message),
      FailedReadAudibleLibrary: message => audibleUpdated(model, message),
      AdvancedAudibleImport: message => audibleUpdated(model, message),
      ImportedAudibleTitles: message => audibleUpdated(model, message),
      FailedImportAudibleTitles: message => audibleUpdated(model, message),
      OpenedUri: fact => [Navigation.foldMessage(navigation, model, fact), []],
      NavigatedBack: fact => [
        Navigation.foldMessage(navigation, model, fact),
        [],
      ],
    }),
  )

const movedQuietly = (model: Model, placeMs: Milliseconds): Model =>
  model.listening._tag === 'Loaded'
    ? withLoaded(
        model,
        Loaded({
          ...model.listening,
          player: TranscriptPlayer.update(
            model.listening.player,
            TranscriptPlayer.SeekTo({ placeMs }),
          )[0],
        }),
      )
    : model

/**
 * Moves the player to the place the address names. Another title in the
 * player saves its place and gives way; the player waits paused at the
 * place. Opening a link saves nothing, so it never moves where the
 * listener stopped.
 */
const openedPlace = (
  model: Model,
  slug: TitleSlug,
  atMs: Milliseconds,
): UpdateReturn =>
  Option.match(titleOf(model, slug), {
    onNone: () => [model, []],
    onSome: title => {
      const switchSaves = Option.contains(loadedSlugOf(model), slug)
        ? []
        : savedBeforeSwitch(model)
      return [movedQuietly(loadedWith(model, title), atMs), switchSaves]
    },
  })

/**
 * Applies one Books Message. Navigation moves the stack and the player;
 * a change to the shelf goes to the library store as a Command, and the
 * shelf comes back from the store on every device, so the Model never
 * keeps a copy that disagrees with it. A title or bookmark another device
 * removed first changes nothing. The player keeps its address on the
 * second it is playing, so the address is always a link to this moment.
 * Read Aloud's Messages go to Read Aloud on Books' own stack, so a page
 * Scribe hears turns the page on screen.
 */
export const update = (model: Model, message: Message): UpdateReturn => {
  const [next, commands] = updated(model, message)
  return [withPlayerAddress(next), commands]
}
