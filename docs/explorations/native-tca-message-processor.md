# Native TCA Message Processor | Portable Foldkit Programs

Date: 2026-07-27

Status: Exploration

## Recommendation

Build a native Swift processor around the existing Foldkit wire protocol, but do
not model an arbitrary Foldkit Program as a dictionary-backed TCA Reducer.

The smallest credible design has three layers:

1. A runtime-driven envelope layer decodes replay headers and metadata, selects a
   Program adapter, orchestrates migrations, tracks causal operations, reconstructs
   frames, and suppresses historical Commands.
2. A generated wire layer supplies versioned Swift Model and Message types, exact
   `Codable` implementations for the Effect Schema JSON representation, and generated
   CasePaths.
3. A native semantic layer implements the Program's pure update function and maps its
   named Commands to dependency clients. Schema describes values, not update behavior,
   so this layer cannot be derived from the current `Program` definition.

Target the local Composable Architecture 1.25.2 surface first. Keep the generated
wire module independent of Composable Architecture so an adapter for the local
Composable Architecture 2.0 beta can be added without changing the portable protocol.
The 2.0 beta is promising, but its `@Feature`, `Update`, `Spawn`, and `store.addTask`
surface is explicitly unreleased and subject to change.

Two cross-runtime prerequisites need an explicit decision before this can claim full
parity:

- Foldkit update functions and migrations are executable TypeScript closures. A Swift
  runtime cannot recover their behavior from Model and Message Schemas.
- Content-addressed replay identity hashes the exact UTF-8 JSON string. The current
  encoder uses `JSON.stringify`, but the format does not specify a cross-language
  canonical JSON serialization.

A replay-only JSON inspector can avoid code generation. A native TCA application that
reconstructs Models, presents typed navigation, and continues a live branch cannot.

## Existing Portable Contract

`Program` already defines the correct domain boundary:

- `id` and `version` identify the Program protocol.
- Model and Message Schemas define portable encoded values.
- `init`, `restore`, and update return a Model and zero or more Commands.
- A Command is named, may carry JSON-compatible arguments and a key, and produces one
  Message through an Effect whose error channel is `never`.
- optional migrations transform the encoded tape before current Schema decoding.

The replay format is version 1. Its outer shape is stable and can be decoded without
knowing a Program's generated types.

| Field             | Portable meaning                                                         | Native treatment                                                                                    |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `formatVersion`   | Replay envelope version, currently `1`                                   | Decode before Program lookup and reject unsupported formats.                                        |
| `programId`       | Stable Program identity                                                  | Select a registered native Program family.                                                          |
| `programVersion`  | Model, Message, and update protocol version                              | Select a versioned decoder or a migration path.                                                     |
| `initialModel`    | Effect Schema JSON for the retained replay horizon                       | Keep as `JSONValue` until migration, then decode through generated Model code.                      |
| `initialCommands` | Names and optional JSON arguments of Commands returned at initialization | Preserve for diagnostics and frame-zero branch eligibility. Never execute while inspecting history. |
| `transitions`     | Ordered portable Messages plus causal metadata                           | Decode the envelope dynamically and each Message through the versioned generated codec.             |
| `runtimeEvents`   | Host/runtime facts anchored after a frame                                | Preserve and filter by frame. Never apply them as Messages.                                         |

Each transition contains `sequence`, `message`, `source`, an optional `operationId`,
`isOperationSettled`, returned Command descriptors, and a millisecond timestamp. It
does not contain the resulting Model. This is important: the same tape is only useful
to a native processor when native update semantics produce the same next Model for
every Message.

The current replay laws are:

- Start with `initialModel` and apply Messages in sequence through update.
- Discard every Command returned while reconstructing historical frames.
- Preserve the recorded transition and runtime-event metadata.
- Permit a live branch only at a settled frame.
- Reject frame zero as a live branch when `initialCommands` is non-empty.
- After branching, execute only Commands returned by new Messages and append their
  result Messages to the new history.

These laws belong in the generic Swift runtime. They must not be reimplemented by each
TCA feature or SwiftUI view.

## Local Composable Architecture Findings

The local current source is the `1.25.2` tag at commit
`adf6e52161f293fe4ab957dd732e214aca7031d2`, dated 2026-03-16. Its stable architecture
matches the proposed adapter well:

