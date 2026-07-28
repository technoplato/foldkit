# ADR 0001 | View-Agnostic Runtime Prototype

Date: 2026-07-23

Status: Accepted as an exploratory prototype

## Context

Foldkit Programs currently enter the normal runtime through `makeApplication` or
`makeElement`. Those APIs require a Foldkit view and couple the Program lifecycle to
Foldkit rendering. This makes otherwise reusable Model, Message, update, Command,
Subscription, and Effect Layer logic difficult to consume from another rendering or
interaction host.

The architectural goal is one Effect-based Foldkit Program that can be consumed by a
Foldkit view, a one-shot CLI, an interactive terminal client, React, React Native, or
another host without duplicating business logic. The Model remains the single source
of truth, Messages remain facts, and side effects remain confined to Commands and
Subscriptions.

## Decision

Introduce a renderer-free engine named `makeProgramRuntime`. It owns Message ordering,
update execution, finite Command execution, persistent Subscription and
ManagedResource lifetimes, typed Port channels, shared Effect resources, history,
diagnostics, failure delivery, and shutdown without assuming a view. The earlier
`makeHostRuntime` prototype remains only as a deprecated compatibility facade.

The prototype exposes these host capabilities:

- Read the current immutable Model synchronously.
- Enqueue a Message without waiting for its resulting work.
- Observe changed Models.
- Run a requested Message until its causally produced finite Command and result-Message
  chain completes.
- Await the finite Command chain returned by init.
- Observe Subscription and ManagedResource lifecycle diagnostics.
- Observe terminal Update, Command, Subscription, and ManagedResource failures even
  when a client uses fire-and-forget `send`.
- Shut down Commands and Subscriptions and release the shared resources Layer.

Persistent Subscriptions do not participate in finite operation completion. They can
continue emitting Messages for the lifetime of the Program.

Every runtime configuration supplies a resources Layer. A Program with no resource
requirements supplies `Layer.empty`. This keeps missing dependencies visible as
TypeScript build errors and gives Commands and Subscriptions one shared scoped Layer.

The first proof lives in `examples/counter-with-shared-state`. It is an advanced
exploration of a Counter with three Model cases:

```text
Loading
  -> LoadCounter
  -> LoadedCounter
  -> Ready(count)

Ready(count)
  -> RequestedIncrement | RequestedDecrement | RequestedReset
  -> Saving(nextCount) + PersistCounter(nextCount)
  -> CompletedPersistCounter
  -> Ready(nextCount)
```

Counter persistence is temporarily represented by a backend-neutral service:

```text
CounterStorage
  load     -> Effect<Option<StoredCounter>>
  save     -> StoredCounter -> Effect<void>
  changes  -> Stream<StoredCounter>
```

The file-backed implementation watches the containing directory and filters for the
state filename, so observation works before the state file exists. An outside value
re-enters update through `ObservedStoredCounter` and produces no persistence Command,
preventing a write-back loop.

`CounterStorage` and its file implementation are prototype scaffolding, not the
intended application-facing persistence abstraction. Foldkit should provide a generic,
type-safe Sharing facility with pluggable load, save, and observation strategies. The
facility should preserve the Model as the single source of truth by returning external
changes to update as Messages rather than introducing a separately mutable state
container.

Portable Counter state is encoded as a relative path and query. Loading, Ready, and
Saving are all printable states. Parsing enters the Program through init rather than
replacing the Model directly.

Two separate executables consume the proof:

- `foldkit-counter` restores the shared state, runs one bounded operation, waits for
  causal persistence, and prints the resulting integer.
- `foldkit-counter-tui` presents the same Model interactively, renders Saving
  immediately, and observes outside storage changes.

`foldkit-counter open tui` serializes the current Model through the portable URI codec
and launches the terminal client in the foreground through an injected client launcher.

Host-callable actions will be declared by a proposed framework-neutral
`Action.make(Message)(manifest)` layer. The manifest explicitly associates stable
consumer-facing names with approved Message constructors. It does not expose the full
Message union, execute Commands, or introduce another runtime primitive. `Action.make`
is a proposal and is not implemented by this prototype.

## Consequences

The prototype proves that Foldkit business logic can run without a Foldkit view and
that two independent hosts can share both the exact Program and durable state.
Operation completion is causal rather than global, so persistent Subscriptions never
prevent a one-shot host from completing.

The temporary execution-loop duplication has been removed. `makeApplication`,
`makeElement`, `makeFoldkitApplication`, CLI, TUI, and React adapters now enter the same
Program engine. Foldkit rendering remains a client adapter over that engine and owns
only rendering concerns such as Mount DOM behavior, patch scheduling, document
metadata, and graphical diagnostics.

