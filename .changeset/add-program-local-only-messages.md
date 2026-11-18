---
'foldkit': minor
---

Add `synchronization.isLocalOnly` to `Program.make`. A Message it returns true for is applied only by the Processor that sent it: sync never writes it to the shared log, so no other device folds it, and a refold keeps what it changed only through `keepOnRefold`. `Session.compose` and `ActionMenu.compose` pass it to the child for every Message they do not own. Books uses it to keep its Audible import, and the sign-in address a person pastes, on the device that sent it, such as `isLocalOnly: message => message._tag === 'ConnectAudible'`.
