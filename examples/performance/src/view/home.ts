import { Array, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import type { App, Index, Metric } from '../data'
import type { Message } from '../message'
import type { IndexData, PipelineData } from '../model'
import { UNDERSTANDING_MOVED_TO } from '../moved'
import { appRouter, issuesRouter, metricRouter } from '../route'
import { type Scorecard, type ScorecardRow, appScorecard } from '../scorecard'
import {
  budgetStatusLabel,
  budgetStatusTone,
  counted,
  formatAmount,
  formatDate,
  formatNumber,
  plainMetricLabel,
  scopeLabel,
} from './format'
import { indexContent, statusChip } from './parts'
import { pipelineSummary } from './pipeline'

// VIEW

/** One line: how many of the performance issues a device proves. */
const proofLine = (index: Index): Html => {
  const h = html<Message>()
  const proven = Array.filter(
    index.issues,
    issue => issue.evidence._tag === 'Proven',
  ).length
  return h.p(
    [h.Class('ink-secondary')],
    [
      h.strong(
        [h.Class('text-[var(--ink)]')],
        [`${proven} of ${index.issues.length}`],
      ),
      ` performance issues ${proven === 1 ? 'is' : 'are'} proven on a device: `,
      h.a(
        [h.Href(issuesRouter()), h.Class('link')],
        ['every issue and its evidence'],
      ),
      '.',
    ],
  )
}

const metricLink = (app: App, metric: Metric): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(
        metricRouter({
          appId: app.id,
          metricId: metric.id,
          scope: Option.none(),
        }),
      ),
      h.Class('link'),
    ],
    [plainMetricLabel(metric.label)],
  )
}

const judgedRow = (app: App, row: ScorecardRow): Html => {
  const h = html<Message>()
  const { metric, measured, maybeBudget, status } = row
  return h.tr(
    [
      h.Key(metric.id),
      h.DataAttribute('metric', metric.id),
      h.Class('border-b border-[var(--hairline)] align-baseline'),
    ],
    [
      h.th(
        [h.Class('py-2 pr-3 font-normal'), h.Scope('row')],
        [
          metricLink(app, metric),
          h.span([h.Class('block text-xs ink-muted')], [metric.unit]),
        ],
      ),
      h.td(
        [h.Class('py-2 pr-3 text-right font-semibold tabular')],
        [
          formatNumber(measured.value, metric.digits),
          ...(measured.isFew
            ? [
                h.span(
                  [h.Class('block text-xs font-normal ink-muted')],
                  ['few minutes'],
                ),
              ]
            : []),
        ],
      ),
      h.td(
        [h.Class('py-2 pr-3 text-right tabular ink-secondary')],
        [
          Option.match(maybeBudget, {
            onNone: () => 'none',
            onSome: budget => formatNumber(budget.target, metric.digits),
          }),
        ],
      ),
      h.td(
        [h.Class('py-2')],
        [statusChip(budgetStatusTone(status), budgetStatusLabel(status))],
      ),
    ],
  )
}

