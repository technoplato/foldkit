import { Array, Match as M, Option } from "effect"
import { Document, html, type Html } from "foldkit/html"
import {
  ClickedIdea,
  ClosedIdea,
  type Idea,
  type Message,
  type Model,
  UpdatedQuery,
  ideasFromCatalog,
  visibleIdeas,
} from "ideas-core-example"

import { Button } from "@foldkit/ui"

const sourceLabel = (model: Model): string =>
  model.source === "Instant"
    ? "Live Instant catalog"
    : "Seed catalog. Instant is unreachable or empty."

const ideaCard = (idea: Idea, isSelected: boolean): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Key(idea.id),
      h.OnClick(ClickedIdea.make({ id: idea.id })),
      h.Class(
        isSelected
          ? "w-full rounded-2xl border border-amber-400 bg-amber-50 p-5 text-left shadow-sm"
          : "w-full rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-amber-400",
      ),
    ],
    [
      h.span(
        [h.Class("font-mono text-xs text-amber-800")],
        [String(idea.index).padStart(2, "0")],
      ),
      h.strong([h.Class("mt-2 block text-lg text-stone-900")], [idea.title]),
      h.p([h.Class("mt-2 text-sm leading-6 text-stone-600")], [idea.body]),
    ],
  )
}

const selectedPanel = (model: Model): Html => {
  const h = html<Message>()
  const ideas = ideasFromCatalog(model.catalog)
  const maybeIdea = Option.flatMap(model.selectedId, id =>
    Array.findFirst(ideas, idea => idea.id === id),
  )
  if (Option.isNone(maybeIdea)) {
    return h.p(
      [h.Class("text-sm text-stone-500")],
      ["Select a note to read it."],
    )
  }
  const idea = maybeIdea.value
  return h.article(
    [h.Class("rounded-2xl border border-stone-200 bg-white p-6 shadow-sm")],
    [
      h.p(
        [h.Class("font-mono text-xs text-amber-800")],
        [`${String(idea.index).padStart(2, "0")} · ${idea.slug}`],
      ),
      h.h2([h.Class("mt-2 text-2xl font-semibold text-stone-900")], [idea.title]),
      h.p([h.Class("mt-4 text-base leading-7 text-stone-700")], [idea.body]),
      Button.view<Message>({
        onClick: ClosedIdea.make({}),
        toView: attributes =>
          h.button(
            [
              ...attributes.button,
              h.Class(
                "mt-6 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-500",
              ),
            ],
            ["Close"],
          ),
      }),
    ],
  )
}

const catalogBody = (model: Model): Html => {
  const h = html<Message>()
  return M.value(model.catalog).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingCatalog: () => h.p([], ["Observing Knophy ideas…"]),
      FailedCatalog: ({ reason }) =>
        h.div(
          [h.Class("grid gap-3")],
          [
            h.p(
              [h.Role("alert"), h.Class("text-sm text-amber-800")],
              [`Instant is unreachable (${reason}). Showing seed notes.`],
            ),
            ...Array.map(visibleIdeas(model), idea =>
              ideaCard(
                idea,
                Option.isSome(model.selectedId) &&
                  model.selectedId.value === idea.id,
              ),
            ),
          ],
        ),
      LoadedCatalog: () =>
        h.div(
          [h.Class("grid gap-3")],
          Array.map(visibleIdeas(model), idea =>
            ideaCard(
              idea,
              Option.isSome(model.selectedId) &&
                model.selectedId.value === idea.id,
            ),
          ),
        ),
    }),
  )
}

/** Renders the Ideas catalog as Html for captive and page hosts. */
export const body = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class("min-h-screen bg-stone-50 text-stone-900")],
    [
      h.main(
        [h.Class("mx-auto grid max-w-5xl gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr]")],
        [
          h.section(
            [h.Class("grid gap-4")],
            [
              h.p(
                [h.Class("text-xs font-semibold uppercase tracking-wide text-amber-800")],
                ["Knophy ideas"],
              ),
              h.h1(
                [h.Class("text-3xl font-semibold")],
                ["Public notes"],
              ),
              h.p(
                [h.Class("text-sm text-stone-600")],
                [sourceLabel(model)],
              ),
              h.input([
                h.Class(
                  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-amber-500",
                ),
                h.Placeholder("Filter notes"),
                h.Value(model.query),
                h.OnInput(query => UpdatedQuery.make({ query })),
              ]),
              catalogBody(model),
            ],
          ),
          selectedPanel(model),
        ],
      ),
    ],
  )
}

// VIEW

/** Renders the Ideas catalog with Foldkit HTML and owns the page title. */
export const view = (model: Model): Document => ({
  title: "Knophy ideas",
  body: body(model),
})
