import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import {
  Song,
  displayTitle,
  flattenSong,
  zipperAtMember,
  zipperItems,
} from './domain/index.js'

export { flattenSong, zipperItems }

// MODEL

/** Succeeded notice. */
export const Succeeded = ts('Succeeded')
/** Failed notice. */
export const Failed = ts('Failed')
/** Notice kind. */
export const NoticeKind = S.Union([Succeeded, Failed])
/** Notice kind. */
export type NoticeKind = typeof NoticeKind.Type

/** No extra notice detail. */
export const DetailNone = ts('None')
/** Extra notice detail. */
export const DetailSome = ts('Some', { text: NonEmptyString })
/** Notice detail. */
export const Detail = S.Union([DetailNone, DetailSome])
/** Notice detail. */
export type Detail = typeof Detail.Type

/** No notice. */
export const NoticeNone = ts('None')
/** A notice. */
export const NoticeSome = ts('Some', {
  kind: NoticeKind,
  title: NonEmptyString,
  detail: Detail,
})
/** Transient notice. */
export const Notice = S.Union([NoticeNone, NoticeSome])
/** Transient notice. */
export type Notice = typeof Notice.Type

/** No search query. */
export const Idle = ts('Idle')
/** A search query. */
export const Searching = ts('Searching', { query: NonEmptyString })
/** Library looking. */
export const Looking = S.Union([Idle, Searching])
/** Library looking. */
export type Looking = typeof Looking.Type

/** No songs before the current chart song. */
export const BeforeNone = ts('None')
/** Songs before the current chart song. */
export const BeforeSome = ts('Some', { items: S.NonEmptyArray(Song) })
/** Songs before the current chart song. */
export const Before = S.Union([BeforeNone, BeforeSome])
/** Songs before the current chart song. */
export type Before = typeof Before.Type

/** No songs after the current chart song. */
export const AfterNone = ts('None')
/** Songs after the current chart song. */
export const AfterSome = ts('Some', { items: S.NonEmptyArray(Song) })
/** Songs after the current chart song. */
export const After = S.Union([AfterNone, AfterSome])
/** Songs after the current chart song. */
export type After = typeof After.Type

/** Shelf idle. The songs bag lives here so Confirming is the zipper. */
export const DeletingIdle = ts('Idle', {
  songs: S.NonEmptyArray(Song),
})
/** Confirming delete of the zipper current. Current is a member. */
export const Confirming = ts('Confirming', {
  before: Before,
  current: Song,
  after: After,
})
/** Shelf delete. */
export const Deleting = S.Union([DeletingIdle, Confirming])
/** Shelf delete. */
export type Deleting = typeof Deleting.Type

/** Editing a chart. Section zippers live on the current song. */
export const Editing = ts('Editing')
/** Playing a chart. */
export const Playing = ts('Playing')
/** Chart working. */
export const Working = S.Union([Editing, Playing])
/** Chart working. */
export type Working = typeof Working.Type

/** Empty library on the shelf. */
export const EmptyShelf = ts('Shelf', { looking: Looking })
/** Empty library on an unknown path. */
export const EmptyUnknown = ts('Unknown', { path: NonEmptyString })
/** Empty library place. */
export const Place = S.Union([EmptyShelf, EmptyUnknown])
/** Empty library place. */
export type Place = typeof Place.Type

/** Populated library on the shelf. */
export const PopulatedShelf = ts('Shelf', {
  looking: Looking,
  deleting: Deleting,
})
/** Populated library on a chart. */
export const PopulatedChart = ts('Chart', {
  before: Before,
  current: Song,
  after: After,
  working: Working,
})
/** Populated library on an unknown path. */
export const PopulatedUnknown = ts('Unknown', {
  songs: S.NonEmptyArray(Song),
  path: NonEmptyString,
})
/** Populated library place. */
export const PopulatedPlace = S.Union([
  PopulatedShelf,
  PopulatedChart,
  PopulatedUnknown,
])
/** Populated library place. */
export type PopulatedPlace = typeof PopulatedPlace.Type

/** A library with no songs. */
export const LibraryEmpty = ts('Empty', { place: Place })
/** A library with songs. */
export const LibraryPopulated = ts('Populated', { place: PopulatedPlace })
/** Song library. */
export const Library = S.Union([LibraryEmpty, LibraryPopulated])
/** Song library. */
export type Library = typeof Library.Type

/** The Songbook Model. */
export const Model = S.Struct({
  notice: Notice,
  library: Library,
})
/** The Songbook Model. */
export type Model = typeof Model.Type

/** Product identity title printed by hosts that need a document title. */
export const title = 'Songbook'

