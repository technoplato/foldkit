import { Array, Option, Schema as S, String, pipe } from 'effect'

import {
  type ChartGeometry,
  type ChartPoint,
  type ChartSize,
  chartGeometry,
} from './chart'
import {
  type Hour,
  HourState,
  type Measure,
  type Pipeline,
  type Problem,
} from './data'

// CONSTANT

/** How many measures the home page shows; the pipeline page shows them all. */
export const HOME_MEASURE_COUNT = 6
/** How many of what is wrong now the home page shows. */
export const HOME_PROBLEM_COUNT = 3

const DISK_MEASURE_ID = 'disk-free'
const ISSUES_SITE = 'https://issues.pisspoursoftware.xyz/issues'
const HOURS_IN_DAY = 24
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const OUT_OF_DATE_AFTER_MINUTES = 15
const HOW_MUCH_WAS_MEASURED = / \(.+\)$/
const AROUND_A_CAVEAT = /^[\s,(]+|\)$/g

// MODEL

/** One cell of the last 24 hours. */
export const StripHour = S.Struct({ at: S.String, state: HourState })
export type StripHour = typeof StripHour.Type

/** A trend's lowest, highest and newest number. */
export const TrendRange = S.Struct({
  lowest: S.Number,
  highest: S.Number,
  newest: S.Number,
})
export type TrendRange = typeof TrendRange.Type

// READING

/**
 * The address of a Scribe issue on the issues site.
 *
 * @example
 * ```ts
 * issueUrl(2737) // 'https://issues.pisspoursoftware.xyz/issues/2737'
 * ```
 */
export const issueUrl = (issue: number): string => `${ISSUES_SITE}/${issue}`

/** The measures the home page shows: the first six, in the file's order. */
export const homeMeasures = (pipeline: Pipeline): ReadonlyArray<Measure> =>
  Array.take(pipeline.measures, HOME_MEASURE_COUNT)

/** What is wrong now that the home page shows: the three worst. */
export const homeProblems = (pipeline: Pipeline): ReadonlyArray<Problem> =>
  Array.take(pipeline.verdict.problems, HOME_PROBLEM_COUNT)

/**
 * The time the home page's measures share, so its heading can say it: the
 * shares' window, without how much of it was measured, when every one of
 * the six is over it.
 *
 * @example
 * ```ts
 * homeWindow(pipeline) // Option.some('last 24 hours')
 * ```
 */
export const homeWindow = (pipeline: Pipeline): Option.Option<string> =>
  pipe(
    Option.some(pipeline.shares.window.replace(HOW_MUCH_WAS_MEASURED, '')),
    Option.filter(window =>
      Array.every(homeMeasures(pipeline), measure =>
        String.startsWith(window)(measure.window),
      ),
    ),
  )

/**
 * What a measure's window says beyond the one in the heading, so a number
 * over only part of that time never passes for one over all of it.
 *
 * @example
 * ```ts
 * windowCaveat(buildsPerHour, Option.some('last 24 hours'))
 * // Option.some('hours with a line')
 * ```
 */
export const windowCaveat = (
  measure: Measure,
  maybeWindow: Option.Option<string>,
): Option.Option<string> =>
  pipe(
    maybeWindow,
    Option.filter(window => String.startsWith(window)(measure.window)),
    Option.match({
      onNone: () => measure.window,
      onSome: window =>
        measure.window.slice(window.length).replace(AROUND_A_CAVEAT, ''),
    }),
    Option.some,
    Option.filter(String.isNonEmpty),
  )

/**
 * The disk's own measure (`disk-free`), wherever the file puts it, so the
 * page marks free disk as the exporter judged it and never judges it again.
 */
export const diskMeasure = (pipeline: Pipeline): Option.Option<Measure> =>
  Array.findFirst(pipeline.measures, measure => measure.id === DISK_MEASURE_ID)

const epochMs = (iso: string): Option.Option<number> => {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? Option.none() : Option.some(ms)
}

/**
 * The 24 clock hours that end with the newest one in the file, oldest first.
 * An hour with no row is Not measured, so a gap keeps its place in the day.
 *
 * @example
 * ```ts
 * lastDay([elevenOClock, noon]) // 22 Not measured cells, then 11:00 and noon
 * ```
 */
export const lastDay = (
  hours: ReadonlyArray<Hour>,
): ReadonlyArray<StripHour> => {
  const cellAt = (atMs: number): StripHour =>
    pipe(
      hours,
      Array.findFirst(hour => Date.parse(hour.at) === atMs),
      Option.match({
        onNone: () => ({ at: new Date(atMs).toISOString(), state: 'Unknown' }),
        onSome: ({ at, state }) => ({ at, state }),
      }),
    )
  return Option.match(
    Option.flatMap(Array.last(hours), newest => epochMs(newest.at)),
    {
      onNone: () => [],
      onSome: newestMs =>
        Array.makeBy(HOURS_IN_DAY, index =>
          cellAt(newestMs - (HOURS_IN_DAY - 1 - index) * MS_PER_HOUR),
        ),
    },
  )
}

/**
 * How old the numbers were when the page read them, if that is too old to
 * call them now: the exporter writes every 5 minutes, so older than 15 is
 * three writes missed.
 *
 * @example
 * ```ts
 * outOfDateMinutes('2026-11-22T13:10:00-05:00', Date.parse('2026-11-22T15:12:00-05:00'))
 * // Option.some(122)
 * ```
 */
export const outOfDateMinutes = (
  generatedAt: string,
  readAtMs: number,
): Option.Option<number> =>
  pipe(
    epochMs(generatedAt),
    Option.map(writtenMs => Math.floor((readAtMs - writtenMs) / MS_PER_MINUTE)),
    Option.filter(minutes => minutes > OUT_OF_DATE_AFTER_MINUTES),
  )

/**
 * A measure with only its trend's newest 24 hours, for the small line under
 * a heading that says the last 24 hours. The file holds up to 72.
 *
 * @example
 * ```ts
 * sparkline(lastDayTrend(measure))
 * ```
 */
export const lastDayTrend = (measure: Measure): Measure => ({
  ...measure,
  trend: Array.takeRight(measure.trend, HOURS_IN_DAY),
})

/** A measure's trend as chart points; an hour nobody measured is a gap. */
export const trendPoints = (measure: Measure): ReadonlyArray<ChartPoint> =>
  Array.map(measure.trend, ({ at, maybeValue }) => ({
    build: at,
    maybeValue,
    isFew: false,
  }))

/** A trend's shape in a chart's box, with the target as its one rule. */
export const trendGeometry = (
  measure: Measure,
  size: ChartSize,
): ChartGeometry =>
  chartGeometry(
    trendPoints(measure),
    Option.map(measure.maybeTarget, target => ({ target, fail: target })),
    size,
  )

/** A trend's lowest, highest and newest measured number, if it has any. */
export const trendRange = (measure: Measure): Option.Option<TrendRange> => {
  const values = Array.getSomes(
    Array.map(measure.trend, point => point.maybeValue),
  )
  return Option.map(Array.last(values), newest => ({
    lowest: Math.min(...values),
    highest: Math.max(...values),
    newest,
  }))
}
