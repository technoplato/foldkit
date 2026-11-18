import {
  Array,
  Clock,
  Effect,
  Match as M,
  Option,
  Record as Record_,
  Schema as S,
} from 'effect'
import { Command, Navigation } from 'foldkit'
import { transcriptPlaceAt } from 'foldkit/renderers'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  audibleUpdated,
  openedAudibleImport,
  presentedAddBooks,
  reconnectedAudible,
} from './addBooks.js'
import {
  alreadyBookmarkedNotice,
  bookmarkOnWord,
  bookmarkPlaceAt,
  excerptAround,
} from './bookmarks.js'
import { closingsOf } from './closings.js'
import {
  BookmarkDrawer,
  BookmarksDrawer,
  ContentsSheet,
  DeleteBookmarkQuestion,
  type Destination,
  PlayerPage,
  ProfilePage,
  SpeedSheet,
  TitlePage,
  isBesidePanel,
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
  NoteBookmark,
  RemoveBookmark,
  SavePlace,
} from './library.js'
import { placePathOf, secondOf, wordPathOf } from './links.js'
import {
  CompletedCloseUnendedPlays,
  CompletedReportStretch,
  CompletedWriteLibrary,
  FailedCloseUnendedPlays,
  FailedReportStretch,
  FailedShareLink,
  FailedWriteLibrary,
  MarkedMoment,
  type Message,
  SharedLink,
} from './message.js'
import {
  type Chapter,
  ChaptersReady,
  ChaptersUnavailable,
  Loaded,
  type Model,
  ShelfReady,
  ShelfUnavailable,
  type StretchReport,
  Title,
  type TitleChapters,
  bookmarkOf,
  bookmarksOf,
  chapterOf,
  chaptersOf,
  loadedTitleOf,
  mediaOf,
  placeOf,
  resumePlaceOf,
  sectionsOf,
  titleOf,
} from './model.js'
import { navigation } from './navigation.js'
import { PlayClosing, ScribeTimeline } from './scribeTimeline.js'
import type { BooksServices } from './services.js'
import { LinkSharing, type SharedHow } from './share.js'
import {
  isOnPlayer,
  isShowingBookmarks,
  isShowingContents,
  loadedSlugOf,
  openBookmarkOf,
  shownTitleOf,
  titlePageSlugOf,
} from './stack.js'
import {
  Quiet,
  type StretchEndReason,
  StretchEvent,
  type StretchState,
  finishedAt,
  isAtOtherSpeed,
  reachedPlace,
  stoppedAt,
} from './stretch.js'

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
 * Reads the clock for a bookmark, so the word being spoken at the moment
 * the person asked is the one marked.
 */
export const ReadMoment = Command.define(
  'ReadMoment',
  { maybeNote: S.OptionFromOptionalKey(S.String) },
  MarkedMoment,
)(({ maybeNote }) =>
  Effect.map(Clock.currentTimeMillis, wallClockMs =>
    MarkedMoment({ wallClockMs, maybeNote }),
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

/**
 * Puts a link in the clipboard through the host's link sharing, as `Copy
 * link to this word` promises, where sharing would open a share sheet. A
 * refusal becomes FailedShareLink with its reason.
 */
export const CopyLink = Command.define(
  'CopyLink',
  { path: S.String, title: S.String },
  SharedLink,
  FailedShareLink,
)(({ path, title }) =>
  Effect.gen(function* () {
    const sharing = yield* LinkSharing
    yield* sharing.copy({ path, title })
    return SharedLink({ how: 'Copied' })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedShareLink({ reason: error.reason })),
    ),
  ),
)

/**
 * Tells Scribe's timeline that a stretch of `title` began or ended. A
 * refusal becomes FailedReportStretch with its reason, so a lost
 * connection never stops the player.
 */
export const ReportStretch = Command.define(
  'ReportStretch',
  { title: Title, event: StretchEvent },
  CompletedReportStretch,
  FailedReportStretch,
)(({ title, event }) =>
  Effect.gen(function* () {
    const timeline = yield* ScribeTimeline
    const recordingCount = yield* timeline.report(title, event)
    return CompletedReportStretch({ recordingCount })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedReportStretch({
          report: { title, event },
          reason: error.reason,
        }),
      ),
    ),
  ),
)

