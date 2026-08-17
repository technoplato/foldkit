<script lang="ts">
  import { useActions, useModel } from './processor.js'

  const counterUri = '/counter'
  const view = $derived(useModel(counterUri))
  const actions = $derived(useActions(counterUri))
</script>

<main>
  {#if view._tag === 'StartingWindow'}
    <section>
      <p>Starting Instant Counter…</p>
    </section>
  {:else if view._tag === 'FailedWindow'}
    <section>
      <p>{view.error}</p>
      <button onclick={() => actions.signIn()} type="button">Sign in</button>
    </section>
  {:else}
    <section>
      <div class="count">{view.count}</div>
      <div class="row">
        <button onclick={() => actions.clickedDecrement()} type="button">
          -
        </button>
        {#if view.count !== 0}
          <button onclick={() => actions.clickedReset()} type="button">
            Reset
          </button>
        {:else}
          <div></div>
        {/if}
        <button onclick={() => actions.clickedIncrement()} type="button">
          +
        </button>
      </div>
    </section>
  {/if}
</main>
