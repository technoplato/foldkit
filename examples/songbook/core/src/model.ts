import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Section, Song, Word, displayTitle } from './domain/index.js'

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

/** No delete confirmation. */
export const DeletingIdle = ts('Idle')
/** Confirming delete of a library member. */
export const Confirming = ts('Confirming', { song: Song })
/** Shelf delete. */
export const Deleting = S.Union([DeletingIdle, Confirming])
/** Shelf delete. */
export type Deleting = typeof Deleting.Type

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

/** Viewing the chart. */
export const Viewing = ts('Viewing')
/** Editing lyrics of a section member. */
export const Lyrics = ts('Lyrics', {
  section: Section,
  draft: S.String,
})
/** No typed chord draft. */
export const DraftNone = ts('None')
/** A typed chord draft. */
export const DraftSome = ts('Some', { text: NonEmptyString })
/** Chord draft while a word is focused. */
export const ChordDraft = S.Union([DraftNone, DraftSome])
/** Chord draft while a word is focused. */
export type ChordDraft = typeof ChordDraft.Type

/** Placing a chord on a word member. */
export const WordFocus = ts('Word', {
  word: Word,
  draft: ChordDraft,
})
/** Removing a section member. */
export const Removing = ts('Removing', { section: Section })
/** Editing focus. */
export const Focus = S.Union([Viewing, Lyrics, WordFocus, Removing])
/** Editing focus. */
export type Focus = typeof Focus.Type

/** Editing a chart. */
export const Editing = ts('Editing', { focus: Focus })
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
export const EmptyPlace = S.Union([EmptyShelf, EmptyUnknown])
/** Empty library place. */
export type EmptyPlace = typeof EmptyPlace.Type

/** Populated library on the shelf. */
export const PopulatedShelf = ts('Shelf', {
  songs: S.NonEmptyArray(Song),
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
export const LibraryEmpty = ts('Empty', { place: EmptyPlace })
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

const itemsOf = (side: Before | After): ReadonlyArray<Song> =>
  side._tag === 'None' ? [] : side.items

const sideOf = (
  items: ReadonlyArray<Song>,
  some: typeof BeforeSome | typeof AfterSome,
  none: typeof BeforeNone | typeof AfterNone,
): Before | After =>
  Array.match(items, {
    onEmpty: () => none(),
    onNonEmpty: populated => some.make({ items: populated }),
  })

/** Songs of a chart zipper. Current is always a member. */
export const songsOfChart = (
  chart: typeof PopulatedChart.Type,
): S.NonEmptyArray<Song>['Type'] => {
  const items = [
    ...itemsOf(chart.before),
    chart.current,
    ...itemsOf(chart.after),
  ]
  return Array.match(items, {
    onEmpty: () => [chart.current],
    onNonEmpty: songs => songs,
  })
}

/** Songs of a populated library. */
export const songsOfPopulated = (
  place: PopulatedPlace,
): S.NonEmptyArray<Song>['Type'] => {
  if (place._tag === 'Chart') {
    return songsOfChart(place)
  }
  return place.songs
}

/** Splits a populated list at a member. */
export const zipperAt = (
  songs: S.NonEmptyArray<Song>['Type'],
  member: Song,
): Option.Option<typeof PopulatedChart.Type> => {
  const maybeIndex = Array.findFirstIndex(songs, song => song.id === member.id)
  if (Option.isNone(maybeIndex)) {
    return Option.none()
  }
  const beforeItems = pipe(songs, Array.take(maybeIndex.value))
  const afterItems = pipe(songs, Array.drop(maybeIndex.value + 1))
  return Option.some(
    PopulatedChart.make({
      before: sideOf(beforeItems, BeforeSome, BeforeNone),
      current: member,
      after: sideOf(afterItems, AfterSome, AfterNone),
      working: Editing.make({ focus: Viewing() }),
    }),
  )
}

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
  songs: S.NonEmptyArray<Song>['Type'],
  looking: Looking,
): ReadonlyArray<Song> => {
  if (looking._tag === 'Idle') {
    return songs
  }
  const query = pipe(looking.query, Str.toLowerCase)
  return Array.filter(songs, song => {
    const titleText = pipe(displayTitle(song), Str.toLowerCase)
    if (Str.includes(titleText, query)) {
      return true
    }
    if (song.artist._tag === 'None') {
      return false
    }
    return Str.includes(pipe(song.artist.name, Str.toLowerCase), query)
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
  songs: S.NonEmptyArray<Song>['Type'],
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
