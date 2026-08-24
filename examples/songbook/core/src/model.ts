import { Array, Option, Schema as S, String as Str, pipe } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import {
  Song,
  asSong,
  displayTitle,
  flattenSong,
  zipperAtMember,
  zipperItems,
} from './domain/index.js'

export { asSong, flattenSong, zipperItems }

// MODEL

/** Succeeded notice. */
export const Succeeded = ts('Succeeded')
/** Failed notice. */
export const Failed = ts('Failed')
/** Notice kind. */
export const NoticeKind = S.Union([Succeeded, Failed])
/** Notice kind. */
export type NoticeKind = typeof NoticeKind.Type

const withMembers = <Schema extends object, Members extends object>(
  schema: Schema,
  members: Members,
): Schema & Members => {
  const handler: ProxyHandler<Schema> = {
    get(target, property, receiver) {
      if (Object.hasOwn(members, property)) {
        return Reflect.get(members, property)
      }
      return Reflect.get(target, property, receiver)
    },
    has(target, property) {
      return Object.hasOwn(members, property) || Reflect.has(target, property)
    },
  }
  if (typeof schema === 'function') {
    handler.apply = (target, thisArg, argumentsList) =>
      Reflect.apply(
        target as unknown as (...args: Array<never>) => unknown,
        thisArg,
        argumentsList,
      )
  }
  return new Proxy(schema, handler) as Schema & Members
}

const detailNone = ts('None')
const detailSome = ts('Some', { text: NonEmptyString })
/** Notice detail. */
export const Detail = withMembers(S.Union([detailNone, detailSome]), {
  None: detailNone,
  Some: detailSome,
})
/** Notice detail. */
export type Detail = typeof Detail.Type

const noticeNone = ts('None')
const noticeSome = ts('Some', {
  kind: NoticeKind,
  title: NonEmptyString,
  detail: Detail,
})
/** Transient notice. */
export const Notice = withMembers(S.Union([noticeNone, noticeSome]), {
  None: noticeNone,
  Some: noticeSome,
})
/** Transient notice. */
export type Notice = typeof Notice.Type

/** No search query. */
export const Idle = ts('Idle')
/** A search query. */
export const Searching = ts('Searching', { query: NonEmptyString })
/** Library search. */
export const Search = S.Union([Idle, Searching])
/** Library search. */
export type Search = typeof Search.Type

const beforeNone = ts('None')
const beforeSome = ts('Some', { items: S.NonEmptyArray(Song.Saved) })
/** Songs before the current chart song. */
export const Before = withMembers(S.Union([beforeNone, beforeSome]), {
  None: beforeNone,
  Some: beforeSome,
})
/** Songs before the current chart song. */
export type Before = typeof Before.Type

const afterNone = ts('None')
const afterSome = ts('Some', { items: S.NonEmptyArray(Song.Saved) })
/** Songs after the current chart song. */
export const After = withMembers(S.Union([afterNone, afterSome]), {
  None: afterNone,
  Some: afterSome,
})
/** Songs after the current chart song. */
export type After = typeof After.Type

const deletingIdle = ts('Idle', {
  songs: S.NonEmptyArray(Song.Saved),
})
/** Confirming delete of the zipper current. Current is a member. */
export const Confirming = ts('Confirming', {
  before: Before,
  current: Song.Saved,
  after: After,
})
/** Shelf delete. Idle owns the bag so Confirming is the zipper. */
export const Deleting = withMembers(S.Union([deletingIdle, Confirming]), {
  Idle: deletingIdle,
  Confirming,
})
/** Shelf delete. */
export type Deleting = typeof Deleting.Type

/** Editing a chart. Current song may hold section zippers. */
export const Editing = ts('Editing', { current: Song })
/** Playing a chart. Current song is stored Empty or Idle only. */
export const Playing = ts('Playing', { current: Song.Saved })
const work = withMembers(S.Union([Editing, Playing]), {
  Editing,
  Playing,
})

const emptyShelf = ts('Shelf', { search: Search })
const emptyUnknown = ts('Unknown', { path: NonEmptyString })
/** Empty library page. */
export const Page = S.Union([emptyShelf, emptyUnknown])
/** Empty library page. */
export type Page = typeof Page.Type
/** A library with no songs. */
export const Empty = withMembers(ts('Empty', { page: Page }), {
  Shelf: emptyShelf,
  Unknown: emptyUnknown,
})

