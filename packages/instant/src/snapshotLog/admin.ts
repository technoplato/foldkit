import { Cause, Effect, Queue, Stream } from 'effect'

import { init } from '@instantdb/admin'

import { syncedTransactionOutcome } from '../programStore/index.js'
import {
  InstantSnapshotLogSchema,
  SnapshotLogError,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  decodeSnapshotLogState,
  snapshotLogQuery,
} from './snapshotLog.js'

/** How often the admin transport re-reads the snapshot log. */
export const adminSnapshotLogPollMs = 250

const querySnapshotLogState = async (admin: ReturnType<typeof init>) => {
  const result = await admin.query(snapshotLogQuery)
  return decodeSnapshotLogState(result)
}

const transactSnapshotLogWrite = async (
  admin: ReturnType<typeof init>,
  write: SnapshotLogWrite,
) => {
  const countTable = admin.tx.count
  const messageTable = admin.tx.message
  if (countTable === undefined || messageTable === undefined) {
    throw new Error('Expected count and Message transaction tables.')
  }
  const countEntity = countTable[write.snapshot.id]
  const messageEntity = messageTable[write.message.id]
  if (countEntity === undefined) {
    throw new Error('Expected a count snapshot transaction entity.')
  }
  if (messageEntity === undefined) {
    throw new Error('Expected a Message log transaction entity.')
  }
  await admin.transact([
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

/**
 * Instant admin snapshot log for trusted Node Processors.
 * Instant core skips storage on Node. Admin writes the same entity rows.
 * Admin has no subscribeQuery, so observe polls.
 */
export const makeAdminSnapshotLogTransport = (
  appId: string,
  adminToken: string,
): SnapshotLogTransport => {
  const admin = init({
    adminToken,
    appId,
    schema: InstantSnapshotLogSchema,
  })

  const read = () =>
    Effect.tryPromise({
      try: () => querySnapshotLogState(admin),
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Read',
        }),
    })

  return {
    read,
    subscribe: Stream.callback(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const offer = (): void => {
            Effect.runPromise(read()).then(
              state => {
                Queue.offerUnsafe(queue, state)
              },
              cause => {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(
                    new SnapshotLogError({
                      cause,
                      operation: 'Observe',
                    }),
                  ),
                )
              },
            )
          }
          offer()
          return setInterval(offer, adminSnapshotLogPollMs)
        }),
        handle =>
          Effect.sync(() => {
            clearInterval(handle)
          }),
      ),
    ),
    write: write =>
      Effect.tryPromise({
        try: async () => {
          await transactSnapshotLogWrite(admin, write)
          return syncedTransactionOutcome('admin')
        },
        catch: cause =>
          new SnapshotLogError({
            cause,
            operation: 'Write',
          }),
      }),
  }
}
