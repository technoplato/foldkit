import { Array, Option, Record, pipe } from 'effect'
import { AsyncData } from 'foldkit'
import { type Html, html } from 'foldkit/html'

import type { App, BuildDetail, Conditions, Index, Scope, Value } from '../data'
import type { Message } from '../message'
import type { OpenBuild } from '../model'
import { appRouter, metricRouter } from '../route'
import { describeValue, scopeParam } from './chart'
import {
  SCOPES,
  formatDate,
  formatNumber,
  scopeLabel,
  withoutMarkdown,
} from './format'
import {
  commitLink,
  evidenceChip,
  outsideLink,
  releaseLink,
  sectionHeading,
} from './parts'

// CONSTANT

const PERCENT = 100

// VIEW

const hasMeasured = (detail: BuildDetail, scope: Scope): boolean =>
  Array.some(
    Record.values(detail.scopes[scope]),
    value => value._tag === 'Measured',
  )

const valueCell = (
  index: Index,
  app: App,
  scope: Scope,
  metricId: string,
  maybeValue: Option.Option<Value>,
): Html => {
  const h = html<Message>()
  return Option.match(
    Option.flatMap(
      Array.findFirst(index.metrics, metric => metric.id === metricId),
      metric => Option.map(maybeValue, value => ({ metric, value })),
    ),
    {
      onNone: () => h.span([h.Class('ink-muted')], ['no number']),
      onSome: ({ metric, value }) =>
        h.a(
          [
            h.Href(
              metricRouter({
                appId: app.id,
                metricId,
                scope: scopeParam(app, scope),
              }),
            ),
            h.Class(
              value._tag === 'Measured'
                ? 'link tabular'
                : 'link ink-muted text-xs',
            ),
          ],
          [describeValue(metric, value)],
        ),
    },
  )
}

