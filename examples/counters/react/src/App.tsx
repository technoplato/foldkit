import {
  type CountersWindowActions,
  type CountersWindowModel,
} from 'counters-instant-example'
import { Array, Match as M } from 'effect'
import { type ReactNode, useState } from 'react'

import { useActions, useModel } from './instantHost.js'

const listUri = '/counters'

const counterUri = (counterId: string): string => `/counters/${counterId}`

/** The two React presentation adapters included in this comparison. */
export type Presenter = 'ReactA' | 'ReactB'

/** Draws Multiple Counters. The window only calls useModel and useActions. */
export const App = ({
  initialDestinationUri = listUri,
}: Readonly<{
  initialDestinationUri?: string
  presenter?: Presenter
}> = {}) => {
  const [uri, setUri] = useState(initialDestinationUri)
  const view = useModel(uri)
  const actions = useActions(uri)
  return <WindowView actions={actions} onOpen={setUri} view={view} />
}

const WindowView = ({
  actions,
  onOpen,
  view,
}: Readonly<{
  actions: CountersWindowActions
  onOpen: (uri: string) => void
  view: CountersWindowModel
}>) =>
  M.value(view).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      StartingWindow: () => (
        <Status>Starting Instant Multiple Counters…</Status>
      ),
      FailedWindow: ({ error }) => (
        <Status>
          <p>{error}</p>
          <button
            className="primary-button"
            onClick={actions.signIn}
            type="button"
          >
            Sign in
          </button>
        </Status>
      ),
      ReadyWindow: ready => (
        <ReadyView actions={actions} onOpen={onOpen} view={ready} />
      ),
    }),
  )

const ReadyView = ({
  actions,
  onOpen,
  view,
}: Readonly<{
  actions: CountersWindowActions
  onOpen: (uri: string) => void
  view: Extract<CountersWindowModel, { readonly _tag: 'ReadyWindow' }>
}>) => {
  if (view.selectedId !== undefined && view.count !== undefined) {
    return (
      <main className="min-h-screen bg-stone-950 px-5 py-12 text-stone-100">
        <section className="mx-auto grid w-full max-w-3xl gap-8">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
            Foldkit Counters
          </p>
          <p className="font-mono text-sm text-amber-400">{view.selectedId}</p>
          <p className="text-7xl font-semibold tabular-nums">{view.count}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="counter-button"
              onClick={actions.increment}
              type="button"
            >
              +
            </button>
            <button
              className="counter-button"
              onClick={actions.decrement}
              type="button"
            >
              -
            </button>
            <button
              className="secondary-button"
              onClick={actions.reset}
              type="button"
            >
              Reset
            </button>
            <button
              className="primary-button"
              onClick={actions.showFact}
              type="button"
            >
              Fact
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                actions.back()
                onOpen(listUri)
              }}
              type="button"
            >
              Back
            </button>
          </div>
        </section>
      </main>
    )
  }
  return (
    <main className="min-h-screen bg-stone-950 px-5 py-12 text-stone-100">
      <section className="mx-auto grid w-full max-w-3xl gap-8">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
          Foldkit Counters
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Multiple counters
        </h1>
        <section aria-label="Counters" className="grid gap-3">
          {Array.map(view.counters, counter => (
            <button
              className="grid gap-2 rounded-2xl border border-stone-800 bg-stone-900 p-5 text-left"
              key={counter.id}
              onClick={() => {
                actions.open(counter.id)
                onOpen(counterUri(counter.id))
              }}
              type="button"
            >
              <span className="font-mono text-sm text-amber-300">
                {counter.id}
              </span>
              <span className="text-4xl font-semibold tabular-nums">
                {counter.count}
              </span>
            </button>
          ))}
        </section>
        <button
          className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-300"
          onClick={actions.addCounter}
          type="button"
        >
          Add counter
        </button>
      </section>
    </main>
  )
}

const Status = ({ children }: Readonly<{ children: ReactNode }>) => (
  <main className="grid min-h-screen place-items-center bg-stone-950 text-stone-100">
    <section className="grid w-full max-w-sm gap-4 p-6 text-center">
      {children}
    </section>
  </main>
)
