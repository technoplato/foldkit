<script lang="ts">
  import type { Interaction } from 'foldkit'

  type Props = Readonly<{
    bound: Interaction.BoundInteraction<unknown, never>
    menu: Interaction.MenuView
  }>

  const { bound, menu }: Props = $props()

  const rowId = (tag: string): string => `fk-action-menu-${tag}`

  const highlighted = $derived(menu.rows.find(row => row.isHighlighted))
</script>

<div class="fk-action-menu-layer">
  <button
    aria-label="Dismiss actions"
    class="fk-action-menu-backdrop"
    onclick={() => bound.dismissMenu()}
    type="button"
  ></button>
  <div
    aria-labelledby="fk-action-menu-title"
    aria-modal="true"
    class="fk-action-menu"
    data-style={menu.style._tag}
    role="dialog"
  >
    <h2 class="fk-action-menu-title" id="fk-action-menu-title">Actions</h2>
    <input
      aria-activedescendant={highlighted === undefined
        ? undefined
        : rowId(highlighted.entry.tag)}
      aria-controls="fk-action-menu-list"
      aria-expanded="true"
      aria-label="Filter actions"
      class="fk-action-menu-filter"
      oninput={event => bound.typeInMenu(event.currentTarget.value)}
      readonly={!menu.isFilterFocused}
      role="combobox"
      value={menu.query}
    />
    <ul class="fk-action-menu-rows" id="fk-action-menu-list" role="listbox">
      {#each menu.rows as row (row.entry.tag)}
        <li
          aria-disabled={row.entry.availability._tag === 'Disabled'}
          aria-selected={row.isHighlighted}
          class="fk-action-menu-row"
          data-focused={row.isFocused}
          id={rowId(row.entry.tag)}
          onclick={() => bound.chooseFromMenu(row.entry.tag)}
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
    {#if menu.rows.length === 0}
      <p class="fk-action-menu-empty">No matching actions</p>
    {/if}
  </div>
</div>
