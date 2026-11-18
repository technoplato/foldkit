import { describe, expect, it } from 'vitest'

import { roleVar } from '../theme/theme.js'
import { screenLook, screenStylesheet } from './screenStyles.js'

const ruleOf = (selector: string, from = 0): string => {
  const start = screenStylesheet.indexOf(`${selector} {`, from)
  return start < 0
    ? ''
    : screenStylesheet.slice(start, screenStylesheet.indexOf('}', start) + 1)
}

const dockedDrawer = (): string => {
  const start = screenStylesheet.indexOf(
    `@media (min-width: ${screenLook.drawerDockWidth.toString()}px)`,
  )
  return start < 0 ? '' : screenStylesheet.slice(start, start + 1400)
}

describe('the look of a list with columns', () => {
  it('lines the columns up: each the same width, figures of one width, set to the right', () => {
    const column = ruleOf(':where(.fk-item-column, .fk-list-head-column)')
    expect(column).toContain(
      `flex: 0 0 ${screenLook.listColumnWidth.toString()}px`,
    )
    expect(column).toContain('font-variant-numeric: tabular-nums')
    expect(column).toContain('text-align: right')
  })

  it('keeps the field that narrows the list and the column names in view while the rows scroll', () => {
    expect(ruleOf(':where(.fk-list-head)')).toContain('position: sticky')
  })

  it('marks the row being read with a rule at its side, not only a color', () => {
    expect(ruleOf(':where(.fk-list-frame .fk-item[data-current])')).toContain(
      `box-shadow: inset 3px 0 0 ${roleVar('Accent')}`,
    )
  })
})

describe('the look of a drawer', () => {
  it('fills its edge of the window from top to bottom', () => {
    const panel = ruleOf(":where(.fk-overlay[data-style='Drawer'] > *)")
    expect(panel).toContain('height: 100dvh')
    expect(panel).toContain(
      `width: min(88vw, ${screenLook.drawerWidth.toString()}px)`,
    )
    expect(
      ruleOf(":where(.fk-overlay[data-style='Drawer'][data-side='Left'])"),
    ).toContain('justify-content: flex-start')
  })

  it('sits beside the page on a wide window: no dimming, the page stays in reach and makes room', () => {
    const docked = dockedDrawer()
    expect(docked).toContain('background: none')
    expect(docked).toContain('pointer-events: none')
    expect(docked).toContain('pointer-events: auto')
    expect(docked).toContain(
      `padding-left: ${screenLook.drawerWidth.toString()}px`,
    )
  })
})

describe('the look of a picker bar over words read along with', () => {
  it('stays at the top of the reader as one rounded bar', () => {
    const bar = ruleOf(':where(.fk-list:has(+ .fk-transcript))')
    expect(bar).toContain('position: sticky')
    expect(bar).toContain(
      `width: min(100%, ${screenLook.readingWidth.toString()}px)`,
    )
  })
})

describe('the look of a list in groups, and of a badge', () => {
  it('heads a group in small quiet capitals, its count at the end of the line', () => {
    const group = ruleOf(':where(.fk-list-group)')
    expect(group).toContain('justify-content: space-between')
    expect(group).toContain(`color: ${roleVar('QuietText')}`)
    expect(group).toContain('text-transform: uppercase')
  })

  it('draws a badge as a small pill in the colors of a person’s own mark', () => {
    const badge = ruleOf(':where(.fk-item-badge)')
    expect(badge).toContain(`background: ${roleVar('MarkSoft')}`)
    expect(badge).toContain(`color: ${roleVar('Mark')}`)
    expect(badge).toContain('border-radius: 999px')
  })
})

describe('the look of a mark in words read along with', () => {
  it('underlines the marked word in the soft color of a person’s own mark', () => {
    expect(ruleOf(':where(.fk-word[data-mark])')).toContain(roleVar('MarkSoft'))
  })

  it('sets the mark in the margin at the word’s own line, as a ribbon', () => {
    const mark = ruleOf(':where(.fk-word-mark)')
    expect(mark).toContain('position: absolute')
    expect(mark).toContain(`background: ${roleVar('Mark')}`)
    expect(mark).toContain('clip-path: polygon')
    expect(ruleOf(':where(.fk-passage)')).toContain('position: relative')
  })

  it('writes the note under its paragraph in the mark’s color', () => {
    expect(ruleOf(':where(.fk-passage-note)')).toContain(
      `color: ${roleVar('Mark')}`,
    )
  })
})
