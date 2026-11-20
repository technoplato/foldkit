import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'

import { bindCounter } from '../test/apps/catalogCounter.js'
import { SYNC_END, SYNC_START } from './frameWriter.js'
import { runProgramWatch } from './watch.js'

const hasEscape = (text: string): boolean => text.includes('\u001b')

describe('runProgramWatch', () => {
  it('paints terminal frames with synchronized output and no ESC[2J', async () => {
    const bound = bindCounter()
    const writes: Array<string> = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            runProgramWatch(
              bound,
              chunk => {
                writes.push(chunk)
              },
              { isTerminal: true, columns: 80, rows: 24 },
            ),
          )
          yield* Effect.sleep('20 millis')
          bound.press('Increment')
          yield* Effect.sleep('20 millis')
          yield* Fiber.interrupt(fiber)
        }),
      ),
    )
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes.every(chunk => chunk.includes(SYNC_START))).toBe(true)
    expect(writes.every(chunk => chunk.includes(SYNC_END))).toBe(true)
    expect(writes.every(chunk => !chunk.includes('\u001b[2J'))).toBe(true)
  })

  it('writes zero escape sequences or synchronized markers to a non-TTY pipe', async () => {
    const bound = bindCounter()
    const writes: Array<string> = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            runProgramWatch(
              bound,
              chunk => {
                writes.push(chunk)
              },
              { isTerminal: false },
            ),
          )
          yield* Effect.sleep('20 millis')
          bound.press('Increment')
          yield* Effect.sleep('20 millis')
          yield* Fiber.interrupt(fiber)
        }),
      ),
    )
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes.every(chunk => !hasEscape(chunk))).toBe(true)
  })
})
