<script lang="ts">
  import { Navigation } from 'foldkit'
  import type { ButtonNode, UiNode } from 'foldkit/renderers'

  import CopyButton from './CopyButton.svelte'
  import { type PaintClassNames, classFor, keyFor } from './paint.js'
  import PaintTree from './PaintTree.svelte'

  type Props = Readonly<{
    node: UiNode
    onPress: (button: ButtonNode) => void
    onInput?: ((token: string, value: string) => void) | undefined
    onLink?: ((href: string) => boolean) | undefined
    classNames?: PaintClassNames
  }>

  const { node, onPress, onInput, onLink, classNames = {} }: Props = $props()

  const followLink = (event: MouseEvent, href: string): void => {
    if (Navigation.isPlainClick(event) && onLink !== undefined && onLink(href)) {
      event.preventDefault()
    }
  }
</script>

{#if node._tag === 'Text'}
  {@const href = node.href}
  {#if node.copyable === true}
    <div
      aria-label={node.label}
      class={classFor(classNames, 'Text', 'fk-text')}
      data-copyable
      data-mono={node.mono === true ? true : undefined}
    >
      <span class="fk-copyable-text">{node.content}</span>
      <CopyButton text={node.content} />
    </div>
  {:else if href === undefined}
    <div
      aria-label={node.label}
      class={classFor(classNames, 'Text', 'fk-text')}
      data-dim={node.dim === true ? true : undefined}
      data-mono={node.mono === true ? true : undefined}
      data-emphasis={node.emphasis}
    >
      {node.content}
    </div>
  {:else}
    <div
      aria-label={node.label}
      class={classFor(classNames, 'Text', 'fk-text')}
      data-dim={node.dim === true ? true : undefined}
      data-mono={node.mono === true ? true : undefined}
      data-emphasis={node.emphasis}
    >
      <a
        class="fk-text-link"
        {href}
        onclick={event => {
          followLink(event, href)
        }}>{node.content}</a
      >
    </div>
  {/if}
{:else if node._tag === 'Button'}
  <button
    aria-keyshortcuts={node.keys?.join(' ')}
    class={classFor(classNames, 'Button', 'fk-button')}
    data-action={node.action}
    data-keys={node.keys?.join(' ')}
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
  {@const token = node.token}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    autofocus={node.focused === true}
    class={classFor(classNames, 'TextInput', 'fk-text-input')}
    oninput={event => {
      if (token !== undefined && onInput !== undefined) {
        onInput(token, event.currentTarget.value)
      }
    }}
    placeholder={node.placeholder}
    type="text"
    value={node.value}
  />
{:else if node._tag === 'Spacer'}
  <div class={classFor(classNames, 'Spacer', 'fk-spacer')}></div>
{:else if node._tag === 'Row'}
  <div class={classFor(classNames, 'Row', 'fk-row')}>
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onInput} {onLink} {onPress} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Column'}
  <div class={classFor(classNames, 'Column', 'fk-column')}>
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onInput} {onLink} {onPress} node={child} />
    {/each}
  </div>
{:else if node._tag === 'Box'}
  <div class={classFor(classNames, 'Box', 'fk-box')}>
    {#each node.children as child, index (keyFor(child, index))}
      <PaintTree {classNames} {onInput} {onLink} {onPress} node={child} />
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
      <PaintTree {classNames} {onInput} {onLink} {onPress} node={child} />
    {/each}
  </div>
{/if}
