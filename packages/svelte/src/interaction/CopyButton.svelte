<script lang="ts">
  import { Interaction } from 'foldkit'

  type Props = Readonly<{ text: string }>

  const { text }: Props = $props()

  const copiedResetMs = 1500

  let isCopied = $state(false)

  $effect(() => {
    if (!isCopied) {
      return undefined
    }
    const timer = setTimeout(() => {
      isCopied = false
    }, copiedResetMs)
    return () => {
      clearTimeout(timer)
    }
  })

  const copy = (): void => {
    void navigator.clipboard.writeText(text).then(() => {
      isCopied = true
    })
  }
</script>

<button class="fk-copy-button" onclick={copy} title={text} type="button">
  {Interaction.copyButtonLabelOf(isCopied)}
</button>
