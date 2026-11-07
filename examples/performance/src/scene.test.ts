import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { FetchIndex } from './command'
import { loadingModel, openBuildModel, readyModelAt } from './main.fixtures'
import { FailedFetchIndex } from './message'
import { IndexData } from './model'
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
    )
  })

  test('home leads with how many issues a device proves, then Scribe first', () => {
    Scene.scene(
      { update, view },
      Scene.with(readyModelAt('/')),
      Scene.expect(Scene.text('1 of 4')).toExist(),
      Scene.expect(
        Scene.role('heading', { name: 'Scribe on iPhone, while recording' }),
      ).toExist(),
      Scene.expect(Scene.role('link', { name: 'CPU in front' })).toExist(),
      Scene.expect(Scene.text('Build 270: 31.1, over the fail line')).toExist(),
      Scene.expect(Scene.text('Not measured on any build here')).toExist(),
      Scene.expect(Scene.text('Scribe Playback')).toExist(),
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
