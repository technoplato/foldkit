/// <reference types="node" />
import {
  Effect,
  Fiber,
  Option,
  Schema as S,
  type Scope,
  Stream,
  String,
} from 'effect'
import { type Server, type Socket, createServer } from 'node:net'

import { Cli, type Host, Tui } from '../processor/host.js'
import type { ProgramSchema } from '../program/program.js'
import { removeOwnCliDaemonFiles, writeCliDaemonPid } from './paths.js'
import {
  CliDaemonDo,
  CliDaemonError,
  CliDaemonFailed,
  type CliDaemonFlags,
  CliDaemonFollow,
  CliDaemonFollowEnded,
  CliDaemonFollowed,
  CliDaemonPainted,
  type CliDaemonPaintedResult,
  CliDaemonShow,
  type CliDaemonSurface,
} from './protocol.js'
import { isTerminalViewRequest } from './surface.js'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const REQUEST_LINE_TIMEOUT_MS = 5_000

// NOTE: Requests are answered one at a time, so a connection that opens
// and never sends its line would hold every later command. A line that
// has not come within the timeout is read as none, and the next is taken.
const readRequestLine = (socket: Socket): Promise<string> =>
  new Promise(resolve => {
    let buffer = ''
    const timer = setTimeout(() => {
      cleanup()
      resolve('')
    }, REQUEST_LINE_TIMEOUT_MS)
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
      resolve(buffer.replace(/\r$/, ''))
    }
    const onError = (): void => {
      cleanup()
      resolve('')
    }
    const cleanup = (): void => {
      clearTimeout(timer)
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

const paintedOf = (painted: CliDaemonPaintedResult): CliDaemonPainted =>
  CliDaemonPainted({
    stdout: painted.stdout,
    exitCode: painted.exitCode,
    ...(painted.stderr === undefined ? {} : { stderr: painted.stderr }),
    ...(painted.flags === undefined ? {} : { flags: painted.flags }),
  })

/**
 * The Host of the client a Show or Do came from: the one it names, or for
 * a view that names none, `Tui` when its flags say `view: 'tui'` and
 * `Cli` otherwise.
 */
const clientOf = (
  request: Readonly<{ client?: Host }>,
  flags: CliDaemonFlags,
): Host => {
  if (request.client !== undefined) {
    return request.client
  } else if (isTerminalViewRequest(flags)) {
    return Tui()
  } else {
    return Cli()
  }
}

const decodeRunMessage = <Message>(
  Message: ProgramSchema<Message>,
  value: unknown,
): Message => S.decodeUnknownSync(Message)(value)

const followRequestOf = (line: string): Option.Option<CliDaemonFollow> => {
  try {
    const parsed: unknown = JSON.parse(line)
    return isRecord(parsed) && parsed['_tag'] === 'Follow'
      ? S.decodeUnknownOption(CliDaemonFollow)(parsed)
      : Option.none()
  } catch {
    return Option.none()
  }
}

const nothingToFollow = 'This CLI daemon has nothing to follow.'

/**
 * Keeps one connection open on a topic: each text the topic emits goes out
 * as a Followed line, then FollowEnded, or Failed with why. The topic's
 * Stream is interrupted when the view closes the connection, so a topic
 * that listens to the Program stops listening.
 */
const startFollowing = <Model, Message>(
  socket: Socket,
  request: CliDaemonFollow,
  surface: CliDaemonSurface<Model, Message>,
): void => {
  const flags: CliDaemonFlags = request.flags ?? {}
  const topic =
    surface.follow === undefined
      ? Stream.fail(new CliDaemonError({ message: nothingToFollow }))
      : surface.follow(request.topic, flags, clientOf(request, flags))
  const send = (response: unknown) =>
    Effect.tryPromise({
      try: () => writeLine(socket, JSON.stringify(response)),
      catch: () => new CliDaemonError({ message: 'The follower left.' }),
    })
  const fiber = Effect.runFork(
    topic.pipe(
      Stream.runForEach(text => send(CliDaemonFollowed({ text }))),
      Effect.andThen(send(CliDaemonFollowEnded())),
      Effect.catch(error =>
        Effect.ignore(send(CliDaemonFailed({ cause: error.message }))),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          socket.end()
        }),
      ),
    ),
  )
  socket.on('error', () => {})
  socket.once('close', () => {
    Effect.runFork(Fiber.interrupt(fiber))
  })
}

