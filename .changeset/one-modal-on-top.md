---
'foldkit': minor
---

A `NavigationStack` is now `{ root, pages, maybeModal }`: the pages pushed on the root, then at most one modal over them. Two modals at once, or a page above a modal, have no value of the type. `pushed` puts a page beneath an open modal, so choosing `Session settings` while the menu is open gives `/counter/session/menu`, and presenting a second modal returns the stack unchanged. A URI ends at its first modal: `/counter/menu/session` parses to `/counter/menu`. `entriesOf(stack)` lists the pages as Push entries, then the modal. `ModalStyle`, `isModalStyle`, and `hasModal` are new. `NothingPresented` and `PresentingEntries` are removed; read `entriesOf(stack)` instead of `stack.presented`.

`Session.compose` keeps its child's interaction in charge of the child's Actions and adds its own after them, so a child whose buttons carry their row, such as `Increment:counter-2`, keeps those presses.
