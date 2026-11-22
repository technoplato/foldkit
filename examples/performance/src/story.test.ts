import { Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { Story } from 'foldkit'
import { fromString } from 'foldkit/url'
import { expect, test } from 'vitest'

import {
  FetchBuild,
  FetchIndex,
  FetchPipeline,
  LoadExternal,
  NavigateInternal,
  fetchPipelineEffect,
} from './command'
import { NotWritten } from './data'
import { init } from './init'
import {
  encodedPipeline,
  loadingModel,
  readyModelAt,
  sampleBuildDetail,
  sampleIndex,
  samplePipeline,
  writtenPipeline,
} from './main.fixtures'
import {
  ChangedUrl,
  ClickedChartColumn,
  ClickedReload,
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedFetchBuild,
  FailedFetchIndex,
  FailedFetchPipeline,
  HoveredChartColumn,
  LeftChart,
  SucceededFetchBuild,
  SucceededFetchIndex,
  SucceededFetchPipeline,
} from './message'
import { IndexData } from './model'
import { UNDERSTANDING_MOVED_TO } from './moved'
import { update } from './update'

const urlOf = (path: string) =>
  Option.getOrThrow(fromString(`https://performance.example${path}`))

test('the index loads into the page', () => {
  Story.story(
    update,
    Story.with(loadingModel),
    Story.message(SucceededFetchIndex({ index: sampleIndex })),
    Story.model(model => {
      expect(model.index._tag).toBe('Success')
    }),
    Story.Command.expectNone(),
  )
})

test('a failed first load says why, and a failed reload keeps the numbers', () => {
  Story.story(
    update,
    Story.with(loadingModel),
    Story.message(
      FailedFetchIndex({ error: '/data/index.json answered HTTP 404' }),
    ),
    Story.model(model => {
      expect(model.index._tag).toBe('Failure')
    }),
  )
  Story.story(
    update,
    Story.with(readyModelAt('/')),
    Story.message(ClickedReload()),
    Story.model(model => {
      expect(model.index._tag).toBe('Refreshing')
    }),
    Story.Command.expectHas(FetchIndex),
    Story.Command.resolve(FetchIndex, FailedFetchIndex({ error: 'offline' })),
    Story.Command.resolve(
      FetchPipeline,
      SucceededFetchPipeline({ file: writtenPipeline() }),
    ),
    Story.model(model => {
      expect(model.index._tag).toBe('Stale')
      expect(model.pipeline._tag).toBe('Success')
    }),
  )
})

test('the pipeline loads on its own, whether or not the index did', () => {
  Story.story(
    update,
    Story.with({
      ...loadingModel,
      index: IndexData.Failure({ error: 'offline' }),
    }),
    Story.message(SucceededFetchPipeline({ file: writtenPipeline() })),
    Story.model(model => {
      expect(model.pipeline).toStrictEqual({
        _tag: 'Success',
        data: writtenPipeline(),
      })
      expect(model.index._tag).toBe('Failure')
    }),
    Story.Command.expectNone(),
  )
})

test('a pipeline file that is not written yet is an answer, not a failure', () => {
  Story.story(
    update,
    Story.with(loadingModel),
    Story.message(SucceededFetchPipeline({ file: NotWritten() })),
    Story.model(model => {
      expect(model.pipeline).toStrictEqual({
        _tag: 'Success',
        data: NotWritten(),
      })
    }),
  )
})

test("a failed first load of the pipeline says why, and a failed reload keeps the pipeline's numbers", () => {
  Story.story(
    update,
    Story.with(loadingModel),
    Story.message(FailedFetchPipeline({ error: 'offline' })),
    Story.model(model => {
      expect(model.pipeline._tag).toBe('Failure')
      expect(model.index._tag).toBe('Loading')
    }),
  )
  Story.story(
    update,
    Story.with(readyModelAt('/pipeline')),
    Story.message(ClickedReload()),
    Story.model(model => {
      expect(model.pipeline._tag).toBe('Refreshing')
    }),
    Story.Command.expectExact(FetchIndex, FetchPipeline),
    Story.Command.resolve(
      FetchIndex,
      SucceededFetchIndex({ index: sampleIndex }),
    ),
    Story.Command.resolve(
      FetchPipeline,
      FailedFetchPipeline({ error: 'offline' }),
    ),
    Story.model(model => {
      expect(model.pipeline).toStrictEqual({
        _tag: 'Stale',
        error: 'offline',
        data: writtenPipeline(),
      })
    }),
  )
})

test('opening a build loads its own file once, and a late answer for another build changes nothing', () => {
  Story.story(
    update,
    Story.with(readyModelAt('/')),
    Story.message(ChangedUrl({ url: urlOf('/apps/scribe/builds/270') })),
    Story.Command.expectExact(FetchBuild({ appId: 'scribe', build: '270' })),
    Story.Command.resolve(
      FetchBuild,
      SucceededFetchBuild({
        appId: 'scribe',
        build: '270',
        detail: sampleBuildDetail,
      }),
    ),
    Story.model(model => {
      expect(
        Option.map(model.maybeOpenBuild, open => open.detail._tag),
      ).toStrictEqual(Option.some('Success'))
    }),
    Story.message(ChangedUrl({ url: urlOf('/apps/scribe/builds/270') })),
    Story.Command.expectNone(),
    Story.message(
      FailedFetchBuild({ appId: 'scribe', build: '266', error: 'late' }),
    ),
    Story.model(model => {
      expect(
        Option.map(model.maybeOpenBuild, open => open.detail._tag),
      ).toStrictEqual(Option.some('Success'))
    }),
  )
})

test('pointing at a build marks it in that chart only, and leaving clears it', () => {
  Story.story(
    update,
    Story.with(readyModelAt('/')),
    Story.message(HoveredChartColumn({ metricId: 'cpu-front', build: '270' })),
    Story.model(model => {
      expect(model.maybeHover).toStrictEqual(
        Option.some({ metricId: 'cpu-front', build: '270' }),
      )
    }),
    Story.message(LeftChart({ metricId: 'main-thread-share' })),
    Story.model(model => {
      expect(Option.isSome(model.maybeHover)).toBe(true)
    }),
    Story.message(LeftChart({ metricId: 'cpu-front' })),
    Story.model(model => {
      expect(model.maybeHover).toStrictEqual(Option.none())
    }),
  )
})

test('clicking a build in a chart opens its page', () => {
  Story.story(
    update,
    Story.with(readyModelAt('/')),
    Story.message(ClickedChartColumn({ appId: 'scribe', build: '270' })),
    Story.Command.expectExact(
      NavigateInternal({ url: '/apps/scribe/builds/270' }),
    ),
    Story.Command.resolve(NavigateInternal, CompletedNavigateInternal()),
  )
})

test("the understanding page moved to each user's own page: opening its old address goes there", () => {
  const [, commands] = init(urlOf('/understanding'))
  expect(commands.map(command => command.name)).toContain(LoadExternal.name)
  Story.story(
    update,
    Story.with(readyModelAt('/')),
    Story.message(ChangedUrl({ url: urlOf('/understanding') })),
    Story.Command.expectExact(LoadExternal({ href: UNDERSTANDING_MOVED_TO })),
    Story.Command.resolve(LoadExternal, CompletedLoadExternal()),
  )
})

test('the page no longer fetches an understanding file of its own', () => {
  const [, commands] = init(urlOf('/'))
  expect(commands.map(command => command.name)).toStrictEqual([
    FetchIndex.name,
    FetchPipeline.name,
  ])
})

const fetchPipelineAnswered = (status: number, body: string) => {
  const client = HttpClient.make(request =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(request.url === '/data/pipeline.json' ? body : '{}', {
          status,
        }),
      ),
    ),
  )
  return fetchPipelineEffect.pipe(
    Effect.provide(Layer.succeed(HttpClient.HttpClient, client)),
    Effect.runPromise,
  )
}

test('fetching the pipeline reads /data/pipeline.json and when it read it', async () => {
  const before = Date.now()
  const message = await fetchPipelineAnswered(
    200,
    JSON.stringify(encodedPipeline),
  )
  expect(message._tag).toBe('SucceededFetchPipeline')
  if (message._tag === 'SucceededFetchPipeline') {
    expect(message.file._tag).toBe('Written')
    if (message.file._tag === 'Written') {
      expect(message.file.pipeline).toStrictEqual(samplePipeline)
      expect(message.file.readAtMs).toBeGreaterThanOrEqual(before)
    }
  }
})

test('no pipeline file is Not written; any other answer is a failure', async () => {
  expect(await fetchPipelineAnswered(404, 'Not found')).toStrictEqual(
    SucceededFetchPipeline({ file: NotWritten() }),
  )
  expect((await fetchPipelineAnswered(500, '{}'))._tag).toBe(
    'FailedFetchPipeline',
  )
  expect((await fetchPipelineAnswered(200, '<html></html>'))._tag).toBe(
    'FailedFetchPipeline',
  )
  expect((await fetchPipelineAnswered(200, '{"schemaVersion":2}'))._tag).toBe(
    'FailedFetchPipeline',
  )
})
