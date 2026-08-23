import { Effect, Option } from 'effect'
import { Processor } from 'foldkit'
import {
  CliDaemonRead,
  askCliDaemon,
  cliDaemonSocketPath,
  ensureCliDaemon,
  spawnCliDaemon,
} from 'foldkit/cli'
import { fileURLToPath } from 'node:url'
import {
  Message,
  Model,
  NodeLive,
  type SnapshotLogTransport,
  type SyncedPuzzleHandle,
  isMemoryTape,
  productOfReady,
  startLivePuzzle,
  uriOf,
  waitForSyncedHandle,
  waitForSyncedHandleWrite,
} from 'puzzle-core-example'

import { PuzzleCliError, readyCount } from './cliError.js'
import { puzzleCliIsolationKey, puzzleCliProgramId } from './isolation.js'

/** Optional Instant tape snapshot for one CLI execution. */
export type CliTapeOptions = Readonly<{
  snapshot?: SnapshotLogTransport
}>

/** One view of the CLI Processor. Memory stays in-process. Instant uses the daemon. */
export type PuzzleCliSession = Readonly<{
  read: () => Effect.Effect<Model, PuzzleCliError>
  run: (message: Message) => Effect.Effect<
    Readonly<{
      previous: Model
      model: Model
      link: 'offline' | 'queued' | 'delivered'
    }>,
    PuzzleCliError
  >
}>

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

export { puzzleCliIsolationKey } from './isolation.js'

/** Socket for this Program and tape. */
export const puzzleCliSocketPath = (): string =>
  cliDaemonSocketPath({
    programId: puzzleCliProgramId,
    isolationKey: puzzleCliIsolationKey(),
  })

const usesCliDaemon = (options: CliTapeOptions): boolean =>
  options.snapshot === undefined && !isMemoryTape()

const startCliHandle = (options: CliTapeOptions): SyncedPuzzleHandle => {
  if (options.snapshot !== undefined) {
    return startLivePuzzle(
      NodeLive(Processor.Host.Cli(), {
        transport: options.snapshot,
      }),
    )
  }
  return startLivePuzzle(NodeLive(Processor.Host.Cli()))
}

const waitReady = (
  handle: SyncedPuzzleHandle,
): Effect.Effect<Model, PuzzleCliError> =>
  Effect.gen(function* () {
    const settled = yield* Effect.tryPromise({
      try: () => waitForSyncedHandle(handle),
      catch: error =>
        new PuzzleCliError({
          message:
            error instanceof Error
              ? error.message
              : 'CLI waited for Ready and Instant stayed Starting.',
        }),
    })
    return yield* readyCount(settled)
  })

const linkOf = (
  write: Option.Option<{
    readonly link: 'offline' | 'queued' | 'delivered'
  }>,
): 'offline' | 'queued' | 'delivered' => {
  if (Option.isNone(write)) {
    return 'offline'
  }
  return write.value.link
}

/**
 * After send, wait for the local Instant write and then read Ready.
 * Do not wait for Instant to echo this Processor's own row. Runtime.start
 * skips live rows whose `from` is this Processor.
 */
export const settleAfterSend = (
  handle: SyncedPuzzleHandle,
  writeFailed = 'Cannot append the Instant tape.',
): Effect.Effect<
  Readonly<{
    model: Model
    write: Option.Option<{
      readonly link: 'offline' | 'queued' | 'delivered'
    }>
  }>,
  PuzzleCliError
> =>
  Effect.gen(function* () {
    const write = yield* Effect.tryPromise({
      try: () => waitForSyncedHandleWrite(handle),
      catch: error =>
        new PuzzleCliError({
          message: error instanceof Error ? error.message : writeFailed,
        }),
    })
    const model = yield* readyCount(handle.readModel())
    return { model, write }
  })

