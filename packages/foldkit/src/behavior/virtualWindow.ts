import { Array, Match as M, Option, Schema as S } from 'effect'

// NOTE: this is the reusable framework-free `virtualWindow` block (Scribe #2663).
// It keeps no state and reads no DOM: fixed-height and variable-height windowing,
// cumulative prefix-sum offsets, O(log N) binary searches for visible start/end
// indices, overscan padding, and Start/Center/End/Auto scroll-to-index math.
// Shared by the core `VirtualList` Part and `@foldkit/ui` `VirtualList`.

// CONSTANTS

/** Default number of extra rows rendered above and below the visible viewport (`5`). */
export const defaultOverscan = 5

// SCHEMAS

/** How programmatic scroll-to-index aligns the target item inside the viewport. */
export const ScrollAlignment = S.Literals(['Start', 'Center', 'End', 'Auto'])
/** How programmatic scroll-to-index aligns the target item inside the viewport. */
export type ScrollAlignment = typeof ScrollAlignment.Type

/**
 * Computed visible slice `[startIndex, endIndex)` plus spacer heights keeping
 * scrollbar geometry exact.
 */
export const Window = S.Struct({
  startIndex: S.Number,
  endIndex: S.Number,
  topSpacerHeight: S.Number,
  bottomSpacerHeight: S.Number,
  totalHeight: S.Number,
})
/** Computed visible slice and spacer heights for a virtualized list. */
export type Window = typeof Window.Type

/** Input for {@link scrollOffsetForIndex}: either variable `offsets` or fixed `itemCount` + `rowHeightPx`. */
export type ScrollToIndexInput =
  | Readonly<{
      index: number
      offsets: ReadonlyArray<number>
      containerHeight: number
      currentScrollTop?: number
      align?: ScrollAlignment
    }>
  | Readonly<{
      index: number
      itemCount: number
      rowHeightPx: number
      containerHeight: number
      currentScrollTop?: number
      align?: ScrollAlignment
    }>

// PURE WINDOWING MATH

/**
 * Clamps `index` into `[0, max]` where `max = Math.max(0, itemCount)`.
 *
 * @example
 * ```typescript
 * clampIndex(-3, 10) // 0
 * clampIndex(12, 10) // 10
 * clampIndex(4, 10) // 4
 * ```
 */
export const clampIndex = (index: number, itemCount: number): number =>
  Math.max(0, Math.min(index, Math.max(0, itemCount)))

/**
 * Builds cumulative prefix-sum offsets from per-item `heights`. The result has
 * length `heights.length + 1`, starting at `0` and ending at the total height.
 * Negative heights are clamped to `0` to preserve monotonicity for binary search.
 *
 * @example
 * ```typescript
 * prefixOffsets([10, 20, 30]) // [0, 10, 30, 60]
 * prefixOffsets([]) // [0]
 * ```
 */
export const prefixOffsets = (
  heights: ReadonlyArray<number>,
): ReadonlyArray<number> =>
  Array.scan(
    heights,
    0,
    (cumulative, height) => cumulative + Math.max(0, height),
  )

/**
 * Total height of a prefix-sum `offsets` array (its last entry, or `0` when empty).
 *
 * @example
 * ```typescript
 * totalHeightOf([0, 10, 30, 60]) // 60
 * totalHeightOf([]) // 0
 * ```
 */
export const totalHeightOf = (offsets: ReadonlyArray<number>): number =>
  Option.getOrElse(Array.last(offsets), () => 0)

/**
 * Cumulative top offset for `index` in a prefix-sum `offsets` array.
 * Indices `<= 0` return `0`; indices past the end return `totalHeightOf(offsets)`.
 *
 * @example
 * ```typescript
 * offsetAt([0, 10, 30, 60], 2) // 30
 * offsetAt([0, 10, 30, 60], -1) // 0
 * offsetAt([0, 10, 30, 60], 10) // 60
 * ```
 */
export const offsetAt = (
  offsets: ReadonlyArray<number>,
  index: number,
): number => {
  if (Array.isReadonlyArrayEmpty(offsets) || index <= 0) {
    return 0
  } else {
    return Option.getOrElse(Array.get(offsets, Math.floor(index)), () =>
      totalHeightOf(offsets),
    )
  }
}

/**
 * Height of the item at `index` derived from adjacent entries in `offsets`, or
 * `0` when `index` is out of range.
 *
 * @example
 * ```typescript
 * itemHeightAt([0, 10, 30, 60], 1) // 20
 * ```
 */
export const itemHeightAt = (
  offsets: ReadonlyArray<number>,
  index: number,
): number => {
  const itemCount = Math.max(0, offsets.length - 1)
  if (index < 0 || index >= itemCount) {
    return 0
  } else {
    return Math.max(0, offsetAt(offsets, index + 1) - offsetAt(offsets, index))
  }
}

