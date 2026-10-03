<script lang="ts">
  import { Option } from 'effect'
  import { Interaction } from 'foldkit'

  import type { ReactiveProgram } from './reactive.js'

  type Props = Readonly<{
    program: ReactiveProgram<unknown, never>
    class?: string
  }>

  const { program, class: className = 'fk-action-menu-opener' }: Props =
    $props()

  const platform: Interaction.KeyPlatform =
    typeof navigator === 'undefined'
      ? 'Other'
      : Interaction.keyPlatformOf(navigator)

  const maybeOpener = $derived(program.bound.menuOpener(platform))
</script>

{#if Option.isSome(maybeOpener)}
  <button
    class={className}
    onclick={() => program.bound.openMenu()}
    type="button"
  >
    {maybeOpener.value.label}
  </button>
{/if}
