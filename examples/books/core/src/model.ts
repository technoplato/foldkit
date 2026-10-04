import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'
import { Navigation } from 'foldkit'
import { ts } from 'foldkit/schema'
import * as TranscriptPlayer from 'transcript-player-core-example'

import { Destination } from './destination.js'
import {
  BookmarkId,
  ChapterNumber,
  MediaId,
  Milliseconds,
  Speed,
  TitleSlug,
} from './ids.js'

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
 * its chapters in order, and where its cover and audio are, when they are
 * stored. `mediaId` names its audio for the transcript, the rendition id.
 */
export const Title = S.Struct({
  slug: TitleSlug,
  mediaId: MediaId,
  name: S.String,
  authors: S.Array(S.String),
  narrators: S.Array(S.String),
  durationMs: Milliseconds,
  chapters: S.NonEmptyArray(Chapter),
  maybeCoverUrl: S.Option(S.String),
  maybeAudioUrl: S.Option(S.String),
})
/** One audiobook in the library. */
export type Title = typeof Title.Type

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
 * audio and words, and the last place saved, so it saves again every 30
 * seconds of listening.
 */
export const Loaded = ts('Loaded', {
  slug: TitleSlug,
  savedPlaceMs: Milliseconds,
  player: TranscriptPlayer.Model,
})
/** One title in this device's player. */
export type Loaded = typeof Loaded.Type
/** This device's player. */
export const Listening = S.Union([Idle, Loaded])
/** This device's player. */
export type Listening = typeof Listening.Type

/**
 * The Books Model: the shared shelf, this device's player and speed, the
 * last write the library store refused, and the navigation stack. The
 * shelf comes from the library store and the player counts on this
 * device, so neither is folded from the log.
 */
export const Model = S.Struct({
  library: Library,
  listening: Listening,
  speed: Speed,
  maybeProblem: S.Option(S.String),
  navigation: Navigation.NavigationStack(Destination),
})
/** A Books Model value. */
export type Model = typeof Model.Type

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

/** The chapter `chapterNumber` names in `title`. */
export const chapterOf = (
  title: Title,
  chapterNumber: ChapterNumber,
): Option.Option<Chapter> =>
  Array.findFirst(
    title.chapters,
    chapter => chapter.chapterNumber === chapterNumber,
  )

/**
 * The chapter a place falls in: the last one starting at or before it.
 *
 * @example
 * ```typescript
 * chapterAt(title, Milliseconds.make(0)) // Chapter 1
 * ```
 */
export const chapterAt = (title: Title, place: Milliseconds): Chapter =>
  Option.getOrElse(
    Array.findLast(title.chapters, chapter => chapter.startMs <= place),
    () => Array.headNonEmpty(title.chapters),
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

/**
 * A title as the Transcript Player holds it: its audio's id, length, and
 * file.
 */
export const mediaOf = (title: Title): TranscriptPlayer.Media => ({
  mediaId: title.mediaId,
  durationMs: title.durationMs,
  maybeAudioUrl: title.maybeAudioUrl,
})
