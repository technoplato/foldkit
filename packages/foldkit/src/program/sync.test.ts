import { Schema as S, SchemaTransformation } from 'effect'
import { describe, expect, it } from 'vitest'

import { m } from '../message/public.js'
import { compose } from './compose.js'
import { make } from './program.js'
import { describeSyncError } from './sync.js'

const Increment = m('Increment')
const Decrement = m('Decrement')
const Reset = m('Reset')
const CounterMessage = S.Union([Increment, Decrement, Reset])
type CounterMessage = typeof CounterMessage.Type

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const Counter = make({
  id: 'test-counter',
  version: 1,
  Model: CounterModel,
  Message: CounterMessage,
  init: () => [{ count: 0 }, []],
  update: (model, message) => {
    if (message._tag === 'Increment') {
      return [{ count: model.count + 1 }, []]
    }
    if (message._tag === 'Decrement') {
      return [{ count: model.count - 1 }, []]
    }
    if (message._tag === 'Reset') {
      return [{ count: 0 }, []]
    }
    return [model, []]
  },
})

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const CountProjection = CountRow.pipe(
  S.decodeTo(
    CounterModel,
    SchemaTransformation.transform({
      decode: row => ({ count: row.value }),
      encode: model => ({
        id: 'count',
        value: model.count,
        asOf: '',
        at: 0,
      }),
    }),
  ),
)

const MessageRow = S.Struct({
  id: S.String,
  tag: S.Literals(['Increment', 'Decrement', 'Reset']),
  from: S.String,
  createdAtMs: S.Number,
})

const MessageWire = MessageRow.pipe(
  S.decodeTo(
    CounterMessage,
    SchemaTransformation.transform({
      decode: row => ({ _tag: row.tag }),
      encode: message => ({
        id: '',
        tag: message._tag,
        from: '',
        createdAtMs: 0,
      }),
    }),
  ),
)

describe('Program.compose.sync', () => {
  const Synced = compose.sync({
    of: Counter,
    snapshot: CountProjection,
    message: MessageWire,
  })

  it('starts Starting and becomes Ready from SnapshotReceived', () => {
    const [model] = Synced.init()
    expect(model).toEqual({ _tag: 'Starting' })

    const [ready] = Synced.update(
      model,
      Synced.SnapshotReceived({ model: { count: 4 } }),
    )
    expect(ready).toEqual({ _tag: 'Ready', count: 4 })
  })

  it('applies a child Message only when Ready', () => {
    const [starting] = Synced.init()
    const [ignored] = Synced.update(starting, Increment())
    expect(ignored).toEqual({ _tag: 'Starting' })

    const [ready] = Synced.update(
      starting,
      Synced.SnapshotReceived({ model: { count: 0 } }),
    )
    const [after] = Synced.update(ready, Increment())
    expect(after).toEqual({ _tag: 'Ready', count: 1 })
  })

  it('applies RemoteMessageReceived onto Ready and ignores later snapshots', () => {
    const [starting] = Synced.init()
    const [ready] = Synced.update(
      starting,
      Synced.SnapshotReceived({ model: { count: 10 } }),
    )
    const [afterRemote] = Synced.update(
      ready,
      Synced.RemoteMessageReceived({ message: Increment() }),
    )
    expect(afterRemote).toEqual({ _tag: 'Ready', count: 11 })

    const [afterSnapshot] = Synced.update(
      afterRemote,
      Synced.SnapshotReceived({ model: { count: 0 } }),
    )
    expect(afterSnapshot).toEqual({ _tag: 'Ready', count: 11 })
  })

  it('Failed is boot only. Ready keeps the number after SyncFailed', () => {
    const [starting] = Synced.init()
    const bootError = Synced.TransportFailed({
      what: 'Instant did not return a snapshot.',
      meaning: 'This Processor could not start from Instant.',
      fix: 'Check the Instant app and try again.',
      cause: 'network down',
    })
    const [failed] = Synced.update(
      starting,
      Synced.SyncFailed({ error: bootError }),
    )
    expect(failed._tag).toBe('Failed')

    const [ready] = Synced.update(
      starting,
      Synced.SnapshotReceived({ model: { count: 7 } }),
    )
    const later = Synced.TransportFailed({
      what: 'Instant did not accept this Increment.',
      meaning: 'The local count is 7. Instant rejected the write.',
      fix: 'Keep the local number.',
      sent: Increment(),
      cause:
        "Invalid id for entity 'count'. Expected a UUID, but received: count",
    })
    const [stillReady] = Synced.update(
      ready,
      Synced.SyncFailed({ error: later }),
    )
    expect(stillReady).toEqual({ _tag: 'Ready', count: 7 })
  })

  it('describeSyncError prints Sent and Cause, not the tag', () => {
    const error = Synced.TransportFailed({
      what: 'Instant did not accept this Increment.',
      meaning:
        'The local count is 11. Instant rejected the write or the network is down.',
      fix: 'Keep the local number. Retry the same Message id when Instant is back.',
      sent: Increment(),
      cause:
        "Invalid id for entity 'count'. Expected a UUID, but received: count",
    })
    const text = describeSyncError(error, message => message._tag)
    expect(text).toContain('Sent: Increment')
    expect(text).toContain(
      "Cause: Invalid id for entity 'count'. Expected a UUID, but received: count",
    )
    expect(text).not.toContain('TransportFailed')
  })
})
