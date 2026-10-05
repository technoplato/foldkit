import { Array, Context, Effect, Exit, Layer, Option, Scope } from 'effect'
import { Telemetry } from 'foldkit'
import {
  type TelemetryFileLimits,
  fileSink,
  resolveFileLimits,
} from 'foldkit/telemetry/node'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { init } from '@instantdb/admin'

import { type AccessVerifier, makeAccessVerifier } from './accessVerifier.js'
import {
  accessAudienceEnvNames,
  accessTeamDomainEnvNames,
  hostedIdentityResponseHeaders,
  hostedIdentitySessionPath,
  isLocalDevelopmentRequest,
  knophyAccessTeamDomain,
  loopbackMintEmail,
  mintHostedInstantSession,
} from './hostedIdentity.js'
import {
  type PublicAnswer,
  type PublicRoutes,
  guardHostedRequest,
} from './publicRoutes.js'
import {
  answerTelemetryRequest,
  maximumTelemetryRequestBytes,
} from './telemetryEndpoint.js'

const headerRecord = (
  headers: IncomingMessage['headers'],
): Readonly<Record<string, string>> => {
  const collected: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string' && value !== '') {
      collected[name.toLowerCase()] = value
    }
  }
  return collected
}

const writeJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  const payload = JSON.stringify(body)
  response.statusCode = status
  for (const [name, value] of Object.entries(hostedIdentityResponseHeaders)) {
    response.setHeader(name, value)
  }
  response.setHeader('content-length', String(Buffer.byteLength(payload)))
  response.end(payload)
}

const envValue = (name: string): string => {
  const value = process.env[name]
  if (value === undefined) {
    return ''
  } else {
    return value
  }
}

const firstEnvValue = (names: ReadonlyArray<string>): string =>
  names
    .map(envValue)
    .find(value => value.trim() !== '')
    ?.trim() ?? ''

const writeAnswer = (
  response: ServerResponse,
  method: string,
  answer: PublicAnswer,
): void => {
  response.statusCode = answer.status
  for (const [name, value] of Object.entries(answer.headers)) {
    response.setHeader(name, value)
  }
  const body =
    typeof answer.body === 'string' ? Buffer.from(answer.body) : answer.body
  response.setHeader('content-length', String(body.byteLength))
  response.end(method.toUpperCase() === 'HEAD' ? undefined : body)
}

/**
 * Which Access team signs the logins an origin accepts, and for which
 * apps, and the routes it answers for anyone. With `publicRoutes`, a
 * visitor with no verified login gets only those routes and 404 for
 * everything else, so a Cloudflare Access bypass on a path can never show
 * the app or its data.
 */
export type HostedIdentityOptions = Readonly<{
  teamDomain?: string
  audiences?: ReadonlyArray<string>
  publicRoutes?: PublicRoutes
}>

const accessVerifierFor = (
  options: Readonly<{
    teamDomain?: string
    audiences?: ReadonlyArray<string>
  }>,
): AccessVerifier => {
  const teamDomain =
    options.teamDomain ??
    (firstEnvValue(accessTeamDomainEnvNames) || knophyAccessTeamDomain)
  const audiences =
    options.audiences ??
    firstEnvValue(accessAudienceEnvNames)
      .split(',')
      .map(audience => audience.trim())
      .filter(audience => audience !== '')
  return makeAccessVerifier({ teamDomain, audiences })
}

/**
 * Serves `/__foldkit/hosted-identity/session` in Vite dev and preview.
 * Reads `INSTANT_APP_ADMIN_TOKEN` from the origin process. Never prefixes it
 * `VITE_`. Mints only for an Access login whose signature checks out
 * against the team's keys: `teamDomain`, else `CF_ACCESS_TEAM_DOMAIN`,
 * else the Knophy team. `audiences`, else `CF_ACCESS_AUD` (comma
 * separated), limits it to those Access applications. A request made on
 * this machine to `localhost`, with no proxy in between, gets the local
 * development email instead. With `publicRoutes`, it also guards every
 * other path: see {@link guardHostedRequest}.
 *
 * @example
 * ```typescript
 * plugins: [foldkit(), hostedIdentity()]
 * plugins: [foldkit(), hostedIdentity({ audiences: ['3f2a…'] })]
 * plugins: [foldkit(), hostedIdentity({ publicRoutes: booksLinkPreviews })]
 * ```
 */
