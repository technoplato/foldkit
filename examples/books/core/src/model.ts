import {
  Array,
  Match as M,
  Option,
  Order,
  Record as Record_,
  Schema as S,
  pipe,
} from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'
import * as ReadAloud from 'read-aloud-core-example'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { AudibleModel } from './audible/model.js'
import { Destination } from './destination.js'
import {
  BookmarkId,
  ChapterNumber,
  MediaId,
  Milliseconds,
  Speed,
  TitleSlug,
} from './ids.js'
import { StretchEvent, StretchState } from './stretch.js'

// MODEL

/** One chapter: its number, its name, and where it starts and ends. */
export const Chapter = S.Struct({
  chapterNumber: ChapterNumber,
  name: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
})
/** One chapter. */
export type Chapter = typeof Chapter.Type

/**
 * One audiobook in the library: who wrote and reads it, how long it runs,
 * and where its cover and audio are, when they are stored. `mediaId` names
 * its audio for the transcript, the rendition id. Its chapters are not
 * here: the library store sends them for one title at a time, when Books
 * asks ({@link TitleChapters}).
 */
export const Title = S.Struct({
  slug: TitleSlug,
  mediaId: MediaId,
  name: S.String,
  authors: S.Array(S.String),
  narrators: S.Array(S.String),
  durationMs: Milliseconds,
  maybeCoverUrl: S.Option(S.String),
  maybeAudioUrl: S.Option(S.String),
})
/** One audiobook in the library. */
export type Title = typeof Title.Type

/** The chapters of one title, in order, as the library store sent them. */
export const ChaptersReady = ts('ChaptersReady', {
  chapters: S.NonEmptyArray(Chapter),
})
/** One title's chapters could not be read, and why, safe to show. */
export const ChaptersUnavailable = ts('ChaptersUnavailable', {
  reason: S.String,
})
/**
 * How one title's chapters stand once the store has answered. A title
 * with no entry has not been asked for, or its chapters are on their way.
 */
export const TitleChapters = S.Union([ChaptersReady, ChaptersUnavailable])
/** How one title's chapters stand. */
export type TitleChapters = typeof TitleChapters.Type

/** Each title's chapters, by its slug, for the titles Books asked about. */
export const ChaptersByTitle = S.Record(TitleSlug, TitleChapters)
/** Each title's chapters, by its slug. */
export type ChaptersByTitle = typeof ChaptersByTitle.Type

/** A title someone has started and not finished, and where they were. */
export const InProgress = ts('InProgress', {
  slug: TitleSlug,
  placeMs: Milliseconds,
  savedAtMs: S.Number,
})
/** A title someone has started and not finished. */
export type InProgress = typeof InProgress.Type
/** A title someone has listened to the end of. */
export const Finished = ts('Finished', {
  slug: TitleSlug,
  savedAtMs: S.Number,
})
/** How far someone is in one title. No row means not started. */
export const Progress = S.Union([InProgress, Finished])
/** How far someone is in one title. */
export type Progress = typeof Progress.Type

/** A place someone marked in a title. */
export const Bookmark = S.Struct({
  bookmarkId: BookmarkId,
  slug: TitleSlug,
  atMs: Milliseconds,
  createdAtMs: S.Number,
})
/** A place someone marked in a title. */
export type Bookmark = typeof Bookmark.Type

/**
 * Everything the library store holds for the person listening: the
 * titles, how far they are in each, and their bookmarks. Every device
 * reads the same shelf.
 */
export const Shelf = S.Struct({
  titles: S.Array(Title),
  progress: S.Array(Progress),
  bookmarks: S.Array(Bookmark),
})
/** Everything the library store holds for the person listening. */
export type Shelf = typeof Shelf.Type

/** The shelf has not arrived yet. */
export const ShelfLoading = ts('ShelfLoading')
/** The shelf as the library store last sent it. */
export const ShelfReady = ts('ShelfReady', { shelf: Shelf })
/** The library store could not be read, and why, safe to show. */
export const ShelfUnavailable = ts('ShelfUnavailable', { reason: S.String })
/** Where the shelf stands. */
export const Library = S.Union([ShelfLoading, ShelfReady, ShelfUnavailable])
/** Where the shelf stands. */
export type Library = typeof Library.Type

/** Nothing is loaded in this device's player. */
export const Idle = ts('Idle')
/**
 * One title in this device's player: the Transcript Player holding its
 * audio and words, the last place saved, so it saves again every 10
 * seconds of listening, and the stretch it is playing, which Scribe's
 * timeline shows.
 */
export const Loaded = ts('Loaded', {
  slug: TitleSlug,
  savedPlaceMs: Milliseconds,
  player: TranscriptPlayer.Model,
  stretch: StretchState,
})
/** One title in this device's player. */
export type Loaded = typeof Loaded.Type

/**
 * What Books tells Scribe's timeline about one stretch: the title, and
 * that its stretch began or ended.
 */
