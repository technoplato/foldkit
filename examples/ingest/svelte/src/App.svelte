<script lang="ts">
  import {
    IngestProgram,
    emptyModel,
    messageFromToken,
    ingestScreen,
  } from 'ingest-core-example'

  import PaintScreen from './PaintScreen.svelte'

  let model = $state(emptyModel())
  const screen = $derived(ingestScreen(model))

  const sendToken = (token: string) => {
    const message = messageFromToken(token, model)
    if (message === undefined) {
      return
    }
    model = IngestProgram.update(model, message)[0]
  }
</script>

<main>
  <PaintScreen node={screen} {sendToken} />
</main>
