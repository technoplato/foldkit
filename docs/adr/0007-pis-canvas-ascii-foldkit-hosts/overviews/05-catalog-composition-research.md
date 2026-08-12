# Overview 05 — Catalog composition research (10-foot)

**Date:** 2026-08-11  
**Goal:** Embed **arbitrary** Foldkit Programs in a PIS-style catalog. Compose at **one Program** layer and at **many Program runtimes** layer. Compare TCA 1 / TCA 2 and current Foldkit.

**Upstream note:** `origin/main` (fetched 2026-08-11 as `FETCH_HEAD` `b2cf4e33`) has **`Update.foldChild` / `foldChildStep`** as the documented child-update path. Local `feat/m-message-docs` is **ahead and behind** main, dirty, and still uses hand `Got*` + `Command.mapMessages` in `pis-canvas-lab`. **No merge ran** in this session (dirty tree + SSH fetch failed first; HTTPS fetch of main succeeded only into `FETCH_HEAD`).

---

## Two layers (do not mix the words)

```text
LAYER A — SINGLE PROGRAM (features / Submodels / children)
  One Model tree · one Message union · one update · one tape
  Child = nested Model slice + Got* + foldChild (or mapMessages)
  = TCA Scope / ifLet / forEach on ONE store

LAYER B — MULTIPLE PROGRAM RUNTIMES (catalog of apps)
  Many ProgramRuntime (or Runtime.embed) instances
  Each owns Model + tape + Commands
  Host coordinates with Ports / services / a thin coordinator Program
  = several TCA Stores side by side, not one Scope graph
```

User ask: **both**. Catalog wants B-like openness. Chrome + live demos you locked want A when possible.

---

## How Foldkit works now (local + main)

### A1 — Hand `Got*` + `mapMessages` (lab today)

```text
pis-canvas-lab/core (local)
  Model { chrome, single, multi }
  Message = chrome | GotSingleCounterMessage | GotMultiCountersMessage
  update: Counter.update → mapMessages → GotSingle…
```

### A2 — Canonical on main: `Update.foldChild`

```text
// personal-blog / auth / counters (origin/main)
const foldCounter = Update.foldChild({
  update: Counter.update,
  read: (model) => Option.some(model.counter),
  write: (model, next) => evo(model, { counter: () => next }),
  toParentMessage: (message) => GotCounterMessage({ message }),
  // foldOutMessage when child returns OutMessage
})

// handler
GotCounterMessage: ({ message }) => foldCounter(model, message)
```

AGENTS.md on main: **wire Submodels with `foldChild`, not a hand-written Got\* handler body.**

### A3 — View Submodel (`h.submodel`) — view boundary, not catalog

```text
h.submodel({
  slotId: 'login',
  model: childModel,
  view: Login.view,
  toParentMessage: (m) => GotLoginMessage({ message: m }),
})
```

Lifts **DOM messages**. Parent still owns Model composition via foldChild.

### A4 — Identified many children (counters)

```text
GotCounterMessage({ counterId, message })
// or foldCounter(id) => foldChild({ read: find row by id, … })
```

= TCA `forEach` / list of features.

### A5 — Optional / enum child (auth)

```text
Model = LoggedOut | LoggedIn
foldLoggedOut / foldLoggedIn with read → Option
```

= TCA `ifLet` / enum presentation.

### B1 — `Runtime.embed` (examples/embedding)

```text
// Host is NOT a Foldkit Program
const handle = Runtime.embed(element)
handle.ports.stepChanged.send(5)
handle.ports.countChanged.subscribe(…)
handle.dispose()
```

Host never touches Model. **Separate runtime.** Good for widget-in-page. Bad for one shared replay tape of chrome+product.

### B2 — `Runtime.makeProgramRuntime` (many processors)

```text
// same Program definition, N independent lives
const a = yield* makeProgramRuntime({ program: Counter, … })
const b = yield* makeProgramRuntime({ program: Counter, … })
// a.send / b.send — isolated Models and tapes
```

Skill: `$foldkit-program-runtimes`. Cross-talk only via Ports / services / coordinator Program.

---

## TCA 1 (Swift, production shape)

```swift
@Reducer
struct Parent {
  struct State {
    var child: Child.State
    var rows: IdentifiedArrayOf<Row.State>
    @PresentationState var destination: Destination.State?
  }
  enum Action {
    case child(Child.Action)
    case rows(IdentifiedActionOf<Row>)
    case destination(PresentationActionOf<Destination>)
  }
  var body: some ReducerOf<Self> {
    Scope(state: \.child, action: \.child) { Child() }
    .forEach(\.rows, action: \.rows) { Row() }
    .ifLet(\.$destination, action: \.destination) { Destination() }
    Reduce { state, action in /* parent */ }
  }
}
```

