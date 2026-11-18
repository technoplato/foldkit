import { describe, expect, it } from 'vitest'

import { readAlongStylesOf } from './readAlongStyles.js'
import { screenLook, screenStylesheet } from './screenStyles.js'

const ruleOf = (selector: string): string => {
  const start = screenStylesheet.indexOf(`${selector} {`)
  return start < 0
    ? ''
    : screenStylesheet.slice(start, screenStylesheet.indexOf('}', start) + 1)
}

describe('the look of what a search found', () => {
  it('sets a found word apart with a ground made from the reader’s own rule color, in either appearance', () => {
    const found = ruleOf(':where(.fk-word[data-mark])')
    expect(found).toContain(
      'background: color-mix(in srgb, var(--fk-reading-rule) 24%, transparent)',
    )
    expect(found).toContain('color: var(--fk-reading-text)')
  })

  it('sets the match a person is on apart from the rest with a ring, not only a stronger color', () => {
    expect(ruleOf(":where(.fk-word[data-mark='Selected'])")).toContain(
      'box-shadow: 0 0 0 2px var(--fk-reading-rule)',
    )
  })
})

describe('the look of the reader’s own buttons', () => {
  it('makes Back to playhead and Search pills that sit centered above the controls', () => {
    const pill = ruleOf(":where(.fk-button[data-variant='Pill'])")
    expect(pill).toContain('border-radius: 999px')
    expect(pill).toContain(`color: ${screenLook.textColor}`)
    expect(
      ruleOf(":where(.fk-dock .fk-row:has(> .fk-button[data-variant='Pill']))"),
    ).toContain('justify-content: center')
  })
})

describe('the look of a search by the words', () => {
  it('lets the matches scroll in their own space, so the controls under them stay in view', () => {
    const matches = ruleOf(':where(.fk-dock .fk-column > .fk-list)')
    expect(matches).toContain('max-height: 34dvh')
    expect(matches).toContain('overflow-y: auto')
  })

  it('gives the field the room in its row', () => {
    expect(
      ruleOf(':where(.fk-dock .fk-row:has(.fk-text-input) .fk-text-input)'),
    ).toContain('flex: 1')
  })
})

describe('the look of a word’s menu and of where a drag lands', () => {
  it('floats the menu above the page and a sheet under it to catch a press outside', () => {
    expect(ruleOf(':where(.fk-word-menu)')).toContain('position: fixed')
    expect(ruleOf(':where(.fk-word-menu-backdrop)')).toContain('inset: 0')
    expect(ruleOf(':where(.fk-word-menu-item)')).toContain('min-height: 44px')
  })

  it('shows where a drag will land above the dock, and never takes the pointer', () => {
    const landing = ruleOf(':where(.fk-dock .fk-seek-landing)')
    expect(landing).toContain('position: absolute')
    expect(landing).toContain('bottom: calc(100% + 10px)')
    expect(landing).toContain('pointer-events: none')
  })

  it('names no color of its own: every color is a token of the shared look or a reader variable', () => {
    const own = readAlongStylesOf(screenLook)
    const withoutTokens = own
      .replaceAll(screenLook.textColor, '')
      .replaceAll(screenLook.panelColor, '')
      .replaceAll(screenLook.trackColor, '')
      .replaceAll(screenLook.rowHoverColor, '')
      .replaceAll(screenLook.dimColor, '')
    expect(screenStylesheet).toContain(own)
    expect(withoutTokens).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/u)
  })
})
