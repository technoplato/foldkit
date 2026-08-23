<script lang="ts">
  import {
    GateProgram,
    emptyModel,
    messageFromToken,
    gateScreen,
  } from 'gate-core-example'

  import PaintScreen from './PaintScreen.svelte'

  let model = $state(emptyModel())
  const screen = $derived(gateScreen(model))

  const sendToken = (token: string) => {
    const message = messageFromToken(token)
    if (message === undefined) {
      return
    }
    model = GateProgram.update(model, message)[0]
  }
</script>

<main>
  <PaintScreen node={screen} {sendToken} />
</main>
