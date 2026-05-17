---
'foldkit': minor
'@foldkit/vite-plugin': minor
'@foldkit/devtools-mcp': minor
---

Bump Effect to `4.0.0-beta.66` (from `4.0.0-beta.64`). Foldkit's peer dependencies now require `effect@4.0.0-beta.66` and `@effect/platform-browser@4.0.0-beta.66`.

beta.66 tightened `Effect.gen`'s `Yieldable` constraint, so an internal call site in `ManagedResource.tag` that yielded a raw `Option` now bridges through `Effect.fromOption`. Behavior is unchanged.

Consumers should align their Effect packages to `4.0.0-beta.66` exactly during the v4 beta window:

```bash
pnpm add effect@4.0.0-beta.66 @effect/platform-browser@4.0.0-beta.66
pnpm add -D @effect/vitest@4.0.0-beta.66
```
