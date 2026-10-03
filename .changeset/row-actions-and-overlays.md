---
'foldkit': minor
---

A Catalog can act on each row of a list. `Catalog.rowEntries(catalog, { id: '3', name: 'counter 3', model })` gives every Action of a row Catalog against that row's own Model, tagged `Increment:3` and titled `Increment counter 3`, so a Disabled Reset says why for that row alone. `Catalog.rowTagOf` and `Catalog.parseRowTag` build and read the tags, and `Catalog.commandOf('Increment:3')` is the CLI word `increment 3`. An `Entry` now carries its `title`, which the action menu shows and matches.

`Interaction.keyedEntryOf(entries, input)` finds the entry that owns a key, for a Program whose keys move with its Model, such as `+` on whichever counter's page is open. `Navigation.withoutDestinations(stack, isGone)` drops every page and modal that names something gone, keeping the root. The screen stylesheet now places a screen presented over the page by its style: a Dialog as a centered panel over a dimmed page, a Sheet at the bottom, a Drawer at the side.

`Navigation.screens` now types every screen it declares, not only the root, so a navigation with a pushed page and a Dialog accepts both in its stack.
