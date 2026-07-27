# ADR 0002 | Universal Program Replay

Date: 2026-07-26

Status: Accepted

## Context

Replay is a property of Program execution. It should not have to be rebuilt by a
Foldkit view, React adapter, terminal client, DevTools integration, or application
Workbench. A Program already supplies the facts needed to derive replay semantics:
its identity and version, Model and Message Schemas, init, restore, update, Commands,
Subscriptions, ManagedResources, and migrations.

A registry is therefore not required to make one Program replayable. Registration is
only needed at a composition boundary that must select one of several Programs, such as
a destination router or a gallery. The selected Program still receives the same
engine-owned replay behavior.

## Decision

Every `ProgramRuntime` exposes two engine-owned capabilities:

- `journal` publishes every processed Message transition with source, causal operation,
  settlement, returned Command metadata, timestamp, diff, and resulting Model.
- `replay` derives inert inspection, inspection sessions, typed tapes, exports, state
  routes, replay routes, and the Program parser-printer from the Program and journal.

Historical reconstruction applies recorded Messages to update and discards the
Commands returned by those historical updates. A live branch may start only at a
settled frame. New Messages sent after the branch execute Commands through the real
injected Resources Layer and append their result Messages to the new journal.

The journal publishes every transition independently of retention. Its synchronous
archive is configurable. Foldkit supplies a retain-all in-memory archive by default and
a bounded in-memory archive that prunes only at settled operation boundaries. A custom
archive can be injected without changing Program logic or host adapters.

Persistence, content-addressed sharing, and replay presentation consume these runtime
capabilities as adapters. They are not part of Program update and do not become a second
source of truth.

## Evaluation Rubric

The decision is evaluated in six dimensions. A result is 3/3 only when every dimension
scores 3. Averaging cannot hide a failure in replay correctness or Elm Architecture.

| Dimension                  | 1                                                                      | 2                                                                                          | 3                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universality               | Replay is implemented by selected examples or clients.                 | A shared helper exists, but callers opt in or repeat wiring.                               | Every `ProgramRuntime` publishes a journal and exposes replay without a domain registry or host-specific setup.                                                                                                       |
| Semantic correctness       | Replay reruns historical Commands or mutates the Model outside update. | Inspection is inert, but branching, settlement, or Command-result causality is incomplete. | Historical Commands are always inert, recorded result Messages reconstruct outcomes, and a settled live branch executes each new effect exactly once.                                                                 |
| Separation of concerns     | Runtime, storage, URI carrier, and UI policy are interleaved.          | Tape and UI are separated, but retention or persistence is hard-coded.                     | The engine owns journal and replay semantics. Retention, persistence, sharing, carriers, and UI are replaceable adapters with explicit boundaries.                                                                    |
| Portability and integrity  | History uses untyped action names or host data.                        | Messages are typed, but routes, versions, or migrations are incomplete.                    | Model and Message Schemas produce versioned tapes and canonical relative parser-printers. Saved tapes are integrity checked before replay.                                                                            |
| Client parity              | One renderer is the source of replay truth.                            | Several clients share data but implement replay behavior separately.                       | Foldkit, React, CLI, and TUI consume the same Program, tape, routes, inert inspection, and live-branch rules. Hosts only render and map native input.                                                                 |
| Lifecycle and verification | Replay has no scoped shutdown, causal tests, or conformance proof.     | Focused tests exist for the happy path only.                                               | Scoped Resources, Commands, Subscriptions, and shutdown remain correct. Tests cover universal availability, retention independence, inert historical effects, one-time live effects, routes, and all client surfaces. |

## What 3/3 Looks Like

A new Program becomes replayable by calling `Program.make` and running it through
`makeProgramRuntime`. The implementer does not define action identifiers, a replay
reducer, a tape codec, an inspection store, or a replay registration entry.

For a running Program:

1. `runtime.journal.observe` sees every transition in processing order, even when the
   configured archive later prunes it.
2. `runtime.journal.read` returns the coherent retained replay horizon, including the
   Model at the retention boundary.
3. `runtime.replay.inspect(frame)` and `runtime.replay.makeSession(frame)` reconstruct
   Models only by applying recorded Messages to update. They execute no historical
   Commands and acquire no application Resources.
