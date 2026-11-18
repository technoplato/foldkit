import { Option } from 'effect'
import { Story } from 'foldkit'
import { fromString } from 'foldkit/url'
import { expect, test } from 'vitest'

import {
  FetchBuild,
  FetchIndex,
  LoadExternal,
  NavigateInternal,
} from './command'
import { init } from './init'
import {
  loadingModel,
  readyModelAt,
  sampleBuildDetail,
  sampleIndex,
} from './main.fixtures'
import {
  ChangedUrl,
  ClickedChartColumn,
  ClickedReload,
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedFetchBuild,
  FailedFetchIndex,
  HoveredChartColumn,
  LeftChart,
  SucceededFetchBuild,
  SucceededFetchIndex,
} from './message'
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
  expect(commands.map(command => command.name)).toStrictEqual([FetchIndex.name])
})
