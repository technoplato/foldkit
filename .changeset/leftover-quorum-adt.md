---
'@foldkit/instant-tools': minor
---

Replace leftover quorum's boolean with Present | Missing.

Callers that read `hasQuorum` should match `_tag` instead: `Present` or `Missing`.
