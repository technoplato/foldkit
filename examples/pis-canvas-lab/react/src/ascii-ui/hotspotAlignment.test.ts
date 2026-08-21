/**
 * Automatic hotspot tests (no browser paint required).
 *
 * For every layout button, the painted line slice at (row, col, width)
 * must equal the button glyph. That is the contract LiveAsciiPhone uses
 * for hit boxes — if this fails, touch targets cannot match glyphs.
 */
import { describe, expect, it } from 'vitest'

import { Button, HStack, Phone, Text, VStack } from './elements.js'
import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import { renderAscii } from './render.js'
import type { AsciiHotspot, LayoutBox, UiNode } from './types.js'

const collectButtons = (box: LayoutBox): LayoutBox[] => {
  const out: LayoutBox[] = []
  const walk = (b: LayoutBox) => {
    if (b.kind === 'button' && b.action) out.push(b)
    for (const c of b.children) walk(c)
  }
  walk(box)
  return out
}

/** Slice painted lines at a hotspot (logical cell grid). */
export const glyphUnderHotspot = (
  lines: string[],
  h: Pick<AsciiHotspot, 'row' | 'col' | 'width' | 'height'>,
): string => {
  const row = lines[h.row] ?? ''
  return row.slice(h.col, h.col + h.width)
}

describe('ascii hotspot alignment (layout ↔ paint)', () => {
  it('every button hotspot covers its exact painted glyph', () => {
    const tree: UiNode = Phone(
      { cols: 28, title: 'Detail' },
      VStack(
        { gap: 0 },
        Button({
          label: '< Back',
          onPress: () => {},
          action: { _tag: 'back' },
        }),
        Text('  counter-2'),
        Text('       0'),
        HStack(
          { gap: 2 },
          Button({
            label: '-',
            onPress: () => {},
            action: { _tag: 'dec', counterId: 'counter-2' },
          }),
          Button({
            label: '+',
            onPress: () => {},
            action: { _tag: 'inc', counterId: 'counter-2' },
          }),
        ),
        HStack(
          { gap: 1 },
          Button({
            label: 'Reset',
            onPress: () => {},
            action: { _tag: 'reset', counterId: 'counter-2' },
          }),
          Button({
            label: 'Delete',
            onPress: () => {},
            action: { _tag: 'delete' },
          }),
        ),
      ),
    )

    const laid = layoutTree(tree)
    const frame = paintAscii(laid)
    const buttons = collectButtons(laid)

    expect(buttons.length).toBeGreaterThanOrEqual(5)
    expect(frame.hotspots.length).toBe(buttons.length)

    for (const btn of buttons) {
      const hs = frame.hotspots.find(h => h.id === btn.id)
      expect(hs, `hotspot for ${btn.id}`).toBeDefined()
      expect(hs!.row).toBe(btn.y)
      expect(hs!.col).toBe(btn.x)
      expect(hs!.width).toBe(btn.w)
      expect(hs!.height).toBe(btn.h)

      const under = glyphUnderHotspot(frame.lines, hs!)
      expect(under).toBe(btn.text)
      // Glyph is ASCII button chrome: [ label ]
      expect(under.startsWith('[')).toBe(true)
      expect(under.endsWith(']')).toBe(true)
    }
  })

  it('dec/inc buttons are separate hotspots with correct labels', () => {
    const frame = renderAscii(
      HStack(
        { gap: 2 },
        Button({
          label: '-',
          onPress: () => {},
          action: { _tag: 'dec', counterId: 'a' },
        }),
        Button({
          label: '+',
          onPress: () => {},
          action: { _tag: 'inc', counterId: 'a' },
        }),
      ),
    )

    expect(frame.hotspots).toHaveLength(2)
    const [dec, inc] = frame.hotspots
    expect(glyphUnderHotspot(frame.lines, dec!)).toBe('[ - ]')
    expect(glyphUnderHotspot(frame.lines, inc!)).toBe('[ + ]')
    // not overlapping columns
    expect(dec!.col + dec!.width).toBeLessThanOrEqual(inc!.col)
  })

  it('phone uses ASCII borders only (no fullwidth / emoji cells)', () => {
    const frame = renderAscii(Phone({ cols: 20, title: 'T' }, Text('hello')))
    const joined = frame.lines.join('')
    expect(joined).not.toMatch(/[┌┐└┘─│⚡←−]/)
    expect(frame.lines[0]?.startsWith('+')).toBe(true)
  })
})
