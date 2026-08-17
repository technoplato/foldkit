import { Cause, Effect, Queue, Stream } from 'effect'

import { decodeProgramStoreTransactionOutcome } from '../instantProgramStore/index.js'
import {
  type InstantSnapshotLogDatabase,
  SnapshotLogError,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  decodeSnapshotLogState,
  snapshotLogQuery,
} from './snapshotLog.js'

const transactSnapshotLogWrite = (
  database: InstantSnapshotLogDatabase,
  write: SnapshotLogWrite,
) => {
  const countEntity = database.tx.count[write.snapshot.id]
  const messageEntity = database.tx.message[write.message.id]
  if (countEntity === undefined) {
    throw new Error('Expected a count snapshot transaction entity.')
  }
  if (messageEntity === undefined) {
    throw new Error('Expected a Message log transaction entity.')
  }
  return database.transact([
    countEntity.update({
      asOf: write.snapshot.asOf,
      at: write.snapshot.at,
      value: write.snapshot.value,
    }),
    messageEntity.update({
      createdAtMs: write.message.createdAtMs,
      from: write.message.from,
      tag: write.message.tag,
    }),
  ])
}

/** Instant core transport. Browser Processors use this. */
export const makeInstantCoreSnapshotLogTransport = (
  database: InstantSnapshotLogDatabase,
): SnapshotLogTransport => ({
  read: () =>
    Effect.tryPromise({
      try: async () => {
        const response = await database.queryOnce(snapshotLogQuery)
        return decodeSnapshotLogState(response.data)
      },
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Read',
        }),
    }),
  subscribe: Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery(snapshotLogQuery, response => {
          if (response.error !== undefined) {
            Queue.failCauseUnsafe(
              queue,
              Cause.fail(
                new SnapshotLogError({
                  cause: response.error,
                  operation: 'Observe',
                }),
              ),
            )
          } else {
            try {
              Queue.offerUnsafe(queue, decodeSnapshotLogState(response.data))
            } catch (cause) {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(
                  new SnapshotLogError({
                    cause,
                    operation: 'Decode',
                  }),
                ),
              )
            }
          }
        }),
      ),
      unsubscribe => Effect.sync(unsubscribe),
    ),
  ),
  write: write =>
    Effect.tryPromise({
      try: () =>
        transactSnapshotLogWrite(database, write).then(
          decodeProgramStoreTransactionOutcome,
        ),
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Write',
        }),
    }),
})
