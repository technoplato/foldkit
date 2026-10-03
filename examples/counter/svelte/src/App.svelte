<script lang="ts">
  import { Interaction } from 'foldkit'

  import {
    ActionMenuButton,
    NavigationFrame,
  } from '@foldkit/svelte/interaction'

  import { counter } from './counter.js'

  $effect(() => Interaction.listenToDocumentKeys(counter.bound, document))
</script>

<main>
  <section>
    {#if counter.status._tag === 'Starting'}
      <p>{counter.status.description}</p>
    {:else if counter.status._tag === 'Failed'}
      <p class="counter-failed">{counter.status.description}</p>
    {:else}
      <NavigationFrame program={counter} />
      <ActionMenuButton class="counter-menu-button" program={counter} />
    {/if}
  </section>
</main>