/**
 * Writes the ends of plays a closed page left open on Scribe's timeline.
 * A refusal becomes FailedCloseUnendedPlays; the next check finds the
 * plays again.
 */
export const CloseUnendedPlays = Command.define(
  'CloseUnendedPlays',
  { closings: S.Array(PlayClosing) },
  CompletedCloseUnendedPlays,
  FailedCloseUnendedPlays,
)(({ closings }) =>
  Effect.gen(function* () {
    const timeline = yield* ScribeTimeline
    const closedCount = yield* timeline.closePlays(closings)
    return CompletedCloseUnendedPlays({ closedCount })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedCloseUnendedPlays({ reason: error.reason })),
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

const panelSide = 'Left'

/**
 * A destination presented beside the page, as a drawer from the left, the
 * style the routes declare for the contents, the bookmarks, and one
 * bookmark. It takes the place of whichever of them is showing, so the
 * tabs switch the one panel.
 */
const presentedBeside = (model: Model, destination: Destination): Model =>
  withStack(
    model,
    Navigation.pushed(
      Navigation.withoutDestinations(model.navigation, isBesidePanel),
      Navigation.presented<Destination>(
        destination,
        Navigation.Drawer({ from: panelSide }),
      ),
    ),
  )

/**
 * Shows a panel beside the page, or closes it when it is the one showing,
 * so its key and its button open and close it.
 */
const toggledBeside = (
  model: Model,
  isShowing: boolean,
  destination: Destination,
): Model =>
  isShowing
    ? withoutModal(model, isBesidePanel)
    : presentedBeside(model, destination)

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
 * there. An address that names the very place the player is at stays as
 * it is, so a link to one word, `…/listen/12m03.45s`, keeps the word
 * until the audio plays on.
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
        const placeMs = placeOfSlug(model, title.slug)
        const atMs = secondOf(placeMs)
        const isLoaded = Option.contains(loadedSlugOf(model), title.slug)
        return isPlayerPage(top) &&
          (top.atMs === atMs || top.atMs === placeMs || !isLoaded)
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

type Recorded = readonly [StretchState, ReadonlyArray<StretchEvent>]

/**
 * The stretch after what the player reports: each new second the audio
 * reached opens, counts, or ends one at a jump; a pause, a failure, a seek,
 * and the end end it.
 */
const recordedStretch = (
  stretch: StretchState,
  player: TranscriptPlayer.Model,
  maybeOutMessage: Option.Option<TranscriptPlayer.OutMessage>,
): Recorded =>
  Option.match(maybeOutMessage, {
    onNone: () => [stretch, []],
    onSome: M.type<TranscriptPlayer.OutMessage>().pipe(
      M.withReturnType<Recorded>(),
      M.tagsExhaustive({
        Advanced: ({ placeMs, wallClockMs }) =>
          reachedPlace(stretch, { placeMs, wallClockMs, speed: player.speed }),
        Stopped: () =>
          stoppedAt(
            stretch,
            player.transport._tag === 'Unplayable' ? 'Interrupted' : 'Paused',
          ),
        Moved: () => stoppedAt(stretch, 'Seeked'),
        Finished: () => finishedAt(stretch, player.media.durationMs),
      }),
    ),
  })

/** Each begin and end of a stretch of `slug`, as Scribe's timeline hears it. */
const stretchReportsOf = (
  model: Model,
  slug: TitleSlug,
  events: ReadonlyArray<StretchEvent>,
): ReadonlyArray<StretchReport> =>
  Option.match(titleOf(model, slug), {
    onNone: () => [],
    onSome: title => Array.map(events, event => ({ title, event })),
  })

const unsentReportsLimit = 50

const sentReports = (
  model: Model,
  reports: ReadonlyArray<StretchReport>,
): UpdateReturn => [
  { ...model, unsentReports: [] },
  Array.map(reports, ReportStretch),
]

/**
 * Sends `reports` to Scribe's timeline after every report it refused
 * before, oldest first, as Scribe Videos does: a stretch heard offline goes
 * out with the next one.
 */
const withReportsSent = (
  model: Model,
  reports: ReadonlyArray<StretchReport>,
): UpdateReturn =>
  Array.isReadonlyArrayEmpty(reports)
    ? [model, []]
    : sentReports(model, [...model.unsentReports, ...reports])

/**
 * Ends the loaded title's stretch for `reason`, and tells Scribe's
 * timeline, while one plays.
 */
const stretchEndedAs = (model: Model, reason: StretchEndReason): UpdateReturn =>
  M.value(model.listening).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Idle: () => [model, []],
      Loaded: loaded => {
        const [stretch, events] = stoppedAt(loaded.stretch, reason)
        return withReportsSent(
          withLoaded(model, Loaded({ ...loaded, stretch })),
          stretchReportsOf(model, loaded.slug, events),
        )
      },
    }),
  )

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
        const [stretch, events] = recordedStretch(
          loaded.stretch,
          player,
          maybeOutMessage,
        )
        const [next, saves] = heldOut(
          model,
          Loaded({ ...loaded, player, stretch }),
          maybeOutMessage,
        )
        const [sent, reports] = withReportsSent(
          next,
          stretchReportsOf(model, loaded.slug, events),
        )
        return [sent, [...commands, ...saves, ...reports]]
      },
    }),
  )

