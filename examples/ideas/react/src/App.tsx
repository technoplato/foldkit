import { Array, Match as M, Option } from 'effect'
import { visibleIdeas } from 'ideas-core-example'
import { initialIdeasRoute } from 'ideas-react-bindings-example'

import { IdeasClient } from './client.js'

export const App = () => (
  <IdeasClient.Provider initialRoute={initialIdeasRoute}>
    <IdeasScreen />
  </IdeasClient.Provider>
)

const IdeasScreen = () => {
  const model = IdeasClient.useModel()
  const actions = IdeasClient.useActions()
  const ideas = visibleIdeas(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant catalog'
      : 'Seed catalog. Instant is unreachable or empty.'

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto grid max-w-5xl gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Knophy ideas
          </p>
          <h1 className="text-3xl font-semibold">Public notes</h1>
          <p className="text-sm text-stone-600">{source}</p>
          <input
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
            onChange={event => actions.updatedQuery(event.currentTarget.value)}
            placeholder="Filter notes"
            value={model.query}
          />
          {M.value(model.catalog).pipe(
            M.tagsExhaustive({
              LoadingCatalog: () => <p>Observing Knophy ideas…</p>,
              FailedCatalog: ({ reason }) => (
                <p role="alert">
                  Instant is unreachable ({reason}). Showing seed notes.
                </p>
              ),
              LoadedCatalog: () => null,
            }),
          )}
          <div className="grid gap-3">
            {Array.map(ideas, idea => (
              <button
                className="rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-amber-400"
                key={idea.id}
                onClick={() => actions.clickedIdea(idea.id)}
                type="button"
              >
                <span className="font-mono text-xs text-amber-800">
                  {String(idea.index).padStart(2, '0')}
                </span>
                <strong className="mt-2 block text-lg">{idea.title}</strong>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {idea.body}
                </p>
              </button>
            ))}
          </div>
        </div>
        <aside>
          {Option.match(model.selectedId, {
            onNone: () => (
              <p className="text-sm text-stone-500">
                Select a note to read it.
              </p>
            ),
            onSome: id => {
              const maybeIdea = Array.findFirst(ideas, idea => idea.id === id)
              if (Option.isNone(maybeIdea)) {
                return (
                  <p className="text-sm text-stone-500">
                    Select a note to read it.
                  </p>
                )
              }
              const idea = maybeIdea.value
              return (
                <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <p className="font-mono text-xs text-amber-800">
                    {String(idea.index).padStart(2, '0')} · {idea.slug}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">{idea.title}</h2>
                  <p className="mt-4 text-base leading-7 text-stone-700">
                    {idea.body}
                  </p>
                  <button
                    className="mt-6 rounded-full border border-stone-300 px-4 py-2 text-sm"
                    onClick={actions.closedIdea}
                    type="button"
                  >
                    Close
                  </button>
                </article>
              )
            },
          })}
        </aside>
      </section>
    </main>
  )
}
