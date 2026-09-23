<script lang="ts">
  import type { ButtonNode, UiNode } from 'foldkit/renderers'

  import PaintScreen from './PaintScreen.svelte'

  type Props = Readonly<{
    node: UiNode
    onPress: (button: ButtonNode) => void
  }>

  const { node, onPress }: Props = $props()

  const childKey = (child: UiNode, index: number): string => {
    if (child._tag === 'Button' && child.action !== undefined) {
      return `button-${child.action}`
    }
    return `${child._tag}-${index.toString()}`
  }
</script>

{#if node._tag === 'Text'}
  {#if node.href === undefined}
    <div class="fk-text">{node.content}</div>
  {:else}
    <div class="fk-text">
      <a class="fk-text-link" href={node.href}>{node.content}</a>
    </div>
  {/if}
{:else if node._tag === 'Button'}
  <button
    class="fk-button"
    disabled={node.disabled === true}
    onclick={() => {
      onPress(node)
    }}
    title={node.because}
    type="button"
  >
    {node.label}
  </button>
{:else if node._tag === 'TextInput'}
  <div class="fk-text-input">{node.value}</div>
{:else if node._tag === 'Spacer'}
  <div class="fk-spacer"></div>
{:else if node._tag === 'Row'}
  <div class="fk-row">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {onPress} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Column'}
  <div class="fk-column">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {onPress} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Box'}
  <div class="fk-box">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {onPress} node={child} />
    {/each}
  </div>
{:else}
  <div class="fk-device">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {onPress} node={child} />
    {/each}
  </div>
{/if}
