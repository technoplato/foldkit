---
'@foldkit/instant': minor
'foldkit': minor
---

Add Schema-defined Processor identities, capabilities, Message provenance,
single-executor placement, and Command effect manifests. ProgramRuntime can
delegate manifested Commands to a shared scheduler without executing them
locally or admitting their result Messages before transport acceptance.

Add a transport-neutral Program Processor endpoint for long-lived headless
Hosts and attached Clients.

Add `@foldkit/instant` with composable InstantDB entities, durable Message
proposals and accepted occurrences, append-only projection checkpoints, effect
requests, an Effect-native Program store, an in-memory test store, and a
gap-buffering accepted-occurrence cursor.
