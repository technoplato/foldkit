/// <reference types="node" />
import { Effect, Option, Schema as S, String } from 'effect'
import { type ChildProcess, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { type Socket, connect } from 'node:net'

import type { ProgramSchema } from '../program/program.js'
import {
  cliDaemonLockPath,
  cliDaemonPidPath,
  removeCliDaemonFiles,
  removeCliDaemonSocketAndPid,
  tryAcquireCliDaemonLock,
} from './paths.js'
import {
  CliDaemonError,
  CliDaemonRead,
  cliDaemonReadyTimeoutMs,
} from './protocol.js'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const connectSocket = (socketPath: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect(socketPath)
    const onConnect = (): void => {
      socket.off('error', onError)
      resolve(socket)
    }
    const onError = (cause: Error): void => {
      socket.off('connect', onConnect)
      reject(cause)
    }
    socket.once('connect', onConnect)
    socket.once('error', onError)
  })

const readLine = (socket: Socket): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk: Buffer): void => {
      buffer = `${buffer}${chunk.toString('utf8')}`
      const maybeNewline = String.indexOf('\n')(buffer)
      if (Option.isNone(maybeNewline)) {
        return
      }
      cleanup()
      resolve(buffer.slice(0, maybeNewline.value).replace(/\r$/, ''))
    }
    const onClose = (): void => {
      cleanup()
      reject(new Error('CLI daemon closed before a response.'))
    }
    const onError = (cause: Error): void => {
      cleanup()
      reject(cause)
    }
    const cleanup = (): void => {
      socket.off('data', onData)
      socket.off('close', onClose)
      socket.off('error', onError)
    }
    socket.on('data', onData)
    socket.on('close', onClose)
    socket.on('error', onError)
  })

const toDaemonError = (cause: unknown, fallback: string): CliDaemonError =>
  new CliDaemonError({
    message: cause instanceof Error ? cause.message : fallback,
  })

/** True when something is accepting connections on the daemon socket. */
export const isCliDaemonListening = (
  socketPath: string,
): Effect.Effect<boolean> =>
  Effect.tryPromise(() => connectSocket(socketPath)).pipe(
    Effect.map(socket => {
      socket.end()
      return true
    }),
    Effect.catch(() => Effect.succeed(false)),
  )

/** Starts a detached daemon process. The caller supplies the script. */
export const spawnCliDaemon = (options: {
  readonly scriptPath: string
  readonly argv?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, string | undefined>>
}): ChildProcess => {
  const argv = options.argv ?? []
  const child = spawn(process.execPath, [options.scriptPath, ...argv], {
    detached: true,
    env: options.env ?? process.env,
    stdio: 'ignore',
  })
  child.unref()
  return child
}

const waitForListen = (
  socketPath: string,
  timeoutMs: number,
): Effect.Effect<void, CliDaemonError> =>
  Effect.gen(function* () {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (yield* isCliDaemonListening(socketPath)) {
        return
      }
      yield* Effect.sleep('50 millis')
    }
    return yield* Effect.fail(
      new CliDaemonError({
        message: `CLI daemon did not start at ${socketPath}.`,
      }),
    )
  })

const recoverStaleCliDaemonLock = (socketPath: string): void => {
  try {
    const pidText = readFileSync(cliDaemonLockPath(socketPath), 'utf8').trim()
    const pid = Number(pidText)
    if (!Number.isFinite(pid) || pid <= 0) {
      removeCliDaemonFiles(socketPath)
      return
    }
    process.kill(pid, 0)
  } catch {
    removeCliDaemonFiles(socketPath)
  }
}

