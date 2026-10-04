---
'foldkit': minor
---

A synced Program can keep the state that never came from its log when sync refolds it: `synchronization.keepOnRefold(current, refolded)` returns the Model to use, such as the refolded one with the current library and playing position, and `Session.compose` and `ActionMenu.compose` forward it. A child's Subscriptions and ManagedResources under `compose.sync` now wait for Ready: while the Model is Starting or Failed they run nothing, so a Subscription's first result is never dropped before the child exists.
