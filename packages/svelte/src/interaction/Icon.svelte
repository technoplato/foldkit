<script lang="ts">
  import { type IconName, iconDrawings } from 'foldkit/renderers'

  type Props = Readonly<{ name: IconName }>

  const { name }: Props = $props()

  const drawing = $derived(iconDrawings[name])
</script>

<svg
  aria-hidden="true"
  class="fk-icon"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width="2"
  viewBox="0 0 24 24"
>
  {#each drawing.strokes as path, index (index)}
    <path d={path} />
  {/each}
  {#each drawing.fills as path, index (index)}
    <path d={path} fill="currentColor" stroke="none" />
  {/each}
  {#if drawing.figure !== undefined}
    <text
      class="fk-icon-figure"
      fill="currentColor"
      stroke="none"
      text-anchor="middle"
      x="12"
      y="14.5">{drawing.figure}</text
    >
  {/if}
</svg>
