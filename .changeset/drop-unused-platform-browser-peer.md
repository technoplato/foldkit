---
'@foldkit/ui': patch
'@foldkit/devtools': patch
---

Drop the unused `@effect/platform-browser` peer dependency from `@foldkit/ui`
and `@foldkit/devtools`. Neither package imports it, and consumers still
receive it transitively through `foldkit`, which does use it.