- `Reducer` evolves State from an Action and returns an `Effect<Action>`.
- `.run` performs dependency-backed work and sends result Actions into the Store.
- `@Dependency` and `DependencyKey` isolate live implementations and test values.
- `@Reducer enum` generates case-oriented destination domains.
- `StackState`, `StackAction`, CasePaths, and `.forEach` provide state-driven stack
  composition and effect cancellation.

The reducer source explicitly discourages invoking a Reducer directly. Replay should
therefore call a shared pure Program update helper, not `Reducer.reduce`. The live TCA
Reducer calls that same helper and turns returned Command values into Effects.

The local `TCA26-main` snapshot contains `ComposableArchitecture2`, a
`ComposableArchitecture1` compatibility target, and a `ComposableArchitecture`
barrel. Its README labels 2.0 a beta preview. The relevant 2.0 differences are:

| Concern                | Composable Architecture 1.25.2                          | Composable Architecture 2.0 beta                                          |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Synchronous transition | `Reduce` mutates State and returns an Effect            | `Update` mutates State and returns nothing                                |
| Async work             | `.run` sends Actions                                    | `store.addTask` may send Actions or directly read and modify State        |
| Child ownership        | Optional and collection Reducer operators, `StackState` | `Spawn`, `ifLet`, `ifCaseLet`, and `forEach`                              |
| Enum projection        | `@Reducer enum`, CasePaths, scoped Stores               | `@Feature enum`, CasePaths, Store enumerations                            |
| Navigation example     | `StackState<Path.State>` and `StackActionOf<Path>`      | Optional spawned enum destination scoped through SwiftNavigation bindings |
| Dependencies           | `@Dependency` in a Reducer                              | `@Dependency` installed as a feature dynamic property                     |
| Stability              | Tagged local current release                            | Unreleased beta with branch dependencies                                  |

Composable Architecture 2.0 allows `store.modify` inside asynchronous tasks. A
portable Foldkit adapter must not use that path for domain changes. It would mutate the
Model without a portable Message, which makes replay incomplete and violates the
Program's unidirectional data flow. Native Commands should use `store.send` to return a
generated Message, just as the 1.x adapter uses `.run` to send an Action containing a
Message.

The generated module should therefore import Foundation and CasePaths at most. The
TCA-specific adapter can live in a separate target:

```text
GeneratedProgramV1
  Model
  Message
  Navigation
  exact JSON codecs

FoldkitPortableRuntime
  replay envelope
  migration orchestration
  journal and causal operations
  Program adapter registry

FoldkitTCA1Adapter
  Reducer
  Effect and dependency mapping
  SwiftUI presentation bridge

FoldkitTCA2Adapter
  Feature and Update bridge
  store.addTask mapping
  Spawn presentation bridge
```

The 2.0 adapter is an experiment, not a dependency of the wire contract.

## Processor Boundary

The native Program definition needs a pure transition function that can be called by
both live TCA processing and inert replay. An illustrative shape is:

```swift
protocol PortableProgramDefinition {
  associatedtype Model: Codable & Equatable & Sendable
  associatedtype Message: Codable & Equatable & Sendable
  associatedtype Command: Equatable & Sendable

  static var id: String { get }
  static var version: Int { get }

  static func initialize() -> (model: Model, commands: [Command])
  static func restore(model: Model) -> (model: Model, commands: [Command])

  static func update(
    model: Model,
    message: Message
  ) -> (model: Model, commands: [Command])
}
```

This is a Swift protocol sketch, not a proposal to change the TypeScript API. The key
property is that update is ordinary pure code with no TCA dependency. A generic TCA
Reducer owns a runtime shell around the domain Model:

```text
Runtime State
  current generated Model
  retained journal
  causal operation bookkeeping
  replay mode and selected frame

Runtime Action
  received generated Message plus TransitionSource and operation identity
  Command lifecycle bookkeeping that is never written as a portable Message
  replay control actions that are never sent to Program update
```

The runtime Action wrapper is not a second domain protocol. It carries provenance that
Foldkit currently carries in `QueuedMessage`, while the nested generated Message is the
only value passed to update and written into a tape.

For a live Message, the adapter performs these steps in one serialized transaction:

1. Call the pure native update implementation.
2. Replace the current generated Model with the returned Model.
3. Record the generated Message, provenance, Command descriptors, and operation state.
4. Convert each returned native Command into a TCA Effect.
5. Have each Effect send a runtime Action containing its portable result Message and
   Command source.

