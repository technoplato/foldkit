/// <reference types="node" />
import { Effect, Option, Schema as S, type Scope, String } from 'effect'
import { type Server, type Socket, createServer } from 'node:net'

import type { ProgramSchema } from '../program/program.js'
import { removeCliDaemonFiles, writeCliDaemonPid } from './paths.js'
import {
  CliDaemonDo,
  CliDaemonError,
  CliDaemonFailed,
  type CliDaemonFlags,
  CliDaemonPainted,
  CliDaemonShow,
  type CliDaemonSurface,
} from './protocol.js'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

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
      if (buffer === '') {
        resolve('')
        return
      }
      resolve(buffer.replace(/\r$/, ''))
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

const writeLine = (socket: Socket, line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.write(`${line}\n`, error => {
      if (error !== undefined && error !== null) {
        reject(error)
        return
      }
      resolve()
    })
  })

const decodeRunMessage = <Message>(
  Message: ProgramSchema<Message>,
  value: unknown,
): Message => S.decodeUnknownSync(Message)(value)

const handleConnection = <Model, Message>(
  socket: Socket,
  _Model: ProgramSchema<Model>,
  Message: ProgramSchema<Message>,
  surface: CliDaemonSurface<Model, Message>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const line = yield* Effect.tryPromise({
      try: () => readLine(socket),
      catch: cause =>
        new CliDaemonError({
          message: cause instanceof Error ? cause.message : 'Read failed.',
        }),
    })
    if (line === '') {
      socket.end()
      return
    }
    const encoded = yield* Effect.gen(function* () {
      const parsed = yield* Effect.try({
        try: () => JSON.parse(line) as unknown,
        catch: cause =>
          new CliDaemonError({
            message:
              cause instanceof Error
                ? cause.message
                : 'CLI daemon could not parse the request.',
          }),
      })
      if (!isRecord(parsed)) {
        return yield* Effect.fail(
          new CliDaemonError({
            message: 'CLI daemon request must be an object.',
          }),
        )
      }
      if (parsed['_tag'] === 'Read') {
        const model = yield* surface.read()
        return { _tag: 'Ok' as const, model }
      }
      if (parsed['_tag'] === 'Run') {
        const message = yield* Effect.try({
          try: () => decodeRunMessage(Message, parsed['message']),
          catch: cause =>
            new CliDaemonError({
              message:
                cause instanceof Error
                  ? cause.message
                  : 'CLI daemon could not decode the Message.',
            }),
        })
        const ran = yield* surface.run(message)
        return {
          _tag: 'Ok' as const,
          model: ran.model,
          previous: ran.previous,
        }
      }
      if (parsed['_tag'] === 'Show') {
        const show = yield* Effect.try({
          try: () => S.decodeUnknownSync(CliDaemonShow)(parsed),
          catch: cause =>
            new CliDaemonError({
              message:
                cause instanceof Error
                  ? cause.message
                  : 'CLI daemon could not decode Show.',
            }),
        })
        if (surface.show === undefined) {
          return yield* Effect.fail(
            new CliDaemonError({
              message: 'CLI daemon has no Show painter.',
            }),
          )
        }
        const flags: CliDaemonFlags = show.flags ?? {}
        const painted = yield* surface.show(flags)
        return CliDaemonPainted({
          stdout: painted.stdout,
          exitCode: painted.exitCode,
          ...(painted.stderr === undefined ? {} : { stderr: painted.stderr }),
        })
      }
      if (parsed['_tag'] === 'Do') {
        const request = yield* Effect.try({
          try: () => S.decodeUnknownSync(CliDaemonDo)(parsed),
          catch: cause =>
            new CliDaemonError({
              message:
                cause instanceof Error
                  ? cause.message
                  : 'CLI daemon could not decode Do.',
            }),
        })
        if (surface.do === undefined) {
          return yield* Effect.fail(
            new CliDaemonError({
              message: 'CLI daemon has no Do painter.',
            }),
          )
        }
        const flags: CliDaemonFlags = request.flags ?? {}
        const painted = yield* surface.do(request.token, flags)
        return CliDaemonPainted({
          stdout: painted.stdout,
          exitCode: painted.exitCode,
          ...(painted.stderr === undefined ? {} : { stderr: painted.stderr }),
        })
      }
      return yield* Effect.fail(
        new CliDaemonError({
          message: 'CLI daemon request must be Read, Run, Show, or Do.',
        }),
      )
    }).pipe(
      Effect.catch(error => {
        if (
          typeof error === 'object' &&
          error !== null &&
          '_tag' in error &&
          error._tag === 'CliDaemonError' &&
          'message' in error &&
          typeof error.message === 'string'
        ) {
          return Effect.succeed(CliDaemonFailed({ cause: error.message }))
        }
        return Effect.fail(error)
      }),
    )
    yield* Effect.tryPromise({
      try: () => writeLine(socket, JSON.stringify(encoded)),
      catch: cause =>
        new CliDaemonError({
          message: cause instanceof Error ? cause.message : 'Write failed.',
        }),
    })
    socket.end()
  }).pipe(
    Effect.catch(() =>
      Effect.sync(() => {
        socket.end()
      }),
    ),
  )

const listenServer = (
  socketPath: string,
  onConnection: (socket: Socket) => void,
): Effect.Effect<Server, CliDaemonError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<Server>((resolve, reject) => {
        const server = createServer(onConnection)
        server.once('error', cause => {
          reject(cause)
        })
        server.listen(socketPath, () => {
          writeCliDaemonPid(socketPath, process.pid)
          resolve(server)
        })
      }),
    catch: cause =>
      new CliDaemonError({
        message: cause instanceof Error ? cause.message : 'Listen failed.',
      }),
  })

/** Opens the daemon socket. Keeps the Processor alive until the Scope closes. */
export const startCliDaemonServer = <Model, Message>(options: {
  readonly socketPath: string
  readonly Model: ProgramSchema<Model>
  readonly Message: ProgramSchema<Message>
  readonly surface: CliDaemonSurface<Model, Message>
}): Effect.Effect<void, CliDaemonError, Scope.Scope> => {
  let exclusive: Promise<void> = Promise.resolve()
  return Effect.acquireRelease(
    listenServer(options.socketPath, socket => {
      exclusive = exclusive
        .then(() =>
          Effect.runPromise(
            handleConnection(
              socket,
              options.Model,
              options.Message,
              options.surface,
            ),
          ),
        )
        .then(
          () => undefined,
          () => undefined,
        )
    }),
    server =>
      Effect.sync(() => {
        server.close()
        removeCliDaemonFiles(options.socketPath)
      }),
  ).pipe(Effect.as(undefined))
}

/** Serves the daemon until interrupted. */
export const listenCliDaemon = <Model, Message>(options: {
  readonly socketPath: string
  readonly Model: ProgramSchema<Model>
  readonly Message: ProgramSchema<Message>
  readonly surface: CliDaemonSurface<Model, Message>
}): Effect.Effect<never, CliDaemonError> =>
  Effect.scoped(
    startCliDaemonServer(options).pipe(Effect.andThen(Effect.never)),
  )
