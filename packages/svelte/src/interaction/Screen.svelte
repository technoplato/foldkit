<script lang="ts">
  import { Option } from 'effect'
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

  const maybeScreen = $derived(program.screen)
</script>

{#if Option.isSome(maybeScreen)}
  <PaintTree {classNames} node={maybeScreen.value} onPress={press} />
{/if}
