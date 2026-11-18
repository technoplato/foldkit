<script lang="ts">
  import { Option } from 'effect'
  import {
    type ButtonNode,
    type TextInputNode,
    isClearedOnSubmit,
    isSubmittedOnLeave,
    submittedTagOf,
  } from 'foldkit/renderers'

  type Props = Readonly<{
    input: TextInputNode
    className: string
    onPress: (button: ButtonNode) => void
  }>

  const { input, className, onPress }: Props = $props()

  let draft = $derived(input.value)

  let lastSubmitted: string | undefined = undefined

  const submit = (): void => {
    if (lastSubmitted === draft) {
      return
    }
    const maybeTag = submittedTagOf(input, draft)
    if (Option.isSome(maybeTag)) {
      lastSubmitted = draft
      onPress({
        _tag: 'Button',
        label: input.label ?? input.placeholder ?? draft,
        action: maybeTag.value,
      })
    }
    if (isClearedOnSubmit(input)) {
      lastSubmitted = undefined
      draft = ''
    }
  }
</script>

<form
  class="fk-text-form"
  onsubmit={event => {
    event.preventDefault()
    submit()
  }}
>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    aria-label={input.label}
    autofocus={input.focused === true}
    class={className}
    enterkeyhint="done"
    onblur={() => {
      if (isSubmittedOnLeave(input)) {
        submit()
      }
    }}
    oninput={event => {
      lastSubmitted = undefined
      draft = event.currentTarget.value
    }}
    placeholder={input.placeholder}
    type="text"
    value={draft}
  />
</form>
