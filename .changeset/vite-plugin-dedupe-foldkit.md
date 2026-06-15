---
'@foldkit/vite-plugin': patch
---

Dedupe `foldkit` and any installed `@foldkit/ui` / `@foldkit/devtools` to a
single resolved copy via `resolve.dedupe`. Without this, a bundler can load
`foldkit` more than once (its subpaths split across pre-bundled and source
copies, or `@foldkit/ui` resolving its own copy). A duplicate instance gives
foldkit's Schema and tagged-message constructors separate identities, so decode
and tag matching fail across the boundary. The optional packages are deduped
only when the consumer has installed them.
