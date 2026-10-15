<script lang="ts">
  import { Option } from 'effect'
  import { Environment, Interaction, Navigation } from 'foldkit'
  import type { ButtonNode } from 'foldkit/renderers'

  import ActionMenuDialog from './ActionMenuDialog.svelte'
  import type { PaintClassNames } from './paint.js'
  import PaintTree from './PaintTree.svelte'
  import { presentedFocus } from './presentedFocus.js'
  import type { ReactiveProgram } from './reactive.js'
  import Screen from './Screen.svelte'

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

  const dismissOnBackdrop = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) {
      Navigation.backOneEntry(program.bound)
    }
  }

  const followLink = (href: string): boolean =>
    Option.exists(Environment.maybePage(), page =>
      Navigation.followLink(
        page.window,
        program.bound,
        href,
        'ProgramOnly',
        'Push',
      ),
    )

  const stylesheet = `<style id="foldkit-screen">${Interaction.screenStylesheet}</style>`

  const maybeFrame = $derived(program.frame)
</script>

<svelte:head>
  {@html stylesheet}
</svelte:head>

{#if Option.isSome(maybeFrame)}
  {@const frame = maybeFrame.value}
  {#if frame.base.view._tag === 'Screen'}
    <PaintTree
      {classNames}
      node={frame.base.view.node}
      onLink={followLink}
      onPress={press}
    />
  {/if}
  {#each frame.overlays as layer (layer.identity)}
    {#if layer.view._tag === 'Screen'}
      <!-- svelte-ignore a11y_interactive_supports_focus, a11y_click_events_have_key_events -->
      <div
        aria-modal="true"
        class="fk-overlay"
        data-key={layer.key}
        data-style={Navigation.styleTagOf(layer)}
        onclick={dismissOnBackdrop}
        role="dialog"
        use:presentedFocus
      >
        <PaintTree
          {classNames}
          node={layer.view.node}
          onLink={followLink}
          onPress={press}
        />
      </div>
    {/if}
  {/each}
  <ActionMenuDialog {program} />
{:else}
  <Screen {classNames} {program} />
  <ActionMenuDialog {program} />
{/if}
