<script lang="ts">
  import { Interaction } from 'foldkit'

  import {
    ActionMenuButton,
    DocumentTitle,
    NavigationFrame,
    WhenReady,
  } from '@foldkit/svelte/interaction'

  import { counter } from './counter.js'

  $effect(() => Interaction.listenToDocumentKeys(counter.bound, document))
</script>

<DocumentTitle program={counter} />

<main>
  <section>
    <WhenReady program={counter}>
      <NavigationFrame program={counter} />
      <ActionMenuButton program={counter} />
    </WhenReady>
  </section>
</main>