export const StretchReport = S.Struct({ title: Title, event: StretchEvent })
/** What Books tells Scribe's timeline about one stretch. */
export type StretchReport = typeof StretchReport.Type
/** This device's player. */
export const Listening = S.Union([Idle, Loaded])
/** This device's player. */
export type Listening = typeof Listening.Type

/**
 * How much of the player's controls show: the compact bar under the
 * words, or every control.
 */
export const PlayerControls = S.Literals(['Collapsed', 'Expanded'])
/** How much of the player's controls show. */
export type PlayerControls = typeof PlayerControls.Type

/**
 * The Books Model: the shared shelf, the chapters of the titles on screen,
 * in the player, or in progress, this device's player and speed, the last
 * write the library store refused, why Scribe's timeline last refused a
 * stretch and the reports it refused, to send again, the picture books read
 * aloud and the previews checked for them,
 * this device's Audible import, and the navigation stack. The shelf and the
 * chapters come from the library store, the readings from the reading
 * source, the player counts on this device, and the Audible import happens
 * on the device where it was started, so none of them is folded from the
 * log.
 */
export const Model = S.Struct({
  library: Library,
  chapters: ChaptersByTitle,
  listening: Listening,
  speed: Speed,
  maybeProblem: S.Option(S.String),
  maybeTimelineProblem: S.Option(S.String),
  unsentReports: S.Array(StretchReport),
  maybeNotice: S.Option(S.String),
  controls: PlayerControls,
  maybeMember: S.Option(S.String),
  readings: ReadAloud.ReadingsState,
  previewChecks: S.Array(ReadAloud.PreviewCheck),
  audible: AudibleModel,
  navigation: Navigation.NavigationStack(Destination),
})
/**
 * A Books Model value. An interface rather than an alias, so every type
 * that names it, such as each Action's, prints `Model` in Books' typings
 * instead of the whole Model again.
 */
export interface Model extends S.Schema.Type<typeof Model> {}

// READ

type HasLibrary = Readonly<{ library: Library }>

/** The shelf, once the library store has sent it. */
export const shelfOf = (model: HasLibrary): Option.Option<Shelf> =>
  model.library._tag === 'ShelfReady'
    ? Option.some(model.library.shelf)
    : Option.none()

/** Every title on the shelf, in the order the store lists them. */
export const titlesOf = (model: HasLibrary): ReadonlyArray<Title> =>
  Option.match(shelfOf(model), {
    onNone: () => [],
    onSome: shelf => shelf.titles,
  })

/** The title `slug` names, while it is on the shelf. */
export const titleOf = (
  model: HasLibrary,
  slug: TitleSlug,
): Option.Option<Title> =>
  Array.findFirst(titlesOf(model), title => title.slug === slug)

const bySavedAtDescending = Order.mapInput(
  Order.flip(Order.Number),
  (progress: Progress) => progress.savedAtMs,
)

/** How far the listener is in `slug`, the newest save first. */
export const progressOf = (
  model: HasLibrary,
  slug: TitleSlug,
): Option.Option<Progress> =>
  Option.flatMap(shelfOf(model), shelf =>
    pipe(
      shelf.progress,
      Array.filter(progress => progress.slug === slug),
      Array.sort(bySavedAtDescending),
      Array.head,
    ),
  )

/**
 * Where a title resumes: the saved place while in progress, else its start.
 *
 * @example
 * ```typescript
 * resumePlaceOf(model, slug) // 723000 when the listener stopped at 12:03
 * ```
 */
export const resumePlaceOf = (
  model: HasLibrary,
  slug: TitleSlug,
): Milliseconds =>
  Option.match(progressOf(model, slug), {
    onNone: () => Milliseconds.make(0),
    onSome: progress =>
      progress._tag === 'InProgress' ? progress.placeMs : Milliseconds.make(0),
  })

/**
 * The title to continue: the one saved most recently and not finished.
 * None before the listener starts anything.
 */
export const continueOf = (model: HasLibrary): Option.Option<InProgress> =>
  Option.flatMap(shelfOf(model), shelf =>
    pipe(
      shelf.progress,
      Array.sort(bySavedAtDescending),
      Array.dedupeWith((self, that) => self.slug === that.slug),
      Array.findFirst(
        (progress): progress is InProgress => progress._tag === 'InProgress',
      ),
      Option.filter(progress => Option.isSome(titleOf(model, progress.slug))),
    ),
  )

/** The bookmarks in `slug`, earliest place first. */
export const bookmarksOf = (
  model: HasLibrary,
  slug: TitleSlug,
): ReadonlyArray<Bookmark> =>
  Option.match(shelfOf(model), {
    onNone: () => [],
    onSome: shelf =>
      pipe(
        shelf.bookmarks,
        Array.filter(bookmark => bookmark.slug === slug),
        Array.sort(
          Order.mapInput(Order.Number, (bookmark: Bookmark) => bookmark.atMs),
        ),
      ),
  })

