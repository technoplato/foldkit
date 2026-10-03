<script lang="ts">
  import { Array, Option } from 'effect'
  import { Interaction } from 'foldkit'

  import type { ReactiveProgram } from './reactive.js'

  type Props = Readonly<{
    program: ReactiveProgram<unknown, never>
    class?: string
  }>

  const { program, class: className }: Props = $props()

  const panelClass = $derived(
    className === undefined ? 'fk-action-menu' : `fk-action-menu ${className}`,
  )

  const rowIdOf = (tag: string): string => `fk-action-menu-${tag}`

  const listId = 'fk-action-menu-list'

  const stylesheet = `<style id="foldkit-action-menu">${Interaction.menuStylesheet}</style>`

  const revealRow = (row: HTMLLIElement, isHighlighted: boolean) => {
    const reveal = (isRowHighlighted: boolean): void => {
      if (isRowHighlighted && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest' })
      }
    }
    reveal(isHighlighted)
    return { update: reveal }
  }

  const maybeMenu = $derived(program.menu)
</script>

<svelte:head>
  {@html stylesheet}
</svelte:head>

{#snippet matched(runs: ReadonlyArray<Interaction.TextRun>)}
  {#each runs as run, position (position)}
    {#if run.isMatch}
      <mark class="fk-action-menu-match">{run.text}</mark>
    {:else}
      {run.text}
    {/if}
  {/each}
{/snippet}

{#snippet keyCaps(keys: ReadonlyArray<string>)}
  {#each keys as key (key)}
    <kbd class="fk-action-menu-key">{key}</kbd>
  {/each}
{/snippet}

{#if Option.isSome(maybeMenu)}
  {@const menu = maybeMenu.value}
  {@const maybeHighlighted = Array.findFirst(
    menu.rows,
    row => row.isHighlighted,
  )}
  <div class="fk-action-menu-layer">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      aria-hidden="true"
      class="fk-action-menu-backdrop"
      onclick={() => program.bound.dismissMenu()}
    ></div>
    <div
      aria-labelledby="fk-action-menu-title"
      aria-modal="true"
      class={panelClass}
      data-style={menu.style._tag}
      role="dialog"
    >
      <h2 class="fk-action-menu-title" id="fk-action-menu-title">
        {menu.title}
      </h2>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        aria-activedescendant={Option.isSome(maybeHighlighted)
          ? rowIdOf(maybeHighlighted.value.entry.tag)
          : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded="true"
        aria-label={menu.filterLabel}
        autocomplete="off"
        autofocus
        class="fk-action-menu-filter"
        oninput={event => program.bound.typeInMenu(event.currentTarget.value)}
        placeholder={menu.filterLabel}
        readonly={!menu.isFilterFocused}
        role="combobox"
        spellcheck={false}
        value={menu.query}
      />
      <ul
        aria-label={menu.title}
        class="fk-action-menu-rows"
        id={listId}
        role="listbox"
      >
        {#each menu.rows as row (row.entry.tag)}
          <li
            aria-disabled={row.entry.availability._tag === 'Disabled'}
            aria-selected={row.isHighlighted}
            class="fk-action-menu-row"
            data-focused={row.isFocused}
            id={rowIdOf(row.entry.tag)}
            onclick={() => program.bound.chooseFromMenu(row.entry.tag)}
            onkeydown={() => undefined}
            role="option"
            use:revealRow={row.isHighlighted}
          >
            <span class="fk-action-menu-text">
              <span class="fk-action-menu-label"
                >{@render matched(row.title)}</span
              >
              <span class="fk-action-menu-what"
                >{@render matched(row.description)}</span
              >
              {#if row.entry.availability._tag === 'Disabled'}
                <span class="fk-action-menu-because"
                  >{row.entry.availability.because}</span
                >
              {/if}
            </span>
            {#if Array.isReadonlyArrayNonEmpty(row.keys)}
              <span aria-hidden="true" class="fk-action-menu-keys"
                >{@render keyCaps(row.keys)}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if Array.isReadonlyArrayEmpty(menu.rows)}
        <p class="fk-action-menu-empty">{menu.summary}</p>
      {/if}
      <p aria-live="polite" class="fk-action-menu-status" role="status">
        {menu.summary}
      </p>
      <p aria-hidden="true" class="fk-action-menu-footer">
        {#each menu.hints as hint (hint.does)}
          <span class="fk-action-menu-hint"
            >{@render keyCaps(hint.keys)}{hint.does}</span
          >
        {/each}
      </p>
    </div>
  </div>
{/if}
