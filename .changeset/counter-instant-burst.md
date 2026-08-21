---
'@foldkit/instant': patch
---

Replay Instant subscribe as new Messages only. A burst of writes no
longer re-enqueues the whole log on every snapshot. Browser Instant()
reuses one core client per app id so Vite HMR does not stack websocket
close listeners.
