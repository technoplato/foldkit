import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  String,
  pipe,
} from 'effect'
import { Command, Runtime } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { ts } from 'foldkit/schema'
import { evo } from 'foldkit/struct'

// SCHEMA

export const SiteKind = S.Literals([
  'FoldkitDemo',
  'Static',
  'Laptop',
  'Tunnel',
  'Service',
])

export const SiteEntry = S.Struct({
  name: S.String,
  primaryHost: S.String,
  url: S.String,
  aliases: S.Array(S.String),
  ports: S.Array(S.Number),
  description: S.OptionFromNullOr(S.String),
  githubUrl: S.OptionFromNullOr(S.String),
  kind: SiteKind,
})
export type SiteEntry = typeof SiteEntry.Type

export const SiteTotals = S.Struct({
  apps: S.Number,
  demos: S.Number,
  totalHosts: S.Number,
})

export const SitesResponse = S.Struct({
  generatedAt: S.String,
  totals: SiteTotals,
  apps: S.Array(SiteEntry),
  demos: S.Array(SiteEntry),
})
export type SitesResponse = typeof SitesResponse.Type

export const LoadingSites = ts('LoadingSites')
export const LoadedSites = ts('LoadedSites', { data: SitesResponse })
export const FailedSites = ts('FailedSites', { error: S.String })

export const SitesState = S.Union([LoadingSites, LoadedSites, FailedSites])
export type SitesState = typeof SitesState.Type

// MODEL

export const Model = S.Struct({
  sitesState: SitesState,
  query: S.String,
  expandedHosts: S.Array(S.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const SucceededFetchSites = m('SucceededFetchSites', {
  data: SitesResponse,
})
export const FailedFetchSites = m('FailedFetchSites', {
  error: S.String,
})
export const UpdatedQuery = m('UpdatedQuery', {
  value: S.String,
})
export const ToggledAliases = m('ToggledAliases', {
  host: S.String,
})
export const ClickedRefresh = m('ClickedRefresh')

export const Message = S.Union([
  SucceededFetchSites,
  FailedFetchSites,
  UpdatedQuery,
  ToggledAliases,
  ClickedRefresh,
])
export type Message = typeof Message.Type

// COMMAND

const SITES_JSON_PATH = '/api/sites.json'

export const FetchSites = Command.define(
  'FetchSites',
  SucceededFetchSites,
  FailedFetchSites,
)(
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(SITES_JSON_PATH, { cache: 'no-store' }),
      catch: error =>
        error instanceof Error ? error.message : globalThis.String(error),
    })

    if (!response.ok) {
      return FailedFetchSites({
        error: `HTTP ${response.status} loading ${SITES_JSON_PATH}`,
      })
    }

    const raw = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: error =>
        error instanceof Error ? error.message : globalThis.String(error),
    })

    const data = yield* S.decodeUnknownEffect(SitesResponse)(raw).pipe(
      Effect.mapError(error => globalThis.String(error)),
    )

    return SucceededFetchSites({ data })
  }).pipe(Effect.catch(error => Effect.succeed(FailedFetchSites({ error })))),
)

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => [
  {
    sitesState: LoadingSites(),
    query: '',
    expandedHosts: [],
  },
  [FetchSites()],
]

// UPDATE

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      SucceededFetchSites: ({ data }) => [
        evo(model, {
          sitesState: () => LoadedSites({ data }),
        }),
        [],
      ],

      FailedFetchSites: ({ error }) => [
        evo(model, {
          sitesState: () => FailedSites({ error }),
        }),
        [],
      ],

      UpdatedQuery: ({ value }) => [
        evo(model, {
          query: () => value,
        }),
        [],
      ],

      ToggledAliases: ({ host }) => [
        evo(model, {
          expandedHosts: Array.contains(model.expandedHosts, host)
            ? Array.filter(expandedHost => expandedHost !== host)
            : Array.append(host),
        }),
        [],
      ],

      ClickedRefresh: () => [
        evo(model, {
          sitesState: () => LoadingSites(),
        }),
        [FetchSites()],
      ],
    }),
  )

// VIEW

const stripDomain = (host: string): string =>
  host.replace(/\.pisspoursoftware\.xyz$/, '')

