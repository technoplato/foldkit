import { Array } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { FetchIndex, FetchPipeline } from './command'
import { type Index, NotWritten, type PipelineFile } from './data'
import {
  encodedPipeline,
  encodedUnmeasuredPipeline,
  loadingModel,
  openBuildModel,
  readyModelAt,
  sampleIndex,
  writtenPipeline,
} from './main.fixtures'
import {
  FailedFetchIndex,
  FailedFetchPipeline,
  SucceededFetchPipeline,
} from './message'
import { IndexData, type Model, PipelineData } from './model'
import { UNDERSTANDING_MOVED_TO } from './moved'
import { update } from './update'
import { view } from './view/index'

describe('the page', () => {
  test("home and the page links send the understanding profile to each user's own page", () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.role('link', { name: 'Understanding, on your own page' }),
      ).toHaveAttr('href', UNDERSTANDING_MOVED_TO),
      Scene.expect(Scene.role('link', { name: 'Understanding' })).toHaveAttr(
        'href',
        UNDERSTANDING_MOVED_TO,
      ),
    )
  })

  test('the old understanding address says where the page went while it goes there', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/understanding')),
      Scene.expect(
        Scene.role('link', { name: 'me.pisspoursoftware.xyz/understanding' }),
      ).toHaveAttr('href', UNDERSTANDING_MOVED_TO),
    )
  })

  test('says it is loading before the numbers arrive', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadingModel),
      Scene.expect(Scene.text('Loading the numbers…')).toExist(),
    )
  })

  test('says why when the numbers did not load, and can try again', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...loadingModel,
        index: IndexData.Failure({
          error: '/data/index.json answered HTTP 404',
        }),
      }),
      Scene.expect(Scene.text('The numbers did not load.')).toExist(),
      Scene.click(Scene.role('button', { name: 'Try again' })),
      Scene.Command.resolve(
        FetchIndex,
        FailedFetchIndex({ error: 'still 404' }),
      ),
      Scene.Command.resolve(
        FetchPipeline,
        SucceededFetchPipeline({ file: NotWritten() }),
      ),
    )
  })

  test('Scribe’s charts stay on its own page', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/apps/scribe')),
      Scene.expect(Scene.text('Build 270: 31.1, over the fail line')).toExist(),
      Scene.expect(Scene.text('Not measured on any build here')).toExist(),
    )
  })

  test('a chart draws its budget lines with their words', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/apps/scribe/metrics/cpu-front')),
      Scene.expect(Scene.text('fail above 25.0')).toExist(),
      Scene.expect(Scene.text('target 15.0')).toExist(),
      Scene.expect(
        Scene.text(
          'python3 -I scripts/perf/metrics.py <build> --device <device>',
        ),
      ).toExist(),
    )
  })

  test('pointing at a build says its number and its minutes', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/apps/scribe/metrics/cpu-front')),
      Scene.hover(Scene.selector('rect[data-build="270"]')),
      Scene.expect(
        Scene.text('Build 270: 31.1 % of a core over 75 min'),
      ).toExist(),
      Scene.hover(Scene.selector('rect[data-build="256"]')),
      Scene.expect(
        Scene.text(
          'Build 256: not measured: no recording minute on this build',
        ),
      ).toExist(),
    )
  })

  test('issues are grouped by what proves them, and a disproved claim stays disproved', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/issues')),
      Scene.expect(
        Scene.role('heading', { name: 'Proven on a device (1)' }),
      ).toExist(),
      Scene.expect(
        Scene.text(
          'iPhone, builds 266, 269, 270: Instant text received 0.8 -> 0.1 MB a minute quiet',
        ),
      ).toExist(),
      Scene.expect(Scene.role('heading', { name: 'Disproved (1)' })).toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'Landed, not proven (1)' }),
      ).toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'In progress (1)' }),
      ).toExist(),
      Scene.expect(Scene.role('link', { name: '#1423' })).toHaveAttr(
        'href',
        'https://issues.pisspoursoftware.xyz/issues/1423',
      ),
    )
  })

  test("a build shows every number, its conditions and the ledger's own row", () => {
    Scene.scene(
      { update, view },
      Scene.with(openBuildModel),
      Scene.expect(Scene.role('heading', { name: 'Build 270' })).toExist(),
      Scene.expect(
        Scene.role('link', { name: '31.1 % of a core over 75 min' }),
      ).toExist(),
      Scene.expect(Scene.text('30.9 (43 min)')).toExist(),
      Scene.expect(
        Scene.text('hang reports pulled up to 11-04 17:42 only'),
      ).toExist(),
    )
  })

  test('a build the ledger says was not measured says why in the builds table', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/apps/scribe')),
      Scene.expect(
        Scene.text('not measured: 254-256 never reached the phone'),
      ).toExist(),
      Scene.expect(Scene.text('cut')).toExist(),
    )
  })

  test('the library lists its versions with what the ledger measured', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/apps/instant-data-swift')),
      Scene.expect(Scene.role('link', { name: '1.9.73' })).toExist(),
      Scene.expect(
        Scene.text('Down, not separable. Receive 44.9 -> 15.7'),
      ).toExist(),
    )
  })

  test('the method says who can open the page', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/method')),
      Scene.expect(
        Scene.role('heading', { name: 'Who can open this page' }),
      ).toExist(),
    )
  })
})

