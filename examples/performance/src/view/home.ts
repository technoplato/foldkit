import { Array, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import type { App, EvidenceTag, Index } from '../data'
import type { Message } from '../message'
import type { Hover } from '../model'
import { appRouter, issuesRouter } from '../route'
import { chartGrid } from './app'
import { EVIDENCE_TAGS, counted, scopeLabel } from './format'
import { evidenceTagChip } from './parts'

// VIEW

const countOf = (index: Index, tag: EvidenceTag): number =>
  Array.filter(index.issues, issue => issue.evidence._tag === tag).length

/** The page's one big number: how many of the issues we say we fixed a device proves. */
const proofHero = (index: Index): Html => {
  const h = html<Message>()
  const total = index.issues.length
  return h.section(
    [h.Class('mb-10')],
    [
      h.p([h.Class('text-sm ink-muted')], ['What a device proves']),
      h.p(
        [h.Class('mt-1 text-5xl font-semibold')],
        [`${countOf(index, 'Proven')} of ${total}`],
      ),
      h.p(
        [h.Class('mt-1 max-w-2xl ink-secondary')],
        [
          'performance issues are proven on a device by a measurement in the ledger. The rest are claims until a measurement says so: ',
          h.a(
            [h.Href(issuesRouter()), h.Class('link')],
            ['every issue and its evidence'],
          ),
          '.',
        ],
      ),
      h.ul(
        [h.Class('mt-4 flex flex-wrap gap-x-6 gap-y-2')],
        Array.map(EVIDENCE_TAGS, tag =>
          h.li(
            [h.Key(tag), h.Class('flex items-baseline gap-2')],
            [
              h.span(
                [h.Class('text-2xl font-semibold tabular')],
                [String(countOf(index, tag))],
              ),
              evidenceTagChip(tag),
            ],
          ),
        ),
      ),
    ],
  )
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

/** Scribe first and largest, with its charts; then the other apps and the library. */
export const homeView = (
  index: Index,
  maybeHover: Option.Option<Hover>,
): Html => {
  const h = html<Message>()
  return Array.match(index.apps, {
    onEmpty: () => h.p([], ['The export holds no app.']),
    onNonEmpty: ([main, ...others]) =>
      h.div(
        [],
        [
          proofHero(index),
          h.section(
            [h.Class('mb-10')],
            [
              h.div(
                [
                  h.Class(
                    'mb-3 flex flex-wrap items-baseline justify-between gap-2',
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
                    [`All of ${main.name}'s builds and scopes`],
                  ),
                ],
              ),
              chartGrid(index, main, main.defaultScope, maybeHover),
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
