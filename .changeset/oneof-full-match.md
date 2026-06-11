---
'foldkit': minor
---

**Breaking:** `Route.oneOf` now requires a route to consume the entire path before it matches, instead of checking completion once after the first successful parse. A route no longer shadows a longer route that shares its prefix, so order only matters when several routes fully match the same URL.

Correctly ordered route sets behave identically. The only observable change: a URL that previously reached the fallback route even though a longer route fully matched it now resolves to that longer route. If you relied on listing a shorter route first to keep a longer sibling unreachable, remove the longer route instead.
