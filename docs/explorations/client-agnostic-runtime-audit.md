# Client-agnostic runtime | Architecture audit

Status: source audit. This document records current behavior and required
ownership boundaries. It does not establish a new Foldkit package API.

## Conclusion

Foldkit already contains most of the renderer-independent engine needed to run
one Program across React, React Native, CLI, terminal, and future server hosts. The
engine owns typed startup, restoration, Message processing, Effect resource
scope, journaling, inert replay, live branching, portable relative routes,
saved-replay resolution, and runtime diagnostics. Those mechanisms must not be
reimplemented for each domain.

The Wallet clients expose the remaining integration gaps:

1. `makeFoldkitApplication` starts a `ProgramRuntime`, not a
   `ReplayController`. It can restore a State route, but it cannot present an
   inline Replay route at its selected inert frame.
2. Replay routes preserve an `isPlaying` flag, but `ReplayController` ignores
   it and resets the flag when it emits a new replay route. Portable playback
   semantics are therefore incomplete even in controller-backed clients.
3. The generic replayable React binding fixes its resource Layer when the
   client is defined. The Wallet binding therefore fixes
   `SimulatedWalletResources` and a host cannot inject the Node test-network
   Layer into the same binding instance.
4. The React Native Showcase multiplexes six Programs through an ad hoc path
   prefix chain even though Foldkit already provides `routeCase` and
   `makeDestinationRouter` for a typed multi-Program destination.
5. CLI and Effect Terminal hosts repeat route-to-runtime startup decisions.
   Their URI carrier extraction is correctly platform-owned, but restoration,
   inert replay, live branching, and saved replay resolution are engine
   concerns.
6. Wallet hosts do not surface the engine's Subscription and ManagedResource
   diagnostics or runtime failures.
7. No Wallet client provides a `ReplayTapeStore`, and no Wallet server host
   exists. `testnet-node` is an Effect Layer adapter, not a server.

The correction is to complete the shared engine and make every host a thin
carrier, resource, input, and presentation adapter. It is not to add a
Wallet-specific runtime.

## Ownership map

| Concern                     | Domain Program                                                                     | Foldkit engine                                                                                   | Platform host or presenter                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Model and Message semantics | Defines Schemas, `init`, `restore`, `update`, Commands, and semantic Subscriptions | Executes the contract                                                                            | Observes the Model and converts input into Messages                                         |
| Effect capabilities         | Declares required services                                                         | Builds one scoped runtime from an injected Layer                                                 | Selects and configures the Layer implementation                                             |
| Fresh and restored startup  | Describes finite recovery work through `init` and `restore`                        | Owns `fresh`, `fromModel`, `fromReplay`, initialization, and shutdown                            | Selects the startup route or default                                                        |
| Replay                      | Keeps `update` deterministic and historical Commands inert                         | Owns tapes, frame reconstruction, settlement rules, inspection, branching, and live continuation | Presents controls and chooses when the user branches                                        |
| Portable route grammar      | Supplies Program identity and current Schemas                                      | Owns the typed route union and relative path/query parser-printer                                | Supplies a carrier string to the parser and projects printed paths into its environment     |
| URI carrier                 | None                                                                               | Must not assume one                                                                              | Owns scheme, authority, hostname, Expo `/--/`, browser location, Linking, and CLI arguments |
| Saved replay                | None                                                                               | Owns the store capability, content address, integrity check, and route resolution                | Provides the storage Layer and any authentication or transport                              |
| Multi-Program dispatch      | Each Program remains independently typed                                           | Owns typed route-case and destination-router combinators                                         | Registers Programs only when one host actually multiplexes them                             |
| Runtime health              | Maps expected domain service failures into Messages when they affect the Model     | Owns lifecycle diagnostics and unhandled runtime failures                                        | Observes and presents or exports those diagnostics                                          |
| Receive payload             | Owns the public semantic payload, such as `portableUri`                            | Preserves it in state and replay                                                                 | Renders QR pixels, copy/share controls, and camera or deep-link behavior                    |
| Server concerns             | None unless the server itself is modeled as a Program                              | Supplies reusable runtime and store abstractions                                                 | Owns HTTP, authentication, persistence deployment, process lifecycle, and request routing   |

