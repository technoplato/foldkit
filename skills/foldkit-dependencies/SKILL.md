---
name: foldkit-dependencies
description: Inject Foldkit effect capabilities with Effect Context services and Layers. Use when adding network, persistence, clock, randomness, file, platform, or native dependencies; choosing live, preview, test, or client-specific implementations; or removing global access from Commands and Subscriptions.
---

# Foldkit Dependencies

Describe external capabilities in the portable domain and select concrete
implementations at the client boundary. Foldkit uses Effect Context and Layer,
not `@tca/dependencies` or Swift property wrappers.

## Workflow

1. Define the smallest capability interface near the domain that needs it.
   Model it as `Context.Service` and give failures a typed tagged error.
2. Read the service inside a Command, Subscription, or ManagedResource Effect.
   Keep update pure and keep platform APIs out of Model.
3. Let the Effect requirement flow through `Command.Command`,
   `Program.Program`, or the application type. Do not erase it with casts.
4. Build live implementations with `Layer.succeed`, `Layer.effect`, or composed
   Layers. For scoped acquisition, pass `Effect.acquireRelease(...)` to
   `Layer.effect`. Let the runnable client provide the complete Layer to the
   runtime.
5. Use a different Layer for web, Node, React Native, tests, previews, or
   simulated clients while preserving the same Program protocol.
6. In tests, provide deterministic in-memory Layers. Assert emitted Commands
   before separately testing their Effects when both boundaries matter.
7. Scope acquired resources. Use ManagedResource when availability depends on
   Model and Commands need the acquired handle. Do not hide a long-lived handle
   in a service created outside the runtime scope.

## Boundaries

- Do not read environment variables, storage, network, time, randomness, or
  platform globals directly from update or view.
- Do not make a live Layer the implicit test default.
- Do not put a host's Layer construction in the renderer-free Program package.
- Keep secrets inside host configuration or Redacted values. Never serialize
  them in Model, replay tapes, routes, screenshots, or diagnostics.

## Source anchors

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/runtime/runtime.ts`
- `examples/fact/core/src/factClient.ts`
- `examples/fact/react/src/factReactClient.ts`
- `examples/counters/core/src/counterFactClient.ts`
- `examples/managed-resource-layer/src/main.ts`
- `examples/wallet/core/src/walletClient.ts`
