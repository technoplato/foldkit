# Intentions — evolving architecture (ADR 0011)

This is the home for architecture ideas that are not yet locked Qs.
Agents read this **and** `qanda.md`. Do not invent a second gospel
in a random root README.

Decoded from a bad voice transcript, 2026-08-26. The app itself is
out of scope this interview.

## Directories (what already exists)

```text
/Users/laptop/Development/foldkit
  branch ml/exploring-view-agnosticism
  gospel closest: examples/counter

/Users/laptop/Sync/tca/ports/rust
  Foldkit-nav / UniFFI / Instant port (prototype)

/Users/laptop/Sync/tca/canonical/TCA26
  TCA 2 private beta — do not push pointfreeco

brainstorming/ideas/domain-as-tree-pis
  PIS / nested ADT explorer (book, media, …)
  Counter does not use this yet
```

## Layout description (continuing, both options)

The Program may also describe **layout** as a host-neutral tree
(atoms → molecules → organisms → templates → screens), including
different viewports/devices. The **layout engine** (React `paintScreen`,
ASCII, TUI, SwiftUI) only draws that tree. This is ADR 0008 +
`examples/counter` `productView` / `counterScreen` / Expo `paintScreen.tsx`.

Keep **both** going: this tree+painter path, and hosts that still paint
without a shared tree. Do not pick a winner this week. Do not block
sync robustness (Q103). See Q104.

## Three pillars

```text
1. CORE PROGRAM
   Model · Message catalog · update · screen
   Navigation as a sibling slice (action menu today)
   URI table + parser-printer  (print(parse) = parse(print))
   One declaration. Derived behavior is generic on that.

2. SYNC  (event sourcing, local-first)
   Send locally → update immediately (offline, no network in the path)
   Observe peers → fold their Messages through the same update
   Catch-up when the device was off / not listening  (OPEN — Q86)
   After sync, representations match
   Messages that do not combine (Reset) vs those that do (+ / −)

3. ADAPTERS  (language × framework × that framework's nav library)
   Core is TypeScript Program, not React Router / Expo / SwiftUI
   Adapters translate: Expo file-router may need generated files
   React may use react-router or TanStack — core does not care
   Client consumption: useModel, useActions, development-only debug
   Same architecture in Swift and Rust (prototype). Rust subsuming
   all targets is an exploration, not a pick. (Q95)
```

## Closest code today

`examples/counter`:

- `message.ts` — one catalog (`md(...)` + `actions`): keys, tokens, valid / enabled in this Model. Code still says `hiddenBecause`; Q87 says that word is wrong.
- `program.ts` — `update`, `valid`, `screen`
- `app.ts` — `Program.compose.actionMenu({ of: CounterProgram })`
  product Model and action-menu Model are siblings
- `path.ts` — parser-printer for `/counter`
- `synced.ts` — Instant wrap; Instant has no Model
- React: `useModel` / `useActions` (`@foldkit/react`)

Do not treat `examples/counters` as this week's gospel. It is a later
climb. Explore list/detail when we need it.

## What is not this interview

The voice app. Instant leftovers #240–#245. Abstracting ahead of need.
LLM-written "architecture improvements" that drift the Counter.

## Open explorations (Qs, not code yet)

- Catch-up: **Q86 A** / **Q103 A** / **Q105 A** / **Q107 A**. Snapshot is cache, log is law. `from` = host + per-run instance (not Instant localId), mandated in TS/Swift/Rust. Hydration: Message id + watermark, not `from`. Watermark: **Q108** (quorum 2; whole-log fold rejected). Harness: Instant **online / offline** Port, two Processors, startup drift, N runs.
- Combine-language for Messages (Q88 decided: fold log order, no `combines` field)
- Declarative route table that names observed entities (Q89, Q99)
- Action menu is a combo box in Foldkit core (Q91 D). Open chrome is Q110. Archive of the Message log is Q109.
- Foldkit `onUrlChange` / `onUrlRequest` re-audit (Q92)
- Expo adapter this slice? (Q93)
- Rust as the one compiler; permissions per target (Q95, Q96)
- Tracing / slow-update across paint (Q97)
- Instant EAV / a message queue closer to Instant's store (Q100)
- Performance harness for any hot path an LLM writes (Q101)

## URI graph as static data (2026-08, their words decoded)

Ultimate goal: the application is a graph of URIs declared statically,
framework-agnostic (Effect/Foldkit primitives only). Root `/` is the
namespace of the Program itself. Programs compose by mount: child `/`
implicitly becomes `/counter/<id>` in the parent's domain. ADTs make
impossible states unrepresentable. The root app Model holds the domain
plus navigation stack, chrome (global focus, action menu), and runtime
context (`from`, actor, boot marks).

Canonical v2 (after their comment review): modes are dead; routes and
Model-resident feature-state ADTs cover everything a "mode" pretended to
be. Child-owned branded slugs kill raw strings at mount sites. Flat app
Model; synced subset is a projection (counters' projectDomain is prior
art). Explicit named root. Per-mount session gates; no combined global
status. Mount-path addressing makes a twice-mounted Program unambiguous
for menus, agents, and analytics. See
`overviews/q118-canonical-counter-gallery.md`, root `glossary.md`.
