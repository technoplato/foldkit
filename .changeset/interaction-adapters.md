---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/instant': minor
---

Add `Runtime.startHandle`, which starts a synced Program as a handle any Client can read, watch, and send to, and `Interaction.bind`, which joins a Program's interaction to that handle so a host calls `press`, `pressKey`, or `chooseFromMenu` without knowing its Messages. Buttons in a screen tree carry their Catalog `action` and a `because` sentence, and `actionButtons` builds them from Catalog entries. Add `@foldkit/react/interaction` with `ProgramProvider`, `useModel`, `useActions`, `ActionButton`, `ActionMenuDialog`, `Screen`, and `useKeyBindings`, generic over any bound Program. Add `snapshotLogMessageWire`, a fail-closed Instant Message wire for any Message Schema that keeps payload-free tags bare.
