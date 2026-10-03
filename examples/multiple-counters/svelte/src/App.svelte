<script lang="ts">
  import { Interaction } from 'foldkit'

  import {
    ActionMenuButton,
    DocumentTitle,
    NavigationFrame,
    WhenReady,
  } from '@foldkit/svelte/interaction'

  import { counters } from './counters.js'

  $effect(() => Interaction.listenToDocumentKeys(counters.bound, document))
</script>

<DocumentTitle program={counters} />

<main>
  <section>
    <WhenReady program={counters}>
      <NavigationFrame program={counters} />
      <ActionMenuButton program={counters} />
    </WhenReady>
  </section>
</main>