This boundary preserves the Elm Architecture. The Model stays the single
source of domain truth, Messages remain facts, and side effects remain in
Commands, Subscriptions, ManagedResources, and injected Layers.

## What the engine must own

### Program identity, startup, and restore

`Program` in `packages/foldkit/src/program/program.ts` is already the correct
renderer-free contract. It carries a stable `id`, integer `version`, Model and
Message Schemas, `init`, optional `restore`, `update`, optional Subscriptions,
optional ManagedResources, Ports, and replay-tape migrations. It deliberately
excludes rendering, platform Layers, URI carriers, and launch behavior.

The engine must remain the sole interpreter of its startup modes:

- `fresh()` calls `init` and records the returned finite Commands as initial
  journal work.
- `fromModel(model)` calls `restore` when present. It records and runs the
  recovery Commands before `initialization` completes.
- `fromReplay(tape)` reconstructs the final settled Model and resumes live
  without rerunning historical Commands.

Wallet demonstrates why `restore` belongs in the Program contract rather than
in a client. `examples/wallet/core/src/update.ts` maps pending public Model
states back to finite domain Commands. A loading portfolio reloads the Wallet,
a transaction preview is recalculated, a pending submission is signed and
submitted, and a challenge is signed. Stable states produce no recovery
Commands. Every renderer receives the same recovery semantics by calling
`Runtime.fromModel`; no adapter needs to inspect Wallet state tags.

Restore does not select a platform implementation. `WalletProgram` declares
`WalletClient`, `WalletSigner`, and `WalletCrypto` capabilities. The host
supplies either `SimulatedWalletResources`, a test-network Layer, or another
compatible Layer. Private configuration stays behind Redacted service
boundaries and never enters the Model, Message, route, or replay tape.

### Runtime execution and resource lifetime

`makeProgramRuntime` in
`packages/foldkit/src/runtime/programRuntime.ts` already owns the shared live
semantics:

- serialized Message processing and deterministic calls to `update`;
- finite Command execution and operation settlement;
- Subscription and ManagedResource reconciliation from the current Model;
- one scoped Effect Layer used by Commands, Subscriptions, and
  ManagedResources;
- the immutable journal, replay tape, timeline, state routes, and replay
  routes;
- Ports, Model observation, initialization, and shutdown;
- runtime diagnostics and fatal runtime failures.

A renderer binding should observe this engine or its `ReplayController`. It
should not duplicate a queue, resource scope, replay journal, or restoration
state machine.

### Inert replay and live branching

Replay has two intentionally different modes:

- `ReplaySession` reconstructs and seeks historical frames without starting
  resources or executing historical Commands.
- `ReplayController` begins a Replay route in `Inspecting`, can seek or step
  through inert history, and branches to a live runtime only when the host
  sends a new Message from a settled frame. A State route begins in `Live` and
  uses `fromModel`, so Program restoration still applies.

`Runtime.fromReplay` is not a replacement for a controller. It resumes a live
runtime only from the tape's final settled frame. It cannot represent a Replay
route's selected frame, playback intent, or inert inspection state.

The route/controller boundary has one further unfinished contract. Replay and
SavedReplay routes carry `isPlaying`, and the parser-printer preserves it as
`play=1`. `makeReplayController` uses the tape and selected frame but ignores
`isPlaying`; its snapshot has no playback state, and `replayRoute()` constructs
a route with the default `isPlaying: false`. The generic React binding also
does not schedule playback. A parsed `play=1` route therefore loses that intent
after it enters a controller.

If playback remains part of the portable route, the client-agnostic replay
controller must own Playing versus Paused state, frame advancement, end-of-tape
behavior, and route round trips. A host may supply a clock or scheduling
implementation and renders the controls, but it must not reinterpret
`isPlaying` per domain. The alternative is to remove playback from the generic
route contract. Keeping the flag while no engine consumer honors it is not a
portable semantic.

The Foldkit renderer currently crosses this boundary incorrectly. Its
application config accepts `start?: ProgramStart`, and
`makeProgramRenderer` constructs `makeProgramRuntime` directly. The Wallet
Foldkit route adapter can therefore map a State route to `fromModel`, but it
must reject inline Replay routes with the accurate statement that the renderer
cannot mount a `ReplayController`. The required generic work is a
ReplayController-backed Foldkit renderer adapter that observes controller
snapshots, exposes inspection controls to the host, and preserves existing
Foldkit rendering, HMR, Ports, and shutdown behavior. A Wallet-only replay
implementation would duplicate engine policy.

