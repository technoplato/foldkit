import { Effect, Layer, Option, Schema as S } from 'effect'
import {
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from 'effect/unstable/http'
import { describe, expect, it } from 'vitest'

import { ReadOrigin } from './command.js'
import { FailedReadOrigin, SucceededReadOrigin } from './message.js'
import {
  BadGateway,
  Failed,
  Invalid,
  Read,
  Unreachable,
  sampleRead,
  sampleRemainingMessages,
  sampleRemainingRate,
} from './model.js'
import {
  GateOrigin,
  GateOriginLive,
  GateOriginTest,
  originUrl,
  reportFromStatus,
} from './origin.js'

const originFromClient = (client: HttpClient.HttpClient) =>
  Layer.provide(GateOriginLive, Layer.succeed(HttpClient.HttpClient, client))

const encodedSampleRead = S.encodeUnknownSync(Read)(sampleRead)

describe('originUrl', () => {
  it('is the live Gate origin', () => {
    expect(originUrl).toBe('https://gate.grok.me')
  })
})

describe('reportFromStatus', () => {
  it('maps 502 to BadGateway', () => {
    expect(reportFromStatus(502, Option.none())).toEqual(
      Failed({ reason: BadGateway() }),
    )
  })

  it('maps a non-200 other than 502 to Invalid', () => {
    expect(reportFromStatus(503, Option.none())).toEqual(
      Failed({ reason: Invalid() }),
    )
  })

  it('maps 200 with no body to Invalid', () => {
    expect(reportFromStatus(200, Option.none())).toEqual(
      Failed({ reason: Invalid() }),
    )
  })

  it('maps 200 with an unparseable body to Invalid', () => {
    expect(reportFromStatus(200, Option.some({ foo: 1 }))).toEqual(
      Failed({ reason: Invalid() }),
    )
  })

  it('maps 200 with tagged Read to Read', () => {
    expect(reportFromStatus(200, Option.some(encodedSampleRead))).toEqual(
      sampleRead,
    )
  })
})

describe('ReadOrigin', () => {
  it('succeeds with sample Read through the test origin', async () => {
    const message = await ReadOrigin().effect.pipe(
      Effect.provide(GateOriginTest),
      Effect.runPromise,
    )
    expect(message).toEqual(
      SucceededReadOrigin({
        rate: sampleRemainingRate,
        messages: sampleRemainingMessages,
      }),
    )
  })

  it('maps live HTTP 502 onto FailedReadOrigin BadGateway', async () => {
    const client = HttpClient.make(request =>
      Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response('', { status: 502 })),
      ),
    )
    const message = await ReadOrigin().effect.pipe(
      Effect.provide(originFromClient(client)),
      Effect.runPromise,
    )
    expect(message).toEqual(FailedReadOrigin({ reason: BadGateway() }))
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
  })

  it('maps a defecting origin onto FailedReadOrigin Unreachable', async () => {
    const defecting = Layer.succeed(GateOrigin, {
      read: Effect.die(new Error('boom')),
    })
    const message = await ReadOrigin().effect.pipe(
      Effect.provide(defecting),
      Effect.runPromise,
    )
    expect(message).toEqual(FailedReadOrigin({ reason: Unreachable() }))
  })
})