const matchesQuery = (site: SiteEntry, normalizedQuery: string): boolean => {
  if (normalizedQuery === '') {
    return true
  }

  const haystack = [
    stripDomain(site.primaryHost),
    site.name,
    site.primaryHost,
    Option.getOrElse(site.description, () => ''),
    ...site.aliases,
    ...Array.map(site.ports, port => globalThis.String(port)),
  ]
    .join(' ')
    .toLowerCase()

  return String.includes(normalizedQuery)(haystack)
}

const formatMeta = (site: SiteEntry): string => {
  const parts: Array<string> = []
  const label = stripDomain(site.primaryHost)

  if (site.kind === 'FoldkitDemo' && site.name !== label) {
    parts.push(site.name)
  }

  if (Array.isReadonlyArrayNonEmpty(site.ports)) {
    parts.push(`:${site.ports.join(', :')}`)
  } else if (site.kind === 'Static') {
    parts.push('static')
  }

  if (site.kind === 'Laptop') {
    parts.push('laptop')
  } else if (site.kind === 'Tunnel') {
    parts.push('tunnel')
  }

  return parts.join(' · ')
}

const aliasToggleLabel = (
  isAliasesOpen: boolean,
  aliasCount: number,
): string => {
  if (isAliasesOpen) {
    return 'Hide aliases'
  } else if (aliasCount === 1) {
    return '+1 alias'
  } else {
    return `+${aliasCount} aliases`
  }
}

const siteCardView = (
  site: SiteEntry,
  normalizedQuery: string,
  expandedHosts: ReadonlyArray<string>,
): Html => {
  const h = html<Message>()
  const label = stripDomain(site.primaryHost)
  const meta = formatMeta(site)

  const hasAliases = Array.isReadonlyArrayNonEmpty(site.aliases)
  const matchesAliasDirectly =
    normalizedQuery !== '' &&
    !String.includes(normalizedQuery)(label.toLowerCase()) &&
    Array.some(site.aliases, alias =>
      String.includes(normalizedQuery)(alias.toLowerCase()),
    )
  const isAliasesOpen =
    Array.contains(expandedHosts, site.primaryHost) || matchesAliasDirectly

  return h.keyed('li')(
    site.primaryHost,
    [
      h.Class(
        'flex flex-col justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700',
      ),
    ],
    [
      h.div(
        [h.Class('flex flex-col gap-1.5')],
        [
          h.div(
            [h.Class('flex items-baseline justify-between gap-2')],
            [
              h.a(
                [
                  h.Href(site.url),
                  h.Class(
                    'font-semibold text-blue-600 hover:underline dark:text-sky-400 break-all',
                  ),
                ],
                [label],
              ),
              h.div(
                [h.Class('flex shrink-0 items-center gap-2')],
                [
                  ...Option.match(site.githubUrl, {
                    onNone: () => [],
                    onSome: githubUrl => [
                      h.a(
                        [
                          h.Href(githubUrl),
                          h.Target('_blank'),
                          h.Rel('noopener noreferrer'),
                          h.Title('View source on GitHub'),
                          h.Class(
                            'rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100',
                          ),
                        ],
                        ['GitHub'],
                      ),
                    ],
                  }),
                ],
              ),
            ],
          ),
          ...Option.match(site.description, {
            onNone: () => [],
            onSome: description => [
              h.p(
                [
                  h.Class(
                    'text-xs leading-relaxed text-zinc-600 dark:text-zinc-400',
                  ),
                ],
                [description],
              ),
            ],
          }),
        ],
      ),
      h.div(
        [h.Class('flex flex-col gap-1.5 pt-1')],
        [
          h.div(
            [
              h.Class(
                'flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-500',
              ),
            ],
            [
              h.span([h.Class('tabular-nums truncate')], [meta]),
              ...(hasAliases
                ? [
                    h.button(
                      [
                        h.Type('button'),
                        h.OnClick(ToggledAliases({ host: site.primaryHost })),
                        h.Class(
                          'shrink-0 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
                        ),
                      ],
                      [aliasToggleLabel(isAliasesOpen, site.aliases.length)],
                    ),
                  ]
                : []),
            ],
          ),
          ...(hasAliases && isAliasesOpen
            ? [
                h.div(
                  [
                    h.Class(
                      'flex flex-wrap gap-x-2.5 gap-y-1 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-800',
                    ),
                  ],
                  Array.map(site.aliases, alias =>
                    h.keyed('a')(
                      alias,
                      [
                        h.Href(`https://${alias}`),
                        h.Class(
                          'text-zinc-600 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-sky-400',
                        ),
                      ],
                      [stripDomain(alias)],
                    ),
                  ),
                ),
              ]
            : []),
        ],
      ),
    ],
  )
}

