import { describe, expect, it } from 'bun:test'
import { Processor, Program } from 'foldkit'
import { readFileSync } from 'node:fs'
import {
  GuessedNo,
  GuessedYes,
  type Message,
  ResetTape,
  demoModel,
  emptyModel,
  memorySyncedEngine,
  puzzleFactHandles,
  startSyncedPuzzleHandle,
  update,
  uriOf,
  waitForSyncedHandle,
} from 'puzzle-core-example'

import { createTestRenderer } from '@opentui/core/testing'

import {
  dispatchOpenTuiInput,
  runPuzzleOpenTui,
  tapForKey,
  tapForToken,
  tapScreenToken,
} from './client.js'

const [afterYes] = update(emptyModel(), GuessedYes())

describe('Puzzle OpenTUI Client', () => {
  it('starts Instant as Host.OpenTui, not Host.Tui', () => {
    const entrySource = readFileSync('src/entry.ts', 'utf8')
    expect(entrySource).toContain('startLivePuzzle')
    expect(entrySource).toContain('Processor.Host.OpenTui()')
    expect(entrySource).toContain('instance:')
    expect(entrySource).toContain('randomUUID')
    expect(entrySource).not.toContain('Processor.Host.Tui()')
  })

  it('taps tokens and keys through the derived fact handles only', () => {
    const sent: Array<Message> = []
    const send = (message: Message): void => {
      sent.push(message)
    }

    const atDemo = puzzleFactHandles(demoModel(), send)
    tapForToken('yes', atDemo)
    tapForKey('+', atDemo)
    tapForKey('=', atDemo)
    tapForKey('-', atDemo)
    tapForToken('reset', atDemo)
    tapForToken('action-menu:yes', atDemo)
    tapForKey('r', atDemo)
    tapForKey('x', atDemo)
    expect(sent).toEqual([
      GuessedYes(),
      GuessedYes(),
      GuessedYes(),
      GuessedNo(),
      ResetTape(),
      ResetTape(),
    ])

    const atEmpty = puzzleFactHandles(emptyModel(), send)
    tapForKey('r', atEmpty)
    expect(sent).toEqual([
      GuessedYes(),
      GuessedYes(),
      GuessedYes(),
      GuessedNo(),
      ResetTape(),
      ResetTape(),
    ])
  })

  it('runs the whole window: keys repaint, reset appears and hides, q quits', async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 })
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)

    const finished = runPuzzleOpenTui(handle, setup.renderer)

    await setup.renderOnce()
    const atDemo = setup.captureCharFrame()
    expect(atDemo).toContain('[r] reset')
    expect(atDemo).toContain('[q] quit')
    expect(atDemo).toContain('https://puzzle.knophy.com')
    expect(atDemo).toContain('https://replicate.knophy.com')
    expect(atDemo).toContain('https://grok.knophy.com')
    expect(atDemo).not.toContain('[y] yes')
    expect(atDemo).not.toContain('github.com')

    setup.mockInput.pressKey('r')
    const atEmpty = await setup.waitForFrame(
      frame =>
        frame.includes('/puzzle#next') && !frame.includes('/puzzle#next=y'),
    )
    expect(atEmpty).toContain('/puzzle#next')
    expect(atEmpty).not.toContain(uriOf(afterYes))
    expect(atEmpty).not.toContain('[r] reset')

    setup.mockInput.pressKey('y')
    const atYes = await setup.waitForFrame(frame =>
      frame.includes(uriOf(afterYes)),
    )
    expect(atYes).toContain(uriOf(afterYes))

    setup.mockInput.pressKey('q')
    await finished

    handle.stop()
    setup.renderer.destroy()
  })

  it('opens a floating Action menu and selects the focused row on Enter', async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 })
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)

    const finished = runPuzzleOpenTui(handle, setup.renderer)
    await setup.renderOnce()

    setup.mockInput.pressKey('r')
    await setup.waitForFrame(
      frame =>
        frame.includes('/puzzle#next') && !frame.includes('/puzzle#next=y'),
    )

    setup.mockInput.pressKey('?')
    const opened = await setup.waitForFrame(frame => frame.includes('Actions'))
    expect(opened).toContain('Actions')
    expect(opened).toContain('> [ y ] yes')
    expect(opened).toContain('[?] open  [esc] close')
    expect(opened).not.toContain('action-menu:yes')

    setup.mockInput.pressEnter()
    const selected = await setup.waitForFrame(frame =>
      frame.includes(uriOf(afterYes)),
    )
    expect(selected).toContain(uriOf(afterYes))
    expect(selected).not.toContain('Actions')
    expect(selected).not.toContain('action-menu:yes')

    setup.mockInput.pressKey('q')
    await finished
    handle.stop()
    setup.renderer.destroy()
  })

  it('routes menu tokens through selection, not product GuessedYes', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)
    handle.send(ResetTape())
    handle.send(Program.ActionMenuCommandTriggered())
    tapScreenToken('action-menu:yes', handle)
    const snapshot = handle.readModel()
    expect(snapshot._tag).toBe('Ready')
    if (snapshot._tag === 'Ready') {
      expect(uriOf(snapshot.product)).toBe(uriOf(afterYes))
      expect(snapshot.actionMenu._tag).toBe('Closed')
    }
    handle.stop()
  })

  it('maps ? esc arrows and Enter like TUI', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)
    dispatchOpenTuiInput('r', handle)
    dispatchOpenTuiInput('?', handle)
    let snapshot = handle.readModel()
    expect(snapshot._tag).toBe('Ready')
    if (snapshot._tag === 'Ready') {
      expect(snapshot.actionMenu._tag).toBe('Open')
      if (snapshot.actionMenu._tag === 'Open') {
        expect(snapshot.actionMenu.focus).toBe(0)
      }
    }
    dispatchOpenTuiInput('down', handle)
    snapshot = handle.readModel()
    if (snapshot._tag === 'Ready' && snapshot.actionMenu._tag === 'Open') {
      expect(snapshot.actionMenu.focus).toBe(1)
    }
    dispatchOpenTuiInput('escape', handle)
    snapshot = handle.readModel()
    if (snapshot._tag === 'Ready') {
      expect(snapshot.actionMenu._tag).toBe('Closed')
    }
    dispatchOpenTuiInput('?', handle)
    dispatchOpenTuiInput('Enter', handle)
    snapshot = handle.readModel()
    if (snapshot._tag === 'Ready') {
      expect(uriOf(snapshot.product)).toBe(uriOf(afterYes))
      expect(snapshot.actionMenu._tag).toBe('Closed')
    }
    handle.stop()
  })
})
