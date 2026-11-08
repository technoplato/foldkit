import { Match as M, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Html, html } from 'foldkit/html'

import type { Me, Understanding } from '../data'
import type { Message } from '../message'
import type { Model } from '../model'
import { understandingRouter } from '../route'

// VIEW

const understandingLine = (
  maybeUnderstanding: Option.Option<Understanding>,
): Html => {
  const h = html<Message>()
  return Option.match(maybeUnderstanding, {
    onNone: () =>
      h.p([h.Class('ink-secondary')], ['No understanding profile yet.']),
    onSome: understanding =>
      M.value(understanding.count).pipe(
        M.tagsExhaustive({
          Measured: ({ proficient, areas }) =>
            h.p(
              [],
              [
                'Understanding: ',
                h.a(
                  [h.Href(understandingRouter()), h.Class('link')],
                  [`${proficient} of ${areas} areas at proficient`],
                ),
              ],
            ),
          NotMeasured: ({ reason }) =>
            h.p(
              [],
              [
                h.a(
                  [h.Href(understandingRouter()), h.Class('link')],
                  ['Understanding'],
                ),
                `: not measured: ${reason}`,
              ],
            ),
        }),
      ),
  })
}

const understandingSection = (understanding: Model['understanding']): Html => {
  const h = html<Message>()
  return AsyncData.match(understanding, {
    onIdle: () => h.p([h.Class('ink-muted')], ['Loading the profile…']),
    onLoading: () => h.p([h.Class('ink-muted')], ['Loading the profile…']),
    onRefreshing: data =>
      h.div([h.Class('opacity-70')], [understandingLine(data)]),
    onFailure: error =>
      h.p(
        [h.Class('text-critical')],
        [`The understanding profile did not load: ${error}`],
      ),
    onStale: ({ data }) => understandingLine(data),
    onSuccess: understandingLine,
  })
}

/** Who is signed in, and what is kept for them: their understanding profile, or plainly that there is none yet. */
export const homeView = (
  me: Me,
  understanding: Model['understanding'],
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('max-w-3xl')],
    [
      h.h1([h.Class('mb-2 text-3xl font-semibold')], ['Your page']),
      h.p([h.Class('text-lg')], [`Signed in as ${me.email}`]),
      h.p(
        [h.Class('mt-1 mb-8 text-sm ink-muted')],
        [
          'Cloudflare Access checked your login, and this page checked it again. It shows only what is kept for you.',
        ],
      ),
      h.section(
        [h.AriaLabel('What is kept for you')],
        [understandingSection(understanding)],
      ),
    ],
  )
}
