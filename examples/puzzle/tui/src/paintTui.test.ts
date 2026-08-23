import { Option } from 'effect'
import {
  SyncedPuzzle,
  actionByToken,
  demoModel,
  emptyModel,
  puzzleFactHandles,
  puzzleScreen,
  readyPuzzle,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { factHandleForKey, renderPuzzleScreenWindow } from './client.js'
import { paintTui } from './paintTui.js'

const stripAnsi = (painted: string): string =>
  painted.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

const keysForToken = (token: string): ReadonlyArray<string> => {
  const action = actionByToken(token)
  if (action === undefined) {
    return []
  }
  return action.keys ?? []
}

describe('paintTui', () => {
  it('paints Buttons with key hints from the Action keys metadata', () => {
    const painted = stripAnsi(
      paintTui(puzzleScreen(emptyModel()), { keysForToken }),
    )

    expect(painted).toContain('/puzzle#next')
    expect(painted).toContain('https://puzzle.knophy.com')
    expect(painted).toContain('https://replicate.knophy.com')
    expect(painted).toContain('https://grok.knophy.com')
    expect(painted).toContain('[y] yes')
    expect(painted).toContain('[n] no')
    expect(painted).toContain('[h] hint')
    expect(painted).toContain('[o] operator')
    expect(painted).toContain('[replicate] replicate')
    expect(painted).not.toContain('github.com')
  })

  it('paints reset with its key hint on the demo tape', () => {
    const painted = stripAnsi(
      paintTui(puzzleScreen(demoModel()), { keysForToken }),
    )

    expect(painted).toContain('[r] reset')
    expect(painted).toContain('https://puzzle.knophy.com/replicate.sh')
    expect(painted).not.toContain('[y] yes')
  })

  it('hides reset from the screen window on an empty tape', () => {
    const window = stripAnsi(
      renderPuzzleScreenWindow(readyPuzzle(emptyModel())),
    )

    expect(window).not.toContain('Foldkit - TUI screen Puzzle')
    expect(window).toContain('/puzzle#next')
    expect(window).toContain('[y] yes')
    expect(window).toContain('[n] no')
    expect(window).not.toContain('[r] reset')
    expect(window).toContain('[Q] quit')
  })

  it('shows reset in the screen window on the demo tape', () => {
    const window = stripAnsi(renderPuzzleScreenWindow(readyPuzzle()))

    expect(window).toContain('[r] reset')
    expect(window).toContain('https://puzzle.knophy.com')
  })

  it('paints the init screen while Starting, like the React default window', () => {
    const window = stripAnsi(renderPuzzleScreenWindow(SyncedPuzzle.Starting()))

    expect(window).toContain('[r] reset')
    expect(window).toContain('https://puzzle.knophy.com/replicate.sh')
    expect(window).not.toContain('[y] yes')
  })

  it('agrees with the derived keymap on every painted hint', () => {
    const handles = puzzleFactHandles(emptyModel(), () => {})
    const painted = stripAnsi(
      paintTui(puzzleScreen(emptyModel()), { keysForToken }),
    )
    const hints = [...painted.matchAll(/\[([^\]]+)\] \w/g)].map(
      match => match[1],
    )

    expect(hints).toEqual(['y', 'n', 'h', 'o', 'replicate'])
    for (const hint of ['y', 'n', 'h', 'o']) {
      expect(Option.isSome(factHandleForKey(hint, handles))).toBe(true)
    }
  })
})
