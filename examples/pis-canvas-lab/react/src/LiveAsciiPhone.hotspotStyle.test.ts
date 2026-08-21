/**
 * Pixel formula for hit boxes — independent of DOM font measurement.
 */
import { describe, expect, it } from 'vitest'

import {
  ASCII_PAD_X,
  ASCII_PAD_Y,
  hotspotStyle,
  measureMonoCellW,
} from './LiveAsciiPhone.js'

describe('hotspotStyle (px overlay formula)', () => {
  const cell = { cellW: 7.5, cellH: 13 }

  it('places (0,0) at pad origin', () => {
    const s = hotspotStyle({ row: 0, col: 0, width: 5, height: 1 }, cell)
    expect(s.left).toBe(ASCII_PAD_X)
    expect(s.top).toBe(ASCII_PAD_Y)
    expect(s.width).toBe(5 * 7.5)
    expect(s.height).toBe(13)
  })

  it('steps by cell size for row/col', () => {
    const s = hotspotStyle({ row: 4, col: 10, width: 3, height: 2 }, cell)
    expect(s.left).toBe(ASCII_PAD_X + 10 * 7.5)
    expect(s.top).toBe(ASCII_PAD_Y + 4 * 13)
    expect(s.width).toBe(3 * 7.5)
    expect(s.height).toBe(2 * 13)
  })

  it('matches dec/inc layout gap (no overlap in px)', () => {
    // paint places dec at col 0 w=5, gap=2, inc at col 7 w=5 when alone in hstack
    const dec = hotspotStyle({ row: 0, col: 0, width: 5, height: 1 }, cell)
    const inc = hotspotStyle({ row: 0, col: 7, width: 5, height: 1 }, cell)
    expect(dec.left + dec.width).toBeLessThanOrEqual(inc.left)
  })
})

describe('measureMonoCellW (layout space, not transformed)', () => {
  it('prefers canvas measureText (ignores CSS transform scale)', () => {
    const w = measureMonoCellW(12.5)
    // mono M at 12.5px is typically ~7–9px; never near 0
    expect(w).toBeGreaterThan(5)
    expect(w).toBeLessThan(15)
  })

  it('accepts a ruler with offsetWidth (layout box, not getBoundingClientRect)', () => {
    // Ruler is only used when canvas path is unavailable; still must not throw.
    const ruler = { offsetWidth: 75 } as HTMLElement
    const w = measureMonoCellW(12.5, 'monospace', ruler)
    expect(w).toBeGreaterThan(5)
    expect(w).toBeLessThan(15)
  })
})
