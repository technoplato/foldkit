---
'@foldkit/instant': minor
'foldkit': patch
---

A row on the shared Instant project now keeps what it says about the Client that sent its Message: `client` (such as `tui` for a key a terminal UI sent through a Background Processor on `cli`), `browser`, `windowLabel`, `terminal` and `appVersion`, each optional. `counter tail` then says TUI for a key pressed in `counter tui`, where it said CLI. `InstantSnapshotLogSchema` adds the five optional attributes to `message` and `programMessage`. An engine keeps them only on `SharedInstantProject` (`clientFieldsKeptFor`); on any other app a row still holds the log's own fields only, since that app's schema may refuse a column it does not name. An email is never kept. `foldkit`'s tail prints `terminal` with the other Client details.
