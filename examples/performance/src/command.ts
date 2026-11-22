import { Clock, Effect, Schema as S } from 'effect'
import { HttpClient } from 'effect/unstable/http'
import { Command, Http } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'

import {
  BuildDetail,
  Index,
  NotWritten,
  Pipeline,
  type PipelineFile,
  Written,
} from './data'
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedFetchBuild,
  FailedFetchIndex,
  FailedFetchPipeline,
  SucceededFetchBuild,
  SucceededFetchIndex,
  SucceededFetchPipeline,
} from './message'

// CONSTANT

export const INDEX_PATH = '/data/index.json'
/** Where the build pipeline's file is served. */
export const PIPELINE_PATH = '/data/pipeline.json'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

/** Where one build's file is served: `/data/builds/scribe/270.json`. */
export const buildDataPath = (appId: string, build: string): string =>
  `/data/builds/${encodeURIComponent(appId)}/${encodeURIComponent(build)}.json`

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const unexpectedStatus = (path: string, status: number) =>
  Effect.fail(new Error(`${path} answered HTTP ${status}`))

const fetchDecoded = <A, I>(schema: S.Codec<A, I>, path: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(path)
    if (response.status !== HTTP_OK) {
      return yield* unexpectedStatus(path, response.status)
    }
    return yield* S.decodeUnknownEffect(schema)(yield* response.json)
  })

const readPipelineFile = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.get(PIPELINE_PATH)
  if (response.status === HTTP_NOT_FOUND) {
    const file: PipelineFile = NotWritten()
    return file
  } else if (response.status !== HTTP_OK) {
    return yield* unexpectedStatus(PIPELINE_PATH, response.status)
  } else {
    const pipeline = yield* S.decodeUnknownEffect(Pipeline)(
      yield* response.json,
    )
    const file: PipelineFile = Written({
      pipeline,
      readAtMs: yield* Clock.currentTimeMillis,
    })
    return file
  }
})

/**
 * Reads `pipeline.json` and when it was read. A 404 is an answer, that the
 * exporter has not written it; any other bad answer is a failure.
 */
export const fetchPipelineEffect = readPipelineFile.pipe(
  Effect.map(file => SucceededFetchPipeline({ file })),
  Effect.catch(error =>
    Effect.succeed(FailedFetchPipeline({ error: describeError(error) })),
  ),
)

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

export const FetchPipeline = Command.define(
  'FetchPipeline',
  SucceededFetchPipeline,
  FailedFetchPipeline,
)(fetchPipelineEffect.pipe(Effect.provide(Http.layer)))

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
