import { Cause, Effect, Queue, Stream } from 'effect'

import { decodeProgramStoreTransactionOutcome } from '../instantProgramStore/index.js'
import {
  type CountIdSelector,
  type InstantSnapshotLogDatabase,
  SnapshotLogError,
  type SnapshotLogQueryData,
  type SnapshotLogState,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  countSnapshotWriteFields,
  createSnapshotLogStateDecoder,
  readLogSince,
  snapshotLogPageQuery,
  snapshotLogQuery,
  snapshotLogRecentQuery,
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
    countEntity.update(countSnapshotWriteFields(write.snapshot)),
    messageEntity.update({
      createdAtMs: write.message.createdAtMs,
      from: write.message.from,
      tag: write.message.tag,
      ...(write.message.programVersion === undefined
        ? {}
        : { programVersion: write.message.programVersion }),
    }),
  ])
}

const observe = (
  database: InstantSnapshotLogDatabase,
  query: typeof snapshotLogQuery | typeof snapshotLogRecentQuery,
  decode: (data: SnapshotLogQueryData) => SnapshotLogState,
): Stream.Stream<SnapshotLogState, SnapshotLogError> =>
  Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery(query, response => {
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
              Queue.offerUnsafe(queue, decode(response.data))
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
  )

/**
 * Instant core transport. Browser Processors use this. `readSince` reads
 * only the rows Instant received after a cursor, and `subscribeRecent`
 * follows the newest rows, so a Processor with local state never
 * downloads the whole log.
 */
export const makeInstantCoreSnapshotLogTransport = (
  database: InstantSnapshotLogDatabase,
  countId?: string | CountIdSelector,
): SnapshotLogTransport => {
  const decode = createSnapshotLogStateDecoder(countId)
  const decodeRecent = createSnapshotLogStateDecoder(countId)
  return {
    read: () =>
      Effect.tryPromise({
        try: async () => {
          const response = await database.queryOnce(snapshotLogQuery)
          return decode(response.data)
        },
        catch: cause =>
          new SnapshotLogError({
            cause,
            operation: 'Read',
          }),
      }),
    readSince: maybeCursor =>
      readLogSince(
        offset =>
          database
            .queryOnce(snapshotLogPageQuery(offset))
            .then(response => response.data.message),
        maybeCursor,
      ),
    subscribe: observe(database, snapshotLogQuery, decode),
    subscribeRecent: observe(database, snapshotLogRecentQuery, decodeRecent),
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
  }
}
