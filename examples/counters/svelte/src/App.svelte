<script lang="ts">
  import { onMount } from 'svelte'

  import { countersWindowCarrier, useActions, useModel } from './processor.js'

  // Injected by vite define from this checkout's own git remote; never hardcoded.
  declare const __GITHUB_SOURCE_URL__: string
  const sourceUrl = typeof __GITHUB_SOURCE_URL__ === 'string' ? __GITHUB_SOURCE_URL__ : ''
  const listUri = '/counters'
  const counterUri = (counterId: string): string => `/counters/${counterId}`

  const carrier = countersWindowCarrier()
  let uri = $state(
    typeof window === 'undefined' ? listUri : window.location.pathname,
  )
  const view = $derived(useModel(uri))
  const actions = $derived(useActions(uri))

  // Carrier -> Program reconciliation: when the browser moves underneath
  // the Program (back/forward), send the matching action so the Program
  // and its URI projection agree again.
  onMount(() => {
    const reconcile = (): void => {
      uri = window.location.pathname
      if (uri !== carrier.programPath()) {
        if (uri === listUri) {
          actions.back()
          return
        }
        const match = /\/counters\/([\w-]+)/u.exec(uri)
        if (match !== null && match[1] !== undefined) {
          actions.open(match[1])
        }
      }
    }
    window.addEventListener('popstate', reconcile)
    return () => window.removeEventListener('popstate', reconcile)
  })
</script>

<main>
  <p class="surface-label" data-source={sourceUrl || 'local checkout'}>
    {sourceUrl === ''
      ? 'FOLDKIT COUNTERS — SVELTE'
      : `FOLDKIT COUNTERS — SVELTE · Source: ${sourceUrl}`}
  </p>
  <h1>Svelte</h1>
  {#if view._tag === 'StartingWindow'}
    <p>Starting Instant Multiple Counters…</p>
  {:else if view._tag === 'FailedWindow'}
    <p>{view.error}</p>
    <button onclick={() => actions.signIn()} type="button">
      Sign in with Access
    </button>
  {:else if view.selectedId !== undefined && view.count !== undefined}
    <p>{view.selectedId}</p>
    <p>{view.count}</p>
    <button onclick={() => actions.increment()} type="button">+</button>
    <button onclick={() => actions.decrement()} type="button">-</button>
    <button onclick={() => actions.showFact()} type="button">Fact</button>
    <button
      onclick={() => {
        actions.back()
        uri = listUri
      }}
      type="button"
    >
      Back
    </button>
  {:else}
    <button onclick={() => actions.addCounter()} type="button">
      Add counter
    </button>
    {#each view.counters as counter (counter.id)}
      <article>
        <button
          onclick={() => {
            actions.open(counter.id)
            uri = counterUri(counter.id)
          }}
          type="button"
        >
          {counter.id}
        </button>
        <strong>{counter.count}</strong>
      </article>
    {/each}
  {/if}
</main>
