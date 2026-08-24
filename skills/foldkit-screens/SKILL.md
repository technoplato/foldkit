---
name: foldkit-screens
description: Build renderer-free Foldkit Programs whose screens are portable instruction trees painted by every Client. Use for UiNode screen authoring, atomic design tiers over core logic, ASCII-first design iteration and agent review loops, machine-backed headless components, cross-renderer navigation, or adopting Instant realtime sync in a new example. Triggers on Program.screen, paintHtml/paintReact/paintTui, UiNode, renderers, host chrome, or view agnosticism.
---

# Foldkit Screens

A Program owns facts and instructions. Clients own pixels. Everything else in
this skill follows from that split.

## The law

One direction of data flow, three layers, no exceptions:

```
core        facts + instructions     Model, Message, update, valid, screen -> UiNode
adapter     transport + lifecycle    engines, Layers, handles, argv, sockets, auth
view        pixels                   painters: UiNode -> HTML / React / ANSI / Renderable
```

Membership tests. Apply them to every line you are about to write:

1. **Core test.** Would this survive a world with no DOM, no terminal, and no
   network? Strings for humans (labels, hiddenBecause sentences) yes;
   `document.*`, `crypto.randomUUID`, env vars, timers no.
2. **Adapter test.** Does this choose _which_ engine, socket, process, or
   identity this occurrence uses? Then it is adapter code, even when it calls
   only core functions.
3. **View test.** Does this turn instructions into pixels? Then it may read the
   tree and nothing else. A painter never invents business decisions, never
   throws, never reaches back into Model.

If a function passes two tests, split it. If it passes none, delete it.

## Workflow

1. **Model first.** Encode the domain so invalid states are unrepresentable
   (`$foldkit-schema-modeling`). The screen is a projection of Model; if you
   cannot draw it from Model alone, the Model is wrong.
2. **Actions next.** Declare Messages with their metadata (`md`) so keys,
   tokens, spoken forms, gates, and ACESS sentences have one home
   (`examples/counter/core/src/message.ts`). Validity lives on the declaration,
   not at call sites.
3. **Screen tree from Model only.** `Program.screen(model, context)` returns
   UiNode. Compose atoms into named pure functions (`productView`). Device
   chrome arrives through `context.device`, never imported by product views.
4. **Review in ASCII before writing any painter.** See the loop below.
5. **Painters per client.** Each maps nodes to its platform's primitives and
   routes tokens to Messages through ONE shared router. Nothing else.
6. **Wrap for sync.** `Program.compose.sync({ of, snapshot, message })` plus an
   engine Layer per client. Core never imports a transport.
7. **Wire the handle.** Adapters start one occurrence
   (`startLiveCounter(...)`), subscribe, coalesce paints, and stop on teardown.

## Atomic design tiers

The taxonomy disciplines where UI decisions live. It sits on top of core logic,
never beside it:

| Tier     | Is                                         | Lives in                              | Counter example              |
| -------- | ------------------------------------------ | ------------------------------------- | ---------------------------- |
| Atom     | One node constructor call                  | `foldkit/renderers` elements          | `Text`, `Button`, `Row`      |
| Molecule | Named pure `(model) -> UiNode` beside core | core, next to update                  | `productView`                |
| Organism | Subtree owning behavior via composition    | `Program.compose.*`, action menu rows | ActionMenu catalog           |
| Template | Device/host shell around a screen          | `wrapDevice`, host chrome lookup      | `counterScreen` with context |
| Screen   | The whole projection for one destination   | `Program.screen`                      | `App.screen(model)`          |

Rules:

- Atoms are closed vocabulary. Do not fork per-client node kinds; extend
  `renderers` once so every painter inherits it.
- Molecules take Model and return trees. No callbacks into clients, no env, no
  clock. Two clients painting one molecule must agree cell for cell.
- Host chrome (title, description, source URL) is looked up, never invented:
  `surfaceFor(id)` (`examples/counter/core/src/hostSurface.ts`). An adapter that
  hardcodes its own title string has left the architecture.

## The ASCII-first loop

Designs are derived and iterated as text before any pixel work. Text is cheap
to diff, cheap for agents to review, and forces layout decisions into data.

1. Sketch the state's tree by hand or generate it from Model.
2. Paint it with the string pipeline (`renderScreen` / `renderAscii`,
   `packages/foldkit/src/renderers/render.ts`). Paste the frame into the task.
3. Review against the checklist below. Iterate on the TREE, not the picture.
4. Only then implement per-client painters, mapping each node faithfully.

Agent QA checklist per frame:

- Alignment and overflow: does any row exceed width? What truncates, what wraps?
- Every interactive element shows its availability: valid, disabled-because, or
  absent. Availability invisible in the mockup will be invisible in production.
- Keyboard journeys walk: focus marks, open/close, selection, escape. If focus
  cannot be drawn, the vocabulary is missing a field, not the mockup lazy.
- Overlay states float: an overlay drawn as a stacked Column is a lie about
  z-order that each client will re-fake differently.
- Identity: mapped children carry stable ids, not positions.

## Machine-backed components

