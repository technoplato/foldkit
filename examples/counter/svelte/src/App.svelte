<script lang="ts">
  import { Path, describeCounterSyncError } from 'counter-core-example'

  import { useActions, useModel } from './processor.js'

  const view = $derived(useModel(Path()))
  const actions = $derived(useActions(Path()))
</script>

<main>
  {#if view._tag === 'Starting'}
    <section>
      <p>Starting Instant Counter…</p>
    </section>
  {:else if view._tag === 'Failed'}
    <section>
      <p>{describeCounterSyncError(view.error)}</p>
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
