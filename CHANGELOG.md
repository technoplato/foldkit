# Change Log

Newest entries appear first. Implementation commits and intent are recorded separately from ledger-only commits.

<!-- change-log:entries -->

## July 27th, 2026 at 2:00:49 p.m. EDT — `ad0e785a2316` feat(react-native-showcase): model scene navigation

- **Implementation commit:** `ad0e785a231638535dae9a03179e4d619ad2f3cf`
- **Change:** Model showcase scene navigation as a portable replayable Program.
- **Details:**
  - Added a Schema-backed navigation Model and factual tap and opened-path Messages shared by every renderer.
  - Added React and React Native bindings that expose domain-shaped Model, action, and replay hooks without renderer or Effect vocabulary in consuming screens.
  - Projected canonical relative scene, state, and replay paths through Expo Web history and native Linking while preserving independent child Program tapes.
  - Verified the landing-to-Counter transition, browser history, portable state and replay deep links, an iOS simulator interaction, and Web, iOS, and Android production exports.
- **Files:**
  - `examples/showcase/core/src/model.ts` — Own the renderer-neutral scene union.
  - `examples/showcase/core/src/message.ts` — Define factual scene and opened-path Messages.
  - `examples/showcase/core/src/route.ts` — Parse and print canonical relative scene paths.
  - `examples/showcase/react-bindings/src/showcase.tsx` — Expose renderer-neutral React bindings and replay controls.
  - `examples/react-native-showcase/src/App.tsx` — Adapt browser history and native Linking to the shared navigation Program.
  - `docs/adr/0003-navigation-as-state.md` — Record the Expo proof and remaining navigation-carrier seam.
- **User context (verbatim):**
  > we need to model that in our domain as uh counter button tapped and then navigate
  > that's a scene we need to figure out in our adapters
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 1:13:46 p.m. EDT — `608679bbe8b0` feat: integrate replayable universal clients

- **Implementation commit:** `608679bbe8b0e6beaa126e0d2fe6a5ebdfcd8be7`
- **Change:** Expose canonical replay paths across React clients and add one cross-platform Expo showcase.
- **Details:**
  - React consumers now receive stable inspection, seeking, stepping, branching, runtime-event, and canonical relative path capabilities from one domain-shaped replay hook.
  - Counter, Multiple Counters, Calculator, and Fact reuse their canonical Programs and React bindings in ordinary React applications and one Expo Web, iOS, and Android showcase.
  - Successful dependency selections are recorded at replay frames and restored before Effect Layers are acquired for a live branch.
  - The Expo build preserves Effect runtime getters through a spec-compliant object-spread transform; the ADR assigns that compatibility requirement to future Foldkit Expo integration.
- **Files:**
  - `packages/foldkit/src/runtime/replayController.ts` — Expose the engine-owned Program parser-printer from each replay controller.
  - `examples/shared/react-bindings/src/replayableReactProgram.tsx` — Expose domain-shaped replay hooks and canonical relative path promises.
  - `examples/react-native-showcase/src/App.tsx` — Run Counter, Multiple Counters, Calculator, and Fact through one Expo host.
  - `examples/react-native-showcase/src/platform.ts` — Compose two typed switchable dependency choices for Fact.
  - `examples/react-native-showcase/babel.config.js` — Preserve Effect runtime getters under Metro.
  - `docs/adr/0002-universal-program-replay.md` — Record React, dependency, and Expo integration decisions.
- **User context (verbatim):**
  > The React Native app is gonna be a showcase, because we're not gonna have one app for example.
  > And let's show it working with Expo Web and Expo on iOS and Android.
  > Let's add multiple switchable dependencies per client.
  > Making sure you're committing all these things as well.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 12:37:14 p.m. EDT — `e7c0dc63062a` feat: canonicalize replayable Program clients

- **Implementation commit:** `e7c0dc63062a478acc23b661624f0775ab51faf5`
- **Change:** Canonicalize replay inspection, branching, and typed React dependency selection.
- **Details:**
  - Scoped each live replay branch independently so inert inspection releases resources and a later branch acquires a fresh Layer.
  - Exposed an asynchronous React replay interface with typed routes, frame navigation, runtime events, and automatic branching from settled historical frames.
  - Added arbitrary typed dependency sets whose selections are recorded as frame-anchored runtime events and restored before replay branches acquire services.
- **Files:**
  - `packages/foldkit/src/runtime/replayController.ts` — Own branch lifecycle, inspection, and replay timeline semantics.
  - `examples/shared/react-bindings/src/replayableReactProgram.tsx` — Expose the canonical renderer-neutral React replay hook surface.
  - `examples/shared/react-bindings/src/dependencyChoice.ts` — Compose typed switchable dependency Layers and record causal selection events.
  - `docs/adr/0002-universal-program-replay.md` — Record the replay and dependency-selection decisions.
  - `.changeset/add-view-agnostic-runtime-prototype.md` — Describe the published Foldkit API changes.
- **User context (verbatim):**
  > We need to think about the semantics for how you actually engage in a replay, what it should look like, what the most ergonomic solution would be.
  > Let's add multiple switchable dependencies per client.
  > I think we want to track that in the replayability tape.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

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

