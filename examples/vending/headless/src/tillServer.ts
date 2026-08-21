import { Console, Data, Effect, Schema as S } from 'effect'
import { Runtime } from 'foldkit'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import {
  Message,
  type Model,
  VendingDisplay,
  VendingProgram,
  projectVendingDisplay,
} from 'vending-core-example'
import { MacOSVendingTillWalletResources } from 'wallet-node-client-example'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5208
const MAX_BODY_BYTES = 16_384
const HOST_ENVIRONMENT_VARIABLE = 'FOLDKIT_VENDING_TILL_HOST'
const PORT_ENVIRONMENT_VARIABLE = 'FOLDKIT_VENDING_TILL_PORT'

const decodeMessage = S.decodeUnknownEffect(Message)
const encodeDisplay = S.encodeSync(VendingDisplay)

/** Options used to start the vending till. */
export type VendingTillServerOptions = Readonly<{
  host?: string
  port?: number
}>

/** Error raised by the vending till host. */
export class VendingTillServerError extends Data.TaggedError(
  'VendingTillServerError',
)<{
  readonly reason: string
}> {}

type TillRuntime = Runtime.ProgramRuntime<Model, Message>

const pathnameForRequest = (pathname: string): string => {
  if (pathname === '/till') {
    return '/'
  }
  if (pathname.startsWith('/till/')) {
    return pathname.substring(5)
  }
  return pathname
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void => {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(`${JSON.stringify(value)}\n`)
}

const writeText = (
  response: ServerResponse,
  statusCode: number,
  value: string,
): void => {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(value)
}

const writeDisplayEvent = (
  response: ServerResponse,
  display: VendingDisplay,
): void => {
  response.write(`data: ${JSON.stringify(encodeDisplay(display))}\n\n`)
}

const readRequestBody = (
  request: IncomingMessage,
): Effect.Effect<string, VendingTillServerError> =>
  Effect.callback<string, VendingTillServerError>(resume => {
    const chunks: Array<Buffer> = []
    let byteCount = 0
    let isComplete = false

    const complete = (
      effect: Effect.Effect<string, VendingTillServerError>,
    ): void => {
      if (!isComplete) {
        isComplete = true
        resume(effect)
      }
    }

    request.on('data', (chunk: Buffer) => {
      if (isComplete) {
        return
      }
      byteCount += chunk.byteLength
      if (byteCount > MAX_BODY_BYTES) {
        complete(
          Effect.fail(
            new VendingTillServerError({
              reason: 'Message body was too large',
            }),
          ),
        )
        request.destroy()
      } else {
        chunks.push(chunk)
      }
    })

    request.on('end', () => {
      complete(Effect.succeed(Buffer.concat(chunks).toString('utf8')))
    })

    request.on('error', error => {
      complete(
        Effect.fail(
          new VendingTillServerError({
            reason: globalThis.String(error),
          }),
        ),
      )
    })
  })

const parseJson = (
  body: string,
): Effect.Effect<unknown, VendingTillServerError> =>
  Effect.try({
    try: () => JSON.parse(body),
    catch: error =>
      new VendingTillServerError({
        reason: `Could not parse message: ${globalThis.String(error)}`,
      }),
  })

const serveMessage = (
  request: IncomingMessage,
  response: ServerResponse,
  runtime: TillRuntime,
): void => {
  Effect.runPromise(
    Effect.gen(function* () {
      const body = yield* readRequestBody(request)
      const json = yield* parseJson(body)
      const message = yield* decodeMessage(json).pipe(
        Effect.mapError(
          error =>
            new VendingTillServerError({
              reason: `Could not decode message: ${globalThis.String(error)}`,
            }),
        ),
      )
      const model = yield* runtime.run(message)
      return projectVendingDisplay(model)
    }),
  ).then(
    display => writeJson(response, 200, encodeDisplay(display)),
    error =>
      writeJson(response, 400, {
        reason:
          error instanceof VendingTillServerError
            ? error.reason
            : globalThis.String(error),
      }),
  )
}

const serveEvents = (
  response: ServerResponse,
  runtime: TillRuntime,
  clients: Set<ServerResponse>,
): void => {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })
  clients.add(response)
  writeDisplayEvent(response, projectVendingDisplay(runtime.readModel()))
  response.on('close', () => {
    clients.delete(response)
  })
}