### Portable relative routes

`Program.makeRouter(program)` in `packages/foldkit/src/program/route.ts` owns
the portable route algebra:

- `/<program-id>/state?model=<encoded Model>`;
- `/<program-id>/replay?tape=<encoded tape>&frame=<n>[&play=1]`;
- `/<program-id>/replay/<tape-id>?frame=<n>[&play=1]`.

The parser-printer validates the current Program Schemas, replay frame bounds,
playback flags, and saved-replay identifiers. `canonicalize` is parse followed
by print, so the engine also owns the canonical relative path and query form.
Clients must call this router rather than define domain-specific query keys or
encode Models and tapes themselves.

The route grammar is deliberately relative. The following remain
platform-owned:

- `https`, custom application schemes, authority, host, and base path;
- browser `location`, `history`, and `popstate` behavior;
- React Native `Linking`, Expo's `/--/` carrier convention, and initial-link
  delivery;
- CLI argument selection and whether a full URL or a relative path is
  accepted;
- installation, launch, and association configuration.

It is reasonable for two clients on the same platform family to share a small
carrier normalizer. That helper must stop after producing a relative
path/query string. Scheme or authority rules must not enter
`Program.makeRouter`, because they are neither Program state nor portable
replay semantics.

### Saved replay storage and resolution

`ReplayTapeStore` in `packages/foldkit/src/runtime/replayTapeStore.ts` is the
engine-owned storage capability. `saveReplayTape` encodes a tape, derives its
SHA-256-backed UUID URI, and stores the exact bytes. `resolveProgramRoute`
loads a SavedReplay route, verifies a content-addressed identifier, decodes and
migrates the tape, validates the selected frame, and returns a resolved Replay
route.

No Wallet adapter currently provides this service. Rejecting SavedReplay with
a typed or visible error is correct until a host injects a store. The next
store-backed client should call `resolveProgramRoute` instead of reproducing
load, integrity, decode, migration, or frame validation. HTTP, filesystem,
SQLite, or cloud persistence belongs in the injected store Layer.

### Typed multi-Program dispatch

Foldkit already provides the engine primitive for a host that multiplexes
Programs. `Program.routeCase(program, casePath)` preserves the concrete Model
and Message types of one destination branch.
`Program.makeDestinationRouter(...cases)` dispatches by the first path segment,
rejects missing or duplicate Program registrations, and guarantees that one
and only one registered printer handles a destination.

The React Native Showcase is the only audited Wallet host that needs this
registry. It currently creates six routers and dispatches with a sequence of
`path.startsWith` checks. That should become one host-owned tagged destination
union with a typed case for Counter, MultipleCounters, Calculator, Fact,
Showcase, and Wallet, then one destination router composed from case paths.
Legacy Showcase navigation paths can remain a separate host navigation case
instead of weakening the Program route registry.

The registry must not be placed in `WalletProgram`, a package-global mutable
map, or every single-Program client. A registry is justified only at the host
boundary that actually chooses among multiple Programs.

### Diagnostics

The runtime publishes transport-neutral lifecycle diagnostics for
Subscriptions and ManagedResources. Records include the Program id, resource
name, instance id, timestamp, lifecycle transition, and Cause when startup or
execution fails. It separately exposes failures from Update, Commands,
Subscriptions, and ManagedResources through read, observe, and Stream APIs.

Wallet's transaction Subscription correctly maps an expected
`WalletClientError` into `FailedObserveTransactions`, because that failure is a
domain fact that changes the Model. A Subscription fiber defect or lifecycle
failure is different. It belongs in runtime diagnostics and must not be
invented as a Wallet Message merely so a renderer can see it.

None of the Wallet hosts currently presents or exports runtime diagnostics.
The React `ReplayController` surface exposes runtime events and the live
timeline, but it does not expose the live runtime's diagnostic and failure
streams. The Foldkit renderer's underlying runtime has those streams, but the
Wallet view does not consume them. A generic binding should expose a typed
health snapshot or observation hook that works only while the controller is
Live and clearly reports that inert replay has no active resources. Hosts can
then choose a console, status panel, telemetry exporter, or test assertion
without changing the Program.