const pageWith = (path: string, file: PipelineFile): Model => ({
  ...readyModelAt(path),
  pipeline: PipelineData.Success({ data: file }),
})

const homeWith = (changes: Readonly<Record<string, unknown>>): Model =>
  pageWith('/', writtenPipeline({ ...encodedPipeline, ...changes }))

const problemsNamed = (texts: ReadonlyArray<string>) => ({
  verdict: {
    ...encodedPipeline.verdict,
    problems: Array.map(texts, text => ({ text, issue: 2737, url: null })),
  },
})

const problemText = (which: string): string => `problem ${which}`

const pagesNavigation = Scene.role('navigation', { name: 'Pages' })

describe('the build pipeline on the home page', () => {
  test('comes first', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.first(Scene.all.role('heading', { level: 2 })),
      ).toHaveText('Build pipeline · the M5 Mac mini'),
    )
  })

  test('is first in the navigation', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.within(pagesNavigation, Scene.first(Scene.all.role('link'))),
      ).toHaveText('Pipeline'),
      Scene.expect(Scene.role('link', { name: 'Pipeline' })).toHaveAttr(
        'href',
        '/pipeline',
      ),
    )
  })

  test('the verdict is one word with its mark, then two sentences', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.selector('[data-verdict="UnderUsed"]')).toContainText(
        'Under-used',
      ),
      Scene.expect(Scene.selector('[data-verdict="UnderUsed"]')).toContainText(
        '◐',
      ),
      Scene.expect(
        Scene.text('10 builds are waiting and a third of the Mac is idle.'),
      ).toExist(),
      Scene.expect(
        Scene.text(
          '1 build is running, 10 wait (4 of them P0); the oldest has waited 43 minutes.',
        ),
      ).toExist(),
    )
  })

  test.each([
    ['JustRight', 'Just right', '✓'],
    ['OverUsed', 'Overloaded', '✕'],
    ['Blocked', 'Blocked', '✕'],
    ['Idle', 'Nothing to build', '–'],
    ['Unknown', 'Not measured', '○'],
  ])('%s reads %s beside its mark', (state, words, mark) => {
    Scene.scene(
      { update, view },
      Scene.with(homeWith({ verdict: { ...encodedPipeline.verdict, state } })),
      Scene.expect(Scene.selector(`[data-verdict="${state}"]`)).toContainText(
        words,
      ),
      Scene.expect(Scene.selector(`[data-verdict="${state}"]`)).toContainText(
        mark,
      ),
    )
  })

  test('says the verdict is of now, so it never reads as the last 24 hours', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.text('Right now')).toExist(),
    )
  })

  test('says whether memory and disk are within their limits now', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.text('Short of memory')).toExist(),
      Scene.expect(
        Scene.text('440 GiB of disk free, target at least 400'),
      ).toExist(),
    )
  })

  test('says what is wrong now, each linking its issue', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.role('heading', { name: 'What is wrong now' }),
      ).toExist(),
      Scene.expect(Scene.role('link', { name: '#2737' })).toHaveAttr(
        'href',
        'https://issues.pisspoursoftware.xyz/issues/2737',
      ),
      Scene.expect(Scene.role('link', { name: '#2445' })).toHaveAttr(
        'href',
        'https://issues.pisspoursoftware.xyz/issues/2445',
      ),
    )
  })

  test('shows three problems at most, and says where the rest are', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        homeWith(
          problemsNamed(
            ['one', 'two', 'three', 'four', 'five'].map(problemText),
          ),
        ),
      ),
      Scene.expect(Scene.text('problem three', { exact: false })).toExist(),
      Scene.expect(Scene.text('problem four', { exact: false })).not.toExist(),
      Scene.expect(
        Scene.role('link', { name: '2 more on the pipeline page' }),
      ).toHaveAttr('href', '/pipeline'),
    )
  })

  test('says nothing is wrong by saying nothing', () => {
    Scene.scene(
      { update, view },
      Scene.with(homeWith(problemsNamed([]))),
      Scene.expect(
        Scene.role('heading', { name: 'What is wrong now' }),
      ).not.toExist(),
    )
  })

  test('the scorecard is the first six measures, each with value, target and status', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expectAll(Scene.all.selector('[data-measure]')).toHaveCount(6),
      Scene.expect(Scene.text('25 an hour')).toExist(),
      Scene.expect(Scene.text('target at least 30')).toExist(),
      Scene.expect(Scene.text('35.2 min')).toExist(),
      Scene.expect(Scene.text('target at most 10')).toExist(),
      Scene.expect(Scene.text('62% of minutes')).toExist(),
      Scene.expect(
        Scene.selector('[data-measure="builds-per-hour"]'),
      ).toContainText('Close'),
      Scene.expect(Scene.selector('[data-measure="p0-wait"]')).toContainText(
        'Missed',
      ),
      Scene.expect(Scene.text('Most swap used')).not.toExist(),
    )
  })

  test('the scorecard says the time its numbers are over', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.role('heading', {
          name: 'Against the targets, over the last 24 hours',
        }),
      ).toExist(),
    )
  })

  test('a number over only part of that time says so beside it', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.selector('[data-measure="builds-per-hour"]'),
      ).toContainText('hours with a line'),
      Scene.expect(
        Scene.selector('[data-measure="p0-wait"]'),
      ).not.toContainText('last 24 hours'),
    )
  })

  test('a measure with a trend draws a small line that says its numbers', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.role('img', {
          name: 'Builds finished an hour, hour by hour: lowest 11, highest 23, newest 11.',
        }),
      ).toExist(),
      Scene.expectAll(Scene.all.role('img')).toHaveCount(1),
    )
  })

  test('a small line covers the 24 hours its heading says', () => {
    const measures = Array.map(encodedPipeline.measures, (measure, index) =>
      index === 0
        ? {
            ...measure,
            trend: Array.makeBy(72, hour => ({
              at: new Date(Date.UTC(2026, 10, 19, 18 + hour)).toISOString(),
              value: hour,
            })),
          }
        : measure,
    )
    Scene.scene(
      { update, view },
      Scene.with(homeWith({ measures })),
      Scene.expect(
        Scene.role('img', {
          name: 'Builds finished an hour, hour by hour: lowest 48, highest 71, newest 71.',
        }),
      ).toExist(),
    )
  })

  test('the last 24 hours are a cell each, by keyboard and by screen reader', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expectAll(Scene.all.selector('[data-hour-state]')).toHaveCount(24),
      Scene.expectAll(
        Scene.all.selector('[data-hour-state="Unknown"]'),
      ).toHaveCount(22),
      Scene.expect(Scene.selector('[data-hour-state="JustRight"]')).toHaveAttr(
        'tabIndex',
        '0',
      ),
      Scene.expect(Scene.text('Sun, 11 AM: Just right')).toExist(),
      Scene.expect(Scene.text('Sun, 12 PM: Overloaded')).toExist(),
      Scene.expect(
        Scene.role('list', { name: 'What the marks mean' }),
      ).toContainText('Nothing to build'),
      Scene.expect(
        Scene.text(
          'Just right 62% of the last 24 hours, idle with builds waiting 21%, overloaded 9%, nothing to build 6%, not measured 2%.',
        ),
      ).toExist(),
    )
  })

  test('one quiet line says presence, places, freshness and where the rest is', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.text('The queue has counted you as away for 1 h 38 min.'),
      ).toExist(),
      Scene.expect(Scene.text('Up to 3 builds may run at once now.')).toExist(),
      Scene.expect(Scene.text('Numbers written Nov 22, 1:10 PM.')).toExist(),
      Scene.expect(
        Scene.role('link', { name: 'All 10 measures on the pipeline page' }),
      ).toHaveAttr('href', '/pipeline'),
    )
  })

  test('says when he is here', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        homeWith({
          presence: {
            ...encodedPipeline.presence,
            state: 'Present',
            sinceMinutes: 12,
            places: 1,
          },
        }),
      ),
      Scene.expect(
        Scene.text('The queue has counted you as here for 12 min.'),
      ).toExist(),
      Scene.expect(Scene.text('Up to 1 build may run at once now.')).toExist(),
    )
  })

  test('says when its numbers are out of date', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        pageWith(
          '/',
          writtenPipeline(
            encodedPipeline,
            Date.parse('2026-11-22T15:12:00-05:00'),
          ),
        ),
      ),
      Scene.expect(
        Scene.text(
          'These numbers may be out of date: they were 2 h 2 min old when this page read them.',
        ),
      ).toExist(),
    )
  })

  test('fresh numbers carry no warning', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.text('out of date', { exact: false })).not.toExist(),
    )
  })

  test('says in one line when the numbers are not written yet, and still shows the rest', () => {
    Scene.scene(
      { update, view },
      Scene.with(pageWith('/', NotWritten())),
      Scene.expect(
        Scene.text("The build pipeline's numbers are not written yet."),
      ).toExist(),
      Scene.expect(Scene.selector('[data-verdict]')).not.toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'Scribe on iPhone, while recording' }),
      ).toExist(),
      Scene.expect(Scene.text('Scribe Playback')).toExist(),
    )
  })

  test('says it is loading, and still shows the rest', () => {
    Scene.scene(
      { update, view },
      Scene.with({ ...readyModelAt('/'), pipeline: PipelineData.Loading() }),
      Scene.expect(
        Scene.text("Loading the build pipeline's numbers…"),
      ).toExist(),
      Scene.expect(Scene.text('Scribe Playback')).toExist(),
    )
  })

  test('says why when the pipeline did not load, and can try again', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...readyModelAt('/'),
        pipeline: PipelineData.Failure({
          error: '/data/pipeline.json answered HTTP 500',
        }),
      }),
      Scene.expect(
        Scene.text("The build pipeline's numbers did not load."),
      ).toExist(),
      Scene.expect(
        Scene.text('/data/pipeline.json answered HTTP 500'),
      ).toExist(),
      Scene.expect(Scene.text('Scribe Playback')).toExist(),
      Scene.click(Scene.role('button', { name: 'Try again' })),
      Scene.Command.resolve(FetchIndex, FailedFetchIndex({ error: 'offline' })),
      Scene.Command.resolve(
        FetchPipeline,
        FailedFetchPipeline({ error: 'offline' }),
      ),
    )
  })

  test('a failed reload keeps the numbers and says so', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...readyModelAt('/'),
        pipeline: PipelineData.Stale({
          error: 'offline',
          data: writtenPipeline(),
        }),
      }),
      Scene.expect(
        Scene.text(
          "The build pipeline's numbers did not reload, so these are the last ones read.",
        ),
      ).toExist(),
      Scene.expect(Scene.text('25 an hour')).toExist(),
    )
  })

  test('still shows when the app numbers did not load', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...readyModelAt('/'),
        index: IndexData.Failure({ error: 'offline' }),
      }),
      Scene.expect(Scene.text('25 an hour')).toExist(),
      Scene.expect(Scene.text('The numbers did not load.')).toExist(),
    )
  })

  test('what was not measured says so, and is never a zero', () => {
    Scene.scene(
      { update, view },
      Scene.with(pageWith('/', writtenPipeline(encodedUnmeasuredPipeline))),
      Scene.expect(Scene.selector('[data-verdict="Unknown"]')).toContainText(
        'Not measured',
      ),
      Scene.expectAll(Scene.all.text('No number')).toHaveCount(6),
      Scene.expect(Scene.text('Memory not measured')).toExist(),
      Scene.expect(Scene.text('Free disk not measured')).toExist(),
      Scene.expect(
        Scene.text('The last 24 hours are not measured yet.'),
      ).toExist(),
      Scene.expect(
        Scene.text('How the last 24 hours were shared is not measured.'),
      ).toExist(),
      Scene.expect(Scene.text('Whether you are here is not known.')).toExist(),
      Scene.expect(
        Scene.text('How many builds may run at once is not known.'),
      ).toExist(),
      Scene.expectAll(Scene.all.role('img')).toBeEmpty(),
    )
  })
})

