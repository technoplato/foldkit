<script lang="ts">
  import { Option } from 'effect'
  import { Interaction, Navigation } from 'foldkit'
  import type { ButtonNode } from 'foldkit/renderers'

  import type { PaintClassNames } from './paint.js'
  import PaintTree from './PaintTree.svelte'
  import type { ReactiveProgram } from './reactive.js'

  type Props = Readonly<{
    program: ReactiveProgram<unknown, never>
    classNames?: PaintClassNames
  }>

  const { program, classNames = {} }: Props = $props()

  const press = (button: ButtonNode): void => {
    if (button.action !== undefined) {
      program.bound.press(button.action)
    }
  }

  const followLink = (href: string): boolean =>
    typeof window !== 'undefined' &&
    Navigation.followLink(window, program.bound, href, 'ProgramOnly', 'Push')

  const stylesheet = `<style id="foldkit-screen">${Interaction.screenStylesheet}</style>`

  const maybeScreen = $derived(program.screen)
</script>

<svelte:head>
  {@html stylesheet}
</svelte:head>

{#if Option.isSome(maybeScreen)}
  <PaintTree
    {classNames}
    node={maybeScreen.value}
    onLink={followLink}
    onPress={press}
  />
{/if}
