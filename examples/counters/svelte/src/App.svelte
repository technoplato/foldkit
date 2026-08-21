<script lang="ts">
  import { useActions, useModel } from './processor.js'

  const listUri = '/counters'
  const counterUri = (counterId: string): string => `/counters/${counterId}`

  let uri = $state(listUri)
  const view = $derived(useModel(uri))
  const actions = $derived(useActions(uri))
</script>

<main>
  <p>FOLDKIT COUNTERS</p>
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