The Program URI boundary now uses reusable Case Path driven branch selection to compose
bidirectional state and replay parser-printers.

Remote DevTools read the Program journal directly through an injected transport. The
protocol also exposes Subscription and ManagedResource lifecycle diagnostics plus
terminal runtime failures without putting runtime handles in the Model.

Verbose CLI output currently narrates restoration, the requested Message, the final
Model, and the result. It is not yet the complete Command and Subscription diagnostic
timeline.

Detailed storage failure behavior, atomic file replacement, corrupted state recovery,
and concurrency policy remain deferred.

## Follow-up Direction

The canonical `examples/counter` remains the preferred starting point. Before merging
persistence into it, the Foldkit view, one-shot CLI, and interactive terminal client
will consume the exact same simple Model, Messages, init, and update. This keeps the
next experiment focused on host reuse rather than mixing the host seam with persistence
design.

`examples/counter/core` will own the only definitions of that Model, Message union,
init, and update. The sibling `foldkit`, `cli`, and `tui` packages will import those
exact definitions. They will not copy them or maintain equivalent client-specific
unions. `platform-node` will contain only genuinely Node-specific composition. A
Counter-specific file-storage implementation will not move into the canonical example.

The saved-state behavior remains in the advanced
`examples/counter-with-shared-state` proof until a generic Sharing API is designed.
That design should draw on Swift Sharing's strategy and key model and TanStack Query's
referential-identity guarantees without making the Counter maintain its own storage
protocol.

That investigation selected the lower-level engine. Existing `makeApplication` and
`makeElement` configurations are converted into Programs and then delegated to
`makeProgramRuntime`. `makeFoldkitApplication` remains the explicit entry point when a
caller already owns a Program definition.

### Canonical Counter extraction | 2026-07-23 17:27:16 EDT

The canonical Counter is now a group of four workspace packages:

```text
examples/counter/
  core/
  foldkit/
  cli/
  tui/
```

`core` is the only owner of `initialCount`, `Model`, `Message`, `init`, and `update`.
The graphical Foldkit client, one-shot CLI, and interactive terminal client import
those exact definitions from `counter-core-example`. They do not copy the Program or
introduce client-specific Message unions. The CLI and TUI run the shared Program
through `makeHostRuntime`, while the graphical client runs it through the canonical
`makeApplication` path.

The extraction deliberately does not add a `platform-node` package. Node-specific
terminal and process composition currently belongs only to its respective client, so
there is no genuine shared platform implementation to name or maintain. A sibling
platform package should be introduced only when at least two clients share a reusable
Effect service or Layer.

The canonical Counter remains stateless across process launches. Persistence,
observation, portable URI state, and foreground client launching remain isolated in
`examples/counter-with-shared-state` until the generic Sharing API is designed. The
workspace, website source viewer, playground bundler, example builder, and
`create-foldkit-app` scaffolder now understand the grouped Counter layout.

### React and React Native proof | 2026-07-23 18:19:00 EDT

The Counter example now includes a React-specific binding package plus React and
React Native clients:

```text
examples/counter/
  react-bindings/
  react/
  react-native/
```

`react-bindings` depends on React, Effect, `counter-core-example`, and a private
shared React binding proof. The shared proof contains the Foldkit runtime bridge.
Neither package depends on `react-dom`, browser APIs, Expo, or React Native rendering
primitives. The Counter binding exposes `CounterProvider`, `useCounterModel`, and
`useCounterActions`, so consuming components do not receive a Foldkit runtime and do
not import Effect.

The web React client owns its DOM rendering through Vite and `react-dom`. The
React Native client owns its native rendering through Expo and `react-native`.
Both import the same hook package and therefore send the same `ClickedIncrement`,
`ClickedDecrement`, and `ClickedReset` Messages into the same Counter Program.

The domain hook packages remain local to their examples, and the shared mechanics are
kept in a private example package. This proves the shape without canonizing a public
adapter API. The future generic adapter still needs to model platform dependency
selection, DevTools transport, and generic host-action manifests before moving into a
published package.

### React binding lifecycle correction | 2026-07-25 09:29:03 EDT

Counter and Calculator now share a private example-only React binding proof. This is
code reuse between examples, not a decision to publish the current API as Foldkit's
React adapter.

The first extraction of that helper created a Host Runtime during React render,
synchronously awaited initialization, hard-coded `Layer.empty`, and delayed disposal
with `setTimeout` to survive Strict Mode's development cleanup. That lifecycle was
rejected. An abandoned or repeated render could allocate a runtime that React never
committed, asynchronous init Commands could not complete through `Effect.runSync`, and
Programs with Resources or Subscriptions could not use the helper.

