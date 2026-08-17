import {
  ReadyWindow,
  startMemoryCounterWindow,
  uri,
} from 'counter-core-example'
import { Effect, Layer, Option, Queue, Terminal } from 'effect'
import { describe, expect, it } from 'vitest'

import { renderCounterScreen, runCounterTui } from './client.js'

const waitForReady = async (
  runtime: ReturnType<typeof startMemoryCounterWindow>,
): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (runtime.getSnapshot(uri)._tag === 'ReadyWindow') {
      return
    }
    await Promise.resolve()
  }
}

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
  it('subscribes and sends Starting, Failed, and Ready through the window runtime', async () => {
    const runtime = startMemoryCounterWindow()
    await waitForReady(runtime)
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

    await Effect.runPromise(runCounterTui(runtime).pipe(Effect.provide(layer)))

    expect(screens).toContain(
      renderCounterScreen(ReadyWindow.make({ count: 0 })),
    )
    expect(screens).toContain(
      renderCounterScreen(ReadyWindow.make({ count: 1 })),
    )
    expect(screens).toContain(
      renderCounterScreen(ReadyWindow.make({ count: 2 })),
    )
  })
})