export const hostedIdentity = (options: HostedIdentityOptions = {}): Plugin => {
  const verifier = accessVerifierFor(options)

  const createToken = async (email: string): Promise<string> => {
    const adminToken = envValue('INSTANT_APP_ADMIN_TOKEN')
    const appIdFromEnv = envValue('INSTANT_APP_ID')
    const appId =
      appIdFromEnv === '' ? envValue('VITE_INSTANT_APP_ID') : appIdFromEnv
    if (adminToken === '' || appId === '') {
      throw new Error('MintUnavailable')
    }
    const database = init({ adminToken, appId })
    const token = await database.auth.createToken({ email })
    return String(token)
  }

  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (request.url === undefined) {
      next()
      return
    }
    const headers = headerRecord(request.headers)
    const isLocal = isLocalDevelopmentRequest({
      remoteAddress: request.socket.remoteAddress,
      headers,
    })
    void mintHostedInstantSession({
      createToken,
      verifyAccessToken: verifier.verify,
      ...(isLocal ? { localDevelopmentEmail: loopbackMintEmail() } : {}),
      headers,
      method: request.method ?? 'GET',
      url: request.url,
    }).then(async result => {
      if (result !== undefined) {
        writeJson(response, result.status, result.body)
        return
      }
      const publicRoutes = options.publicRoutes
      if (publicRoutes === undefined) {
        next()
        return
      }
      const maybeAnswer = await guardHostedRequest({
        publicRoutes,
        verifyAccessToken: verifier.verify,
        remoteAddress: request.socket.remoteAddress,
        headers,
        method: request.method ?? 'GET',
        url: request.url ?? '/',
      })
      Option.match(maybeAnswer, {
        onNone: next,
        onSome: answer => {
          writeAnswer(response, request.method ?? 'GET', answer)
        },
      })
    })
  }

  return {
    name: 'foldkit-hosted-identity',
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

/** Path the plugin serves. Re-exported so Vite configs can document it. */
export { hostedIdentitySessionPath }

/**
 * Which logins the telemetry endpoint accepts, as for {@link hostedIdentity},
 * and where it writes: `directory`, else
 * `~/Library/Logs/foldkit/telemetry`, with the file `limits` of
 * `foldkit/telemetry/node`.
 */
export type FoldkitTelemetryOptions = Readonly<{
  teamDomain?: string
  audiences?: ReadonlyArray<string>
  directory?: string
  limits?: Partial<TelemetryFileLimits>
}>

type TelemetrySinkService = Context.Service.Shape<
  typeof Telemetry.TelemetrySink
>

const readBodyOf = (
  request: IncomingMessage,
  maximumBytes: number,
): Promise<Option.Option<string>> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    let byteCount = 0
    let isTooLarge = false
    request.on('data', (chunk: Buffer) => {
      byteCount += chunk.byteLength
      if (byteCount > maximumBytes) {
        isTooLarge = true
      } else {
        chunks.push(chunk)
      }
    })
    request.on('end', () => {
      resolve(
        isTooLarge
          ? Option.none()
          : Option.some(Buffer.concat(chunks).toString('utf8')),
      )
    })
    request.on('error', reject)
  })

/**
 * The middleware behind {@link foldkitTelemetry}: `handle` answers
 * `/__foldkit/telemetry` and passes every other request to `next`, and
 * `close` writes what every file sink holds and closes their files.
 *
 * @example
 * ```typescript
 * const telemetry = makeTelemetryMiddleware({ directory: '/tmp/telemetry' })
 * const server = createServer((request, response) => telemetry.handle(request, response, () => response.end()))
 * ```
 */