The corrected proof starts the Host Runtime only from the Provider's committed Effect,
closes its Scope during cleanup, accepts the Program's Resources Layer and optional
Subscriptions, and lets async init Commands update the Model through the normal
runtime. The Provider renders no children during the short interval before the runtime
is attached. Domain-shaped actions receive only an `enqueueMessage` function, not the
runtime, so they cannot read the Model, execute Commands, or control lifecycle.

The helper preserves stable Model snapshots, subscription functions, and action
objects for one mounted runtime. Its tests exercise React Strict Mode, an asynchronous
init Command, resource acquisition and release, Model observation, and action identity.
DevTools transport, crash presentation, a first-class Action manifest, and the final
platform Layer composition API remain open before this can become a supported adapter.

### Portable state and replay links | 2026-07-25 13:48:31 EDT

The replay proof is now one Schema-backed Foldkit Program consumed by React, Foldkit,
CLI, and TUI clients. Its Model owns the selected example, encoded base Model, action
tape, current frame, and playback state. React no longer keeps a parallel timeline in
component state. The private React adapter observes that Model and exposes typed actions,
while browser history remains a React host concern outside the adapter.

The canonical portable values are relative paths plus query parameters:

```text
/<example>/state?model=<schema-encoded-model>
/<example>/replay?model=<schema-encoded-starting-model>&actions=<action-ids>&frame=<index>&play=<0-or-1>
```

A state link reconstructs the exact visible example Model without history. A replay
link reconstructs the base Model, complete action tape, scrubber position, and whether
playback should continue. The existing React-only
`?example=<id>&actions=<ids>&frame=<index>` query is accepted as a legacy alias, but
printers emit only the canonical form. Action-only replay paths are also accepted and
use the example's initial Model so previously shared links remain valid. Parser-printer
tests cover relative values, absolute carrier URLs, Counter state, Calculator state
containing Effect `Option` values, replay-from-start links, and extending a new replay
from an arbitrary state link without losing that starting Model.

React and Foldkit hosts add their own scheme and authority without changing the
portable value. CLI and TUI clients accept either the relative value or any absolute
carrier URL. A replay opened with `play=1` produces the same finite playback Command
chain in every host. The CLI waits for that causal chain before printing, while the
rendered and terminal clients display the intermediate Models.

The action identifier registry is intentionally example-local prototype machinery. It
is sufficient for the finite Counter and Calculator controls, but a future reusable
replay package must define how arbitrary Message payloads are encoded without turning
the host action manifest into a second Message schema.

### Typed Program engine and replay extraction | 2026-07-25 15:50:49 EDT

The earlier `makeHostRuntime` and action-ID replay prototypes are superseded by a typed
Program engine. A Program now owns its stable id and version, Model Schema, Message
Schema, init, update, optional restore initializer, optional Subscriptions, and replay
tape migrations. It does not own a view, JSX, terminal presentation, platform Layer,
scheme, authority, or process-launch behavior.

`makeProgramRuntime` is the renderer-free execution engine. It owns Message ordering,
source and operation metadata, update, Commands, Subscriptions, one scoped Resources
Layer, causal completion, Model observation, and the complete typed transition journal.
`makeHostRuntime` remains only as a deprecated compatibility facade over this engine.
Counter, Calculator, their CLI and TUI clients, and the private React adapter now use
their canonical Program definitions directly.

`makeFoldkitApplication` is no longer an alias for `makeApplication`. It attaches
Foldkit rendering to `makeProgramRuntime`, observes Models, and presents the typed
journal through DevTools. `makeApplication` and `makeElement` preserve their public
configuration APIs, construct the same Program boundary internally, and delegate
execution to the shared engine. ManagedResources, Ports, navigation provenance, HMR
preservation, and graphical diagnostics now have parity through that path.

The engine owns a canonical relative URI parser-printer for every Program:

```text
/<program-id>/state?model=<schema-encoded-model>
/<program-id>/replay?tape=<schema-encoded-tape>&frame=<index>
```

This is the global portable URI. A platform carrier may add a scheme, authority, or
launch behavior, but it must pass the same relative path and query to the Program
router. The router is bidirectional and uses Case Path style case selection to print
tagged route unions. Its laws are `parse(print(route)) = route`,
`parse(print(parse(uri))) = parse(uri)`, and idempotent canonicalization. A state route
starts through the Program's restore initializer, so modeled transient states can
reconstruct required startup Commands instead of assigning a Model behind update's
back.