const withChapters = (
  model: Model,
  slug: TitleSlug,
  state: TitleChapters,
): Model => ({ ...model, chapters: Record_.set(model.chapters, slug, state) })

/**
 * The chapters as the loaded player's sections, when the chapters are
 * the loaded title's: a player loaded before they arrived gets them now.
 */
const withPlayerSections = (
  model: Model,
  slug: TitleSlug,
  chapters: Array.NonEmptyReadonlyArray<Chapter>,
): Model =>
  model.listening._tag === 'Loaded' && model.listening.slug === slug
    ? {
        ...model,
        listening: {
          ...model.listening,
          player: {
            ...model.listening.player,
            media: {
              ...model.listening.player.media,
              sections: sectionsOf(chapters),
            },
          },
        },
      }
    : model

const savedBeforeSwitch = (model: Model): Commands =>
  model.listening._tag === 'Loaded' &&
  placeOf(model.listening) !== model.listening.savedPlaceMs
    ? saveOf(model.listening.slug, placeOf(model.listening))
    : []

/**
 * What the title in the player does as another takes its place: it saves
 * its place, and its stretch ends, so Scribe's timeline hears another title
 * started.
 */
const leftBeforeSwitch = (model: Model): UpdateReturn => {
  const [ended, reports] = stretchEndedAs(model, 'TitleChanged')
  return [ended, [...savedBeforeSwitch(model), ...reports]]
}

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
        player: TranscriptPlayer.init(
          mediaOf(
            title,
            Option.getOrElse(chaptersOf(model, title.slug), () => []),
          ),
          {
            placeMs,
            speed: model.speed,
          },
        ),
        stretch: Quiet(),
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
        const [left, switchSaves] = Option.contains(loadedSlugOf(model), slug)
          ? [model, []]
          : leftBeforeSwitch(model)
        const [sought, seekSaves] = Option.match(maybePlaceMs, {
          onNone: (): UpdateReturn => [loadedWith(left, title), []],
          onSome: placeMs =>
            playerUpdated(
              loadedWith(left, title),
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
      Option.flatMap(chaptersOf(model, slug), chapters =>
        Option.map(chapterOf(chapters, chapterNumber), chapter => ({
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
        return [withoutModal(next, isBesidePanel), commands]
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

/**
 * Asks for the moment a bookmark was wanted, so the word being spoken
 * then is the one marked: the player reports its place once a second,
 * and the word moves several times in that second.
 */
const askedForMoment = (
  model: Model,
  maybeNote: Option.Option<string>,
): UpdateReturn =>
  model.listening._tag === 'Loaded'
    ? [model, [ReadMoment({ maybeNote })]]
    : [model, []]

/**
 * Marks the word at a place in the loaded title, on the millisecond it
 * starts, with the words around it and a note, if there is one. A word
 * already marked is not marked again.
 */
const bookmarkedAt = (
  model: Model,
  loaded: Loaded,
  placeMs: Milliseconds,
  maybeNote: Option.Option<string>,
): UpdateReturn => {
  const passages = TranscriptPlayer.passagesOf(loaded.player)
  const atMs = bookmarkPlaceAt(passages, placeMs)
  const maybeExcerpt = excerptAround(passages, atMs)
  if (
    Option.isSome(
      bookmarkOnWord(bookmarksOf(model, loaded.slug), loaded.slug, atMs),
    )
  ) {
    return [
      {
        ...model,
        maybeNotice: Option.some(alreadyBookmarkedNotice),
      },
      [],
    ]
  } else {
    return [
      {
        ...model,
        maybeNotice: Option.some(
          Option.match(maybeExcerpt, {
            onNone: () => `Bookmark added at ${clockOf(atMs)}`,
            onSome: excerpt =>
              `Bookmarked “${excerpt.word}” at ${clockOf(atMs)}`,
          }),
        ),
      },
      [
        WriteLibrary({
          write: AddBookmarkAt({
            slug: loaded.slug,
            atMs,
            maybeNote,
            maybeExcerpt,
            maybeCreatedAtMs: Option.none(),
          }),
        }),
      ],
    ]
  }
}

const loadedOf = (model: Model): Option.Option<Loaded> =>
  model.listening._tag === 'Loaded'
    ? Option.some(model.listening)
    : Option.none()

const markedMoment = (
  model: Model,
  wallClockMs: number,
  maybeNote: Option.Option<string>,
): UpdateReturn =>
  Option.match(loadedOf(model), {
    onNone: () => [model, []],
    onSome: loaded =>
      bookmarkedAt(
        model,
        loaded,
        Milliseconds.make(
          Math.max(
            0,
            Math.round(
              transcriptPlaceAt(
                TranscriptPlayer.playbackClockOf(loaded.player),
                wallClockMs,
              ),
            ),
          ),
        ),
        maybeNote,
      ),
  })

const bookmarkedWord = (
  model: Model,
  wordId: TranscriptPlayer.WordId,
): UpdateReturn =>
  Option.match(
    Option.flatMap(loadedOf(model), loaded =>
      Option.map(TranscriptPlayer.wordOf(loaded.player, wordId), word => ({
        loaded,
        word,
      })),
    ),
    {
      onNone: () => [model, []],
      onSome: ({ loaded, word }) =>
        bookmarkedAt(model, loaded, word.startMs, Option.none()),
    },
  )

const openedBookmark = (model: Model, bookmarkId: BookmarkId): Model =>
  Option.isSome(bookmarkOf(model, bookmarkId))
    ? presentedBeside(model, BookmarkDrawer({ bookmarkId }))
    : model

const notedBookmark = (
  model: Model,
  maybeNote: Option.Option<string>,
): UpdateReturn =>
  Option.match(
    Option.flatMap(openBookmarkOf(model), bookmarkId =>
      bookmarkOf(model, bookmarkId),
    ),
    {
      onNone: () => [model, []],
      onSome: bookmark => [
        model,
        [
          WriteLibrary({
            write: NoteBookmark({
              bookmarkId: bookmark.bookmarkId,
              maybeNote,
            }),
          }),
        ],
      ],
    },
  )

const removedBookmark = (
  model: Model,
  bookmarkId: BookmarkId,
): UpdateReturn => {
  const maybeBookmark = bookmarkOf(model, bookmarkId)
  return [
    {
      ...withoutModal(model, isDeleteBookmarkQuestion),
      maybeRemovedBookmark: maybeBookmark,
      maybeNotice: Option.map(
        maybeBookmark,
        () => 'Bookmark removed. Press z to put it back.',
      ),
    },
    [WriteLibrary({ write: RemoveBookmark({ bookmarkId }) })],
  ]
}

const restoredBookmark = (model: Model): UpdateReturn =>
  Option.match(model.maybeRemovedBookmark, {
    onNone: () => [model, []],
    onSome: bookmark => [
      {
        ...model,
        maybeRemovedBookmark: Option.none(),
        maybeNotice: Option.some('Bookmark put back'),
      },
      [
        WriteLibrary({
          write: AddBookmarkAt({
            slug: bookmark.slug,
            atMs: bookmark.atMs,
            maybeNote: bookmark.maybeNote,
            maybeExcerpt: bookmark.maybeExcerpt,
            maybeCreatedAtMs: Option.some(bookmark.createdAtMs),
          }),
        }),
      ],
    ],
  })

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

const copiedWordLink = (
  model: Model,
  wordId: TranscriptPlayer.WordId,
): UpdateReturn =>
  Option.match(
    Option.flatMap(loadedTitleOf(model), ({ title, loaded }) =>
      Option.map(TranscriptPlayer.wordOf(loaded.player, wordId), word => ({
        title,
        word,
      })),
    ),
    {
      onNone: () => [model, []],
      onSome: ({ title, word }) => {
        const [closed, commands] = playerUpdated(
          { ...model, maybeNotice: Option.none() },
          TranscriptPlayer.CloseWordMenu(),
        )
        return [
          closed,
          [
            ...commands,
            CopyLink({
              path: wordPathOf(title.slug, word.startMs),
              title: `${title.name}, at ${clockOf(word.startMs)}`,
            }),
          ],
        ]
      },
    },
  )

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

/**
 * Plays at `speed` from now on. A stretch playing at another speed ends,
 * and the next second opens one at the new speed.
 */
const spedTo = (model: Model, speed: Speed): UpdateReturn => {
  const [next, commands] = playerUpdated(
    { ...model, speed },
    TranscriptPlayer.SetSpeed({ speed }),
  )
  const [ended, reports] =
    next.listening._tag === 'Loaded' &&
    isAtOtherSpeed(next.listening.stretch, speed)
      ? stretchEndedAs(next, 'SpeedChanged')
      : [next, []]
  return [withoutModal(ended, isSpeedSheet), [...commands, ...reports]]
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
      PreviousParagraph: message => playerUpdated(model, message),
      NextParagraph: message => playerUpdated(model, message),
      ShowSearch: message => playerUpdated(model, message),
      CloseSearch: message => playerUpdated(model, message),
      SearchFor: message => playerUpdated(model, message),
      ClearSearch: message => playerUpdated(model, message),
      NextMatch: message => playerUpdated(model, message),
      PreviousMatch: message => playerUpdated(model, message),
      ShowMatch: message => playerUpdated(model, message),
      PlayFrom: message => playerUpdated(model, message),
      LeavePlayhead: message => playerUpdated(model, message),
      BackToPlayhead: message => playerUpdated(model, message),
      ShowWordMenu: message => playerUpdated(model, message),
      CloseWordMenu: message => playerUpdated(model, message),
      CopyWordLink: ({ wordId }) => copiedWordLink(model, wordId),
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
      SetAppearance: ({ appearance }) => [
        { ...model, appearance: { ...model.appearance, appearance } },
        [],
      ],
      ObservedSystemMode: ({ mode }) => [
        { ...model, appearance: { ...model.appearance, systemMode: mode } },
        [],
      ],
      OpenPlayer: () => [
        model.listening._tag === 'Loaded'
          ? openedPlayer(model, model.listening.slug)
          : model,
        [],
      ],
      ShowContents: () => [
        toggledBeside(model, isShowingContents(model), ContentsSheet()),
        [],
      ],
      ShowBookmarks: () => [
        toggledBeside(model, isShowingBookmarks(model), BookmarksDrawer()),
        [],
      ],
      OpenBookmark: ({ bookmarkId }) => [openedBookmark(model, bookmarkId), []],
      SetBookmarkNote: ({ note }) => notedBookmark(model, Option.some(note)),
      ClearBookmarkNote: () => notedBookmark(model, Option.none()),
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
      AddBookmark: () => askedForMoment(model, Option.none()),
      AddNotedBookmark: ({ note }) => askedForMoment(model, Option.some(note)),
      BookmarkWord: ({ wordId }) => bookmarkedWord(model, wordId),
      MarkedMoment: ({ wallClockMs, maybeNote }) =>
        markedMoment(model, wallClockMs, maybeNote),
      UndoRemoveBookmark: () => restoredBookmark(model),
      PlayBookmark: ({ bookmarkId }) => playedBookmark(model, bookmarkId),
      DeleteBookmark: ({ bookmarkId }) => [
        askedToDelete(model, bookmarkId),
        [],
      ],
      ConfirmDeleteBookmark: ({ bookmarkId }) =>
        removedBookmark(model, bookmarkId),
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
      ReceivedChapters: ({ slug, chapters }) => [
        withPlayerSections(
          withChapters(model, slug, ChaptersReady({ chapters })),
          slug,
          chapters,
        ),
        [],
      ],
      FailedReadChapters: ({ slug, reason }) => [
        withChapters(model, slug, ChaptersUnavailable({ reason })),
        [],
      ],
      ReachedPlace: message => playerUpdated(model, message),
      ReachedEnd: message => playerUpdated(model, message),
      FailedPlayAudio: message => playerUpdated(model, message),
      ReceivedPassages: message => playerUpdated(model, message),
      FailedLoadTranscript: message => playerUpdated(model, message),
      ReceivedMatches: message => playerUpdated(model, message),
      FailedSearch: message => playerUpdated(model, message),
      CompletedWriteLibrary: () => [
        { ...model, maybeProblem: Option.none() },
        [],
      ],
      FailedWriteLibrary: ({ reason }) => [
        { ...model, maybeProblem: Option.some(reason) },
        [],
      ],
      CompletedReportStretch: () =>
        sentReports(
          { ...model, maybeTimelineProblem: Option.none() },
          model.unsentReports,
        ),
      ReceivedUnendedPlays: ({ plays, checkedAtMs }) =>
        Array.match(closingsOf(model, plays, checkedAtMs), {
          onEmpty: (): UpdateReturn => [model, []],
          onNonEmpty: closings => [model, [CloseUnendedPlays({ closings })]],
        }),
      CompletedCloseUnendedPlays: () => [model, []],
      FailedCloseUnendedPlays: () => [model, []],
      FailedReportStretch: ({ report, reason }) => [
        {
          ...model,
          maybeTimelineProblem: Option.some(reason),
          unsentReports: Array.takeRight(
            [...model.unsentReports, report],
            unsentReportsLimit,
          ),
        },
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
      GetAudiobookAudio: message => audibleUpdated(model, message),
      ReceivedAudiobookAudio: message => audibleUpdated(model, message),
      FailedReadAudiobookAudio: message => audibleUpdated(model, message),
      QueuedAudiobookAudio: message => audibleUpdated(model, message),
      FailedQueueAudiobookAudio: message => audibleUpdated(model, message),
      OpenedUri: fact => [Navigation.foldMessage(navigation, model, fact), []],
      NavigatedBack: fact => [
        Navigation.foldMessage(navigation, model, fact),
        [],
      ],
    }),
  )

/**
 * True for a fact that carries an address in: a link opened, or a step
 * back or forward. The address it brings names where the player should
 * go, so it is left as it is until the player has gone there.
 */
const isAddressFact = (message: Message): boolean =>
  message._tag === 'OpenedUri' || message._tag === 'NavigatedBack'

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
      const [left, switchSaves] = Option.contains(loadedSlugOf(model), slug)
        ? [model, []]
        : leftBeforeSwitch(model)
      return [movedQuietly(loadedWith(left, title), atMs), switchSaves]
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
  return [isAddressFact(message) ? next : withPlayerAddress(next), commands]
}
