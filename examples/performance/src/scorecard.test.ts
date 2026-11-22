import { Array, Option } from 'effect'
import { expect, test } from 'vitest'

import type { App, Index } from './data'
import { sampleIndex } from './main.fixtures'
import { appScorecard } from './scorecard'

const scribe = Option.getOrThrow(Array.head(sampleIndex.apps))

const scorecardOf = (index: Index, app: App) =>
  Option.getOrThrow(appScorecard(index.metrics, app, app.defaultScope))

test('the scorecard reads the newest build, and counts only numbers with a target', () => {
  const scorecard = scorecardOf(sampleIndex, scribe)
  expect(scorecard.build).toBe('270')
  expect(scorecard.maybeNewerBuild).toStrictEqual(Option.none())
  expect(scorecard.judgedCount).toBe(1)
  expect(scorecard.withinCount).toBe(0)
  expect(
    Array.map(scorecard.measured, row => [row.metric.id, row.status]),
  ).toStrictEqual([
    ['cpu-front', 'OverFail'],
    ['main-thread-share', 'NoBudget'],
  ])
  expect(Array.map(scorecard.unmeasured, metric => metric.id)).toStrictEqual([
    'hitches-notes',
  ])
})

test('the worst comes first', () => {
  const budgetOf = (metricId: string) =>
    metricId === 'cpu-front'
      ? { target: 40, fail: 50, source: '' }
      : { target: 50, fail: 60, source: '' }
  const index: Index = {
    ...sampleIndex,
    metrics: Array.map(sampleIndex.metrics, metric => ({
      ...metric,
      budgets: {
        ...metric.budgets,
        Recording: Option.some(budgetOf(metric.id)),
      },
    })),
  }
  const scorecard = scorecardOf(index, scribe)
  expect(
    Array.map(scorecard.measured, row => [row.metric.id, row.status]),
  ).toStrictEqual([
    ['main-thread-share', 'OverFail'],
    ['cpu-front', 'Within'],
  ])
  expect(scorecard.withinCount).toBe(1)
})

test('a build nobody measured yet does not empty the table', () => {
  const newest = Option.getOrThrow(Array.last(scribe.builds))
  const unmeasured = {
    ...newest,
    build: '271',
    scopes: { Recording: {}, NotRecording: {}, CannedAudio: {} },
  }
  const scorecard = scorecardOf(sampleIndex, {
    ...scribe,
    builds: [...scribe.builds, unmeasured],
  })
  expect(scorecard.build).toBe('270')
  expect(scorecard.maybeNewerBuild).toStrictEqual(Option.some('271'))
})

test('an app nobody measured has no scorecard', () => {
  expect(
    appScorecard(sampleIndex.metrics, { ...scribe, builds: [] }, 'Recording'),
  ).toStrictEqual(Option.none())
})
