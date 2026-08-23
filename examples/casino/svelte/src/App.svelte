<script lang="ts">
  import {
    CasinoProgram,
    emptyModel,
    messageFromToken,
    casinoScreen,
  } from 'casino-core-example'

  import PaintScreen from './PaintScreen.svelte'

  let model = $state(emptyModel())
  const screen = $derived(casinoScreen(model))

  const sendToken = (token: string) => {
    const message = messageFromToken(token, model)
    if (message === undefined) {
      return
    }
    model = CasinoProgram.update(model, message)[0]
  }
</script>

<main>
  <PaintScreen node={screen} {sendToken} />
</main>
