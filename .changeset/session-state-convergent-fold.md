---
'foldkit': minor
'@foldkit/opentui': patch
---

Add `Session.compose`, which keeps a session's mode as state every Processor folds from the log. `MirrorNavigation` and `KeepNavigationLocal` are Catalog Actions classified Domain, so choosing one on any device switches every device at the same log position, and `ProgramSynchronization.sessionPolicyOf` hands the folded policy to the runtime. `Runtime.start` now decides each Message's audience from the policy in force at that Message's log position, boots by folding the whole Message log instead of trusting the count row (which it still writes for older readers), stamps each row after every row it has seen so a device with a slow clock cannot reorder the log, refolds when a row arrives late before judging its audience, keeps writes queued behind a failed write in order, and runs a remote Message's Commands only on the Processor that sent it. `Runtime.start` takes an optional `clock` for tests. `@foldkit/opentui` keeps each action menu row on one line instead of wrapping it over its neighbors.
