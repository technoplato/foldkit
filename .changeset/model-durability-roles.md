---
'foldkit': minor
---

Add `Program.model` and `Program.taggedModel` durability roles (`synced`, `local`, `loaded`, `ephemeral`) with memoized SchemaAST walkers, type-level Subscription write enforcement via `Subscription.forModel`, automatic `keepOnRefold` derivation, automatic snapshot stripping in `LocalSnapshot.encode` and `LocalSnapshot.encodeShared`, `LocalSnapshot.assertSnapshotByteInvariance`, and `ProgramSynchronization.foldSynced` support in `Runtime.start`.
