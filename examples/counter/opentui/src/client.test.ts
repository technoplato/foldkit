import { describe, expect, it } from 'bun:test'
import {
  Decrement,
  Increment,
  type Message,
  Model,
  Reset,
  counterFactHandles,
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Processor, Program } from 'foldkit'
import { readFileSync } from 'node:fs'

import { createTestRenderer } from '@opentui/core/testing'

import {
  dispatchOpenTuiInput,
  runCounterOpenTui,
  tapForKey,
  tapForToken,
  tapScreenToken,
} from './client.js'

describe('Counter OpenTUI Client', () => {
  it('starts Instant as Host.OpenTui, not Host.Tui', () => {
    const entrySource = readFileSync('src/entry.ts', 'utf8')
    expect(entrySource).toContain('startLiveCounter')
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

    const atZero = counterFactHandles(Model.make({ count: 0 }), send)
    tapForToken('increment', atZero)
    tapForKey('+', atZero)
    tapForKey('=', atZero)
    tapForKey('-', atZero)
    tapForToken('reset', atZero)
    tapForToken('action-menu:increment', atZero)
    tapForKey('r', atZero)
    tapForKey('x', atZero)
    expect(sent).toEqual([Increment(), Increment(), Increment(), Decrement()])

    const atTwo = counterFactHandles(Model.make({ count: 2 }), send)
    tapForKey('R', atTwo)
    expect(sent).toEqual([
      Increment(),
      Increment(),
      Increment(),
      Decrement(),
      Reset(),
    ])
  })

  it('runs the whole window: keys repaint, reset appears and hides, q quits', async () => {
    const setup = await createTestRenderer({ width: 64, height: 16 })
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)

    const finished = runCounterOpenTui(handle, setup.renderer)

    await setup.renderOnce()
    const atZero = setup.captureCharFrame()
    expect(atZero).toContain('[+] increment')
    expect(atZero).toContain('[q] quit')
    expect(atZero).not.toContain('reset')

    setup.mockInput.pressKey('+')
    const atOne = await setup.waitForFrame(frame => frame.includes('[r] reset'))
    expect(atOne).toContain('1')

    setup.mockInput.pressKey('r')
    const backToZero = await setup.waitForFrame(
      frame => !frame.includes('[r] reset'),
    )
    expect(backToZero).toContain('0')

    setup.mockInput.pressKey('q')
    await finished

    handle.stop()
    setup.renderer.destroy()
  })

  it('opens a floating Action menu and selects the focused row on Enter', async () => {
    const setup = await createTestRenderer({ width: 64, height: 16 })
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)

    const finished = runCounterOpenTui(handle, setup.renderer)
    await setup.renderOnce()

    setup.mockInput.pressKey('?')
    const opened = await setup.waitForFrame(frame => frame.includes('Actions'))
    expect(opened).toContain('0')
    expect(opened).toContain('Actions')
    expect(opened).toContain('> [ + ] increment')
    expect(opened).toContain('[?] open  [esc] close')
    expect(opened).not.toContain('action-menu:increment')

    setup.mockInput.pressEnter()
    const selected = await setup.waitForFrame(frame => frame.includes('1'))
    expect(selected).toContain('1')
    expect(selected).not.toContain('Actions')
    expect(selected).not.toContain('action-menu:increment')

    setup.mockInput.pressKey('q')
    await finished
    handle.stop()
    setup.renderer.destroy()
  })

  it('routes menu tokens through selection, not product Increment', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)
    handle.send(Program.ActionMenuCommandTriggered())
    tapScreenToken('action-menu:increment', handle)
    const snapshot = handle.readModel()
    expect(snapshot._tag).toBe('Ready')
    if (snapshot._tag === 'Ready') {
      expect(snapshot.product.count).toBe(1)
      expect(snapshot.actionMenu._tag).toBe('Closed')
    }
    handle.stop()
  })

  it('maps ? esc arrows and Enter like TUI', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.OpenTui()),
    )
    await waitForSyncedHandle(handle)
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
      expect(snapshot.product.count).toBe(1)
      expect(snapshot.actionMenu._tag).toBe('Closed')
    }
    handle.stop()
  })
})
