---
'@foldkit/vite-plugin': patch
---

Pre-bundle `effect/Scope` so dev mode does not crash on foldkit internals that reference `Scope.Scope` in Effect signatures.