The runtime journal stores actual typed Messages, not host action ids. A transition
records sequence, source, causal operation id, whether that operation has settled,
returned Command metadata, timestamp, Model-change information, diff, and the resulting
Model. `excludeFromHistory` filters only the DevTools presentation projection. It does
not remove Messages from the underlying journal or exported tape.

A recursive Command chain means one requested Message returns a Command whose result
Message returns another Command. The focused proof is:

```text
RequestedSave
  -> Save
  -> CompletedSave
  -> Audit
  -> CompletedAudit
```

`run(RequestedSave())` completes only after `CompletedAudit`, and an immediate export
contains all three Messages. During historical inspection, update still reconstructs
Models from those Messages, but every returned historical Command is discarded. An
inert dependency Layer is not sufficient because it would still ask historical
Commands to run and invent result timing. A replay tape already contains the result
Messages as facts, so the deterministic operation is to execute zero historical
effects. When the user branches from a settled frame and sends a new Message, the new
live Commands use the normal injected Layer and extend the tape.

`ReplaySession` provides inert seeking and stepping. `ReplayController` adds the
explicit `Inspecting` and `Live` transition: it can inspect a tape, branch from a
settled causal boundary, run new live Messages, return to inspection, and print either
the exact current state route or the extended replay route. The shared replay
Workbench Program consumes this controller through an injected service. React,
Foldkit, CLI, and TUI clients consume that same Workbench Program. Its action manifest
determines only which Messages a host may send and how to label its controls. It is no
longer the tape format and no longer applies update itself.

### Global Program URI boundary | 2026-07-25 16:13:00 EDT

The canonical relative URI is an engine concern, not an optional client codec. Every
Program receives the same state and replay grammar from `Program.makeRouter`:

```text
/<program-id>/state?model=<schema-encoded-model>
/<program-id>/replay?tape=<schema-encoded-tape>&frame=<index>
```

Applications that register more than one Program compose those routers through
`Program.makeDestinationRouter`. Each branch supplies a Case Path that embeds its
typed `ProgramRoute<Model, Message>` in the application's Schema-backed destination
union and extracts it for printing. The engine selects the Program from the first path
segment, rejects missing, unknown, or duplicate registrations, consumes the complete
path, and uses the selected Program's Model and Message Schemas to decode the payload.
Clients do not inspect path segments or select parsers themselves.

The engine owns the relative path, query grammar, canonical query ordering, escaping,
parser-printer, typed destination, and interpretation of state and replay routes. A
state destination enters the Program through its restore initializer. A replay
destination enters through inert historical reconstruction at the requested frame.
The restore test parses a state URI whose initializer returns a Command and proves that
the resulting Message is processed before initialization completes.

Query parsing uses an immutable ordered pair representation implemented in portable
TypeScript. The engine does not depend on `URLSearchParams` or another platform URL
implementation. A platform may add or remove its scheme and authority, register
external launch behavior, and deliver the resulting relative path and query. React
and Foldkit entries pass `pathname + search`. CLI and TUI adapters may additionally
accept an absolute carrier and reduce it to that same relative value before calling
the engine.

The required laws are enforced at the engine boundary:

```text
parse(print(destination)) = destination
print(parse(uri)) = canonicalize(uri)
canonicalize(canonicalize(uri)) = canonicalize(uri)
```

The replayability example no longer contains the earlier action-id deep-link Program.
Its core exports only the Schema-backed Counter and Calculator destination union, the
engine-composed destination router, host-sendable action manifests, and one shared
Workbench Program. React consumes domain-shaped `useModel` and `useActions` hooks from
the generic adapter and imports neither Effect nor Foldkit runtime APIs in its
component. Foldkit renders the Workbench through `makeFoldkitApplication`. CLI and TUI
run it through `makeProgramRuntime`. Automated route, scene, process, and adapter tests
prove that the clients parse the same relative URI, reconstruct the same frame, and
extend the same typed tape. Production builds and direct HTTP checks prove that both
rendered clients serve state and replay routes. A live visual browser pass remains
separate verification and is not inferred from those automated checks.

The Workbench begins in an explicit `Loading` Model and returns an
`InitializeReplayWorkbench` Command from init. That Command waits for the selected
`ReplayController.initialization` before publishing the ready Counter or Calculator
Model. This is required for state URIs whose Program restore initializer returns
Commands. A client may render the loading state, but it cannot observe or print the
restored state as complete until the restore Command chain has settled. Initialization
failure becomes a `FailedInitializeReplayWorkbench` Message and a modeled `Failed`
state.

