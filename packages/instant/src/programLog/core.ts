import { Cause, Effect, Queue, Stream } from 'effect'

import { decodeProgramStoreTransactionOutcome } from '../instantProgramStore/index.js'
import {
  type InstantSnapshotLogDatabase,
  SnapshotLogError,
  type SnapshotLogQueryData,
  type SnapshotLogState,
  type SnapshotLogTransport,
  readLogSince,
} from '../snapshotLog/snapshotLog.js'
import {
  decodeProgramLogState,
  decodeProgramMessageRow,
  programLogPageQuery,
  programLogQuery,
  programLogRecentQuery,
  programMessageFieldsOf,
} from './programLog.js'

const observe = (
  database: InstantSnapshotLogDatabase,
  query:
    | ReturnType<typeof programLogQuery>
    | ReturnType<typeof programLogRecentQuery>,
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
                  new SnapshotLogError({ cause, operation: 'Decode' }),
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
 * One app's log on the shared Instant project, for browser and native
 * Processors. It reads, follows, and writes only the rows that app wrote,
 * through the app's envelope, so two apps on one project never see each
 * other's Messages.
 *
 * @example
 * ```typescript
 * makeInstantCoreProgramLogTransport(database, 'multiple-counters')
 * ```
 */
export const makeInstantCoreProgramLogTransport = (
  database: InstantSnapshotLogDatabase,
  app: string,
): SnapshotLogTransport => {
  const decode = decodeProgramLogState(app)
  return {
    read: () =>
      Effect.tryPromise({
        try: async () => {
          const response = await database.queryOnce(programLogQuery(app))
          return decode(response.data)
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Read' }),
      }),
    readSince: maybeCursor =>
      readLogSince(
        offset =>
          database
            .queryOnce(programLogPageQuery(app, offset))
            .then(response => response.data.programMessage),
        maybeCursor,
        decodeProgramMessageRow(app),
      ),
    subscribe: observe(database, programLogQuery(app), decode),
    subscribeRecent: observe(database, programLogRecentQuery(app), decode),
    write: write =>
      Effect.tryPromise({
        try: () => {
          const entity = database.tx.programMessage[write.message.id]
          if (entity === undefined) {
            throw new Error('Expected a program log transaction entity.')
          }
          return database
            .transact([
              entity.update(programMessageFieldsOf(app, write.message)),
            ])
            .then(decodeProgramStoreTransactionOutcome)
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Write' }),
      }),
  }
}