For a historical Message, the replay engine performs only the first step and keeps the
returned Model. It deliberately discards returned Commands. It should construct the
live TCA Store only after the selected frame has been reconstructed or after a settled
prefix has been chosen for a branch.

### Causal operation parity

Foldkit assigns an operation to a host-initiated run, increments pending work for
queued Messages and forked Commands, and marks a transition settled when it returns no
Commands and only that Message remains pending. The native shell must preserve the
same behavior. TCA Effect cancellation alone is not enough because the settlement bit
is part of the replay contract.

The TCA adapter should track pending operation work in generic runtime state. Internal
Effect completion Actions release pending work but do not enter the portable tape.
Command result Messages retain the originating operation ID. New Commands returned by
those Messages extend the same operation. This permits the same settled branching rule
without exposing TCA implementation details in JSON.

## Dynamic Decoding Versus Generated Types

The outer tape and the Program domain have different requirements.

| Capability                                            | Dynamic `JSONValue`                          | Generated Swift types                       |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Read header and metadata                              | Strong fit                                   | Unnecessary                                 |
| Preserve an unknown Program or newer version          | Strong fit                                   | Cannot decode unknown cases                 |
| Display a generic replay inspector                    | Sufficient                                   | Optional                                    |
| Validate a Message against its Effect Schema encoding | Requires a second Schema interpreter         | Exact for the generated version             |
| Exhaustively handle Message cases                     | String switches and runtime errors           | Swift enum exhaustivity and CasePaths       |
| Use typed TCA Stores and dependency clients           | Poor fit                                     | Strong fit                                  |
| Present state-driven native navigation                | Dictionary projections and duplicated checks | Generated enums and typed projections       |
| Reconstruct a Model                                   | Still requires update behavior               | Still requires update behavior              |
| Continue a live branch                                | Still requires update and Command behavior   | Supports an idiomatic native implementation |

A dictionary-backed Message such as `DynamicMessage(tag:fields:)` does not remove the
need for per-Message behavior. It moves exhaustivity from compile time to string
switches, weakens payload validation, and prevents typed CasePaths. It is appropriate
for diagnostics and forward-compatible storage, not the native Program processor.

The runtime should still preserve the raw JSON envelope until Program lookup and
migration finish. This lets it report an unsupported version without losing the tape,
verify a content address against the received bytes, and migrate old values before a
current generated decoder sees them.

## Minimal Code Generation Escape Hatch

The minimum generated surface is:

1. A namespace or module for each supported Program version, such as
   `MultipleCountersV1`.
2. Codable, Equatable, and Sendable Model value types for the encoded Schema shape.
3. A generated `@CasePathable` Message enum with associated payload structs.
4. Exact custom Message encoding and decoding using the portable `_tag` discriminator.
5. Generated tagged enums for Model unions, including navigation and request states.
6. A small descriptor containing Program ID, version, and supported migration entry
   points.
7. Cross-language codec fixtures produced by the TypeScript Program build.

Swift's synthesized Codable representation for an enum is not the Foldkit wire format,
so the generator must emit a custom discriminator codec. A simple Message should
encode like its Effect Schema value:

```json
{ "_tag": "SelectedCounter", "counterId": "counter-1" }
```

It must not encode using Swift's default nested enum representation. The Swift case can
be lower camel case, but its codec and generated CasePath must retain the exact portable
tag.

The generator should consume an explicit Foldkit portable Schema IR for the encoded
side of each codec. It should not treat general JSON Schema as a lossless intermediate.
Foldkit previously removed Message JSON Schema publication because constructs such as
`OptionFromSelf`, `instanceOf`, and other Schema declarations did not reliably produce
JSON Schema. The native generator needs to know the actual `Schema.toCodecJson`
representation, including transformations.

An initial Schema IR can support the constructs used by the portable example Programs:

- structs and tagged structs
- discriminated unions and literal unions
- strings, booleans, numbers, and integers
- arrays and string-keyed records
- optional keys
- Effect `Option` using its actual encoded representation
- named references needed for reuse and recursion

The generator should fail with a useful path for unsupported declarations,
class-instance Schemas, `Unknown`, opaque transformations, or refinements whose encoded
semantics are unavailable. It must not silently widen them to `JSONValue`. A Program
can add an explicit native codec annotation or hand-written Swift type for an
unsupported leaf.

