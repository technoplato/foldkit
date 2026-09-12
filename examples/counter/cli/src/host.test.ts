import {
  CounterProgram,
  Decrement,
  FoldkitCounterV01,
  Increment,
  type Message,
  Model,
  OpenedNavigation,
  Reset,
  SyncedCounter,
  type SyncedCounterHandle,
  makeMemorySnapshotLogTransport,
  memorySyncedEngine,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Effect, Layer, Option } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readyCount } from './cliError.js'
import { executeDo, executeReplay, executeShow } from './host.js'
import { counterCliProgramId } from './isolation.js'
import { settleAfterSend, waitForReadyCountChange } from './session.js'

process.env['COUNTER_TAPE'] = 'memory'

const writeTape = async (messages: ReadonlyArray<Message>): Promise<string> => {
  const tape = await Effect.runPromise(
    Effect.scoped(
      Runtime.recordReplayTape(CounterProgram, Layer.empty, messages),
    ),
  )
  const json = await Effect.runPromise(
    Runtime.encodeReplayTape(CounterProgram, tape),
  )
  const dir = mkdtempSync(join(tmpdir(), 'counter-tape-'))
  const path = join(dir, 'tape.json')
  writeFileSync(path, json)
  return path
}

describe('Counter CLI host', () => {
  it('uses the live Instant app id for daemon isolation', () => {
    expect(counterCliProgramId).toBe(FoldkitCounterV01.id)
  })

  it('shows the imported initial Model without a Message or chrome', async () => {
    const execution = await Effect.runPromise(executeShow(undefined, undefined))

    expect(execution.initialModel).toEqual(Model.make({ count: 0 }))
    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toBe(execution.initialModel)
    expect(execution.stdout).toContain('uri      /counter')
    expect(execution.stdout).toContain('count    0')
    expect(execution.stdout).toContain('valid          false')
    expect(execution.stdout).not.toContain('device')
    expect(execution.stdout).not.toContain('[ + ]')
    expect(execution.stdout).not.toContain('laptop')
  })

  it('wraps the product tree when --device phone is set', async () => {
    const execution = await Effect.runPromise(executeShow('phone', undefined))

    expect(execution.maybeMessage).toEqual(
      Option.some(OpenedNavigation({ device: 'phone' })),
    )
    expect(execution.finalModel.maybeDevice).toEqual(Option.some('phone'))
    expect(execution.stdout).toContain('device   phone')
    expect(execution.stdout).toContain('[ + ]')
    expect(execution.stdout).toContain('[ - ]')
    expect(execution.stdout).not.toContain('[ reset ]')
    expect(execution.stdout).not.toContain('laptop')
  })

  it('rejects laptop as a Device', async () => {
    await expect(
      Effect.runPromise(executeShow('laptop', undefined)),
    ).rejects.toThrow('Unknown device "laptop"')
  })

  it('settles increment from the local write, not an Instant echo', async () => {
    let count = 0
    let write = Option.none<{
      readonly link: 'offline' | 'queued' | 'delivered'
    }>()
    const handle: SyncedCounterHandle = {
      actions: () => {
        throw new Error('settleAfterSend does not read actions.')
      },
      lastWrite: () => write,
      readModel: () =>
        SyncedCounter.Ready({
          product: Model.make({ count }),
          actionMenu: Program.Closed(),
        }),
      send: () => {
        count += 1
        write = Option.some({ link: 'delivered' })
      },
      stop: () => Promise.resolve(),
      subscribe: () => () => undefined,
    }
    handle.send(Increment())
    const settled = await Effect.runPromise(settleAfterSend(handle))
    expect(settled.model).toEqual(Model.make({ count: 1 }))
    expect(settled.write).toEqual(Option.some({ link: 'delivered' }))
  })

  it('waits for product.count after increment', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Cli()),
    )
    await waitForSyncedHandle(handle)
    const previous = await Effect.runPromise(readyCount(handle.readModel()))
    handle.send(Increment())
    const next = await Effect.runPromise(
      waitForReadyCountChange(handle, previous),
    )
    expect(next).toEqual(Model.make({ count: 1 }))
    await handle.stop()
  })

  it('sends increment and auto-shows the new count', async () => {
    const execution = await Effect.runPromise(executeDo('increment'))

    expect(execution.maybeMessage).toEqual(Option.some(Increment()))
    expect(execution.finalModel).toEqual(Model.make({ count: 1 }))
    expect(execution.stdout).toContain('increment sent')
    expect(execution.stdout).toContain('from           cli')
    expect(execution.stdout).toContain('via            argv')
    expect(execution.stdout).toContain('tape           appended')
    expect(execution.stdout).toContain('link           offline')
    expect(execution.stdout).toContain('count    1')
  })

  it('starts decrement from count 0', async () => {
    const execution = await Effect.runPromise(executeDo('decrement'))

    expect(execution.maybeMessage).toEqual(Option.some(Decrement()))
    expect(execution.finalModel).toEqual(Model.make({ count: -1 }))
    expect(execution.stdout).toContain('decrement sent')
  })

  it('logs an invalid reset at 0 and does not send Reset', async () => {
    const execution = await Effect.runPromise(executeDo('reset'))

    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toEqual(Model.make({ count: 0 }))
    expect(execution.stdout).toContain(
      'log  attempted to invoke invalid action reset',
    )
    expect(execution.stdout).toContain('state  count 0')
  })

  it('does not persist count into the next process', async () => {
    await Effect.runPromise(executeDo('increment'))
    const shown = await Effect.runPromise(executeShow(undefined, undefined))

    expect(shown.finalModel).toEqual(Model.make({ count: 0 }))
    expect(shown.stdout).toContain('count    0')
    expect(Reset.valid(shown.finalModel, {})).toBe(false)
  })

  it('persists increment on a shared count snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeDo('increment', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(shown.finalModel).toEqual(Model.make({ count: 1 }))
    expect(shown.stdout).toContain('count    1')
    expect(Reset.valid(shown.finalModel, {})).toBe(true)
  })

  it('lets a second Processor read the same count snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeDo('increment', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )
    const again = await Effect.runPromise(executeDo('increment', { snapshot }))

    expect(shown.finalModel).toEqual(Model.make({ count: 1 }))
    expect(again.finalModel).toEqual(Model.make({ count: 2 }))
    expect(again.link).toBe('delivered')
  })

  it('persists --device phone on a shared snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeShow('phone', undefined, { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(shown.finalModel.maybeDevice).toEqual(Option.some('phone'))
    expect(shown.maybeMessage).toEqual(Option.none())
    expect(shown.stdout).toContain('device   phone')
    expect(shown.stdout).toContain('count    0')
  })

  it('persists decrement on a shared snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeDo('increment', { snapshot }))
    await Effect.runPromise(executeDo('increment', { snapshot }))
    const decremented = await Effect.runPromise(
      executeDo('decrement', { snapshot }),
    )
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(decremented.maybeMessage).toEqual(Option.some(Decrement()))
    expect(decremented.finalModel.count).toBe(1)
    expect(shown.finalModel.count).toBe(1)
    expect(shown.stdout).toContain('count    1')
  })

  it('persists --path /counter on a shared snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeShow(undefined, '/counter', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(shown.finalModel.maybePath).toEqual(Option.some('counter'))
    expect(shown.stdout).toContain('uri      /counter')
    expect(shown.stdout).not.toContain('uri      /counter/counter')
    expect(shown.stdout).toContain('path     counter')
    expect(shown.stdout).toContain('  decrement')
  })

  it('persists --path counter.increment on a shared snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(
      executeShow(undefined, 'counter.increment', { snapshot }),
    )
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(shown.finalModel.maybePath).toEqual(Option.some('counter.increment'))
    expect(shown.stdout).toContain('uri      /counter/increment')
    expect(shown.stdout).toContain('path     counter.increment')
    expect(shown.stdout).toContain('  increment')
    expect(shown.stdout).not.toContain('  decrement')
  })

  it('lets increment keep occupancy on a shared snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeShow('phone', undefined, { snapshot }))
    const incremented = await Effect.runPromise(
      executeDo('increment', { snapshot }),
    )

    expect(incremented.finalModel).toEqual(
      Model.make({
        count: 1,
        maybeDevice: Option.some('phone'),
      }),
    )
    expect(incremented.stdout).toContain('device   phone')
    expect(incremented.stdout).toContain('count    1')
  })

  it('replays a Program tape through Runtime.replayToFrame', async () => {
    const path = await writeTape([Increment()])
    const execution = await Effect.runPromise(executeReplay(path))

    expect(execution.models).toEqual([
      Model.make({ count: 0 }),
      Model.make({ count: 1 }),
    ])
    expect(execution.stdout).toContain('FRAME 0')
    expect(execution.stdout).toContain('FRAME 1')
    expect(execution.stdout).toContain('Increment')
    expect(execution.stdout).toContain('count    0')
    expect(execution.stdout).toContain('count    1')
    expect(execution.stdout).toContain('increment   true')
    expect(execution.stdout).toContain('reset       false')
    expect(execution.stdout).toContain('reset       true')
    expect(execution.stdout).toContain('[ + ]')
    expect(execution.stdout).toContain('[ reset ]')
  })
})
