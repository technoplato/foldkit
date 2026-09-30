import { Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** How many recordings one page of the list holds. */
export const RECORDING_LIST_PAGE_SIZE = 100

/**
 * The most pages the list keeps at once. Scrolling past them drops the page
 * farthest from where the listener is, so a long history never loads whole:
 * at most 300 recordings at the current page size.
 */
export const RECORDING_WINDOW_PAGE_LIMIT = 3

/**
 * The run of pages the recording list observes, counted from the newest
 * recording. `{ firstPage: 2, pageCount: 3 }` holds the 201st to the 500th
 * newest recordings.
 */
export const RecordingWindow = S.Struct({
  firstPage: S.Number,
  pageCount: S.Number,
})
/** The run of pages the recording list observes. */
export type RecordingWindow = typeof RecordingWindow.Type

/** The window the list opens with: the newest page. */
export const firstRecordingWindow: RecordingWindow = {
  firstPage: 0,
  pageCount: 1,
}

/** An edge of the loaded rows: `Newer` above the first row, `Older` below the last. */
export const ListEdge = S.Literals(['Newer', 'Older'])
/** An edge of the loaded rows. */
export type ListEdge = typeof ListEdge.Type

/**
 * What lies past the window's older edge. `MoreToLoad`: the server reports
 * older recordings, and scrolling near the edge loads them. `EndOfList`: the
 * server reports none, so the oldest recording is loaded. `NothingAdded`: the
 * last load at this edge added no recording although the server still reported
 * more (a page of recordings this account cannot read, or a server that
 * ignored the offset), so the edge asks for nothing more until the window
 * moves.
 */
export const OlderEdge = S.Literals(['MoreToLoad', 'EndOfList', 'NothingAdded'])
/** What lies past the window's older edge. */
export type OlderEdge = typeof OlderEdge.Type

/**
 * Whether the list is loading a page: `Settled` shows the rows of the window
 * it asks for, `LoadingNewer` and `LoadingOlder` wait for a window that moved
 * toward the newest or the oldest recording.
 */
export const ListPaging = S.Literals([
  'Settled',
  'LoadingNewer',
  'LoadingOlder',
])
/** Whether the list is loading a page. */
export type ListPaging = typeof ListPaging.Type

/** Whether two windows hold the same pages. */
export const isSameRecordingWindow = (
  first: RecordingWindow,
  second: RecordingWindow,
): boolean =>
  first.firstPage === second.firstPage && first.pageCount === second.pageCount

/**
 * The window one step toward the oldest recording: one more page while the
 * window has room, then the same number of pages one page further, which
 * drops the newest page.
 *
 * @example
 * ```ts
 * olderRecordingWindowOf({ firstPage: 0, pageCount: 2 })
 * // { firstPage: 0, pageCount: 3 }
 * olderRecordingWindowOf({ firstPage: 0, pageCount: 3 })
 * // { firstPage: 1, pageCount: 3 }
 * ```
 */
export const olderRecordingWindowOf = (
  window: RecordingWindow,
): RecordingWindow =>
  window.pageCount < RECORDING_WINDOW_PAGE_LIMIT
    ? { firstPage: window.firstPage, pageCount: window.pageCount + 1 }
    : { firstPage: window.firstPage + 1, pageCount: window.pageCount }

/**
 * The window one page toward the newest recording, which drops the oldest
 * page; `None` when the window already starts at the newest recording.
 *
 * @example
 * ```ts
 * newerRecordingWindowOf({ firstPage: 2, pageCount: 3 })
 * // Option.some({ firstPage: 1, pageCount: 3 })
 * ```
 */
export const newerRecordingWindowOf = (
  window: RecordingWindow,
): Option.Option<RecordingWindow> =>
  window.firstPage > 0
    ? Option.some({
        firstPage: window.firstPage - 1,
        pageCount: window.pageCount,
      })
    : Option.none()

/**
 * The rows a window's query asks for: `limit` recordings after skipping the
 * `offset` newest ones.
 *
 * @example
 * ```ts
 * recordingWindowRangeOf({ firstPage: 2, pageCount: 3 })
 * // { limit: 300, offset: 200 }
 * ```
 */
export const recordingWindowRangeOf = (
  window: RecordingWindow,
): Readonly<{ limit: number; offset: number }> => ({
  limit: window.pageCount * RECORDING_LIST_PAGE_SIZE,
  offset: window.firstPage * RECORDING_LIST_PAGE_SIZE,
})

/** The list knows exactly how many recordings the account has: all are loaded. */
export const ExactCount = ts('ExactCount', { count: S.Number })
/** The list holds `count` recordings from the newest, and there may be more. */
export const AtLeastCount = ts('AtLeastCount', { count: S.Number })
/** The list shows a window that does not start at the newest recording, so it names no count. */
export const UnknownCount = ts('UnknownCount')
/** How many recordings the list knows the account has. */
export const RecordingCount = S.Union([ExactCount, AtLeastCount, UnknownCount])
/** How many recordings the list knows the account has. */
export type RecordingCount = typeof RecordingCount.Type
