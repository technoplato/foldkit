---
'foldkit': minor
---

Add `Telemetry`, a record of what a running Program does, one NDJSON line per event: each transition with its Message, source, Commands, diff size, and update duration; each Command's span from `CommandStarted` to `CommandFinished` with its args, duration, and `Success`, `Failure`, or `Interrupted`; Subscription and ManagedResource diagnostics; crashes; paints a renderer reports; and the session's start and stop.

`Telemetry.attach(handle, { app, sink })` records any handle from `Runtime.startHandle`, in React, Svelte, the CLI, the TUI, OpenTUI, or a CLI daemon. `Telemetry.observer` does the same for a runtime you start yourself. Sinks are scoped Layers: `Telemetry.browserSink()` posts batches to a development server, and `fileSink()` from `foldkit/telemetry/node` appends to `~/Library/Logs/foldkit/telemetry/<app>-<host>.ndjson`, rotating at 10 MB, keeping three rotated files, and keeping the whole directory under 200 MB. Message payloads are recorded with secret-looking keys redacted at any depth, whole Models only with `withModels`, and the file sink scrubs environment values out of every line. `foldkit telemetry <file> --since 30m` prints the top Messages and Actions, the slowest Commands, Command failures, update and render durations, transitions per minute, and Subscription restarts.

To support it, the Program runtime now exposes `programId`, `programVersion`, and `installCommandTracer`, accepts `observers` that connect before it boots, and records `updateDurationMs` on every live transition. `Runtime.startHandle` returns `observeRuntime` and starts its runtime on the next microtask, so an observer connected on the line after it sees the Program boot.
