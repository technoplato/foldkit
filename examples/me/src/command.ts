import { Effect, Schema as S } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Command, Http } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'

import { Me, UNDERSTANDING_FILE, Understanding } from './data'
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedFetchMe,
  FailedFetchUnderstanding,
  SucceededFetchMe,
  SucceededFetchUnderstanding,
} from './message'

// CONSTANT

/** Where the origin says who is signed in, from the login it verified. */
export const ME_PATH = '/data/me.json'

/** Where the signed-in user's understanding profile is served, from their own folder. */
export const UNDERSTANDING_PATH = `/data/${UNDERSTANDING_FILE}.json`

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const fetchDecoded = <A, I>(schema: S.Codec<A, I>, path: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(path)
    if (response.status !== 200) {
      return yield* Effect.fail(
        new Error(`${path} answered HTTP ${response.status}`),
      )
    }
    return yield* S.decodeUnknownEffect(schema)(yield* response.json)
  })

// COMMAND

export const FetchMe = Command.define(
  'FetchMe',
  SucceededFetchMe,
  FailedFetchMe,
)(
  fetchDecoded(Me, ME_PATH).pipe(
    Effect.map(me => SucceededFetchMe({ me })),
    Effect.catch(error =>
      Effect.succeed(FailedFetchMe({ error: describeError(error) })),
    ),
    Effect.provide(Http.layer),
  ),
)

export const FetchUnderstanding = Command.define(
  'FetchUnderstanding',
  SucceededFetchUnderstanding,
  FailedFetchUnderstanding,
)(
  fetchDecoded(Understanding, UNDERSTANDING_PATH).pipe(
    Effect.map(understanding => SucceededFetchUnderstanding({ understanding })),
    Effect.catch(error =>
      Effect.succeed(FailedFetchUnderstanding({ error: describeError(error) })),
    ),
    Effect.provide(Http.layer),
  ),
)

export const NavigateInternal = Command.define(
  'NavigateInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

export const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))
