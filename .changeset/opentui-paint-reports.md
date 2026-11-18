---
'@foldkit/opentui': minor
---

`runOpenTui` takes `onPainted`, which hears how long each frame took to build and why: `mount` for the first, `update` after a Model change, and `key` after a key, such as `{ painter: 'OpenTUI', durationMs: 3.4, phase: 'key' }`. Pass a telemetry attachment's `recordRendered` to keep every paint with the session.
