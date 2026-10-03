<script lang="ts">
  import type { ReactiveProgram } from './reactive.js'

  type Props = Readonly<{ program: ReactiveProgram<unknown, never> }>

  const { program }: Props = $props()
</script>

<svelte:head>
  <title>{program.windowTitle}</title>
</svelte:head>
