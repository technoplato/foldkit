import { Array, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import type { App, Build, Index, Scope, Version } from '../data'
import type { Message } from '../message'
import type { Hover } from '../model'
import { appRouter, buildRouter } from '../route'
import { SMALL_CHART, chartView, scopeParam } from './chart'
import {
  SCOPES,
  counted,
  formatDate,
  formatMinutes,
  measuredBuildCount,
  scopeLabel,
  shortSha,
  withoutMarkdown,
} from './format'
import {
  commitCell,
  evidenceChip,
  outsideLink,
  releaseLink,
  sectionHeading,
} from './parts'

// VIEW

/** The three scopes as links; the current one is marked for the eye and for a screen reader. */
export const scopeTabs = (
  app: App,
  scope: Scope,
  toPath: (scope: Option.Option<Scope>) => string,
): Html => {
  const h = html<Message>()
  return h.nav(
    [h.Class('flex flex-wrap gap-2'), h.AriaLabel('Which minutes')],
    Array.map(SCOPES, each => {
      const isCurrent = each === scope
      return h.a(
        [
          h.Key(each),
          h.Href(toPath(scopeParam(app, each))),
          h.Class(
            `rounded-full border px-3 py-1 text-sm ${isCurrent ? 'border-[var(--ink)] font-semibold' : 'border-[var(--border)] ink-secondary'}`,
          ),
          ...(isCurrent ? [h.AriaCurrent('page')] : []),
        ],
        [
          `${scopeLabel(each)} · ${counted(measuredBuildCount(app, each), 'build')}`,
        ],
      )
    }),
  )
}

/** Every metric as a small multiple, one grid, the same builds on every x axis. */
export const chartGrid = (
  index: Index,
  app: App,
  scope: Scope,
  maybeHover: Option.Option<Hover>,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3')],
    Array.map(index.metrics, metric =>
      h.div(
        [h.Key(metric.id)],
        [
          chartView({
            app,
            metric,
            scope,
            maybeHover,
            size: SMALL_CHART,
            isLarge: false,
          }),
        ],
      ),
    ),
  )
}

const issueLinks = (index: Index, numbers: ReadonlyArray<string>): Html => {
  const h = html<Message>()
  const performance = Array.filter(numbers, number =>
    Array.some(index.issues, issue => issue.number === number),
  )
  return h.span(
    [h.Class('flex flex-wrap gap-x-2')],
    Array.map(performance, number =>
      Option.match(
        Array.findFirst(index.issues, issue => issue.number === number),
        {
          onNone: () => h.span([], [`#${number}`]),
          onSome: issue =>
            h.span(
              [h.Class('inline-flex items-center gap-1')],
              [
                outsideLink(issue.url, `#${number}`),
                evidenceChip(issue.evidence),
              ],
            ),
        },
      ),
    ),
  )
}

const minutesCell = (build: Build): string =>
  Option.match(build.maybeWindow, {
    onNone: () => 'none',
    onSome: window =>
      `${formatMinutes(window.minutes)} (${formatMinutes(window.recordingMinutes)} recording)`,
  })

