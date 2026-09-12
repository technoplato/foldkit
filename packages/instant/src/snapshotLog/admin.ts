import { Cause, Effect, Queue, Stream } from 'effect'

import { init } from '@instantdb/admin'

import { syncedTransactionOutcome } from '../programStore/index.js'
import {
  InstantSnapshotLogSchema,
  SnapshotLogError,
  type SnapshotLogQueryData,
  type SnapshotLogState,
  type SnapshotLogTransport,
  type SnapshotLogWrite,
  createSnapshotLogStateDecoder,
  snapshotLogQuery,
} from './snapshotLog.js'

const querySnapshotLogState = async (
  admin: ReturnType<typeof init>,
  decode: ReturnType<typeof createSnapshotLogStateDecoder>,
) => {
  const result = await admin.query(snapshotLogQuery)
  return decode(result)
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

/**
 * Instant admin subscribeQuery payloads use `{ type: 'error' }` or
 * `{ data }`. Older admin callbacks used `{ error }`.
 */
const queryDataFromUnknown = (data: unknown): SnapshotLogQueryData => {
  if (!isRecord(data)) {
    return {}
  }
  const count = data['count']
  const message = data['message']
  return {
    ...(globalThis.Array.isArray(count) ? { count } : {}),
    ...(globalThis.Array.isArray(message) ? { message } : {}),
  }
}

export const applyAdminSubscribePayload = (
  payload: unknown,
  decode: (data: SnapshotLogQueryData) => SnapshotLogState,
  onState: (state: SnapshotLogState) => void,
  onError: (cause: unknown) => void,
): void => {
  if (!isRecord(payload)) {
    onError(payload)
    return
  }
  if (payload['type'] === 'error' || payload['error'] !== undefined) {
    onError(payload['error'] ?? payload)
    return
  }
  try {
    onState(decode(queryDataFromUnknown(payload['data'])))
  } catch (cause) {
    onError(cause)
  }
}

const closeAdminSubscription = (subscription: unknown): void => {
  if (typeof subscription === 'function') {
    subscription()
    return
  }
  if (!isRecord(subscription)) {
    return
  }
  const close = subscription['close']
  if (typeof close === 'function') {
    close.call(subscription)
  }
}

/**
 * Instant admin snapshot log for trusted Node Processors.
 * Instant core skips storage on Node. Admin writes the same entity rows.
 * Observe uses admin subscribeQuery. It does not poll.
 */
export const makeAdminSnapshotLogTransport = (
  appId: string,
  adminToken: string,
  countId?: string,
): SnapshotLogTransport => {
  const admin = init({
    adminToken,
    appId,
    schema: InstantSnapshotLogSchema,
  })
  const decode = createSnapshotLogStateDecoder(countId)

  const read = () =>
    Effect.tryPromise({
      try: () => querySnapshotLogState(admin, decode),
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
        Effect.sync(() =>
          admin.subscribeQuery(snapshotLogQuery, payload => {
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
                    new SnapshotLogError({
                      cause,
                      operation: 'Observe',
                    }),
                  ),
                )
              },
            )
          }),
        ),
        subscription =>
          Effect.sync(() => {
            closeAdminSubscription(subscription)
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
