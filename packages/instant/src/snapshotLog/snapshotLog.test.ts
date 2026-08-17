import { Deferred, Effect, Fiber, Stream } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import { enqueuedTransactionOutcome } from '../programStore/index.js'
import { makeMemorySnapshotLogTransport } from './memory.js'
import {
  InstantCountSnapshotRecord,
  InstantLogMessageRecord,
  SnapshotLogError,
  type SnapshotLogState,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  commitSnapshotLog,
  countSnapshotId,
  emptyCountSnapshot,
  messagesSinceSnapshot,
  observeRemoteSnapshotLog,
  shouldApplyRemoteLogMessage,
  sortLogMessages,
  writeSnapshotLog,
} from './snapshotLog.js'

const countSnapshot = (
  value: number,
  asOf: string,
  at: number,
): InstantCountSnapshotRecord =>
  InstantCountSnapshotRecord.make({
    asOf,
    at,
    id: countSnapshotId,
    value,
  })

const logMessage = (
  id: string,
  tag: string,
  from: string,
  createdAtMs: number,
): InstantLogMessageRecord =>
  InstantLogMessageRecord.make({
    createdAtMs,
    from,
    id,
    tag,
  })

const recordingTransport = (writes: Array<string>): SnapshotLogTransport => ({
  read: () =>
    Effect.succeed({
      messages: [],
      snapshot: emptyCountSnapshot,
    }),
  subscribe: Stream.empty,
  write: (_write: SnapshotLogWrite) =>
    Effect.sync(() => {
      writes.push('write')
      return enqueuedTransactionOutcome('test')
    }),
})

