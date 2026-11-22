import { Array, Match as M, Option, pipe } from 'effect'
import { type Html, html } from 'foldkit/html'

import {
  type ChartColumn,
  type ChartGeometry,
  type ChartPoint,
  type ChartSize,
  budgetStatus,
  chartGeometry,
  lonePoints,
  newestMeasured,
} from '../chart'
import type {
  App,
  Budget,
  Measure,
  Measured,
  Metric,
  Scope,
  Value,
} from '../data'
import {
  ClickedChartColumn,
  HoveredChartColumn,
  LeftChart,
  type Message,
} from '../message'
import type { Hover } from '../model'
import { type TrendRange, trendGeometry, trendRange } from '../pipeline'
import { metricRouter } from '../route'
import {
  budgetStatusLabel,
  buildValue,
  formatDeclared,
  formatHour,
  formatMinutes,
  formatNumber,
} from './format'

// CONSTANT

/** A small multiple: one metric across builds, sized for a grid of them. */
export const SMALL_CHART: ChartSize = {
  width: 320,
  height: 124,
  top: 16,
  right: 58,
  bottom: 22,
  left: 4,
}

/** The metric page's chart: the same drawing, wide. */
export const LARGE_CHART: ChartSize = {
  width: 960,
  height: 300,
  top: 18,
  right: 80,
  bottom: 26,
  left: 6,
}

/** A trend as small as a word, on a scorecard's row. */
const SPARKLINE: ChartSize = {
  width: 80,
  height: 28,
  top: 3,
  right: 2,
  bottom: 3,
  left: 2,
}

/** A measure's trend on the pipeline page. */
const TREND_CHART: ChartSize = {
  width: 400,
  height: 112,
  top: 12,
  right: 52,
  bottom: 22,
  left: 64,
}

const TREND_LABEL_GAP = 6
const TREND_LABEL_MIDDLE = 3

const SPARKLINE_DOT_RADIUS = 2
const TREND_DOT_RADIUS = 3
const LABEL_EVERY_LARGE = 4
const LABEL_EVERY_SMALL = 1000
const FEW_POINT_RADIUS = 3
const TICK_LENGTH = 3
const CLOSE_LINES = 14
const LABEL_BELOW_OFFSET = 11

// VALUE

export const maybeMeasured = (value: Value): Option.Option<Measured> =>
  M.value(value).pipe(
    M.withReturnType<Option.Option<Measured>>(),
    M.tagsExhaustive({
      Measured: measured => Option.some(measured),
      NotMeasured: () => Option.none(),
    }),
  )

/** One point per build of an app, in build order, measured or not. */
export const chartPoints = (
  app: App,
  scope: Scope,
  metricId: string,
): ReadonlyArray<ChartPoint> =>
  Array.map(app.builds, build => {
    const maybeValue = pipe(
      buildValue(build, scope, metricId),
      Option.flatMap(maybeMeasured),
    )
    return {
      build: build.build,
      maybeValue: Option.map(maybeValue, measured => measured.value),
      isFew: Option.exists(maybeValue, measured => measured.isFew),
    }
  })

/** The scope a link carries: none when it is the app's own default, so each page has one URL. */
export const scopeParam = (app: App, scope: Scope): Option.Option<Scope> =>
  scope === app.defaultScope ? Option.none() : Option.some(scope)

const n = (value: number): string => value.toFixed(1)

/** What one build's number says in words: `31.1 % of a core over 75 min`. */
export const describeValue = (metric: Metric, value: Value): string =>
  M.value(value).pipe(
    M.tagsExhaustive({
      Measured: measured =>
        Array.join(
          Array.getSomes([
            Option.some(
              `${formatNumber(measured.value, metric.digits)} ${metric.unit}`,
            ),
            Option.map(
              measured.maybeMinutes,
              minutes => `over ${formatMinutes(minutes)}`,
            ),
            measured.isFew
              ? Option.some('(few minutes: read it with care)')
              : Option.none(),
          ]),
          ' ',
        ),
      NotMeasured: ({ reason }) => `not measured: ${reason}`,
    }),
  )

// VIEW

const runLines = (geometry: ChartGeometry): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.map(geometry.segments, run =>
    h.polyline(
      [
        h.Class('chart-line'),
        h.Points(
          Array.map(run, column =>
            Option.match(column.maybeY, {
              onNone: () => '',
              onSome: y => `${n(column.x)},${n(y)}`,
            }),
          ).join(' '),
        ),
      ],
      [],
    ),
  )
}

