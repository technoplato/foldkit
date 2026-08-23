<script lang="ts">
  import { Path, describePuzzleSyncError } from 'puzzle-core-example'

  import PaintScreen from './PaintScreen.svelte'
  import { sendScreenToken, useModel, useScreen } from './processor.js'

  const view = $derived(useModel(Path()))
  const screen = $derived(useScreen(Path()))
</script>

<main>
  <section>
    {#if view._tag === 'Starting'}
      <p>Starting Instant Puzzle…</p>
    {:else if view._tag === 'Failed'}
      <p>{describePuzzleSyncError(view.error)}</p>
    {:else}
      <PaintScreen node={screen} sendToken={sendScreenToken} />
    {/if}
  </section>
</main>
