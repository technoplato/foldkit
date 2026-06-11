---
'foldkit': minor
---

Add `catchAll` route parser for capturing all remaining path segments as a non-empty array. Catch-all parsers are terminal: `slash` cannot extend them, and `slash` now preserves terminality when its second parser is terminal. `query` can still follow a catch-all.

**Breaking (type-level):** because terminality now survives `slash` composition, chaining more path segments after a parser that embeds `query` no longer compiles. Declare `query` at the end of the route instead.
