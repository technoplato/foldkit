---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/react-native': patch
---

`TranscriptFollow`, the rule for how a Transcript's view follows the voice, now lives in `foldkit/behavior` beside `Reader`, and names no timer. `foldkit/renderers` still exports it, so `import { TranscriptFollow } from 'foldkit/renderers'` keeps working. Two things change for a painter that calls `TranscriptFollow.start(ports)` itself. `Ports` has a sixth port, `wait: (afterMs, elapsed) => () => void`, which calls `elapsed` once after `afterMs` and answers with the way to call the wait off; on a page that is `(afterMs, elapsed) => { const timer = setTimeout(elapsed, afterMs); return () => clearTimeout(timer) }`. And `State` holds its two times as `Option`: `readerScrolledAtMs` and `ownScrollUntilMs` are now `maybeReaderScrolledAtMs` and `maybeOwnScrollUntilMs`, none until they happen in place of `Number.NEGATIVE_INFINITY`, so the State can be written as JSON. The HTML edge, `@foldkit/react` and `@foldkit/react-native` each fill the new port, and the last two now import the rule from `foldkit/behavior`. What a listener sees does not change.
