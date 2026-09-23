import { Array, Effect, Option, Queue, Terminal } from 'effect'
import { describe, expect, it } from 'vitest'

import { bindCounter } from '../test/apps/catalogCounter.js'
import { runProgramTui } from './tui.js'

const keyEvent = (
  name: string,
  typed: Option.Option<string> = Option.some(name),
): Terminal.UserInput => ({
  input: typed,
  key: { name, ctrl: false, meta: false, shift: false },
})

const scriptedTerminal = (
  events: ReadonlyArray<Terminal.UserInput>,
  frames: Array<string>,
) =>
  Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    readInput: Effect.gen(function* () {
      const queue = yield* Queue.unbounded<Terminal.UserInput, never>()
      yield* Queue.offerAll(queue, events)
      return queue
    }),
    readLine: Effect.succeed(''),
    display: text =>
      Effect.sync(() => {
        frames.push(text)
      }),
  })

describe('runProgramTui', () => {
  it('routes keys through the interaction and repaints every change', async () => {
    const bound = bindCounter()
    const frames: Array<string> = []
    await Effect.runPromise(
      runProgramTui(bound, 'counter').pipe(
        Effect.provideService(
          Terminal.Terminal,
          scriptedTerminal(
            [
              keyEvent('+'),
              keyEvent('+'),
              keyEvent('?'),
              keyEvent('r'),
              keyEvent('return', Option.none()),
              keyEvent('q'),
            ],
            frames,
          ),
        ),
      ),
    )
    expect(bound.readModel().count).toBe(0)
    expect(frames.some(frame => frame.includes('Action menu'))).toBe(true)
    expect(Option.getOrThrow(Array.head(frames))).toContain('[?] actions')
  })
})