const judgedTable = (app: App, scorecard: Scorecard): Html => {
  const h = html<Message>()
  return h.table(
    [h.Class('mt-3 w-full max-w-4xl text-left text-sm')],
    [
      h.caption(
        [h.Class('sr-only')],
        [`${app.name} on ${app.platform}, build ${scorecard.build}`],
      ),
      h.thead(
        [],
        [
          h.tr(
            [h.Class('border-b border-[var(--hairline)] ink-muted')],
            [
              h.th(
                [h.Class('py-2 pr-3 font-medium'), h.Scope('col')],
                ['Metric'],
              ),
              h.th(
                [h.Class('py-2 pr-3 text-right font-medium'), h.Scope('col')],
                [`Build ${scorecard.build}`],
              ),
              h.th(
                [h.Class('py-2 pr-3 text-right font-medium'), h.Scope('col')],
                ['Target, at most'],
              ),
              h.th(
                [h.Class('py-2 font-medium'), h.Scope('col')],
                ['Against the target'],
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(scorecard.judged, row => judgedRow(app, row)),
      ),
    ],
  )
}

const restList = (app: App, scorecard: Scorecard): ReadonlyArray<Html> => {
  const h = html<Message>()
  const item = (metric: Metric, words: string): Html =>
    h.li(
      [
        h.Key(metric.id),
        h.Class(
          'flex justify-between gap-4 border-b border-[var(--hairline)] py-2',
        ),
      ],
      [
        metricLink(app, metric),
        h.span([h.Class('text-right ink-secondary tabular')], [words]),
      ],
    )
  const items = [
    ...Array.map(scorecard.withoutTarget, ({ metric, measured }) =>
      item(metric, formatAmount(measured.value, metric.digits, metric.unit)),
    ),
    ...Array.map(scorecard.unmeasured, metric => item(metric, 'not measured')),
  ]
  return Array.match(items, {
    onEmpty: () => [],
    onNonEmpty: rows => [
      h.details(
        [h.Class('mt-3 max-w-4xl text-sm')],
        [
          h.summary(
            [h.Class('cursor-pointer ink-secondary')],
            [
              `${rows.length} more with no target or no number on build ${scorecard.build}`,
            ],
          ),
          h.ul([h.Class('mt-1')], rows),
        ],
      ),
    ],
  })
}

const scorecardSentence = (scorecard: Scorecard): string =>
  Array.match(scorecard.judged, {
    onEmpty: () =>
      `Build ${scorecard.build} is the newest measured, and none of its numbers has a target.`,
    onNonEmpty: judged =>
      `Build ${scorecard.build}, the newest measured: ${scorecard.withinCount} of ${judged.length} numbers with a target are within budget.`,
  })

const numbersView = (index: Index, app: App): Html => {
  const h = html<Message>()
  return Option.match(appScorecard(index.metrics, app, app.defaultScope), {
    onNone: () =>
      h.p(
        [h.Class('mt-2 text-sm ink-muted')],
        [
          `No build has a number ${scopeLabel(app.defaultScope).toLowerCase()} yet.`,
        ],
      ),
    onSome: scorecard =>
      h.div(
        [],
        [
          h.p(
            [h.Class('mt-1 text-sm')],
            [
              h.span([], [scorecardSentence(scorecard)]),
              ...Option.match(scorecard.maybeNewerBuild, {
                onNone: () => [],
                onSome: build => [
                  ' ',
                  h.span(
                    [],
                    [`Build ${build} is newer and has no numbers yet.`],
                  ),
                ],
              }),
            ],
          ),
          ...Array.match(scorecard.judged, {
            onEmpty: () => [],
            onNonEmpty: () => [judgedTable(app, scorecard)],
          }),
          ...restList(app, scorecard),
        ],
      ),
  })
}

const appCard = (app: App): Html => {
  const h = html<Message>()
  const newest = Array.last(app.builds)
  const facts =
    app.kind === 'Library'
      ? counted(app.versions.length, 'version')
      : `${counted(app.builds.length, 'build')}${Option.match(newest, { onNone: () => '', onSome: build => `, newest ${build.build}` })}`
  return h.li(
    [h.Key(app.id)],
    [
      h.a(
        [
          h.Href(appRouter({ appId: app.id, scope: Option.none() })),
          h.Class(
            'surface block h-full rounded-lg p-4 hover:border-[var(--ink-muted)]',
          ),
        ],
        [
          h.p([h.Class('text-xs ink-muted')], [app.platform]),
          h.p([h.Class('font-semibold')], [app.name]),
          h.p([h.Class('mt-1 text-sm ink-secondary')], [app.summary]),
          h.p([h.Class('mt-2 text-xs ink-muted')], [facts]),
        ],
      ),
    ],
  )
}

const appsView = (index: Index): Html => {
  const h = html<Message>()
  return Array.match(index.apps, {
    onEmpty: () => h.p([], ['The export holds no app.']),
    onNonEmpty: ([main, ...others]) =>
      h.div(
        [],
        [
          h.section(
            [h.Class('mb-10')],
            [
              h.div(
                [
                  h.Class(
                    'mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1',
                  ),
                ],
                [
                  h.h2(
                    [h.Class('text-lg font-semibold')],
                    [
                      `${main.name} on ${main.platform}, ${scopeLabel(main.defaultScope).toLowerCase()}`,
                    ],
                  ),
                  h.a(
                    [
                      h.Href(
                        appRouter({ appId: main.id, scope: Option.none() }),
                      ),
                      h.Class('link text-sm'),
                    ],
                    [`All of ${main.name}'s charts and builds`],
                  ),
                ],
              ),
              proofLine(index),
              numbersView(index, main),
              h.p(
                [h.Class('mt-3 text-sm ink-muted')],
                [
                  `${main.name}'s numbers written ${formatDate(index.generatedAt)}.`,
                ],
              ),
            ],
          ),
          h.section(
            [],
            [
              h.h2([h.Class('mb-3 text-lg font-semibold')], ['The other apps']),
              h.ul(
                [
                  h.Class(
                    'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3',
                  ),
                ],
                Array.map(others, appCard),
              ),
            ],
          ),
        ],
      ),
  })
}

/**
 * The build pipeline's summary first, then Scribe as a plain table and the
 * other apps as cards. Each part stands when the other's file did not load.
 */
export const homeView = (
  pipeline: typeof PipelineData.schema.Type,
  index: typeof IndexData.schema.Type,
): Html => {
  const h = html<Message>()
  return h.div(
    [],
    [
      h.h1([h.Class('sr-only')], ['Performance summary']),
      pipelineSummary(pipeline),
      h.div(
        [h.Class('mt-10 border-t border-[var(--hairline)] pt-8')],
        [indexContent(index, appsView)],
      ),
      h.p(
        [h.Class('mt-10 text-sm ink-secondary')],
        [
          h.a(
            [h.Href(UNDERSTANDING_MOVED_TO), h.Class('link')],
            ['Understanding, on your own page'],
          ),
        ],
      ),
    ],
  )
}
