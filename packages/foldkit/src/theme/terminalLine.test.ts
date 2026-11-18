import { describe, expect, it } from 'vitest'

import { inkedLine, terminalInkOf } from './terminal.js'

const escape = '\u001b['

// Made-up words: nothing here is from a real recording or book.
describe('a line of a terminal screen, inked by the roles its parts play', () => {
  const ink = terminalInkOf({ isTerminal: true, env: {}, mode: 'Dark' })
  const line = '›0:35   He [trimmed] the wick'

  it('paints each part in its role and leaves the rest as the terminal has it', () => {
    expect(
      inkedLine(ink, line, [
        { col: 0, width: 5, role: 'QuietText' },
        { col: 8, width: 2, role: 'ReadingSpoken' },
        { col: 11, width: 9, role: 'ReadingCurrentWord' },
        { col: 21, width: 8, role: 'ReadingToCome' },
      ]),
    ).toBe(
      `${escape}2m›0:35${escape}22m   ${escape}1mHe${escape}22m ${escape}38;2;157;184;255m[trimmed]${escape}39m ${escape}2mthe wick${escape}22m`,
    )
  })

  it('takes the parts in any order and stops a part at the end of the line', () => {
    expect(
      inkedLine(ink, 'lamp', [
        { col: 2, width: 40, role: 'ReadingToCome' },
        { col: 0, width: 2, role: 'ReadingSpoken' },
        { col: 9, width: 3, role: 'Accent' },
      ]),
    ).toBe(`${escape}1mla${escape}22m${escape}2mmp${escape}22m`)
  })

  it('marks nothing up for an ink with no color', () => {
    const piped = terminalInkOf({ isTerminal: false, env: {}, mode: 'Dark' })
    expect(
      inkedLine(piped, line, [{ col: 11, width: 9, role: 'Accent' }]),
    ).toBe(line)
  })
})