Foldkit DevTools is a projection of the shared runtime journal. The Foldkit adapter
subscribes before taking its initial history snapshot, projects every transition already
in that snapshot, and then drains the ordered transition queue. Sequence numbers remove
the overlap between the snapshot and queue. This prevents a fast init Command from
finishing before DevTools attaches and disappearing from the graphical history, while
the renderer-free journal remains the source of truth for every client.

### DevTools transport and causal provenance | 2026-07-25 16:42:10 EDT

The shared Program journal now projects through a renderer-independent DevTools
adapter. Attachment subscribes before reading the existing snapshot, catches up every
recorded transition, drains the ordered overlap queue, and deduplicates by engine
sequence. A fast initialization Command therefore cannot disappear between runtime
startup and DevTools attachment. DevTools exclusions remain presentation-only and do
not remove Messages from replay tapes.

The request and response bridge accepts an injected transport with runtime metadata,
outbound event and response functions, request and close subscriptions, and no browser
globals. The Vite hot-channel bridge is now one thin platform adapter over that
contract. A non-browser transport test proves connection, request handling, response,
and disconnect behavior without `window`, `document`, or WebSocket assumptions.

Transition provenance is carried through the DevTools store and wire protocol.
Mount-emitted Messages now enter the Program runtime as `Mount` with their definition
name, including when the Message crosses a Submodel boundary. The legacy compatibility
runtime has no typed source and serializes `None`, which keeps the protocol backward
compatible while making the migration boundary explicit. Host adapters can use the
public source constructors for Host, Command, Subscription, Mount, Port, Navigation,
and DevTools inputs rather than inventing strings.

### Live relative URI handoff | 2026-07-25 16:46:53 EDT

A live browser pass started from the engine state route for Counter count 7 in
the React client. The client canonicalized it to a replay tape at frame 0 and two
live increment Messages produced count 9 at frame 2. The exact relative replay
path and query were then opened on the Foldkit client. It reconstructed count 9
at frame 2, and one new increment branched into live execution at count 10 and
frame 3.

That pass exposed a carrier-only mismatch: React replaced its address after each
new tape, while Foldkit updated the share link but left the address on the prior
frame. `makeFoldkitApplication` now offers an `onModel` host observation callback.
The Foldkit entry uses it to replace the platform address with the engine-printed
relative replay URI. A second live pass verified that the visible frame, share
link, and current address all advance to frame 3. URI parsing and printing remain
in the engine. Browser history remains in the client entry.

### UUID-backed saved replay routes | 2026-07-25 18:36:16 EDT

Embedded replay routes remain the complete, transportable representation of a tape,
but they become too long for ordinary text sharing. The Program router therefore has
a second canonical replay form:

```text
/<program-id>/replay/<uuid>?frame=<index>
```

The UUID route is still an engine-owned relative URI. Its parser-printer lives beside
state and embedded replay routes, participates in the same typed destination union,
and preserves the requested frame. A platform still owns only its scheme, authority,
and launch behavior.

The engine does not choose a database or network protocol. `ReplayTapeStore` is an
injected Effect service that saves and loads the encoded typed tape under an
engine-derived identity. Resolving a saved route loads the tape, decodes it through
the selected Program's Model and Message Schemas, validates the requested frame, and
only then creates the replay controller. State and embedded replay branches perform
no storage I/O, although a caller resolving the complete route union still injects
the store capability for the saved branch.

The replayability example supplies one HTTP store strategy backed by
`tapes.knophy.com`. React, Foldkit, CLI, and TUI clients inject that same strategy.
The shared Workbench exposes save progress in its Model, replaces its replay URI only
after persistence succeeds, preserves the UUID while inspecting frames, and clears it
when a new Message branches the tape. Saving after switching Programs resolves the
active Program when the save Command runs, preventing a tape encoded with one Schema
from being stored under another Program's route.

The public React and Foldkit demos serve built, content-hashed assets and send
`no-store` cache headers. This prevents a public development hostname from combining
stale engine modules with a newer tape-store module. A live pass saved Calculator
`66×77 = 5,082` at frame 6, reloaded the resulting UUID route, opened it through both
rendered hosts, and produced `5,082` from the CLI using the same absolute carrier URL.

### Content-addressed replay identities and autoplay | 2026-07-25 22:54:03 EDT

New saved replay identities are deterministic content addresses rather than random
storage identifiers. The engine hashes the exact canonical encoded tape with SHA-256,
uses the leading digest bytes to construct an RFC-compatible UUIDv8 with the required
variant bits, and prints the identifier as `uuiduri:<uuid>`. The resulting route is:

