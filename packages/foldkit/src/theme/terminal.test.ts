import { describe, expect, it } from 'vitest'

import { inked, terminalInkOf } from './terminal.js'

const escape = '\u001b['

describe('the theme in a terminal', () => {
  const ink = terminalInkOf({ isTerminal: true, env: {}, mode: 'Dark' })

  it('paints the color of a role from the theme, in the mode it is told', () => {
    expect(inked(ink, 'ReadingCurrentWord', 'lamp')).toBe(
      `${escape}38;2;157;184;255mlamp${escape}39m`,
    )
    expect(
      inked(
        terminalInkOf({ isTerminal: true, env: {}, mode: 'Light' }),
        'ReadingCurrentWord',
        'lamp',
      ),
    ).toBe(`${escape}38;2;194;65;12mlamp${escape}39m`)
  })

  it('keeps body text in the color the terminal has: strong for what stands out, dim for what rests', () => {
    expect(inked(ink, 'ReadingSpoken', 'He trimmed')).toBe(
      `${escape}1mHe trimmed${escape}22m`,
    )
    expect(inked(ink, 'ReadingToCome', 'slow and patient')).toBe(
      `${escape}2mslow and patient${escape}22m`,
    )
    expect(inked(ink, 'QuietText', '0:21')).toBe(`${escape}2m0:21${escape}22m`)
  })

  it('leaves text alone for a role that is not one flat color', () => {
    expect(inked(ink, 'ReadingGround', 'words')).toBe('words')
  })

  it('paints nothing when the output is not a terminal, or color is refused', () => {
    const piped = terminalInkOf({ isTerminal: false, env: {}, mode: 'Dark' })
    expect(inked(piped, 'ReadingCurrentWord', 'lamp')).toBe('lamp')
    const refused = terminalInkOf({
      isTerminal: true,
      env: { NO_COLOR: '1' },
      mode: 'Dark',
    })
    expect(inked(refused, 'Accent', 'lamp')).toBe('lamp')
    const dumb = terminalInkOf({
      isTerminal: true,
      env: { TERM: 'dumb' },
      mode: 'Dark',
    })
    expect(inked(dumb, 'Accent', 'lamp')).toBe('lamp')
  })
})