4. `runtime.replay.readTape`, `exportTape`, `stateRoute`, `replayRoute`, and `router`
   provide the same typed portable value to every client.
5. A controller can branch only from a settled frame. The branched `ProgramRuntime`
   uses the normal Resources Layer, runs newly returned Commands once, records their
   result Messages, and preserves causal completion.
6. The default archive retains the complete journal. A bounded archive may rebase the
   replay horizon only after a settled transition, so it never fabricates or truncates
   an in-flight operation.
7. `ReplayTapeStore`, HTTP or local persistence, content-addressed UUID routes, absolute
   URL carriers, autoplay, scrubbers, buttons, and labels are consumers of the engine
   API. None are required to make a Program replayable.
8. A multi-Program application registers only the alternatives needed for exhaustive
   route or presentation selection. Registration does not create replay semantics and
   cannot change them.

## Consequences

Always publishing the transition journal adds work to every processed Message. Archive
selection controls retained memory, while an application can attach asynchronous
persistence or telemetry through journal observation. The runtime keeps synchronous
transition publication so `run` completion, immediate tape reads, and DevTools ordering
remain deterministic.

Bounded retention changes the beginning of the available replay horizon. Its retained
initial Model becomes the settled Model immediately before the retained suffix, and its
initial Commands become empty. Consumers can inspect `retainedFromSequence` when they
need to explain that earlier transitions are no longer available.

Replay tapes can contain sensitive application facts. Exporting, persisting, or sharing
a tape remains an explicit adapter action rather than an automatic runtime side effect.

## Outcome Assessment | 2026-07-26 09:11:35 EDT

| Dimension                  | Score | Evidence                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universality               |     3 | `ProgramRuntime` always exposes `journal` and `replay`. The runtime conformance test creates an ordinary Program with no replay registration and uses journal observation, the transition Stream, inert inspection, a replay session, a state route, and a replay route.                                                                        |
| Semantic correctness       |     3 | Runtime tests record a recursive side-effecting Command chain, inspect its frames, and prove the effect count does not increase. Replay controller tests then branch at a settled frame and prove each newly returned Command executes once.                                                                                                    |
| Separation of concerns     |     3 | Journal publication is intrinsic. `ProgramJournalArchiveFactory` controls synchronous retention. `retainAllTransitions` is the default and `retainLatestTransitions` provides a settled-boundary bounded implementation. `ReplayTapeStore`, route carriers, the Workbench, and rendered controls remain separate consumers.                     |
| Portability and integrity  |     3 | Program route, replay tape, migration, saved-route, SHA-256-derived identity, and store integrity tests pass against Schema-backed Model and Message values. The engine continues to own the canonical relative parser-printer.                                                                                                                 |
| Client parity              |     3 | The shared replayability core and React bindings pass their tests. The one-shot CLI and interactive TUI process tests pass. Both React and Foldkit production clients build from the same Program, Workbench, routes, and tapes.                                                                                                                |
| Lifecycle and verification |     3 | The complete Foldkit package suite passes 1,634 tests with 2 intentional skips. Focused tests cover Resources, Subscriptions, ManagedResources, Ports, causal completion, shutdown, DevTools projection, bounded retention, inert inspection, and live branching. Type checking, lint, dead-code analysis, formatting, and package builds pass. |

The result is 18/18 and passes the stricter 3/3 gate because every dimension scores 3.
No average or compensating score is used.

## Client Boundary Assessment | 2026-07-26 15:53:12 EDT

The cross-client proof separates three responsibilities.

Foldkit owns the behavior that must remain identical in every client:

- Program execution, observation, causal operation completion, and scoped shutdown.
- Transition journaling, typed replay tapes, inert frame reconstruction, and settled
  live branching.
- Schema-backed parsing and printing of canonical relative state, embedded replay, and
  saved replay routes.
- Replay identity, version, causal-boundary, and content-address validation.

Application core owns the behavior that cannot be inferred from a Message Schema:

- Which Messages are valid host inputs rather than Command-result facts.
- Which actions are valid for the current Model.
- Domain action identifiers and the typed construction of payload-bearing Messages.
- Labels, roles, and other presentation facts shared intentionally across clients.
- Selection among several Programs in one application and any application-specific
  replay storage protocol.

