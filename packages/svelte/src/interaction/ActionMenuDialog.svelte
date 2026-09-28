<script lang="ts">
  import { Array, Option } from 'effect'

  import type { ReactiveProgram } from './reactive.js'

  type Props = Readonly<{
    program: ReactiveProgram<unknown, never>
    class?: string
  }>

  const { program, class: className = 'fk-action-menu' }: Props = $props()

  const rowIdOf = (tag: string): string => `fk-action-menu-${tag}`

  const listId = 'fk-action-menu-list'

  const maybeMenu = $derived(program.menu)
</script>

{#if Option.isSome(maybeMenu)}
  {@const menu = maybeMenu.value}
  {@const maybeHighlighted = Array.findFirst(
    menu.rows,
    row => row.isHighlighted,
  )}
  <div class="fk-action-menu-layer">
    <button
      aria-label="Dismiss actions"
      class="fk-action-menu-backdrop"
      onclick={() => program.bound.dismissMenu()}
      type="button"
    ></button>
    <div
      aria-labelledby="fk-action-menu-title"
      aria-modal="true"
      class={className}
      data-style={menu.style._tag}
      role="dialog"
    >
      <h2 class="fk-action-menu-title" id="fk-action-menu-title">Actions</h2>
      <input
        aria-activedescendant={Option.isSome(maybeHighlighted)
          ? rowIdOf(maybeHighlighted.value.entry.tag)
          : undefined}
        aria-controls={listId}
        aria-expanded="true"
        aria-label="Filter actions"
        class="fk-action-menu-filter"
        oninput={event => program.bound.typeInMenu(event.currentTarget.value)}
        readonly={!menu.isFilterFocused}
        role="combobox"
        value={menu.query}
      />
      <ul class="fk-action-menu-rows" id={listId} role="listbox">
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
          >
            <span class="fk-action-menu-label">{row.entry.label}</span>
            <span class="fk-action-menu-what">{row.entry.what}</span>
            {#if row.entry.availability._tag === 'Disabled'}
              <span class="fk-action-menu-because"
                >{row.entry.availability.because}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if Array.isReadonlyArrayEmpty(menu.rows)}
        <p class="fk-action-menu-empty">No matching actions</p>
      {/if}
    </div>
  </div>
{/if}
