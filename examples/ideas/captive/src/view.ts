import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedIdea,
  ClosedIdea,
  type Message,
  type Model,
  UpdatedQuery,
  visibleIdeas,
} from 'ideas-core-example'

/** Captive Html view. The host owns the document title and URL. */
export const view = (model: Model): Html => {
  const h = html<Message>()
  const ideas = visibleIdeas(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant catalog'
      : 'Seed catalog. Instant is unreachable or empty.'
  return h.div(
    [h.Class('rounded-xl border border-teal-200 bg-teal-50 p-6')],
    [
      h.p(
        [
          h.Class(
            'text-xs font-semibold uppercase tracking-wide text-teal-800',
          ),
        ],
        ['Knophy ideas widget'],
      ),
      h.p([h.Class('mt-1 text-sm text-teal-900')], [source]),
      h.input([
        h.Class(
          'mt-4 w-full rounded-lg border border-teal-300 bg-white px-3 py-2',
        ),
        h.Placeholder('Filter notes'),
        h.Value(model.query),
        h.OnInput(query => UpdatedQuery.make({ query })),
      ]),
      M.value(model.catalog).pipe(
        M.withReturnType<Html>(),
        M.tagsExhaustive({
          LoadingCatalog: () => h.p([h.Class('mt-4')], ['Observing…']),
          FailedCatalog: ({ reason }) =>
            h.p([h.Role('alert'), h.Class('mt-4 text-sm')], [reason]),
          LoadedCatalog: () =>
            h.ul(
              [h.Class('mt-4 grid gap-2')],
              Array.map(ideas, idea =>
                h.li(
                  [h.Key(idea.id)],
                  [
                    h.button(
                      [
                        h.OnClick(ClickedIdea.make({ id: idea.id })),
                        h.Class('w-full rounded-lg bg-white p-3 text-left'),
                      ],
                      [idea.title],
                    ),
                  ],
                ),
              ),
            ),
        }),
      ),
    ],
  )
}
