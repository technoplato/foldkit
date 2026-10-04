<script lang="ts">
  import type { ButtonNode, TranscriptNode } from 'foldkit/renderers'

  type Props = Readonly<{
    transcript: TranscriptNode
    className: string
    onPress: (button: ButtonNode) => void
  }>

  const { transcript, className, onPress }: Props = $props()

  const userScrollQuietMs = 4000

  let root: HTMLElement | undefined = $state(undefined)
  let lastUserScrollAtMs = 0

  const currentToken = $derived(
    transcript.passages
      .flatMap(passage => passage.words)
      .find(word => word.isCurrent === true)?.token,
  )

  const press = (action: string, label: string): void => {
    onPress({ _tag: 'Button', label, action })
  }

  $effect(() => {
    const noteUserScroll = (): void => {
      lastUserScrollAtMs = Date.now()
    }
    window.addEventListener('wheel', noteUserScroll, { passive: true })
    window.addEventListener('touchmove', noteUserScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', noteUserScroll)
      window.removeEventListener('touchmove', noteUserScroll)
    }
  })

  $effect(() => {
    const token = currentToken
    if (
      root === undefined ||
      token === undefined ||
      Date.now() - lastUserScrollAtMs < userScrollQuietMs
    ) {
      return
    }
    const word = root.querySelector<HTMLElement>(
      `[data-token="${CSS.escape(token)}"]`,
    )
    if (word === null) {
      return
    }
    const isScrollArea = root.scrollHeight > root.clientHeight
    const view = isScrollArea
      ? root.getBoundingClientRect()
      : { top: 0, height: window.innerHeight }
    const bounds = word.getBoundingClientRect()
    const isNearMiddle =
      bounds.top > view.top + view.height * 0.25 &&
      bounds.bottom < view.top + view.height * 0.75
    if (isNearMiddle) {
      return
    } else if (isScrollArea) {
      root.scrollTo({
        top: root.scrollTop + (bounds.top - view.top) - root.clientHeight / 2,
        behavior: 'smooth',
      })
    } else {
      word.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  })
</script>

<section aria-label={transcript.label} bind:this={root} class={className}>
  {#if transcript.passages.length === 0}
    <p class="fk-transcript-empty">{transcript.emptyText}</p>
  {:else}
    {#each transcript.passages as passage (passage.key)}
      {@const labelAction = passage.labelAction}
      <article
        class="fk-passage"
        data-current={passage.isCurrent === true ? true : undefined}
      >
        {#if labelAction === undefined}
          <span class="fk-passage-label">{passage.label}</span>
        {:else}
          <button
            class="fk-passage-label"
            onclick={() => {
              press(labelAction, passage.label)
            }}
            type="button">{passage.label}</button
          >
        {/if}
        <p class="fk-passage-words">
          {#each passage.words as word (word.token)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span
              class="fk-word"
              data-current={word.isCurrent === true ? true : undefined}
              data-token={word.token}
              onclick={() => {
                press(`${transcript.action}:${word.token}`, word.text)
              }}>{`${word.text} `}</span
            >
          {/each}
        </p>
      </article>
    {/each}
  {/if}
</section>
