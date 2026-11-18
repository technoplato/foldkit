import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { keyInput } from '../interaction/interaction.js'
import { pressTerminalKeyAt } from '../interaction/terminalFocus.js'
import { Link } from '../navigation/message.js'
import { bindChapters } from '../test/apps/chapterContents.js'
import {
  type TerminalSize,
  type TerminalView,
  initialTerminalView,
  paintTerminal,
} from './terminalScreen.js'

const size: TerminalSize = { rows: 24, columns: 80 }

const footer = '[↑↓←→] move  [↵] press  [?] actions  [q] quit'

type Bound = ReturnType<typeof bindChapters>

const pressed = (
  bound: Bound,
  view: TerminalView,
  keys: ReadonlyArray<string>,
): TerminalView =>
  Array.reduce(keys, view, (current, key) => {
    const next = pressTerminalKeyAt(bound, keyInput(key), current.focus)
    return paintTerminal(
      bound,
      'chapters',
      { ...current, focus: next.focus },
      size,
    ).view
  })

const linesOf = (bound: Bound, view: TerminalView) =>
  paintTerminal(bound, 'chapters', view, size).lines

describe('paintTerminal', () => {
  it('fits the terminal, with the dock and key hints at the bottom', () => {
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    const lines = linesOf(bound, initialTerminalView)
    expect(lines).toHaveLength(size.rows)
    expect(Array.head(lines)).toEqual(
      Option.some('chapters  /chapters/contents'),
    )
    expect(Array.last(lines)).toEqual(Option.some(footer))
    expect(lines.some(line => line.includes('[ Next ]'))).toBe(true)
    expect(lines.every(line => line.length <= size.columns)).toBe(true)
  })

  it('scrolls 114 chapters to the highlight, saying how many are hidden', () => {
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    const opened = paintTerminal(
      bound,
      'chapters',
      initialTerminalView,
      size,
    ).view
    const moved = pressed(
      bound,
      opened,
      Array.makeBy(60, () => 'ArrowDown'),
    )
    const lines = linesOf(bound, moved)
    expect(lines).toHaveLength(size.rows)
    expect(lines.some(line => line.startsWith('› Chapter 62'))).toBe(true)
    expect(lines.some(line => /↑ \d+ more lines/.test(line))).toBe(true)
    expect(lines.some(line => /↓ \d+ more lines/.test(line))).toBe(true)
    expect(Array.last(lines)).toEqual(Option.some(footer))
  })

  it('opens the contents on the chapter after the one playing', () => {
    const bound = bindChapters()
    bound.press('JumpToChapter:80')
    bound.openUri('/chapters/contents', Link())
    const lines = linesOf(bound, initialTerminalView)
    expect(lines.some(line => line.startsWith('• Chapter 80'))).toBe(true)
    expect(lines.some(line => line.startsWith('› Chapter 81'))).toBe(true)
  })

  it('keeps the scroll while the Model changes under it', () => {
    const bound = bindChapters()
    bound.openUri('/chapters/contents', Link())
    const moved = pressed(
      bound,
      initialTerminalView,
      Array.makeBy(40, () => 'ArrowDown'),
    )
    const before = linesOf(bound, moved)
    bound.send({ _tag: 'Ticked' })
    const after = linesOf(bound, moved)
    expect(after).toEqual(before)
  })
})
