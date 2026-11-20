import { describe, expect, it } from 'vitest'

import { defaultEdgePx, defaultGapPx, place } from './placement.js'

const view = { width: 1000, height: 800 }

const menu = { width: 200, height: 120 }

describe('placing a menu by its anchor', () => {
  it('puts it under the anchor, a gap below, at the anchor’s left', () => {
    expect(
      place({
        anchor: { left: 300, top: 100, width: 80, height: 20 },
        size: menu,
        view,
      }),
    ).toEqual({ left: 300, top: 128, side: 'Below' })
  })

  it('puts it above the anchor where it does not fit below', () => {
    expect(
      place({
        anchor: { left: 300, top: 700, width: 80, height: 20 },
        size: menu,
        view,
      }),
    ).toEqual({ left: 300, top: 572, side: 'Above' })
  })

  it('fits below when its bottom lands exactly on the edge it keeps clear', () => {
    expect(
      place({
        anchor: { left: 300, top: 644, width: 80, height: 20 },
        size: menu,
        view,
      }),
    ).toEqual({ left: 300, top: 672, side: 'Below' })
  })

  it('goes above when its bottom would pass that edge by one pixel', () => {
    expect(
      place({
        anchor: { left: 300, top: 645, width: 80, height: 20 },
        size: menu,
        view,
      }).side,
    ).toBe('Above')
  })

  it('keeps it inside the right edge of the view', () => {
    expect(
      place({
        anchor: { left: 950, top: 100, width: 40, height: 20 },
        size: menu,
        view,
      }).left,
    ).toBe(792)
  })

  it('keeps it inside the left edge of the view', () => {
    expect(
      place({
        anchor: { left: -40, top: 100, width: 40, height: 20 },
        size: menu,
        view,
      }).left,
    ).toBe(8)
  })

  it('never puts it above the top edge, in a view too short for it either way', () => {
    expect(
      place({
        anchor: { left: 300, top: 60, width: 80, height: 20 },
        size: { width: 200, height: 400 },
        view: { width: 1000, height: 300 },
      }),
    ).toEqual({ left: 300, top: 8, side: 'Above' })
  })

  it('takes the gap and the edge a part configures', () => {
    expect(
      place({
        anchor: { left: 300, top: 100, width: 80, height: 20 },
        size: menu,
        view,
        gapPx: 4,
        edgePx: 16,
      }),
    ).toEqual({ left: 300, top: 124, side: 'Below' })
  })

  it('keeps 8 pixels of gap and of edge by default', () => {
    expect(defaultGapPx).toBe(8)
    expect(defaultEdgePx).toBe(8)
  })
})