const makeRequestHandler = (
  runtime: TillRuntime,
  clients: Set<ServerResponse>,
) => {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://foldkit.local')
    const pathname = pathnameForRequest(url.pathname)

    if (request.method === 'GET' && pathname === '/healthz') {
      writeText(response, 200, 'ok\n')
    } else if (request.method === 'GET' && pathname === '/model') {
      writeJson(
        response,
        200,
        encodeDisplay(projectVendingDisplay(runtime.readModel())),
      )
    } else if (request.method === 'GET' && pathname === '/events') {
      serveEvents(response, runtime, clients)
    } else if (request.method === 'POST' && pathname === '/messages') {
      serveMessage(request, response, runtime)
    } else {
      writeJson(response, 404, { reason: 'Not found' })
    }
  }
}

const resolveAddress = (
  server: Server,
  host: string,
): Effect.Effect<readonly [number, string], VendingTillServerError> =>
  Effect.sync(() => server.address()).pipe(
    Effect.flatMap(address => {
      if (typeof address === 'object' && address !== null) {
        return Effect.succeed([address.port, `http://${host}:${address.port}`])
      }
      return Effect.fail(
        new VendingTillServerError({
          reason: 'HTTP server did not expose a TCP address',
        }),
      )
    }),
  )

const listen = (
  server: Server,
  host: string,
  port: number,
): Effect.Effect<readonly [number, string], VendingTillServerError> =>
  Effect.callback<readonly [number, string], VendingTillServerError>(resume => {
    const handleError = (error: Error): void => {
      resume(
        Effect.fail(
          new VendingTillServerError({
            reason: globalThis.String(error),
          }),
        ),
      )
    }

    server.once('error', handleError)
    server.listen(port, host, () => {
      server.off('error', handleError)
      resume(resolveAddress(server, host))
    })

    return Effect.sync(() => {
      server.off('error', handleError)
    })
  })

const closeServer = (server: Server): Effect.Effect<void> => {
  if (!server.listening) {
    return Effect.void
  }
  return Effect.promise(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error !== undefined) {
            reject(error)
          } else {
            resolve()
          }
        })
      }),
  ).pipe(Effect.orDie)
}

const parsePort = (port: string | undefined): number => {
  if (port === undefined) {
    return DEFAULT_PORT
  }
  return Number.parseInt(port, 10)
}

/** Reads till host and port options from process environment. */
export const optionsFromEnvironment = (): VendingTillServerOptions => ({
  host: process.env[HOST_ENVIRONMENT_VARIABLE] ?? DEFAULT_HOST,
  port: parsePort(process.env[PORT_ENVIRONMENT_VARIABLE]),
})

/** Runs the vending till until the process is interrupted. */
export const runTill = (
  options: VendingTillServerOptions = {},
): Effect.Effect<void, VendingTillServerError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: VendingProgram,
          resources: MacOSVendingTillWalletResources,
        }),
      )

      const clients = new Set<ServerResponse>()
      const unsubscribe = runtime.observeModel(model => {
        const display = projectVendingDisplay(model)
        clients.forEach(client => writeDisplayEvent(client, display))
      })
      const server = createServer(makeRequestHandler(runtime, clients))
      const host = options.host ?? DEFAULT_HOST
      const [, localUrl] = yield* listen(
        server,
        host,
        options.port ?? DEFAULT_PORT,
      )

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          unsubscribe()
          clients.forEach(client => client.end())
          clients.clear()
          yield* closeServer(server)
          yield* runtime.shutdown
        }),
      )

      yield* Console.log(`Vending till: ${localUrl}`)
      yield* runtime.initialization
      yield* Effect.never
    }),
  )
