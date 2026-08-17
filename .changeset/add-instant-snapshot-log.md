---
'@foldkit/instant': minor
---

Add a generic Instant count snapshot plus Message log. Startup
reads the count row. Live Processors apply Messages from other
Processors. One transaction updates count and upserts the Message.
