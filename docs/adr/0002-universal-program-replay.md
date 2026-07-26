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