```text
/<program-id>/replay/uuiduri:<uuidv8>?frame=<index>
```

`ReplayTapeStore` now receives the derived identity and encoded tape. It chooses how
to persist that key-value pair, but it does not invent identity. When the engine loads
a `uuiduri:` route, it derives the identifier again before decoding or replaying and
rejects a mismatch. The HTTP example store performs the same verification before it
writes. Existing UUIDv4 routes remain readable for prototype compatibility, but every
new save uses the verifiable content-addressed form.

Automatic playback is part of the same typed parser-printer. Adding `play=1` to an
embedded or saved replay route initializes the Workbench in `Playing`, runs the finite
playback Command chain from the requested frame, and returns to `Paused` at the tape
end. The canonical paused form omits the parameter. Saving exposes both a paused link
at the current frame and an autoplay link at frame zero. React, Foldkit, CLI, and TUI
consume the same route value and do not interpret the query independently.

A future compact notation for state and transitions may introduce additional leading
symbols and a compressed route payload. That grammar is intentionally deferred. It
must compose with the same parser-printer and content verification boundary rather
than replacing them with host-specific parsing.

### Client-agnostic runtime audit | 2026-07-25 16:27:30 EDT

Replayability is a property of Program execution, not of a renderer or DevTools UI.
The following capabilities are therefore required in the client-agnostic engine and
are implemented in the current Program prototype:

- Program identity and version, Model and Message Schemas, init, restore, update,
  Subscriptions, and tape migrations.
- One scoped Resources Layer, one ordered Message queue, re-entrancy protection,
  interruptible Command execution, Subscription lifetime, and causal completion for
  finite Command chains.
- Typed transition provenance, operation boundaries, Command metadata, timestamps,
  Model diffs, Model observation, and complete history observation.
- Renderer-independent DevTools history projection and protocol handling through an
  injected transport. The Vite WebSocket relay is one platform transport rather than a
  runtime assumption.
- Schema-encoded replay tapes containing actual Messages, inert historical
  reconstruction, settled-frame validation, inspection, stepping, live branching,
  and typed import, export, and migration failures.
- The canonical relative state and replay URI parser-printer, including typed
  multi-Program destination composition through Case Paths.

The following concerns must remain outside that engine:

- React scheduling, Foldkit patch scheduling, terminal redraws, process lifetime, and
  any other rendering or presentation policy.
- Scheme, authority, absolute URL handling, native deep-link registration, process
  launching, and other platform carrier behavior.
- JSX, Foldkit Documents, terminal strings, labels, control layouts, and the
  host-sendable action manifest. The manifest limits what a client may send. It is not
  history or replay data.
- Mount DOM behavior, document metadata, duplicate-id scanning, and graphical slow-view
  or slow-patch diagnostics.

### Client-agnostic runtime parity | 2026-07-25 19:07:27 EDT

The ordinary `makeApplication` and `makeElement` paths now delegate execution to the
same Program engine used by renderer-free clients. The parity work is complete at the
following boundaries:

- `ProgramRuntime` owns ManagedResource acquisition, replacement, access, failure
  handling, release, and the shared scoped Layer. Element-driven Mounts remain in the
  Foldkit adapter because their lifetime is caused by rendered element existence.
- `ProgramRuntime` owns typed inbound and outbound Port channels and exposes their
  handles. The graphical adapter binds its stable embedding handles to those channels
  without owning another channel implementation.
- Browser popstate, internal link, and programmatic URL listeners enqueue their
  Messages with typed `Navigation` provenance. Mount, Port, DevTools, Command,
  Subscription, ManagedResource, and Host sources use the same typed transition
  vocabulary.
- Subscription and ManagedResource lifecycle facts are available through synchronous
  reads, observers, and Streams. Each fact identifies the Program, definition,
  lifecycle instance, timestamp, transition, and rendered failure cause when present.
  The DevTools protocol and MCP bridge expose those diagnostics remotely.
- Terminal Update, Command, Subscription, and ManagedResource failures are available
  through a typed journal, observer, and Stream. Fire-and-forget clients cannot lose a
  terminal failure merely because they used `send`. DevTools exposes the same failure
  provenance and rendered Effect Cause.
- DevTools is a direct presentation over authoritative Program history. Its bounded
  state limits presentation transport only. The obsolete second recorder, keyframe
  Model copies, and reconstruction store have been removed. Time travel reads the
  Program journal Models and asks the rendering bridge to present the selected frame.
- The Foldkit adapter retains HMR Model preservation and restoration, visibility
  gating, Model freeze checks, slow update, view, and patch phases, duplicate-id
  checks, crash presentation, document metadata, and Mount provenance. These are
  adapter responsibilities because they depend on rendering or graphical platform
  behavior, not parallel application execution.

