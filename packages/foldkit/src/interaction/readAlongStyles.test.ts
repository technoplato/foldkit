import { describe, expect, it } from 'vitest'

import { defaultTheme, roleVar, themeStylesheet } from '../theme/theme.js'
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
      `background: color-mix(in srgb, ${roleVar('ReadingRule')} 24%, transparent)`,
    )
    expect(found).toContain(`color: ${roleVar('ReadingSpoken')}`)
  })

  it('sets the match a person is on apart from the rest with a ring, not only a stronger color', () => {
    expect(ruleOf(":where(.fk-word[data-mark='Selected'])")).toContain(
      `box-shadow: 0 0 0 2px ${roleVar('ReadingRule')}`,
    )
  })
})

describe('the look of the word whose menu is open', () => {
  it('rings the word, so the menu is seen to belong to it', () => {
    expect(ruleOf(":where(.fk-word[data-mark='Picked'])")).toContain(
      `box-shadow: 0 0 0 2px ${roleVar('ReadingToCome')}`,
    )
  })
})

describe('the look of the reader’s own buttons', () => {
  it('makes Back to Playhead and Search pills that sit centered above the controls', () => {
    const pill = ruleOf(":where(.fk-button[data-variant='Pill'])")
    expect(pill).toContain('border-radius: 999px')
    expect(pill).toContain(`color: ${roleVar('Text')}`)
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

  it('lets a match run to two lines, and takes less of a small screen', () => {
    expect(
      ruleOf(':where(.fk-dock .fk-column > .fk-list .fk-item-title)'),
    ).toContain('-webkit-line-clamp: 2')
    expect(screenStylesheet).toContain('max-height: 24dvh')
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

  it('names roles and never a color of its own, so it follows light and dark with the rest', () => {
    const own = readAlongStylesOf(screenLook)
    expect(screenStylesheet).toContain(own)
    expect(own).toContain(roleVar('RaisedSurface'))
    expect(own).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![-\w])(?:white|black|red|blue|green|gray|grey|orange)(?![-\w])/u,
    )
    expect(own).not.toContain('prefers-color-scheme')
    const declared = themeStylesheet(defaultTheme)
    const used = Array.from(
      own.matchAll(/var\((--fk-[a-z-]+)\)/gu),
      match => match[1] ?? '',
    )
    expect(used.length).toBeGreaterThan(10)
    expect(used.filter(name => !declared.includes(`${name}:`))).toEqual([])
  })
})
