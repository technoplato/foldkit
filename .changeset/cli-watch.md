---
'foldkit': minor
---

`counters watch` repaints the screen every time it changes, on this device or any other, until Ctrl-C: `runProgramWatch(bound, write, { isTerminal })` clears a terminal between paints and skips a paint that did not change, and `parseProgramArgv(['watch'])` reads `{ _tag: 'Watch' }`. It paints the screen without the Action list (`paintScreen`). The Action list is shorter too: choices that share a reason share one line, `Unavailable for 6, 7, 8: count is already 0` instead of one line each.