Lifecycle observation now consumes a replayed latest-Model publication. This closes a
startup race where an immediate host Message could arrive before a newly forked
Subscription or ManagedResource observer had received the initial Model. The replayed
publication preserves one latest value rather than introducing another source of
truth.

### Runtime throughput checkpoint | 2026-07-25 16:47:34 EDT

The compatibility runtime and shared Program engine were measured in separate
host-free dispatch lanes using the same 5,000-Message Counter burst, two warmups, and
eight measured runs. On this development machine, the compatibility path with
DevTools and Model freezing disabled measured a 37.1 ms median, 7.41 microseconds per
Message, and 134,892 Messages per second. The Program engine measured a 41.4 ms
median, 8.28 microseconds per Message, and 120,821 Messages per second.

The Program measurement includes its always-on typed journal and Model diff. The
compatibility measurement does not record history when DevTools are disabled. The
11.6 percent median-time difference is therefore a real current cost, not a pure
queue-to-queue comparison, and it identifies history policy as the first optimization
target if throughput matters. It does not block the architecture proof or change the
single-engine decision.

Foldkit render commit, React render commit, CLI formatting, and TUI redraw remain
unmeasured and must stay separate lanes. Lifecycle and diagnostic parity are complete;
future throughput work must optimize the shared engine without restoring a second
execution path.

### Side-effecting replay proof | 2026-07-26 01:19:54 EDT

The Fact Program proves replay behavior with an actual HTTP request rather than a
synthetic Counter transition. Its Model, Message, update, and `FetchFact` Command live
in one renderer-independent core package. The Command depends on a typed `FactClient`
Effect service. A separate HTTP package implements that service using Effect's
`HttpClient`, decodes the response through the Fact Schema, and maps every request or
decode failure back into `FailedFetchFact`. The Program never imports browser, Node,
React, terminal, or Foldkit view APIs.

The controlled `tapes.knophy.com/demo-effects/fact` endpoint returns a new request
identity with each response. React and the Foldkit view provide the HTTP implementation
with the platform-browser Fetch Layer. CLI and TUI provide the same implementation
with the platform-node Undici Layer. The four clients share the same Fact Program,
typed destination, Workbench, action manifest, state URI, replay URI, and saved-tape
format. Their only differences are rendering, native input mapping, and platform Layer
composition.

Historical replay does not replace application dependencies with inert Layers. The
engine reconstructs each frame by applying the recorded Message to update and
discarding the returned Commands. Recorded Command result Messages reproduce the
effect's prior outcome. A new host Message sent from an inspected settled frame creates
a live `ProgramRuntime` with the real Resources Layer. Its newly returned Commands run,
their result Messages are appended to the tape, and causal operation completion waits
for that finite Command chain. Tests count Fact requests across record, seek, and live
branch operations. Every seek remains inert, while each new live `ClickedLoadFact`
performs exactly one new request.

The proof assigns the following responsibilities to the Foldkit framework:

- Suppress historical Commands during reconstruction without changing update or
  replacing the Program's dependency Layer.
- Record actual host and Command-result Messages with their causal provenance and
  operation settlement.
- Validate settled branch frames, create the live runtime with its scoped Resources
  Layer, and extend the existing tape after a branch.
- Parse and print the canonical relative state and replay URI for every registered
  Program, independently of scheme and authority.
- Provide reusable conformance tests for “historical effects stay inert” and “new live
  effects execute once.” The generic replay-controller test already covers this rule;
  the Fact tests now demonstrate it with a typed side-effect service.

The application implementer remains responsible for these domain and platform facts:

- Define the `FactClient` capability, the `FetchFact` Command, its success and failure
  Messages, and the Model states needed to render Idle, Loading, Loaded, and Failed.
- Implement the capability against the chosen API and configure its endpoint.
- Select the platform HTTP Layer at the composition root.
- Decide which input Messages are host-sendable and give them client-appropriate labels,
  controls, and key bindings.
- Operate the demonstration endpoint. The Foldkit runtime must not own application API
  infrastructure.

Adding the third Program exposed repeated multi-Program Workbench selection, but it did
not expose a registration requirement for replay. ADR 0002 supersedes that
interpretation. Every Program runtime derives journal and replay behavior directly from
the Program. A future multi-Program composition helper may reduce exhaustive route,
Resources Layer, and presentation selection after the application chooses among its
Programs. Such a helper must remain optional and cannot define, enable, or change the
replay semantics of an individual Program. Presentation functions, host-sendable
actions, and input labels remain outside that composition helper.

