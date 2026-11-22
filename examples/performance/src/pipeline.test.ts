import { Array, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import { Pipeline } from './data'
import { encodedPipeline, samplePipeline } from './main.fixtures'
import {
  HOME_MEASURE_COUNT,
  HOME_PROBLEM_COUNT,
  diskMeasure,
  homeMeasures,
  homeProblems,
  homeWindow,
  issueUrl,
  lastDay,
  lastDayTrend,
  outOfDateMinutes,
  trendPoints,
  trendRange,
  windowCaveat,
} from './pipeline'

const pipelineWith = (changes: Readonly<Record<string, unknown>>): Pipeline =>
  S.decodeUnknownSync(Pipeline)({ ...encodedPipeline, ...changes })

const hourAt = (hour: string, state: string) => ({
  ...encodedPipeline.hours[0],
  at: `2026-11-22T${hour}:00:00-05:00`,
  state,
})

const NEWEST_HOUR_MS = Date.parse('2026-11-22T12:00:00-05:00')
const MS_PER_HOUR = 60 * 60 * 1000

describe('the home page shows the top of each list, in the file’s order', () => {
  test('six measures', () => {
    expect(HOME_MEASURE_COUNT).toBe(6)
    expect(
      Array.map(homeMeasures(samplePipeline), measure => measure.id),
    ).toStrictEqual([
      'builds-per-hour',
      'p0-wait',
      'p1-wait',
      'main-wait',
      'well-used',
      'under-used',
    ])
  })

  test('three problems, the worst first', () => {
    const problems = Array.map(
      ['first', 'second', 'third', 'fourth', 'fifth'],
      text => ({ text, issue: null, url: null }),
    )
    const pipeline = pipelineWith({
      verdict: { ...encodedPipeline.verdict, problems },
    })
    expect(HOME_PROBLEM_COUNT).toBe(3)
    expect(
      Array.map(homeProblems(pipeline), problem => problem.text),
    ).toStrictEqual(['first', 'second', 'third'])
  })

  test('the window its six measures share, so no number is bare', () => {
    expect(homeWindow(samplePipeline)).toStrictEqual(
      Option.some('last 24 hours'),
    )
    const mixed = pipelineWith({
      measures: Array.map(encodedPipeline.measures, measure =>
        measure.id === 'p0-wait' ? { ...measure, window: 'now' } : measure,
      ),
    })
    expect(homeWindow(mixed)).toStrictEqual(Option.none())
  })

  test('a window partly measured keeps the window, and says how much', () => {
    const partly = 'last 24 hours (120 of 1,440 minutes measured)'
    const pipeline = pipelineWith({
      shares: { ...encodedPipeline.shares, window: partly },
    })
    expect(homeWindow(pipeline)).toStrictEqual(Option.some('last 24 hours'))
    const [builds, wait] = samplePipeline.measures
    if (builds === undefined || wait === undefined) {
      throw new Error('the example has no measures')
    }
    const window = Option.some('last 24 hours')
    expect(windowCaveat(builds, window)).toStrictEqual(
      Option.some('hours with a line'),
    )
    expect(windowCaveat(wait, window)).toStrictEqual(Option.none())
    expect(windowCaveat({ ...wait, window: partly }, window)).toStrictEqual(
      Option.some('120 of 1,440 minutes measured'),
    )
    expect(windowCaveat(wait, Option.none())).toStrictEqual(
      Option.some('last 24 hours'),
    )
  })

  test('disk against its limit is the disk-free measure, wherever it sits', () => {
    expect(
      Option.map(diskMeasure(samplePipeline), measure => measure.status),
    ).toStrictEqual(Option.some('Met'))
  })
})

describe('the last 24 hours', () => {
  test('are always 24 cells, and an hour with no row is Not measured', () => {
    const day = lastDay(samplePipeline.hours)
    expect(day).toHaveLength(24)
    expect(Array.map(day, hour => hour.state)).toStrictEqual([
      ...Array.replicate('Unknown', 22),
      'JustRight',
      'OverUsed',
    ])
    expect(Array.map(day, hour => Date.parse(hour.at))).toStrictEqual(
      Array.makeBy(24, index => NEWEST_HOUR_MS - (23 - index) * MS_PER_HOUR),
    )
  })

  test('a gap keeps its place', () => {
    const pipeline = pipelineWith({
      hours: [hourAt('09', 'UnderUsed'), hourAt('12', 'Idle')],
    })
    expect(
      Array.map(
        Array.takeRight(lastDay(pipeline.hours), 4),
        hour => hour.state,
      ),
    ).toStrictEqual(['UnderUsed', 'Unknown', 'Unknown', 'Idle'])
  })

  test('of 72 hours only the newest 24 show', () => {
    const hours = Array.makeBy(72, index => ({
      ...encodedPipeline.hours[0],
      at: new Date(NEWEST_HOUR_MS - (71 - index) * MS_PER_HOUR).toISOString(),
      state: index < 48 ? 'Idle' : 'JustRight',
    }))
    expect(
      Array.map(lastDay(pipelineWith({ hours }).hours), hour => hour.state),
    ).toStrictEqual(Array.replicate('JustRight', 24))
  })

  test('no hour read is no strip', () => {
    expect(lastDay([])).toStrictEqual([])
  })
})

describe('numbers written every 5 minutes go out of date after 15', () => {
  const readAfter = (minutes: number) =>
    outOfDateMinutes(
      samplePipeline.generatedAt,
      Date.parse(samplePipeline.generatedAt) + minutes * 60 * 1000,
    )

  test('fresh through 15 minutes', () => {
    expect(readAfter(2)).toStrictEqual(Option.none())
    expect(readAfter(15)).toStrictEqual(Option.none())
  })

  test('older than that says how old', () => {
    expect(readAfter(16)).toStrictEqual(Option.some(16))
    expect(readAfter(122)).toStrictEqual(Option.some(122))
  })

  test('a time that does not read has no age', () => {
    expect(outOfDateMinutes('not a time', NEWEST_HOUR_MS)).toStrictEqual(
      Option.none(),
    )
  })
})

describe("a measure's trend", () => {
  const measure = Option.getOrThrow(
    Array.head(
      pipelineWith({
        measures: [
          {
            ...encodedPipeline.measures[0],
            trend: [
              { at: '2026-11-22T10:00:00-05:00', value: 23 },
              { at: '2026-11-22T11:00:00-05:00', value: null },
              { at: '2026-11-22T12:00:00-05:00', value: 11 },
            ],
          },
        ],
      }).measures,
    ),
  )

  test('keeps an hour nobody measured as a gap, never a zero', () => {
    expect(
      Array.map(trendPoints(measure), point => point.maybeValue),
    ).toStrictEqual([Option.some(23), Option.none(), Option.some(11)])
  })

  test('says its lowest, highest and newest', () => {
    expect(trendRange(measure)).toStrictEqual(
      Option.some({ lowest: 11, highest: 23, newest: 11 }),
    )
  })

  test('is cut to the newest 24 hours where it stands under that heading', () => {
    const long = {
      ...measure,
      trend: Array.makeBy(72, hour => ({
        at: new Date(NEWEST_HOUR_MS - (71 - hour) * MS_PER_HOUR).toISOString(),
        maybeValue: Option.some(hour),
      })),
    }
    expect(trendRange(lastDayTrend(long))).toStrictEqual(
      Option.some({ lowest: 48, highest: 71, newest: 71 }),
    )
    expect(lastDayTrend(measure)).toStrictEqual(measure)
  })

  test('with no number has no range', () => {
    expect(trendRange({ ...measure, trend: [] })).toStrictEqual(Option.none())
  })
})

test('an issue number prints as its page on the issues site', () => {
  expect(issueUrl(2737)).toBe('https://issues.pisspoursoftware.xyz/issues/2737')
})
