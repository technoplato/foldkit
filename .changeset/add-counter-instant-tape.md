---
'@foldkit/instant': minor
---

Add a same-actor Instant Program tape in `foldkit/instant/sharing`.
The host writes each Message before update and after update. Instant
holds the proposal and accepted-occurrence rows. Offline file storage
is the Instant outbox, not a second database.