export const makeTelemetryMiddleware = (
  options: FoldkitTelemetryOptions = {},
): Readonly<{
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => void
  close: () => Promise<void>
}> => {
  const limits = resolveFileLimits(options.limits)
  const verifier = accessVerifierFor(options)
  const sinksScope = Effect.runSync(Scope.make())
  const sinksByOrigin = new Map<string, Promise<TelemetrySinkService>>()

  const sinkFor = (
    origin: Readonly<{
      app: string
      surface: Telemetry.TelemetrySurface
    }>,
  ): Promise<TelemetrySinkService> => {
    const key = `${origin.app}-${origin.surface}`
    const maybeExisting = Option.fromNullishOr(sinksByOrigin.get(key))
    if (Option.isSome(maybeExisting)) {
      return maybeExisting.value
    }
    const building = Effect.runPromise(
      Layer.buildWithScope(
        Layer.provide(
          fileSink({
            limits,
            ...(options.directory === undefined
              ? {}
              : { directory: options.directory }),
          }),
          Layer.succeed(Telemetry.TelemetryOrigin, {
            ...origin,
            maybeRole: Option.none(),
          }),
        ),
        sinksScope,
      ).pipe(Effect.map(Context.get(Telemetry.TelemetrySink))),
    )
    sinksByOrigin.set(key, building)
    return building
  }

  const appendBatch = async (
    batch: Telemetry.TelemetryBatch,
  ): Promise<void> => {
    const sink = await sinkFor({ app: batch.app, surface: batch.surface })
    Array.forEach(batch.events, event => {
      sink.offer(event)
    })
    await Effect.runPromise(sink.flush)
  }

  const handle = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    const url = request.url ?? '/'
    const method = request.method ?? 'GET'
    void answerTelemetryRequest({
      verifyAccessToken: verifier.verify,
      remoteAddress: request.socket.remoteAddress,
      headers: headerRecord(request.headers),
      method,
      url,
      readBody: () => readBodyOf(request, maximumTelemetryRequestBytes),
      appendBatch,
    }).then(
      maybeAnswer => {
        Option.match(maybeAnswer, {
          onNone: next,
          onSome: answer => {
            writeAnswer(response, method, answer)
          },
        })
      },
      () => {
        response.statusCode = 500
        response.end()
      },
    )
  }

  const close = (): Promise<void> =>
    Effect.runPromise(Scope.close(sinksScope, Exit.void))

  return { handle, close }
}

/**
 * Serves `POST /__foldkit/telemetry` in Vite dev and preview: a browser's
 * {@link Telemetry.browserSink} posts batches there, and the endpoint
 * appends each batch to the file for its app and surface, such as
 * `~/Library/Logs/foldkit/telemetry/books-web-react.ndjson`, through the
 * Node file sink, with its disk caps and its scrub of this process's
 * environment values. Each batch keeps the surface the page declared, and
 * a surface outside the vocabulary, such as `desktop`, is refused with
 * 400. It answers only local development and visitors with a verified
 * Access login; anyone else gets 404, as for a path that does not exist.
 * See `answerTelemetryRequest`. Closing the server flushes every file and
 * closes it.
 *
 * Throws a RangeError when a file limit is invalid.
 *
 * @example
 * ```typescript
 * plugins: [react(), hostedIdentity({ publicRoutes }), foldkitTelemetry()]
 * plugins: [react(), foldkitTelemetry({ limits: { maximumFileBytes: 2 * 1024 * 1024 } })]
 * ```
 */
export const foldkitTelemetry = (
  options: FoldkitTelemetryOptions = {},
): Plugin => {
  const telemetry = makeTelemetryMiddleware(options)
  const closeSinks = (): void => {
    void telemetry.close()
  }
  return {
    name: 'foldkit-telemetry',
    configurePreviewServer(server) {
      server.middlewares.use(telemetry.handle)
      server.httpServer.once('close', closeSinks)
    },
    configureServer(server) {
      server.middlewares.use(telemetry.handle)
      server.httpServer?.once('close', closeSinks)
    },
  }
}
