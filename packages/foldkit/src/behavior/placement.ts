import { Schema as S } from 'effect'

// NOTE: this is the one place that decides where a menu goes by the part
// it opened on. It measures nothing and keeps nothing: a painter measures
// the two rectangles while it lays out, calls `place`, and applies the
// answer in the same frame, so a menu is never drawn one frame late.

/**
 * A rectangle a painter measured, in the view's own pixels or points:
 * `{ left: 300, top: 100, width: 80, height: 20 }` is a word 300 from the
 * left and 100 from the top.
 */
export const Rect = S.Struct({
  left: S.Number,
  top: S.Number,
  width: S.Number,
  height: S.Number,
})
/** A rectangle a painter measured. */
export type Rect = typeof Rect.Type

/** How large something is: `{ width: 200, height: 120 }` for a menu. */
export const Size = S.Struct({ width: S.Number, height: S.Number })
/** How large something is. */
export type Size = typeof Size.Type

/** Which side of its anchor a menu was put on. */
export const Side = S.Literals(['Below', 'Above'])
/** Which side of its anchor a menu was put on. */
export type Side = typeof Side.Type

/**
 * Where a menu goes: its left and top in the view, and the side of the
 * anchor it landed on.
 *
 * @example
 * ```typescript
 * const placed: Placed = { left: 300, top: 128, side: 'Below' }
 * ```
 */
export const Placed = S.Struct({ left: S.Number, top: S.Number, side: Side })
/** Where a menu goes. */
export type Placed = typeof Placed.Type

/** The room kept between a menu and its anchor when a part sets none. */
export const defaultGapPx = 8

/** The room kept between a menu and the edge of the view when a part sets none. */
export const defaultEdgePx = 8

/**
 * Where to put a menu of `size` by its `anchor` inside a `view`: under the
 * anchor with a gap, at the anchor's left; above it where it does not fit
 * below; and never nearer the view's edge than `edgePx`.
 *
 * @example
 * ```typescript
 * place({
 *   anchor: { left: 300, top: 100, width: 80, height: 20 },
 *   size: { width: 200, height: 120 },
 *   view: { width: 1000, height: 800 },
 * })
 * // { left: 300, top: 128, side: 'Below' }
 *
 * place({
 *   anchor: { left: 300, top: 700, width: 80, height: 20 },
 *   size: { width: 200, height: 120 },
 *   view: { width: 1000, height: 800 },
 * })
 * // { left: 300, top: 572, side: 'Above' }
 * ```
 */
export const place = (
  input: Readonly<{
    anchor: Rect
    size: Size
    view: Size
    gapPx?: number
    edgePx?: number
  }>,
): Placed => {
  const { anchor, size, view } = input
  const gapPx = input.gapPx ?? defaultGapPx
  const edgePx = input.edgePx ?? defaultEdgePx
  const below = anchor.top + anchor.height + gapPx
  const left = Math.max(
    edgePx,
    Math.min(anchor.left, view.width - size.width - edgePx),
  )
  if (below + size.height <= view.height - edgePx) {
    return { left, top: below, side: 'Below' }
  } else {
    return {
      left,
      top: Math.max(edgePx, anchor.top - gapPx - size.height),
      side: 'Above',
    }
  }
}
