---
name: foldkit-screens
description: Build renderer-free Foldkit Programs whose screens are portable screen trees painted by every Client, and write each UI behavior once in core as a block (state, facts, instructions) that painters only run. Use for UiNode screen authoring, where a UI rule goes (core behavior or a painter's mechanic), blocks, parts and slots, atomic design tiers over core logic, ASCII-first design iteration and agent review loops, cross-renderer navigation, or adopting Instant realtime sync in a new example. Triggers on Program.screen, paintHtml/paintReact/paintTui, UiNode, renderers, foldkit/behavior, TranscriptFollow, a timer or a listener in a painter, the painter ratchet, host chrome, or view agnosticism.
---

# Foldkit Screens

A Program owns facts and the screen tree. Clients own pixels. Everything else
in this skill follows from that split.

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

## The law

One direction of data flow, three layers, no exceptions:

```
core        facts + screen tree      Model, Message, update, valid, screen -> UiNode
            behavior                 blocks: step(state, context, fact) -> state + instructions
adapter     transport + lifecycle    engines, Layers, handles, argv, sockets, auth
view        pixels + mechanics       painters: UiNode -> HTML / React / ANSI / Renderable
```

Membership tests. Apply them to every line you are about to write:

1. **Core test.** Would this survive a world with no DOM, no terminal, and no
   network? Strings for humans (labels, hiddenBecause sentences) yes;
   `document.*`, `crypto.randomUUID`, env vars, timers no.
2. **Adapter test.** Does this choose _which_ engine, socket, process, or
   identity this occurrence uses? Then it is adapter code, even when it calls
   only core functions.
3. **View test.** Does this turn the screen tree into pixels? Then it may read
   the tree and nothing else. A painter never invents business decisions, never
   throws, never reaches back into Model.
4. **Rule test.** Is it a number with a unit of time, distance or count
   (500 ms, 10 px, 5 tries), or a branch on what the person meant (a hold is
   not a press)? Then it is a rule, and it goes in
   `packages/foldkit/src/behavior/`, never in a painter. How one platform
   measures, scrolls, listens, waits and draws is a mechanic, and stays in the
   painter. "Try again up to 5 times, 120 ms apart" is a rule; "ask the list to
   scroll to an offset" is a mechanic.

If a function passes two tests, split it. If it passes none, delete it.

Where each kind of thing goes:

| What you are about to write                         | It is                     | Where it goes                                   | Example in this repo                                        |
| --------------------------------------------------- | ------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| A fact about the domain, or what a screen shows     | Model, Message, screen    | the domain core                                 | `examples/books/core/src/screen.ts`                         |
| A number with a unit, or a branch on what was meant | a rule, in a block        | `packages/foldkit/src/behavior/`                | `LEAVING_QUIET_MS = 1000` in `behavior/transcriptFollow.ts` |
| State the screen or an agent reads                  | device or logged home     | the Model, through the block's `step` in update | `Reader.State` in Books' and Words' Model                   |
| Memory of timing or measurement that nothing reads  | painter home              | the block's runner                              | `TranscriptFollow.start(ports)` holds the quiet second      |
| How this platform measures, scrolls, listens, waits | a mechanic, behind a port | the painter                                     | `sightOf` and the `wait` port in `renderers/htmlEdge.ts`    |
| Role, focus and which gesture becomes which fact    | a slot's declaration      | the part, in core (plan 14, slice 4)            | not built yet                                               |

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

## Behavior: blocks, parts and slots

Interactive behavior (a menu, a combobox, a dialog, following the voice) is
written once in Foldkit core and run by every painter. The words are in
`glossary.md` under "Behavior and painters"; the plan is `plans/14-ui-v1.md`.

Borrow semantics, add no dependency. From Zag.js take the state charts, key
maps and ARIA tables as data, `connect` as a pure projection, and anatomy as
slots. Do not take its per-framework interpreters or its DOM lookups. Each
reference repo under `repos/` is text to read, never code to import.

**A block** is one small behavior. This is the one contract:

```ts
type Block<State, Context, Fact, Instruction> = Readonly<{
  State: Schema<State>
  Fact: Schema<Fact>
  Instruction: Schema<Instruction>
  initial: State
  step: (
    state: State,
    context: Context,
    fact: Fact,
  ) => Readonly<{ state: State; instructions: ReadonlyArray<Instruction> }>
}>
```

- `step` never waits, never reads a clock, never touches a platform. Time
  arrives in `context.nowMs`. A timer is an instruction out
  (`WaitForLeaveCheck({ afterMs: 250 })`) and a fact back in
  (`ElapsedLeaveWait()`).
- State holds no sentinel. A time that has not happened is `Option.none()`,
  never `Number.NEGATIVE_INFINITY`, so the State can be written as JSON.
- Items are data. A menu's order comes from its `items`, never from asking
  the page which element is next.

`Machine.define` (`packages/foldkit/src/experimental/machine/`) stays for a
Program's own domain state charts, whose edges return Commands
(`examples/cardboard`). A block does not use it, because a block must also
run where there are no Commands.

**A part** is a whole component: its blocks, its slots (each painted element,
with its role, focus and gestures as data), its Actions, and a pure
`project(state, props)` that says what each slot shows. A painter hosts any
part through one generic host and imports no part's rule. The Part declaration
and the host are plan 14's slice 4 and are not built yet.

**Three homes for a block's state.** Ask in order:

1. Does anything painted, or anything an agent reads, depend on it? If no, it
   is only memory of timing or measurement: **painter home**. The runner holds
   it. Example: the quiet second after a scroll.
2. Should another device or the log see it? If yes: **logged home**, in the
   Model, an ordinary Message. Example: which page is on the stack.
3. Otherwise: **device home**, in the Model, never logged. Example: Books'
   title menu; `Reader.State`.

Worked example of painter home: `TranscriptFollow`
(`packages/foldkit/src/behavior/transcriptFollow.ts`, `foldkit/behavior`),
how a Transcript's view follows the voice. The rule is one pure function, and
painters only measure, scroll, listen, wait and press.

```ts
TranscriptFollow.step(
  TranscriptFollow.initial,
  { isFollowing: true, hasLeave: true, nowMs: 5_000 },
  TranscriptFollow.ScrolledByReader(),
)
// { state: { maybeReaderScrolledAtMs: Option.some(5_000), ... },
//   instructions: [WaitForLeaveCheck({ afterMs: 250 })] }
```

- Facts in: `ChangedSpokenWord`, `ResumedFollowing`, `NamedWord`,
  `ScrolledByReader`, `ScrolledView`, `ElapsedLeaveWait`, `MeasuredWord`.
- Instructions out: `MeasureWord`, `BringToMiddle`, `WaitForLeaveCheck`,
  `PressLeave`.
- One shared runner, `TranscriptFollow.start(ports)`, holds the state. A
  painter gives it six ports (`now`, `wait`, `told`, `measure`,
  `bringToMiddle`, `pressLeave`) and tells it facts. The runner names no
  timer: the painter's `wait` says how its platform waits. The HTML edge, the
  React painter, and the React Native painter are each that and nothing more.

Worked example of device home: `Reader`
(`packages/foldkit/src/behavior/reader.ts`): following or detached, the way
back, and a named place, kept in Books' and Words' Model and stepped in
update.

When a painter needs a behavior, write the rule this way first. A second
painter that reimplements a rule, such as its own quiet period after a scroll,
has left the architecture.

**What holds this.** `pnpm lint` runs two gates beside oxlint:

- The painter ratchet (`pnpm check:painter-ratchet`) counts, per painter
  file, timers and clocks, held state, listeners, and numbers other than 0
  and 1, against `scripts/painter-ratchet/painters.json`. A rise fails. Zero is
  where each file is headed: a count above zero is a rule still to move into
  core, not a budget. A fair rise (a layout number such as `padding: 24`) is
  recorded in that file with a `rises` entry that says why.
- `.oxlintrc.json` forbids `document`, `window`, timers, and any import of the
  DOM, React or React Native inside `packages/foldkit/src/behavior/`.

Each painter's folder has an `AGENTS.md` with the rule and one example from
that painter.

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
- `packages/foldkit/src/behavior/` - blocks: `TranscriptFollow`, `Reader`
- `scripts/painter-ratchet/` - the painter ratchet and its two ledgers
- `plans/14-ui-v1.md` - the rule, the contract, the three homes
- `packages/foldkit/src/runtime/start.ts`, `syncEngine.ts` - boot, echo rules
- `packages/react/src/` - bindProgram, useModel/useScreen, paintReact
- `examples/counter/core/src/` - the reference portable Program
- `examples/counter/.look/GROK-REPORT.md` - overlay painted via App.screen
- `.agents/skills/design-tuis/SKILL.md` - terminal design method
