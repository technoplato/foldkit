import { Array, Number, Option, Schema as S, pipe } from 'effect'

import type { Budget } from './data'

// CONSTANT

const HEADROOM = 1.1
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
const ROUNDING_SLACK = 1e-9

// MODEL

/** One build on the x axis, measured or not. */
export const ChartPoint = S.Struct({
  build: S.String,
  maybeValue: S.Option(S.Number),
  isFew: S.Boolean,
})
export type ChartPoint = typeof ChartPoint.Type

/** A chart's box and the margins its labels sit in, in SVG units. */
export const ChartSize = S.Struct({
  width: S.Number,
  height: S.Number,
  top: S.Number,
  right: S.Number,
  bottom: S.Number,
  left: S.Number,
})
export type ChartSize = typeof ChartSize.Type

/** One build's place on the chart: its center, its hover column, and its point if measured. */
export const ChartColumn = S.Struct({
  build: S.String,
  x: S.Number,
  columnLeft: S.Number,
  columnWidth: S.Number,
  maybeY: S.Option(S.Number),
  isFew: S.Boolean,
})
export type ChartColumn = typeof ChartColumn.Type

export const ChartGeometry = S.Struct({
  columns: S.Array(ChartColumn),
  segments: S.Array(S.Array(ChartColumn)),
  yMax: S.Number,
  baselineY: S.Number,
  plotLeft: S.Number,
  plotRight: S.Number,
  plotTop: S.Number,
  maybeTargetY: S.Option(S.Number),
  maybeFailY: S.Option(S.Number),
})
export type ChartGeometry = typeof ChartGeometry.Type

/** Where a number sits against its budget. */
export const BudgetStatus = S.Literals([
  'Within',
  'OverTarget',
  'OverFail',
  'NoBudget',
])
export type BudgetStatus = typeof BudgetStatus.Type

// GEOMETRY

/**
 * The smallest round number at or above `value` (1, 1.2, 1.5, 2, 2.5, 3, 4, 5,
 * 6 or 8 times a power of ten), so an axis tops out at 30 rather than 27.3.
 *
 * @example
 * ```ts
 * niceCeiling(27.3) // 30
 * niceCeiling(0.42) // 0.5
 * ```
 */
export const niceCeiling = (value: number): number => {
  if (value <= 0) {
    return 1
  }
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return pipe(
    NICE_STEPS,
    Array.map(step => step * magnitude),
    Array.findFirst(
      candidate => candidate >= value - magnitude * ROUNDING_SLACK,
    ),
    Option.getOrElse(() => 10 * magnitude),
  )
}

const appendToLastRun = (
  runs: ReadonlyArray<ReadonlyArray<ChartColumn>>,
  column: ChartColumn,
): ReadonlyArray<ReadonlyArray<ChartColumn>> =>
  Array.match(runs, {
    onEmpty: () => [[column]],
    onNonEmpty: nonEmptyRuns =>
      Array.append(
        Array.initNonEmpty(nonEmptyRuns),
        Array.append(Array.lastNonEmpty(nonEmptyRuns), column),
      ),
  })

/**
 * The geometry of one small multiple: every build evenly along x (measured or
 * not, so a build nobody measured reads as a gap), y from zero to a round
 * number above the largest value and the budget, and lines only between
 * neighbouring measured builds, never across a gap.
 *
 * @example
 * ```ts
 * chartGeometry([{ build: '269', maybeValue: Option.some(24.7), isFew: false }], Option.some({ target: 15, fail: 25, source: '' }), size)
 * // yMax 30: the fail line at 25 is above the one value
 * ```
 */
export const chartGeometry = (
  points: ReadonlyArray<ChartPoint>,
  maybeBudget: Option.Option<Budget>,
  size: ChartSize,
): ChartGeometry => {
  const plotLeft = size.left
  const plotRight = size.width - size.right
  const plotTop = size.top
  const baselineY = size.height - size.bottom
  const values = Array.getSomes(Array.map(points, point => point.maybeValue))
  const budgetValues = Option.match(maybeBudget, {
    onNone: () => [],
    onSome: budget => [budget.target, budget.fail],
  })
  const largest = Array.match([...values, ...budgetValues], {
    onEmpty: () => 0,
    onNonEmpty: Array.max(Number.Order),
  })
  const yMax = niceCeiling(largest * HEADROOM)
  const yOf = (value: number): number =>
    baselineY - (value / yMax) * (baselineY - plotTop)
  const columnWidth = Array.isReadonlyArrayNonEmpty(points)
    ? (plotRight - plotLeft) / points.length
    : 0
  const columns = Array.map(points, (point, index) => ({
    build: point.build,
    x: plotLeft + (index + 0.5) * columnWidth,
    columnLeft: plotLeft + index * columnWidth,
    columnWidth,
    maybeY: Option.map(point.maybeValue, yOf),
    isFew: point.isFew,
  }))
  const noRuns: ReadonlyArray<ReadonlyArray<ChartColumn>> = []
  const segments = pipe(
    columns,
    Array.reduce(noRuns, (runs, column) => {
      if (Option.isSome(column.maybeY)) {
        return appendToLastRun(runs, column)
      } else {
        return Array.append(runs, [])
      }
    }),
    Array.filter(run => run.length > 1),
  )
  return {
    columns,
    segments,
    yMax,
    baselineY,
    plotLeft,
    plotRight,
    plotTop,
    maybeTargetY: Option.map(maybeBudget, budget => yOf(budget.target)),
    maybeFailY: Option.map(maybeBudget, budget => yOf(budget.fail)),
  }
}

/** The newest measured point, the one a chart labels at its right edge. */
export const newestMeasured = (
  points: ReadonlyArray<ChartPoint>,
): Option.Option<Readonly<{ build: string; value: number }>> =>
  pipe(
    points,
    Array.findLast(point => Option.isSome(point.maybeValue)),
    Option.flatMap(point =>
      Option.map(point.maybeValue, value => ({ build: point.build, value })),
    ),
  )

/**
 * Where a number sits against its budget: above the fail line, above the
 * target, within it, or with no budget at all. Serious heat's budget is zero
 * for both, so any minute at serious heat is over the fail line.
 */
export const budgetStatus = (
  value: number,
  maybeBudget: Option.Option<Budget>,
): BudgetStatus => {
  if (Option.isNone(maybeBudget)) {
    return 'NoBudget'
  } else if (value > maybeBudget.value.fail) {
    return 'OverFail'
  } else if (value > maybeBudget.value.target) {
    return 'OverTarget'
  } else {
    return 'Within'
  }
}
