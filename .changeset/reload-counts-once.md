---
'foldkit': patch
---

A Processor that reloads from its local snapshot with nothing new on the log no longer counts the live feed's recent rows a second time. The fold keeps the snapshot's position as the last row applied, so on Instant two windows of the Counter stay on the same count instead of one reading 18 when the other reads 9.