describe('Scribe on iPhone on the home page', () => {
  const homeWithIndex = (index: Index): Model => ({
    ...readyModelAt('/'),
    index: IndexData.Success({ data: index }),
  })

  test('is one line of proof with its link', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(
        Scene.role('heading', { name: 'Scribe on iPhone, while recording' }),
      ).toExist(),
      Scene.expect(Scene.text('1 of 4')).toExist(),
      Scene.expect(
        Scene.role('link', { name: 'every issue and its evidence' }),
      ).toHaveAttr('href', '/issues'),
    )
  })

  test('is a plain table, with no chart', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expectAll(Scene.all.selector('rect[data-build]')).toBeEmpty(),
      Scene.expectAll(Scene.all.selector('figure')).toBeEmpty(),
      Scene.expect(
        Scene.role('table', { name: 'Scribe on iPhone, build 270' }),
      ).toExist(),
      Scene.expect(Scene.selector('[data-metric="cpu-front"]')).toContainText(
        '31.1',
      ),
      Scene.expect(Scene.selector('[data-metric="cpu-front"]')).toContainText(
        '15.0',
      ),
      Scene.expect(Scene.selector('[data-metric="cpu-front"]')).toContainText(
        'over the fail line',
      ),
      Scene.expectAll(Scene.all.selector('[data-metric]')).toHaveCount(1),
      Scene.expect(
        Scene.role('columnheader', { name: 'Against the target' }),
      ).toExist(),
      Scene.expect(
        Scene.text(
          'Build 270, the newest measured: 0 of 1 numbers with a target are within budget.',
        ),
      ).toExist(),
    )
  })

  test('each row opens that chart, the unmeasured ones too', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.role('link', { name: 'CPU in front' })).toHaveAttr(
        'href',
        '/apps/scribe/metrics/cpu-front',
      ),
      Scene.expect(
        Scene.text('2 more with no target or no number on build 270'),
      ).toExist(),
      Scene.expect(
        Scene.role('link', { name: "Main thread's share of Scribe's CPU" }),
      ).toHaveAttr('href', '/apps/scribe/metrics/main-thread-share'),
      Scene.expect(Scene.text('67%')).toExist(),
      Scene.expect(Scene.text('not measured')).toExist(),
      Scene.expect(
        Scene.role('link', { name: 'Stutters in Notes' }),
      ).toHaveAttr('href', '/apps/scribe/metrics/hitches-notes'),
    )
  })

  test('a build nobody measured yet is named, and the table stays', () => {
    const apps = Array.map(sampleIndex.apps, app => ({
      ...app,
      builds: Array.flatMap(app.builds, build =>
        build.build === '270'
          ? [
              build,
              {
                ...build,
                build: '271',
                scopes: { Recording: {}, NotRecording: {}, CannedAudio: {} },
              },
            ]
          : [build],
      ),
    }))
    Scene.scene(
      { update, view },
      Scene.with(homeWithIndex({ ...sampleIndex, apps })),
      Scene.expect(
        Scene.text('Build 271 is newer and has no numbers yet.'),
      ).toExist(),
      Scene.expect(
        Scene.role('table', { name: 'Scribe on iPhone, build 270' }),
      ).toExist(),
    )
  })

  test('the other apps keep their cards', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.role('heading', { name: 'The other apps' })).toExist(),
      Scene.expect(Scene.text('Scribe Playback')).toExist(),
      Scene.expect(Scene.text('instant-data-swift')).toExist(),
    )
  })
})

