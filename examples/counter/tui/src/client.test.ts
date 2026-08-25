import {
  memorySyncedEngine,
  readyCounter,
  startSyncedCounterHandle,
  waitForSyncedHandle,
} from 'counter-core-example'
import { Effect, Layer, Option, Queue, Terminal } from 'effect'
import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { renderCounterScreen, runCounterTui } from './client.js'

const keyInput = (name: string): Terminal.UserInput => ({
  input: Option.some(name),
  key: {
    name,
    ctrl: false,
    meta: false,
    shift: false,
  },
})

describe('Counter TUI Client', () => {
  it('subscribes and sends Starting, Failed, and Ready through the handle', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Tui()),
    )
    await waitForSyncedHandle(handle)
    const screens: Array<string> = []
    const layer = Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.gen(function* () {
          const queue = yield* Queue.unbounded<Terminal.UserInput>()
          yield* Queue.offer(queue, keyInput('+'))
          yield* Queue.offer(queue, keyInput('+'))
          yield* Queue.offer(queue, keyInput('-'))
          yield* Queue.offer(queue, keyInput('r'))
          yield* Queue.offer(queue, keyInput('q'))
          return queue
        }),
        readLine: Effect.succeed(''),
        display: text =>
          Effect.sync(() => {
            screens.push(text)
          }),
      }),
    )

    await Effect.runPromise(runCounterTui(handle).pipe(Effect.provide(layer)))

    expect(screens).toContain(renderCounterScreen(readyCounter(0)))
    expect(screens).toContain(renderCounterScreen(readyCounter(1)))
    expect(screens).toContain(renderCounterScreen(readyCounter(2)))
  })

  it('selects the focused Action menu row on Enter', async () => {
    const handle = startSyncedCounterHandle(
      memorySyncedEngine(Processor.Host.Tui()),
    )
    await waitForSyncedHandle(handle)
    const screens: Array<string> = []
    const layer = Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.gen(function* () {
          const queue = yield* Queue.unbounded<Terminal.UserInput>()
          yield* Queue.offer(queue, keyInput('?'))
          yield* Queue.offer(queue, {
            input: Option.some('\r'),
            key: {
              name: 'enter',
              ctrl: false,
              meta: false,
              shift: false,
            },
          })
          yield* Queue.offer(queue, keyInput('q'))
          return queue
        }),
        readLine: Effect.succeed(''),
        display: text =>
          Effect.sync(() => {
            screens.push(text)
          }),
      }),
    )

    await Effect.runPromise(runCounterTui(handle).pipe(Effect.provide(layer)))

    expect(screens).toContain(renderCounterScreen(readyCounter(1)))
  })
})
