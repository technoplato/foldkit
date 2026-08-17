import { Increment, Reset } from 'counter-core-example'
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  SnapshotLogError,
  emptyCountSnapshot,
  makeMemorySnapshotLogTransport,
} from '@foldkit/instant'

import {
  commitCounterSnapshotMessage,
  decodeCounterLogMessage,
  openSnapshotCounterWindowTape,
  readCounterSnapshotModel,
} from './snapshot.js'

describe('Counter snapshot log', () => {
  it('reads 0 when the count row is missing', async () => {
    const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const model = await Effect.runPromise(readCounterSnapshotModel(transport))

    expect(model).toEqual({ count: 0 })
  })

  it('writes Increment without folding history', async () => {
    const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(
      commitCounterSnapshotMessage(transport, 'cli', 0, Increment()),
    )
    await Effect.runPromise(
      commitCounterSnapshotMessage(transport, 'cli', 1, Increment()),
    )
    const model = await Effect.runPromise(readCounterSnapshotModel(transport))
    const state = await Effect.runPromise(transport.read())

    expect(model).toEqual({ count: 2 })
    expect(state.messages).toHaveLength(2)
    expect(state.snapshot.value).toBe(2)
  })

  it('keeps the local window count when Instant write fails', async () => {
    const transport = {
      read: () =>
        Effect.succeed({
          messages: [],
          snapshot: emptyCountSnapshot,
        }),
      subscribe: Stream.empty,
      write: () =>
        Effect.fail(
          new SnapshotLogError({
            cause: new Error('offline'),
            operation: 'Write',
          }),
        ),
    }
    const tape = await openSnapshotCounterWindowTape(transport, 'cli')
    await tape.send(Increment())

    expect(tape.readModel()).toEqual({ count: 1 })
    tape.stop()
  })

  it('lets a second Processor apply a remote Increment', async () => {
    const transport = await Effect.runPromise(makeMemorySnapshotLogTransport())
    const cli = await openSnapshotCounterWindowTape(transport, 'cli')
    const react = await openSnapshotCounterWindowTape(transport, 'react')
    const seen = new Promise<number>(resolve => {
      react.subscribe(model => {
        if (model.count === 1) {
          resolve(model.count)
        }
      })
    })

    await cli.send(Increment())
    await expect(seen).resolves.toBe(1)
    expect(react.readModel()).toEqual({ count: 1 })
    cli.stop()
    react.stop()
  })

  it('fails unknown Message tags', async () => {
    const result = await Effect.runPromise(
      decodeCounterLogMessage({
        createdAtMs: 1,
        from: 'cli',
        id: 'bad',
        tag: 'NoOp',
      }).pipe(Effect.flip),
    )

    expect(result).toBeInstanceOf(SnapshotLogError)
    expect(Reset.valid({ count: 0 }, {})).toBe(false)
  })
})
