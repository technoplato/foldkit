import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { terminalWidth } from '../cli/layout.js'
import { bindCounter } from '../test/apps/catalogCounter.js'
import { keyInput } from './interaction.js'
import {
  pressTerminalKey,
  terminalFooterOf,
  terminalLineText,
  terminalMenuLines,
} from './terminal.js'

const menuOf = (bound: ReturnType<typeof bindCounter>) =>
  Option.getOrThrow(bound.menu())

describe('terminalMenuLines', () => {
  it('lays the menu out in aligned columns, highlighted row marked', () => {
    const bound = bindCounter(2)
    bound.openMenu()
    bound.typeInMenu('res')
    expect(
      Array.from(terminalMenuLines(menuOf(bound)), terminalLineText),
    ).toEqual([
      'Actions  Search actions: "res"',
      '  > Reset     r     Sets the count to 0',
      '  [↑↓] move  [↵] run  [esc] close',
    ])
  })

  it('marks matched letters and lets only enabled rows choose', () => {
    const bound = bindCounter(0)
    bound.openMenu()
    bound.typeInMenu('re')
    const lines = terminalMenuLines(menuOf(bound))
    const resetLine = Option.getOrThrow(
      Option.fromNullishOr(
        lines.find(line => terminalLineText(line).includes('Reset')),
      ),
    )
    expect(resetLine.runs.some(run => run.tone === 'Match')).toBe(true)
    expect(resetLine.maybeChoice).toEqual(Option.none())
    expect(
      lines.some(line =>
        terminalLineText(line).includes('Unavailable: count is already 0'),
      ),
    ).toBe(true)
  })

  it('wraps a long description under itself to the width it is given', () => {
    const bound = bindCounter(2)
    bound.openMenu()
    const narrow = 45
    const lines = Array.from(
      terminalMenuLines(menuOf(bound), narrow),
      terminalLineText,
    )
    expect(lines.every(line => line.length <= narrow)).toBe(true)
    expect(lines.join('\n')).toContain('Increments the count by')
    expect(lines.some(line => line.trim() === 'one')).toBe(true)
    expect(
      Array.from(terminalMenuLines(menuOf(bound)), terminalLineText).every(
        line => line.length <= terminalWidth,
      ),
    ).toBe(true)
  })
})

describe('pressTerminalKey', () => {
  it('lets the Program take a key first, then quits on q', () => {
    const bound = bindCounter()
    expect(pressTerminalKey(bound, keyInput('+'))).toBe('Handled')
    expect(bound.readModel().count).toBe(1)
    expect(pressTerminalKey(bound, keyInput('z'))).toBe('Ignored')
    expect(pressTerminalKey(bound, keyInput('q'))).toBe('Quit')
  })

  it('types q into the open menu instead of quitting', () => {
    const bound = bindCounter()
    bound.openMenu()
    expect(pressTerminalKey(bound, keyInput('q'))).toBe('Handled')
    expect(Option.map(bound.menu(), menu => menu.query)).toEqual(
      Option.some('q'),
    )
  })
})

describe('terminalFooterOf', () => {
  it('names how to move and press, the menu key, then how to quit', () => {
    expect(terminalFooterOf(bindCounter().menuKeys())).toBe(
      '[↑↓←→] move  [↵] press  [?] actions  [q] quit',
    )
    expect(terminalFooterOf([])).toBe('[↑↓←→] move  [↵] press  [q] quit')
  })
})
