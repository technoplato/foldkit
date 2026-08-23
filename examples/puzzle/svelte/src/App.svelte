<script lang="ts">
  import { Path } from 'puzzle-core-example'

  import PaintScreen from './PaintScreen.svelte'
  import { sendScreenToken, useScreen } from './processor.js'

  const screen = $derived(useScreen(Path()))
</script>

<main>
  <PaintScreen node={screen} sendToken={sendScreenToken} />
</main>