A client adapter owns only its medium and platform concerns:

- Rendering and observation through the client's native scheduling contract.
- Mapping clicks, keys, terminal input, agent requests, or native gestures to the
  application's explicit host-sendable actions.
- Adding a scheme and authority around the canonical relative route and integrating
  platform launch behavior.
- Providing concrete Layers for capabilities whose implementations differ on that
  platform.

React and React Native can consume the same external-store binding because it depends
only on React lifecycle, context, and observation APIs. A public React adapter must not
depend on React DOM or native rendering packages. It also must not expose the current
prototype's synchronous Layer acquisition or fire-and-forget shutdown. Publication is
deferred until scoped Effect acquisition, cancellation, teardown ordering, startup
failure policy, Strict Mode, server fallback, and React Native behavior are tested.

Portable consumers must import Program and renderer-independent Runtime APIs from
dedicated Foldkit subpaths. Successful tree shaking of the root barrel is not proof of
platform independence because that barrel also exports the Foldkit view runtime and
browser integrations.

Replay presentation, typed action manifests, the multi-Program Workbench, absolute URL
carriers, and the example HTTP tape store remain application or platform code. A future
Program composition helper may remove repetitive exhaustive selection, but it must not
be required to make one Program replayable and must not attempt to derive host actions
from the Message Schema.

The verification commands were:

```text
pnpm --filter foldkit build
pnpm --filter foldkit typecheck
pnpm --filter foldkit exec vitest run
pnpm --filter fact-core-example test
pnpm --filter replayability-core-example test
pnpm --filter shared-react-bindings-example test
pnpm --filter replayability-react-bindings-example typecheck
pnpm --filter replayability-cli-example test
pnpm --filter replayability-tui-example test
pnpm --filter replayability-example exec vite build
pnpm --filter replayability-foldkit-example exec vite build
pnpm lint
pnpm check:dead-code
pnpm exec prettier --check <changed files>
git diff --check
```

## React Lifecycle Prototype | 2026-07-27 11:14:49 EDT

The shared React binding now proves the lifecycle boundary that was previously
deferred. `makeProgramRuntime` acquires the complete Resources Layer during startup and
preserves the Layer's typed error channel. A React Provider can therefore report a
stable `Idle`, `Starting`, `Ready`, `Failed`, `Stopping`, or `Stopped` snapshot without
guessing whether its dependencies exist.

The Provider owns asynchronous startup through a cancellable Effect fiber. A real
unmount interrupts pending acquisition. React Strict Mode's immediate cleanup and
second setup share one Provider controller, so the development probe does not create a
second Program or a second resource owner. Shutdown calls `runtime.shutdown` before
closing the Provider scope. The runtime scope interrupts finite Commands and persistent
Subscriptions before the earlier Resources Layer finalizers run. Server rendering
reads an `Idle` fallback snapshot and starts no Effects.

`initialRoute` is the typed startup instruction accepted by the new client builder. It
resolves to `Fresh`, `Model`, or settled `Replay` startup before the Provider begins. It
is not live navigation, a Resources Layer selection, or a prop that replaces the Model
after startup.

The Fact proof adds one typed dependency choice at the platform composition boundary.
The declaration names `Mock` and `Live` ordinary Effect Layers. React reads only the
choice lifecycle and a stable `switchTo` function. The Fact screen still sends
`ClickedLoadFact`, update still returns `FetchFact`, and the Command still requests the
abstract `FactClient` service. A switch waits for the current causal `runtime.run`
operation, acquires the replacement in a new scope, releases the preceding scope, and
keeps the same Model and journal. Failed acquisition retains the preceding
implementation when it remains usable.

The following behavior belongs in a future public Foldkit React adapter rather than in
application implementations:

- Cancellable scoped Provider startup and ordered shutdown.
- Stable lifecycle snapshots, callbacks, fallback rendering, and server snapshots.
- Strict Mode ownership and stable domain action identity.
- Causal-operation tracking before dependency replacement.
- Typed implementation names, acquisition failures, scope replacement, and dependency
  lifecycle observation.
- Replay rules that keep historical Commands inert when a live dependency exists.

Application and platform composition roots remain responsible for:

