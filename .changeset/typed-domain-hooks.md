---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
---

Add domain-typed hooks to `@foldkit/react/interaction`: `useModel(program, select?)`, `useActions(program)`, and `useFeature(program, select?)`, typed from the Program, so `useActions(SyncedCounter).increment.press()` type-checks and a misspelled Action does not. `Program.make`, `ActionMenu.compose`, and `Program.compose.sync` now keep the exact Catalog type (`Catalog.CatalogOf<typeof program>`), and `BoundInteraction` carries its `programId` so the typed hooks refuse a provider bound to a different Program. Hooks and components keep references while values are structurally equal: a component that reads the count does not re-render when the menu moves, `useActions` keeps its object until an availability changes, and `Screen` repaints only when its tree changes. Breaking: `useModel` and `useActions` now take the Program, the untyped list is `useActionList()`, `useAction(tag)` is removed, `ActionButton` takes an `action` handle instead of a `tag`, and the new `useScreen()` reads the screen tree. `@foldkit/react-native/interaction` re-exports the new hooks and repaints its `Screen` only when the tree changes.