### Cardboard semantic component projection | 2026-07-28 00:53:52 EDT

Cardboard now proves a smaller renderer-neutral presentation seam. `/0` contains a
finite Model value of `4`. `AdvancedCardboardSequence` derives `5`, then each later
natural value without storing an infinite list. The canonical parser-printer maps four
to `/0`, five to `/0/5`, and every later value to `/0/<value>`.

The Program projects its Model into a semantic `CardboardScreen` containing a
`CardboardButton` with text, an accessibility label, and a typed action. React,
Foldkit, React Native, CLI, and TUI consume that projection and choose only their
layout and native input mapping. Viewport classes such as tiny, drawer, phone, car,
television, browser, and native application remain host presentation context. They do
not become competing Program state.

## Open Questions

### 2026-07-23 16:58:52 EDT

#### How should Messages describe interactions across media?

The current simple Counter names its input Messages `ClickedIncrement`,
`ClickedDecrement`, and `ClickedReset`. Those are accurate facts when a person clicks a
button, but they are inaccurate when a CLI user enters a command, a terminal user
presses a key, or an agentic actor requests a domain operation.

The extraction will preserve one Message union, but its final vocabulary remains open.
We need to decide whether core Messages should describe medium-neutral domain facts,
such as `RequestedIncrement`, while each host exposes medium-appropriate actions that
map to those Messages. We also need to support one domain request carrying its complete
input, such as an adjustment amount, rather than forcing an agent or calculator to
simulate several button clicks by sending repeated Messages.

##### Current extraction decision | 2026-07-23 17:08:18 EDT

Preserve `ClickedIncrement`, `ClickedDecrement`, and `ClickedReset` unchanged for the
first package extraction. The Foldkit view, CLI, and TUI will import those exact
constructors from core. CLI and TUI inputs will temporarily map to the `Clicked*`
Messages rather than introducing parallel medium-specific Message unions. This keeps
the current slice focused on proving single-source Program reuse while the vocabulary
and host-action mapping question remains open.

Messages must remain past-tense facts, and update remains the only place that changes
the Model. This question concerns the factual boundary between host interaction and
domain request. It does not authorize Commands to mutate the Model or introduce another
source of truth.

#### What is the generic Sharing key API?

The preferred domain name is `CounterKey`, not `CounterValue`. It should be constructed
through a generic API such as `Sharing.key` and associate a Schema with a default or
initial value. The canonical initial count will be defined independently in core and
reused by both init and `CounterKey`. The remaining open question is the exact
`Sharing.key` API and how a host selects its persistence and observation strategy.

The Sharing facility must own reusable load, save, and observation strategy mechanics.
The Counter must not maintain a bespoke storage protocol or duplicate its Schema and
initial value across strategies.

#### Does the React adapter require generated code?

Generation remains an open implementation choice. A generic adapter may be able to
accept the typed Program boundary and an explicit host-action manifest and infer
domain-shaped `useModel` and `useActions` hooks without emitting source files. Any
approach must make invalid action names and payloads TypeScript build errors and expose
only host-sendable Messages.

The first implementation will attempt this generic, inference-based factory. Generated
source files are a fallback only if TypeScript cannot provide the domain-shaped API or
useful build-time diagnostics through inference.

The React boundary must keep its store instance, snapshots, subscriptions, and action
functions referentially stable. The design should draw on TanStack Query's stable
observer lifetime, `useSyncExternalStore` bridge, stable mutation callback, shallow
notification check, and structural-sharing tests. Relevant source is pinned to TanStack
Query commit `86bb8a6fb2c7f15c74ff50afba053d778e6edc23`:

- [`useBaseQuery`](https://github.com/TanStack/query/blob/86bb8a6fb2c7f15c74ff50afba053d778e6edc23/packages/react-query/src/useBaseQuery.ts#L95-L124)
- [`useMutation`](https://github.com/TanStack/query/blob/86bb8a6fb2c7f15c74ff50afba053d778e6edc23/packages/react-query/src/useMutation.ts#L30-L68)
- [`QueryObserver.updateResult`](https://github.com/TanStack/query/blob/86bb8a6fb2c7f15c74ff50afba053d778e6edc23/packages/query-core/src/queryObserver.ts#L645-L664)
- [`replaceEqualDeep`](https://github.com/TanStack/query/blob/86bb8a6fb2c7f15c74ff50afba053d778e6edc23/packages/query-core/src/utils.ts#L282-L334)

These references inform the future React adapter. They do not require deep structural
sharing in the core runtime, CLI, or TUI.
