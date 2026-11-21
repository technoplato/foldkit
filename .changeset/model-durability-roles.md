---
'foldkit': minor
---

Add `Program.model` and `Program.taggedModel` durability roles (`synced`, `local`, `loaded`, `ephemeral`, including `S.optionalKey` fields) with memoized SchemaAST walkers, type-level Subscription write enforcement via `Subscription.forModel`, automatic `keepOnRefold` derivation, automatic snapshot stripping in `LocalSnapshot.encode` and `LocalSnapshot.encodeShared`, `LocalSnapshot.assertSnapshotByteInvariance`, `ProgramSynchronization.foldSynced` support in `Runtime.start`, `AppearanceState` durability roles, and child `stack.get` delegation in `composeNavigation`.