const budgetLines = (
  geometry: ChartGeometry,
  maybeBudget: Option.Option<Budget>,
  digits: number,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const ruleAt = (
    y: number,
    className: string,
    label: string,
    isLabelBelow: boolean,
  ): Html =>
    h.g(
      [],
      [
        h.line(
          [
            h.Class(className),
            h.X1(n(geometry.plotLeft)),
            h.X2(n(geometry.plotRight)),
            h.Y1(n(y)),
            h.Y2(n(y)),
          ],
          [],
        ),
        h.text(
          [
            h.Class('chart-label'),
            h.X(n(geometry.plotRight - 2)),
            h.Y(n(isLabelBelow ? y + LABEL_BELOW_OFFSET : y - 3)),
            h.TextAnchor('end'),
          ],
          [label],
        ),
      ],
    )
  return Option.match(maybeBudget, {
    onNone: () => [],
    onSome: budget => {
      const failY = Option.getOrElse(geometry.maybeFailY, () => 0)
      const targetY = Option.getOrElse(geometry.maybeTargetY, () => 0)
      if (budget.target === budget.fail) {
        return [
          ruleAt(
            failY,
            'chart-fail',
            `budget ${formatNumber(budget.fail, 0)}`,
            false,
          ),
        ]
      } else {
        const budgetDigits = digits === 0 ? 0 : 1
        return [
          ruleAt(
            failY,
            'chart-fail',
            `fail above ${formatNumber(budget.fail, budgetDigits)}`,
            false,
          ),
          ruleAt(
            targetY,
            'chart-target',
            `target ${formatNumber(budget.target, budgetDigits)}`,
            targetY - failY < CLOSE_LINES,
          ),
        ]
      }
    },
  })
}

const columnMarks = (
  geometry: ChartGeometry,
  column: ChartColumn,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Option.match(column.maybeY, {
    onNone: () => [
      h.line(
        [
          h.Class('chart-tick'),
          h.X1(n(column.x)),
          h.X2(n(column.x)),
          h.Y1(n(geometry.baselineY)),
          h.Y2(n(geometry.baselineY + TICK_LENGTH)),
        ],
        [],
      ),
    ],
    onSome: y => [
      h.circle(
        [
          h.Class(column.isFew ? 'chart-point-few' : 'chart-point'),
          h.Cx(n(column.x)),
          h.Cy(n(y)),
          h.R(
            n(
              column.isFew
                ? FEW_POINT_RADIUS
                : Math.max(2.5, Math.min(4, column.columnWidth * 0.35)),
            ),
          ),
        ],
        [],
      ),
    ],
  })
}

const buildLabels = (
  geometry: ChartGeometry,
  isLarge: boolean,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const every = isLarge ? LABEL_EVERY_LARGE : LABEL_EVERY_SMALL
  const lastIndex = geometry.columns.length - 1
  return Array.getSomes(
    Array.map(geometry.columns, (column, index) => {
      const isEnd = index === 0 || index === lastIndex
      const isNearAnEnd = index < every / 2 || lastIndex - index < every / 2
      if (!isEnd && (index % every !== 0 || isNearAnEnd)) {
        return Option.none()
      }
      const anchor = M.value(index).pipe(
        M.when(0, () => 'start'),
        M.when(lastIndex, () => 'end'),
        M.orElse(() => 'middle'),
      )
      const x = M.value(anchor).pipe(
        M.when('start', () => column.columnLeft),
        M.when('end', () => column.columnLeft + column.columnWidth),
        M.orElse(() => column.x),
      )
      return Option.some(
        h.text(
          [
            h.Class('chart-label'),
            h.X(n(x)),
            h.Y(n(geometry.baselineY + 14)),
            h.TextAnchor(anchor),
          ],
          [column.build],
        ),
      )
    }),
  )
}

/**
 * One metric across one app's builds: Tufte's small multiple. A 2 px line
 * joins neighbouring measured builds, a tick on the baseline marks a build
 * nobody measured, the budget's target and fail lines are drawn in and named,
 * the newest number is labeled at the right, and hovering a build draws a
 * crosshair and says its number; clicking it opens the build.
 */
