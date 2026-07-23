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

The first proof is a Counter with three Model cases:

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

Counter persistence is represented by a backend-neutral service:

```text
CounterStorage
  load     -> Effect<Option<StoredCounter>>
  save     -> StoredCounter -> Effect<void>
  changes  -> Stream<StoredCounter>
```

The file-backed implementation watches the containing directory and filters for the
state filename, so observation works before the state file exists. An outside value
re-enters update through `ObservedStoredCounter` and produces no persistence Command,
preventing a write-back loop. Another backend can implement the same service without
changing the Counter Program.

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

The canonical `examples/counter` must become the single Counter business-logic source.
The current CLI Counter duplication will be removed. The example should be reorganized
around shared core logic with separate host folders for the Foldkit view, one-shot CLI,
interactive terminal client, and future adapters.

The next investigation will determine whether `makeApplication` should accept a shared
Program definition plus a Foldkit view adapter, or whether a lower-level shared engine
should sit beneath both `makeApplication` and `makeHostRuntime`.