describe('Instant snapshot log', () => {
  it.effect('reads 0 when the count row is missing', () =>
    Effect.gen(function* () {
      const transport = yield* makeMemorySnapshotLogTransport()
      const state = yield* transport.read()

      expect(state.snapshot).toEqual(emptyCountSnapshot)
      expect(state.snapshot.value).toBe(0)
      expect(state.messages).toEqual([])
    }),
  )

  it.effect('writes the count snapshot and Message together', () =>
    Effect.gen(function* () {
      const transport = yield* makeMemorySnapshotLogTransport()
      const message = logMessage('msg-1', 'Increment', 'cli', 1_000)
      const snapshot = countSnapshot(1, 'msg-1', 1_000)

      const outcome = yield* writeSnapshotLog(transport, {
        message,
        snapshot,
      })
      const state = yield* transport.read()

      expect(outcome._tag).toBe('Synced')
      expect(state.snapshot).toEqual(snapshot)
      expect(state.messages).toEqual([message])
    }),
  )

  it('uses a UUID for the one count snapshot row', () => {
    expect(countSnapshotId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(emptyCountSnapshot.id).toBe(countSnapshotId)
  })

  it('orders Messages by createdAtMs then id', () => {
    const later = logMessage('a', 'Decrement', 'cli', 2_000)
    const earlierB = logMessage('b', 'Increment', 'cli', 1_000)
    const earlierA = logMessage('a-early', 'Reset', 'tui', 1_000)

    expect(sortLogMessages([later, earlierB, earlierA])).toEqual([
      earlierA,
      earlierB,
      later,
    ])
  })

  it('skips own Processor, already applied ids, and older Messages', () => {
    const snapshot = countSnapshot(4, 'as-of', 4_000)
    const appliedIds = new Set(['applied', 'as-of'])

    expect(
      shouldApplyRemoteLogMessage(
        logMessage('own', 'Increment', 'cli', 5_000),
        snapshot,
        'cli',
        appliedIds,
      ),
    ).toBe(false)
    expect(
      shouldApplyRemoteLogMessage(
        logMessage('as-of', 'Increment', 'tui', 4_000),
        snapshot,
        'cli',
        appliedIds,
      ),
    ).toBe(false)
    expect(
      shouldApplyRemoteLogMessage(
        logMessage('applied', 'Increment', 'tui', 5_000),
        snapshot,
        'cli',
        appliedIds,
      ),
    ).toBe(false)
    expect(
      shouldApplyRemoteLogMessage(
        logMessage('too-old', 'Increment', 'tui', 3_000),
        snapshot,
        'cli',
        appliedIds,
      ),
    ).toBe(false)
    expect(
      shouldApplyRemoteLogMessage(
        logMessage('remote', 'Increment', 'tui', 5_000),
        snapshot,
        'cli',
        appliedIds,
      ),
    ).toBe(true)
  })

  it.effect('retries the same Message id without a second row', () =>
    Effect.gen(function* () {
      const transport = yield* makeMemorySnapshotLogTransport()
      const first = logMessage('same', 'Increment', 'cli', 1_000)
      const retry = logMessage('same', 'Increment', 'cli', 1_000)

      yield* writeSnapshotLog(transport, {
        message: first,
        snapshot: countSnapshot(1, 'same', 1_000),
      })
      yield* writeSnapshotLog(transport, {
        message: retry,
        snapshot: countSnapshot(1, 'same', 1_000),
      })
      const state = yield* transport.read()

      expect(state.messages).toHaveLength(1)
      expect(state.messages).toEqual([retry])
    }),
  )

  it.effect('updates the local count before the Instant write', () =>
    Effect.gen(function* () {
      const writes: Array<string> = []
      const order: Array<string> = []
      const transport = recordingTransport(writes)

      yield* commitSnapshotLog({
        applyLocal: currentValue => {
          order.push('local')
          return currentValue + 1
        },
        currentValue: 10,
        makeId: () => 'local-first',
        now: () => 11_000,
        processorId: 'cli',
        tag: 'Increment',
        transport,
      })

      expect(order).toEqual(['local'])
      expect(writes).toEqual(['write'])
    }),
  )

  it.effect('does not fold the Message history on read', () =>
    Effect.gen(function* () {
      const transport = yield* makeMemorySnapshotLogTransport()
      yield* writeSnapshotLog(transport, {
        message: logMessage('one', 'Increment', 'cli', 1_000),
        snapshot: countSnapshot(1, 'one', 1_000),
      })
      yield* writeSnapshotLog(transport, {
        message: logMessage('two', 'Increment', 'cli', 2_000),
        snapshot: countSnapshot(2, 'two', 2_000),
      })
      yield* writeSnapshotLog(transport, {
        message: logMessage('three', 'Increment', 'cli', 3_000),
        snapshot: countSnapshot(3, 'three', 3_000),
      })
      const state = yield* transport.read()
      const live = messagesSinceSnapshot(state.messages, state.snapshot)

      expect(state.snapshot.value).toBe(3)
      expect(state.messages).toHaveLength(3)
      expect(live).toHaveLength(1)
      expect(live).toEqual([logMessage('three', 'Increment', 'cli', 3_000)])
    }),
  )

  it.effect('lets a second Processor apply a remote Increment', () =>
    Effect.gen(function* () {
      const transport = yield* makeMemorySnapshotLogTransport()
      const applied: Array<string> = []
      const received = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkChild(
        observeRemoteSnapshotLog(transport, 'react', message =>
          Effect.gen(function* () {
            applied.push(message.tag)
            yield* Deferred.succeed(received, undefined)
          }),
        ),
      )

      yield* commitSnapshotLog({
        applyLocal: currentValue => currentValue + 1,
        currentValue: 0,
        makeId: () => 'remote-inc',
        now: () => 4_000,
        processorId: 'cli',
        tag: 'Increment',
        transport,
      })

      yield* Deferred.await(received)
      const state = yield* transport.read()
      yield* Fiber.interrupt(fiber)

      expect(state.snapshot.value).toBe(1)
      expect(applied).toEqual(['Increment'])
    }),
  )

  it.effect('applies two remote Messages after a startup snapshot', () =>
    Effect.gen(function* () {
      const transport = yield* makeMemorySnapshotLogTransport()
      yield* writeSnapshotLog(transport, {
        message: logMessage('one', 'Increment', 'cli', 1_000),
        snapshot: countSnapshot(1, 'one', 1_000),
      })
      yield* writeSnapshotLog(transport, {
        message: logMessage('two', 'Increment', 'cli', 2_000),
        snapshot: countSnapshot(2, 'two', 2_000),
      })
      const applied: Array<string> = []
      const received = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkChild(
        observeRemoteSnapshotLog(
          transport,
          'react',
          message =>
            Effect.gen(function* () {
              applied.push(message.id)
              if (applied.length === 2) {
                yield* Deferred.succeed(received, undefined)
              }
            }),
          countSnapshot(2, 'two', 2_000),
        ),
      )

      yield* commitSnapshotLog({
        applyLocal: currentValue => currentValue + 1,
        currentValue: 2,
        makeId: () => 'three',
        now: () => 3_000,
        processorId: 'cli',
        tag: 'Increment',
        transport,
      })
      yield* commitSnapshotLog({
        applyLocal: currentValue => currentValue + 1,
        currentValue: 3,
        makeId: () => 'four',
        now: () => 4_000,
        processorId: 'cli',
        tag: 'Increment',
        transport,
      })

      yield* Deferred.await(received)
      yield* Fiber.interrupt(fiber)

      expect(applied).toEqual(['three', 'four'])
    }),
  )

  it.effect('keeps the local count when the Instant write fails', () =>
    Effect.gen(function* () {
      let localValue = 10
      const transport: SnapshotLogTransport = {
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

      const result = yield* commitSnapshotLog({
        applyLocal: currentValue => {
          localValue = currentValue + 1
          return localValue
        },
        currentValue: 10,
        messageId: 'retry-me',
        processorId: 'cli',
        tag: 'Increment',
        transport,
      }).pipe(Effect.flip)

      expect(localValue).toBe(11)
      expect(result).toBeInstanceOf(SnapshotLogError)
    }),
  )
})
