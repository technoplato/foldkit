import { Array, Option } from "effect"
import { Document, html } from "foldkit/html"
import {
  ClickedIdea,
  type Message,
  type Model,
  ideasFromCatalog,
} from "ideas-core-example"

import { Button } from "@foldkit/ui"

const currentIdea = (model: Model) => {
  const ideas = ideasFromCatalog(model.catalog)
  const selected = Option.flatMap(model.selectedId, id =>
    Array.findFirst(ideas, idea => idea.id === id),
  )
  if (Option.isSome(selected)) {
    return selected
  }
  return Array.head(ideas)
}

// VIEW

/** Renders Ideas as a sequential notebook of public notes. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const ideas = ideasFromCatalog(model.catalog)
  const maybeIdea = currentIdea(model)
  const source =
    model.source === "Instant"
      ? "Live Instant catalog"
      : "Seed catalog. Instant is unreachable or empty."

  const page = Option.match(maybeIdea, {
    onNone: () => h.p([], ["Observing Knophy ideas…"]),
    onSome: idea => {
      const index = idea.index
      const previous = Array.findFirst(ideas, candidate => candidate.index === index - 1)
      const next = Array.findFirst(ideas, candidate => candidate.index === index + 1)
      const noteLabel = "Note " + String(index) + " of " + String(ideas.length)
      return h.article(
        [h.Class("mx-auto max-w-2xl space-y-6")],
        [
          h.p([h.Class("font-mono text-xs text-amber-800")], [noteLabel]),
          h.h1([h.Class("font-serif text-4xl text-stone-900")], [idea.title]),
          h.p([h.Class("font-serif text-lg leading-8 text-stone-700")], [idea.body]),
          h.div(
            [h.Class("flex gap-3")],
            [
              Option.match(previous, {
                onNone: () => h.span([], []),
                onSome: prev =>
                  Button.view<Message>({
                    onClick: ClickedIdea.make({ id: prev.id }),
                    toView: attributes =>
                      h.button(
                        [...attributes.button, h.Class("rounded-full border px-4 py-2 text-sm")],
                        ["Previous"],
                      ),
                  }),
              }),
              Option.match(next, {
                onNone: () => h.span([], []),
                onSome: nxt =>
                  Button.view<Message>({
                    onClick: ClickedIdea.make({ id: nxt.id }),
                    toView: attributes =>
                      h.button(
                        [...attributes.button, h.Class("rounded-full bg-stone-900 px-4 py-2 text-sm text-white")],
                        ["Next"],
                      ),
                  }),
              }),
            ],
          ),
        ],
      )
    },
  })

  return {
    title: "Knophy ideas | Book",
    body: h.div(
      [h.Class("min-h-screen bg-amber-50 p-10")],
      [
        h.p([h.Class("mb-8 text-center text-xs uppercase tracking-wide text-amber-800")], ["Knophy ideas"]),
        h.p([h.Class("mb-10 text-center text-sm text-stone-600")], [source]),
        page,
      ],
    ),
  }
}
