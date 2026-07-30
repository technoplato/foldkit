---
name: foldkit-client-hosts
description: Adapt one renderer-free Foldkit Program to browser, React, React Native, terminal, TUI, CLI, server, or embedded clients. Use for portable Programs, host boundaries, runtime adapters, typed Ports, URI carriers, replay controllers, multi-client parity, or evidence matrices.
---

# Foldkit Client Hosts

Keep one canonical Program and make each runnable adapter a Client. A Client
owns presentation, input translation, platform Layers, URI carrier, and launch
behavior. It does not own a second copy of domain truth.

## Workflow

1. Extract or identify the Program's Model, Message, init, update, restore,
   Subscriptions, ManagedResources, Ports, version, and migrations.
2. Keep the Program free of renderer and platform imports. Define required
   capabilities as Effect services.
3. In each Client, provide the complete Layer, render the current Model, and
   translate input into canonical Messages.
4. Use `Runtime.makeFoldkitApplication` for a Foldkit DOM Client. Use the
   Program runtime surface for non-Foldkit renderers and process hosts. Follow
   an existing client in `examples/` instead of inventing a second store.
5. Use typed Ports for embedding and host communication. Keep the port protocol
   Schema-defined and dispose the embedded runtime with its host lifecycle.
6. Wrap portable relative state, replay, or intent routes in client-owned
   carriers. Do not teach Program about web origins, native schemes, or argv.
7. Apply recorded Messages with inert side-effect Layers. Resume live Commands
   only after branching from the selected settled frame.
8. Test shared Program behavior once, then test each adapter's mapping, Layer,
   carrier, lifecycle, and rendering seam. Capture evidence separately for each
   claimed Client.

## Evidence discipline

- Do not reuse one renderer's screenshot as proof of another.
- Do not call source inspection, build success, simulator output, and physical
  device behavior equivalent evidence.
- Record the exact Program state or replay frame and portable URI used for each
  capture.
- Use `$generate-client-matrix` when the requested output is a complete typed
  capability and evidence matrix.

## Source anchors

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/programRuntime/public.ts`
- `packages/foldkit/src/port/runtime.ts`
- `examples/counter/core/src/program.ts`
- `examples/counter/foldkit/src/entry.ts`
- `examples/fact/react/src/factReactClient.ts`
- `examples/embedding/src/`
- `examples/client-matrix/`
