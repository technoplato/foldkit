import { Effect, SubscriptionRef } from 'effect'

import { memorySnapshotLogOutcome, upsertLogMessage } from '@foldkit/instant'

import {
  type PuzzleSnapshotLogState,
  type PuzzleSnapshotLogTransport,
  type PuzzleSnapshotLogWrite,
  emptyPuzzleSnapshotLogState,
} from './instantSchema.js'

/**
 * In-memory Puzzle snapshot log. The process dies with the tape.
 * Instant has no Model. The snapshot Schema is the tape ADT.
 */
export const makeMemoryPuzzleSnapshotLogTransport =
  (): Effect.Effect<PuzzleSnapshotLogTransport> =>
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make(emptyPuzzleSnapshotLogState)
      return {
        read: () => SubscriptionRef.get(ref),
        subscribe: SubscriptionRef.changes(ref),
        write: (write: PuzzleSnapshotLogWrite) =>
          SubscriptionRef.update(ref, (state: PuzzleSnapshotLogState) => ({
            messages: upsertLogMessage(state.messages, write.message),
            snapshot: write.snapshot,
          })).pipe(Effect.as(memorySnapshotLogOutcome())),
      }
    })

/**
 * Counter-shaped alias. Puzzle Instant is the tape ADT, not a count.
 */
export const makeMemorySnapshotLogTransport =
  makeMemoryPuzzleSnapshotLogTransport

/**
 * Counter-shaped alias. Puzzle Instant is the tape ADT, not a count.
 */
export type SnapshotLogTransport = PuzzleSnapshotLogTransport
