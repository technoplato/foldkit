import {
  Message,
  Model,
  NodeLive,
  type SnapshotLogTransport,
  type SyncedCounterHandle,
  isMemoryTape,
  startLiveCounter,
  waitForSyncedHandle,
  waitForSyncedHandleWrite,
} from 'counter-core-example'
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

import { CounterCliError, countOfReady, readyCount } from './cliError.js'
import { counterCliIsolationKey, counterCliProgramId } from './isolation.js'

/** Optional Instant count snapshot for one CLI execution. */
export type CliTapeOptions = Readonly<{
  snapshot?: SnapshotLogTransport
}>

/** One view of the CLI Processor. Memory stays in-process. Instant uses the daemon. */
export type CounterCliSession = Readonly<{
  read: () => Effect.Effect<Model, CounterCliError>
  run: (message: Message) => Effect.Effect<
    Readonly<{
      previous: Model
      model: Model
      link: 'offline' | 'queued' | 'delivered'
    }>,
    CounterCliError
  >
}>

const daemonScriptPath = fileURLToPath(new URL('./daemon.js', import.meta.url))

export { counterCliIsolationKey } from './isolation.js'

/** Socket for this Program and tape. */
export const counterCliSocketPath = (): string =>
  cliDaemonSocketPath({
    programId: counterCliProgramId,
    isolationKey: counterCliIsolationKey(),
  })

const usesCliDaemon = (options: CliTapeOptions): boolean =>
  options.snapshot === undefined && !isMemoryTape()

const startCliHandle = (options: CliTapeOptions): SyncedCounterHandle => {
  if (options.snapshot !== undefined) {
    return startLiveCounter(
      NodeLive(Processor.Host.Cli(), {
        transport: options.snapshot,
      }),
    )
  }
  return startLiveCounter(NodeLive(Processor.Host.Cli()))
}

const waitReady = (
  handle: SyncedCounterHandle,
): Effect.Effect<Model, CounterCliError> =>
  Effect.gen(function* () {
    const settled = yield* Effect.tryPromise({
      try: () => waitForSyncedHandle(handle),
      catch: error =>
        new CounterCliError({
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
  handle: SyncedCounterHandle,
  writeFailed = 'Cannot append the Instant tape.',
): Effect.Effect<
  Readonly<{
    model: Model
    write: Option.Option<{
      readonly link: 'offline' | 'queued' | 'delivered'
    }>
  }>,
  CounterCliError
> =>
  Effect.gen(function* () {
    const write = yield* Effect.tryPromise({
      try: () => waitForSyncedHandleWrite(handle),
      catch: error =>
        new CounterCliError({
          message: error instanceof Error ? error.message : writeFailed,
        }),
    })
    const model = yield* readyCount(handle.readModel())
    return { model, write }
  })

/** Memory-host helper. Instant Do must use settleAfterSend, not this. */
export const waitForReadyCountChange = (
  handle: SyncedCounterHandle,
  previous: Model,
): Effect.Effect<Model, CounterCliError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<Model>((resolve, reject) => {
        const finish = (): void => {
          const settled = handle.readModel()
          if (settled._tag !== 'Ready') {
            return
          }
          const count = countOfReady(settled)
          if (count === undefined || count === previous.count) {
            return
          }
          clearTimeout(timeout)
          stop()
          resolve(Model.make({ count }))
        }
        const timeout = setTimeout(() => {
          stop()
          reject(new Error('CLI waited for the count to change after send.'))
        }, 2_000)
        const stop = handle.subscribe(() => {
          finish()
        })
        finish()
      }),
    catch: error =>
      new CounterCliError({
        message:
          error instanceof Error
            ? error.message
            : 'CLI waited for the count to change after send.',
      }),
  })

const inProcessSession = (handle: SyncedCounterHandle): CounterCliSession => ({
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

const toCliError = (error: { readonly message: string }): CounterCliError =>
  new CounterCliError({
    message: error.message,
  })

const daemonSession = (): CounterCliSession => {
  const socketPath = counterCliSocketPath()
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
              new CounterCliError({
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

const openDaemonSession = (): Effect.Effect<
  CounterCliSession,
  CounterCliError
> =>
  ensureCliDaemon({
    socketPath: counterCliSocketPath(),
    spawn: () =>
      spawnCliDaemon({
        scriptPath: daemonScriptPath,
      }),
  }).pipe(Effect.mapError(toCliError), Effect.as(daemonSession()))

const openInProcessSession = (
  options: CliTapeOptions,
): Effect.Effect<
  Readonly<{
    session: CounterCliSession
    initialModel: Model
    stop: () => Promise<void>
  }>,
  CounterCliError
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
    session: CounterCliSession,
    initialModel: Model,
  ) => Effect.Effect<A, CounterCliError>,
  options: CliTapeOptions,
): Effect.Effect<A, CounterCliError> => {
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
