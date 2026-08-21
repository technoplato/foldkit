<script lang="ts">
  import {
    Path,
    describeCounterSyncError,
    surfaceFor,
  } from 'counter-core-example'

  import { useActions, useModel } from './processor.js'

  const surface = surfaceFor('svelte')
  const view = $derived(useModel(Path()))
  const actions = $derived(useActions(Path()))
</script>

<main>
  <section>
    <header>
      <h1>{surface.title}</h1>
      <p>
        {surface.description}
        <a href={surface.sourceUrl}>{surface.sourceUrl}</a>
      </p>
    </header>
    {#if view._tag === 'Starting'}
      <p>Starting Instant Counter…</p>
    {:else if view._tag === 'Failed'}
      <p>{describeCounterSyncError(view.error)}</p>
    {:else}
      <div class="count">{view.product.count}</div>
      <div class="row">
        <button onclick={() => actions.decrementButtonTapped()} type="button">
          -
        </button>
        {#if actions.resetButtonTapped._tag === 'Tappable'}
          <button onclick={actions.resetButtonTapped.tap} type="button">
            Reset
          </button>
        {:else}
          <div></div>
        {/if}
        <button onclick={() => actions.incrementButtonTapped()} type="button">
          +
        </button>
      </div>
    {/if}
  </section>
</main>
