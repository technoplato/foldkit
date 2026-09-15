import { Array, Effect, Option, Stream, SubscriptionRef } from 'effect'

import {
  type InstantCountSnapshotRecord,
  type SnapshotLogState,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  countSnapshotId,
  emptyCountSnapshotFor,
  memorySnapshotLogOutcome,
  upsertLogMessage,
} from './snapshotLog.js'

const selectedCountId = (countId: string | undefined): string => {
  if (countId !== undefined && countId !== '') {
    return countId
  }
  const fromEnv = process.env['COUNTER_COUNT_ID']
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv
  }
  return countSnapshotId
}

const upsertCount = (
  counts: ReadonlyArray<InstantCountSnapshotRecord>,
  snapshot: InstantCountSnapshotRecord,
): ReadonlyArray<InstantCountSnapshotRecord> =>
  Array.append(
    Array.filter(counts, existing => existing.id !== snapshot.id),
    snapshot,
  )

const snapshotOf = (
  counts: ReadonlyArray<InstantCountSnapshotRecord>,
  countId: string,
): InstantCountSnapshotRecord => {
  const maybeCount = Array.findFirst(counts, row => row.id === countId)
  if (Option.isSome(maybeCount)) {
    return maybeCount.value
  }
  return emptyCountSnapshotFor(countId)
}

type MemoryLog = Readonly<{
  readonly messages: SnapshotLogState['messages']
  readonly counts: ReadonlyArray<InstantCountSnapshotRecord>
}>

/**
 * In-memory snapshot log. The process dies with the counts.
 * Multiple named rows live in one store. Read filters by count id.
 * Example: public `COUNT_UUID` and kitchen stay distinct.
 */
export const makeMemorySnapshotLogTransport = (
  countId?: string,
): Effect.Effect<SnapshotLogTransport> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make<MemoryLog>({
      messages: [],
      counts: [],
    })
    return {
      read: () =>
        SubscriptionRef.get(ref).pipe(
          Effect.map(state => ({
            messages: state.messages,
            snapshot: snapshotOf(state.counts, selectedCountId(countId)),
          })),
        ),
      subscribe: SubscriptionRef.changes(ref).pipe(
        Stream.map(state => ({
          messages: state.messages,
          snapshot: snapshotOf(state.counts, selectedCountId(countId)),
        })),
      ),
      write: (write: SnapshotLogWrite) =>
        SubscriptionRef.update(ref, (state: MemoryLog) => ({
          messages: upsertLogMessage(state.messages, write.message),
          counts: upsertCount(state.counts, write.snapshot),
        })).pipe(Effect.as(memorySnapshotLogOutcome())),
    }
  })
