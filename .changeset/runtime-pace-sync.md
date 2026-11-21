---
'foldkit': minor
---

Wire `Pace` (`Pace.Queue`, `Pace.arrived`, `Pace.due`) into `ProgramSynchronization.paceOf` and `Runtime.start` so `Pace.Synced`, `Pace.Settled`, `Pace.Sampled`, and `Pace.Device` execute live in the sync runtime while local Model updates stay immediate. Widen `ProgramSynchronization.paceOf` to return either a bare `Pace.Sync` (defaulting `part` and `key` to `message._tag`) or a `PacedMessage` (`{ part, key, sync }`) for per-Part coalescing, export `MessagePace`, `PacedMessage`, and `resolveMessagePace`, and preserve `paceOf` through `Session.compose`.
