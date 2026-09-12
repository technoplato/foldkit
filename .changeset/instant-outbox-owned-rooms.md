---
'foldkit': minor
'@foldkit/instant': minor
---

Retry failed Instant writes from a runtime outbox so a partition can heal
without minting a new Message id. Filter owned Instant rooms so a public
Processor does not fold `-mine-` rows, and select the count snapshot row
by optional countId.