const populatedShelf = ts('Shelf', {
  search: Search,
  deleting: Deleting,
})
/** Populated library on a chart. */
export const Chart = withMembers(
  ts('Chart', {
    before: Before,
    after: After,
    work,
  }),
  { Editing, Playing },
)
/** Populated library on a chart. */
export type Chart = typeof Chart.Type
const populatedUnknown = ts('Unknown', {
  songs: S.NonEmptyArray(Song.Saved),
  path: NonEmptyString,
})
const populatedPage = S.Union([populatedShelf, Chart, populatedUnknown])
/** A library with songs. */
export const Populated = withMembers(ts('Populated', { page: populatedPage }), {
  Shelf: populatedShelf,
  Chart,
  Unknown: populatedUnknown,
})
/** Song library. */
export const Library = S.Union([Empty, Populated])
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
    notice: Notice.None(),
    library: Empty.make({
      page: Empty.Shelf.make({ search: Idle() }),
    }),
  })

/** Current chart song. Playing current is stored Empty or Idle. */
export const currentSong = (chart: typeof Chart.Type): Song => {
  if (chart.work._tag === 'Editing') {
    return chart.work.current
  }
  return asSong(chart.work.current)
}

/** Songs of a chart zipper. Current is always a member. Zippers flatten. */
export const songsOfChart = (
  chart: typeof Chart.Type,
): Array.NonEmptyReadonlyArray<typeof Song.Saved.Type> =>
  zipperItems(chart.before, flattenSong(currentSong(chart)), chart.after)

/** Songs of a shelf delete zipper or idle bag. */
export const songsOfDeleting = (
  deleting: Deleting,
): Array.NonEmptyReadonlyArray<typeof Song.Saved.Type> => {
  if (deleting._tag === 'Idle') {
    return deleting.songs
  }
  return zipperItems(deleting.before, deleting.current, deleting.after)
}

/** Songs of a populated library. */
export const songsOfPopulated = (
  page: (typeof Populated.Type)['page'],
): Array.NonEmptyReadonlyArray<typeof Song.Saved.Type> => {
  if (page._tag === 'Chart') {
    return songsOfChart(page)
  }
  if (page._tag === 'Unknown') {
    return page.songs
  }
  return songsOfDeleting(page.deleting)
}

/** Splits a populated list at a member. */
export const zipperAt = (
  songs: Array.NonEmptyReadonlyArray<typeof Song.Saved.Type>,
  member: typeof Song.Saved.Type,
): Option.Option<typeof Chart.Type> =>
  Option.map(
    zipperAtMember(
      songs,
      member,
      Before.Some,
      Before.None,
      After.Some,
      After.None,
    ),
    zip =>
      Chart.make({
        before: zip.before,
        after: zip.after,
        work: Editing.make({ current: asSong(zip.current) }),
      }),
  )

/** Replaces the current chart song and keeps zipper membership. */
export const replaceCurrent = (
  chart: typeof Chart.Type,
  current: Song,
): typeof Chart.Type =>
  Chart.make({
    before: chart.before,
    after: chart.after,
    work:
      chart.work._tag === 'Playing'
        ? Playing.make({ current: flattenSong(current) })
        : Editing.make({ current }),
  })

/** Shown shelf rows. Derived from songs and search. */
export const shownSongs = (
  songs: Array.NonEmptyReadonlyArray<typeof Song.Saved.Type>,
  search: Search,
): ReadonlyArray<typeof Song.Saved.Type> => {
  if (search._tag === 'Idle') {
    return songs
  }
  const query = pipe(search.query, Str.toLowerCase)
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
    notice: Notice.None(),
  })

/** Sets a succeeded notice. */
export const succeededNotice = (
  model: Model,
  heading: string,
  detail?: string,
): Model =>
  Model.make({
    ...model,
    notice: Notice.Some.make({
      kind: Succeeded(),
      title: NonEmptyString.make(heading),
      detail:
        detail === undefined || Str.isEmpty(detail)
          ? Detail.None()
          : Detail.Some.make({ text: NonEmptyString.make(detail) }),
    }),
  })

/** Finds a library member by id. */
export const findSong = (
  songs: Array.NonEmptyReadonlyArray<typeof Song.Saved.Type>,
  songId: (typeof Song.Saved.Type)['id'],
): Option.Option<typeof Song.Saved.Type> =>
  Array.findFirst(songs, song => song.id === songId)

/** Replaces a populated library page. */
export const withPage = (
  model: Model,
  page: (typeof Populated.Type)['page'],
): Model =>
  Model.make({
    ...model,
    library: Populated.make({ page }),
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
    notice: Notice.Some.make({
      kind: Failed(),
      title: NonEmptyString.make(heading),
      detail:
        detail === undefined || Str.isEmpty(detail)
          ? Detail.None()
          : Detail.Some.make({ text: NonEmptyString.make(detail) }),
    }),
  })

export {
  Lyrics,
  Removing,
  Word,
  draftFromText,
  draftOfSection,
  lyricsAt,
  removingAt,
  wordAt,
} from './domain/index.js'