const searchUpperBound = (
  offsets: ReadonlyArray<number>,
  target: number,
  low: number,
  high: number,
): number => {
  if (low >= high) {
    return low
  } else {
    const mid = Math.floor((low + high) / 2)
    const value = Option.getOrElse(Array.get(offsets, mid), () => 0)
    return value > target
      ? searchUpperBound(offsets, target, low, mid)
      : searchUpperBound(offsets, target, mid + 1, high)
  }
}

const searchLowerBound = (
  offsets: ReadonlyArray<number>,
  target: number,
  low: number,
  high: number,
): number => {
  if (low >= high) {
    return low
  } else {
    const mid = Math.floor((low + high) / 2)
    const value = Option.getOrElse(Array.get(offsets, mid), () => 0)
    return value >= target
      ? searchLowerBound(offsets, target, low, mid)
      : searchLowerBound(offsets, target, mid + 1, high)
  }
}

/**
 * O(log N) binary search locating the first item index whose bottom edge lies
 * strictly past `scrollTop`. Returns `itemCount` when `scrollTop` exceeds the
 * total content height, and `0` when the list is empty or `scrollTop <= 0`.
 *
 * @example
 * ```typescript
 * findFirstVisibleIndex([0, 10, 30, 60, 100, 150], 25) // 1
 * findFirstVisibleIndex([0, 10, 30, 60, 100, 150], 1000) // 5
 * ```
 */
export const findFirstVisibleIndex = (
  offsets: ReadonlyArray<number>,
  scrollTop: number,
): number => {
  const itemCount = Math.max(0, offsets.length - 1)
  if (itemCount === 0) {
    return 0
  } else {
    const upper = searchUpperBound(offsets, scrollTop, 0, offsets.length)
    return upper >= offsets.length ? itemCount : Math.max(0, upper - 1)
  }
}

/**
 * O(log N) binary search locating the exclusive end index covering up to
 * `scrollBottom` (`scrollTop + containerHeight`). Returns `itemCount` when
 * `scrollBottom` exceeds the total content height, and `0` when the list is empty.
 *
 * @example
 * ```typescript
 * findLastVisibleIndex([0, 10, 30, 60, 100, 150], 60) // 3
 * findLastVisibleIndex([0, 10, 30, 60, 100, 150], 85) // 4
 * ```
 */
export const findLastVisibleIndex = (
  offsets: ReadonlyArray<number>,
  scrollBottom: number,
): number => {
  const itemCount = Math.max(0, offsets.length - 1)
  if (itemCount === 0) {
    return 0
  } else {
    const lower = searchLowerBound(offsets, scrollBottom, 0, offsets.length)
    return lower >= offsets.length ? itemCount : lower
  }
}

/**
 * Computes the visible {@link Window} for a uniform-height virtualized list.
 *
 * @example
 * ```typescript
 * computeFixedWindow({
 *   itemCount: 1000,
 *   rowHeightPx: 30,
 *   scrollTop: 600,
 *   containerHeight: 300,
 *   overscan: 5,
 * })
 * // { startIndex: 15, endIndex: 35, topSpacerHeight: 450, bottomSpacerHeight: 28950, totalHeight: 30000 }
 * ```
 */
export const computeFixedWindow = (
  input: Readonly<{
    itemCount: number
    rowHeightPx: number
    scrollTop: number
    containerHeight: number
    overscan?: number
  }>,
): Window => {
  const itemCount = Math.max(0, Math.floor(input.itemCount))
  if (itemCount === 0 || input.rowHeightPx <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0,
    }
  }
  const overscan = Math.max(0, Math.floor(input.overscan ?? defaultOverscan))
  const containerHeight = Math.max(0, input.containerHeight)
  const firstVisibleIndex = Math.floor(input.scrollTop / input.rowHeightPx)
  const lastVisibleIndex = Math.ceil(
    (input.scrollTop + containerHeight) / input.rowHeightPx,
  )
  const startIndex = clampIndex(firstVisibleIndex - overscan, itemCount)
  const endIndex = clampIndex(lastVisibleIndex + overscan, itemCount)
  const totalHeight = itemCount * input.rowHeightPx
  return {
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * input.rowHeightPx,
    bottomSpacerHeight: (itemCount - endIndex) * input.rowHeightPx,
    totalHeight,
  }
}

