import { Increment } from 'counter-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { commitSharedMessage } from '@foldkit/instant/sharing'

import { CounterInstantTapeError, resolveCounterTape } from './node.js'

describe('Counter Node Instant tape', () => {
  it('opens a memory tape by default', async () => {
    const tape = await Effect.runPromise(resolveCounterTape({}))
    const commit = await Effect.runPromise(
      commitSharedMessage(tape, Increment(), () => Effect.succeed(1)),
    )
    const accepted = await Effect.runPromise(tape.readAcceptedMessages)

    expect(commit.accepted).toBe('offline')
    expect(accepted).toEqual([Increment()])
  })

  it('fails live Instant when the app id is missing', async () => {
    const error = await Effect.runPromise(
      resolveCounterTape({ COUNTER_TAPE: 'instant' }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(CounterInstantTapeError)
    expect(error.message).toContain('INSTANT_APP_ID')
  })
})
