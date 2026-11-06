import { Array, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import { budgetStatus } from '../chart'
import type { App, Index, Metric, Scope } from '../data'
import type { Message } from '../message'
import type { Hover } from '../model'
import { appRouter, buildRouter, metricRouter } from '../route'
import { scopeTabs } from './app'
import { LARGE_CHART, chartView, describeValue } from './chart'
import {
  budgetStatusLabel,
  buildValue,
  formatNumber,
  scopeLabel,
  shortSha,
} from './format'
import { outsideLink, sectionHeading } from './parts'

// VIEW

const howMeasured = (index: Index, metric: Metric, scope: Scope): Html => {
  const h = html<Message>()
  return h.section(
    [h.Class('mb-8 max-w-3xl')],
    [
      sectionHeading('How it is measured', metric.reads),
      h.dl(
        [
          h.Class(
            'grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]',
          ),
        ],
        [
          h.dt([h.Class('ink-muted')], ['Run it again']),
          h.dd([], [h.code([h.Class('text-xs break-all')], [metric.command])]),
          h.dt([h.Class('ink-muted')], ['Budget']),
          h.dd(
            [],
            [
              Option.match(metric.budgets[scope], {
                onNone: () =>
                  `No budget is set for ${scopeLabel(scope).toLowerCase()}.`,
                onSome: budget =>
                  budget.target === budget.fail
                    ? `${formatNumber(budget.fail, 0)} ${metric.unit}. From ${budget.source}.`
                    : `Target ${formatNumber(budget.target, 1)}, fail above ${formatNumber(budget.fail, 1)} ${metric.unit}. From ${budget.source}.`,
              }),
            ],
          ),
          h.dt([h.Class('ink-muted')], ['In the ledger']),
          h.dd(
            [],
            [
              Option.match(metric.maybeUrl, {
                onNone: () => 'docs/PERFORMANCE.md',
                onSome: url =>
                  outsideLink(
                    url,
                    `docs/PERFORMANCE.md line ${Option.getOrElse(metric.maybeLine, () => 0)}`,
                  ),
              }),
              ` (the ledger at ${shortSha(index.ledger.commit)})`,
            ],
          ),
        ],
      ),
    ],
  )
}

const valuesTable = (app: App, metric: Metric, scope: Scope): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('overflow-x-auto')],
    [
      h.table(
        [h.Class('w-full min-w-[36rem] text-left text-sm')],
        [
          h.thead(
            [],
            [
              h.tr(
                [h.Class('border-b border-[var(--hairline)] ink-muted')],
                Array.map(['Build', metric.unit, 'Against the budget'], title =>
                  h.th(
                    [h.Class('py-2 pr-4 font-medium'), h.Scope('col')],
                    [title],
                  ),
                ),
              ),
            ],
          ),
          h.tbody(
            [],
            Array.map(Array.reverse(app.builds), build => {
              const maybeValue = buildValue(build, scope, metric.id)
              return h.tr(
                [
                  h.Key(build.build),
                  h.Class('border-b border-[var(--hairline)] align-top'),
                ],
                [
                  h.td(
                    [h.Class('py-2 pr-4 font-semibold tabular')],
                    [
                      h.a(
                        [
                          h.Href(
                            buildRouter({ appId: app.id, build: build.build }),
                          ),
                          h.Class('link'),
                        ],
                        [build.build],
                      ),
                    ],
                  ),
                  h.td(
                    [h.Class('py-2 pr-4')],
                    [
                      Option.match(maybeValue, {
                        onNone: () =>
                          h.span([h.Class('ink-muted')], ['no number']),
                        onSome: value =>
                          h.span(
                            [
                              h.Class(
                                value._tag === 'Measured'
                                  ? 'tabular'
                                  : 'ink-muted',
                              ),
                            ],
                            [describeValue(metric, value)],
                          ),
                      }),
                    ],
                  ),
                  h.td(
                    [h.Class('py-2 pr-4 ink-secondary')],
                    [
                      Option.match(maybeValue, {
                        onNone: () => '',
                        onSome: value =>
                          value._tag === 'Measured'
                            ? budgetStatusLabel(
                                budgetStatus(
                                  value.value,
                                  metric.budgets[scope],
                                ),
                              )
                            : '',
                      }),
                    ],
                  ),
                ],
              )
            }),
          ),
        ],
      ),
    ],
  )
}

/** One metric across an app's builds: the chart wide, how it is measured, and every build's number. */
export const metricView = (
  index: Index,
  app: App,
  metric: Metric,
  maybeScope: Option.Option<Scope>,
  maybeHover: Option.Option<Hover>,
): Html => {
  const h = html<Message>()
  const scope = Option.getOrElse(maybeScope, () => app.defaultScope)
  return h.div(
    [],
    [
      h.p(
        [h.Class('text-sm')],
        [
          h.a(
            [
              h.Href(appRouter({ appId: app.id, scope: maybeScope })),
              h.Class('link'),
            ],
            [app.name],
          ),
        ],
      ),
      h.h1([h.Class('text-3xl font-semibold')], [metric.label]),
      h.p(
        [h.Class('mb-4 ink-secondary')],
        [`${metric.unit}, ${scopeLabel(scope).toLowerCase()}`],
      ),
      h.div(
        [h.Class('mb-4')],
        [
          scopeTabs(app, scope, maybeScopeParam =>
            metricRouter({
              appId: app.id,
              metricId: metric.id,
              scope: maybeScopeParam,
            }),
          ),
        ],
      ),
      h.div(
        [h.Class('mb-8')],
        [
          chartView({
            app,
            metric,
            scope,
            maybeHover,
            size: LARGE_CHART,
            isLarge: true,
          }),
        ],
      ),
      howMeasured(index, metric, scope),
      sectionHeading(
        'Every build',
        'Newest first; a build nobody measured says why.',
      ),
      valuesTable(app, metric, scope),
    ],
  )
}
