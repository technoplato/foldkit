import { Option, Schema as S } from 'effect'
import { Telemetry } from 'foldkit'

import type { AccessIdentity } from './hostedIdentity.js'
import {
  type PublicAnswer,
  type PublicRoutes,
  guardHostedRequest,
} from './publicRoutes.js'

/** The most a telemetry endpoint reads from one request body: 1 MB. */
export const maximumTelemetryRequestBytes = 1024 * 1024

const quietHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
}

const answerOf = (status: number, body: string): PublicAnswer => ({
  status,
  headers: { ...quietHeaders, 'content-type': 'text/plain; charset=utf-8' },
  body,
})

const stored = answerOf(204, '')

const methodNotAllowed: PublicAnswer = {
  ...answerOf(405, 'Telemetry takes POST'),
  headers: {
    ...quietHeaders,
    'content-type': 'text/plain; charset=utf-8',
    allow: 'POST',
  },
}

const tooLarge = answerOf(413, 'Telemetry batch too large')

const notABatch = answerOf(400, 'Not a telemetry batch')

const noPublicRoutes: PublicRoutes = async () => Option.none()

const decodeBatch = S.decodeUnknownOption(
  S.fromJsonString(Telemetry.TelemetryBatch),
)

const pathnameOf = (target: string): string =>
  new URL(target, 'http://127.0.0.1').pathname

/** One request to the telemetry endpoint, as the endpoint sees it. */
export type TelemetryRequest = Readonly<{
  verifyAccessToken: (token: string) => Promise<Option.Option<AccessIdentity>>
  remoteAddress: string | undefined
  headers: Readonly<Record<string, string>>
  method: string
  url: string
  /** Reads the body, or None when it is longer than the endpoint reads. */
  readBody: () => Promise<Option.Option<string>>
  /** Appends one decoded batch to the file for its app and host. */
  appendBatch: (batch: Telemetry.TelemetryBatch) => Promise<void>
}>

/**
 * How a development server answers one request for browser telemetry at
 * `/__foldkit/telemetry`. None for any other path, which the server serves
 * as usual. A visitor with no verified Access login, outside local
 * development, gets 404 as if the path did not exist: the same
 * {@link guardHostedRequest} that guards public routes decides. A signed-in
 * visitor or local development gets 204 once the batch is appended, 400
 * for a body that is not a {@link Telemetry.TelemetryBatch}, 413 for a body
 * over {@link maximumTelemetryRequestBytes}, and 405 for any method but
 * POST.
 *
 * @example
 * ```typescript
 * await answerTelemetryRequest({ verifyAccessToken, remoteAddress: '127.0.0.1', headers: { host: 'books.pisspoursoftware.xyz', 'cf-ray': '8c…' }, method: 'POST', url: '/__foldkit/telemetry', readBody, appendBatch })
 * // Some({ status: 404, … }) for a visitor with no login
 * ```
 */
export const answerTelemetryRequest = async (
  request: TelemetryRequest,
): Promise<Option.Option<PublicAnswer>> => {
  if (pathnameOf(request.url) !== Telemetry.telemetryEndpointPath) {
    return Option.none()
  }
  const maybeRefusal = await guardHostedRequest({
    publicRoutes: noPublicRoutes,
    verifyAccessToken: request.verifyAccessToken,
    remoteAddress: request.remoteAddress,
    headers: request.headers,
    method: request.method,
    url: request.url,
  })
  if (Option.isSome(maybeRefusal)) {
    return maybeRefusal
  }
  if (request.method.toUpperCase() !== 'POST') {
    return Option.some(methodNotAllowed)
  }
  const maybeBody = await request.readBody()
  if (Option.isNone(maybeBody)) {
    return Option.some(tooLarge)
  }
  const maybeBatch = decodeBatch(maybeBody.value)
  if (Option.isNone(maybeBatch)) {
    return Option.some(notABatch)
  }
  await request.appendBatch(maybeBatch.value)
  return Option.some(stored)
}
