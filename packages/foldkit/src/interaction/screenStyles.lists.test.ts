import { describe, expect, it } from 'vitest'

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
    expect(ruleOf(':where(.fk-item[data-current])')).toContain(
      `box-shadow: inset 3px 0 0 ${screenLook.accentColor}`,
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
