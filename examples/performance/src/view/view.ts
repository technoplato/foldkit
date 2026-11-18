import { Match as M, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'

import type { Index } from '../data'
import { ClickedReload, type Message } from '../message'
import type { Model } from '../model'
import { UNDERSTANDING_MOVED_TO } from '../moved'
import { homeRouter, issuesRouter, methodRouter } from '../route'
import { appView } from './app'
import { buildView } from './build'
import { findApp, findMetric, formatDate, shortSha } from './format'
import { homeView } from './home'
import { issuesView } from './issues'
import { methodView } from './method'
import { metricView } from './metric'

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

const pageView = (model: Model, index: Index): Html =>
  M.value(model.destination).pipe(
    M.tagsExhaustive({
      Home: () => homeView(index, model.maybeHover),
      AppPage: ({ appId, scope }) =>
        Option.match(findApp(index, appId), {
          onNone: () => notFoundView(`No app is named ${appId}.`),
          onSome: app => appView(index, app, scope, model.maybeHover),
        }),
      BuildPage: ({ appId, build }) =>
        Option.match(findApp(index, appId), {
          onNone: () => notFoundView(`No app is named ${appId}.`),
          onSome: app => buildView(index, app, build, model.maybeOpenBuild),
        }),
      MetricPage: ({ appId, metricId, scope }) =>
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
      IssuesPage: () => issuesView(index),
      MethodPage: () => methodView(index),
      UnderstandingMoved: understandingMovedView,
      NotFound: ({ path }) => notFoundView(`No page answers ${path}.`),
    }),
  )

const freshness = (model: Model): Html => {
  const h = html<Message>()
  return AsyncData.matchData(model.index, {
    onEmpty: () => h.span([], []),
    onFailure: () => h.span([], []),
    onData: index =>
      h.span(
        [h.Class('text-xs ink-muted')],
        [
          `Data written ${formatDate(index.generatedAt)} from the ledger at ${shortSha(index.ledger.commit)}. `,
          h.button(
            [h.Class('link underline'), h.OnClick(ClickedReload())],
            [AsyncData.isRefreshing(model.index) ? 'Reloading…' : 'Reload'],
          ),
        ],
      ),
  })
}

const contentView = (model: Model): Html => {
  const h = html<Message>()
  return AsyncData.match(model.index, {
    onIdle: () => h.p([h.Class('ink-muted')], ['Loading the numbers…']),
    onLoading: () => h.p([h.Class('ink-muted')], ['Loading the numbers…']),
    onRefreshing: index =>
      h.div([h.Class('opacity-70')], [pageView(model, index)]),
    onFailure: error =>
      h.div(
        [h.Class('surface rounded-lg p-4')],
        [
          h.p(
            [h.Class('font-semibold text-critical')],
            ['The numbers did not load.'],
          ),
          h.p([h.Class('mt-1 text-sm ink-secondary')], [error]),
          h.button(
            [h.Class('link mt-2 underline'), h.OnClick(ClickedReload())],
            ['Try again'],
          ),
        ],
      ),
    onStale: ({ data }) => pageView(model, data),
    onSuccess: index => pageView(model, index),
  })
}

const titleOf = (model: Model): string =>
  M.value(model.destination).pipe(
    M.tagsExhaustive({
      Home: () => `${SITE} | PissPour Software`,
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
                  [h.Class('flex gap-4 text-sm'), h.AriaLabel('Pages')],
                  [
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
          [contentView(model)],
        ),
      ],
    ),
  }
}
