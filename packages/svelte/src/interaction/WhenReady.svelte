<script lang="ts">
  import { Interaction } from 'foldkit'
  import type { Snippet } from 'svelte'

  import type { ReactiveProgram } from './reactive.js'

  type Props = Readonly<{
    program: ReactiveProgram<unknown, never>
    children: Snippet
  }>

  const { program, children }: Props = $props()

  const stylesheet = `<style id="foldkit-screen">${Interaction.screenStylesheet}</style>`
</script>

<svelte:head>
  {@html stylesheet}
</svelte:head>

{#if program.status._tag === 'Ready'}
  {@render children()}
{:else}
  <p class="fk-status" role="status">{program.status.description}</p>
{/if}
