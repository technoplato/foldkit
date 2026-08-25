import { type CountersWindowActions, type CountersWindowModel } from 'counters-instant-example'
import { createSignal, type JSX, onCleanup, onMount } from 'solid-js'

import {
  countersWindowCarrier,
  subscribeToSnapshots,
  useActions,
} from './processor.js'

// Injected by vite define from this checkout's own git remote; never hardcoded.
declare const __GITHUB_SOURCE_URL__: string
const sourceUrl =
  typeof __GITHUB_SOURCE_URL__ === 'string' ? __GITHUB_SOURCE_URL__ : ''

const listUri = '/counters'
const counterUri = (counterId: string): string => `/counters/${counterId}`

/** Carrier -> Program reconciliation after history.back/forward. */
const useCarrierReconciliation = (
  pathname: () => string,
  actions: CountersWindowActions,
): void => {
  const carrier = countersWindowCarrier()
  onMount(() => {
    const reconcile = (): void => {
      const current = pathname()
      if (current === carrier.programPath()) {
        return
      }
      if (current === listUri) {
        actions.back()
        return
      }
      const match = /\/counters\/([\w-]+)/u.exec(current)
      if (match !== null && match[1] !== undefined) {
        actions.open(match[1])
      }
    }
    reconcile()
    window.addEventListener('popstate', reconcile)
    onCleanup(() => window.removeEventListener('popstate', reconcile))
  })
}

export const App = (): JSX.Element => {
  let uri = listUri
  try {
    uri = window.location.pathname
  } catch {
    // SSR or test environment: keep the default.
  }
  const [pathname, setPathname] = createSignal(uri)
  const [snapshot, setSnapshot] = createSignal<CountersWindowModel | undefined>(
    undefined,
  )
  onMount(() => {
    const stop = subscribeToSnapshots(pathname(), next => setSnapshot(next))
    onCleanup(stop)
  })

  useCarrierReconciliation(pathname, useActions(uri))

  const view = snapshot()
  const actions = useActions(uri)

  return (
    <main>
      <p class="surface-label" data-source={sourceUrl}>
        {sourceUrl === ''
          ? 'FOLDKIT COUNTERS — SOLID'
          : `FOLDKIT COUNTERS — SOLID · Source: ${sourceUrl}`}
      </p>
      <h1>Solid</h1>
      {view === undefined || view._tag === 'StartingWindow' ? (
        <p>Starting Instant Multiple Counters…</p>
      ) : view._tag === 'FailedWindow' ? (
        <>
          <p>{view.error}</p>
          <button onclick={() => actions.signIn()} type="button">
            Sign in with Access
          </button>
        </>
      ) : view.selectedId !== undefined && view.count !== undefined ? (
        <>
          <p>{view.selectedId}</p>
          <p>{view.count}</p>
          <button onclick={() => actions.increment()} type="button">+</button>
          <button onclick={() => actions.decrement()} type="button">-</button>
          <button onclick={() => actions.showFact()} type="button">Fact</button>
          <button
            onclick={() => {
              actions.back()
              setPathname(listUri)
              window.history.pushState({}, '', listUri)
            }}
            type="button"
          >
            Back
          </button>
        </>
      ) : (
        <>
          <button onclick={() => actions.addCounter()} type="button">
            Add counter
          </button>
          <ul>
            {(view.counters ?? []).map(counter => (
              <li>
                <button
                  onclick={() => {
                    actions.open(counter.id)
                    setPathname(counterUri(counter.id))
                    window.history.pushState({}, '', counterUri(counter.id))
                  }}
                  type="button"
                >
                  {counter.id}: {counter.count}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
