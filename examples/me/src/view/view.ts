import { Match as M } from 'effect'
import { AsyncData } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'

import type { Me } from '../data'
import { ClickedReload, type Message } from '../message'
import type { Model } from '../model'
import { homeRouter, understandingRouter } from '../route'
import { homeView } from './home'
import { understandingView } from './understanding'

// CONSTANT

const SITE = 'Your page'

// VIEW

const notFoundView = (path: string): Html => {
  const h = html<Message>()
  return h.div(
    [],
    [
      h.h1([h.Class('text-2xl font-semibold')], ['Not here']),
      h.p([h.Class('mt-2 ink-secondary')], [`No page answers ${path}.`]),
      h.a([h.Href(homeRouter()), h.Class('link mt-4 inline-block')], [SITE]),
    ],
  )
}

const pageView = (model: Model, me: Me): Html =>
  M.value(model.destination).pipe(
    M.tagsExhaustive({
      Home: () => homeView(me, model.understanding),
      UnderstandingPage: () => understandingView(model.understanding),
      NotFound: ({ path }) => notFoundView(path),
    }),
  )

const contentView = (model: Model): Html => {
  const h = html<Message>()
  return AsyncData.match(model.me, {
    onIdle: () => h.p([h.Class('ink-muted')], ['Loading your page…']),
    onLoading: () => h.p([h.Class('ink-muted')], ['Loading your page…']),
    onRefreshing: me => h.div([h.Class('opacity-70')], [pageView(model, me)]),
    onFailure: error =>
      h.div(
        [h.Class('surface rounded-lg p-4')],
        [
          h.p(
            [h.Class('font-semibold text-critical')],
            ['Your page did not load.'],
          ),
          h.p([h.Class('mt-1 text-sm ink-secondary')], [error]),
          h.button(
            [h.Class('link mt-2 underline'), h.OnClick(ClickedReload())],
            ['Try again'],
          ),
        ],
      ),
    onStale: ({ data }) => pageView(model, data),
    onSuccess: me => pageView(model, me),
  })
}

const titleOf = (model: Model): string =>
  M.value(model.destination).pipe(
    M.tagsExhaustive({
      Home: () => `${SITE} | PissPour Software`,
      UnderstandingPage: () => `Understanding | ${SITE}`,
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
                  'mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6',
                ),
              ],
              [
                h.a([h.Href(homeRouter()), h.Class('font-semibold')], [SITE]),
                h.nav(
                  [h.Class('flex gap-4 text-sm'), h.AriaLabel('Pages')],
                  [navLink(understandingRouter(), 'Understanding')],
                ),
              ],
            ),
          ],
        ),
        h.main(
          [h.Class('mx-auto max-w-5xl px-4 py-6 sm:px-6')],
          [contentView(model)],
        ),
      ],
    ),
  }
}