Interactive widgets (menu, combobox, popover, dialog) get deterministic cores.
Verdict from research: borrow semantics, do not add dependencies.

- effect-machine pins exact peer `effect@4.0.0-rc.111` while the repo is on
  beta.97; it is pre-1.0 with breaking minors and states its intent to be
  absorbed into Effect core. Revisit when versions align or Effect ships
  Machine. Zag.js solves platform agnosticism with N mutable interpreters and
  imperative DOM effects; copy none of that.
- Take instead: Mealy purity (planning never awaits), macrostep stabilization
  (drain raised events to quiescence before surfacing a step), three-channel
  protocol (inbound facts, raised internal events, emitted outward facts),
  schema-validated boundaries, anatomy as a typed part registry, prop getters
  as a pure projection layer, and trace-based conformance testing.

The Foldkit-native contract (direction, evolving in
`packages/foldkit/src/experimental/machine/`):

```ts
interface ComponentMachine<
  State extends Tagged,
  In extends Tagged,
  Out extends Tagged,
> {
  readonly id: string
  readonly initial: State
  readonly step: (state: State, input: In) => Plan<State, Out>
  readonly handles: (state: State, inputTag: string) => boolean
}
```

`step` returns data: next state, emitted facts, side-effect Commands, activity
descriptors (timers/resources owned by entered states). Wiring stays inside
existing primitives: update forwards interaction facts to `step`, dispatches
returned Commands, and emitted facts re-enter the normal Message queue so every
client paints them identically. Activities become ManagedResources or
Subscriptions.

Choose deliberately, per widget:

- Stateless, configuration-only control -> render helper called directly.
- Interaction state that must ride the tape (shared, synced, replayed) ->
  machine state composed into the Program Model (how actionMenu composes).
- Interaction state that must NOT ride the tape (ephemeral hover/focus) ->
  client-local, but still driven by facts, never by painters reading DOM.

## Navigation across renderers

Destinations are Schema sum types in core. The URL is a projection, not a
second Model (`$foldkit-navigation`, `docs/adr/0003-navigation-as-state.md`).

- Pair parse and print. `parse(print(destination)) == destination`; test both.
- Adapters translate carrier URIs (browser history, argv, custom scheme) into
  `OpenedNavigation` / `ChangedUrl`. update owns the next Model; named Commands
  emit `pushUrl` / `replaceUrl` / `back`.
- `Transition<Route>` diffing gives enter/exit/stayed purely; renderers receive
  the resulting screen, they never diff URLs themselves.
- Deep-link everything representable, including private share states. Access is
  permissions, not the absence of a link.
- Engine-level routes (`/{programId}/state`, `/replay`) compose with app
  destinations via `routeCase` / `makeDestinationRouter`.

## Adopting realtime sync in another example

Counter is the reference implementation. Checklist distilled:

1. Define the wire pair in core: snapshot Schema + message Schema with
   `S.decodeTo` doors (`wire.ts`). Fill times and ids at write time in the
   runtime, never in Schemas' encode direction by hand.
2. Wrap once: `compose.sync({ of: App, snapshot, message })`.
3. Per client, pick the engine in a Layer: live Instant, Memory for tests and
   `*_TAPE=memory`, transport injection for determinism.
4. Give every occurrence a unique processor id + instance suffix. Echo
   suppression drops live rows whose `from` equals your id; two tabs sharing a
   processor string silently eat each other's messages.
5. Failure posture: Starting -> Failed at boot; Ready stays Ready on later sync
   failures and reports through `SyncFailed`. Never fabricate Ready. A fake
   Ready showing count 0 is a lie users repeat to each other.
6. Wait helpers come from core (`waitForSyncedHandle`); adapters do not grow
   private ready-wait variants.

## Reject

- Token strings hardcoded in a switch inside any painter or host. Route tokens
  through one core helper (`actionByToken` + menu prefixes).
- `${token}${value}` concatenation to smuggle payloads; payload belongs in a
  typed field.
- Painter-thrown errors on unknown tokens. Log-and-drop at the host boundary.
- Key->Message or tap-handle matching reimplemented per client; it belongs
  beside `factHandleEntries`.
- Parallel runtime abstractions beside the handle (a second window/runtime
  type). One occurrence model, one handle shape.
- No-op action facades that swallow taps when not Ready; return gated handles
  that say why (`TapHandle.Hidden({ because })`).
- Presentation numbers dropped by some painters (gap, padding, variant): if a
  painter ignores a field, fix the painter or remove the field. One meaning per
  field, honored everywhere.

## Source anchors

- `packages/foldkit/src/program/program.ts` - Program contract, valid, screen
- `packages/foldkit/src/program/compose.ts`, `sync.ts`, `actionMenu.ts`
- `packages/foldkit/src/renderers/` - types, elements, layout, paint, render
- `packages/foldkit/src/runtime/start.ts`, `syncEngine.ts` - boot, echo rules
- `packages/react/src/` - bindProgram, useModel/useScreen, paintReact
- `examples/counter/core/src/` - the reference portable Program
- `examples/counter/.look/GROK-REPORT.md` - overlay painted via App.screen
- `.agents/skills/design-tuis/SKILL.md` - terminal design method
