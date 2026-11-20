import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { keyInput } from '../interaction/interaction.js'
import { pressTerminalKeyAt } from '../interaction/terminalFocus.js'
import { Link } from '../navigation/message.js'
import {
  Button,
  Column,
  Dock,
  List,
  Toolbar,
  Transcript,
} from '../renderers/elements.js'
import { bindChapters } from '../test/apps/chapterContents.js'
import { displayWidth } from './frameWriter.js'
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

  it('truncates lines containing wide CJK and emoji glyphs by display width', () => {
    const bound = bindChapters()
    const painted = paintTerminal(
      bound,
      '日本語テスト😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀',
      initialTerminalView,
      { rows: 10, columns: 40 },
    )
    expect(displayWidth(painted.lines[0] ?? '')).toBeLessThanOrEqual(40)
  })

  it('reproduces before/04-player-focus-lost: keeps focused dock toolbar buttons visible on screen at every step', () => {
    const passages = Array.makeBy(15, index => ({
      key: `p-${index}`,
      label: `1:0${Math.floor(index / 6)}:${((index % 6) * 10).toString().padStart(2, '0')}`,
      isCurrent: index === 7,
      words: [
        { token: `w-${index}-a`, text: `Passage${index}` },
        {
          token: `w-${index}-b`,
          text: 'spoken',
          ...(index === 7 ? { isCurrent: true } : {}),
        },
      ],
    }))
    const playerNode = Column(
      { gap: 1 },
      Button({ label: 'Back', action: 'Back' }),
      List({
        label: 'Chapter',
        items: [
          {
            key: 'ch',
            title: 'The Tide',
            lines: ['Chapter 1 of 4'],
            action: 'ShowContents',
            trailing: [Button({ label: 'Chapters', action: 'ShowContents' })],
          },
        ],
      }),
      Transcript({
        label: 'Words',
        action: 'SeekToWord',
        emptyText: 'No words.',
        passages,
      }),
      Dock(
        Toolbar({
          start: [
            List({
              label: 'Player',
              items: [
                {
                  key: 'bar',
                  title: 'The Tide',
                  lines: ['1h 19m left'],
                  action: 'ExpandControls',
                },
              ],
            }),
          ],
          center: [
            Button({ label: 'Skip back', action: 'SkipBack' }),
            Button({ label: 'Pause', action: 'Pause' }),
            Button({ label: 'Search', action: 'ShowSearch' }),
          ],
          end: [Button({ label: 'Expand', action: 'ExpandControls' })],
        }),
      ),
    )
    const base = bindChapters()
    const bound: Bound = {
      ...base,
      navigation: () =>
        Option.some({
          uri: '/books/lantern/listen/1m00s',
          history: 'Push',
          entries: [
            {
              key: '/books/lantern/listen/1m00s',
              identity: '/books/lantern/listen/0s',
              uri: '/books/lantern/listen/1m00s',
              destination: undefined,
              maybeTitle: Option.some('The Lantern Keeper'),
              maybeStyle: Option.none(),
              isTab: false,
            },
          ],
        }),
      viewAt: () => Option.some({ _tag: 'Screen', node: playerNode }),
      screen: () => Option.some(playerNode),
      menu: () => Option.none(),
    }

    // Calm reader: only passages 6, 7, 8 (via transcriptExcerptOf) should appear, not passage 0 or 14.
    const initial = paintTerminal(bound, 'books', initialTerminalView, {
      rows: 24,
      columns: 80,
    })
    const initialText = initial.lines.join('\n')
    expect(initialText).toContain('Passage6')
    expect(initialText).toContain('Passage7')
    expect(initialText).toContain('Passage8')
    expect(initialText).not.toContain('Passage0')
    expect(initialText).not.toContain('Passage14')

    // Stepping Tab/Right through EVERY control (including dock toolbar center & end)
    // must keep the focused control visibly rendered with a Focus ink and plain marker.
    let currentView = initial.view
    for (let step = 0; step < 8; step += 1) {
      const next = pressTerminalKeyAt(
        bound,
        keyInput('ArrowRight'),
        currentView.focus,
      )
      const painted = paintTerminal(
        bound,
        'books',
        { ...currentView, focus: next.focus },
        { rows: 24, columns: 80 },
      )
      currentView = painted.view
      const hasFocusInk = painted.inks.some(runs =>
        runs.some(run => run.role === 'Focus'),
      )
      const hasFocusMarker = painted.lines.some(
        line => line.includes('[>') || line.includes('› '),
      )
      expect(
        hasFocusInk,
        `step ${step}: focus ink missing:\n${painted.lines.join('\n')}`,
      ).toBe(true)
      expect(
        hasFocusMarker,
        `step ${step}: plain focus marker missing:\n${painted.lines.join('\n')}`,
      ).toBe(true)
    }
  })

  it('pins a 2-line host header when headerOf is supplied', () => {
    const bound = bindChapters()
    const painted = paintTerminal(
      bound,
      'books',
      initialTerminalView,
      { rows: 12, columns: 80 },
      () => [
        { text: 'The Lantern Keeper', isEmphasis: true },
        { text: 'The Tide · 0:49 of 1:20:00 · playing' },
      ],
    )
    expect(painted.lines).toHaveLength(12)
    expect(painted.lines[0]).toBe('The Lantern Keeper')
    expect(painted.inks[0]).toEqual([
      { col: 0, width: 'The Lantern Keeper'.length, role: 'Text' },
    ])
    expect(painted.lines[1]).toBe('The Tide · 0:49 of 1:20:00 · playing')
    expect(painted.inks[1]).toEqual([
      {
        col: 0,
        width: 'The Tide · 0:49 of 1:20:00 · playing'.length,
        role: 'QuietText',
      },
    ])
  })

  it('highlights the active action menu row with Focus ink as soon as the menu opens', () => {
    const bound = bindChapters()
    pressTerminalKeyAt(bound, keyInput('?'), initialTerminalView.focus)
    const painted = paintTerminal(bound, 'chapters', initialTerminalView, size)
    const focusedRowIndex = painted.lines.findIndex(line =>
      line.trimStart().startsWith('> '),
    )
    expect(focusedRowIndex).toBeGreaterThan(-1)
    expect(
      painted.inks[focusedRowIndex]?.some(run => run.role === 'Focus'),
    ).toBe(true)
  })
})
