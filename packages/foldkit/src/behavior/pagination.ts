import { Array, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Pagination Part (Widget #37 of 54, Scribe #2676).
// It is a pure paging Machine and Part declaration covering Zag pagination
// semantics: `Active` state (`page`, `pageSize`), `count`, `siblingCount`
// (default 1), `boundaryCount` (default 1), `totalPagesOf`, `pageRangeOf`
// producing `PageItem` (`Page({ value }) | Ellipsis({ key })`), pure
// `next`/`prev`/`first`/`last`/`goToPage`/`setPageSize` helpers with bounds
// clamping and disabled guards, `sliceRangeOf` (`startIndex`, `endIndex`),
// `atRest`, and reference-stable SlotBindings (`Root`, `PrevButton`,
// `NextButton`, `PageButton`, `Ellipsis`).

// CONSTANTS

/** Default starting page number (`1`). */
export const defaultPage = 1

/** Default number of items per page (`10`). */
export const defaultPageSize = 10

/** Default number of sibling page buttons shown on each side of the current page (`1`). */
export const defaultSiblingCount = 1

/** Default number of boundary page buttons shown at each edge of the range (`1`). */
export const defaultBoundaryCount = 1

/** Stable key for the leading ellipsis item (`'ellipsis-start'`). */
export const startEllipsisKey = 'ellipsis-start'

/** Stable key for the trailing ellipsis item (`'ellipsis-end'`). */
export const endEllipsisKey = 'ellipsis-end'

/** Fixed slots added to `2 * siblingCount + 2 * boundaryCount` when deciding whether ellipses are needed: current page + 2 ellipsis positions (`3`). */
const coreRangePadding = 3

/** Gap size that an ellipsis would hide if it stood for just one page (`2`). */
const singlePageGap = 2

// SCHEMAS

/** A numbered page button entry in {@link pageRangeOf}. */
export const Page = ts('Page', { value: S.Number })
/** A numbered page button entry. */
export type Page = typeof Page.Type

/** A collapsed gap ellipsis entry in {@link pageRangeOf} with a stable list `key`. */
export const Ellipsis = ts('Ellipsis', { key: S.String })
/** A collapsed gap ellipsis entry. */
export type Ellipsis = typeof Ellipsis.Type

/** One entry in the computed pagination control bar (`Page` or `Ellipsis`). */
export const PageItem = S.Union([Page, Ellipsis])
/** One entry in the computed pagination control bar. */
export type PageItem = typeof PageItem.Type

/** Zero-based slice boundaries `[startIndex, endIndex)` for the current page. */
export const SliceRange = S.Struct({
  startIndex: S.Number,
  endIndex: S.Number,
})
/** Zero-based slice boundaries for the current page. */
export type SliceRange = typeof SliceRange.Type

/**
 * Read-only props supplied to the Pagination chart and projection from the
 * Program's Model. Total item count, sibling/boundary counts, defaults, and
 * accessibility linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  count: S.Number,
  siblingCount: S.optionalKey(S.Number),
  boundaryCount: S.optionalKey(S.Number),
  defaultPage: S.optionalKey(S.Number),
  defaultPageSize: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only props supplied to the Pagination chart and projection. */
export type Props = typeof Props.Type

// STATE

/** The pagination control's active state, holding 1-based `page` and positive `pageSize`. */
export const Active = ts('Active', {
  page: S.Number,
  pageSize: S.Number,
})
/** The pagination control's active state. */
export type Active = typeof Active.Type

/** Where a Pagination Part stands (`Active`). Lives in the Model and is JSON-serializable. */
export const State = S.Union([Active])
/** Where a Pagination Part stands. */
export type State = typeof State.Type

/** Initial Pagination state: page `1` with `10` items per page. */
export const initial: State = Active({
  page: defaultPage,
  pageSize: defaultPageSize,
})

/** Creates an initial Pagination state starting on `page` with `pageSize`. */
export const initialPage = (
  page: number = defaultPage,
  pageSize: number = defaultPageSize,
): State =>
  Active({
    page: Math.max(1, Math.trunc(page)),
    pageSize: Math.max(1, Math.trunc(pageSize)),
  })

// ACTIONS

/** Moves to the next page when below `totalPages`. */
export const NextPage = Catalog.action('NextPage', {
  what: 'Advances to the next page of results',
  why: 'To continue browsing the following slice of entries',
  meta: { label: 'Next page', keys: [] },
})

/** Moves to the previous page when above page `1`. */
export const PrevPage = Catalog.action('PrevPage', {
  what: 'Returns to the previous page of results',
  why: 'To review the preceding slice of entries',
  meta: { label: 'Previous page', keys: [] },
})

/** Jumps directly to page `1`. */
export const FirstPage = Catalog.action('FirstPage', {
  what: 'Jumps to the first page of results',
  why: 'To return to the start of the list quickly',
  meta: { label: 'First page', keys: [] },
})

/** Jumps directly to the last available page. */
export const LastPage = Catalog.action('LastPage', {
  what: 'Jumps to the final page of results',
  why: 'To reach the end of the list quickly',
  meta: { label: 'Last page', keys: [] },
})

/** Moves directly to a specific 1-based `page` number, clamped to valid bounds. */
export const GoToPage = Catalog.action('GoToPage', {
  fields: { page: S.Number },
  choose: {
    field: 'page',
    noun: 'page',
    prompt: 'Go to which page number?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a page number',
  },
  what: 'Moves directly to the chosen page number',
  why: 'To open a specific slice of entries without stepping through intermediate pages',
  meta: { label: 'Go to page', keys: [] },
})

/** Changes the number of items displayed per page and clamps the active page into bounds. */
export const SetPageSize = Catalog.action('SetPageSize', {
  fields: { pageSize: S.Number },
  choose: {
    field: 'pageSize',
    noun: 'page size',
    prompt: 'How many items per page?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter a positive page size',
  },
  what: 'Changes the number of items displayed per page',
  why: 'To view denser or lighter batches of entries at once',
  meta: { label: 'Set page size', keys: [] },
})

/** Restores `page` and `pageSize` to `props.defaultPage` and `props.defaultPageSize`. */
export const ResetPagination = Catalog.action('ResetPagination', {
  what: 'Restores the page and page size to their starting values',
  why: 'To start browsing again from the beginning',
  meta: { label: 'Reset pagination', keys: [] },
})

/** The Catalog Actions a Pagination Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  NextPage,
  PrevPage,
  FirstPage,
  LastPage,
  GoToPage,
  SetPageSize,
  ResetPagination,
]

// MESSAGE

/** Every Message the Pagination chart handles. */
export const Message = S.Union([
  NextPage,
  PrevPage,
  FirstPage,
  LastPage,
  GoToPage,
  SetPageSize,
  ResetPagination,
])
/** Every Message the Pagination chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Pagination Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the pagination landmark root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the previous-page button element id from a base `id`. */
export const prevButtonId = (id: string): string => `${id}-prev`

/** Derives the next-page button element id from a base `id`. */
export const nextButtonId = (id: string): string => `${id}-next`

/** Derives a numbered page button element id from a base `id` and `page`. */
export const pageButtonId = (id: string, page: number): string =>
  `${id}-page-${page.toString()}`

/** Derives an ellipsis indicator element id from a base `id` and `key`. */
export const ellipsisId = (id: string, key: string): string => `${id}-${key}`

// CONFIG & MATH READINGS

/** Resolved non-negative sibling count (`1` by default). */
export const siblingCountOf = (
  props: Pick<Props, 'siblingCount'> = {},
): number =>
  props.siblingCount !== undefined && Number.isFinite(props.siblingCount)
    ? Math.max(0, Math.trunc(props.siblingCount))
    : defaultSiblingCount

/** Resolved non-negative boundary count (`1` by default). */
export const boundaryCountOf = (
  props: Pick<Props, 'boundaryCount'> = {},
): number =>
  props.boundaryCount !== undefined && Number.isFinite(props.boundaryCount)
    ? Math.max(0, Math.trunc(props.boundaryCount))
    : defaultBoundaryCount

/** True when pagination controls are disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Computes the total page count from `count` and `pageSize` (`0` when `count <= 0`). */
export const totalPagesFor = (count: number, pageSize: number): number => {
  if (!Number.isFinite(count) || count <= 0) {
    return 0
  }
  const safeSize =
    Number.isFinite(pageSize) && pageSize >= 1 ? Math.trunc(pageSize) : 1
  return Math.ceil(count / safeSize)
}

/** Computes the total number of pages for `state` and `props`. */
export const totalPagesOf = (
  state: Pick<State, 'pageSize'>,
  props: Pick<Props, 'count'>,
): number => totalPagesFor(props.count, state.pageSize)

/** Clamps `page` into `[1, totalPages]` (or `1` when `totalPages <= 0`). */
export const clampPage = (page: number, totalPages: number): number => {
  if (totalPages <= 0) {
    return 1
  } else {
    return Math.min(Math.max(Math.trunc(page), 1), totalPages)
  }
}

/** The active 1-based page clamped to `[1, totalPagesOf(state, props)]`. */
export const currentPageOf = (
  state: State,
  props: Pick<Props, 'count'>,
): number => clampPage(state.page, totalPagesOf(state, props))

/** True when navigating backward is currently permitted. */
export const canGoPrev = (
  state: State,
  props: Pick<Props, 'count' | 'isDisabled'>,
): boolean =>
  !isDisabledOf(props) &&
  totalPagesOf(state, props) > 0 &&
  currentPageOf(state, props) > 1

/** True when navigating forward is currently permitted. */
export const canGoNext = (
  state: State,
  props: Pick<Props, 'count' | 'isDisabled'>,
): boolean =>
  !isDisabledOf(props) &&
  currentPageOf(state, props) < totalPagesOf(state, props)

/** The previous page number, or none when already on page `1` or empty. */
export const previousPageOf = (
  state: State,
  props: Pick<Props, 'count'>,
): Option.Option<number> => {
  const total = totalPagesOf(state, props)
  const current = clampPage(state.page, total)
  return total > 0 && current > 1 ? Option.some(current - 1) : Option.none()
}

/** The next page number, or none when already on the last page or empty. */
export const nextPageOf = (
  state: State,
  props: Pick<Props, 'count'>,
): Option.Option<number> => {
  const total = totalPagesOf(state, props)
  const current = clampPage(state.page, total)
  return current < total ? Option.some(current + 1) : Option.none()
}

/**
 * Computes the zero-based `[startIndex, endIndex)` slice boundaries for the
 * active page against `props.count`.
 *
 * @example
 * ```typescript
 * sliceRangeOf(Active({ page: 2, pageSize: 10 }), { count: 25 })
 * // { startIndex: 10, endIndex: 20 }
 * sliceRangeOf(Active({ page: 3, pageSize: 10 }), { count: 25 })
 * // { startIndex: 20, endIndex: 25 }
 * ```
 */
export const sliceRangeOf = (
  state: State,
  props: Pick<Props, 'count'>,
): SliceRange => {
  if (!Number.isFinite(props.count) || props.count <= 0) {
    return { startIndex: 0, endIndex: 0 }
  }
  const safeSize = Math.max(1, Math.trunc(state.pageSize))
  const total = totalPagesFor(props.count, safeSize)
  const current = clampPage(state.page, total)
  const startIndex = (current - 1) * safeSize
  const endIndex = Math.min(startIndex + safeSize, Math.trunc(props.count))
  return { startIndex, endIndex }
}

/** Slices `items` to the entries belonging to the active page. */
export const sliceOf = <Item>(
  items: ReadonlyArray<Item>,
  state: State,
  props?: Pick<Props, 'count'>,
): ReadonlyArray<Item> => {
  const range = sliceRangeOf(state, { count: props?.count ?? items.length })
  return items.slice(range.startIndex, range.endIndex)
}

const inclusiveRange = (start: number, end: number): ReadonlyArray<number> =>
  end < start ? [] : Array.makeBy(end - start + 1, offset => start + offset)

const pagesFromNumbers = (
  numbers: ReadonlyArray<number>,
): ReadonlyArray<PageItem> => Array.map(numbers, value => Page({ value }))

const collapseSinglePageEllipses = (
  items: ReadonlyArray<PageItem>,
  totalPages: number,
): ReadonlyArray<PageItem> =>
  Array.map(items, (item, index) => {
    if (item._tag !== 'Ellipsis') {
      return item
    }
    const prevValue = Option.match(
      index > 0 ? Array.get(items, index - 1) : Option.none(),
      {
        onNone: () => 0,
        onSome: prev => (prev._tag === 'Page' ? prev.value : 0),
      },
    )
    const nextValue = Option.match(Array.get(items, index + 1), {
      onNone: () => totalPages + 1,
      onSome: nextItem =>
        nextItem._tag === 'Page' ? nextItem.value : totalPages + 1,
    })
    if (nextValue - prevValue === singlePageGap) {
      return Page({ value: prevValue + 1 })
    } else {
      return item
    }
  })

/**
 * Derives the ordered list of {@link PageItem} entries (`Page({ value })` and
 * `Ellipsis({ key })`) for the current page, total pages, `siblingCount`, and
 * `boundaryCount`. Replaces any ellipsis that would conceal only a single page
 * with that page number.
 *
 * @example
 * ```typescript
 * pageRangeOf(Active({ page: 5, pageSize: 10 }), { count: 100 })
 * // [Page(1), Ellipsis('ellipsis-start'), Page(4), Page(5), Page(6), Ellipsis('ellipsis-end'), Page(10)]
 * ```
 */
export const pageRangeOf = (
  state: State,
  props: Pick<Props, 'count' | 'siblingCount' | 'boundaryCount'>,
): ReadonlyArray<PageItem> => {
  const totalPages = totalPagesOf(state, props)
  if (totalPages <= 0) {
    return []
  }
  if (totalPages === 1) {
    return [Page({ value: 1 })]
  }

  const page = clampPage(state.page, totalPages)
  const siblingCount = siblingCountOf(props)
  const boundaryCount = boundaryCountOf(props)
  const firstPage = 1
  const lastPage = totalPages

  const totalPageNumbers = Math.min(
    siblingCount * 2 + coreRangePadding + boundaryCount * 2,
    totalPages,
  )
  if (totalPages <= totalPageNumbers) {
    return pagesFromNumbers(inclusiveRange(firstPage, lastPage))
  }

  const leftSibling = Math.max(page - siblingCount, firstPage)
  const rightSibling = Math.min(page + siblingCount, lastPage)
  const itemCount = totalPageNumbers - 1 - boundaryCount

  const showLeftEllipsis = leftSibling > firstPage + boundaryCount + 1
  const showRightEllipsis = rightSibling < lastPage - boundaryCount - 1

  const rawItems = buildPageRangeItems({
    firstPage,
    lastPage,
    boundaryCount,
    itemCount,
    leftSibling,
    rightSibling,
    showLeftEllipsis,
    showRightEllipsis,
  })

  return collapseSinglePageEllipses(rawItems, totalPages)
}

const buildPageRangeItems = (
  input: Readonly<{
    firstPage: number
    lastPage: number
    boundaryCount: number
    itemCount: number
    leftSibling: number
    rightSibling: number
    showLeftEllipsis: boolean
    showRightEllipsis: boolean
  }>,
): ReadonlyArray<PageItem> => {
  const {
    firstPage,
    lastPage,
    boundaryCount,
    itemCount,
    leftSibling,
    rightSibling,
    showLeftEllipsis,
    showRightEllipsis,
  } = input
  if (!showLeftEllipsis && showRightEllipsis) {
    return [
      ...pagesFromNumbers(inclusiveRange(firstPage, itemCount)),
      Ellipsis({ key: endEllipsisKey }),
      ...pagesFromNumbers(
        inclusiveRange(lastPage - boundaryCount + 1, lastPage),
      ),
    ]
  } else if (showLeftEllipsis && !showRightEllipsis) {
    return [
      ...pagesFromNumbers(
        inclusiveRange(firstPage, firstPage + boundaryCount - 1),
      ),
      Ellipsis({ key: startEllipsisKey }),
      ...pagesFromNumbers(inclusiveRange(lastPage - itemCount + 1, lastPage)),
    ]
  } else if (showLeftEllipsis && showRightEllipsis) {
    return [
      ...pagesFromNumbers(
        inclusiveRange(firstPage, firstPage + boundaryCount - 1),
      ),
      Ellipsis({ key: startEllipsisKey }),
      ...pagesFromNumbers(inclusiveRange(leftSibling, rightSibling)),
      Ellipsis({ key: endEllipsisKey }),
      ...pagesFromNumbers(
        inclusiveRange(lastPage - boundaryCount + 1, lastPage),
      ),
    ]
  } else {
    return pagesFromNumbers(inclusiveRange(firstPage, lastPage))
  }
}

// PURE TRANSITIONS

/** Advances `state` to the next page when permitted, else returns `state` unchanged. */
export const next = (
  state: State,
  props: Pick<Props, 'count' | 'isDisabled'>,
): State => {
  if (!canGoNext(state, props)) {
    return state
  } else {
    return Active({
      page: currentPageOf(state, props) + 1,
      pageSize: state.pageSize,
    })
  }
}

/** Moves `state` to the previous page when permitted, else returns `state` unchanged. */
export const prev = (
  state: State,
  props: Pick<Props, 'count' | 'isDisabled'>,
): State => {
  if (!canGoPrev(state, props)) {
    return state
  } else {
    return Active({
      page: currentPageOf(state, props) - 1,
      pageSize: state.pageSize,
    })
  }
}

/** Moves `state` to page `1` when interactive and not already on page `1`. */
export const first = (
  state: State,
  props: Pick<Props, 'count' | 'isDisabled'>,
): State => {
  if (isDisabledOf(props) || totalPagesOf(state, props) <= 0) {
    return state
  } else if (state.page === 1) {
    return state
  } else {
    return Active({ page: 1, pageSize: state.pageSize })
  }
}

/** Moves `state` to the last page when interactive and not already there. */
export const last = (
  state: State,
  props: Pick<Props, 'count' | 'isDisabled'>,
): State => {
  const total = totalPagesOf(state, props)
  if (isDisabledOf(props) || total <= 0 || state.page === total) {
    return state
  } else {
    return Active({ page: total, pageSize: state.pageSize })
  }
}

/** Moves `state` to `targetPage` clamped into `[1, totalPages]`, respecting disabled guards. */
export const goToPage = (
  state: State,
  targetPage: number,
  props: Pick<Props, 'count' | 'isDisabled'>,
): State => {
  const total = totalPagesOf(state, props)
  if (isDisabledOf(props) || !Number.isFinite(targetPage) || total <= 0) {
    return state
  }
  const clamped = clampPage(targetPage, total)
  if (clamped === state.page) {
    return state
  } else {
    return Active({ page: clamped, pageSize: state.pageSize })
  }
}

/** Updates `pageSize` (requiring positive finite size) and clamps `page` into the new total pages. */
export const setPageSize = (
  state: State,
  nextPageSize: number,
  props: Pick<Props, 'count' | 'isDisabled'>,
): State => {
  if (
    isDisabledOf(props) ||
    !Number.isFinite(nextPageSize) ||
    nextPageSize < 1
  ) {
    return state
  }
  const safeSize = Math.trunc(nextPageSize)
  const nextTotal = totalPagesFor(props.count, safeSize)
  const clampedPage = clampPage(state.page, nextTotal)
  if (safeSize === state.pageSize && clampedPage === state.page) {
    return state
  } else {
    return Active({ page: clampedPage, pageSize: safeSize })
  }
}

// CHART

const changedState = (
  nextState: State,
  previous: State,
): Option.Option<Active> =>
  nextState === previous ? Option.none() : Option.some(nextState)

/**
 * Builds the Pagination Machine chart starting in `initialState`.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Active: {
        on: {
          NextPage: [
            when(
              (state, _message, context) =>
                changedState(next(state, context), state),
              'Active',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PrevPage: [
            when(
              (state, _message, context) =>
                changedState(prev(state, context), state),
              'Active',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          FirstPage: [
            when(
              (state, _message, context) =>
                changedState(first(state, context), state),
              'Active',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          LastPage: [
            when(
              (state, _message, context) =>
                changedState(last(state, context), state),
              'Active',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          GoToPage: [
            when(
              (state, message, context) =>
                changedState(goToPage(state, message.page, context), state),
              'Active',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          SetPageSize: [
            when(
              (state, message, context) =>
                changedState(
                  setPageSize(state, message.pageSize, context),
                  state,
                ),
              'Active',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          ResetPagination: to('Active', ({ context }) => {
            const pageSize = Math.max(
              1,
              Math.trunc(context.defaultPageSize ?? defaultPageSize),
            )
            const total = totalPagesFor(context.count, pageSize)
            return Active({
              page: clampPage(context.defaultPage ?? defaultPage, total),
              pageSize,
            })
          }),
        },
      },
    },
  })

/** The default Pagination Machine chart starting at page `1`, size `10`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  NextPage: pace,
  PrevPage: pace,
  FirstPage: pace,
  LastPage: pace,
  GoToPage: pace,
  SetPageSize: pace,
  ResetPagination: pace,
})

/** Default synchronization: every Pagination Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Pagination kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The five painted slots of a Pagination Part:
 * - `Root`: navigation landmark container (`role="region"`).
 * - `PrevButton`: previous page button (`role="button"`, `PrevPage`).
 * - `NextButton`: next page button (`role="button"`, `NextPage`).
 * - `PageButton`: one numbered page button keyed by page number (`role="button"`, `isCurrent`, `GoToPage`).
 * - `Ellipsis`: gap indicator keyed by ellipsis key.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Region',
    focus: 'None',
    gestures: [],
  },
  PrevButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'PrevPage' }],
  },
  NextButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'NextPage' }],
  },
  PageButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'GoToPage' }],
  },
  Ellipsis: {
    focus: 'None',
    gestures: [],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      ...(props.labelledBy !== undefined
        ? { labelledBy: props.labelledBy }
        : { label: props.label ?? 'Pagination' }),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'PrevButton') {
    const isPrevEnabled = canGoPrev(state, props)
    return {
      id: prevButtonId(props.id),
      label: 'Previous page',
      isDisabled: !isPrevEnabled,
      tabIndex: isPrevEnabled ? 0 : -1,
    }
  } else if (slot === 'NextButton') {
    const isNextEnabled = canGoNext(state, props)
    return {
      id: nextButtonId(props.id),
      label: 'Next page',
      isDisabled: !isNextEnabled,
      tabIndex: isNextEnabled ? 0 : -1,
    }
  } else if (slot === 'PageButton') {
    const page = Option.match(maybeChoice, {
      onNone: () => 1,
      onSome: raw => {
        const parsed = Number(raw)
        return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
      },
    })
    const current = currentPageOf(state, props)
    const isCurrent = totalPagesOf(state, props) > 0 && page === current
    const isDisabled = isDisabledOf(props)
    return {
      id: pageButtonId(props.id, page),
      label: `Page ${page.toString()}`,
      isCurrent,
      tabIndex: isDisabled ? -1 : 0,
      ...(isDisabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Ellipsis') {
    const key = Option.getOrElse(maybeChoice, () => startEllipsisKey)
    return {
      id: ellipsisId(props.id, key),
    }
  } else {
    return {}
  }
}

/** What a restart opens a Pagination on: keeps the active page and page size. */
export const atRest = (state: State): State => state

// PART FACTORY

/** Options for customizing a Pagination Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  sync?: 'Synced' | DeviceReason
  defaultPage?: number
  defaultPageSize?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Pagination {@link Part.Part}. Synced by default (`category: 'Navigation'`).
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const initialState: State =
    options.defaultPage === undefined && options.defaultPageSize === undefined
      ? initial
      : initialPage(
          options.defaultPage ?? defaultPage,
          options.defaultPageSize ?? defaultPageSize,
        )
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Pagination',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Navigation',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })
}

/** Shorthand for a Pagination Part whose state stays on the device. */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced Pagination Part (`name: 'Pagination'`, `category: 'Navigation'`). */
export const part: Part.Part<State, Message, Props> = make()
