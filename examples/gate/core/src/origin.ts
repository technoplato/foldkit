import { Context, Effect, Layer, Option, Schema as S } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { Http } from 'foldkit'

import {
  BadGateway,
  Failed,
  Invalid,
  type OriginReport,
  Read,
  Unreachable,
  sampleRead,
} from './model.js'

/** Live Gate origin. Clients must not paint this URL. */
export const originUrl = 'https://gate.grok.me'

type Shape = Readonly<{
  read: Effect.Effect<OriginReport>
}>

/** Reads the Gate origin as tagged Read or Failed. */
export class GateOrigin extends Context.Service<GateOrigin, Shape>()(
  'gate/GateOrigin',
) {}

/** Maps an HTTP status and optional body onto an OriginReport. */
export const reportFromStatus = (
  status: number,
  maybeBody: Option.Option<unknown>,
): OriginReport => {
  if (status === 502) {
    return Failed({ reason: BadGateway() })
  }
  if (status !== 200) {
    return Failed({ reason: Invalid() })
  }
  if (Option.isNone(maybeBody)) {
    return Failed({ reason: Invalid() })
  }
  const maybeRead = S.decodeUnknownOption(Read)(maybeBody.value)
  if (Option.isNone(maybeRead)) {
    return Failed({ reason: Invalid() })
  }
  return maybeRead.value
}

const readWith = (client: HttpClient.HttpClient): Effect.Effect<OriginReport> =>
  Effect.gen(function* () {
    const maybeResponse = yield* Effect.option(
      client.execute(HttpClientRequest.get(originUrl)),
    )
    if (Option.isNone(maybeResponse)) {
      return Failed({ reason: Unreachable() })
    }
    const maybeBody = yield* Effect.option(maybeResponse.value.json)
    return reportFromStatus(maybeResponse.value.status, maybeBody)
  })

/** Live origin. Requires `HttpClient`. Clients provide Fetch or a test client. */
export const GateOriginLive = Layer.effect(
  GateOrigin,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return { read: readWith(client) }
  }),
)

/** Live origin with Fetch. Browser CORS may still yield Unreachable. */
export const GateOriginHttpLive = Layer.provide(GateOriginLive, Http.layer)

/** Test origin. Inhabits sample Read without HTTP. */
export const GateOriginTest = Layer.succeed(GateOrigin, {
  read: Effect.succeed(sampleRead),
})