export const chartView = (
  props: Readonly<{
    app: App
    metric: Metric
    scope: Scope
    maybeHover: Option.Option<Hover>
    size: ChartSize
    isLarge: boolean
  }>,
): Html => {
  const h = html<Message>()
  const { app, metric, scope, size, isLarge } = props
  const points = chartPoints(app, scope, metric.id)
  const maybeBudget = metric.budgets[scope]
  const geometry = chartGeometry(points, maybeBudget, size)
  const maybeHoveredColumn = pipe(
    props.maybeHover,
    Option.filter(hover => hover.metricId === metric.id),
    Option.flatMap(hover =>
      Array.findFirst(geometry.columns, column => column.build === hover.build),
    ),
  )
  const maybeNewest = newestMeasured(points)
  const newestLabel = Option.flatMap(maybeNewest, newest =>
    pipe(
      Array.findFirst(
        geometry.columns,
        column => column.build === newest.build,
      ),
      Option.flatMap(column => column.maybeY),
      Option.map(y =>
        h.text(
          [
            h.Class('chart-value tabular'),
            h.X(n(geometry.plotRight + 6)),
            h.Y(n(y + 4)),
          ],
          [formatNumber(newest.value, metric.digits)],
        ),
      ),
    ),
  )
  const crosshair = Option.map(maybeHoveredColumn, column =>
    h.line(
      [
        h.Class('chart-crosshair'),
        h.X1(n(column.x)),
        h.X2(n(column.x)),
        h.Y1(n(geometry.plotTop)),
        h.Y2(n(geometry.baselineY)),
      ],
      [],
    ),
  )
  const statusWords = Option.match(maybeNewest, {
    onNone: () => 'Not measured on any build here',
    onSome: newest =>
      Option.match(maybeBudget, {
        onNone: () =>
          `Build ${newest.build}: ${formatNumber(newest.value, metric.digits)}`,
        onSome: () =>
          `Build ${newest.build}: ${formatNumber(newest.value, metric.digits)}, ${budgetStatusLabel(budgetStatus(newest.value, maybeBudget))}`,
      }),
  })
  const readout = Option.match(maybeHoveredColumn, {
    onNone: () => statusWords,
    onSome: column =>
      pipe(
        Array.findFirst(app.builds, build => build.build === column.build),
        Option.flatMap(build => buildValue(build, scope, metric.id)),
        Option.match({
          onNone: () => `Build ${column.build}: no number`,
          onSome: value =>
            `Build ${column.build}: ${describeValue(metric, value)}`,
        }),
      ),
  })
  const svg = h.svg(
    [
      h.ViewBox(`0 0 ${size.width} ${size.height}`),
      h.Class('block h-auto w-full overflow-visible'),
      h.Role('img'),
      h.AriaLabel(`${metric.label}, ${metric.unit}. ${statusWords}.`),
      h.OnMouseLeave(LeftChart({ metricId: metric.id })),
    ],
    [
      h.line(
        [
          h.Class('chart-baseline'),
          h.X1(n(geometry.plotLeft)),
          h.X2(n(geometry.plotRight)),
          h.Y1(n(geometry.baselineY)),
          h.Y2(n(geometry.baselineY)),
        ],
        [],
      ),
      h.text(
        [
          h.Class('chart-label tabular'),
          h.X(n(geometry.plotLeft)),
          h.Y(n(geometry.plotTop - 5)),
        ],
        [formatNumber(geometry.yMax, Number.isInteger(geometry.yMax) ? 0 : 1)],
      ),
      ...budgetLines(geometry, maybeBudget, metric.digits),
      ...runLines(geometry),
      ...Option.toArray(crosshair),
      ...Array.flatMap(geometry.columns, column =>
        columnMarks(geometry, column),
      ),
      ...Option.toArray(newestLabel),
      ...buildLabels(geometry, isLarge),
      ...Array.map(geometry.columns, column =>
        h.rect(
          [
            h.Key(`hit-${column.build}`),
            h.DataAttribute('build', column.build),
            h.Class('chart-hit'),
            h.X(n(column.columnLeft)),
            h.Y(n(geometry.plotTop)),
            h.Width(n(column.columnWidth)),
            h.Height(n(geometry.baselineY - geometry.plotTop + TICK_LENGTH)),
            h.OnMouseEnter(
              HoveredChartColumn({ metricId: metric.id, build: column.build }),
            ),
            h.OnClick(
              ClickedChartColumn({ appId: app.id, build: column.build }),
            ),
          ],
          [],
        ),
      ),
    ],
  )
  return h.figure(
    [h.Class('surface rounded-lg px-3 pt-3 pb-2')],
    [
      h.figcaption(
        [h.Class('flex items-baseline justify-between gap-3')],
        [
          h.a(
            [
              h.Href(
                metricRouter({
                  appId: app.id,
                  metricId: metric.id,
                  scope: scopeParam(app, scope),
                }),
              ),
              h.Class('link text-sm font-semibold'),
            ],
            [metric.label],
          ),
          h.span([h.Class('text-xs ink-muted')], [metric.unit]),
        ],
      ),
      svg,
      h.p(
        [
          h.Class('mt-1 min-h-[2.5rem] text-xs ink-secondary'),
          h.AriaLive('polite'),
        ],
        [readout],
      ),
    ],
  )
}

const trendWords = (measure: Measure, range: TrendRange): string => {
  const say = (value: number): string => formatNumber(value, measure.digits)
  return `lowest ${say(range.lowest)}, highest ${say(range.highest)}, newest ${say(range.newest)}.`
}

