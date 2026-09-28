<script lang="ts">
  import { Interaction } from 'foldkit'

  import { ActionMenuDialog, Screen } from '@foldkit/svelte/interaction'

  import { counter } from './counter.js'

  $effect(() => Interaction.listenToDocumentKeys(counter.bound, document))
</script>

<main>
  <section>
    {#if counter.status._tag === 'Starting'}
      <p>Starting Instant Counter…</p>
    {:else if counter.status._tag === 'Failed'}
      <p class="counter-failed">{counter.status.description}</p>
    {:else}
      <Screen program={counter} />
      <button
        class="counter-menu-button"
        onclick={() => counter.bound.openMenu()}
        type="button"
      >
        Actions (⌘K)
      </button>
      <ActionMenuDialog program={counter} />
    {/if}
  </section>
</main>
