---
name: foldkit-testing
description: Test Foldkit Models, Messages, updates, Commands, views, Stories, Scenes, routes, runtime replay, and injected Layers. Use when adding behavior, reproducing a bug, verifying accessibility or interactions, testing side effects deterministically, or choosing the narrowest Foldkit test surface.
---

# Foldkit Testing

Test at the smallest boundary that proves the behavior, then add a broader
flow only when the integration is part of the requirement.

## Choose the test level

- Test pure update directly for Model transitions, emitted Command identity,
  OutMessages, and exhaustive edge cases.
- Use `Story.story` for message-driven flows and Command substitution without a
  rendered interface.
- Use `Scene.scene` for accessible rendering, user interactions, Mounts,
  Command resolution, and OutMessages. Prefer role, label, and text locators.
- Run a Command Effect under a deterministic test Layer when the capability
  adapter itself needs verification.
- Use Program runtime tests for record and replay, restore, migrations, and the
  rule that historical Commands remain inert. Exercise Program Subscriptions,
  ManagedResources, and Ports when those capabilities are part of the contract.
- Use router law tests for parsing, printing, and canonicalization.
- Use real client or device evidence only for behavior that depends on that
  host. Keep build, simulator, browser, and physical evidence distinct.

## Workflow

1. Add or tighten the failing focused test first.
2. Construct Schema values with their constructors.
3. In Story or Scene, assert pending Command Definitions and resolve them with
   result Messages. Do not run live network or storage to advance the flow.
4. Cover success, typed failure, cancellation, stale results, and invalid
   Messages that the domain intentionally ignores.
5. Make time, randomness, files, network, and synchronization deterministic
   through test Layers.
6. Make the smallest implementation change, then refactor while the focused
   test remains green.
7. Run the owning package's test and typecheck commands. Expand to workspace
   gates in proportion to the change.

## Source anchors

- `packages/foldkit/src/test/public.ts`
- `packages/foldkit/src/test/story.ts`
- `packages/foldkit/src/test/scene.ts`
- `packages/foldkit/src/test/scene.test.ts`
- `examples/auth/src/scene.test.ts`
- `examples/weather/src/story.test.ts`
- `examples/fact/core/src/program.test.ts`
- `examples/message-versioning/src/messageVersioning.test.ts`
- `packages/foldkit/src/runtime/managedResourceLifecycle.test.ts`
- `packages/foldkit/src/port/runtime.test.ts`
- `packages/foldkit/src/runtime/programRuntime.test.ts`
