import {
  CounterProgram,
  Decrement,
  Increment,
  type Message,
  Model,
  Reset,
} from 'counter-core-example'
import { Effect, Layer, Option } from 'effect'
import { Runtime } from 'foldkit'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { makeInMemoryProgramStore } from '@foldkit/instant'

import { executeDo, executeReplay, executeShow } from './host.js'
import {
  makeCounterTapeOnStore,
  makeMemoryCounterSnapshotLog,
  makeMemoryCounterTape,
} from './tape.js'

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

  it('persists increment on a shared Instant tape', async () => {
    const tape = await Effect.runPromise(makeMemoryCounterTape('cli'))
    await Effect.runPromise(executeDo('increment', { tape }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { tape }),
    )

    expect(shown.finalModel).toEqual(Model.make({ count: 1 }))
    expect(shown.stdout).toContain('count    1')
    expect(Reset.valid(shown.finalModel, {})).toBe(true)
  })

  it('persists increment on a shared count snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemoryCounterSnapshotLog())
    await Effect.runPromise(executeDo('increment', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(shown.finalModel).toEqual(Model.make({ count: 1 }))
    expect(shown.stdout).toContain('count    1')
    expect(Reset.valid(shown.finalModel, {})).toBe(true)
  })

  it('lets a second Processor read the same count snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemoryCounterSnapshotLog())
    await Effect.runPromise(executeDo('increment', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )
    const again = await Effect.runPromise(executeDo('increment', { snapshot }))

    expect(shown.finalModel).toEqual(Model.make({ count: 1 }))
    expect(again.finalModel).toEqual(Model.make({ count: 2 }))
    expect(again.link).toBe('delivered')
  })

  it('lets a second Processor read every Message on the tape', async () => {
    const store = await Effect.runPromise(makeInMemoryProgramStore())
    const cli = await Effect.runPromise(
      makeCounterTapeOnStore(store, 'cli', 'offline'),
    )
    const foldkit = await Effect.runPromise(
      makeCounterTapeOnStore(store, 'foldkit', 'offline'),
    )
    await Effect.runPromise(executeDo('increment', { tape: cli }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { tape: foldkit }),
    )
    const again = await Effect.runPromise(
      executeDo('increment', { tape: foldkit }),
    )
    const fromCli = await Effect.runPromise(
      executeShow(undefined, undefined, { tape: cli }),
    )

    expect(shown.finalModel).toEqual(Model.make({ count: 1 }))
    expect(again.finalModel).toEqual(Model.make({ count: 2 }))
    expect(fromCli.finalModel).toEqual(Model.make({ count: 2 }))
    expect(again.link).toBe('offline')
    expect(again.stdout).toContain('link           offline')
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
