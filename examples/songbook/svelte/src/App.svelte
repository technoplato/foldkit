<script lang="ts">
  import {
    SongbookProgram,
    emptyModel,
    messageFromToken,
    songbookScreen,
  } from 'songbook-core-example'

  import PaintScreen from './PaintScreen.svelte'

  let model = $state(emptyModel())
  const screen = $derived(songbookScreen(model))

  const sendToken = (token: string) => {
    const message = messageFromToken(token, model)
    if (message === undefined) {
      return
    }
    model = SongbookProgram.update(model, message)[0]
  }
</script>

<main>
  <PaintScreen node={screen} {sendToken} />
</main>
