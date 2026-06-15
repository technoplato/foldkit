---
'foldkit': patch
---

The render dispatch stack is a plain module-level singleton again, not keyed on a
`globalThis` symbol. Keying it globally let two foldkit instances (a bundler
loading `foldkit` and `@foldkit/ui` as separate copies) share one stack, hiding a
duplication that still broke Schema and tag identity. That duplication now
surfaces as a clear "runtime-driven render" or "dispatchAcrossBoundary missing
wrap" error naming the cause, instead of being silently absorbed. Prevent it with
`@foldkit/vite-plugin` (dev) and inlined foldkit packages in Vitest.
