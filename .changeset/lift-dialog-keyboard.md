---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
---

`Catalog.lift(child, { field, Id, token, prompt, rowsOf, nothingToChoose })` reuses a child Catalog for each row of a list: every child Action becomes one choosing Action with the same tag and words plus the row id (`Increment({ counterId: 2 })`), and `childOf(message)` hands back the row id and the child Message for the child's `update`. A screen presented over the page, such as "Delete Counter 3?", keeps the keyboard: React and Svelte focus its first button, and `Interaction.presentedFocusMoveOf` steps Tab and the arrows through its buttons. Buttons in an overlay show their keys. The CLI refuses a bare choosing command with the full command to try (`decrement <counter-id> needs one of: 1, 2. Try: counters decrement 1`), and `open` goes to the URI command only for a path (`counters open /counters/2`), so an Action named Open still runs (`counters open 2`).
