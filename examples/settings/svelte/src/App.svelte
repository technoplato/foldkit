<script lang="ts">
  import {
    SettingsProgram,
    emptyModel,
    messageFromToken,
    settingsScreen,
  } from 'settings-core-example'

  import PaintScreen from './PaintScreen.svelte'

  let model = $state(emptyModel())
  const screen = $derived(settingsScreen(model))

  const sendToken = (token: string) => {
    const message = messageFromToken(token)
    if (message === undefined) {
      return
    }
    model = SettingsProgram.update(model, message)[0]
  }
</script>

<main>
  <PaintScreen node={screen} {sendToken} />
</main>
