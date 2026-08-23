import { Array, Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Bookmark, Category, displayTitle } from './domain/index.js'

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
export const Confirming = ts('Confirming', { bookmark: Bookmark })
/** Shelf delete. */
export const Deleting = S.Union([DeletingIdle, Confirming])
/** Shelf delete. */
export type Deleting = typeof Deleting.Type

/** A library with no bookmarks. */
export const LibraryEmpty = ts('Empty', { looking: Looking })
/** A library with bookmarks. */
export const LibraryPopulated = ts('Populated', {
  items: S.NonEmptyArray(Bookmark),
  looking: Looking,
  deleting: Deleting,
})
/** Bookmark library. */
export const Library = S.Union([LibraryEmpty, LibraryPopulated])
/** Bookmark library. */
export type Library = typeof Library.Type

/** No capture draft. */
export const CaptureIdle = ts('Idle')
/** Typing a capture. */
export const Drafting = ts('Drafting', { text: S.String })
/** Classifying a capture. */
export const Classifying = ts('Classifying', { text: NonEmptyString })
/** Capture working. */
export const Capture = S.Union([CaptureIdle, Drafting, Classifying])
/** Capture working. */
export type Capture = typeof Capture.Type

/** Chrome is not signed in as the X account. */
export const Unsigned = ts('Unsigned')
/** X session is being read. */
export const Pending = ts('Pending')
/** X session is signed in. */
export const Signed = ts('Signed', { handle: NonEmptyString })
/** X bookmark session. Screen still paints when Unsigned. */
export const XSession = S.Union([Unsigned, Pending, Signed])
/** X bookmark session. */
export type XSession = typeof XSession.Type

/** yt-dlp is not on this machine. */
export const Missing = ts('Missing')
/** yt-dlp is present. */
export const Present = ts('Present')
/** Local video tool. */
export const VideoTool = S.Union([Missing, Present])
/** Local video tool. */
export type VideoTool = typeof VideoTool.Type

/** Keyword classifier. Not a live wasm model. */
export const Deterministic = ts('Deterministic')
/** A wasm model is being fetched. */
export const LoadingWasm = ts('LoadingWasm')
/** A wasm model is ready. */
export const WasmReady = ts('WasmReady')
/** A wasm model could not be fetched. */
export const WasmFailed = ts('WasmFailed')
/** Classifier backend. Do not inhabit WasmReady without a live model. */
export const Classifier = S.Union([
  Deterministic,
  LoadingWasm,
  WasmReady,
  WasmFailed,
])
/** Classifier backend. */
export type Classifier = typeof Classifier.Type

/** Show every category. */
export const All = ts('All')
/** Show one category. */
export const Only = ts('Only', { category: Category })
/** Shelf filter. */
export const Filter = S.Union([All, Only])
/** Shelf filter. */
export type Filter = typeof Filter.Type

/** The Ingest Model. */
export const Model = S.Struct({
  notice: Notice,
  library: Library,
  capture: Capture,
  xSession: XSession,
  videoTool: VideoTool,
  classifier: Classifier,
  filter: Filter,
})
/** The Ingest Model. */
export type Model = typeof Model.Type

/** Product identity title printed by hosts that need a document title. */
export const title = 'Ingest'

/** Empty library. Screen still paints when X is unsigned and yt-dlp is missing. */
export const emptyModel = (): Model =>
  Model.make({
    notice: NoticeNone(),
    library: LibraryEmpty.make({ looking: Idle() }),
    capture: CaptureIdle(),
    xSession: Unsigned(),
    videoTool: Missing(),
    classifier: Deterministic(),
    filter: All(),
  })

/** Looking of a library. */
export const lookingOf = (library: Library): Looking => library.looking

/** Bookmarks of a populated library. */
export const itemsOf = (
  library: typeof LibraryPopulated.Type,
): ReadonlyArray<Bookmark> => library.items

/** Shown shelf rows. Derived from items, looking, and filter. */
export const shownBookmarks = (
  items: ReadonlyArray<Bookmark>,
  looking: Looking,
  filter: Filter,
): ReadonlyArray<Bookmark> => {
  const filtered =
    filter._tag === 'All'
      ? items
      : Array.filter(items, item => item.category._tag === filter.category._tag)
  if (looking._tag === 'Idle') {
    return filtered
  }
  const query = Str.toLowerCase(looking.query)
  return Array.filter(filtered, item =>
    Str.toLowerCase(displayTitle(item)).includes(query),
  )
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

/** Finds a library member by id. */
export const findBookmark = (
  items: ReadonlyArray<Bookmark>,
  bookmarkId: Bookmark['id'],
): Option.Option<Bookmark> =>
  Array.findFirst(items, item => item.id === bookmarkId)

/** Replaces the whole library. */
export const withLibrary = (model: Model, library: Library): Model =>
  Model.make({
    ...model,
    library,
  })

/** Next bookmark id. Derived from library size. */
export const nextBookmarkId = (library: Library): Bookmark['id'] => {
  const n = library._tag === 'Empty' ? 1 : library.items.length + 1
  return NonEmptyString.make(`b:${String(n)}`)
}

/** Adds a bookmark. Empty becomes populated. */
export const withBookmark = (model: Model, bookmark: Bookmark): Model => {
  if (model.library._tag === 'Empty') {
    return withLibrary(
      model,
      LibraryPopulated.make({
        items: [bookmark],
        looking: model.library.looking,
        deleting: DeletingIdle(),
      }),
    )
  }
  return withLibrary(
    model,
    LibraryPopulated.make({
      items: Array.append(model.library.items, bookmark),
      looking: model.library.looking,
      deleting: DeletingIdle(),
    }),
  )
}

/** Sets looking on the current library. */
export const withLooking = (model: Model, looking: Looking): Model => {
  if (model.library._tag === 'Empty') {
    return withLibrary(model, LibraryEmpty.make({ looking }))
  }
  return withLibrary(
    model,
    LibraryPopulated.make({
      items: model.library.items,
      looking,
      deleting: model.library.deleting,
    }),
  )
}
