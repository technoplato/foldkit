<script lang="ts">
  import { Navigation } from 'foldkit'
  import type { ButtonNode, UiNode } from 'foldkit/renderers'

  import CopyButton from './CopyButton.svelte'
  import Icon from './Icon.svelte'
  import { type PaintClassNames, classFor, keyFor } from './paint.js'
  import PaintTree from './PaintTree.svelte'
  import SeekBar from './SeekBar.svelte'
  import TranscriptView from './TranscriptView.svelte'

  type Props = Readonly<{
    node: UiNode
    onPress: (button: ButtonNode) => void
    onInput?: ((token: string, value: string) => void) | undefined
    onLink?: ((href: string) => boolean) | undefined
    classNames?: PaintClassNames
  }>

  const { node, onPress, onInput, onLink, classNames = {} }: Props = $props()

  let dockHeight = $state(0)

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
  {:else if node.image !== undefined && href === undefined}
    <div class={classFor(classNames, 'Text', 'fk-text')}>
      <img
        alt={node.content}
        class="fk-image"
        height={node.image.height}
        loading="lazy"
        src={node.image.src}
        width={node.image.width}
      />
    </div>
  {:else if node.image !== undefined && href !== undefined}
    <div class={classFor(classNames, 'Text', 'fk-text')}>
      <a
        class="fk-text-link"
        {href}
        onclick={event => {
          followLink(event, href)
        }}
        ><img
          alt={node.content}
          class="fk-image"
          height={node.image.height}
          loading="lazy"
          src={node.image.src}
          width={node.image.width}
        /></a
      >
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
    aria-current={node.isCurrent === true ? 'page' : undefined}
    aria-label={node.isIconOnly === true ? node.label : undefined}
    data-current={node.isCurrent === true ? true : undefined}
    data-icon-only={node.isIconOnly === true ? true : undefined}
    data-keys={node.keys?.join(' ')}
    data-variant={node.variant}
    disabled={node.disabled === true}
    onclick={() => {
      onPress(node)
    }}
    title={node.because}
    type="button"
  >
    {#if node.icon !== undefined}
      <Icon name={node.icon} />
    {/if}
    {#if node.isIconOnly !== true}
      {node.label}
    {/if}
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
{:else if node._tag === 'Box' && node.isDock === true}
  <div class="fk-dock-space" style:height={`${dockHeight.toString()}px`}></div>
  <div bind:clientHeight={dockHeight} class={classFor(classNames, 'Box', 'fk-dock')}>
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
{:else if node._tag === 'Progress'}
  <progress
    aria-label={node.label}
    class={classFor(classNames, 'Progress', 'fk-progress')}
    max={node.max}
    value={node.value}
  ></progress>
{:else if node._tag === 'List'}
  <ul aria-label={node.label} class={classFor(classNames, 'List', 'fk-list')}>
    {#each node.items as item (item.key)}
      {@const action = item.action}
      <li class="fk-item" data-current={item.isCurrent === true ? true : undefined}>
        {#snippet itemContent()}
          {#if item.image !== undefined}
            <img
              alt={item.image.alt}
              class="fk-item-image"
              height={item.image.height}
              loading="lazy"
              src={item.image.src}
              width={item.image.width}
            />
          {/if}
          <span class="fk-item-body">
            <span class="fk-item-title">{item.title}</span>
            {#each item.lines ?? [] as line, index (index)}
              <span class="fk-item-line">{line}</span>
            {/each}
            {#if item.progress !== undefined}
              <progress
                class="fk-progress"
                max={item.progress.max}
                value={item.progress.value}
              ></progress>
            {/if}
          </span>
        {/snippet}
        {#if item.href !== undefined}
          {@const href = item.href}
          <a
            class="fk-item-press"
            {href}
            onclick={event => {
              followLink(event, href)
            }}>{@render itemContent()}</a
          >
        {:else}
          <button
            class="fk-item-press"
            disabled={action === undefined}
            onclick={() => {
              if (action !== undefined) {
                onPress({ _tag: 'Button', label: item.title, action })
              }
            }}
            type="button"
          >
            {@render itemContent()}
          </button>
        {/if}
        {#each item.trailing ?? [] as child, index (keyFor(child, index))}
          <PaintTree {classNames} {onInput} {onLink} {onPress} node={child} />
        {/each}
      </li>
    {/each}
  </ul>
{:else if node._tag === 'Seek'}
  <SeekBar className={classFor(classNames, 'Seek', 'fk-seek')} {onPress} seek={node} />
{:else if node._tag === 'Transcript'}
  <TranscriptView
    className={classFor(classNames, 'Transcript', 'fk-transcript')}
    {onPress}
    transcript={node}
  />
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