/**
 * Computes the visible {@link Window} for a variable-height list from its
 * cumulative prefix-sum `offsets` (produced by {@link prefixOffsets}), using
 * O(log N) binary search for both visible bounds.
 *
 * @example
 * ```typescript
 * computeVariableWindow({
 *   offsets: prefixOffsets([10, 20, 30, 40, 50]),
 *   scrollTop: 25,
 *   containerHeight: 60,
 *   overscan: 0,
 * })
 * // { startIndex: 1, endIndex: 4, topSpacerHeight: 10, bottomSpacerHeight: 50, totalHeight: 150 }
 * ```
 */
export const computeVariableWindow = (
  input: Readonly<{
    offsets: ReadonlyArray<number>
    scrollTop: number
    containerHeight: number
    overscan?: number
  }>,
): Window => {
  const itemCount = Math.max(0, input.offsets.length - 1)
  const totalHeight = totalHeightOf(input.offsets)
  if (itemCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0,
    }
  }
  const overscan = Math.max(0, Math.floor(input.overscan ?? defaultOverscan))
  const containerHeight = Math.max(0, input.containerHeight)
  const firstVisibleIndex = findFirstVisibleIndex(
    input.offsets,
    input.scrollTop,
  )
  const lastVisibleIndex = findLastVisibleIndex(
    input.offsets,
    input.scrollTop + containerHeight,
  )
  const startIndex = clampIndex(firstVisibleIndex - overscan, itemCount)
  const endIndex = clampIndex(lastVisibleIndex + overscan, itemCount)
  const topSpacerHeight = offsetAt(input.offsets, startIndex)
  const bottomSpacerHeight = Math.max(
    0,
    totalHeight - offsetAt(input.offsets, endIndex),
  )
  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    totalHeight,
  }
}

const alignScrollOffset = (
  itemTop: number,
  itemHeight: number,
  totalHeight: number,
  containerHeight: number,
  currentScrollTop: number,
  align: ScrollAlignment,
): number => {
  const safeContainerHeight = Math.max(0, containerHeight)
  const itemBottom = itemTop + itemHeight
  const raw = M.value(align).pipe(
    M.withReturnType<number>(),
    M.when('Start', () => itemTop),
    M.when('Center', () => itemTop - (safeContainerHeight - itemHeight) / 2),
    M.when('End', () => itemBottom - safeContainerHeight),
    M.when('Auto', () => {
      const viewportBottom = currentScrollTop + safeContainerHeight
      const isFullyVisible =
        itemTop >= currentScrollTop && itemBottom <= viewportBottom
      const spansViewport =
        itemTop <= currentScrollTop && itemBottom >= viewportBottom
      if (isFullyVisible || spansViewport) {
        return currentScrollTop
      } else if (itemTop < currentScrollTop) {
        return itemTop
      } else {
        return itemBottom - safeContainerHeight
      }
    }),
    M.exhaustive,
  )
  const maxScrollTop = Math.max(0, totalHeight - safeContainerHeight)
  return Math.max(0, Math.min(raw, maxScrollTop))
}

/**
 * Computes the target `scrollTop` to bring `index` into view under the chosen
 * {@link ScrollAlignment} (`'Start'`, `'Center'`, `'End'`, or `'Auto'`). Works
 * for both fixed-height (`itemCount` + `rowHeightPx`) and variable-height
 * (`offsets`) lists, clamping out-of-range indices and scroll positions into
 * valid bounds.
 *
 * @example
 * ```typescript
 * scrollOffsetForIndex({
 *   index: 20,
 *   itemCount: 100,
 *   rowHeightPx: 30,
 *   containerHeight: 300,
 *   align: 'Center',
 * }) // 465
 * ```
 */
export const scrollOffsetForIndex = (input: ScrollToIndexInput): number => {
  const align = input.align ?? 'Start'
  const currentScrollTop = Math.max(0, input.currentScrollTop ?? 0)
  if ('offsets' in input) {
    const itemCount = Math.max(0, input.offsets.length - 1)
    if (itemCount === 0) {
      return 0
    }
    const safeIndex = clampIndex(Math.floor(input.index), itemCount - 1)
    return alignScrollOffset(
      offsetAt(input.offsets, safeIndex),
      itemHeightAt(input.offsets, safeIndex),
      totalHeightOf(input.offsets),
      input.containerHeight,
      currentScrollTop,
      align,
    )
  } else {
    const itemCount = Math.max(0, Math.floor(input.itemCount))
    if (itemCount === 0 || input.rowHeightPx <= 0) {
      return 0
    }
    const safeIndex = clampIndex(Math.floor(input.index), itemCount - 1)
    return alignScrollOffset(
      safeIndex * input.rowHeightPx,
      input.rowHeightPx,
      itemCount * input.rowHeightPx,
      input.containerHeight,
      currentScrollTop,
      align,
    )
  }
}
