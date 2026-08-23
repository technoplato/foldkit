import { Cause, Effect, Queue, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import { SnapshotLogError } from '@foldkit/instant'
import { init } from '@instantdb/core'

import {
  FoldkitPuzzleV01,
  type InstantPuzzleSnapshotLogDatabase,
  InstantPuzzleSnapshotLogSchema,
  type PuzzleSnapshotLogState,
  type PuzzleSnapshotLogTransport,
  type PuzzleSnapshotLogWrite,
  decodePuzzleSnapshotLogState,
  emptyInstantPuzzleSnapshot,
  emptyInstantPuzzleSnapshotLogState,
  fromPuzzleTransport,
  instantReadTimeoutMs,
  missingPuzzleAdminToken,
  puzzleEngineProcessorId,
  puzzleSnapshotLogQuery,
  snapshotLogQueryDataOf,
} from './instantSchema.js'

const transactPuzzleSnapshotLogWrite = (
  database: InstantPuzzleSnapshotLogDatabase,
  write: PuzzleSnapshotLogWrite,
) => {
  const tapeEntity = database.tx.tape[write.snapshot.id]
  const messageEntity = database.tx.message[write.message.id]
  if (tapeEntity === undefined) {
    throw new Error('Expected a tape snapshot transaction entity.')
  }
  if (messageEntity === undefined) {
    throw new Error('Expected a Message log transaction entity.')
  }
  const encoded = write.snapshot
  return database.transact([
    tapeEntity.update({
      asOf: encoded.asOf,
      at: encoded.at,
      prompt: encoded.prompt,
      steps: encoded.steps,
    }),
    messageEntity.update({
      createdAtMs: write.message.createdAtMs,
      from: write.message.from,
      tag: write.message.tag,
    }),
  ])
}

const snapshotLogFromQueryOnceResponse = (
  response: unknown,
): PuzzleSnapshotLogState => {
  try {
    const decoded = decodePuzzleSnapshotLogState(
      snapshotLogQueryDataOf(response),
    )
    if (decoded.snapshot === undefined) {
      return {
        messages: decoded.messages,
        snapshot: emptyInstantPuzzleSnapshot,
      }
    }
    return decoded
  } catch {
    return emptyInstantPuzzleSnapshotLogState
  }
}

/**
 * Instant `queryOnce` waits until AUTHENTICATED. Instant does not abort.
 * Effect timeout interrupt would wait until Instant's 30s timer, so this
 * races the Puzzle cap. A real Instant error rejects. Timeout after a
 * real wait Ready-paints empty Instant, not Program init.
 */
export const queryOncePuzzleSnapshotLogState = (
  queryOnce: () => Promise<unknown>,
  signal: AbortSignal,
): Promise<PuzzleSnapshotLogState> =>
  new Promise((resolve, reject) => {
    let isSettled = false
    const finishOk = (state: PuzzleSnapshotLogState): void => {
      if (isSettled) {
        return
      }
      isSettled = true
      resolve(state)
    }
    const finishErr = (cause: unknown): void => {
      if (isSettled) {
        return
      }
      isSettled = true
      reject(cause)
    }
    const timer = globalThis.setTimeout(() => {
      finishOk(emptyInstantPuzzleSnapshotLogState)
    }, instantReadTimeoutMs)
    const onAbort = (): void => {
      globalThis.clearTimeout(timer)
      finishOk(emptyInstantPuzzleSnapshotLogState)
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void queryOnce().then(
      response => {
        globalThis.clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        finishOk(snapshotLogFromQueryOnceResponse(response))
      },
      cause => {
        globalThis.clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        finishErr(cause)
      },
    )
  })

/** Instant core transport. Browser Processors use this. */
export const makeInstantCorePuzzleSnapshotLogTransport = (
  database: InstantPuzzleSnapshotLogDatabase,
): PuzzleSnapshotLogTransport => ({
  read: () =>
    Effect.tryPromise({
      try: signal =>
        queryOncePuzzleSnapshotLogState(
          () => database.queryOnce(puzzleSnapshotLogQuery),
          signal,
        ),
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Read',
        }),
    }),
  subscribe: Stream.callback(queue =>
    Effect.acquireRelease(
      Effect.sync(() =>
        database.subscribeQuery(puzzleSnapshotLogQuery, response => {
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
              Queue.offerUnsafe(
                queue,
                decodePuzzleSnapshotLogState(snapshotLogQueryDataOf(response)),
              )
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
      try: async () => {
        await transactPuzzleSnapshotLogWrite(database, write)
        return { _tag: 'Synced' as const }
      },
      catch: cause =>
        new SnapshotLogError({
          cause,
          operation: 'Write',
        }),
    }),
})

const coreDatabasesKey = Symbol.for('foldkit.puzzle.snapshotLog.coreDatabases')

type CoreDatabaseCache = Map<string, InstantPuzzleSnapshotLogDatabase>

const coreDatabases = (): CoreDatabaseCache => {
  const global = globalThis as typeof globalThis & {
    [coreDatabasesKey]?: CoreDatabaseCache
  }
  const existing = global[coreDatabasesKey]
  if (existing !== undefined) {
    return existing
  }
  const created: CoreDatabaseCache = new Map()
  global[coreDatabasesKey] = created
  return created
}

/** Instant() arguments for one live Puzzle. Instant has no Model. */
export type InstantPuzzleOptions = Readonly<{
  app?: Readonly<{ readonly id: string }>
  processor: Processor.Host.Host
  instance?: string
  database?: InstantPuzzleSnapshotLogDatabase
  transport?: PuzzleSnapshotLogTransport
}>

const resolveDatabase = (
  options: InstantPuzzleOptions,
): InstantPuzzleSnapshotLogDatabase => {
  if (options.database !== undefined) {
    return options.database
  }
  const appId = options.app?.id ?? FoldkitPuzzleV01.id
  const cache = coreDatabases()
  const existing = cache.get(appId)
  if (existing !== undefined) {
    return existing
  }
  const created = init({
    appId,
    schema: InstantPuzzleSnapshotLogSchema,
  })
  cache.set(appId, created)
  return created
}

const openPuzzleDatabase = (
  options: InstantPuzzleOptions,
): InstantPuzzleSnapshotLogDatabase => resolveDatabase(options)

/**
 * Instant SyncEngine for a browser Processor.
 *
 * Boot calls Instant `queryOnce` and waits for AUTHENTICATED or a real
 * Instant error. Runtime.start Ready-paints that snapshot. Empty Instant
 * after a real read Ready-paints empty Instant, not Program init.
 *
 * Pass `transport` in tests. Pass `database` when the Host already opened
 * Instant core. Otherwise Instant() opens core from FoldkitPuzzleV01.
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
  return fromPuzzleTransport(
    makeInstantCorePuzzleSnapshotLogTransport(openPuzzleDatabase(options)),
    processor,
  )
}

export { missingPuzzleAdminToken }
