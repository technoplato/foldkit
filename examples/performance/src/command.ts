import { Effect, Schema as S } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Command, Http } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'

import { BuildDetail, Index } from './data'
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedFetchBuild,
  FailedFetchIndex,
  SucceededFetchBuild,
  SucceededFetchIndex,
} from './message'

// CONSTANT

export const INDEX_PATH = '/data/index.json'

/** Where one build's file is served: `/data/builds/scribe/270.json`. */
export const buildDataPath = (appId: string, build: string): string =>
  `/data/builds/${encodeURIComponent(appId)}/${encodeURIComponent(build)}.json`

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

export const FetchIndex = Command.define(
  'FetchIndex',
  SucceededFetchIndex,
  FailedFetchIndex,
)(
  fetchDecoded(Index, INDEX_PATH).pipe(
    Effect.map(index => SucceededFetchIndex({ index })),
    Effect.catch(error =>
      Effect.succeed(FailedFetchIndex({ error: describeError(error) })),
    ),
    Effect.provide(Http.layer),
  ),
)

export const FetchBuild = Command.define(
  'FetchBuild',
  { appId: S.String, build: S.String },
  SucceededFetchBuild,
  FailedFetchBuild,
)(({ appId, build }) =>
  fetchDecoded(BuildDetail, buildDataPath(appId, build)).pipe(
    Effect.map(detail => SucceededFetchBuild({ appId, build, detail })),
    Effect.catch(error =>
      Effect.succeed(
        FailedFetchBuild({ appId, build, error: describeError(error) }),
      ),
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
