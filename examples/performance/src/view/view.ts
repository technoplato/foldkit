import { Match as M, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'

import type { Index } from '../data'
import { ClickedReload, type Message } from '../message'
import type { Model } from '../model'
import { UNDERSTANDING_MOVED_TO } from '../moved'
import {
  homeRouter,
  issuesRouter,
  methodRouter,
  pipelineRouter,
} from '../route'
import { appView } from './app'
import { buildView } from './build'
import { findApp, findMetric, formatDate, shortSha } from './format'
import { homeView } from './home'
import { issuesView } from './issues'
import { methodView } from './method'
import { metricView } from './metric'
import { indexContent } from './parts'
import { pipelineView } from './pipeline'

// CONSTANT

const SITE = 'Performance'

// VIEW

const notFoundView = (what: string): Html => {
  const h = html<Message>()
  return h.div(
    [],
    [
      h.h1([h.Class('text-2xl font-semibold')], ['Not here']),
      h.p([h.Class('mt-2 ink-secondary')], [what]),
      h.a(
        [h.Href(homeRouter()), h.Class('link mt-4 inline-block')],
        ['Every app'],
      ),
    ],
  )
}

const understandingMovedView = (): Html => {
  const h = html<Message>()
  return h.div(
    [],
    [
      h.h1(
        [h.Class('text-2xl font-semibold')],
        ['The understanding page moved'],
      ),
      h.p(
        [h.Class('mt-2 ink-secondary')],
        [
          'It is on your own page now: ',
          h.a(
            [h.Href(UNDERSTANDING_MOVED_TO), h.Class('link')],
            ['me.pisspoursoftware.xyz/understanding'],
          ),
        ],
      ),
    ],
  )
}

const pageView = (model: Model): Html => {
  const fromIndex = (render: (index: Index) => Html): Html =>
    indexContent(model.index, render)
  return M.value(model.destination).pipe(
    M.tagsExhaustive({
      Home: () => homeView(model.pipeline, model.index),
      PipelinePage: () => pipelineView(model.pipeline),
      AppPage: ({ appId, scope }) =>
        fromIndex(index =>
          Option.match(findApp(index, appId), {
            onNone: () => notFoundView(`No app is named ${appId}.`),
            onSome: app => appView(index, app, scope, model.maybeHover),
          }),
        ),
      BuildPage: ({ appId, build }) =>
        fromIndex(index =>
          Option.match(findApp(index, appId), {
            onNone: () => notFoundView(`No app is named ${appId}.`),
            onSome: app => buildView(index, app, build, model.maybeOpenBuild),
          }),
        ),
      MetricPage: ({ appId, metricId, scope }) =>
        fromIndex(index =>
          Option.match(
            Option.all({
              app: findApp(index, appId),
              metric: findMetric(index, metricId),
            }),
            {
              onNone: () =>
                notFoundView(`No chart is named ${appId}/${metricId}.`),
              onSome: ({ app, metric }) =>
                metricView(index, app, metric, scope, model.maybeHover),
            },
          ),
        ),
      IssuesPage: () => fromIndex(issuesView),
      MethodPage: () => fromIndex(methodView),
      UnderstandingMoved: () => fromIndex(understandingMovedView),
      NotFound: ({ path }) =>
        fromIndex(() => notFoundView(`No page answers ${path}.`)),
    }),
  )
}

const showsItsOwnDates = (model: Model): boolean =>
  model.destination._tag === 'Home' || model.destination._tag === 'PipelinePage'

const freshness = (model: Model): Html => {
  const h = html<Message>()
  if (!AsyncData.hasData(model.index) && !AsyncData.hasData(model.pipeline)) {
    return h.span([], [])
  }
  const isReloading =
    AsyncData.isPending(model.index) || AsyncData.isPending(model.pipeline)
  const written = Option.filter(
    AsyncData.getData(model.index),
    () => !showsItsOwnDates(model),
  )
  return h.span(
    [h.Class('text-xs ink-muted')],
    [
      ...Option.match(written, {
        onNone: () => [],
        onSome: index => [
          `Data written ${formatDate(index.generatedAt)} from the ledger at ${shortSha(index.ledger.commit)}. `,
        ],
      }),
      h.button(
        [h.Class('link underline'), h.OnClick(ClickedReload())],
        [isReloading ? 'Reloading…' : 'Reload'],
      ),
    ],
  )
}

const titleOf = (model: Model): string =>
  M.value(model.destination).pipe(
    M.tagsExhaustive({
      Home: () => `${SITE} | PissPour Software`,
      PipelinePage: () => `Build pipeline | ${SITE}`,
      AppPage: ({ appId }) => `${appId} | ${SITE}`,
      BuildPage: ({ appId, build }) => `Build ${build} | ${appId} | ${SITE}`,
      MetricPage: ({ appId, metricId }) => `${metricId} | ${appId} | ${SITE}`,
      IssuesPage: () => `Issues | ${SITE}`,
      MethodPage: () => `How the numbers are made | ${SITE}`,
      UnderstandingMoved: () => `Understanding moved | ${SITE}`,
      NotFound: () => `Not here | ${SITE}`,
    }),
  )

export const view = (model: Model): Document => {
  const h = html<Message>()
  const navLink = (href: string, label: string): Html =>
    h.a([h.Href(href), h.Class('link')], [label])
  return {
    title: titleOf(model),
    body: h.div(
      [h.Class('min-h-screen')],
      [
        h.header(
          [h.Class('border-b border-[var(--hairline)]')],
          [
            h.div(
              [
                h.Class(
                  'mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6',
                ),
              ],
              [
                h.a([h.Href(homeRouter()), h.Class('font-semibold')], [SITE]),
                h.nav(
                  [
                    h.Class('flex flex-wrap gap-x-4 gap-y-1 text-sm'),
                    h.AriaLabel('Pages'),
                  ],
                  [
                    navLink(pipelineRouter(), 'Pipeline'),
                    navLink(homeRouter(), 'Apps'),
                    navLink(issuesRouter(), 'Issues'),
                    navLink(UNDERSTANDING_MOVED_TO, 'Understanding'),
                    navLink(methodRouter(), 'How it is measured'),
                  ],
                ),
                freshness(model),
              ],
            ),
          ],
        ),
        h.main(
          [h.Class('mx-auto max-w-7xl px-4 py-6 sm:px-6')],
          [pageView(model)],
        ),
      ],
    ),
  }
}
