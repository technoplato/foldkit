import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { bindChapters } from '../test/apps/chapterContents.js'
import { terminalInkOf } from '../theme/terminal.js'
import { makeProgramTerminalView } from './surface.js'
import { initialTerminalView, paintTerminal } from './terminalScreen.js'

const size = { view: 'tui', rows: '24', columns: '80' }

const escape = '\u001b['

// eslint-disable-next-line no-control-regex
const withoutInk = (text: string): string =>
  text.replace(/\u001b\[[0-9;]*m/g, '')

const inkOf = () => terminalInkOf({ isTerminal: true, env: {}, mode: 'Dark' })

describe('the live player in a terminal paints from the theme', () => {
  it('says the roles of its own lines: where it is, and the keys, rest', () => {
    const painted = paintTerminal(
      bindChapters(),
      'chapters',
      initialTerminalView,
      {
        rows: 24,
        columns: 80,
      },
    )
    expect(painted.inks.length).toBe(painted.lines.length)
    expect(painted.inks[0]).toEqual([
      { col: 0, width: (painted.lines[0] ?? '').length, role: 'QuietText' },
    ])
    expect(painted.inks.at(-1)).toEqual([
      { col: 0, width: (painted.lines.at(-1) ?? '').length, role: 'QuietText' },
    ])
  })

  it('inks a frame for a view that says its output takes color, from the ink the Program hands it', () => {
    const terminal = makeProgramTerminalView(
      bindChapters(),
      'chapters',
      {},
      inkOf,
    )
    const plain = Effect.runSync(terminal.paint({ ...size, viewId: 'plain' }))
    const inked = Effect.runSync(
      terminal.paint({ ...size, viewId: 'inked', color: '1' }),
    )
    expect(plain.stdout).not.toContain(escape)
    expect(inked.stdout).toContain(`${escape}2m`)
    expect(withoutInk(inked.stdout)).toBe(plain.stdout)
  })

  it('marks nothing up when the Program hands it no ink', () => {
    const terminal = makeProgramTerminalView(bindChapters(), 'chapters')
    const painted = Effect.runSync(
      terminal.paint({ ...size, viewId: 'inked', color: '1' }),
    )
    expect(painted.stdout).not.toContain(escape)
  })
})