const handleConnection = <Model, Message>(
  socket: Socket,
  requestLine: Promise<string>,
  Message: ProgramSchema<Message>,
  surface: CliDaemonSurface<Model, Message>,
  onFollowing: (socket: Socket) => void,
  onAnswered: (answer: unknown) => void,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const line = yield* Effect.promise(() => requestLine)
    if (line === '') {
      socket.end()
      return
    }
    const maybeFollow = followRequestOf(line)
    if (Option.isSome(maybeFollow)) {
      onFollowing(socket)
      startFollowing(socket, maybeFollow.value, surface)
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
        return paintedOf(yield* surface.show(flags, clientOf(show, flags)))
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
        return paintedOf(
          yield* surface.do(request.token, flags, clientOf(request, flags)),
        )
      }
      return yield* Effect.fail(
        new CliDaemonError({
          message: 'CLI daemon request must be Read, Run, Show, Do, or Follow.',
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
    onAnswered(encoded)
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

/**
 * Opens the daemon socket. Keeps the Processor alive until the Scope
 * closes. Read, Run, Show, and Do are answered one at a time, in the order
 * they arrive. A Follow keeps its connection open beside them and never
 * holds them up; closing the Scope ends every Follow. `onAnswered` hears
 * each answer once it has been written and its connection ended, so a
 * Processor that stops on a command, such as `counter stop`, stops only
 * after the command has its answer.
 */
export const startCliDaemonServer = <Model, Message>(options: {
  readonly socketPath: string
  readonly Model: ProgramSchema<Model>
  readonly Message: ProgramSchema<Message>
  readonly surface: CliDaemonSurface<Model, Message>
  readonly onAnswered?: (answer: unknown) => void
}): Effect.Effect<void, CliDaemonError, Scope.Scope> => {
  let exclusive: Promise<void> = Promise.resolve()
  const followers = new Set<Socket>()
  const keepFollower = (socket: Socket): void => {
    followers.add(socket)
    socket.once('close', () => {
      followers.delete(socket)
    })
  }
  return Effect.acquireRelease(
    listenServer(options.socketPath, socket => {
      // NOTE: Each request is read from the moment its connection arrives,
      // and only answering waits its turn. A connection that closes while
      // an earlier one is answered, such as a client checking that the
      // daemon listens, has already closed by its turn, so a read started
      // then would never end and every later command would wait forever.
      const requestLine = readRequestLine(socket)
      exclusive = exclusive
        .then(() =>
          Effect.runPromise(
            handleConnection(
              socket,
              requestLine,
              options.Message,
              options.surface,
              keepFollower,
              options.onAnswered ?? (() => {}),
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
        for (const follower of followers) {
          follower.destroy()
        }
        server.close()
        // NOTE: Only this Processor's own files go. While it was saving
        // on the way out, a newer one may have taken the socket, and
        // removing that one's files would leave it running and unreachable.
        removeOwnCliDaemonFiles(options.socketPath)
      }),
  ).pipe(Effect.as(undefined))
}

/**
 * Serves the daemon until `until` completes, or until interrupted when
 * there is none, then closes the socket and removes its files. A player
 * passes the moment it is done, such as `books stop` or the end of the
 * title, so the process can exit.
 *
 * @example
 * ```typescript
 * yield* listenCliDaemon({ socketPath, Model, Message, surface, until: Deferred.await(stopped) })
 * ```
 */
export const listenCliDaemon = <Model, Message>(options: {
  readonly socketPath: string
  readonly Model: ProgramSchema<Model>
  readonly Message: ProgramSchema<Message>
  readonly surface: CliDaemonSurface<Model, Message>
  readonly until?: Effect.Effect<void>
}): Effect.Effect<void, CliDaemonError> =>
  Effect.scoped(
    startCliDaemonServer(options).pipe(
      Effect.andThen(options.until ?? Effect.never),
    ),
  )
