import { Effect, SubscriptionRef } from 'effect'

import {
  type SnapshotLogState,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  emptySnapshotLogState,
  memorySnapshotLogOutcome,
  upsertLogMessage,
} from './snapshotLog.js'

/** In-memory snapshot log. The process dies with the count. */
export const makeMemorySnapshotLogTransport =
  (): Effect.Effect<SnapshotLogTransport> =>
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make(emptySnapshotLogState)
      return {
        read: () => SubscriptionRef.get(ref),
        subscribe: SubscriptionRef.changes(ref),
        write: (write: SnapshotLogWrite) =>
          SubscriptionRef.update(ref, (state: SnapshotLogState) => ({
            messages: upsertLogMessage(state.messages, write.message),
            snapshot: write.snapshot,
          })).pipe(Effect.as(memorySnapshotLogOutcome())),
      }
    })
