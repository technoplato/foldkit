<script lang="ts">
  import {
    Path,
    counterScreen,
    describeCounterSyncError,
    initialCount,
    Model,
  } from 'counter-core-example'

  import PaintScreen from './PaintScreen.svelte'
  import { useActions, useModel } from './processor.js'

  const view = $derived(useModel(Path()))
  const actions = $derived(useActions(Path()))

  const sendToken = (token: string) => {
    if (token === 'increment') {
      actions.incrementButtonTapped()
      return
    }
    if (token === 'decrement') {
      actions.decrementButtonTapped()
      return
    }
    if (token === 'reset' && actions.resetButtonTapped._tag === 'Tappable') {
      actions.resetButtonTapped.tap()
    }
  }

  const screen = $derived(
    view._tag === 'Ready'
      ? counterScreen(view.product)
      : counterScreen(Model.make({ count: initialCount })),
  )
</script>

<main>
  <section>
    {#if view._tag === 'Starting'}
      <p>Starting Instant Counter…</p>
    {:else if view._tag === 'Failed'}
      <p>{describeCounterSyncError(view.error)}</p>
    {:else}
      <PaintScreen node={screen} {sendToken} />
    {/if}
  </section>
</main>
