import { Cause, Effect, Queue, Stream } from 'effect'
import { Runtime } from 'foldkit'

import { SnapshotLogError } from '@foldkit/instant'
import { init } from '@instantdb/admin'

import {
  FoldkitPuzzleV01,
  InstantPuzzleSnapshotLogSchema,
  type InstantPuzzleSnapshotRecord,
  type PuzzleSnapshotLogQueryData,
  type PuzzleSnapshotLogState,
  type PuzzleSnapshotLogTransport,
  type PuzzleSnapshotLogWrite,
  decodePuzzleSnapshotLogState,
  fromPuzzleTransport,
  missingPuzzleAdminToken,
  puzzleEngineProcessorId,
  puzzleSnapshotLogQuery,
} from './instantSchema.js'
import type { InstantPuzzleOptions } from './instantTransport.js'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const queryDataFromUnknown = (data: unknown): PuzzleSnapshotLogQueryData => {
  if (!isRecord(data)) {
    return {}
  }
  const tape = data['tape']
  const message = data['message']
  return {
    ...(globalThis.Array.isArray(tape) ? { tape } : {}),
    ...(globalThis.Array.isArray(message) ? { message } : {}),
  }
}

const transactPuzzleSnapshotLogWrite = async (
  admin: ReturnType<typeof init>,
  write: PuzzleSnapshotLogWrite,
) => {
  const tapeTable = admin.tx['tape']
  const messageTable = admin.tx['message']
  if (tapeTable === undefined || messageTable === undefined) {
    throw new Error('Expected tape and Message transaction tables.')
  }
  const tapeEntity = tapeTable[write.snapshot.id]
  const messageEntity = messageTable[write.message.id]
  if (tapeEntity === undefined) {
    throw new Error('Expected a tape snapshot transaction entity.')
  }
  if (messageEntity === undefined) {
    throw new Error('Expected a Message log transaction entity.')
  }
  await admin.transact([
    tapeEntity.update({
      asOf: write.snapshot.asOf,
      at: write.snapshot.at,
      prompt: write.snapshot.prompt,
      steps: write.snapshot.steps,
    }),
    messageEntity.update({
      createdAtMs: write.message.createdAtMs,
      from: write.message.from,
      tag: write.message.tag,
    }),
  ])
}

const applyAdminSubscribePayload = (
  payload: unknown,
  onState: (state: PuzzleSnapshotLogState) => void,
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
    onState(decodePuzzleSnapshotLogState(queryDataFromUnknown(payload['data'])))
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
 */
export const makeAdminPuzzleSnapshotLogTransport = (
  appId: string,
  adminToken: string,
): PuzzleSnapshotLogTransport => {
  const admin = init({
    adminToken,
    appId,
    schema: InstantPuzzleSnapshotLogSchema,
  })

  return {
    read: () =>
      Effect.tryPromise({
        try: async () => {
          const result = await admin.query(puzzleSnapshotLogQuery)
          return decodePuzzleSnapshotLogState(result)
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
          admin.subscribeQuery(puzzleSnapshotLogQuery, payload => {
            applyAdminSubscribePayload(
              payload,
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
          await transactPuzzleSnapshotLogWrite(admin, write)
          return { _tag: 'Synced' as const }
        },
        catch: cause =>
          new SnapshotLogError({
            cause,
            operation: 'Write',
          }),
      }),
  }
}

const adminTokenFromEnv = (): string | undefined => {
  const token = globalThis as typeof globalThis & {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>
    }
  }
  const value = token.process?.env?.['INSTANT_APP_ADMIN_TOKEN']
  if (value === undefined || value === '') {
    return undefined
  }
  return value
}

/**
 * Instant SyncEngine for a trusted Node Processor.
 *
 * Pass `transport` in tests. Otherwise Instant() uses the admin token from
 * the trusted wrapper. Instant never prints that token.
 *
 * Instant has no Model. Runtime.start reads and writes through Schemas.
 */
export const InstantPuzzle = (
  options: InstantPuzzleOptions,
): Runtime.SyncEngine => {
  const processor = puzzleEngineProcessorId(options)
  if (options.transport !== undefined) {
    return fromPuzzleTransport(options.transport, processor)
  }
  const adminToken = adminTokenFromEnv()
  if (adminToken === undefined) {
    return missingPuzzleAdminToken(processor)
  }
  return fromPuzzleTransport(
    makeAdminPuzzleSnapshotLogTransport(
      options.app?.id ?? FoldkitPuzzleV01.id,
      adminToken,
    ),
    processor,
  )
}

export type { InstantPuzzleSnapshotRecord }
