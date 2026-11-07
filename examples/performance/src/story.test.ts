import { Option } from 'effect'
import { Story } from 'foldkit'
import { fromString } from 'foldkit/url'
import { expect, test } from 'vitest'

import {
  FetchBuild,
  FetchIndex,
  FetchUnderstanding,
  NavigateInternal,
} from './command'
import {
  loadingModel,
  readyModelAt,
  sampleBuildDetail,
  sampleIndex,
  sampleUnderstanding,
} from './main.fixtures'
import {
  ChangedUrl,
  ClickedChartColumn,
  ClickedReload,
  CompletedNavigateInternal,
  FailedFetchBuild,
  FailedFetchIndex,
  FailedFetchUnderstanding,
  HoveredChartColumn,
  LeftChart,
  SucceededFetchBuild,
  SucceededFetchIndex,
  SucceededFetchUnderstanding,
} from './message'
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
      FetchUnderstanding,
      FailedFetchUnderstanding({ error: 'offline' }),
    ),
    Story.model(model => {
      expect(model.index._tag).toBe('Stale')
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

test('the understanding profile loads into the page, and a failed first load says why', () => {
  Story.story(
    update,
    Story.with(loadingModel),
    Story.message(
      SucceededFetchUnderstanding({ understanding: sampleUnderstanding }),
    ),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Success')
    }),
    Story.Command.expectNone(),
  )
  Story.story(
    update,
    Story.with(loadingModel),
    Story.message(
      FailedFetchUnderstanding({
        error: '/data/understanding.json answered HTTP 404',
      }),
    ),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Failure')
    }),
  )
})

test('reload fetches the understanding profile again with the index, and a failed reload keeps it', () => {
  Story.story(
    update,
    Story.with(readyModelAt('/understanding')),
    Story.message(ClickedReload()),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Refreshing')
    }),
    Story.Command.expectHas(FetchIndex),
    Story.Command.expectHas(FetchUnderstanding),
    Story.Command.resolve(
      FetchIndex,
      SucceededFetchIndex({ index: sampleIndex }),
    ),
    Story.Command.resolve(
      FetchUnderstanding,
      FailedFetchUnderstanding({ error: 'offline' }),
    ),
    Story.model(model => {
      expect(model.understanding._tag).toBe('Stale')
    }),
  )
})
