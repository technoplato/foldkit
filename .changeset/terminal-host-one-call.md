---
'foldkit': minor
---

A Program becomes a command with one call. `terminal()` from the new `foldkit/cli/host` is the whole of a terminal host: `await terminal({ name: 'counter', entry: import.meta.url, processor: async () => ({ program: SyncedCounter, start: host => startCounter({ host, instance }) }) })`. It starts the host's own entry again as the Background Processor on the first command, so a command never imports the Program, and it owns `stop`, `watch`, `tail`, `tui`, `follow <topic>`, and every word the Program declares. The Background Processor stops by itself after ten minutes with no work the host's `keepsAlive(model)` names, no view attached, and no command (`foldkit/cli` exports the rule as `quietAfter` and `isGraceOver`). `stop` now travels over the socket, runs the host's `beforeStop` while the Program is alive, and answers before the process ends. A command from a rebuilt host replaces the older Processor, and a checkout elsewhere never takes it over.

The listener is safer for every host: it removes the socket, pid and lock only when they are its own (`removeOwnCliDaemonFiles`), the spawn lock names the process that was started (`holdCliDaemonLockFor`), a connection that never sends its request is dropped after five seconds, and `startCliDaemonServer` takes `onAnswered`.
