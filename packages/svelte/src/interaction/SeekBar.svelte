<script lang="ts">
  import type { ButtonNode, SeekNode } from 'foldkit/renderers'

  type Props = Readonly<{
    seek: SeekNode
    className: string
    onPress: (button: ButtonNode) => void
  }>

  const { seek, className, onPress }: Props = $props()

  let dragged: number | undefined = $state(undefined)

  const commit = (event: Event & { currentTarget: HTMLInputElement }): void => {
    dragged = undefined
    onPress({
      _tag: 'Button',
      label: seek.label,
      action: `${seek.action}:${event.currentTarget.value}`,
    })
  }
</script>

<input
  aria-label={seek.label}
  aria-valuetext={seek.valueText}
  class={className}
  disabled={seek.disabled === true}
  max={seek.max}
  min={seek.min ?? 0}
  onchange={commit}
  oninput={event => {
    dragged = Number(event.currentTarget.value)
  }}
  step={seek.step}
  type="range"
  value={dragged ?? seek.value}
/>