describe('the pipeline page', () => {
  test('lists every measure with how, over what and its trend', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/pipeline')),
      Scene.expect(
        Scene.role('heading', { name: 'Build pipeline', level: 1 }),
      ).toExist(),
      Scene.expect(
        Scene.text(
          'M5 Mac mini: Apple M5 Pro, 18 cores, 64 GiB of memory, 1,858 GiB of disk.',
        ),
      ).toExist(),
      Scene.expectAll(Scene.all.selector('[data-measure]')).toHaveCount(10),
      Scene.expect(
        Scene.text("heavy jobs that ended, counted from the queue's journal"),
      ).toExist(),
      Scene.expect(Scene.text('last 24 hours, hours with a line')).toExist(),
      Scene.expect(
        Scene.text('no pair of runs on one commit in the window'),
      ).toExist(),
      Scene.expect(
        Scene.selector('[data-measure="machine-failures"]'),
      ).toContainText('Not measured'),
      Scene.expect(
        Scene.text('Hour by hour: lowest 11, highest 23, newest 11.'),
      ).toExist(),
      Scene.expect(Scene.text('target 30')).toExist(),
    )
  })

  test('says what is happening right now', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/pipeline')),
      Scene.expect(Scene.role('heading', { name: 'This minute' })).toExist(),
      Scene.expect(Scene.text('10 (4 P0, 6 P1)')).toExist(),
      Scene.expect(Scene.text('43 min')).toExist(),
      Scene.expect(Scene.text('26.8 GiB')).toExist(),
      Scene.expect(Scene.text('Compilers running outside the queue')).toExist(),
    )
  })

  test('says who used the CPU', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/pipeline')),
      Scene.expect(
        Scene.role('heading', { name: 'Who used the CPU' }),
      ).toExist(),
      Scene.expect(Scene.text('Builds and tests from the queue')).toExist(),
      Scene.expect(Scene.text('151.0 core-hours, 56%')).toExist(),
      Scene.expectAll(Scene.all.selector('[data-consumer]')).toHaveCount(4),
    )
  })

  test('says disk against its target and each folder against its cap', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/pipeline')),
      Scene.expect(Scene.role('heading', { name: 'Disk' })).toExist(),
      Scene.expect(Scene.text('440 GiB free, target at least 400')).toExist(),
      Scene.expect(
        Scene.last(Scene.all.selector('[data-folder]')),
      ).toContainText('Over its cap'),
      Scene.expect(
        Scene.first(Scene.all.selector('[data-folder]')),
      ).toContainText('Within its cap'),
    )
  })

  test('lists what changed and where the targets are declared', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/pipeline')),
      Scene.expect(Scene.role('heading', { name: 'What changed' })).toExist(),
      Scene.expect(
        Scene.text(
          'Filed #2737; first targets written from three days of readings.',
        ),
      ).toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'Where the targets are declared' }),
      ).toExist(),
      Scene.expect(Scene.text('scripts/perf/pipeline-targets.json')).toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'What could not be read' }),
      ).not.toExist(),
    )
  })

  test('shows every problem', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        pageWith(
          '/pipeline',
          writtenPipeline({
            ...encodedPipeline,
            ...problemsNamed(
              ['one', 'two', 'three', 'four', 'five'].map(problemText),
            ),
          }),
        ),
      ),
      Scene.expect(Scene.text('problem five', { exact: false })).toExist(),
    )
  })

  test('says what could not be read', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        pageWith('/pipeline', writtenPipeline(encodedUnmeasuredPipeline)),
      ),
      Scene.expect(
        Scene.role('heading', { name: 'What could not be read' }),
      ).toExist(),
      Scene.expect(
        Scene.text('What the numbers above leave out, or count only in part.'),
      ).toExist(),
      Scene.expect(Scene.text('macwatch.db could not be read')).toExist(),
      Scene.expectAll(Scene.all.text('No number')).toHaveCount(10),
      Scene.expect(Scene.text('Who used the CPU is not measured.')).toExist(),
    )
  })

  test('says in one line when the file is not written yet', () => {
    Scene.scene(
      { update, view },
      Scene.with(pageWith('/pipeline', NotWritten())),
      Scene.expect(
        Scene.role('heading', { name: 'Build pipeline', level: 1 }),
      ).toExist(),
      Scene.expect(
        Scene.text("The build pipeline's numbers are not written yet."),
      ).toExist(),
    )
  })

  test('does not wait for the app numbers', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...readyModelAt('/pipeline'),
        index: IndexData.Loading(),
      }),
      Scene.expect(Scene.text('Who used the CPU')).toExist(),
      Scene.expect(Scene.text('Loading the numbers…')).not.toExist(),
    )
  })
})
