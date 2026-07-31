---
'@foldkit/instant': patch
---

Drain accepted Message application before replacing a shared Program transport,
keep lifecycle waiters Scope-safe, and prevent stale persistence failures from
overwriting a completed disconnect.
