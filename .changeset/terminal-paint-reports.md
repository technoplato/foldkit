---
'foldkit': minor
---

Terminal UIs now say how long each frame took to paint. `runProgramTui(bound, name, { onPainted })`, `makeProgramTerminalView`, and `programCliSurface` call `onPainted` after every frame with `{ painter: 'Terminal', durationMs, phase }`, where the phase says why it was painted: `mount` for a view's first frame, `update` after a Model change, `key` after a key, and `refresh` when a daemon's terminal view asks for its frame again. Pass a telemetry attachment's `recordRendered`, and `foldkit telemetry books-cli` shows terminal render durations beside update durations.