Important encoding distinctions include:

- An optional key is not the same value as `Option.none`.
- `Schema.Number` maps to a JSON number and needs finite-number parity, while
  `Schema.Int` also needs integral and safe-range validation.
- Defaults apply at the same decode boundary as Effect Schema defaults.
- Tagged literal spelling and field names are protocol data.
- Unicode escaping and number serialization matter when producing content-addressed
  output, even if two decoders consider the JSON values equivalent.

Code generation does not include update. It can generate a compile-failing conformance
stub listing every Message case, but a developer must implement the Model transition or
provide a future portable transition IR. This is the smallest escape hatch that keeps
the runtime generic without pretending Schema describes behavior.

## Command and Dependency Mapping

Foldkit Commands are already good dependency boundaries. Their names and JSON arguments
are recorded, while their Effects request abstract services and return portable
Messages. The native equivalent should use an enum or tagged struct per Program:

```text
Native Command
  FetchCounterFact(counterId, number)
  SaveDraft(documentId)
  LockScroll
```

The pure update implementation returns these values. The TCA adapter maps each value to
an injected dependency client:

- `FetchCounterFact` calls a `CounterFactClient` and returns either
  `SucceededFetchCounterFact` or `FailedFetchCounterFact`.
- `SaveDraft` calls a `DraftClient` and returns the Program's success or failure
  Message.
- fire-and-forget platform work still needs a factual completion Message when the
  portable Program expects one.

Every non-cancellation error must become a generated failed Message. Letting `.run`
throw without a handler would create a TCA runtime issue and omit a fact from the
portable history. The same rule applies to `store.addTask` in the 2.0 adapter.

Command names and arguments in the tape are diagnostic records. Historical replay must
not execute them, and it does not need to decode them into the native Command enum.
Live update returns a fresh typed native Command, which the adapter executes exactly
once.

The native Command implementation is another hand-authored semantic seam. The
generator can emit the Command case and dependency-client scaffold only when the
Program exports an explicit Command manifest. Commands are created dynamically inside
arbitrary update code today, so static discovery from the Program type is not reliable.

A complete live native Program eventually also needs adapters for Subscriptions,
ManagedResources, and Ports. They should preserve the existing cause-based lifecycle
choice:

- Subscription for an external event stream gated by Model state.
- ManagedResource for state-gated work that Commands access through a stateful handle.
- Port for renderer-independent host ingress or egress.

The first proof can support Programs with Commands only, but it must reject unsupported
lifecycle declarations rather than silently running an incomplete native Program.
Imported replay tapes remain inspectable because their recorded result Messages are
self-contained.

## State-Driven Navigation

The generated Program Model remains the single source of truth for navigation. A native
adapter must not create independent `isPresented`, selected-ID, and path state that can
disagree with the portable Model.

For a single destination or mutually exclusive presentation, generate a CasePathable
navigation enum and scope the SwiftUI presentation directly from that enum. Native
dismissal sends the Program's factual Message, such as `DismissedCounterDetail` or
`OpenedNavigation`, back through update.

For an actual stack, use `StackState` only when the portable Model itself represents an
ordered stack with stable domain identities. TCA-generated `StackElementID` values must
not become a second portable identity. If the existing Program represents only the
currently visible destination, a host can project a SwiftUI path from that enum and
translate binding changes into Messages. It should not expand the Program into a
different canonical stack merely to use a TCA navigation helper.

The stable 1.x TCA navigation tools remain useful when the shapes align:

- `@Reducer enum Path` gives exhaustive destination State and Action cases.
- generated CasePaths scope stores to an enum case.
- `StackState` and `.forEach` cancel effects when domain stack elements disappear.
- `NavigationStack(path: $store.scope(state:action:))` keeps SwiftUI presentation
  driven from Store state.

The 2.0 `Spawn` model has the same constraint. A spawned Store can host a child whose
state is already owned by the Program Model, but it must not hide a second child Model
from portable update and replay. TCA26's direct async State mutation is similarly
off-limits for navigation changes.

Native interactive transitions may temporarily get ahead of the Model. That is a host
reconciliation concern. The host sends a portable navigation Message, observes the next
Model, and either accepts or rolls back the native transition. The policy and animation
state remain in the adapter. The accepted destination remains in the Program Model and
the resulting Message remains in the tape.

