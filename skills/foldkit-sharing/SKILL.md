---
name: foldkit-sharing
description: Persist, observe, synchronize, restore, and share Foldkit Model state across runtimes or clients through explicit Effect services, Commands, Subscriptions, and portable Programs. Use for local storage, files, Instant or remote sync, cross-client state, startup restoration, or replayable persistence behavior.
---

# Foldkit Sharing

Keep shared state explicit in Model and make persistence or synchronization an
injected capability. Foldkit does not provide Point-Free `@Shared`; do not copy
that API name or its semantics into Foldkit guidance.

## Workflow

1. Define the durable value with Effect Schema separately from transient UI
   state. Decide which fields may be encoded, synchronized, routed, or replayed.
2. Define a backend-independent Context service with load, save, and optional
   change-stream operations. Give each failure a typed error.
3. Load through init or restore Commands. Save through Commands emitted after a
   factual Message. Convert every result into a success or failure Message.
4. Observe remote or file changes through a Subscription whose dependencies are
   derived from Model. Fold incoming values into Model only through update.
5. Inject storage and synchronization Layers from each client. Reuse one
   renderer-free Program across browser, Node, terminal, native, or test hosts.
6. Specify conflict, identity, ordering, retry, and offline behavior in the
   domain protocol. Do not let last-write-wins emerge accidentally from a view
   callback.
7. Use Program restore when a decoded Model must resume pending work. Use
   Program migrations when durable or replayed encodings change.
8. Test cold start, absent data, save failure, observed external change,
   duplicate or stale change, restart, and deterministic test Layers.

## Boundaries

- Keep storage handles, sockets, and subscriptions out of Model.
- Keep media, secrets, and unbounded blobs out of portable URIs and replay
  tapes unless the contract explicitly and safely supports them.
- Do not let a client fork the domain state shape. Client-only presentation
  state may remain in the client, but shared product truth belongs to Program.
- Label source inspection and synthetic Layers separately from verified live
  synchronization evidence.

## Source anchors

- `examples/counter-with-shared-state/src/counter.ts`
- `examples/counter-with-shared-state/src/counterStorage.ts`
- `examples/counter-with-shared-state/src/counter.test.ts`
- `examples/todo/src/main.ts`
- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/subscription/subscription.ts`
