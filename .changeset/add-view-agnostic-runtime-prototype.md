---
'foldkit': minor
'@foldkit/vite-plugin': patch
---

Add a renderer-free host runtime for running Foldkit Models, Messages, Commands, and Subscriptions without requiring a Foldkit view. The runtime exposes Model observation and causal finite-operation completion while sharing one scoped Effect resources Layer.

Prebundle the Effect `Deferred` namespace used by the host runtime so development-mode consumers receive the complete optimized Effect dependency.
