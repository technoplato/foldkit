<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  import {
    type CountersWindowModel,
    actions,
    snapshot,
    subscribe,
  } from '../processor.js'

  const listUri = '/counters'

  const counterUri = (counterId: string): string => `/counters/${counterId}`

  let uri = listUri
  let view: CountersWindowModel = { _tag: 'StartingWindow' }
  let stop: (() => void) | undefined

  const refresh = () => {
    view = snapshot(uri)
  }

  onMount(() => {
    refresh()
    stop = subscribe(refresh)
  })

  onDestroy(() => {
    stop?.()
  })

  const open = (counterId: string) => {
    actions(uri).open(counterId)
    uri = counterUri(counterId)
    refresh()
  }

  const back = () => {
    actions(uri).back()
    uri = listUri
    refresh()
  }
</script>

<svelte:head>
  <title>Foldkit | Multiple Counters SvelteKit</title>
</svelte:head>

<main>
  <p>FOLDKIT COUNTERS</p>
  <h1>SvelteKit</h1>
  {#if view._tag === 'StartingWindow'}
    <p>Starting Instant Multiple Counters…</p>
  {:else if view._tag === 'FailedWindow'}
    <p>{view.error}</p>
    <button onclick={() => actions(uri).signIn()} type="button">
      Sign in with Access
    </button>
  {:else if view.selectedId !== undefined && view.count !== undefined}
    <p>{view.selectedId}</p>
    <p>{view.count}</p>
    <button onclick={() => actions(uri).increment()} type="button">+</button>
    <button onclick={() => actions(uri).decrement()} type="button">-</button>
    <button onclick={() => actions(uri).showFact()} type="button">Fact</button>
    <button onclick={back} type="button">Back</button>
  {:else}
    <button onclick={() => actions(uri).addCounter()} type="button">
      Add counter
    </button>
    {#each view.counters as counter (counter.id)}
      <article>
        <button onclick={() => open(counter.id)} type="button">
          {counter.id}
        </button>
        <strong>{counter.count}</strong>
        <button
          onclick={() => actions(counterUri(counter.id)).increment()}
          type="button"
        >
          +
        </button>
        <button
          onclick={() => actions(counterUri(counter.id)).decrement()}
          type="button"
        >
          -
        </button>
      </article>
    {/each}
  {/if}
</main>
