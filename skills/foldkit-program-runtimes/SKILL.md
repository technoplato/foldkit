---
name: foldkit-program-runtimes
description:
  Run one portable Foldkit Program as any number of independent live or replay
  runtimes. Use for runtime identity, lifecycle, simultaneous instances,
  per-runtime Model and tape ownership, shutdown, runtime isolation, explicit
  cross-runtime coordination, or multi-instance tests.
---

# Foldkit Program Runtimes

A Program is a reusable definition. A Program runtime is one execution of that
definition. Do not treat a Program as a singleton. The same Program can back as
many simultaneous runtimes as the product needs.

Call one running Program occurrence a Processor. Processor is the architectural
role; ProgramRuntime is the Foldkit runtime API that realizes it. A Processor
consumes Messages and advertises the capabilities supplied by its Layers. One
Client may own several Processors on the same machine, and a headless Client may
keep Processors alive without presenting a live interface.

## Keep the identities distinct

- `Program.id` identifies the portable Program protocol and replay
  compatibility. It is not a runtime-instance identifier.
- Give each Processor a host-owned identity when the host needs to
  address, display, supervise, or collect evidence for instances separately.
  Keep that key outside the Program Model unless runtime identity is itself
  product truth.
- Do not use Subscription or ManagedResource diagnostic `instanceId` values as a
  runtime identity. They identify lifecycle instances inside one runtime.
- Record host lifecycle evidence with `runtime.timeline.record` when it belongs
  in the tape without becoming a domain Message.

## What one runtime owns

Each `Runtime.makeProgramRuntime` call creates an independent execution with its
own:

- current Model and Message queue;
- finite Command operations and interrupt registry;
- journal, replay tape, replay routes, and host-event timeline;
- Model, journal, diagnostic, failure, and Port publishers and listeners;
- typed Port channels and handles;
- built Resources Layer and runtime Scope;
- Subscription and ManagedResource instances and their acquired handles;
- initialization result, failures, diagnostics, and shutdown state.

Calling `makeProgramRuntime` twice with the same Program does not couple those
values. Sending a Message to one runtime changes only that runtime unless an
explicit shared capability carries the result elsewhere.

## Launch multiple runtimes

1. Define the renderer-free behavior once with `Program.make`.
2. Call `Runtime.makeProgramRuntime({ program, resources, start })` once for
   each desired instance. Use `Runtime.fresh()`, `Runtime.fromModel(model)`, or
   `Runtime.fromReplay(tape)` for that instance's starting point.
3. Keep each returned `ProgramRuntime` under a Processor key. Route input to
   that handle's `send` or `run`, render its `readModel()` value, and subscribe
   with `observeModel` when the host needs push updates.
4. Let every Client translate native input into canonical Messages and render
   canonical Model. Provide platform Layers at the Client boundary. Do not
   create host-local copies of domain state.
5. Keep each runtime's `journal`, `replay`, `timeline`, diagnostics, failures,
   and evidence attached to the same host-owned key.

Use `Runtime.makeProgramRuntime`, not the deprecated `Runtime.makeHostRuntime`,
for new Clients. React Providers, process hosts, embedded elements, and other
adapters may package lifecycle differently, but they must preserve the same
one-runtime-per-instance ownership boundary.

## Replay and branches

- `runtime.replay.readTape()` derives a tape from that runtime's journal. A tape
  is not a global log for every runtime using the Program.
- `runtime.replay.makeSession()` and `Runtime.makeReplaySession` inspect history
  inertly. Historical Commands do not run.
- `ReplaySession.branch()` can branch only from a settled causal frame.
- `Runtime.fromReplay(tape)` starts one new live runtime with newly supplied
  Resources. Starting two runtimes from the same tape creates two independent
  live branches.
- `Runtime.makeReplayController` owns either one inert inspection session or one
  live runtime and exposes `shutdown`. Do not hide a second live runtime behind
  one controller.

## Coordinate runtimes explicitly

Independent runtimes do not share Model merely because they share a Program.
When instances must interact, choose an explicit boundary:

- an Effect service backed by shared persistence, Instant, a database, a process
  hub, or another transport;
- Commands that write through that service and Subscriptions that observe
  changes;
- typed Ports for an embedding host protocol;
- portable state or replay persistence for stop-and-resume handoff;
- a dedicated coordinator Program when coordination is product behavior with its
  own Model and Messages.

Specify Processor identity, Message ordering, conflicts, retries, offline
behavior, capability advertisement, and effect ownership in that protocol. Do
not synchronize by reading another runtime's Model, mutating module globals,
passing runtime handles through Model, or duplicating domain state inside a
renderer.

If several runtimes intentionally share one physical resource, make that sharing
visible in a parent-owned service or transport and define its lifetime. Merely
passing the same Layer description to several runtimes is not a cross-runtime
state contract. Each runtime builds its Resources Layer in its own Scope.

## Shut down every instance

- Run runtimes inside `Effect.scoped` so parent-scope exit is a final safety
  net.
- Call `runtime.shutdown` when the owning host instance ends. It is idempotent
  and stops new work, interrupts active Commands, stops Subscriptions, releases
  ManagedResources and the Resources Layer, closes Port channels, and clears
  runtime listeners.
- Call every function returned by `observeModel`, `journal.observe`,
  `timeline.observe`, `observeDiagnostics`, `observeFailures`, and outbound Port
  `subscribe` when the host no longer needs it.
- Use `ReplayController.shutdown` for a replay-capable Client and
  `EmbedHandle.dispose` for an embedded Foldkit element.
- Do not keep sending Messages through a shut-down handle or transfer its
  resource-owned objects to another runtime.

## Test isolation and sharing

For multi-runtime behavior, add a focused test that:

1. starts two runtimes from the same Program in one test Scope;
2. gives them distinct host identities and deterministic Layers;
3. sends different Messages and proves their Models, journals, tapes, Ports, and
   diagnostics remain independent;
4. shuts down one runtime and proves the other keeps running;
5. verifies acquisition and release counts for each runtime;
6. when sharing is intentional, proves synchronization occurs only through the
   declared service, Subscription, Port, persistence, or transport;
7. shuts down all runtimes and verifies no Subscription, ManagedResource, Port
   listener, or acquired resource remains live.

Report evidence per runtime: host identity, start mode, supplied Layer, final
Model, journal/tape frame, diagnostics or failures, and shutdown/release result.
A source audit or sequential client matrix does not prove simultaneous runtime
isolation.

## Source anchors

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/programRuntime/public.ts`
- `packages/foldkit/src/runtime/programRuntime.ts`
- `packages/foldkit/src/runtime/programRuntime.test.ts`
- `packages/foldkit/src/runtime/replaySession.ts`
- `packages/foldkit/src/runtime/replayController.ts`
- `packages/foldkit/src/port/runtime.ts`
- `packages/foldkit/src/runtime/managedResourceLifecycle.test.ts`
- `examples/counter/core/src/program.ts`
- `examples/counter/cli/src/host.ts`
- `examples/counter/tui/src/host.ts`
- `examples/counter/react-bindings/src/counter.tsx`
- `examples/counter-with-shared-state/src/`