const trendDots = (
  geometry: ChartGeometry,
  radius: number,
  className: string,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const maybeNewest = Array.findLast(geometry.columns, column =>
    Option.isSome(column.maybeY),
  )
  const columns = Array.dedupeWith(
    [...lonePoints(geometry), ...Option.toArray(maybeNewest)],
    (one, other) => one.build === other.build,
  )
  return Array.getSomes(
    Array.map(columns, column =>
      Option.map(column.maybeY, y =>
        h.circle(
          [h.Class(className), h.Cx(n(column.x)), h.Cy(n(y)), h.R(n(radius))],
          [],
        ),
      ),
    ),
  )
}

const targetRule = (geometry: ChartGeometry): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Option.match(geometry.maybeTargetY, {
    onNone: () => [],
    onSome: y => [
      h.line(
        [
          h.Class('chart-target'),
          h.X1(n(geometry.plotLeft)),
          h.X2(n(geometry.plotRight)),
          h.Y1(n(y)),
          h.Y2(n(y)),
        ],
        [],
      ),
    ],
  })
}

/** A measure's trend as small as a word, and as words for a screen reader. */
export const sparkline = (measure: Measure): Option.Option<Html> => {
  const h = html<Message>()
  return Option.map(trendRange(measure), range => {
    const geometry = trendGeometry(measure, SPARKLINE)
    return h.svg(
      [
        h.ViewBox(`0 0 ${SPARKLINE.width} ${SPARKLINE.height}`),
        h.Class('sparkline'),
        h.Role('img'),
        h.AriaLabel(
          `${measure.label}, hour by hour: ${trendWords(measure, range)}`,
        ),
      ],
      [
        ...targetRule(geometry),
        ...runLines(geometry),
        ...trendDots(geometry, SPARKLINE_DOT_RADIUS, 'sparkline-point'),
      ],
    )
  })
}

/**
 * A measure's trend, larger: one line, the target as a named rule, the
 * newest number at its end and the hours it spans, so nothing needs a legend.
 */
export const trendChart = (measure: Measure): Option.Option<Html> => {
  const h = html<Message>()
  return Option.map(trendRange(measure), range => {
    const geometry = trendGeometry(measure, TREND_CHART)
    const label = (x: number, y: number, anchor: string, words: string): Html =>
      h.text(
        [h.Class('chart-label'), h.X(n(x)), h.Y(n(y)), h.TextAnchor(anchor)],
        [words],
      )
    const hourY = geometry.baselineY + CLOSE_LINES
    const maybeNewestY = pipe(
      geometry.columns,
      Array.findLast(column => Option.isSome(column.maybeY)),
      Option.flatMap(column => column.maybeY),
    )
    const words = trendWords(measure, range)
    return h.figure(
      [h.Class('min-w-0')],
      [
        h.svg(
          [
            h.ViewBox(`0 0 ${TREND_CHART.width} ${TREND_CHART.height}`),
            h.Class('block h-auto w-full max-w-md overflow-visible'),
            h.Role('img'),
            h.AriaLabel(`${measure.label}, hour by hour: ${words}`),
          ],
          [
            h.line(
              [
                h.Class('chart-baseline'),
                h.X1(n(geometry.plotLeft)),
                h.X2(n(geometry.plotRight)),
                h.Y1(n(geometry.baselineY)),
                h.Y2(n(geometry.baselineY)),
              ],
              [],
            ),
            ...targetRule(geometry),
            ...Option.toArray(
              Option.map(
                Option.all({
                  target: measure.maybeTarget,
                  y: geometry.maybeTargetY,
                }),
                ({ target, y }) =>
                  label(
                    geometry.plotLeft - TREND_LABEL_GAP,
                    y + TREND_LABEL_MIDDLE,
                    'end',
                    `target ${formatDeclared(target)}`,
                  ),
              ),
            ),
            ...runLines(geometry),
            ...trendDots(geometry, TREND_DOT_RADIUS, 'chart-point'),
            ...Option.toArray(
              Option.map(maybeNewestY, y =>
                h.text(
                  [
                    h.Class('chart-value tabular'),
                    h.X(n(geometry.plotRight + 6)),
                    h.Y(n(y + 4)),
                  ],
                  [formatNumber(range.newest, measure.digits)],
                ),
              ),
            ),
            ...Option.toArray(
              Option.map(Array.head(measure.trend), first =>
                label(geometry.plotLeft, hourY, 'start', formatHour(first.at)),
              ),
            ),
            ...(measure.trend.length > 1
              ? Option.toArray(
                  Option.map(Array.last(measure.trend), last =>
                    label(
                      geometry.plotRight,
                      hourY,
                      'end',
                      formatHour(last.at),
                    ),
                  ),
                )
              : []),
          ],
        ),
        h.figcaption(
          [h.Class('mt-1 text-xs ink-muted')],
          [`Hour by hour: ${words}`],
        ),
      ],
    )
  })
}