/** Empty library on the shelf. */
export const emptyModel = (): Model =>
  Model.make({
    notice: NoticeNone(),
    library: LibraryEmpty.make({
      place: EmptyShelf.make({ looking: Idle() }),
    }),
  })

const flattenSongs = (
  songs: Array.NonEmptyReadonlyArray<Song>,
): Array.NonEmptyReadonlyArray<Song> => Array.map(songs, flattenSong)

/** Songs of a chart zipper. Current is always a member. Zippers flatten. */
export const songsOfChart = (
  chart: typeof PopulatedChart.Type,
): Array.NonEmptyReadonlyArray<Song> =>
  flattenSongs(zipperItems(chart.before, chart.current, chart.after))

/** Songs of a shelf delete zipper or idle bag. */
export const songsOfDeleting = (
  deleting: Deleting,
): Array.NonEmptyReadonlyArray<Song> => {
  if (deleting._tag === 'Idle') {
    return flattenSongs(deleting.songs)
  }
  return flattenSongs(
    zipperItems(deleting.before, deleting.current, deleting.after),
  )
}

/** Songs of a populated library. */
export const songsOfPopulated = (
  place: PopulatedPlace,
): Array.NonEmptyReadonlyArray<Song> => {
  if (place._tag === 'Chart') {
    return songsOfChart(place)
  }
  if (place._tag === 'Unknown') {
    return flattenSongs(place.songs)
  }
  return songsOfDeleting(place.deleting)
}

/** Splits a populated list at a member. */
export const zipperAt = (
  songs: Array.NonEmptyReadonlyArray<Song>,
  member: Song,
): Option.Option<typeof PopulatedChart.Type> =>
  Option.map(
    zipperAtMember(songs, member, BeforeSome, BeforeNone, AfterSome, AfterNone),
    zip =>
      PopulatedChart.make({
        ...zip,
        current: flattenSong(zip.current),
        working: Editing(),
      }),
  )

/** Replaces the current chart song and keeps zipper membership. */
export const replaceCurrent = (
  chart: typeof PopulatedChart.Type,
  current: Song,
): typeof PopulatedChart.Type =>
  PopulatedChart.make({
    ...chart,
    current,
  })

/** Shown shelf rows. Derived from songs and looking. */
export const shownSongs = (
  songs: Array.NonEmptyReadonlyArray<Song>,
  looking: Looking,
): ReadonlyArray<Song> => {
  if (looking._tag === 'Idle') {
    return songs
  }
  const query = pipe(looking.query, Str.toLowerCase)
  return Array.filter(songs, song => {
    const titleText = pipe(displayTitle(song), Str.toLowerCase)
    if (pipe(titleText, Str.includes(query))) {
      return true
    }
    if (song.artist._tag === 'None') {
      return false
    }
    return pipe(song.artist.name, Str.toLowerCase, Str.includes(query))
  })
}

/** Clears a notice. */
export const withoutNotice = (model: Model): Model =>
  Model.make({
    ...model,
    notice: NoticeNone(),
  })

/** Sets a succeeded notice. */
export const succeededNotice = (
  model: Model,
  heading: string,
  detail?: string,
): Model =>
  Model.make({
    ...model,
    notice: NoticeSome.make({
      kind: Succeeded(),
      title: NonEmptyString.make(heading),
      detail:
        detail === undefined || Str.isEmpty(detail)
          ? DetailNone()
          : DetailSome.make({ text: NonEmptyString.make(detail) }),
    }),
  })

/** Finds a library member by id. */
export const findSong = (
  songs: Array.NonEmptyReadonlyArray<Song>,
  songId: Song['id'],
): Option.Option<Song> => Array.findFirst(songs, song => song.id === songId)

/** Replaces a populated library place. */
export const withPlace = (model: Model, place: PopulatedPlace): Model =>
  Model.make({
    ...model,
    library: LibraryPopulated.make({ place }),
  })

/** Replaces the whole library. */
export const withLibrary = (model: Model, library: Library): Model =>
  Model.make({
    ...model,
    library,
  })

/** Sets a failed notice. */
export const failedNotice = (
  model: Model,
  heading: string,
  detail?: string,
): Model =>
  Model.make({
    ...model,
    notice: NoticeSome.make({
      kind: Failed(),
      title: NonEmptyString.make(heading),
      detail:
        detail === undefined || Str.isEmpty(detail)
          ? DetailNone()
          : DetailSome.make({ text: NonEmptyString.make(detail) }),
    }),
  })

export {
  DraftNone,
  DraftSome,
  Lyrics,
  Removing,
  WordFocus,
  draftFromText,
  draftText,
  lyricsAt,
  removingAt,
  wordFocusAt,
} from './domain/index.js'