/** Memory-host helper. Instant Do must use settleAfterSend, not this. */
export const waitForReadyCountChange = (
  handle: SyncedPuzzleHandle,
  previous: Model,
): Effect.Effect<Model, PuzzleCliError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<Model>((resolve, reject) => {
        const finish = (): void => {
          const settled = handle.readModel()
          if (settled._tag !== 'Ready') {
            return
          }
          const product = productOfReady(settled)
          if (product === undefined || uriOf(product) === uriOf(previous)) {
            return
          }
          clearTimeout(timeout)
          stop()
          resolve(product)
        }
        const timeout = setTimeout(() => {
          stop()
          reject(new Error('CLI waited for the tape to change after send.'))
        }, 2_000)
        const stop = handle.subscribe(() => {
          finish()
        })
        finish()
      }),
    catch: error =>
      new PuzzleCliError({
        message:
          error instanceof Error
            ? error.message
            : 'CLI waited for the tape to change after send.',
      }),
  })

const inProcessSession = (handle: SyncedPuzzleHandle): PuzzleCliSession => ({
  read: () => readyCount(handle.readModel()),
  run: message =>
    Effect.gen(function* () {
      const previous = yield* readyCount(handle.readModel())
      handle.send(message)
      const settled = yield* settleAfterSend(handle)
      return {
        previous,
        model: settled.model,
        link: linkOf(settled.write),
      }
    }),
})

const toCliError = (error: { readonly message: string }): PuzzleCliError =>
  new PuzzleCliError({
    message: error.message,
  })

const daemonSession = (): PuzzleCliSession => {
  const socketPath = puzzleCliSocketPath()
  return {
    read: () =>
      askCliDaemon({
        socketPath,
        Model,
        Message,
        request: CliDaemonRead(),
      }).pipe(
        Effect.mapError(toCliError),
        Effect.map(response => response.model),
      ),
    run: message =>
      askCliDaemon({
        socketPath,
        Model,
        Message,
        request: { _tag: 'Run', message },
      }).pipe(
        Effect.mapError(toCliError),
        Effect.flatMap(response => {
          if (response.previous === undefined) {
            return Effect.fail(
              new PuzzleCliError({
                message: 'CLI daemon Run did not return the previous Model.',
              }),
            )
          }
          return Effect.succeed({
            previous: response.previous,
            model: response.model,
            link: 'delivered' as const,
          })
        }),
      ),
  }
}

const openDaemonSession = (): Effect.Effect<PuzzleCliSession, PuzzleCliError> =>
  ensureCliDaemon({
    socketPath: puzzleCliSocketPath(),
    spawn: () =>
      spawnCliDaemon({
        scriptPath: daemonScriptPath,
      }),
  }).pipe(Effect.mapError(toCliError), Effect.as(daemonSession()))

const openInProcessSession = (
  options: CliTapeOptions,
): Effect.Effect<
  Readonly<{
    session: PuzzleCliSession
    initialModel: Model
    stop: () => Promise<void>
  }>,
  PuzzleCliError
> =>
  Effect.gen(function* () {
    const handle = startCliHandle(options)
    const initialModel = yield* waitReady(handle)
    return {
      session: inProcessSession(handle),
      initialModel,
      stop: () => handle.stop(),
    }
  })

/**
 * Opens a CLI session. Memory and injected snapshots stay in this process.
 * Instant and file tapes use the Foldkit CLI daemon. Stop a leftover
 * Instant daemon with `stopCliDaemon` or the pid in `/tmp/fkc-*.pid`.
 */
export const withSession = <A>(
  body: (
    session: PuzzleCliSession,
    initialModel: Model,
  ) => Effect.Effect<A, PuzzleCliError>,
  options: CliTapeOptions,
): Effect.Effect<A, PuzzleCliError> => {
  if (usesCliDaemon(options)) {
    return Effect.gen(function* () {
      const session = yield* openDaemonSession()
      const initialModel = yield* session.read()
      return yield* body(session, initialModel)
    })
  }
  return Effect.gen(function* () {
    const opened = yield* openInProcessSession(options)
    return yield* body(opened.session, opened.initialModel).pipe(
      Effect.ensuring(Effect.promise(() => opened.stop())),
    )
  })
}