**One store.** Composition is **graph of reducers**, not manual switch boilerplate (macro + Scope).

---

## TCA 2 private beta (this machine: `TCA26-main`)

```swift
// Sources/ComposableArchitecture2 — Feature graph, not Reducer body only
@Feature struct Parent {
  struct State {
    var child = Child.State()
  }
  enum Action {
    case child(Child.Action)
  }
  var body: some Feature {
    Scope(state: \.child, action: \.child) {
      Child()
    }
    Update { state, action in /* parent */ }
  }
}

// also: .ifLet(\.destination, action: \.destination) { … }
//       .forEach(\.episodes, action: \.episodes) { … }
```

Same **ideas** as TCA 1 (`Scope` / `ifLet` / `forEach`). Graph mount + route action to child cores. Still **one feature store** for nested composition.

**Not** “arbitrary unknown Feature type at runtime without a closed Action sum.” Catalog openness still needs a registry or existential host layer.

---

## The hard problem: “arbitrary Program in catalog”

```text
WANT
  register(Counter)
  register(Counters)
  register(Calculator)   // tomorrow, no shell rewrite of Message union

TYPE HOLE
  Parent.Message cannot be a closed S.Union of every future child
  without either:
    (1) recompile shell (closed world), or
    (2) erase child Message (open world, weaker tape types), or
    (3) multi-runtime + Ports (open world, many tapes)
```

---

## Prototype options (syntax only — 10-foot)

### P0 — Closed god Program + foldChild (align lab with main)

**Openness:** low (known demos only). **Tape:** one, strong. **Canonical:** yes on main.

```ts
// catalog is a TypeScript module list, not a runtime plugin loader
const foldSingle = Update.foldChild({
  update: Counter.update,
  read: m => Option.some(m.single),
  write: (m, next) => evo(m, { single: () => next }),
  toParentMessage: msg => GotSingleCounterMessage({ message: msg }),
})

const foldMulti = Update.foldChild({ /* … multi … */ })

// Message union still lists GotSingle / GotMulti by hand
GotSingleCounterMessage: ({ message }) => foldSingle(model, message),
GotMultiCountersMessage: ({ message }) => foldMulti(model, message),
```

**Ship first** for counters lab. Matches locked Q5.

---

### P1 — Compile-time catalog macro / registry → closed sum

**Openness:** medium (add file + register, codegen or typed builder). **Tape:** one, still closed & typed.

```ts
// dream API (not built)
const Catalog = ProgramCatalog.define({
  single: Counter.Program,   // or { init, update, Message, Model }
  multi: Counters.Program,
  // calculator: Calculator.Program,  // one line to add
})

// expands to:
// Model { chrome, slots: { single, multi } }
// Message = chrome | Catalog.Got<'single'> | Catalog.Got<'multi'>
// update uses foldChild per key

type Model = {
  chrome: Chrome
  demos: Catalog.Models  // { single: Counter.Model, multi: Counters.Model }
}

// host view
Catalog.render('multi', model.demos.multi, actions.demos.multi)
```

Implementation sketch: TS satisfies + mapped types, or codegen from `catalog.ts`.  
**Closest TCA feel:** parent body that is a list of Scopes.

---

### P2 — Open catalog, erased child Message (one Program, weak types)

**Openness:** high. **Tape:** one, but child payloads are opaque or schema-dynamic.

```ts
// dream API
export const GotDemoMessage = m('GotDemoMessage', {
  slotId: S.String,
  programId: S.String,
  // opaque or Schema.Unknown — lose exhaustive child Match
  message: S.Unknown,
})

type Slot = {
  id: string
  programId: 'counter' | 'counters' | string
  model: unknown  // or branded per programId at runtime
}

const registry: Record<string, {
  init: unknown
  update: (model: any, message: any) => readonly [any, readonly any[]]
  // optional: message schema for decode
}> = {
  counter: Counter,
  counters: Counters,
}

// update
GotDemoMessage: ({ slotId, programId, message }) => {
  const entry = registry[programId]
  const slot = model.slots[slotId]
  const [next, cmds] = entry.update(slot.model, message)
  return [
    writeSlot(model, slotId, next),
    Command.mapMessages(cmds, m =>
      GotDemoMessage({ slotId, programId, message: m }),
    ),
  ]
}
```

**Cost:** no exhaustive types; bugs move to runtime; Instant/replay must version opaque blobs carefully.

---

### P3 — Multi-runtime catalog (true arbitrary apps)

**Openness:** high. **Tape:** many (plus optional chrome-only tape). **Canonical multi-program layer.**

