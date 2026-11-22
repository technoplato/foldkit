import { Array, Option, Schema as S, pipe } from 'effect'

import { BudgetStatus, budgetStatus } from './chart'
import {
  type App,
  Budget,
  type Build,
  Measured,
  Metric,
  type Scope,
  type Value,
} from './data'

// CONSTANT

const WORST_FIRST: ReadonlyArray<BudgetStatus> = [
  'OverFail',
  'OverTarget',
  'Within',
]

// MODEL

/** One metric the build measured, against its budget. */
export const ScorecardRow = S.Struct({
  metric: Metric,
  measured: Measured,
  maybeBudget: S.Option(Budget),
  status: BudgetStatus,
})
export type ScorecardRow = typeof ScorecardRow.Type

/**
 * An app's numbers as a table: one build, the ones with a target worst
 * first, then what nothing can be said of.
 */
export const Scorecard = S.Struct({
  build: S.String,
  maybeNewerBuild: S.Option(S.String),
  withinCount: S.Number,
  judged: S.Array(ScorecardRow),
  withoutTarget: S.Array(ScorecardRow),
  unmeasured: S.Array(Metric),
})
export type Scorecard = typeof Scorecard.Type

// READING

const isMeasured = (value: Value): value is Measured =>
  value._tag === 'Measured'

const measuredIn = (
  build: Build,
  scope: Scope,
  metricId: string,
): Option.Option<Measured> =>
  pipe(
    Option.fromNullishOr(build.scopes[scope][metricId]),
    Option.filter(isMeasured),
  )

/**
 * An app's scorecard in one scope: the newest build that measured anything
 * there, its numbers against their budgets, the worst first. A build cut
 * since then is named as newer, so a build fresh from the cut never empties
 * the table.
 *
 * @example
 * ```ts
 * appScorecard(index.metrics, scribe, 'Recording')
 * // build 374: 9 judged, none within, 4 without a target, 14 unmeasured
 * ```
 */
export const appScorecard = (
  metrics: ReadonlyArray<Metric>,
  app: App,
  scope: Scope,
): Option.Option<Scorecard> =>
  pipe(
    app.builds,
    Array.findLast(build =>
      Array.some(metrics, metric =>
        Option.isSome(measuredIn(build, scope, metric.id)),
      ),
    ),
    Option.map(build => {
      const rows: ReadonlyArray<ScorecardRow> = Array.getSomes(
        Array.map(metrics, metric =>
          Option.map(measuredIn(build, scope, metric.id), measured => ({
            metric,
            measured,
            maybeBudget: metric.budgets[scope],
            status: budgetStatus(measured.value, metric.budgets[scope]),
          })),
        ),
      )
      return {
        build: build.build,
        maybeNewerBuild: pipe(
          Array.last(app.builds),
          Option.map(newest => newest.build),
          Option.filter(newest => newest !== build.build),
        ),
        withinCount: Array.filter(rows, row => row.status === 'Within').length,
        judged: Array.flatMap(WORST_FIRST, status =>
          Array.filter(rows, row => row.status === status),
        ),
        withoutTarget: Array.filter(rows, row => row.status === 'NoBudget'),
        unmeasured: Array.filter(metrics, metric =>
          Option.isNone(measuredIn(build, scope, metric.id)),
        ),
      }
    }),
  )