/** The bookmark `bookmarkId` names, while it is on the shelf. */
export const bookmarkOf = (
  model: HasLibrary,
  bookmarkId: BookmarkId,
): Option.Option<Bookmark> =>
  Option.flatMap(shelfOf(model), shelf =>
    Array.findFirst(
      shelf.bookmarks,
      bookmark => bookmark.bookmarkId === bookmarkId,
    ),
  )

type HasChapters = Readonly<{ chapters: ChaptersByTitle }>

/** The chapters of `slug`, once the library store has sent them. */
export const chaptersOf = (
  model: HasChapters,
  slug: TitleSlug,
): Option.Option<Array.NonEmptyReadonlyArray<Chapter>> =>
  Option.flatMap(Record_.get(model.chapters, slug), state =>
    state._tag === 'ChaptersReady'
      ? Option.some(state.chapters)
      : Option.none(),
  )

/**
 * The one section a title with no chapters reads as: the whole book, under
 * its own name, so a title Audible gives no chapters still has a place on
 * the shelf.
 */
export const wholeBookChapters = (
  name: string,
  durationMs: Milliseconds,
): Array.NonEmptyReadonlyArray<Chapter> => [
  {
    chapterNumber: ChapterNumber.make(1),
    name,
    startMs: Milliseconds.make(0),
    endMs: durationMs,
  },
]

/** The chapter `chapterNumber` names among `chapters`. */
export const chapterOf = (
  chapters: Array.NonEmptyReadonlyArray<Chapter>,
  chapterNumber: ChapterNumber,
): Option.Option<Chapter> =>
  Array.findFirst(chapters, chapter => chapter.chapterNumber === chapterNumber)

/**
 * The chapter a place falls in: the last one starting at or before it.
 *
 * @example
 * ```typescript
 * chapterAt(chapters, Milliseconds.make(0)) // Chapter 1
 * ```
 */
export const chapterAt = (
  chapters: Array.NonEmptyReadonlyArray<Chapter>,
  place: Milliseconds,
): Chapter =>
  Option.getOrElse(
    Array.findLast(chapters, chapter => chapter.startMs <= place),
    () => Array.headNonEmpty(chapters),
  )

/**
 * The name of the chapter a place in `slug` falls in, once its chapters
 * are here.
 *
 * @example
 * ```typescript
 * chapterNameAt(model, slug, Milliseconds.make(723_000)) // Some('The Light')
 * ```
 */
export const chapterNameAt = (
  model: HasChapters,
  slug: TitleSlug,
  place: Milliseconds,
): Option.Option<string> =>
  Option.map(
    chaptersOf(model, slug),
    chapters => chapterAt(chapters, place).name,
  )

/** The number of the chapter a place in `slug` falls in, once its chapters are here. */
export const chapterNumberAt = (
  model: HasChapters,
  slug: TitleSlug,
  place: Milliseconds,
): Option.Option<ChapterNumber> =>
  Option.map(
    chaptersOf(model, slug),
    chapters => chapterAt(chapters, place).chapterNumber,
  )

/** The title loaded in this device's player, while it is on the shelf. */
export const loadedTitleOf = (
  model: HasLibrary & Readonly<{ listening: Listening }>,
): Option.Option<Readonly<{ title: Title; loaded: Loaded }>> =>
  M.value(model.listening).pipe(
    M.withReturnType<
      Option.Option<Readonly<{ title: Title; loaded: Loaded }>>
    >(),
    M.tagsExhaustive({
      Idle: () => Option.none(),
      Loaded: loaded =>
        Option.map(titleOf(model, loaded.slug), title => ({ title, loaded })),
    }),
  )

/** True while this device's player is sounding `slug`. */
export const isPlaying = (
  model: Readonly<{ listening: Listening }>,
  slug: TitleSlug,
): boolean =>
  model.listening._tag === 'Loaded' &&
  model.listening.slug === slug &&
  TranscriptPlayer.isSounding(model.listening.player)

/** The player loaded on this device, while one is. */
export const loadedPlayerOf = (
  model: Readonly<{ listening: Listening }>,
): Option.Option<TranscriptPlayer.Model> =>
  model.listening._tag === 'Loaded'
    ? Option.some(model.listening.player)
    : Option.none()

/** Where the loaded title is now. */
export const placeOf = (loaded: Loaded): Milliseconds => loaded.player.placeMs

/** Chapters as the Transcript Player's sections. */
export const sectionsOf = (
  chapters: ReadonlyArray<Chapter>,
): ReadonlyArray<TranscriptPlayer.Section> =>
  Array.map(chapters, chapter => ({
    title: chapter.name,
    startMs: chapter.startMs,
    endMs: chapter.endMs,
  }))

/**
 * A title as the Transcript Player holds it: its audio's id, length, and
 * file, with its chapters as the player's sections. None yet, when the
 * chapters have not arrived: they are set on the player when they do.
 */
export const mediaOf = (
  title: Title,
  chapters: ReadonlyArray<Chapter>,
): TranscriptPlayer.Media => ({
  mediaId: title.mediaId,
  durationMs: title.durationMs,
  maybeAudioUrl: title.maybeAudioUrl,
  sections: sectionsOf(chapters),
})