/** Every build of an app, newest first: when, what changed, its commit, release and pinned library. */
export const buildsTable = (index: Index, app: App): Html => {
  const h = html<Message>()
  const header = [
    'Build',
    'Cut',
    'What changed',
    'Commit',
    'Release',
    'Library',
    'Minutes on this device',
    'Performance issues it carries',
  ]
  return h.div(
    [h.Class('overflow-x-auto')],
    [
      h.table(
        [h.Class('w-full min-w-[56rem] text-left text-sm')],
        [
          h.thead(
            [],
            [
              h.tr(
                [h.Class('border-b border-[var(--hairline)] ink-muted')],
                Array.map(header, title =>
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
            Array.map(Array.reverse(app.builds), build =>
              h.tr(
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
                    [h.Class('py-2 pr-4 whitespace-nowrap ink-secondary')],
                    [
                      Option.match(build.maybeDate, {
                        onNone: () => '',
                        onSome: formatDate,
                      }),
                    ],
                  ),
                  h.td(
                    [h.Class('py-2 pr-4 max-w-md')],
                    [
                      Option.getOrElse(build.maybeChanged, () => ''),
                      ...Option.match(build.maybeLedgerNote, {
                        onNone: () => [],
                        onSome: note => [
                          h.p(
                            [h.Class('text-xs ink-muted')],
                            [withoutMarkdown(note)],
                          ),
                        ],
                      }),
                    ],
                  ),
                  h.td([h.Class('py-2 pr-4')], [commitCell(build.maybeCommit)]),
                  h.td(
                    [h.Class('py-2 pr-4')],
                    [releaseLink(build.maybeRelease)],
                  ),
                  h.td(
                    [h.Class('py-2 pr-4 whitespace-nowrap tabular')],
                    [Option.getOrElse(build.maybeLibrary, () => '')],
                  ),
                  h.td(
                    [
                      h.Class(
                        'py-2 pr-4 whitespace-nowrap ink-secondary tabular',
                      ),
                    ],
                    [minutesCell(build)],
                  ),
                  h.td([h.Class('py-2')], [issueLinks(index, build.carries)]),
                ],
              ),
            ),
          ),
        ],
      ),
    ],
  )
}

/** instant-data-swift's versions, newest first, each with its tag, commit and what the ledger measured. */
export const versionsTable = (app: App): Html => {
  const h = html<Message>()
  const row = (version: Version): Html =>
    h.tr(
      [
        h.Key(version.version),
        h.Class('border-b border-[var(--hairline)] align-top'),
      ],
      [
        h.td(
          [h.Class('py-2 pr-4 font-semibold tabular')],
          [outsideLink(version.tagUrl, version.version)],
        ),
        h.td(
          [h.Class('py-2 pr-4 whitespace-nowrap ink-secondary')],
          [
            Option.match(version.maybeDate, {
              onNone: () => '',
              onSome: formatDate,
            }),
          ],
        ),
        h.td(
          [h.Class('py-2 pr-4')],
          [
            Option.match(version.maybeUrl, {
              onNone: () => h.span([h.Class('ink-muted')], ['unknown']),
              onSome: url =>
                h.code(
                  [h.Class('text-xs')],
                  [
                    outsideLink(
                      url,
                      shortSha(Option.getOrElse(version.maybeSha, () => '')),
                    ),
                  ],
                ),
            }),
          ],
        ),
        h.td(
          [h.Class('py-2 pr-4')],
          [
            Option.match(version.maybeRelease, {
              onNone: () => h.span([h.Class('ink-muted')], ['tag only']),
              onSome: url => outsideLink(url, 'release'),
            }),
          ],
        ),
        h.td(
          [h.Class('py-2 pr-4 whitespace-nowrap')],
          [
            Option.match(version.maybeFirstScribeBuild, {
              onNone: () =>
                h.span([h.Class('ink-muted')], ['no build pins it']),
              onSome: build =>
                h.a(
                  [
                    h.Href(buildRouter({ appId: 'scribe', build })),
                    h.Class('link'),
                  ],
                  [`Scribe ${build}`],
                ),
            }),
          ],
        ),
        h.td(
          [h.Class('py-2 max-w-xl')],
          Array.match(version.fixes, {
            onEmpty: () => [
              h.span([h.Class('ink-muted')], ['nothing in the ledger']),
            ],
            onNonEmpty: fixes =>
              Array.map(fixes, fix =>
                h.p(
                  [h.Key(String(fix.line)), h.Class('mb-1')],
                  [
                    withoutMarkdown(fix.ledgerSoFar),
                    ' ',
                    outsideLink(fix.url, 'the ledger'),
                  ],
                ),
              ),
          }),
        ),
      ],
    )
  return h.div(
    [h.Class('overflow-x-auto')],
    [
      h.table(
        [h.Class('w-full min-w-[48rem] text-left text-sm')],
        [
          h.thead(
            [],
            [
              h.tr(
                [h.Class('border-b border-[var(--hairline)] ink-muted')],
                Array.map(
                  [
                    'Version',
                    'Tagged',
                    'Commit',
                    'Release',
                    'First Scribe build',
                    'What the ledger measured',
                  ],
                  title =>
                    h.th(
                      [h.Class('py-2 pr-4 font-medium'), h.Scope('col')],
                      [title],
                    ),
                ),
              ),
            ],
          ),
          h.tbody([], Array.map(app.versions, row)),
        ],
      ),
    ],
  )
}

/** One app: its charts in the chosen scope and its builds; the library shows its versions instead. */
export const appView = (
  index: Index,
  app: App,
  maybeScope: Option.Option<Scope>,
  maybeHover: Option.Option<Hover>,
): Html => {
  const h = html<Message>()
  const scope = Option.getOrElse(maybeScope, () => app.defaultScope)
  const header = h.header(
    [h.Class('mb-6')],
    [
      h.p([h.Class('text-sm ink-muted')], [app.platform]),
      h.h1([h.Class('text-3xl font-semibold')], [app.name]),
      h.p([h.Class('mt-1 max-w-3xl ink-secondary')], [app.summary]),
      h.p(
        [h.Class('mt-1 text-sm')],
        [outsideLink(app.repo.url, app.repo.name)],
      ),
    ],
  )
  if (app.kind === 'Library') {
    return h.div(
      [],
      [
        header,
        sectionHeading(
          'Versions',
          'Each version links to its tag and commit, the first Scribe build whose Package.resolved pins it, and what the performance ledger measured for it.',
        ),
        versionsTable(app),
      ],
    )
  }
  const hasNumbers = Array.some(
    SCOPES,
    each => measuredBuildCount(app, each) > 0,
  )
  return h.div(
    [],
    [
      header,
      ...(hasNumbers
        ? [
            h.section(
              [h.Class('mb-10')],
              [
                h.div(
                  [
                    h.Class(
                      'mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
                    ),
                  ],
                  [
                    h.h2(
                      [h.Class('text-lg font-semibold')],
                      [`Every metric, ${scopeLabel(scope).toLowerCase()}`],
                    ),
                    scopeTabs(app, scope, maybeScopeParam =>
                      appRouter({ appId: app.id, scope: maybeScopeParam }),
                    ),
                  ],
                ),
                h.p(
                  [h.Class('mb-4 max-w-3xl text-sm ink-secondary')],
                  [
                    'Each point is one build on this device, over its minutes after the first 10. A tick on the baseline is a build nobody measured; a hollow point stands on fewer than 5 minutes. Point at a build for its number, click it to open the build, open a chart for its table and how it is measured.',
                  ],
                ),
                chartGrid(index, app, scope, maybeHover),
              ],
            ),
          ]
        : [
            h.p(
              [h.Class('mb-8 max-w-3xl surface rounded-lg p-4')],
              [
                `${app.name} writes no energy ledger, so nothing on this page measures it. Its builds and their commits are below.`,
              ],
            ),
          ]),
      h.section(
        [],
        [
          sectionHeading(
            'Builds',
            "Newest first. The commit is the one the build was made from; a commit marked cut is the build's cut commit, because this Mac no longer knows the one it was made from or GitHub does not have it. The issues are the performance issues whose fix commits the build carries.",
          ),
          buildsTable(index, app),
        ],
      ),
    ],
  )
}