During replay, navigation is derived from the reconstructed frame Model. The processor
does not replay pushes, pops, or presentations as side effects.

## Version Migration

Current Foldkit migrations are selected by `fromVersion` and transform the entire
encoded JSON tape before the current Model and Message Schemas decode it. The native
runtime should preserve that order:

1. Parse JSON as `JSONValue` and decode only the replay header.
2. Verify `formatVersion` and `programId`.
3. If the tape came from a content-addressed route, verify the hash against the original
   received UTF-8 bytes before any migration.
4. Resolve a migration beginning at the header's `programVersion`.
5. Transform raw JSON.
6. Re-read the header and continue until the target version is reached.
7. Decode the full envelope, generated Model, and generated Messages for the target
   version.

Old generated decoders should remain namespaced by version. Do not edit `V1` types to
decode a `V2` shape. This permits direct inspection of old tapes and makes migration
tests precise.

The current migration body is an arbitrary TypeScript function
`(encodedTape: Schema.Json) => Schema.Json`. It cannot be translated automatically to
Swift. There are three available choices:

1. Write a matching Swift migration and verify it against shared before-and-after
   fixtures. This is the minimal initial implementation.
2. Introduce a declarative portable migration IR for common operations such as renaming
   tags and fields, inserting defaults, and mapping arrays. Both runtimes interpret the
   same migration data.
3. Embed a JavaScript runtime and execute the original migration. This maximizes reuse
   but is no longer a purely native processor and complicates dependency, lifecycle,
   and platform availability.

The first choice is appropriate for a proof. The second is the durable direction if
native parity becomes a product requirement. The third should be treated as a separate
JavaScript-hosting architecture, not as a TCA implementation.

Migration orchestration should additionally detect cycles, repeated versions, and a
migration whose output header makes no progress. The TypeScript implementation follows
the migrated header recursively, while `toVersion` is descriptive metadata. A shared
portable migration specification should make the progress rule explicit before two
runtimes depend on it.

## Content-Addressed Tape Identity

`deriveReplayTapeId` hashes the exact UTF-8 bytes of the encoded JSON string and turns
the first 16 SHA-256 bytes into a UUID-shaped `uuiduri:` identifier. Semantically equal
JSON with different key order, escaping, whitespace, or number formatting gets a
different identifier.

A Swift consumer can verify an existing saved tape by hashing the original string it
received. It can also preserve that string while inspecting the tape. A Swift producer
cannot promise the same identifier for an equivalent newly encoded tape by using
`JSONEncoder` alone.

Before native export is considered portable, choose one of these rules:

- Specify and implement the existing `JSON.stringify` byte representation in Swift,
  including field order and scalar formatting.
- Introduce a language-neutral canonical JSON form and use it for content addressing.
  This likely requires a replay-format transition because existing saved identifiers
  hash the old bytes.

Sorted keys alone are not a sufficient specification. String escaping, negative zero,
floating-point rendering, and integer range also need shared test vectors.

This does not block consuming an existing tape or producing a native-only saved tape.
It does block claiming that TypeScript and Swift independently produce the same
content-addressed identity for the same logical replay.

## Proposed First Proof

Use `multiple-counters` version 1 because it exercises nested Messages, Option-encoded
presentation state, identified child routing, Command success and failure, and
state-driven navigation.

The proof should add no generic dynamic reducer. It should proceed in this order:

1. Export a portable Schema IR and fixture corpus for `MultipleCountersProgram`.
2. Generate `MultipleCountersV1.Model`, `Message`, Model unions, custom codecs, and
   CasePaths.
3. Implement the pure native update function and Command enum by following the shared
   Program source.
4. Build a generic replay-envelope decoder, frame reconstructor, and settled-branch
   validator.
5. Wrap the definition in a Composable Architecture 1.x Reducer whose Effects call
   dependency clients and send generated result Messages.
6. Render `Navigation` directly from generated State and convert native gestures into
   existing portable Messages.
7. Add one version-1-to-version-2 fixture migration in TypeScript and Swift.
8. Only after the 1.x proof passes, build a separate 2.0 beta adapter over the same
   generated and pure semantic modules.

The first proof is complete only when it demonstrates all of the following:

- TypeScript-encoded current tapes decode in Swift.
- Swift-generated current Messages decode through the TypeScript Message Schema.
- Every replay frame produces equivalent encoded Model JSON under an agreed JSON-value
  comparator.
- Historical replay executes zero native dependency calls.
- A settled live branch executes each newly returned Command once.
- An unsettled frame and frame zero with initial Commands are rejected.
- Message source, operation ID, settlement, Command descriptors, timestamps, and
  runtime-event frame anchors survive a round trip.
- Model-driven detail, fact alert, delete confirmation, and dismissal remain in sync
  with native presentation.
- Dependency failures become portable `Failed*` Messages.
- The same migration fixtures reach the same target JSON in TypeScript and Swift.
- Existing content-addressed tapes verify from their original UTF-8 strings.

For current TCA, use `TestStore` to assert generated Message processing, dependency
calls, result Messages, and navigation projections. Run tape conformance outside the
Store against the pure update helper so tests prove that replay does not accidentally
execute TCA Effects.

## Decision Matrix

| Design                                           | Same tape inspection |   Typed native UI |                     Exact Model replay | Live native continuation | Recommendation                                    |
| ------------------------------------------------ | -------------------: | ----------------: | -------------------------------------: | -----------------------: | ------------------------------------------------- |
| Dynamic JSON viewer                              |                  Yes |                No | No, unless it embeds TypeScript update |                       No | Useful diagnostic tool only                       |
| Dynamic dictionary TCA Reducer                   |                  Yes |              Weak |  Requires hand-written string dispatch |     Possible but fragile | Reject                                            |
| Generated wire types plus native pure update     |                  Yes |               Yes |            Yes, with conformance tests |                      Yes | Recommended first architecture                    |
| Generated wire types plus portable transition IR |                  Yes |               Yes |       Yes from one behavior definition |                      Yes | Strong long-term direction, larger Foldkit change |
| Embedded JavaScript Program behind a Swift shell |                  Yes | Native shell only |           Yes through original runtime |     Yes through bridging | Separate architecture, not native TCA semantics   |

## Source Basis

Foldkit contract and replay behavior:

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/runtime/replayTape.ts`
- `packages/foldkit/src/runtime/programRuntime.ts`
- `packages/foldkit/src/runtime/programJournal.ts`
- `packages/foldkit/src/runtime/replayTapeStore.ts`
- `packages/foldkit/src/schema/index.ts`
- `packages/foldkit/CHANGELOG.md`
- `examples/counters/core/src/model.ts`
- `examples/counters/core/src/message.ts`
- `examples/counters/core/src/route.ts`
- `examples/react-native-showcase/src/nativeNavigationComparison/navigationReconciliation.ts`

Local Composable Architecture 1.25.2 source:

- `/Users/laptop/Sync/tca/tca-rust-port/upstream/swift-composable-architecture/Sources/ComposableArchitecture/Reducer.swift`
- `/Users/laptop/Sync/tca/tca-rust-port/upstream/swift-composable-architecture/Sources/ComposableArchitecture/Effect.swift`
- `/Users/laptop/Sync/tca/tca-rust-port/upstream/swift-composable-architecture/Sources/ComposableArchitecture/Reducer/Reducers/StackReducer.swift`
- `/Users/laptop/Sync/tca/tca-rust-port/upstream/swift-composable-architecture/Examples/CaseStudies/SwiftUICaseStudies/04-NavigationStack.swift`
- `/Users/laptop/Sync/tca/tca-rust-port/upstream/swift-composable-architecture/Examples/CaseStudies/SwiftUICaseStudies/FactClient.swift`

Local Composable Architecture 2.0 beta source:

- `/Users/laptop/Sync/tca/TCA26-main/README.md`
- `/Users/laptop/Sync/tca/TCA26-main/Package.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Sources/ComposableArchitecture2/Feature.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Sources/ComposableArchitecture2/Features/Update.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Sources/ComposableArchitecture2/Features/Spawn.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Sources/ComposableArchitecture2/Traits/SwiftNavigation.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Examples/SwiftUICaseStudies/SpawnedStores/SpawnNavigation.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Examples/SwiftUICaseStudies/Asynchrony/AsynchronyBasics.swift`
- `/Users/laptop/Sync/tca/TCA26-main/Examples/SwiftUICaseStudies/Asynchrony/AsynchronyCancellation.swift`
