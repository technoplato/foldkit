import { describe, expect, it } from 'vitest'

import { screenLook, screenStylesheet } from './screenStyles.js'

const ruleOf = (selector: string): string => {
  const start = screenStylesheet.indexOf(`${selector} {`)
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

  it('sets the paragraph being read apart: it is at full strength on a stronger ground with a rule beside it, the others rest', () => {
    expect(screenLook.currentPassageColor).not.toBe(screenLook.rowHoverColor)
    expect(ruleOf(':where(.fk-passage[data-current])')).toContain(
      `background: ${screenLook.currentPassageColor}`,
    )
    expect(ruleOf(':where(.fk-passage[data-current])')).toContain(
      `box-shadow: inset 3px 0 0 ${screenLook.accentColor}`,
    )
    expect(ruleOf(':where(.fk-passage-words)')).toContain(
      `color: ${screenLook.restingWordsColor}`,
    )
    expect(
      ruleOf(':where(.fk-passage[data-current] .fk-passage-words)'),
    ).toContain(`color: ${screenLook.textColor}`)
  })

  it('keeps the word being spoken the strongest mark on the page', () => {
    expect(ruleOf(':where(.fk-word[data-current])')).toContain(
      `background: ${screenLook.accentSoftColor}`,
    )
  })
})
