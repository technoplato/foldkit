import { Effect, Fiber, Option, Schema as S, Stream } from 'effect'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import {
  accessTokenFromHeaders,
  isLocalDevelopmentRequest,
  knophyAccessTeamDomain,
  makeAccessVerifier,
} from '@foldkit/instant'

import { defaultThingsDirectory, watchedReadings } from './local.node.js'
import {
  ReadingsFailureJson,
  ReadingsJson,
  readingsEndpointPath,
  readingsEventName,
  readingsFailedEventName,
} from './reading.js'

// ENDPOINT

/**
 * Where the endpoint reads and whose logins it accepts. `directory`
 * defaults to `READ_ALOUD_THINGS_DIR`, else `~/Scribe/things`. A login
 * counts when Cloudflare Access signed it: `teamDomain`, else
 * `CF_ACCESS_TEAM_DOMAIN`, else the Knophy team, for the Access
 * applications in `audiences`, else `CF_ACCESS_AUD`, when any are named.
 */
export type ReadAloudEndpointOptions = Readonly<{
  directory?: string
  teamDomain?: string
  audiences?: ReadonlyArray<string>
}>

const keepAliveMs = 25_000

const unauthorized = 401

const envValue = (name: string): string => process.env[name]?.trim() ?? ''

const headerRecord = (
  headers: IncomingMessage['headers'],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      typeof value === 'string' && value !== ''
        ? [[name.toLowerCase(), value]]
        : [],
    ),
  )

const pathOf = (url: string): string =>
  URL.parse(url, 'http://localhost')?.pathname ?? ''

const encodeReadings = S.encodeSync(ReadingsJson)

const encodeFailure = S.encodeSync(ReadingsFailureJson)

/**
 * Serves Scribe's logs on this laptop to the Read Aloud page, in Vite dev
 * and preview, at `/__read-aloud/readings`: Server-Sent Events, one
 * `readings` event now and another each time Scribe writes. It sends book
 * information and page turns only, never what was heard. It answers a
 * request made on this machine to `localhost`, or one carrying a
 * Cloudflare Access login whose signature checks out; anything else gets
 * 401.
 *
 * @example
 * ```typescript
 * plugins: [react(), hostedIdentity(), readAloudEndpoint()]
 * ```
 */
export const readAloudEndpoint = (
  options: ReadAloudEndpointOptions = {},
): Plugin => {
  const directory =
    options.directory ??
    (envValue('READ_ALOUD_THINGS_DIR') || defaultThingsDirectory())
  const verifier = makeAccessVerifier({
    teamDomain:
      options.teamDomain ??
      (envValue('CF_ACCESS_TEAM_DOMAIN') || knophyAccessTeamDomain),
    audiences:
      options.audiences ??
      envValue('CF_ACCESS_AUD')
        .split(',')
        .map(audience => audience.trim())
        .filter(audience => audience !== ''),
  })

  const isAllowed = async (request: IncomingMessage): Promise<boolean> => {
    const headers = headerRecord(request.headers)
    const token = accessTokenFromHeaders(headers)
    if (
      isLocalDevelopmentRequest({
        remoteAddress: request.socket.remoteAddress,
        headers,
      })
    ) {
      return true
    } else if (token === '') {
      return false
    } else {
      return Option.isSome(await verifier.verify(token))
    }
  }

  const stream = (request: IncomingMessage, response: ServerResponse): void => {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    response.write(': read aloud\n\n')
    const fiber = Effect.runFork(
      watchedReadings(directory).pipe(
        Stream.runForEach(readings =>
          Effect.sync(() => {
            response.write(
              `event: ${readingsEventName}\ndata: ${encodeReadings(readings)}\n\n`,
            )
          }),
        ),
        Effect.catch(error =>
          Effect.sync(() => {
            response.write(
              `event: ${readingsFailedEventName}\ndata: ${encodeFailure({ reason: error.reason })}\n\n`,
            )
            response.end()
          }),
        ),
      ),
    )
    const keepAlive = setInterval(() => {
      response.write(': keep-alive\n\n')
    }, keepAliveMs)
    request.on('close', () => {
      clearInterval(keepAlive)
      Effect.runFork(Fiber.interrupt(fiber))
    })
  }

  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    if (pathOf(request.url ?? '') !== readingsEndpointPath) {
      next()
    } else {
      void isAllowed(request).then(isPermitted => {
        if (isPermitted) {
          stream(request, response)
        } else {
          response.statusCode = unauthorized
          response.end()
        }
      })
    }
  }

  return {
    name: 'read-aloud-endpoint',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