```ts
// chrome is its own small Program OR plain host
type ChromeModel = {
  layout: …
  slots: Array<{ id: string; programId: string }>
}

// host (or chrome Commands) owns:
const runtimes = new Map<string, ProgramRuntime<any, any>>()

function mountSlot(id: string, programId: string) {
  const def = registry[programId]  // Program.make result
  const rt = yield* makeProgramRuntime({ program: def, start: Runtime.fresh() })
  runtimes.set(id, rt)
}

// map phone paints rt.readModel()
// hotspot → rt.send(childMessage)  // not parent Got*

// optional: chrome observes
rt.observeModel(model => paint(id, model))
// optional Ports for host→demo
```

Or **embed** path for DOM widgets:

```ts
const handle = Runtime.embed(makeElement(slotEl, flags))
handles.set(id, handle)
```

**Matches** `$foldkit-program-runtimes` + `examples/embedding`.  
**Does not** give one mixed chrome+product replay tape unless you build a **coordinator** that logs envelopes.

---

### P4 — Hybrid catalog entry kinds (recommended product shape)

```text
Catalog entry =
  | LiveNested   → Layer A (foldChild, in parent Model) — counters lab
  | LiveRuntime  → Layer B (makeProgramRuntime / embed) — heavy demos
  | Sketch       → static DomainAsTree frame (tea satire, no Program)
```

```ts
// dream API
type CatalogEntry =
  | { _tag: 'nested'; key: 'single' | 'multi'; /* typed path */ }
  | { _tag: 'runtime'; programId: string; slotId: string }
  | { _tag: 'sketch'; domainId: string; uri: string }

// shell Program Model
{
  chrome: …
  nested: { single: Counter.Model; multi: Counters.Model }  // closed
  runtimeSlots: Array<{ id: string; programId: string }>     // open ids only
  // actual runtime handles live OUTSIDE Model (host map) — not in Model
}
```

**Rule:** never put `ProgramRuntime` handles in Model. Host owns handles. Model stores **ids + layout**.

---

## Side-by-side

| Prototype | Arbitrary add? | One tape | Types | Like TCA |
| --- | --- | --- | --- | --- |
| P0 foldChild closed | recompile union | yes | strong | Scope by hand |
| P1 catalog builder | register + build | yes | strong | many Scopes |
| P2 opaque GotDemo | runtime register | yes | weak | existential |
| P3 multi-runtime | runtime register | no* | strong per app | many Stores |
| P4 hybrid | mix | nested yes / runtime no | mix | Scope + multi Store |

\*unless coordinator logs envelopes

---

## Map to user intent

```text
“compose features together”     → P0/P1 (foldChild, Got*, OutMessage)
“compose programs together”     → P3 (runtimes) + optional coordinator
“arbitrary Foldkit in catalog”  → P3 or P2; P1 if “arbitrary” means “any known package in repo”
“demos inside chrome” (Q5)      → nested P0/P1 for showcase cores; P4 for tea sketches
```

**Practical path**

1. **Pull/merge main** when tree is clean → get `Update.foldChild`; rewrite lab hand handlers.  
2. **P0** for single + multi in shell (canonical).  
3. Design **P1** if catalog stays monorepo-closed.  
4. Add **P3/P4** when a demo must stay a separate Program (heavy Instant, own routes) or is only a sketch.

---

## Locked (Q6, 2026-08-11)

**User chose option 1: P1 + P0.**

- Catalog = monorepo packages only, after a **one-line register**.
- Composition = **`Program.compose` / `compose.forEach`** (landed 2026-08-11).
- Paths: `packages/foldkit/src/program/compose.ts`, lab `examples/pis-canvas-lab/core/src/catalog.ts`.
- Showcase demos: single Counter, Multiple Counters, Calculator, forEach Counter list.
- Not P2 opaque default. Not P3 multi-runtime default for showcase demos.
- OutMessage parent `onOut` folds: not in this slice (auth still uses foldChild/hand).

## Recommended default (agent)

- Prefer `Program.compose` for monorepo catalogs.
- Keep `Update.foldChild` for Submodel OutMessage cases until `compose.onOut` exists.
- Multi-runtime remains Layer B escape hatch only.

---

## Sources on this machine

| Source | Path |
| --- | --- |
| Foldkit main (fetched) | `FETCH_HEAD` / foldkit `b2cf4e33` — `Update.foldChild` |
| Lab hand compose | `examples/pis-canvas-lab/core` |
| Embed | `examples/embedding` |
| Multi runtime skill | `$foldkit-program-runtimes` |
| TCA 1 guide | `Sync/tca/pointfree-research/…/tca-best-practices…` |
| TCA 2 beta | `Sync/tca/TCA26-main/Sources/ComposableArchitecture2` (`Scope`, `IfLet`, `ForEach`) |
| Local branch | `feat/m-message-docs` dirty; ahead/behind main |
