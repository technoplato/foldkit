<script lang="ts">
  import type { ButtonNode, UiNode } from 'foldkit/renderers'

  import { type PaintClassNames, classFor, keyFor } from './paint.js'
  import PaintTree from './PaintTree.svelte'

  type Props = Readonly<{
    node: UiNode
    onPress: (button: ButtonNode) => void
    classNames?: PaintClassNames
  }>

  const { node, onPress, classNames = {} }: Props = $props()
</script>

{#if node._tag === 'Text'}
  {#if node.href === undefined}
    <div class={classFor(classNames, 'Text', 'fk-text')}>{node.content}</div>
  {:else}
    <div class={classFor(classNames, 'Text', 'fk-text')}>
      <a class="fk-text-link" href={node.href}>{node.content}</a>
    </div>
  {/if}
{:else if node._tag === 'Button'}
  <button
    class={classFor(classNames, 'Button', 'fk-button')}
    data-action={node.action}
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
  <div class={classFor(classNames, 'TextInput', 'fk-text-input')}>
    {node.value}
  </div>
{:else if node._tag === 'Spacer'}
  <div class={classFor(classNames, 'Spacer', 'fk-spacer')}></div>
{:else if node._tag === 'Row'}
  <div class={classFor(classNames, 'Row', 'fk-row')}>
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onPress} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Column'}
  <div class={classFor(classNames, 'Column', 'fk-column')}>
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onPress} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Box'}
  <div class={classFor(classNames, 'Box', 'fk-box')}>
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onPress} node={child} />
    {/each}
  </div>
{:else}
  <div
    class={classFor(
      classNames,
      'DeviceShell',
      `fk-device fk-device-${node.device}`,
    )}
  >
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onPress} node={child} />
    {/each}
  </div>
{/if}