/** Starts the daemon on first invoke. Later CLIs reuse the same socket. */
export const ensureCliDaemon = (options: {
  readonly socketPath: string
  readonly spawn: () => ChildProcess
  readonly timeoutMs?: number
}): Effect.Effect<void, CliDaemonError> =>
  Effect.gen(function* () {
    const isListening = yield* isCliDaemonListening(options.socketPath).pipe(
      Effect.withSpan('cli.ensure.probe'),
    )
    yield* Effect.annotateCurrentSpan('daemonWasListening', isListening)
    if (isListening) {
      return
    }
    recoverStaleCliDaemonLock(options.socketPath)
    const wonLock = tryAcquireCliDaemonLock(options.socketPath)
    yield* Effect.annotateCurrentSpan('wonLock', wonLock)
    if (wonLock) {
      removeCliDaemonSocketAndPid(options.socketPath)
      options.spawn()
    }
    yield* waitForListen(
      options.socketPath,
      options.timeoutMs ?? cliDaemonReadyTimeoutMs,
    ).pipe(Effect.withSpan('cli.ensure.spawnWait'))
  }).pipe(Effect.withSpan('cli.ensure'))

/** One Read or Run against the daemon Processor. */
export const askCliDaemon = <Model, Message>(options: {
  readonly socketPath: string
  readonly Model: ProgramSchema<Model>
  readonly Message: ProgramSchema<Message>
  readonly request:
    | typeof CliDaemonRead.Type
    | Readonly<{
        readonly _tag: 'Run'
        readonly message: Message
      }>
}): Effect.Effect<
  Readonly<{
    readonly model: Model
    readonly previous?: Model
  }>,
  CliDaemonError
> => {
  const spanName =
    options.request._tag === 'Read' ? 'cli.ask.Read' : 'cli.ask.Run'
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan('request', options.request._tag)
    const socket = yield* Effect.tryPromise({
      try: () => connectSocket(options.socketPath),
      catch: cause => toDaemonError(cause, 'CLI view could not connect.'),
    })
    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          socket.write(`${JSON.stringify(options.request)}\n`, error => {
            if (error !== undefined && error !== null) {
              reject(error)
              return
            }
            resolve()
          })
        }),
      catch: cause => toDaemonError(cause, 'CLI view could not write.'),
    })
    const line = yield* Effect.tryPromise({
      try: () => readLine(socket),
      catch: cause => toDaemonError(cause, 'CLI view could not read.'),
    })
    socket.end()
    const parsed = yield* Effect.try({
      try: () => JSON.parse(line) as unknown,
      catch: cause =>
        toDaemonError(cause, 'CLI view could not parse the daemon response.'),
    })
    if (isRecord(parsed) && parsed['_tag'] === 'Failed') {
      const cause =
        typeof parsed['cause'] === 'string'
          ? parsed['cause']
          : 'CLI daemon failed.'
      return yield* Effect.fail(new CliDaemonError({ message: cause }))
    }
    if (!isRecord(parsed) || parsed['_tag'] !== 'Ok') {
      return yield* Effect.fail(
        new CliDaemonError({
          message: 'CLI daemon response must be Ok.',
        }),
      )
    }
    const model = yield* Effect.try({
      try: () => S.decodeUnknownSync(options.Model)(parsed['model']),
      catch: cause =>
        toDaemonError(cause, 'CLI view could not decode the daemon Model.'),
    })
    if (parsed['previous'] === undefined) {
      return { model }
    }
    const previous = yield* Effect.try({
      try: () => S.decodeUnknownSync(options.Model)(parsed['previous']),
      catch: cause =>
        toDaemonError(cause, 'CLI view could not decode the previous Model.'),
    })
    return { model, previous }
  }).pipe(Effect.withSpan(spanName))
}

/**
 * Stops the daemon for one socket. Reads `/tmp/fkc-*.pid` next to that
 * socket, sends SIGTERM, and removes the socket, pid, and lock.
 *
 * A leftover daemon keeps the old Do wait. After a rebuild, stop it so
 * the next `show` or `do` starts the current `daemon.js`.
 */
export const stopCliDaemon = (socketPath: string): Effect.Effect<void> =>
  Effect.sync(() => {
    try {
      const pidText = readFileSync(cliDaemonPidPath(socketPath), 'utf8').trim()
      const pid = Number(pidText)
      if (Number.isFinite(pid) && pid > 0) {
        process.kill(pid, 'SIGTERM')
      }
    } catch {
      // The daemon is already gone.
    }
    removeCliDaemonFiles(socketPath)
  })
