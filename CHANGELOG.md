# Change Log

Newest entries appear first. Implementation commits and intent are recorded separately from ledger-only commits.

<!-- change-log:entries -->

## July 27th, 2026 at 12:04:03 p.m. EDT — `b4f1fdf67246` feat(foldkit): record replay runtime events

- **Implementation commit:** `b4f1fdf6724660bfa7fdf8ad455d6f8799c5b36d`
- **Change:** Add an engine-owned runtime-event timeline for replayable host facts that are not domain Messages.
- **Details:**
  - Runtime events are anchored to frames, encoded in portable tapes, surfaced by replay controllers, and observed without changing the Model.
  - Historical inspection remains inert, and branching retains only events that had occurred at the selected settled frame.
  - Dependency adapters can now record environment selections without adding platform concerns to update.
- **Files:**
  - `packages/foldkit/src/runtime/programRuntime.ts` — Expose the live runtime-event timeline and include its events in replay tapes.
  - `packages/foldkit/src/runtime/replayTape.ts` — Encode, decode, and branch frame-anchored runtime events with backward-compatible defaults.
  - `packages/foldkit/src/runtime/replayController.ts` — Publish runtime events in both live and inspecting controller snapshots.
  - `packages/foldkit/src/runtime/programRuntime.test.ts` — Prove runtime events do not become transitions and make asynchronous failure assertions deterministic.
  - `packages/foldkit/src/runtime/replayTape.test.ts` — Prove branch truncation keeps only events that occurred by the selected frame.
  - `docs/adr/0002-universal-program-replay.md` — Record why dependency selection is a runtime event rather than a Message.
- **User context (verbatim):**
  > but I think we want to track that in the replayability tape.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 11:53:07 a.m. EDT — `f2b7fd5719dc` feat: harden universal Program clients

- **Implementation commit:** `f2b7fd5719dcaf46ffe13d8879206a2f161b391d`
- **Change:** Harden the renderer-independent Program runtime and prove scoped React ownership with a switchable Fact dependency.
- **Details:**
  - Program Resources now acquire during cancellable startup and preserve typed failures through the client lifecycle.
  - Replay validation and settled branching are shared by runtime entry points, while the TUI derives native shortcuts from the active Program action presentation.
  - React owns one scoped runtime through Strict Mode, server rendering stays inert, and the Fact client demonstrates host-selected Mock and Live Layers.
- **Files:**
  - `packages/foldkit/src/runtime/programRuntime.ts` — Acquire Resources eagerly inside the runtime scope and preserve typed startup failures.
  - `packages/foldkit/src/programRuntime/public.ts` — Expose renderer-independent runtime and replay APIs without browser dependencies.
  - `examples/shared/react-bindings/src/reactProgram.tsx` — Own asynchronous React startup, observation, cancellation, and ordered teardown.
  - `examples/shared/react-bindings/src/dependencyChoice.ts` — Prove one typed, scoped, host-switchable Effect dependency.
  - `examples/fact/react/src/App.tsx` — Exercise the canonical Fact Program through the React dependency choice.
  - `examples/replayability/tui/src/host.ts` — Derive TUI actions from shared Program presentation and handle terminal lifecycle cleanly.
  - `docs/adr/0002-universal-program-replay.md` — Record the client boundary and lifecycle decisions plus remaining promotion work.
  - `scripts/change-log/record_change.py` — Install deterministic intent-ledger recording for future increments.
- **User context (verbatim):**
  > Making sure you're committing all these things as well.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

