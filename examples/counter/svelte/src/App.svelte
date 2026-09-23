<script lang="ts">
  import { Option } from 'effect'
  import { Interaction } from 'foldkit'
  import type { ButtonNode } from 'foldkit/renderers'

  import ActionMenu from './ActionMenu.svelte'
  import { counter } from './counter.js'
  import PaintScreen from './PaintScreen.svelte'

  $effect(() => Interaction.listenToDocumentKeys(counter.bound, document))

  const press = (button: ButtonNode) => {
    if (button.action !== undefined) {
      counter.bound.press(button.action)
    }
  }
</script>

<main>
  <section>
    {#if counter.status._tag === 'Starting'}
      <p>Starting Instant Counter…</p>
    {:else if counter.status._tag === 'Failed'}
      <p class="counter-failed">{counter.status.description}</p>
    {:else}
      {#if Option.isSome(counter.screen)}
        <PaintScreen node={counter.screen.value} onPress={press} />
      {/if}
      <button
        class="counter-menu-button"
        onclick={() => counter.bound.openMenu()}
        type="button"
      >
        Actions (⌘K)
      </button>
      {#if Option.isSome(counter.menu)}
        <ActionMenu bound={counter.bound} menu={counter.menu.value} />
      {/if}
    {/if}
  </section>
</main>
