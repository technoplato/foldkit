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

Introduce a renderer-free runtime prototype named `makeHostRuntime`. It owns Message
ordering, update execution, finite Command execution, persistent Subscription
lifetimes, shared Effect resources, and shutdown without assuming a view.

The prototype exposes these host capabilities:

- Read the current immutable Model synchronously.
- Enqueue a Message without waiting for its resulting work.
- Observe changed Models.
- Run a requested Message until its causally produced finite Command and result-Message
  chain completes.
- Await the finite Command chain returned by init.
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

The prototype also creates temporary duplication. `makeHostRuntime` has its own
Message, Command, Subscription, and resource loop while the canonical runtime retains
its existing loop. This duplication is not the intended final architecture. The next
step is to extract one shared runtime engine and make Foldkit rendering one host adapter
over that engine.

The current URI proof exhaustively selects among individual Foldkit Routers when
printing, but it does not yet add a reusable Case Path driven union Biparser.

Remote DevTools are not yet connected to the renderer-free runtime. A future slice must
separate transport-neutral runtime history from presentation callbacks and add
Subscription start, stop, restart, and failure diagnostics.

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

The next investigation will determine whether `makeApplication` should accept a shared
Program definition plus a Foldkit view adapter, or whether a lower-level shared engine
should sit beneath both `makeApplication` and `makeHostRuntime`.

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