## Wallet adapter findings

| Adapter                                    | Correct boundary today                                                                                                                                 | Gap or required consolidation                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wallet/core`                              | Defines one portable Program, public Schemas, restoration rules, semantic Subscription, and Effect capability contracts                                | No client runtime belongs here                                                                                                                                                            |
| `wallet/simulated-client`                  | Supplies a deterministic complete Layer with no network or funds                                                                                       | Remains a host-selectable resource implementation                                                                                                                                         |
| `wallet/testnet-node`                      | Supplies Sepolia and Solana Devnet networking plus optional local custody behind the same Wallet services                                              | It is not a server and should not own Program dispatch or rendering                                                                                                                       |
| `wallet/foldkit`                           | Uses the exact `WalletProgram`; State paths use `fromModel` and therefore Program restore                                                              | Inline Replay is rejected because `makeFoldkitApplication` cannot mount a controller; SavedReplay has no store                                                                            |
| `wallet/react-bindings` and `wallet/react` | Use a generic ReplayController-backed binding; inline Replay begins in inert inspection                                                                | The binding fixes `SimulatedWalletResources`; `play=1` is not honored; the web host cannot inject another complete Wallet Layer into the same client definition; SavedReplay has no store |
| `wallet/tui`                               | Uses the same React binding and ReplayController; CLI argument parsing and full-URL carrier stripping stay in the OpenTUI entry                        | Resource choice remains fixed to simulated; `play=1` is not honored; SavedReplay has no store; carrier logic is repeated                                                                  |
| `wallet/cli`                               | Supports inert inspection and live continuation with the shared replay primitives; printing is host-owned                                              | It manually maps routes into State inspection, ReplaySession branching, live runtime starts, and SavedReplay rejection                                                                    |
| `wallet/terminal`                          | Uses the shared Program runtime and owns terminal input and text presentation                                                                          | It repeats carrier and startup policy; a Replay route is immediately branched live instead of being preserved as selected-frame inspection; SavedReplay has no store                      |
| React Native Showcase                      | Owns Expo and web carriers, `Linking`, history, presentation, and the fact that one host contains several Programs; Wallet uses the exact core Program | Replace the path-prefix chain with a typed destination router; inject host-selected resources; provide a store before accepting SavedReplay                                               |

The generic React resource gap has two valid engine-level shapes. A Provider
could accept a typed complete `Layer.Layer<Resources, ResourceError>`, or the
existing dependency-choice machinery could declare WalletClient, WalletSigner,
and WalletCrypto choices and compose the selected Layer per Provider. The
important property is host-level injection into the generic binding. Creating
separate simulated and test-network Wallet React bindings would make resource
selection ad hoc again.

## QR presentation boundary

`ReceivingInstruction.portableUri` is public domain data. Simulated and
test-network Wallet Layers produce the URI because network-specific receive
semantics, account addresses, chain identifiers, token identifiers, and query
parameters live behind those adapters. The Model preserves the resulting
string so state routes and replay reproduce the same public instruction.

The audited clients currently display the value as text labelled `QR payload`
or alongside the destination address. No QR encoder or renderer is present.
Turning that string into modules, pixels, SVG, terminal blocks, image sizing,
error-correction choices, accessibility labels, or share/copy actions belongs
to the presenter. Camera permissions and opening the URI belong to the
platform host. Foldkit's runtime must not gain a QR Command or QR-specific
state.

## Server-host status

There is no Wallet server host in the audited source. In particular,
`examples/wallet/testnet-node` contains Node-compatible Effect Layers and
configuration for blockchain transports and optional custody. It does not
open an HTTP listener, host a `ProgramRuntime`, register multiple Programs,
serve portable routes, or implement a `ReplayTapeStore` endpoint.

A future server host would use the same Program and engine primitives. The
server would own request authentication, carrier extraction, resource and
store Layers, process scope, concurrency policy, and response encoding. It
must not be inferred from the existence of a Node Layer, and the current audit
does not claim server parity.

## Message versions and cross-language use

The current portable contract versions a whole Program, not each Message
independently:

- a replay tape has `formatVersion: 1`, `programId`, and `programVersion`;
- every transition Message is encoded through the current Program Message
  Schema;
- `Program.migrations` transform an old encoded tape until its Program version
  reaches the current version;
- only after migration does Foldkit decode the Model and Messages through the
  current Schemas.

This is sufficient for TypeScript clients that share the exact Program
implementation. It is not, by itself, a cross-language protocol. Another
implementation would need the same update semantics as well as a normative
wire contract for Model, Message, transition metadata, Command records,
numbers, strings, URL query handling, and error cases. Live execution also
requires platform-specific implementations of the declared Effect
capabilities. Historical replay requires only deterministic update semantics;
historical Commands remain data and are never executed.

There are three concrete versioning implications:

1. Any change that affects Model or Message decoding, Program identity, or
   replay/update semantics must be reflected in the Program version and tape
   migration chain. Stable external event identifiers may be useful when an
   internal Message constructor is renamed. The prototype in
   `docs/explorations/message-versioning.md` explores that separate contract
   without making it a current framework API.
2. Program migrations currently apply only to encoded replay tapes. A State
   route decodes its `model` query directly with the current Model Schema and
   carries no Program version. Long-lived State links therefore have no
   migration path today. Foldkit must either version State payloads and define
   migrations, explicitly declare State paths ephemeral within one Program
   version, or wrap them in a versioned portable envelope.
3. `encodeReplayTape` uses Schema encoding followed by `JSON.stringify`.
   Saved-replay identifiers hash those exact UTF-8 bytes. Cross-language
   producers cannot assume that semantically equal JSON produces the same
   content address unless Foldkit specifies canonical byte serialization and
   publishes conformance fixtures. Loading and migrating old bytes also does
   not preserve their content address for newly exported migrated bytes.

An independent Message envelope version should be introduced only if Messages
must be exchanged outside a complete versioned Program or evolved on a cadence
different from Model and update semantics. If that requirement arrives, the
contract needs stable event identifiers, adjacent deterministic upgrades,
explicitly fallible downgrades, and law tests. It should not become a mutable
runtime registry or a second Message source of truth.

## Required engine completion

The smallest coherent completion sequence is:

1. Complete ReplayController playback semantics so `isPlaying` survives route
   initialization, observation, playback, and route projection without a
   domain-specific timer.
2. Add a generic ReplayController-backed Foldkit renderer path. Preserve State
   restoration, inert selected-frame Replay, live branching, Ports, HMR,
   renderer scheduling, and scoped shutdown.
3. Let a generic replayable React Provider receive or select its typed resource
   Layer. Keep dependency switching and replay timeline recording generic.
4. Replace multi-Program path-prefix dispatch in React Native Showcase with a
   tagged host destination and `makeDestinationRouter`.
5. Thread a host-provided `ReplayTapeStore` through clients that claim
   SavedReplay support, and resolve saved routes through
   `resolveProgramRoute`.
6. Expose runtime diagnostics and failures through renderer-neutral bindings,
   with explicit Live versus Inspecting availability.
7. Decide and test the State-route version policy before calling State links
   durable across Program versions. Add canonical serialization fixtures
   before claiming cross-language content-address compatibility.

These steps leave schemes, launch behavior, resource credentials, storage
transport, QR rendering, and server deployment with the platforms that own
them. They centralize only the semantics that must remain identical when the
same Program crosses clients.

## Audited sources

The findings above were checked against these current source areas:

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/program/route.ts`
- `packages/foldkit/src/runtime/programRuntime.ts`
- `packages/foldkit/src/runtime/replaySession.ts`
- `packages/foldkit/src/runtime/replayController.ts`
- `packages/foldkit/src/runtime/replayTape.ts`
- `packages/foldkit/src/runtime/replayTapeStore.ts`
- `packages/foldkit/src/runtime/runtimeDiagnostic.ts`
- `packages/foldkit/src/runtime/runtime.ts`
- `examples/shared/react-bindings/src/replayableReactProgram.tsx`
- `examples/wallet/core/src/`
- `examples/wallet/simulated-client/src/`
- `examples/wallet/testnet-node/src/`
- `examples/wallet/foldkit/src/`
- `examples/wallet/react-bindings/src/`
- `examples/wallet/react/src/`
- `examples/wallet/cli/src/`
- `examples/wallet/terminal/src/`
- `examples/wallet/tui/src/`
- `examples/react-native-showcase/src/App.tsx`
- `examples/react-native-showcase/src/wallet/`
