import { describe, expect, it } from 'vitest'

import { screenLook, screenStylesheet } from './screenStyles.js'

const ruleOf = (selector: string, from = 0): string => {
  const start = screenStylesheet.indexOf(`${selector} {`, from)
  return start < 0
    ? ''
    : screenStylesheet.slice(start, screenStylesheet.indexOf('}', start) + 1)
}

const darkAppearance = (): string => {
  const start = screenStylesheet.indexOf('@media (prefers-color-scheme: dark)')
  return start < 0 ? '' : screenStylesheet.slice(start, start + 900)
}

describe('the look of words read along with', () => {
  it('gives the words a reading column wider than a list, up to the window', () => {
    expect(screenLook.readingWidth).toBeGreaterThan(screenLook.listWidth)
    expect(ruleOf(':where(.fk-transcript)')).toContain(
      `width: min(100%, ${screenLook.readingWidth.toString()}px)`,
    )
  })

  it('sets the words in a large serif face, the time at the start of its paragraph', () => {
    expect(screenLook.readingFamily).toMatch(/serif$/)
    expect(screenLook.readingSize).toBeGreaterThanOrEqual(24)
    expect(ruleOf(':where(.fk-passage-words)')).toContain(
      `font-family: ${screenLook.readingFamily}`,
    )
    expect(ruleOf(':where(.fk-passage)')).toContain('display: block')
    expect(ruleOf(':where(.fk-passage-label)')).toContain('float: left')
  })

  it('sets the paragraph being read apart, and within it the words already spoken from those to come', () => {
    expect(ruleOf(':where(.fk-passage[data-current])')).toContain(
      'background: var(--fk-reading-current-ground)',
    )
    expect(ruleOf(':where(.fk-passage[data-current])')).toContain(
      'box-shadow: inset 3px 0 0 var(--fk-reading-rule)',
    )
    expect(ruleOf(':where(.fk-passage-words)')).toContain(
      'color: var(--fk-reading-rest)',
    )
    expect(
      ruleOf(':where(.fk-passage[data-current] .fk-passage-words)'),
    ).toContain('color: var(--fk-reading-text)')
    expect(
      ruleOf(
        ':where(.fk-passage[data-current] .fk-word[data-current] ~ .fk-word)',
      ),
    ).toContain('color: var(--fk-reading-rest)')
  })

  it('colors the word being spoken, the strongest mark on the page', () => {
    expect(ruleOf(':where(.fk-word[data-current])')).toContain(
      'color: var(--fk-reading-spoken)',
    )
  })

  it('marks a section with a rule at its left', () => {
    expect(ruleOf(':where(.fk-passage-heading)')).toContain(
      'border-left: 3px solid var(--fk-reading-rule)',
    )
  })

  it('reads on a light ground by default and on a dark one when the system appearance is dark', () => {
    expect(ruleOf(':where(.fk-transcript)')).toContain(
      `--fk-reading-text: ${screenLook.textColor}`,
    )
    expect(darkAppearance()).toContain(':where(.fk-transcript)')
    expect(darkAppearance()).toContain(
      `--fk-reading-ground: ${screenLook.readingDarkGround}`,
    )
    expect(darkAppearance()).toContain('--fk-reading-text: #ffffff')
  })
})
