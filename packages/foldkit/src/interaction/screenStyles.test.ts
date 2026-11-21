import { describe, expect, it } from 'vitest'

import { defaultTheme, roleVar } from '../theme/theme.js'
import { screenLook, screenStylesheet } from './screenStyles.js'

const ruleOf = (selector: string, from = 0): string => {
  const start = screenStylesheet.indexOf(`${selector} {`, from)
  return start < 0
    ? ''
    : screenStylesheet.slice(start, screenStylesheet.indexOf('}', start) + 1)
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
      `background: ${roleVar('ReadingCurrentGround')}`,
    )
    expect(ruleOf(':where(.fk-passage[data-current])')).toContain(
      `box-shadow: inset 3px 0 0 ${roleVar('ReadingRule')}`,
    )
    expect(ruleOf(':where(.fk-passage-words)')).toContain(
      `color: ${roleVar('ReadingToCome')}`,
    )
    expect(
      ruleOf(':where(.fk-passage[data-current] .fk-passage-words)'),
    ).toContain(`color: ${roleVar('ReadingSpoken')}`)
    expect(
      ruleOf(
        ':where(.fk-passage[data-current] .fk-word[data-current] ~ .fk-word)',
      ),
    ).toContain(`color: ${roleVar('ReadingToCome')}`)
  })

  it('colors the word being spoken, the strongest mark on the page', () => {
    expect(ruleOf(':where(.fk-word[data-current])')).toContain(
      `color: ${roleVar('ReadingCurrentWord')}`,
    )
  })

  it('marks a section with a rule at its left', () => {
    expect(ruleOf(':where(.fk-passage-heading)')).toContain(
      `border-left: 3px solid ${roleVar('ReadingRule')}`,
    )
  })

  it('reads on the ground the theme gives the reader: clear in light, dark green to black in dark', () => {
    expect(ruleOf(':where(.fk-transcript)')).toContain(
      `background: ${roleVar('ReadingGround')}`,
    )
    expect(defaultTheme.ReadingGround.light).toBe('transparent')
    expect(defaultTheme.ReadingGround.dark).toMatch(/^linear-gradient/)
    expect(defaultTheme.ReadingSpoken.dark).toBe('#ffffff')
  })

  it('runs the reading ground edge to edge on a narrow window, so the words are not boxed in twice', () => {
    const narrow = screenStylesheet.slice(
      screenStylesheet.indexOf('@media (max-width: 560px)'),
    )
    const rule = narrow.slice(
      narrow.indexOf(':where(.fk-transcript) {'),
      narrow.indexOf('}', narrow.indexOf(':where(.fk-transcript) {')) + 1,
    )
    expect(rule).toContain('width: 100vw')
    expect(rule).toContain('border-radius: 0')
  })

  it('prevents double-tap page zoom on buttons, preserves Transcript text selection, and maps drag-axis claims', () => {
    expect(ruleOf(':where(.fk-button)')).toContain('touch-action: manipulation')
    const heldRule = ruleOf(':where([data-slot-held]:not(.fk-transcript))')
    expect(heldRule).toContain('-webkit-touch-callout: none')
    expect(heldRule).not.toContain('user-select: none')
    expect(ruleOf(":where([data-slot-drag='plane'])")).toContain(
      'touch-action: none',
    )
    expect(ruleOf(":where([data-slot-drag='horizontal'])")).toContain(
      'touch-action: pan-y',
    )
    expect(ruleOf(":where([data-slot-drag='vertical'])")).toContain(
      'touch-action: pan-x',
    )
    expect(ruleOf(':where(.fk-list-filter)')).toContain('1rem)')
  })
})
