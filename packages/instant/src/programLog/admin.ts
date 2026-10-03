import { Cause, Effect, Queue, Stream } from 'effect'

import { init } from '@instantdb/admin'

import { syncedTransactionOutcome } from '../programStore/index.js'
import { applyAdminSubscribePayload } from '../snapshotLog/admin.js'
import {
  InstantSnapshotLogSchema,
  SnapshotLogError,
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

const closeSubscription = (subscription: unknown): void => {
  if (typeof subscription === 'function') {
    subscription()
  } else if (
    typeof subscription === 'object' &&
    subscription !== null &&
    'close' in subscription &&
    typeof subscription.close === 'function'
  ) {
    subscription.close()
  }
}

/**
 * One app's log on the shared Instant project, for trusted Node Processors
 * holding the admin token: the CLI, the TUI, OpenTUI, and headless hosts.
 *
 * @example
 * ```typescript
 * makeAdminProgramLogTransport(appId, adminToken, 'multiple-counters')
 * ```
 */
export const makeAdminProgramLogTransport = (
  appId: string,
  adminToken: string,
  app: string,
): SnapshotLogTransport => {
  const admin = init({ adminToken, appId, schema: InstantSnapshotLogSchema })
  const decode = decodeProgramLogState(app)

  const observe = (
    query:
      | ReturnType<typeof programLogQuery>
      | ReturnType<typeof programLogRecentQuery>,
  ): Stream.Stream<SnapshotLogState, SnapshotLogError> =>
    Stream.callback(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          admin.subscribeQuery(query, payload => {
            applyAdminSubscribePayload(
              payload,
              decode,
              state => {
                Queue.offerUnsafe(queue, state)
              },
              cause => {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new SnapshotLogError({ cause, operation: 'Observe' }),
                  ),
                )
              },
            )
          }),
        ),
        subscription =>
          Effect.sync(() => {
            closeSubscription(subscription)
          }),
      ),
    )

  return {
    read: () =>
      Effect.tryPromise({
        try: async () => decode(await admin.query(programLogQuery(app))),
        catch: cause => new SnapshotLogError({ cause, operation: 'Read' }),
      }),
    readSince: maybeCursor =>
      readLogSince(
        offset =>
          admin
            .query(programLogPageQuery(app, offset))
            .then(result => result.programMessage),
        maybeCursor,
        decodeProgramMessageRow(app),
      ),
    subscribe: observe(programLogQuery(app)),
    subscribeRecent: observe(programLogRecentQuery(app)),
    write: write =>
      Effect.tryPromise({
        try: async () => {
          const table = admin.tx.programMessage
          const entity = table?.[write.message.id]
          if (entity === undefined) {
            throw new Error('Expected a program log transaction entity.')
          }
          await admin.transact([
            entity.update(programMessageFieldsOf(app, write.message)),
          ])
          return syncedTransactionOutcome('admin')
        },
        catch: cause => new SnapshotLogError({ cause, operation: 'Write' }),
      }),
  }
}
