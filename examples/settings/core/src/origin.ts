import { Context, Effect, Layer, Option, Schema as S } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { Http } from 'foldkit'

import {
  Host,
  Invalid,
  OriginFailed,
  type OriginReport,
  Refused,
  Snapshot,
  Token,
  Unreachable,
  type Visibility,
  sampleSnapshot,
} from './model.js'

/** Same-origin API. Token stays on the laptop origin. Clients must not paint this. */
export const originUrl = '/api/settings'

type ApplyInput = Readonly<{
  host: string
  visibility: Visibility
}>

type Shape = Readonly<{
  read: Effect.Effect<OriginReport>
  apply: (input: ApplyInput) => Effect.Effect<OriginReport>
}>

/** Reads and applies Settings through the laptop origin. */
export class SettingsOrigin extends Context.Service<SettingsOrigin, Shape>()(
  'settings/SettingsOrigin',
) {}

const SnapshotBody = S.Struct({
  token: Token,
  hosts: S.Array(Host),
})

/** Maps an HTTP status and optional body onto an OriginReport. */
export const reportFromStatus = (
  status: number,
  maybeBody: Option.Option<unknown>,
): OriginReport => {
  if (status === 403) {
    return OriginFailed({ reason: Refused() })
  }
  if (status === 502) {
    return OriginFailed({ reason: Unreachable() })
  }
  if (status !== 200) {
    return OriginFailed({ reason: Invalid() })
  }
  if (Option.isNone(maybeBody)) {
    return OriginFailed({ reason: Invalid() })
  }
  const maybeSnapshot = S.decodeUnknownOption(SnapshotBody)(maybeBody.value)
  if (Option.isNone(maybeSnapshot)) {
    return OriginFailed({ reason: Invalid() })
  }
  return Snapshot.make(maybeSnapshot.value)
}

const readWith = (client: HttpClient.HttpClient): Effect.Effect<OriginReport> =>
  Effect.gen(function* () {
    const maybeResponse = yield* Effect.option(
      client.execute(HttpClientRequest.get(originUrl)),
    )
    if (Option.isNone(maybeResponse)) {
      return OriginFailed({ reason: Unreachable() })
    }
    const maybeBody = yield* Effect.option(maybeResponse.value.json)
    return reportFromStatus(maybeResponse.value.status, maybeBody)
  })

const applyWith = (
  client: HttpClient.HttpClient,
  input: ApplyInput,
): Effect.Effect<OriginReport> =>
  Effect.gen(function* () {
    const maybeResponse = yield* Effect.option(
      client.execute(
        HttpClientRequest.post(`${originUrl}/apply`).pipe(
          HttpClientRequest.setHeader('content-type', 'application/json'),
          HttpClientRequest.bodyText(
            JSON.stringify({
              host: input.host,
              visibility: input.visibility,
            }),
          ),
        ),
      ),
    )
    if (Option.isNone(maybeResponse)) {
      return OriginFailed({ reason: Unreachable() })
    }
    const maybeBody = yield* Effect.option(maybeResponse.value.json)
    return reportFromStatus(maybeResponse.value.status, maybeBody)
  })

/** Live origin. Requires `HttpClient`. Token never leaves the laptop origin. */
export const SettingsOriginLive = Layer.effect(
  SettingsOrigin,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return {
      read: readWith(client),
      apply: (input: ApplyInput) => applyWith(client, input),
    }
  }),
)

/** Live origin with Fetch. */
export const SettingsOriginHttpLive = Layer.provide(
  SettingsOriginLive,
  Http.layer,
)

/** Test origin. Inhabits sample Snapshot without HTTP. */
export const SettingsOriginTest = Layer.succeed(SettingsOrigin, {
  read: Effect.succeed(sampleSnapshot),
  apply: (_input: ApplyInput) => Effect.succeed(sampleSnapshot),
})