- Declaring the finite implementation names and their concrete Effect Layers.
- Providing platform services required by those Layers.
- Choosing the initial implementation and rendering lifecycle information.
- Mapping native interaction to the explicit host-sendable domain actions.

The current dependency-choice proof intentionally supports one switchable service per
client. It should not be published as a parallel dependency container. Before a public
package, it must generalize to a typed tuple of choices, migrate the replay-controller
binding off synchronous acquisition, prove React Native lifecycle parity, and decide
whether the generic service forwarding implementation should remain internal or be
replaced by a more direct Effect service indirection primitive.

## Runtime Events | 2026-07-27 11:57:17 EDT

A dependency implementation selection is not a domain Message. No event occurred in the
business domain, update should not handle it, and it must not create a fake transition or
Model change. It is nevertheless useful causal context when inspecting a replay.

The Program runtime therefore owns a second, renderer-independent timeline for runtime
events. A runtime event has a name, optional JSON attributes, a timestamp, and the replay
frame after which it occurred. The current dependency adapter records
`SelectedDependencyImplementation` only after the replacement Layer has acquired and the
selection has become active.

Runtime events obey these rules:

- They are stored in the same portable tape as Messages and participate in its content
  hash.
- Historical inspection reads them but never executes them.
- Branching at a settled frame retains only events that had occurred by that frame.
- Resuming a branch preserves retained events and appends new live events.
- They never replace behaviorally meaningful Model state or runtime diagnostics.

This is the framework seam needed for dependency selection, scheduler configuration,
feature-flag provenance, and similar host facts. Individual Programs should not invent
parallel tape metadata or add environment Messages solely for replay bookkeeping.

## React Replay and Dependency Sets | 2026-07-27 12:31:59 EDT

The earlier one-dependency and synchronous replay prototypes are superseded. A React
Provider now owns one asynchronously acquired `ReplayController` and exposes four
domain-shaped hooks: Model, actions, lifecycle, and replay. `useReplay` returns stable
engine semantics named `inspect`, `seek`, `stepBackward`, and `stepForward`. Sending a
domain action while inspecting branches from the selected settled frame. It also
returns the typed state and replay routes so a platform can add only its scheme and
authority. `statePath` and `replayPath` print those canonical relative values without
exposing Effect or the Program router to a React component.

Historical inspection closes the live branch's child Scope. This releases its Effect
Layers as well as stopping Commands and Subscriptions. A new branch creates a new
child Scope. Closing the controller is idempotent and closes the current child before
the Provider's parent Scope.

A dependency set composes any number of independently typed choices with `add`. One
Provider owns their merged Layer, selection stores, and shared causal-operation gate.
The React hook accepts a dependency key and infers only that key's implementation
names. No generated binding files or runtime casts are required.

Dependency choices synchronize from runtime events during inert inspection. Before a
new live branch acquires its Layers, each choice restores the last implementation that
had occurred by the selected frame. Reacquiring a restored implementation does not
append a duplicate selection event. A user-requested replacement appends an event only
after the replacement has acquired successfully.

Programs do not inspect React, Expo, web, iOS, or Android globals. A platform
composition root chooses the concrete Layers. A platform capability may be injected
when domain behavior truly depends on it, but platform detection is not a default
Program responsibility.

## Expo and Metro Compatibility | 2026-07-27 13:06:51 EDT

Expo's default loose object-spread transform rewrites a computed getter in Effect's
runtime prototype through `Object.assign`. That eagerly evaluates the getter before an
Effect `Exit` owns its value and produces malformed `Exit` objects in Metro bundles.
Type checking and successful bundling do not detect the failure.

The Expo showcase therefore configures Babel's spec-compliant object-rest-spread
transform. This preserves property descriptors and the computed getter. A public
Foldkit Expo integration or project generator should own this compatibility setting so
application implementers do not need to diagnose Effect's compiled runtime. The
setting is build integration, not a Program dependency or platform-detection API.

Expo Web was then verified in a real browser from a production export. Counter,
Multiple Counters, Calculator, and Fact all mounted. Counter inspection and live
branching changed the visible Model as expected. Fact acquired two dependency choices,
switched the platform Layer, and appended the corresponding runtime event.