const sectionView = (
  title: string,
  sites: ReadonlyArray<SiteEntry>,
  normalizedQuery: string,
  expandedHosts: ReadonlyArray<string>,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const visible = Array.filter(sites, site =>
    matchesQuery(site, normalizedQuery),
  )

  return Array.match(visible, {
    onEmpty: () => [],
    onNonEmpty: nonEmptyVisible => [
      h.section(
        [h.Class('mb-10')],
        [
          h.h2(
            [
              h.Class(
                'mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400',
              ),
            ],
            [`${title} (${nonEmptyVisible.length})`],
          ),
          h.ul(
            [h.Class('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3')],
            Array.map(nonEmptyVisible, site =>
              siteCardView(site, normalizedQuery, expandedHosts),
            ),
          ),
        ],
      ),
    ],
  })
}

export const view = (model: Model): Document => {
  const h = html<Message>()
  const normalizedQuery = pipe(model.query, String.trim, String.toLowerCase)

  return {
    title: 'Piss Pour Software',
    body: h.div(
      [
        h.Class(
          'min-h-screen bg-white px-4 py-10 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100',
        ),
      ],
      [
        h.main(
          [h.Class('mx-auto max-w-5xl')],
          [
            h.header(
              [
                h.Class(
                  'mb-6 flex flex-wrap items-baseline justify-between gap-3',
                ),
              ],
              [
                h.div(
                  [h.Class('flex items-baseline gap-3')],
                  [
                    h.h1(
                      [h.Class('text-2xl font-bold tracking-tight')],
                      ['Piss Pour Software'],
                    ),
                    h.span(
                      [
                        h.Class(
                          'rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
                        ),
                      ],
                      ['Foldkit'],
                    ),
                  ],
                ),
                h.div(
                  [
                    h.Class(
                      'flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400',
                    ),
                  ],
                  [
                    ...M.value(model.sitesState).pipe(
                      M.withReturnType<ReadonlyArray<Html>>(),
                      M.tagsExhaustive({
                        LoadingSites: () => [h.span([], ['Loading…'])],
                        FailedSites: () => [],
                        LoadedSites: ({ data }) => [
                          h.span(
                            [],
                            [
                              `${data.totals.apps} apps · ${data.totals.demos} Foldkit demos (${data.totals.totalHosts} hosts)`,
                            ],
                          ),
                        ],
                      }),
                    ),
                    h.button(
                      [
                        h.Type('button'),
                        h.OnClick(ClickedRefresh()),
                        h.Class(
                          'cursor-pointer rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900',
                        ),
                      ],
                      ['Refresh'],
                    ),
                  ],
                ),
              ],
            ),
            h.input([
              h.Type('search'),
              h.Value(model.query),
              h.Placeholder('Filter sites, descriptions, aliases, or ports…'),
              h.Autocomplete('off'),
              h.Autofocus(true),
              h.OnInput(value => UpdatedQuery({ value })),
              h.Class(
                'mb-8 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-sky-400',
              ),
            ]),
            ...M.value(model.sitesState).pipe(
              M.withReturnType<ReadonlyArray<Html>>(),
              M.tagsExhaustive({
                LoadingSites: () => [
                  h.p(
                    [h.Class('text-sm text-zinc-500 dark:text-zinc-400')],
                    ['Loading live site index…'],
                  ),
                ],
                FailedSites: ({ error }) => [
                  h.div(
                    [
                      h.Class(
                        'rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
                      ),
                    ],
                    [`Failed to load site index: ${error}`],
                  ),
                ],
                LoadedSites: ({ data }) => [
                  ...sectionView(
                    'Apps & Services',
                    data.apps,
                    normalizedQuery,
                    model.expandedHosts,
                  ),
                  ...sectionView(
                    'Foldkit Demos',
                    data.demos,
                    normalizedQuery,
                    model.expandedHosts,
                  ),
                ],
              }),
            ),
            h.footer(
              [
                h.Class(
                  'mt-12 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500',
                ),
              ],
              [
                'Derived live from Caddyfile, tunnel configs, LaunchAgents, and Foldkit demos manifest · ',
                h.a([h.Href(SITES_JSON_PATH), h.Class('underline')], ['JSON']),
              ],
            ),
          ],
        ),
      ],
    ),
  }
}