const numbersTable = (index: Index, app: App, detail: BuildDetail): Html => {
  const h = html<Message>()
  const scopes = Array.filter(SCOPES, scope => hasMeasured(detail, scope))
  return Array.match(scopes, {
    onEmpty: () =>
      h.p(
        [h.Class('surface rounded-lg p-4 ink-secondary')],
        [
          'Nothing was measured on this build on this device: no ledger minute after its first 10.',
        ],
      ),
    onNonEmpty: measuredScopes =>
      h.div(
        [h.Class('overflow-x-auto')],
        [
          h.table(
            [h.Class('w-full min-w-[40rem] text-left text-sm')],
            [
              h.thead(
                [],
                [
                  h.tr(
                    [h.Class('border-b border-[var(--hairline)] ink-muted')],
                    [
                      h.th(
                        [h.Class('py-2 pr-4 font-medium'), h.Scope('col')],
                        ['Metric'],
                      ),
                      ...Array.map(measuredScopes, scope =>
                        h.th(
                          [
                            h.Key(scope),
                            h.Class('py-2 pr-4 font-medium'),
                            h.Scope('col'),
                          ],
                          [scopeLabel(scope)],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              h.tbody(
                [],
                Array.map(index.metrics, metric =>
                  h.tr(
                    [
                      h.Key(metric.id),
                      h.Class('border-b border-[var(--hairline)] align-top'),
                    ],
                    [
                      h.th(
                        [h.Class('py-2 pr-4 font-medium'), h.Scope('row')],
                        [
                          metric.label,
                          h.span(
                            [h.Class('block text-xs ink-muted font-normal')],
                            [metric.unit],
                          ),
                        ],
                      ),
                      ...Array.map(measuredScopes, scope =>
                        h.td(
                          [h.Key(scope), h.Class('py-2 pr-4')],
                          [
                            valueCell(
                              index,
                              app,
                              scope,
                              metric.id,
                              Option.fromNullishOr(
                                detail.scopes[scope][metric.id],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
  })
}

const share = (maybeShare: Option.Option<number>): string =>
  Option.match(maybeShare, {
    onNone: () => 'not known',
    onSome: value => `${formatNumber(value * PERCENT, 0)}%`,
  })

const rate = (maybeRate: Option.Option<number>): string =>
  Option.match(maybeRate, {
    onNone: () => 'not known',
    onSome: value => formatNumber(value, 1),
  })

const conditionsList = (scope: Scope, conditions: Conditions): Html => {
  const h = html<Message>()
  const facts: ReadonlyArray<readonly [string, string]> = [
    ['In front', share(conditions.maybeFrontShare)],
    ['Charging', share(conditions.maybeChargingShare)],
    ['Words a minute', rate(conditions.maybeWordsPerMinute)],
    ['Final lines a minute', rate(conditions.maybeFinalsPerMinute)],
    ['Instant writes a minute', rate(conditions.maybeTransactionsPerMinute)],
  ]
  return h.div(
    [h.Key(scope), h.Class('surface rounded-lg p-3')],
    [
      h.p([h.Class('mb-2 text-sm font-semibold')], [scopeLabel(scope)]),
      h.dl(
        [h.Class('grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm')],
        Array.flatMap(facts, ([label, value]) => [
          h.dt([h.Class('ink-muted')], [label]),
          h.dd([h.Class('tabular')], [value]),
        ]),
      ),
    ],
  )
}

const ledgerRowView = (detail: BuildDetail): Html => {
  const h = html<Message>()
  return Option.match(detail.maybeLedgerRow, {
    onNone: () =>
      h.p(
        [h.Class('text-sm ink-secondary')],
        ["The ledger's table has no row for this build yet."],
      ),
    onSome: row =>
      h.div(
        [],
        [
          h.p(
            [h.Class('mb-2 text-sm ink-secondary max-w-3xl')],
            [
              "The ledger's own row, as written. Its CPU columns count every minute of the build's window, recording or not, so they can read a little apart from this page's, which count the minutes of one scope. ",
              outsideLink(row.url, `docs/PERFORMANCE.md line ${row.line}`),
            ],
          ),
          h.dl(
            [
              h.Class(
                'surface grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg p-3 text-sm sm:grid-cols-[14rem_1fr]',
              ),
            ],
            Array.flatMap(Record.toEntries(row.cells), ([header, cell]) => [
              h.dt([h.Class('ink-muted')], [header]),
              h.dd([], [withoutMarkdown(cell)]),
            ]),
          ),
        ],
      ),
  })
}

const detailView = (index: Index, app: App, detail: BuildDetail): Html => {
  const h = html<Message>()
  const conditions = Array.getSomes(
    Array.map(SCOPES, scope =>
      Option.map(detail.conditions[scope], each => conditionsList(scope, each)),
    ),
  )
  const notes = Array.getSomes([
    detail.maybePowerlogNote,
    detail.maybeHangsNote,
  ])
  const carried = Array.getSomes(
    Array.map(detail.carries, number =>
      Array.findFirst(index.issues, issue => issue.number === number),
    ),
  )
  return h.div(
    [],
    [
      h.dl(
        [
          h.Class(
            'mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm max-w-3xl',
          ),
        ],
        [
          h.dt([h.Class('ink-muted')], ['Cut']),
          h.dd(
            [],
            [
              Option.match(detail.maybeDate, {
                onNone: () => 'not known',
                onSome: formatDate,
              }),
            ],
          ),
          h.dt([h.Class('ink-muted')], ['Commit']),
          h.dd([], [commitLink(detail.maybeCommit)]),
          h.dt([h.Class('ink-muted')], ['Release']),
          h.dd([], [releaseLink(detail.maybeRelease)]),
          h.dt([h.Class('ink-muted')], ['instant-data-swift']),
          h.dd(
            [h.Class('tabular')],
            [Option.getOrElse(detail.maybeLibrary, () => 'not known')],
          ),
          h.dt([h.Class('ink-muted')], ['On this device']),
          h.dd(
            [],
            [
              Option.match(detail.maybeWindow, {
                onNone: () => 'no ledger minute',
                onSome: window => `${window.first} to ${window.last}`,
              }),
            ],
          ),
        ],
      ),
      ...Option.match(detail.maybeChanged, {
        onNone: () => [],
        onSome: changed => [
          sectionHeading('What changed', 'In the words of its cut commit.'),
          h.p([h.Class('mb-8 max-w-3xl')], [changed]),
        ],
      }),
      sectionHeading(
        'Every number',
        "Each is over this build's minutes on this device after its first 10, in one scope; open one for the metric's table across builds and how it is measured.",
      ),
      numbersTable(index, app, detail),
      ...Array.match(conditions, {
        onEmpty: () => [],
        onNonEmpty: lists => [
          h.div(
            [h.Class('mt-8')],
            [
              sectionHeading(
                'The conditions',
                'Read the numbers beside what was happening: more speech or charging moves them as much as code does.',
              ),
              h.div([h.Class('grid grid-cols-1 gap-3 sm:grid-cols-3')], lists),
            ],
          ),
        ],
      }),
      ...Array.match(notes, {
        onEmpty: () => [],
        onNonEmpty: each => [
          h.ul(
            [h.Class('mt-6 list-disc pl-5 text-sm ink-secondary')],
            Array.map(each, note => h.li([], [note])),
          ),
        ],
      }),
      ...Array.match(carried, {
        onEmpty: () => [],
        onNonEmpty: issues => [
          h.div(
            [h.Class('mt-8')],
            [
              sectionHeading(
                'Performance issues it carries',
                'Their fix commits are in this build.',
              ),
              h.ul(
                [h.Class('space-y-2')],
                Array.map(issues, issue =>
                  h.li(
                    [
                      h.Key(issue.number),
                      h.Class('flex flex-wrap items-baseline gap-x-3'),
                    ],
                    [
                      outsideLink(issue.url, `#${issue.number}`),
                      evidenceChip(issue.evidence),
                      h.span(
                        [h.Class('text-sm ink-secondary')],
                        [Option.getOrElse(issue.maybeTitle, () => '')],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      }),
      h.div(
        [h.Class('mt-8')],
        [sectionHeading("The ledger's row", ''), ledgerRowView(detail)],
      ),
    ],
  )
}

/** One build on one app's device. */
export const buildView = (
  index: Index,
  app: App,
  build: string,
  maybeOpenBuild: Option.Option<OpenBuild>,
): Html => {
  const h = html<Message>()
  const maybeDetail = pipe(
    maybeOpenBuild,
    Option.filter(open => open.appId === app.id && open.build === build),
  )
  return h.div(
    [],
    [
      h.p(
        [h.Class('text-sm')],
        [
          h.a(
            [
              h.Href(appRouter({ appId: app.id, scope: Option.none() })),
              h.Class('link'),
            ],
            [app.name],
          ),
        ],
      ),
      h.h1([h.Class('mb-4 text-3xl font-semibold')], [`Build ${build}`]),
      Option.match(maybeDetail, {
        onNone: () => h.p([h.Class('ink-muted')], ['Loading this build…']),
        onSome: open =>
          AsyncData.match(open.detail, {
            onIdle: () => h.p([h.Class('ink-muted')], ['Loading this build…']),
            onLoading: () =>
              h.p([h.Class('ink-muted')], ['Loading this build…']),
            onRefreshing: detail => detailView(index, app, detail),
            onFailure: error =>
              h.p(
                [h.Class('text-critical')],
                [`This build's file did not load: ${error}`],
              ),
            onStale: ({ data }) => detailView(index, app, data),
            onSuccess: detail => detailView(index, app, detail),
          }),
      }),
    ],
  )
}
