<script lang="ts">
  import type { UiNode } from 'foldkit/renderers'

  import PaintScreen from './PaintScreen.svelte'

  type Props = Readonly<{
    node: UiNode
    sendToken: (token: string) => void
  }>

  const { node, sendToken }: Props = $props()

  const tap = (token: string | undefined, disabled: boolean | undefined) => {
    if (token === undefined || disabled === true) {
      return
    }
    sendToken(token)
  }

  const childKey = (child: UiNode, index: number): string => {
    if (child._tag === 'Button' && child.token !== undefined) {
      return `button-${child.token}`
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
      tap(node.token, node.disabled)
    }}
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
      <PaintScreen {sendToken} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Column'}
  <div class="fk-column">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {sendToken} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Box'}
  <div class="fk-box">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {sendToken} node={child} />
    {/each}
  </div>
{:else}
  <div class="fk-device">
    {#each node.children as child, index (childKey(child, index))}
      <PaintScreen {sendToken} node={child} />
    {/each}
  </div>
{/if}
