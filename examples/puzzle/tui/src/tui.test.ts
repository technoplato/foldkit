import { Option } from 'effect'
import { Program } from 'foldkit'
import { readFileSync } from 'node:fs'
import {
  GuessedNo,
  GuessedYes,
  type Message,
  ResetTape,
  SyncedPuzzle,
  demoModel,
  emptyModel,
  puzzleFactHandles,
  readyPuzzle,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { factHandleForKey, renderPuzzleScreen, tapForInput } from './client.js'

describe('Puzzle TUI', () => {
  it('paints Starting before Instant is ready', () => {
    const screen = renderPuzzleScreen(SyncedPuzzle.Starting())

    expect(screen).toContain('Starting Instant Puzzle')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('[ y ]')
  })

  it('paints Failed with the Instant error', () => {
    const screen = renderPuzzleScreen(
      SyncedPuzzle.Failed({
        error: SyncedPuzzle.TransportFailed({
          what: 'Instant did not return a snapshot.',
          meaning: 'This Processor could not start from Instant.',
          fix: 'Check the Instant app and try again.',
          cause:
            'Instant() needs INSTANT_APP_ADMIN_TOKEN in the trusted wrapper.',
        }),
      }),
    )

    expect(screen).toContain('INSTANT_APP_ADMIN_TOKEN')
    expect(screen).toContain('Cause:')
    expect(screen).not.toContain('TransportFailed')
    expect(screen).not.toContain('[S] sign in')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('[ y ]')
  })

  it('prints computer chrome around the product tree and hides yes on demo', () => {
    const screen = renderPuzzleScreen(readyPuzzle())

    expect(screen).not.toContain('Foldkit - TUI Puzzle')
    expect(screen).toContain('/puzzle')
    expect(screen).toContain('[ reset ]')
    expect(screen).toContain('https://puzzle.knophy.com')
    expect(screen).toContain('https://replicate.knophy.com')
    expect(screen).toContain('https://grok.knophy.com')
    expect(screen).not.toContain('[ y ]')
    expect(screen).toContain('[Q] quit')
    expect(screen).not.toContain('laptop')
    expect(screen).not.toContain('github.com')
  })

  it('prints yes from the product tree on an empty tape', () => {
    const screen = renderPuzzleScreen(readyPuzzle(emptyModel()))

    expect(screen).toContain('[ y ]')
    expect(screen).not.toContain('[ reset ]')
  })

  it('paints the Action menu when Open and keeps yes Hidden on demo', () => {
    const screen = renderPuzzleScreen(
      readyPuzzle(
        demoModel(),
        Program.Open({ focus: 0, maybeQuery: Option.none() }),
      ),
    )

    expect(screen).toContain('Actions')
    expect(screen).toContain('> [ y ] yes: prompt is the Operator flow')
    expect(screen).toContain('[ r ] reset')
    expect(screen).toContain('┌')
    expect(screen).toContain('[ reset ]')
    expect(screen.indexOf('Actions')).toBeLessThan(screen.indexOf('[ reset ]'))
  })

  it('paints named Empty when the Open filter matches nothing', () => {
    const screen = renderPuzzleScreen(
      readyPuzzle(
        emptyModel(),
        Program.Open({ focus: 0, maybeQuery: Option.some('zzz') }),
      ),
    )
    expect(screen).toContain('Empty')
    expect(screen).toContain('Actions  zzz')
    expect(screen).not.toContain('> [ y ] yes')
    expect(screen).not.toContain('> yes')
  })

  it('derives the keymap from the keys metadata', () => {
    const handles = puzzleFactHandles(demoModel(), () => {})

    expect(factHandleForKey('+', handles)._tag).toBe('Some')
    expect(factHandleForKey('=', handles)._tag).toBe('Some')
    expect(factHandleForKey('-', handles)._tag).toBe('Some')
    expect(factHandleForKey('R', handles)._tag).toBe('Some')
    expect(factHandleForKey('q', handles)).toEqual(Option.none())
    expect(factHandleForKey('x', handles)).toEqual(Option.none())
  })

  it('taps only Tappable handles for a keypress', () => {
    const sent: Array<Message> = []
    const send = (message: Message): void => {
      sent.push(message)
    }

    const atDemo = puzzleFactHandles(demoModel(), send)
    tapForInput('+', atDemo)
    tapForInput('=', atDemo)
    tapForInput('-', atDemo)
    tapForInput('R', atDemo)
    tapForInput('x', atDemo)
    expect(sent).toEqual([GuessedYes(), GuessedYes(), GuessedNo(), ResetTape()])

    const atEmpty = puzzleFactHandles(emptyModel(), send)
    tapForInput('R', atEmpty)
    expect(sent).toEqual([GuessedYes(), GuessedYes(), GuessedNo(), ResetTape()])
  })

  it('keeps Instant out of the TUI Client', () => {
    const viewSource = readFileSync('src/client.ts', 'utf8')
    expect(viewSource).toContain('handle.subscribe')
    expect(viewSource).toContain('handle.actions')
    expect(viewSource).toContain('Starting')
    expect(viewSource).toContain('Failed')
    expect(viewSource).toContain('Ready')
    expect(viewSource).toContain('describePuzzleSyncError')
    expect(viewSource).not.toContain('StartingWindow')
    expect(viewSource).not.toContain('FailedWindow')
    expect(viewSource).not.toContain('ReadyWindow')
    expect(viewSource).not.toContain('[S] sign in')
    expect(viewSource).not.toContain('@instantdb')
    expect(viewSource).not.toContain('@foldkit/instant')
    expect(viewSource).not.toContain('instantHost')
    expect(viewSource).not.toContain('store.send')
    expect(viewSource).not.toContain('store.observe')
    expect(viewSource).not.toContain('void Effect')
    expect(viewSource).not.toContain('Effect.orDie')
  })
})
