import {
  type CounterFactStatus,
  type CounterRow,
  type Navigation,
  navigationToPath,
  urlToNavigation,
} from 'counters-core-example'
import {
  useMultipleCountersActions,
  useMultipleCountersReplay,
} from 'counters-react-bindings-example'
import { Array, Match as M, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { type ChangeEvent, type ReactNode, useEffect, useRef } from 'react'

/** Projects navigation Model changes to browser history and re-enters opened history entries as Messages. */
export const useNavigationHistory = (navigation: Navigation): void => {
  const actions = useMultipleCountersActions()
  const replay = useMultipleCountersReplay()
  const isReconcilingHistoryEntry = useRef(false)

  useEffect(() => {
    const nextPath = navigationToPath(navigation)
    if (window.location.pathname !== nextPath) {
      const nextUrl = `${nextPath}${window.location.search}`
      if (isReconcilingHistoryEntry.current || replay.mode === 'Inspecting') {
        window.history.replaceState({}, '', nextUrl)
      } else {
        window.history.pushState({}, '', nextUrl)
      }
    }
    isReconcilingHistoryEntry.current = false
  }, [navigation, replay.mode])

  useEffect(() => {
    const openedHistoryEntry = () => {
      const maybeUrl = fromString(window.location.href)
      if (Option.isSome(maybeUrl)) {
        const openedNavigation = urlToNavigation(maybeUrl.value)
        const nextPath = navigationToPath(openedNavigation)
        const currentPath = navigationToPath(navigation)
        if (window.location.pathname !== nextPath) {
          window.history.replaceState(
            {},
            '',
            `${nextPath}${window.location.search}`,
          )
        }
        if (currentPath !== nextPath) {
          isReconcilingHistoryEntry.current = true
          actions.openedNavigation(openedNavigation)
        }
      }
    }
    window.addEventListener('popstate', openedHistoryEntry)
    return () => window.removeEventListener('popstate', openedHistoryEntry)
  }, [actions, navigation])
}

/** Renders the counter list with actual domain controls. */
export const CounterListView = ({
  counters,
}: Readonly<{ counters: ReadonlyArray<CounterRow> }>) => {
  const actions = useMultipleCountersActions()
  return (
    <section className="grid gap-3" aria-label="Counters">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Counters</h2>
        <button
          className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-300"
          onClick={actions.clickedAddCounter}
          type="button"
        >
          Add counter
        </button>
      </div>
      {Array.map(counters, counter => (
        <article
          className="grid gap-4 rounded-2xl border border-stone-800 bg-stone-900 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          key={counter.id}
        >
          <div>
            <button
              className="font-mono text-sm text-amber-300 underline-offset-4 hover:underline"
              onClick={() => actions.selectedCounter(counter.id)}
              type="button"
            >
              {counter.id}
            </button>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {counter.counter.count}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label={`Decrement ${counter.id}`}
              className="counter-button"
              onClick={() => actions.clickedDecrementCounter(counter.id)}
              type="button"
            >
              −
            </button>
            <button
              aria-label={`Increment ${counter.id}`}
              className="counter-button"
              onClick={() => actions.clickedIncrementCounter(counter.id)}
              type="button"
            >
              +
            </button>
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm hover:border-stone-500"
              onClick={() => actions.selectedCounter(counter.id)}
              type="button"
            >
              Details
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}

/** Renders one counter detail with controls that are valid before a mode is presented. */
export const CounterDetailView = ({ counter }: { counter: CounterRow }) => {
  const actions = useMultipleCountersActions()
  return (
    <section className="rounded-3xl border border-stone-800 bg-stone-900 p-7">
      <button
        className="text-sm text-stone-400 hover:text-stone-100"
        onClick={actions.dismissedCounterDetail}
        type="button"
      >
        ← Back to counters
      </button>
      <p className="mt-6 font-mono text-sm text-amber-400">{counter.id}</p>
      <p className="mt-3 text-7xl font-semibold tabular-nums">
        {counter.counter.count}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          className="counter-button"
          onClick={() => actions.clickedDecrementCounter(counter.id)}
          type="button"
        >
          −
        </button>
        <button
          className="counter-button"
          onClick={() => actions.clickedIncrementCounter(counter.id)}
          type="button"
        >
          +
        </button>
        <button
          className="secondary-button"
          onClick={() => actions.clickedResetCounter(counter.id)}
          type="button"
        >
          Reset
        </button>
        <button
          className="primary-button"
          onClick={actions.clickedShowCounterFact}
          type="button"
        >
          Show counter fact
        </button>
        <button
          className="destructive-button"
          onClick={actions.clickedDeleteCounter}
          type="button"
        >
          Delete counter
        </button>
      </div>
    </section>
  )
}

/** Renders every counter fact request state exhaustively. */
export const FactStatusView = ({ status }: { status: CounterFactStatus }) =>
  M.value(status).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => (
        <p className="text-sky-200">Loading counter fact…</p>
      ),
      LoadedCounterFact: ({ fact }) => (
        <>
          <h2 className="text-xl font-semibold text-sky-100">
            Counter fact for {fact.number}
          </h2>
          <p className="mt-2 text-sky-100/75">{fact.text}</p>
        </>
      ),
      FailedCounterFact: ({ reason }) => (
        <>
          <h2 className="text-xl font-semibold text-sky-100">
            Counter fact unavailable
          </h2>
          <p className="mt-2 text-sky-100/75">{reason}</p>
        </>
      ),
    }),
  )

/** Renders floating controls over the same ReplayController used by product actions. */
export const ReplayControls = () => {
  const replay = useMultipleCountersReplay()
  const changedFrame = (event: ChangeEvent<HTMLInputElement>) => {
    replay.seek(Number.parseInt(event.currentTarget.value, 10))
  }
  return (
    <aside
      aria-label="Replay controls"
      className="fixed bottom-3 right-3 z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-emerald-400/25 bg-stone-900/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-300">
            {replay.mode}
          </p>
          <p className="mt-1 text-sm text-stone-300">
            Frame {replay.frame} of {replay.finalFrame}
          </p>
        </div>
        <button
          className="secondary-button text-xs"
          disabled={replay.mode === 'Inspecting'}
          onClick={() => replay.inspect()}
          type="button"
        >
          Inspect current
        </button>
      </div>
      <input
        aria-label="Replay frame"
        className="mt-3 w-full accent-emerald-400"
        max={replay.finalFrame}
        min={0}
        onChange={changedFrame}
        type="range"
        value={replay.frame}
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          className="secondary-button flex-1"
          disabled={replay.frame === 0}
          onClick={replay.stepBackward}
          type="button"
        >
          Previous
        </button>
        <button
          className="secondary-button flex-1"
          disabled={
            replay.mode === 'Live' || replay.frame === replay.finalFrame
          }
          onClick={replay.stepForward}
          type="button"
        >
          Next
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        {replay.isBranchable
          ? 'While inspecting, any app action branches live from this settled frame.'
          : 'This frame is still waiting for a Command result and is inspection-only.'}
      </p>
      {Option.isSome(replay.maybeError) ? (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {replay.maybeError.value}
        </p>
      ) : null}
    </aside>
  )
}
