import { Effect, Layer, Option } from 'effect'
import {
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from 'effect/unstable/http'
import { describe, expect, it } from 'vitest'

import { ReadOrigin } from './command.js'
import { FailedReadOrigin, SucceededReadOrigin } from './message.js'
import {
  OriginFailed,
  Refused,
  TokenReady,
  Unreachable,
  sampleHosts,
  sampleSnapshot,
} from './model.js'
import {
  SettingsOrigin,
  SettingsOriginLive,
  SettingsOriginTest,
  originUrl,
  reportFromStatus,
} from './origin.js'

const originFromClient = (client: HttpClient.HttpClient) =>
  Layer.provide(
    SettingsOriginLive,
    Layer.succeed(HttpClient.HttpClient, client),
  )

describe('originUrl', () => {
  it('is the same-origin Settings API', () => {
    expect(originUrl).toBe('/api/settings')
  })
})

describe('reportFromStatus', () => {
  it('maps 403 to Refused', () => {
    expect(reportFromStatus(403, Option.none())).toEqual(
      OriginFailed({ reason: Refused() }),
    )
  })

  it('maps 502 to Unreachable', () => {
    expect(reportFromStatus(502, Option.none())._tag).toBe('Failed')
  })

  it('maps 200 with tagged Snapshot to Snapshot', () => {
    expect(
      reportFromStatus(
        200,
        Option.some({
          token: sampleSnapshot.token,
          hosts: sampleSnapshot.hosts,
        }),
      )._tag,
    ).toBe('Snapshot')
  })
})

describe('ReadOrigin', () => {
  it('succeeds with sample Snapshot through the test origin', async () => {
    const message = await ReadOrigin().effect.pipe(
      Effect.provide(SettingsOriginTest),
      Effect.runPromise,
    )
    expect(message).toEqual(
      SucceededReadOrigin({
        token: TokenReady(),
        hosts: sampleHosts(),
      }),
    )
  })

  it('maps a failing HTTP client onto FailedReadOrigin Unreachable', async () => {
    const client = HttpClient.make(request =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: new Error('offline'),
          }),
        }),
      ),
    )
    const message = await ReadOrigin().effect.pipe(
      Effect.provide(originFromClient(client)),
      Effect.runPromise,
    )
    expect(message).toEqual(FailedReadOrigin({ reason: Unreachable() }))
    void HttpClientResponse
  })

  it('maps a defecting origin onto FailedReadOrigin Unreachable', async () => {
    const defecting = Layer.succeed(SettingsOrigin, {
      read: Effect.die(new Error('boom')),
      apply: () => Effect.die(new Error('boom')),
    })
    const message = await ReadOrigin().effect.pipe(
      Effect.provide(defecting),
      Effect.runPromise,
    )
    expect(message).toEqual(FailedReadOrigin({ reason: Unreachable() }))
  })
})
