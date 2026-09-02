# Q&A — ADR 0011

Status legend: `open` | `asking` | `decided` | `deferred`

This file is the question list. Chat walks it one question at a time. New forks append at the end.

Sourced 2026-08-26 from code + landing SHAs + architecture audits. “What I think” is the agent’s pick for you to accept or override — not a decision until you answer.

## Index

| Range    | Topic                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------- |
| Q00      | Accept overview 01? **decided**                                                                |
| Q01–Q16  | Foldkit Program, Instant window, URI, clients                                                  |
| Q20–Q34  | Rust foldkit-nav, UniFFI, Instant, TUI                                                         |
| Q40–Q53  | counter-swift / TCA 2                                                                          |
| Q60–Q76  | Gospel, remotes, leftovers, success, order of work                                             |
| Q77–Q84  | Appended from second-wave drafts (unique only)                                                 |
| Q85–Q102 | From 2026-08-26 architecture dictation                                                         |
| Q103     | What “robust” means for Q86-A **decided A** (amended)                                          |
| Q105     | Instant **online / offline** Port + multi-run harness **decided A**                            |
| Q106     | `from` = host + instance **decided A** (localId only if stable across installs → Q107)         |
| Q107     | `from` per run/window; mandate instance; localId is not `from` **decided A**                   |
| Q88      | Reset vs +/−: always fold log order, no catalog `combines` **decided B**                       |
| Q87      | One catalog = `md` + `actions`; valid/enabled not hidden **decided A**                         |
| Q108     | Boot watermark **asking** — quorum 2 **E** (`included`). Archive is Q109                       |
| Q02      | Host uses the Program; Ready is session + `{ count }` only **decided A**                       |
| Q89      | Route table now, even one row **decided B**                                                    |
| Q112     | New example “counter with settings”; compose core Counter; no navigate-then-send **decided D** |
| Q113     | `send` is page chrome, not permission **decided A**                                            |
| Q114     | Fact is Increment. Never a second Increment. How is Q115 **decided (not C)**                   |
| Q115     | `via` ADT on the Message (Increment). Not envelope. Not Remote. **decided A**                  |
| Q116     | Every catalog Action requires `via` **decided A**                                              |
| Q117     | Does `Via` store Path or a printed URI string? **asking** (sketch stamps Path)                 |
| Q118     | Adapter IncrementButton / incrementButtonTapped, host is layout only? **asking**               |
| Q119     | One Enabled ADT; delete prose fields (`spoken` too); meta tier; tag-derived tokens **open**    |
| Q120     | Navigation slice in the Model, derived into `foldkit/route` + ADR 0010 `runtimeSeam` **open**  |
| Q121     | bindProgram collapses to `{ program, engine }`, one handle; `restore` defaults **open**        |
| Q122     | Via cases for keyboard / CLI, or keys stamp Button **open**                                    |
| Q123     | Actions declare relevant destinations (typed refs); page table derives; no strings **asking**  |
| Q124     | Devtools as a Foldkit Program, host-neutral screen, React Client first **open**                |
| Q125     | Identity retirement (retiredCounterIds): domain truth or library sync slice? **open**          |
| Q91      | Combo box + focus. Not A/B/C. **decided D**                                                    |
| Q109     | Archive old Messages to a flat file **open**                                                   |
| Q110     | Focus ADT, not menu-only chrome **decided C**                                                  |
| Q111     | Focus names Filter or a catalog Action **decided D**                                           |
| Q104     | Host-neutral layout tree vs engine (noted; both options; does not block Q103)                  |

### Dictation 2026-08-26 (decoded)

Voice transcript was bad. Recorded here so grok.com / Grok Build can compare notes.

| Said (decoded)                                                                     | Lands as                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Closest existing thing is `examples/counter`                                       | **Q00 A amended, Q60 A decided**                                         |
| Program owns business logic **and** how it paints                                  | **Q01 A decided** (Counter already has `screen`)                         |
| Action menu (cmd-K) + keys on Message defs; nav is **sibling** of product          | **Q90** (compose.actionMenu already). Don't over-build.                  |
| Don't let the LLM abstract ahead of need                                           | **Q102 decided** as a hard rule                                          |
| Sync is event sourcing: local send → update now; observe peers → same update       | **Q86 A decided** (snapshot is cache; log is law; must be robust — Q103) |
| Counters fall out of sync over time; need robustness                               | finding; catch-up is Q86                                                 |
| One catalog: messages, keys, enabled/disabled; derived code is generic             | **Q87**                                                                  |
| Reset does not combine; +/− do. Is “commute” the word?                             | **Q88**                                                                  |
| URI is understated; one route table; observe + send; biparser                      | **Q89**, Q14 A                                                           |
| Nav not delegated to the client; adapters translate Expo / React Router / TanStack | **Q92, Q93, Q94**                                                        |
| Language-agnostic; maybe Rust subsumes iOS/Android                                 | **Q95, Q96 open**                                                        |
| Tracing / OTEL / slow updates across paint                                         | **Q97**                                                                  |
| Client: `useModel` + `useActions` + **dev-only** debug                             | **Q98**                                                                  |
| Canonical PISS nested ADTs; URI observes entities                                  | **Q99 open**                                                             |
| Instant EAV / message queue closer to the metal                                    | **Q100 open**                                                            |
| Local update instant; sync in ms; LLM hot paths need a harness                     | **Q101**                                                                 |
| Where do ideas live?                                                               | **Q85 decided** — this folder, `intentions.md`                           |
| Ignore the voice app                                                               | **Q65 A**                                                                |
| Multiple Counters not dug in; keep Counter simple                                  | defer Q03–Q11, Q04–Q10 until sync is robust                              |

---

## Q00 — Accept overview 01 as the architecture baseline?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26 (architecture dictation)
- **Question:** Accept `overviews/01-one-program-hosts-and-ports.md` as the layering for this interview?

10-foot:

```text
  Program owns     →  hosts paint  →  Instant transports Messages
  nav as sibling      URI carriers     event sourcing (Q86)
  of product          adapters         not a second Model
```

**Answer:** **A, amended.** Gospel is `examples/counter`. Navigation is Program state, sibling of the product Model (`compose.actionMenu`: `{ product, actionMenu }`). Starting/Failed may be adapter lifecycle, never destination. Do not climb list/detail until Counter sync is robust (Q102). Hosts do not own destination.

Trade-off: Instant `selectedId` / host `useState` URI are drift (Q02). Multiple Counters Qs defer.

---

## Q01 — Does Multiple Counters get a `Program.screen` that embeds `counterScreen`, or stay destination+graph with per-host paint?

- **Status:** `decided` (gospel Counter); Multiple Counters **deferred**
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26 (dictation)
- **Human (re-read 2026-08-26):** Restated the question while reading the file. No new pick yet. Under the no-shortcut law, deferring Multiple Counters `screen` only to save time is suspect. Leave deferred until they answer again.
- **Answer:** For **this week's Program** (`examples/counter`): **A.** The Program already ships `counterScreen`. Hosts only paint. For Multiple Counters: **deferred** until Counter sync is robust. Do not invent a second product tree this week.
- **Question:** Single Counter already ships a renderer-free `Program.screen` (`UiNode`). Hosts only paint it. Multiple Counters ships no `screen`. It ships `Destination` plus an interaction graph, and every host re-paints list/detail/overlay in its own JSX, HTML, Vue, Svelte, RN, or ANSI. Which presentation contract should Multiple Counters own?

10-foot:

```text
                    CORE PROGRAM
  Model + Message + update + Commands + Navigation
           |                         |
           v                         v
   Program.screen (UiNode)    Destination + graph + NavInstruction
           |                         |
           v                         v
   paintHtml/React/Tui         history / expo-router / react-navigation
```

```ts
// CORE: examples/counter/core/src/program.ts — has screen
export const counterScreen: Program.ProgramScreen<Model> = (model, context) => {
  const product = productView(model)
  return context.device === undefined
    ? product
    : wrapDevice(context.device, product, { title: uri })
}

// CORE today: examples/counters/core/src/program.ts — no screen
export const MultipleCountersProgram = Object.assign(ComposedRows, {
  Model,
  Message,
  init,
  restore,
  update: updateBoundary,
  synchronization,
  versionedEvents,
})
```

Neighboring: Counter CLI/HTML/React/Svelte/Expo/TUI all paint `App.screen`. Multiple Counters HTML/CLI match `Destination`. Instant React matches `ReadyWindow.selectedId`. `Program.compose.forEach` routes child Messages; it does not compose `child.screen`.

Options:

- **A.** Add `Program.screen` and embed `counterScreen`. Core owns one product tree. Hosts only paint.
- **B.** Stay destination+graph with per-host paint (current). Native routers consume instructions, not a `UiNode`.
- **C.** Both, with a hard split. `Program.screen` is what paint-only Clients draw. `Destination` + `NavInstruction` are what navigation-library adapters consume. A host may not invent a third product view model.

What I think: **C.** A is the law for paint. B is the law for expo-router / react-navigation. B alone produced Instant `selectedId`. A alone would force react-navigation to pretend it is a `UiNode` painter.

Trade-off: C means two projections from one Model; tests must lock them together. A fights ADR 0009's four-call Navigator.

---

## Q02 — Instant `ReadyWindow.selectedId` and host `useState` URI: kill, make lossless, or keep as Instant-only view model?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26 (reopened, then picked)
- **Answer:** **A.** One source of truth. The host uses the Program (Model, destination, `Program.screen`). Starting / Failed / Ready is only the Instant session gate. `ReadyWindow { count }` on Counter is a projection of the number after Instant is up. It does not steal navigation. An Instant snapshot may not grow `selectedId` (or anything like it) and let the host pick the page. Multiple Counters’ homemade window is a bad abstraction. Not B. Not C.
- **Human (2026-08-26, re-read):** Did not remember the dictation stamp. After the Counter versus Multiple Counters walk: agreed the host window that decides the page is wrong. Picked A.
- **Question:** Instant is a network. Until it is up, the host must show Starting or Failed. After it is up, what does the host paint from? The Program Model (and `Program.screen`), or a homemade snapshot type that also decides which page you are on?

**What Counter does (gospel)**

Instant can be down. Counter’s older Instant window (`examples/counter/core/src/window.ts`) has three tagged rooms:

```text
StartingWindow   still connecting or signing in
FailedWindow     show the error string
ReadyWindow      Instant is up. The only payload is { count }.
```

`ReadyWindow` here is **not** navigation. There is only one place in the Program: `/counter`. The snapshot copies `model.count` so a host can draw the number without holding the whole Model.

The live React host does not even branch on that `ReadyWindow` type. It asks the Program:

```ts
// examples/counter/react/src/App.tsx
const view = useModel(Path())
const screen = useScreen(Path())
// Starting → “Starting Instant Counter…”
// Failed   → the error
// Ready    → paintReact(screen, …)   // draws Program.screen
```

`useScreen` returns the host-neutral tree (`Text` of the count, `Button`s for + / − / reset). React only turns those atoms into DOM. It does not decide “list versus detail.” There is no list. There is no `selectedId`. The URL is `Path()` (`/counter`), not a `useState` string the host invented.

That is what “paint the Program” means: the host draws what `Program.screen` already described. The host does not keep a second copy of “where we are” and `if` on it.

**What Multiple Counters did (the drift this Q is about)**

That example has many places: list, one counter, fact, delete. Those places already live on the Program as navigation. The Instant host then invented a wider `ReadyWindow`:

```ts
// examples/counters/instant-host/src/window.ts
ReadyWindow { counters, selectedId?, count? }
```

`selectedId` means “which row is open.” React also does `useState(uri)` and:

```ts
if (view.selectedId !== undefined && view.count !== undefined) {
  return /* detail page */
}
return /* list page */
```

So the host, not the Program, decides list versus detail. Fact and delete exist on the Program and in the URI table. This snapshot cannot show them. That homemade window is the “not the appropriate abstraction” feeling.

**Why Q02 exists at all**

On Counter, `ReadyWindow { count }` is a thin copy of the Model for Instant session chrome. It does not own navigation. The question is whether we keep that pattern honest (session gate + projection of Model), or let Instant hosts grow a second navigation Model the way Multiple Counters did.

10-foot:

```text
  CORE                    INSTANT HOST                     PAINT HOST
  Model.navigation   ->   getSnapshot(uri)            ->   if selectedId then detail
         ^                    |  ReadyWindow                  else list
         |                    |  selectedId? count?
         |                    v
         |              host useState(uri)  <---- onOpen(counterUri(id))
```

```ts
// INSTANT: examples/counters/instant-host/src/window.ts
export const ReadyWindow = S.TaggedStruct('ReadyWindow', {
  count: S.optionalKey(S.Number),
  counters: S.Array(WindowCounter),
  selectedId: S.optionalKey(S.String),
})

// HOST: examples/counters/react/src/App.tsx
const [internalUri, setUri] = useState(initialDestinationUri)
if (view.selectedId !== undefined && view.count !== undefined) {
  return /* detail: count, +/-, Fact, Back. no maybeMode, no delete */
}
```

Neighboring: Counter Instant `ReadyWindow` is only `{ count }` because Counter has one destination. Copying that shape onto Multiple Counters dropped navigation. Core already has `destinationForModel(model)` including `maybeMode`.

Options:

- **A.** Kill `selectedId` and host URI state. Snapshot is Starting | Failed | Ready({ destination }) or Ready({ model }). URI is a carrier only.
- **B.** Make the snapshot a lossless destination (list, detail, fact, delete). Host URI state only if it cannot disagree with `model.navigation`.
- **C.** Keep this as Instant-only view model. Lossy is acceptable for the sync demo.

What I think: **A**, with **B** as the migration step if Instant session chrome still wants a snapshot type.

Trade-off: A rewrites Instant React/Expo/Vue/Svelte/SvelteKit. C leaves Instant teaching the wrong architecture. Instant `showFact` only sends a Message when already on `CounterDetail`; the window never paints `maybeMode`.

---

## Q03 — Dual exported `update`: field-owner vs `MultipleCountersProgram.update`?

- **Status:** `deferred` (Multiple Counters; after Counter sync)
- **Question:** Since `Program.compose.forEach`, core exports two executables. `update` in `update.ts` accepts only `FieldOwnerMessage`. `MultipleCountersProgram.update` accepts the full `Message` union including `GotChild`. The barrel re-exports both. `src/story.test.ts` calls the field-owner one with `GotChild` and dies (`Match exhaustive: absurd`). What is the public boundary?

10-foot:

```text
  Message = FieldOwnerMessage | GotChild

  update.ts `update`                 Program.update (updateBoundary)
  FieldOwnerMessage only             Message
  GotChild => absurd                 GotChild => forEach routes by id
           ^
           story.test.ts imports this one
```

```ts
// CORE: examples/counters/core/src/program.ts
const updateBoundary = (model: Model, message: Message): UpdateReturn => {
  const [nextModel, commands] = Rows.update(model, message)
  return [
    nextModel,
    Command.mapMessages(commands, commandMessage =>
      S.decodeUnknownSync(Message)(commandMessage),
    ),
  ]
}
```

Neighboring: `core/src/index.ts` is `export *` from both `update.js` and `program.js`. Hosts that already call `MultipleCountersProgram.update` are correct. Story is the canary.

Options:

- **A.** One executable: `MultipleCountersProgram.update`. Do not export field-owner `update` from the package.
- **B.** Keep both, rename until the mistake is impossible (`updateFields` vs `Program.update`). Fix `story.test.ts`.
- **C.** Collapse routing back into a single handwritten `update`. Undo the forEach split.

What I think: **A.** Two updates that do not accept the same Message union is a lying public API.

Trade-off: small breaking change inside the example package. Desirable.

---

## Q04 — Overlay ADT: `maybeMode` Option XOR vs joint presentation leaves?

- **Status:** `deferred` (Multiple Counters; after Counter sync)
- **Question:** ADR 0003 modeled overlays as `CounterDetail { counterId, maybeMode, presentationId }` where `maybeMode` is `Option<CounterFactAlert | DeleteCounterConfirmation>`. That XOR is why fact and delete cannot both show. The URI table still has four leaves. Should overlays stay nested, or become first-class destinations?

10-foot:

```text
  CURRENT XOR NEST                    JOINT LEAVES
  Navigation                          Navigation
    List                                List
    Detail                              Detail
      maybeMode: None |                 Fact
        FactAlert |                     Delete
        DeleteConfirm
                                      (still one tag. still XOR.)
  URI already has four leaves. Model has two tags + Option.
```

```ts
// CORE: examples/counters/core/src/model.ts
export const CounterDetail = S.TaggedStruct('CounterDetail', {
  counterId: CounterId,
  maybeMode: S.Option(CounterDetailMode),
  presentationId: CounterDetailPresentationId,
})
export const Navigation = S.Union([CounterList, CounterDetail])
```

Neighboring: `presentationStyleOf` maps Fact to `'Sheet'` and Delete to `'Dialog'`. Instant App never receives the mode.

Options:

- **A.** Keep `maybeMode` Option XOR (current).
- **B.** Joint presentation leaves: `Navigation = List | Detail | Fact | Delete`. Still XOR. Destination matches URI 1:1.
- **C.** Navigation stack, XOR at the top: `[List] | [List, Detail] | [List, Detail, Fact]`. Matches ADR 0010 `NavigationStack`.

What I think: **B** now, **C** as the runtime seam once Q08 is real.

Trade-off: B is a core Model change. A is cheaper and already proves mutual exclusion in tests. C needs `stackOf` / `withStack`, which do not exist on this Program yet.

---

## Q05 — URI: should `parse(print)` collapse fact/delete to Detail, with presentation ids excluded?

- **Status:** `deferred` (Multiple Counters; after Counter sync)
- **Question:** Route printers emit four canonical paths, including `/fact` and `/delete`. `navigationFromUri` then maps Fact and Delete targets onto a two-tag `NavigationSkeleton` (`List | Detail`). Presentation ids never enter the URI. Is collapse the law, or a bug in the law statement?

10-foot:

```text
  print(Navigation)                    parse(URI)
  List            -> /counters         /counters            -> List
  Detail none     -> /counters/:id     /counters/:id        -> Detail
  Detail+Fact     -> /counters/:id/fact
  Detail+Delete   -> /counters/:id/delete
                                       /fact and /delete    -> Detail   <-- collapse

  never in URI: presentationId, requestId, confirmationId
```

```ts
// CORE: examples/counters/core/src/uriProjection.ts
const skeletonOf = (navigation: Navigation): NavigationSkeleton =>
  M.value(navigation).pipe(
    M.tagsExhaustive({
      CounterList: () => ({ _tag: 'List' }),
      CounterDetail: ({ counterId }) => ({ _tag: 'Detail', counterId }),
    }),
  )
```

Neighboring: `openingForTarget` mints ids at the carrier. Replay must never enter the URI (ADR 0003). None of that requires collapsing overlay _kind_.

Options:

- **A.** Collapse is the law. `/fact` and `/delete` are entry aliases that canonicalize to `/counters/:id`.
- **B.** Four URIs, two laws. `parse(print(target)) == target` is the round-trip. Skeleton is “same counter,” not the URI law.
- **C.** Four destinations, no collapse. If Q04 is joint leaves, `parse(print(navigation)) == navigation` at destination level. Presentation ids still excluded.

What I think: **C** if Q04 is **B**. **B** if Q04 stays nested. Do not wire ADR 0010 now with the current skeleton unless A is a real decision.

Trade-off: A would make Instant’s “detail or list” window look official.

---

## Q06 — Client matrix: what does “complete” mean?

- **Status:** `deferred` (after Counter sync is robust)
- **Question:** Counter’s host set is small and paints one screen. Multiple Counters added Vue, SvelteKit, Three, Solid, Datastar, plain HTML, terminal, Instant-window React. It still has no `counters/tui` that paints a `UiNode`, and Expo does not run react-navigation or the generated expo-router files. What counts as done?

10-foot:

```text
  ADR 0009 matrix                      Counters on this branch
  HTML painter                         src/main.ts (Destination)
  React + router plugin                bindings + view.tsx  AND Instant App.tsx
  RN + react-navigation                plugin exists. Expo app does not use it
  Expo + expo-router                   codegen exists. App.tsx is useState + selectedId
  CLI / TUI                            cli + terminal + opentui. no counter-style tui
  Instant headless                     counters/headless
  extras: vue, svelte, sveltekit, solid, three, datastar, plain-html
```

```ts
// HOST: examples/counters/expo/src/App.tsx  (does not mount generated expo-router files)
const [uri, setUri] = useState(listUri)
const view = useModel(uri)
return <WindowView actions={...} onOpen={setUri} view={view} />
```

Options:

- **A.** ADR 0009 matrix is complete: HTML painter, React+router, RN+react-navigation, Expo+expo-router, CLI, one TUI, Instant headless. Everything else must not block.
- **B.** Counter exemplar parity for every Counter host. Missing TUI painter. Freeze extras until they stop copying Instant `selectedId`.
- **C.** One production-quality Client per family, then stop (DOM painter, DOM+router, terminal, native+nav-library, headless Instant, maybe one hypermedia). Duplicate framework ports do not count until they share the paint contract.

What I think: **C**, with **A** as the named checklist.

Trade-off: Folder count is not a proof. Instant Vue/Svelte currently prove “we can copy `selectedId` into another runtime.”

---

## Q07 — Datastar Memory+SSE vs Instant gospel (`counter-headless:instant`)?

- **Status:** `deferred` (after Counter sync is robust)
- **Question:** Datastar runs one Node process, holds `MultipleCountersProgram` in memory, streams DOM patches over SSE. Two tabs converge because they share that process. Counter’s gospel is `Program.compose.sync` plus Instant. Which multi-user story is the product?

10-foot:

```text
  COUNTER GOSPEL                         DATASTAR TODAY
  Program.compose.sync                   MultipleCountersProgram in one Node process
  InstantEngine | MemoryEngine           SSE patches of HTML
  many Processors, one accepted tape     POST token -> local update -> broadcast
```

```ts
// HOST: examples/counters/datastar/src/server.ts
let currentModel: Model | undefined
let send: ((message: Message) => void) | undefined
```

Neighboring: `examples/counters/headless/src/tapeConvergence.test.ts` already wraps Multiple Counters in `Program.compose.sync` on `Runtime.MemoryEngine`. Instant `instant-host` is the live gospel.

Options:

- **A.** Instant is the only gospel. Datastar is a paint Client on the same tape.
- **B.** Two gospels by Client kind. Instant is CRDT/sync. Datastar is hypermedia.
- **C.** Kill Datastar on this branch.

What I think: **A.** A process-local SSE tape is not synchronization. A Datastar painter _over Instant_ can stay as a family proof (Q06-C).

Trade-off: A means rewriting `datastar/src/server.ts` to open Instant or Memory tape.

---

## Q08 — ADR 0010: wire `makeUriSync` into `makeApplication` now, later, or never?

- **Status:** `deferred` — see Q92 (re-audit Foldkit nav). Do not freeze the current seam this week.
- **Question:** ADR 0010 is “Accepted in part.” Seam types and `makeUriSync` landed in `441cbc8a2`. `makeApplication` integration is pending. No example calls `makeUriSync`. When, if ever, does the runtime own the URI loop?

10-foot:

```text
  ADR 0010 intended loop
  carrier URI -> makeUriSync.open -> withStack(model) -> OpenedNavigation
  update -> stackOf(prev) vs stackOf(next) -> HistoryPort push/replace/back

  TODAY: helpers in foldkit/navigation. examples/ never call them.
  Counters hosts: routerBridge, useNavigationHistory, useState, argv, none.
```

Neighboring: `examples/counters/react/src/routerBridge.ts` is the hand-rolled loop. Instant `App` `setUri` is another. Wiring `makeApplication` only helps Foldkit HTML until React hosts also call the seam.

Options:

- **A.** Now, on the current skeleton (collapses fact/delete).
- **B.** Later, after Q04/Q05. Do not freeze collapse as framework law.
- **C.** Never. Hosts and router plugins carry URI. `makeUriSync` stays a library function.

What I think: **B.** A is how a half-accepted ADR becomes the wrong law.

Trade-off: B leaves Foldkit HTML classifying links inside a Mount a bit longer.

---

## Q09 — Production React A/B presenters unused vs Instant `App.tsx`?

- **Status:** `deferred` (Multiple Counters Instant window; Counter React is `useModel` / `useActions`)
- **Question:** README tells humans to open `?presenter=a` and `?presenter=b`. `App` declares the prop and never uses it. Shipped React paint is Instant `ReadyWindow`. Which React is the product?

10-foot:

```text
  DOCUMENTED                         SHIPPED
  ?presenter=a  ReactA ModalShell    main.tsx sets presenter
  ?presenter=b  ReactB sheet+dialog  App.tsx ignores it
  react-bindings view.tsx            Instant ReadyWindow list/detail
  Destination + maybeMode            selectedId + count
```

```ts
// HOST: examples/counters/react/src/App.tsx
export const App = ({ initialDestinationUri = listUri, externalUri }: {
  initialDestinationUri?: string
  externalUri?: string
  presenter?: Presenter  // declared, unused
} = {}) => {
  const [internalUri, setUri] = useState(initialDestinationUri)
```

Options:

- **A.** Instant `App.tsx` is the product. Delete React-A/B.
- **B.** React-A/B (or `view.tsx` Destination paint) is the product. Wire `presenter`. Stop using `selectedId`.
- **C.** One React Client that paints `Program.screen`. A/B becomes chrome around the same tree.

What I think: **B** now, **C** once Q01 ships a screen. README + `?presenter=` is currently a lie.

Trade-off: B means Instant React looks like the bindings Client. That is good. TanStack/React Router render this same `App`; fixing `App` fixes those demos.

---

## Q10 — `forEach` already landed: confirm keep `GotChild` plus domain add/delete?

- **Status:** `deferred` (Multiple Counters; after Counter sync)
- **Question:** `Program.compose.forEach` now owns identified rows. Generic `ClickedAddRow` / `ClickedRemoveRow` mint `"0"`/`"1"` ids and remove without a retire ledger. Multiple Counters hides those tags and keeps `ClickedAddCounter` / `ConfirmedDeleteCounter`. Confirm or reverse?

10-foot:

```text
  CounterProgram.update(child, Increment)
           ^
           | GotChild { id, message }
  forEach routes by id ---- rows: [{ id, child }]
           ^
           | FieldOwnerMessage
  updateFields: add / select / fact / delete / OpenedNavigation

  exported Message = FieldOwnerMessage | GotChild
  not exported: ClickedAddRow, ClickedRemoveRow
```

```ts
// CORE: examples/counters/core/src/program.ts
const Rows = Program.compose.forEach({
  of: Counter.CounterProgram,
  fields: { navigation: Navigation, retiredCounterIds: RetiredCounterIds },
  messages: [FieldOwnerMessage],
  updateFields: (model, message) => /* domain add/delete/nav */,
})
```

Options:

- **A.** Confirm current split. Keep `GotChild`. Keep domain add/delete as field-owner Messages.
- **B.** Use the combinator’s add/remove Messages with custom id / on-remove hooks.
- **C.** Reverse forEach. Hand-write row routing again.

What I think: **A.** This is the one piece of the last four days that already matches the spirit. Adding a counter is not “append a generic row.”

Trade-off: combinator still constructs `ClickedAddRow` internally; exported Schema must keep omitting them. Q03 matters: Story must call `Program.update`.

---

## Q11 — Leftover Foldkit examples (payments, dual-camera, counters server): this ADR, another main, or delete?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A.** Out of scope. Different main. Ignore leftover product examples this interview.
- **Question:** `077afe4a3` documented leftover payments, dual-camera, and counters server hosts in the change log. Are they in this interview’s product path?

10-foot:

```text
THIS ADR path          leftover on exploring-view-agnosticism
  examples/counter     examples/payments
  examples/counters    dual-camera README
                       counters/src/server.ts
```

Options:

- **A.** Out of scope. Different main. Do not polish here. Do not delete here unless they block Counter.
- **B.** Delete from this branch so the matrix is only Counter/Counters.
- **C.** Polish them as additional Clients of the same Program.

What I think: **A.** Payments/dual-camera are other products. Q65 repeats this as landing policy.

Trade-off: B is a large mow of unrelated examples. C is Counters-by-stealth for payments.

---

## Q12 — ASCII for Multiple Counters: Program-owned `show`, host `liveAscii`, or Destination JSON only?

- **Status:** `decided` (Counter); Multiple Counters **deferred**
- **Answered:** 2026-08-26 (dictation)
- **Answer:** For Counter: **A.** `Program.screen` / `counterScreen` is how the Program paints. Hosts only paint that tree. Host-authored `liveAscii` is not the product.
- **Question:** Single Counter has `Program.screen` and CLI IDENTITY/ACESS. Multiple Counters CLI/terminal print Destination / graph, not a shared ASCII tree. Where does ASCII live?

10-foot:

```text
  Counter:     Program.screen → CLI / TUI / HTML paint the same tree
  Counters:    Destination + interactions → each host reprints
               no counters/tui that paints UiNode
```

Options:

- **A.** Program-owned ASCII / `screen` (depends on Q01 A or C). CLI `show` prints that tree.
- **B.** Keep Destination JSON / graph as the host-independent surface. No new ASCII layer.
- **C.** Host-authored `liveAscii` product tables (ADR 0008 delete target).

What I think: **A** if Q01 is A or C. **B** only as a stopgap. Never C — ADR 0008 already wanted that deleted.

Trade-off: A is new work (forEach does not compose `child.screen`). B leaves humans debugging JSON.

---

## Q13 — Processor / actor identity: Program Model field, host bootstrap only, or catalog of ids?

- **Status:** `decided` (folded into Q106 / Q107)
- **Answered:** 2026-08-26
- **Answer:** Not A alone (surface catalog is a **prefix**). Not Instant localId. **`from = ${host}-${instance}`**, instance unique per run/window, mandated in TS/Swift/Rust. Bare host token forbidden. See Q106 A, Q107 A.
- **Amendment:** One surface can run **multiple instances** of itself. Instant `localId` is **not** `from` (Q107 A). Catalog host + mandated per-run `instance` in TS, Swift, and Rust. Bare `cli` / `counter-swift-ios` is the off-by-N they keep seeing.
- **Question:** Instant echo-skip is `message.from == this Processor`. Foldkit hosts use `cli` / `react` / `foldkit`. counter-swift uses `counter-swift-cli` / `counter-swift-ios`. Rust is not on V01 yet. Who owns the id, and what is the catalog?

10-foot:

```text
  Instant message.from
       = engineProcessorId({ processor, instance })
       = must be distinct per live surface or peers drop as own echo

  Foldkit:    cli, foldkit, react, svelte, tui, expo
  Swift:      counter-swift-cli, counter-swift-ios, (ipad intended, not on from)
  Rust:       (needs own id, never reuse "cli")
```

Options:

- **A.** Catalog of Processor ids, each host passes into Program/runtime. Same catalog in Foldkit, Swift, Rust.
- **B.** Host bootstrap only. Program State may default (today Swift `Surface.processorID`).
- **C.** Per-install UUID persisted. Idiom (phone vs pad) is not unique enough.

What I think: **A**, with C later if two iPads share one idiom id. B is how `f5cb1a6` missed Message `from`.

Trade-off: A is a one-file law plus threading into State (Q43). C is real uniqueness and more persistence.

---

## Q14 — Replay vs URI: keep ADR 0003 (URI is destination, not tape)?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A.** URI is a parser-printer of destination, never the event log. Expand the route table later (Q89). Do not encode the tape in the URL.
- **Question:** An earlier exploration encoded replay into the browser URL. ADR 0003 rejected that. Confirm URI is a projection of destination, never the event log.

10-foot:

```text
  URI     = print(navigation)     destination, canonical
  tape    = Messages in order     Instant / replay
  do not encode tape in URI
```

Options:

- **A.** Keep ADR 0003. URI is destination. Replay is Instant/tape/CLI.
- **B.** Allow replay-in-hash for demos only (`#replay=…`).
- **C.** Revisit encoding event sequence in the carrier.

What I think: **A.** Not a real fork unless someone wants B. Confirm so Q05 cannot smuggle tape into `/fact`.

Trade-off: none if A. B is demo candy that becomes a second log.

---

## Q15 — Delete vs polish first on Foldkit Counters Instant path?

- **Status:** `deferred` (Multiple Counters Instant window)
- **Question:** If Q02 is kill `selectedId`, what do we delete first vs rewrite in place?

10-foot:

```text
DELETE CANDIDATES
  ReadyWindow.selectedId / optional count
  useState uri in Instant App / Expo / Vue / Svelte
  unused presenter prop (or the Instant App itself)

KEEP
  destinationForModel / Program.screen
  react-bindings view.tsx
  Instant tape / compose.sync
```

Options:

- **A.** Delete `selectedId` and host URI state first; Instant hosts then fail to compile until they paint Destination/screen.
- **B.** Rewrite snapshots lossless first, then delete the old fields.
- **C.** Park Instant window; production paint is bindings + `view.tsx` only.

What I think: **C** then **A**. Instant window is a second Model. Bindings already paint Destination.

Trade-off: A is a compile-break across five hosts. That is the point.

---

## Q16 — Foldkit library change required before examples can obey one-Program?

- **Status:** `deferred` until Q86/Q92 say a library change is the blocker. Counter already has screen, catalog, action menu, parser-printer.
- **Question:** Can examples obey “one Program, adapters paint” with APIs that already exist (`Program.screen`, `compose.forEach`, `makeUriSync`, Destination), or is a library change blocking?

10-foot:

```text
EXISTS             NOT WIRED
  Program.screen   MultipleCountersProgram.screen
  forEach          story.test.ts still calls field-owner update
  makeUriSync      makeApplication, no example caller
  Destination      Instant window ignores it
```

Options:

- **A.** No library change. Example and host hygiene. Optional `Program.navigation` later (Q08 B).
- **B.** Must wire `makeApplication` + `Program.navigation` before hosts can be honest.
- **C.** Need screen composition for forEach (`child.screen` → parent tree) before Q01 A/C is possible.

What I think: **A** for Instant/`selectedId`/dual `update`. **C** if Q01 is A or C and we refuse to hand-write parent screen. **B** is Q08, not a gate for deleting `selectedId`.

Trade-off: C is real if we want one UiNode for list+detail+child Counter. forEach does not do it today.

---

## Q20 — Is `foldkit-nav` the Program navigation crate, or must hosts use sibling `rust-navigation` only?

- **Status:** `open`
- **Question:** `crates/foldkit-nav` is on main. `swift-navigation` (sibling `rust-navigation`) is still a workspace dep. They do different jobs. `Agents.md` still says the sibling is “the sole navigation implementation.” Which crate owns Program navigation?

10-foot:

```text
ONE PROGRAM
  Model.navigation  ──► foldkit-nav (URI, carrier, instruction diff)
  Alert/dialog copy ──► rust-navigation (AlertState / TextState)  [optional]
ADAPTERS PAINT
  TUI / CLI / SwiftUI / Compose translate instructions or snapshots
```

```rust
// foldkit-nav: same router parses a deep link and prints the push path
let detail = lit("counters").then(text::<String>("counterId"));
assert_eq!(detail.parse_path("/counters/counter-1"), Some("counter-1".into()));
assert_eq!(detail.print_path(&"counter-1".into()), Some("/counters/counter-1".into()));
// rust-navigation: alerts-as-data, no URI laws
let alert: AlertState<()> = AlertState::new(TextState::new("Delete?"), vec![], None);
```

Neighboring: rust-navigation cannot parse `/counters/counter-0/fact` or diff overlay kinds into Present/Dismiss. foldkit-nav cannot describe a SwiftUI alert as data.

Options:

- **A.** Keep both. Rewrite the docs. foldkit-nav = Program nav. rust-navigation = Point-Free view primitives.
- **B.** rust-navigation only. Delete or freeze foldkit-nav.
- **C.** Merge foldkit-nav into rust-navigation as a module (packaging, later).

What I think: **A.** They are not substitutes. B throws away the Foldkit Program contract. C is a rename, not a product decision.

Trade-off of A: two “navigation” words in one repo (Q28).

---

## Q21 — Should `counters-nav` compose `counter-core` via TCA `ForEach`, a Program combinator, or keep the match-arm?

- **Status:** `open`
- **Question:** Parent `Update` match-arm routes `GotCounterMessage` into `counter_core_example::update`. Child is a pure fold, not a TCA `Feature`. Keep, lift to `ForEach`, or extract a tiny Program combinator?

10-foot:

```text
counter-core          counters-nav (parent TCA Store)
  update(m, msg)  ──►  GotCounterMessage ──► child.update
  no effects           facts / nav / sync / delete live here
```

```rust
Message::GotCounterMessage(GotCounterMessage { counter_id, message }) => {
    if let Some(row) = state.rows.iter_mut().find(|row| row.id == counter_id) {
        row.counter = counter_core_example::update(row.counter, message);
    }
    Effect::none()
}
```

Options:

- **A.** Keep the match-arm (current).
- **B.** TCA `ForEach` + `IdentifiedArray`.
- **C.** Foldkit-style Program combinator: “run this pure child update at `rows[id]`.”

What I think: **A now**, **C if the match-arm grows**. Child has no effects. `ForEach` earns its keep when children own cancellable effects.

Trade-off of B: TCA collection types on a Foldkit identity model (`counter-{uuid}`, retired-forever ids) for no runtime gain.

---

## Q22 — FFI: wire Swift `@main` and Android `NavHost` to `CountersController`, keep dead shells, or delete until Instant/nav questions are answered?

- **Status:** `open`
- **Question:** `CountersController` is exported. Swift `CountersView` exists. **`ShowcaseApp.swift` `@main` is `TranscriptionStressView`.** `ShowcaseNavigation.kt` routes list, Counter, Speech, Location — no `CountersScreen`. Native-stack product questions were not asked.

10-foot:

```text
Rust CountersController  ←── UniFFI ──►  Swift / Kotlin ViewModels
                                         (built, tested, not @main / not in NavHost)

Live @main / NavHost today:
  Swift  → TranscriptionStressView
  Android → Counter | Speech | Location
```

```swift
@main
struct ShowcaseApp: App {
    var body: some Scene {
        WindowGroup { TranscriptionStressView() }  // live
    }
}
```

Options:

- **A.** Productize now: `@main` → Counters; Android NavHost grows a `counters` route.
- **B.** Keep dead shells (current). Looks shipped; is not.
- **C.** Delete UniFFI Counters until Q23–Q25 are decided.
- **D.** Keep the FFI surface + tests; do not attach `@main` / `NavHost`. Document: library contract, not the shipping showcase.

What I think: **D.** Wiring `@main` _is_ a product decision about native stacks and Instant. Deleting throws away the Hashimoto proof.

Trade-off of A: you then must answer who drives the stack (Q23) and whether native Instant writes V01 (Q24–Q25).

---

## Q23 — `FfiNavigator`: drive `NavigationStack`/`NavHost`, snapshot-only UI, or delete the callback?

- **Status:** `open`
- **Question:** Core diffs nav after every message and calls `push/pop/present/dismiss`. Swift installs `FfiNavigator` but **push/pop are no-ops**. Android push/pop are commented stubs. Both shells already paint from `destination_json`.

10-foot:

```text
Program.navigation  ──diff──►  [Push path | Pop | Present path | Dismiss]

A: adapter.perform(op) ──► NavigationStack / NavHost
B: adapter ignores ops ──► paint snapshot.destination in one view
```

```swift
controller.setNavigator(navigator: CountersNavigator(
    push: { path in _ = path },   // no-op; view switches on snapshot
    pop: {},
    present: { path in self?.presentedPath = path },
    dismiss: { self?.presentedPath = nil }
))
```

Options:

- **A.** Instruction-driven native routers. Back gesture must round-trip as a Program message or stacks diverge.
- **B.** Snapshot-only paint. Delete `FfiNavigator` or keep as optional telemetry.
- **C.** Delete the callback now. Hosts derive transitions from consecutive snapshots.

What I think: **B** until someone actually wants NavigationStack/NavHost as the source of visible screens. Snapshot-only is a legal adapter: “paint this destination.”

Trade-off of A: two sources of truth unless every platform gesture is a Program message. Trade-off of B: no free interactive pop / predictive back.

---

## Q24 — Instant on UniFFI Counters: same tape as CLI, simulated only, or never?

- **Status:** `open`
- **Question:** `CountersController::new` always builds `counters_feature(SimulatedFactClient)`. No `HostSync`. CLI/TUI use `--instant`. UniFFI already runs Instant for scribe/transcription.

10-foot:

```text
CLI/TUI:  Store ── HostSync ── Instant (optional --instant)
UniFFI:   Store ── SimulatedFactClient only
Scribe:   Store ── Instant  (already on UniFFI, different Program)
```

```rust
pub fn new() -> Arc<Self> {
    let store = Store::new(
        Model::default(),
        counters_feature(Arc::new(SimulatedFactClient)), // no HostSync
    );
}
```

Options:

- **A.** Same live bridge as `tca-counters --instant`.
- **B.** SimulatedFactClient + no Instant (current).
- **C.** Constructor flag after Q25: `offline()` vs `live(appId)`. Default B until schema is decided.

What I think: **C**, default **B** until Q25. Attaching A onto FoldkitCounterV01 _right now_ is how you get `counter_rows` in the snapshot-log app.

Trade-off of B: “FFI all the way down” without the sync half of the Program.

---

## Q25 — Multi Instant writing `counter_rows` into FoldkitCounterV01: stop, own app, or Message-tape?

- **Status:** `open`
- **Question:** Same Instant app id `5417c2e3-…`. Foldkit / counter-synced use `count` + `message`. `counters-nav --instant` uses `counter_rows` + `retired_counters`. Last-writer row wins. They do not converge.

10-foot:

```text
FoldkitCounterV01 (one Instant app)
  foldkit TS / counter-synced     counters-nav --instant
  count + Message log             counter_rows {id, count}
  fold later messages             last writer wins
  nav classified on Program       nav never synced
```

```rust
pub const FOLDKIT_COUNTER_APP_ID: &str = "5417c2e3-c6b9-476d-a962-2e11c83492aa";
impl Table for CounterRowRecord { const TABLE_NAME: &'static str = "counter_rows"; }
```

Options:

- **A.** Stop. `--instant` on counters-nav does not default to FoldkitCounterV01.
- **B.** Own Instant app for TCA Counters Nav. V01 stays the single-counter tape.
- **C.** Message-tape like Foldkit counters. Domain sync is append-only Messages plus a domain snapshot.

What I think: **A immediately**, then **C if the point is Foldkit interop**, **B if the point is a TCA demo of sharing-instant**. Current default is the worst mix: share the Foldkit app, use a different wire.

Trade-off of C: you must define tags for every domain Message, not just one int. Snapshot-of-counts loses concurrent increments (`3` and `5` → last writer, not `8`).

---

## Q26 — Duplicate tutorial `CounterStore` vs `counter-core-example` on UniFFI / WASM?

- **Status:** `open`
- **Question:** Four Increment/Decrement/Reset cores exist. `counter-core-example` is the Foldkit Program (ACESS, URI, wire). UniFFI `CounterStore`, WASM, and `examples/counter` are tutorial reducers (Reset always zeros). Native Counter screen on NavHost is the tutorial one.

10-foot:

```text
Foldkit Counter Program
  counter-core ──► counter-synced (Instant tape)
               ──► counters-nav child rows
               ──► (missing) UniFFI / WASM / examples/counter

Tutorial copies
  examples/counter, tca-uniffi CounterStore, tca-wasm WasmCounterStore
```

```rust
// counter-core
Message::Reset => if model.count == 0 { model } else { Model { count: 0 } }
// UniFFI CounterStore
CounterAction::Reset => { state.count = 0; }
```

Options:

- **A.** One Program: counter-core everywhere that claims to be Counter.
- **B.** Keep the tutorial `CounterStore`; label it “TCA Store FFI sample,” not the Counter Program.
- **C.** Delete UniFFI/WASM tutorial stores; only CountersController + counter-synced.

What I think: **A** for anything named Counter, **B** if you still want a 40-line teaching store. Right now Swift/Android “Counter” is the live native demo and it is _not_ the Foldkit Program.

Trade-off of B: two counters in the showcase forever.

---

## Q27 — `tca-tui`: keep as paint adapter; is an ASCII layer still needed?

- **Status:** `open`
- **Question:** `tca-tui` is terminal setup + `Renderer` + `KeyHandler`. Counters TUI paints ratatui from `interactions_for_model`. CLI `show` prints destination JSON. `counter-core::show::render_show` _is_ the Foldkit ASCII layer for the single Counter.

10-foot:

```text
Program ── presentation (uri, destination, tokens)
   ├─ CLI show     JSON today; ASCII if you add B
   ├─ tca-tui      ratatui paint + keys → invoke(token)
   ├─ UniFFI       destination_json + invoke
   └─ tests        laws on parse/print/diff/tokens
```

Options:

- **A.** tca-tui stays paint-only. No new ASCII layer for counters-nav.
- **B.** Program-owned ASCII `show` (Foldkit), tca-tui still paints.
- **C.** Put ASCII inside tca-tui (mixes paint runtime with product identity).

What I think: **A for the host crate**, **B for the Program**. ASCII is not a tca-tui feature.

Trade-off of A-only: humans debugging counters-nav read JSON. `tca-counter show` already prints IDENTITY/ACESS; `tca-counters show` prints serde JSON.

---

## Q28 — `Agents.md` “swift-navigation is the sole navigation implementation” vs `foldkit-nav` on main?

- **Status:** `open`
- **Question:** That sentence was true when in-tree Point-Free port moved to the sibling. It is false now that Foldkit URI/carrier/instruction lives in-tree.

10-foot:

```text
docs today (stale)          code on main
swift-navigation = sole     swift-navigation: AlertState, UIBinding
crates/navigation removed   foldkit-nav: Router, carrier, NavInstruction
                            counters-nav uses foldkit-nav
```

Options:

- **A.** Rewrite Agents.md / Claude.md / README to two layers (depends on Q20=A).
- **B.** Honor the old sentence: remove foldkit-nav from main (depends on Q20=B).
- **C.** Soften without choosing architecture: “sole Point-Free port; Foldkit nav is `foldkit-nav`.”

What I think: **A if Q20 is A**, else **C today**. Do not leave “sole implementation” on a branch that shipped foldkit-nav — the next agent will delete the wrong crate.

Trade-off of A: agents must learn two nav vocabularies. Cheaper than porting AlertState onto parse/print URIs.

---

## Q29 — JSON snapshots on UniFFI vs typed records?

- **Status:** `open`
- **Question:** `CountersObserver.on_snapshot(snapshot_json: String)` then Swift `JSONDecoder`. Typed UniFFI records would be the other contract.

10-foot:

```text
Rust destination_json  ──string──►  Swift CountersSnapshot (hand Codable)
                                   Kotlin decode
```

Options:

- **A.** Keep JSON. Fast to evolve; decode can silently drop fields.
- **B.** Typed UniFFI records for destination / interactions / uri.
- **C.** JSON for debug/`show`; typed records for the running host.

What I think: **C** if native Counters becomes `@main`. **A** while it is a library contract (Q22 D).

Trade-off of A: Swift `try? JSONDecoder` swallows errors (current ViewModel).

---

## Q30 — First Rust host that must prove one-Program: CLI, TUI, iOS, Android, or none this slice?

- **Status:** `open`
- **Question:** If gospel is FoldkitCounterV01 (Q60 A), which Rust surface must show the same integer as `npm run count`?

10-foot:

```text
EXISTS                         NOT ON V01
  tca-counter show (ASCII)     UniFFI CountersController Instant
  tca-counters --instant       tutorial CounterStore
  (counter_rows, wrong schema)
```

Options:

- **A.** Rust CLI `show` / `do increment` on FoldkitCounterV01, same as Foldkit/Swift CLI.
- **B.** TUI first.
- **C.** iOS/Android UniFFI first.
- **D.** None this slice. Rust stays library (foldkit-nav / TCA). Native gospel is counter-swift.

What I think: **A** if Rust is in the matrix (Q60). **D** if this ADR’s native host is Swift only. C is Q22 A and was not asked as a product.

Trade-off of D: “FFI all the way down” stays an engineering leftover.

---

## Q31 — Hobby crates on rust main (blackjack, merge-tiles, dir-counter, shared-tui): stay, move, or ignore?

- **Status:** `open`
- **Question:** dir-tow merge unioned `dir-counter` with blackjack/merge-tiles/shared-tui in Cargo.toml. User said stop other mains; do not force-checkout hobby primaries onto main.

10-foot:

```text
tca-rust-port main @ 1fd1bb3
  foldkit-nav, tca-tui, tca-uniffi, counters-nav   ← this ADR
  blackjack, merge-tiles, dir-counter              ← hobby, other mains
```

Options:

- **A.** Leave them in the workspace. Do not treat them as gospel. Do not force their primaries onto this main.
- **B.** Remove from this workspace so main is only TCA + Foldkit port.
- **C.** Those examples become additional Clients of counter-core.

What I think: **A.** Workspace membership is not product. Do not spend this interview mowing blackjack.

Trade-off of B: large unrelated diff. C is a lie.

---

## Q32 — Accept rewritten `technoplato/tca-rust-port` main at `1fd1bb3`?

- **Status:** `open`
- **Question:** Force-push already happened over `c3a0fa3`. What does a later worker clone?

10-foot:

```text
technoplato/tca-rust-port
  main @ 1fd1bb3     rewritten
  (old c3a0fa3)      not on main
playground           shopify-playground remote, not gospel
```

Options:

- **A.** Accept rewritten main as the Rust home.
- **B.** Accept, and restore the pre-rewrite tip as a named branch if still on disk.
- **C.** Treat this repo as library-only; new `counter-rust` repo is the host.

What I think: **A, with B as cheap insurance.** Do not re-litigate the force-push. Q63 is the landing duplicate — pick once.

Trade-off of C: a fourth clone before the first live `cargo` increment hits V01.

---

## Q33 — Cross-language Message enum: one schema, or per-language?

- **Status:** `open`
- **Question:** Foldkit Messages are Effect Schema. Rust has serde enums. Swift has TCA Action. Instant `message.tag` is a string. How do they stay one protocol on V01?

10-foot:

```text
Foldkit Increment._tag  = "Increment"
Swift   .incrementTapped → writes tag "increment" ?  (must match Foldkit)
Rust    Message::Increment
Instant message.tag     = that string
```

Options:

- **A.** One tag catalog owned by Foldkit Counter. Swift/Rust write those strings. Tests against live V01.
- **B.** Per-language enums + a migrate table.
- **C.** JSON Schema generated from Foldkit, consumed by Rust/Swift.

What I think: **A** for V01 (three tags). C is the later house for Counters. B is how tags drift and `npm run count` ignores native writes.

Trade-off: A is discipline, not a codegen project. The catalog must include `from` Processor ids (Q13).

---

## Q34 — Performance: JSON snapshot on every count vs typed callbacks?

- **Status:** `open`
- **Question:** UniFFI observer currently ships a full JSON snapshot after every state change. Fine for a counter; a law for later Programs?

10-foot:

```text
every update ──► destination_json ──► Swift decode ──► @Observable
```

Options:

- **A.** JSON every time is fine for Counter. Revisit at collection.
- **B.** Typed / delta callbacks now.
- **C.** Observe token / diff only when destination or count changes.

What I think: **A.** Do not invent a reactive FFI layer for an int. C is a later optimization if `@main` ships.

Trade-off: none this slice if Q22 is D.

---

## Q40 — One Program in counter-swift, or keep two?

- **Status:** `open`
- **Question:** Launch already mounts only `CounterFeature`. `CountersFeature` is tests-only. Live bootstrap still builds a `LiveInstantTapeStore` the shipped Counter never calls. Delete the second Program, keep it compiled, or split the library?

10-foot:

```text
TODAY (f5cb1a6)
  LAUNCH ──► CounterFeature ──► snapshot-log ──► FoldkitCounterV01
  TESTS  ──► CountersFeature ──► InstantTape  ──► foldkitMessageProposals
  BOOT   ──► CounterRuntime { makeStore, makeSnapshotLog }  // tape unused
```

Options:

- **A.** One Program, mow the second. Delete `CountersFeature` / tape ADTs / `makeStore`. Keep Paint + snapshot-log.
- **B.** Keep two Programs compiled, off the launch path.
- **C.** Split Paint + SnapshotLog out of the `InstantTape` target; delete `CountersFeature`.

What I think: **A.** Collection is a different Program if it exists (Q46). Keeping a second transition table “for later” is how this package grew two Instant schemas.

Trade-off: throw away a working `GotCounterMessage` fold. Rename debt: Paint still lives under `InstantTape`.

---

## Q41 — Snapshot-log gospel, or same-actor `tape.ts`, for the shipped Counter?

- **Status:** `open`
- **Question:** Does the shipped Counter persist like Foldkit `npm run count` (FoldkitCounterV01: one `count` row + `message` log), or like `@foldkit/instant` `tape.ts` (proposals + accepted occurrences)?

10-foot:

```text
GOSPEL (npm run count / increment)
  Instant app FoldkitCounterV01
    count    +  message log
  tap = fold, then one transact { count, message }

NOT THIS APP
  foldkitMessageProposals
  foldkitAcceptedMessageOccurrences
```

Options:

- **A.** Snapshot-log is the shipped Counter. Same write pair as `npm run increment`.
- **B.** Move the shipped Counter onto `tape.ts`. Breaks `npm run count` parity.
- **C.** Both, one Program. Two schemas, two folds, one count.

What I think: **A.** Tape is a different Program’s durability. Do not write tape rows into the Counter app.

Trade-off: snapshot-log is app-global (guest is just a websocket). Tape is subject-scoped.

---

## Q42 — InstantTape envelope `actor: String` vs Foldkit `Authenticated | Guest | System`?

- **Status:** `open`
- **Question:** Foldkit `Processor.MessageEnvelope.actor` is a tagged union. Swift `InstantTapeEnvelope.actor` is a `String`. Fix, ignore, or delete tape until isomorphic?

10-foot:

```text
FOLDKIT envelope.actor          SWIFT InstantTapeEnvelope.actor
  Authenticated { subjectId }     String
  Guest { guestId, pairingId }
  System { processorId }
```

```swift
public struct InstantTapeEnvelope: Sendable, Hashable, Codable {
  public var actor: String
```

Options:

- **A.** Fix: port `Actor` as a tagged ADT. No writes until tests round-trip a real Foldkit envelope.
- **B.** Ignore. Counter does not read envelopes.
- **C.** Delete tape until isomorphic (pairs with Q40 A).

What I think: **C** if Q40 is one Program. **A** only if InstantTape remains a product you would hand a Foldkit peer. Do not pick B while README says “row for row.”

Trade-off: `JSONDecoder` will not read `{ "_tag": "Authenticated", "subjectId": "…" }` into `String`.

---

## Q43 — iPad `processorID`: thread into `CounterFeature.State`, or one iOS `from`?

- **Status:** `open`
- **Question:** `f5cb1a6` gives iPad a distinct id for Instant SQLite cache. Message `from` still comes from `CounterFeature.State()`, default `"counter-swift-ios"`. Live echo skip uses State, not runtime.

10-foot:

```text
f5cb1a6 TODAY
  iPad runtime.processorID = "counter-swift-ipad"   // sqlite name
  iPad State.log.processorID = "counter-swift-ios"  // Message.from
  echo skip uses State, not runtime

CLI (already correct)
  --processor-id  →  runtime  AND  State
```

```swift
// Apps/Shared/CounterRootView.swift
self.store = Store(initialState: CounterFeature.State()) {
  CounterFeature(runtime: runtime)
}

// Apps/iOS/CounterApp.swift
private static var processorID: String {
  UIDevice.current.userInterfaceIdiom == .pad
    ? "counter-swift-ipad"
    : Surface.processorID
}
```

Options:

- **A.** Thread into State. `CounterRootView` / `CounterScene` take `processorID`. iPad = `counter-swift-ipad`.
- **B.** One iOS `from`. Revert the idiom split. Phone and pad skip each other’s live Messages.
- **C.** Per-install UUID. Two iPads do not collide.

What I think: **A.** `f5cb1a6` meant to stop echo-drop. It only renamed the cache file.

Trade-off: two iPads still share `counter-swift-ipad` (C is real uniqueness). Pairs with Q13.

---

## Q44 — CLI `live`: 250ms poll, observe Store, or Instant stream?

- **Status:** `open`
- **Question:** `counter-swift live` clears and reprints the ANSI screen every 250ms. SwiftUI already paints from `store.state`. Instant already lands in SnapshotLogFeature.

10-foot:

```text
GOSPEL
  Instant subscribe ──► SnapshotLogFeature ──► Store.state ──► painter

TODAY CLI live
  Store.state ──► poll 250ms ──► PaintANSI
```

Options:

- **A.** Keep 250ms poll.
- **B.** Observe Store (`withObservationTracking` / equivalent). Adapter observes the Program, not the wire.
- **C.** Subscribe Instant again in CLI. Second observer next to the feature.

What I think: **B.** Polling is adapter chrome. A second Instant subscribe in CLI is a second runtime.

Trade-off: Observation on a CLI process must re-arm. Polling is obvious and already works.

---

## Q45 — Full-log hydrate (~2k messages) vs slim query?

- **Status:** `open`
- **Question:** Boot currently queries all `count` and `message` rows, stores every Message in `state.log.messages`, then folds snapshot + later. FoldkitCounterV01 has on the order of ~2k log rows.

10-foot:

```text
WINDOW (show / live / apps)     HEADLESS (npm counter-headless:instant)
  snapshot.value                  print each new message row
  + fold later Messages           not the product Model
TODAY Swift read(): ALL rows → state.log.messages[id]
```

Options:

- **A.** Full hydrate, keep the dict. Matches Foldkit Runtime.start.
- **B.** Slim hydrate. Read snapshot; messages with `createdAtMs > snapshot.at`. Drop the dict after fold.
- **C.** Replace windows with a headless tail.

What I think: **B for windows.** Do not pick C as the Program. You do not need 2k rows in Feature.State after they have been folded.

Trade-off: B needs a query Instant will honor. A is the known gospel and already tested (`hydrationUsesSnapshotNotTheWholeLog`).

---

## Q46 — Collection: Swift Navigation destinations now, or drop `CountersFeature` until then?

- **Status:** `open`
- **Question:** Foldkit `counters` is list/detail/fact/delete. Swift `CountersFeature` is two hardcoded rows, no Path, tape not snapshot-log, not launched. Swift Navigation already exists. TCA 2 already has a `SwiftNavigation` package trait.

10-foot:

```text
SINGLE COUNTER (this package)
  Path /counter
  no destinations

COLLECTION (later Program)
  /counters /:id /:id/fact /:id/delete
  Swift Navigation + TCA 2 ForEach
  child = this Counter Program, wrapped
```

Options:

- **A.** Drop `CountersFeature` until collection is its own Program. Reuse Swift Navigation then. Do not invent a navigator for `/counter`.
- **B.** Add Swift Navigation destinations now in this package.
- **C.** Keep the flat two-row tape demo.

What I think: **A.** Collection is a different Program. Option B is the right shape **later**.

Trade-off: lose wrapped-payload tests until the next Program.

---

## Q47 — `Package.swift` absolute path to TCA26: portable git dep, keep path, or vend?

- **Status:** `open`
- **Question:** TCA 2 is `.package(name: "TCA26", path: "/Users/laptop/Sync/tca/canonical/TCA26")` at `b7890db`. **Do not push this work to pointfreeco.**

10-foot:

```text
DO
  counter-swift ──► technoplato/TCA26 @ b7890db
  local override ──► /Users/laptop/Sync/tca/canonical/TCA26

DO NOT
  url: pointfreeco/TCA26
  copy TCA26 sources into counter-swift
```

Options:

- **A.** Portable git dep on `technoplato/TCA26`, pin revision. Path as documented local override.
- **B.** Keep the absolute path. Honest one-laptop demo.
- **C.** Vend TCA26 into counter-swift. Leaks a closed beta if cloneable.

What I think: **A**, never C, never a pointfreeco URL as the default dep. B is acceptable until someone besides this laptop must build.

Trade-off: git URL needs credentials to the private remote.

---

## Q48 — tvOS offline: accept, or wait for Instant authorizer?

- **Status:** `open`
- **Question:** tvOS runs `offlineCounterRuntime()` because upstream Instant authorizer compiles `ASWebAuthenticationSession` on tvOS and fails. Accept offline TV, block the scheme, or patch Instant in this package?

10-foot:

```text
tvOS TODAY
  CounterScene(offlineCounterRuntime)
  Paint: yes. Instant: no.

instant-data-swift
  #if … !os(watchOS)   ← tvOS ENTERS
  ASWebAuthenticationSession  ← does not compile
```

Options:

- **A.** Accept tvOS offline. Full Program + screen, writes refuse, badge honest. Fix authorizer on `technoplato/instant-data-swift`.
- **B.** Wait (block TV) until Instant authorizer compiles.
- **C.** Work around in counter-swift (`#if os(tvOS)` stubs). A fork by another name.

What I think: **A.** TV is a painter of the one Program. Offline is true. Do not patch Instant inside counter-swift.

Trade-off: a TV that cannot increment on Instant looks broken if you expected sync.

---

## Q49 — Do not push to pointfreeco: freeze remotes?

- **Status:** `open`
- **Question:** TCA26 origin is pointfreeco (private closed beta). counter-swift, Foldkit fork, tca-rust-port, TCA1 fork live on technoplato. Confirm push policy.

10-foot:

```text
NEVER PUSH          OK TO PUSH
  pointfreeco/*     technoplato/foldkit
                    technoplato/tca-rust-port
                    technoplato/counter-swift
                    technoplato/TCA26 (private mirror)
                    technoplato/swift-composable-architecture
```

Options:

- **A.** Freeze: never push pointfreeco from this work. technoplato only.
- **B.** Allow PRs to pointfreeco TCA1 (public library) but never TCA26.
- **C.** Case-by-case.

What I think: **A** for this ADR. TCA1 PRs are a different interview.

Trade-off: upstream Foldkit still cannot receive the exploring branch (Q62).

---

## Q50 — TCA1 fork vs private TCA26: which is the research trunk for counter-swift?

- **Status:** `open`
- **Question:** counter-swift consumes TCA26 by path. TCA1 fork is `technoplato/swift-composable-architecture` @ `63f3c7abf8`.

10-foot:

```text
counter-swift ──► TCA26 (macros, Store: Observable, @Feature)
TCA1 fork     ──► TCA 1 line, not this host
```

Options:

- **A.** TCA26 is the trunk for counter-swift. TCA1 fork is unrelated landing.
- **B.** Port counter-swift back to TCA1.
- **C.** Both must stay in lockstep.

What I think: **A.** `@Feature` / Observation is the Program shape on Apple. TCA1 fork was a landing leftover, not the host.

Trade-off: closed-beta dependency (Q47).

---

## Q51 — SwiftUI views: only paint `counterScreen(state)`, or own selectedId-style UI state?

- **Status:** `open`
- **Question:** `CounterRootView` already paints `PaintedScreenView(screen: counterScreen(store.state))`. Confirm that law so iOS never grows Instant `selectedId`.

10-foot:

```text
CounterFeature.State ──► counterScreen ──► PaintedScreenView
                         (only layout in the package)
```

Options:

- **A.** Confirm: SwiftUI only paints the declared screen. No view-local destination.
- **B.** Allow SwiftUI `NavigationStack` as a second stack for later collection.
- **C.** Mixed: screen for count, SwiftUI for chrome.

What I think: **A** for this package. B is Q46 later, and then Swift Navigation is the adapter, not a second Model.

Trade-off: none if we stay on `/counter`.

---

## Q52 — Testing: TCA TestStore vs Foldkit replay vs both?

- **Status:** `open`
- **Question:** counter-swift has TCA tests. Foldkit has Story/Scene/replay. Instant gospel is live `npm run count`.

10-foot:

```text
Foldkit Story / Scene     replay Messages
TCA TestStore             Action paths
Live Instant              npm run count == counter-swift show
```

Options:

- **A.** Both unit styles; **live Instant equality is the gate** (Q67).
- **B.** TCA TestStore only.
- **C.** Foldkit-style replay on Swift as the only unit tests.

What I think: **A.** Unit tests do not replace the integer on V01.

Trade-off: two test dialects. Acceptable.

---

## Q53 — Android/Kotlin out of the Swift ADR, or pointer only?

- **Status:** `open`
- **Question:** UniFFI Kotlin `CountersScreen` exists and is not in NavHost. That is a Rust question (Q22), not a counter-swift question.

10-foot:

```text
Apple gospel     counter-swift (TCA2, PaintedScreen)
Android          tca-rust-port UniFFI — Q22/Q30
```

Options:

- **A.** Android stays on Rust Qs. This section does not pick `@main` for Compose.
- **B.** This ADR also owns the Android host.
- **C.** No Android in the matrix.

What I think: **A.** One Program, two native packages if both exist; do not mix launch questions.

Trade-off: B turns this file into three products.

---

## Q60 — What is the gospel Program when we add a Rust or Swift host?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A.** `examples/counter`. Closest thing that exists. Multiple Counters is a later climb. Do not make the first native host prove list/detail/modals.
- **Question:** When we add a Rust host and a Swift host to the matrix, which Foldkit Program is the gospel they must share?

10-foot:

```text
                    Instant  FoldkitCounterV01
                    5417c2e3-c6b9-476d-a962-2e11c83492aa
                    count snapshot  +  message log
                              |
         +--------------------+--------------------+
         |                    |                    |
   Foldkit              counter-swift         tca-rust-port
   examples/counter     CounterFeature        (not on V01 yet)
```

Options:

- **A.** `examples/counter`. Screen tree plus snapshot-log. `npm run count` / `increment` are the live Instant gospel.
- **B.** `examples/counters`. `forEach`, navigation as Model. Rust and Swift join the list/detail/modal matrix.
- **C.** Both now. Counter for CLI proof. Counters for SwiftUI and navigation libraries in the same slice.

What I think: **A.** Counters is the next Fibonacci step. Instant gospel is the live Foldkit Counter CLI on FoldkitCounterV01. counter-swift already talks to that app. Rust does not. Option B makes the first native host prove ADR 0003, ADR 0009, and a different Instant schema at once.

Trade-off: you give up Swift Navigation / `forEach` / tape in this slice. Reuse those libraries when Counters is next.

---

## Q61 — Instant app identity: one FoldkitCounterV01 for everything, or a separate app per Program?

- **Status:** `open`
- **Question:** Do Foldkit, Rust, and Swift Counter hosts share one Instant app, or does each Program keep its own?

10-foot:

```text
YES now     FoldkitCounterV01   count + message
NO now      FoldkitPuzzleV01    leftover 240
NO now      songbook / gate / casino
LATER       Counters app        forEach + nav + tape
```

Options:

- **A.** One FoldkitCounterV01 for every gospel Counter host.
- **B.** One Instant app per Program family. Counter V01. A later Counters app. Leftovers keep their apps.
- **C.** One mega Instant app for Counter, Counters, leftovers, and native hosts.

What I think: **A for this ADR.** **B is the later house**, not this slice. counter-swift already learned: same-actor tape against the puzzle app meant `npm run count` never saw those rows.

Trade-off: A means every native Processor must use a distinct `processorId` (Q13/Q43). C mixes leftover permissions into the count.

---

## Q62 — Foldkit landing: PR origin, keep technoplato fork as hobby main, or rebase later?

- **Status:** `open`
- **Question:** Work lives on `technoplato/foldkit` `ml/exploring-view-agnosticism` @ `077afe4a3`. We cannot write `foldkit/foldkit` main. Where is the product home?

10-foot:

```text
foldkit/foldkit main     <-- cannot write
        \
technoplato/foldkit
  ml/exploring-view-agnosticism @ 077afe4a3
  examples/counter   <-- hobby gospel lives here
```

Options:

- **A.** Open a PR to `foldkit/foldkit` now.
- **B.** Keep the technoplato fork as hobby main. Ship the matrix from that branch.
- **C.** Stay on the exploring branch. Rebase onto origin main later.

What I think: **B.** A huge-commit PR is not a product review. Host titles already point at technoplato.

Trade-off: strangers clone `foldkit/foldkit` and miss the gospel. That is already true.

---

## Q63 — Rust force-push: accept rewritten main? (alias of Q32 if you want one answer)

- **Status:** `open`
- **Question:** Same decision as Q32. Kept here so landing policy is answerable without the Rust section. If Q32 is decided first, mark this `deferred` as duplicate.

Options: same as Q32.

What I think: answer on **Q32**; this row exists so the landing checklist cannot skip it.

---

## Q64 — counter-swift public home: stay on technoplato?

- **Status:** `open`
- **Question:** Public on `technoplato/counter-swift` @ `f5cb1a6`, not `strangelearning`. TCA26 stays private.

10-foot:

```text
strangelearning   TCA26 private   never log out
technoplato       foldkit fork + counter-swift public + tca-rust-port
```

Options:

- **A.** Keep public on `technoplato/counter-swift`.
- **B.** Rename/transfer later to a Foldkit org. Do not move in this ADR.
- **C.** Move now to `strangelearning/counter-swift`.

What I think: **A now. B later if a Foldkit org appears.** Public Counter must not sit on the account that holds closed-beta TCA26.

Trade-off: the GitHub name says technoplato, not Foldkit. Matches Q62.

---

## Q65 — What is explicitly not this ADR?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A, plus the voice app.** Ignore the app itself this interview. Leftovers #240–#245 stay Open/Blocked. No Scribe / payments / puzzle / songbook / gate / casino. No abstracting Multiple Counters until Counter sync is robust.
- **Question:** If we accept one Program, adapters, reused nav libraries, and Instant gospel as the live Foldkit Counter CLI, what must workers refuse to treat as this ADR?

10-foot:

```text
THIS ADR
  Foldkit examples/counter
  counter-swift CounterFeature live snapshot-log
  tca-rust-port Counter adapter on FoldkitCounterV01 (if Q30 A)

NOT THIS ADR          leftover
  puzzle              240
  songbook            241
  gate                242
  casino              243
  Instant leftover    244 245
  Scribe / SQLiteData / payments
```

Options:

- **A.** Park all of that. This ADR is only the three-repo Counter gospel. Do not close 240–245.
- **B.** This ADR may close leftover holes that sit in `examples/counter` or native Counter hosts. Still do not close 240–245.
- **C.** This ADR also owns leftover Instant ADT pass for 240–245, because Instant is the gospel.

What I think: **A.** Workers that start Scribe, payments, puzzle, songbook, gate, or casino are in the wrong tab.

Trade-off: A looks narrow. That is the point.

---

## Q66 — Delete vs polish leftover surfaces on the Counter path?

- **Status:** `open`
- **Question:** Instant window family, dead UniFFI shells, unused CountersFeature, unused React A/B — delete, park, or polish?

10-foot:

```text
DELETE    window selectedId / Instant App as product React (if Q02 A, Q09 B)
PARK      CountersFeature (not live V01)
PARK      UniFFI Counters @main (if Q22 D)
KEEP      counterScreen / PaintedScreen / snapshot-log
```

Options:

- **A.** Delete now (window family, React-A/B, unused CountersFeature, dead UniFFI shells).
- **B.** Park. Do not polish. Gospel work must not import them.
- **C.** Split: delete Instant window `selectedId` and unused presenter; park UniFFI and `CountersFeature` until Q60/Q22 say otherwise.

What I think: **C.** Window `selectedId` is a second Model. UniFFI exporting a Store is a third architecture; counter-swift already is the iOS Program. `CountersFeature` is a later climb.

Trade-off: A is a large mow that can break Expo tests. B leaves landmines.

---

## Q67 — Success evidence: what painted proof counts?

- **Status:** `open`
- **Question:** When is the matrix slice done?

10-foot:

```text
GATE     npm run count / increment   FoldkitCounterV01
GATE     native show equals that integer
SHOW     iPhone / Mac / watch screenshot
LATER    HTTP 200 { count }
NOT      leftover 240-245 closed
NOT      Counters presenter=a URL
```

Options:

- **A.** Gospel is the live Foldkit CLI round-trip on FoldkitCounterV01, plus native `show` matching that integer. Screenshot is showing, not the gate.
- **B.** Gospel is Instant HTTP 200 `{ count }`.
- **C.** Gospel is a physical iPhone screenshot plus Swift CLI.

What I think: **A.** Instant gospel is the live Foldkit Counter CLI. Native hosts join by showing the same integer with their own `processorId`.

Trade-off: A can pass while Expo still Instant() in a window file. Call that a fail in the audit, not a second gospel metric.

---

## Q68 — Order of work if the spirit is accepted?

- **Status:** `open`
- **Question:** If gospel is one Counter Program, adapters, reused nav libraries later, Instant gospel `npm run count` on FoldkitCounterV01, what does a worker do first?

10-foot:

```text
1. processorId catalog + thread into State (Q13, Q43)
2. same FoldkitCounterV01 snapshot-log
3. paint counterScreen / PaintedScreen
4. FFI / UniFFI only if a host has no native Program
5. Counters + Swift Navigation / rust-navigation  later
```

Options:

- **A.** Processor IDs first, then screen parity, then native adapters.
- **B.** Foldkit screen first. Instant and processor ids wait.
- **C.** FFI wiring first. UniFFI / Kotlin / Swift shells so one Rust core drives iOS and Android.
- **D.** Foldkit screen (already lifted) + processor IDs in one slice. FFI last and optional. Native Swift stays TCA2, not UniFFI.

What I think: **D.** The live miss on Swift was identity and schema, not the painter. C picks Hashimoto UniFFI as the iOS host and fights Q40/Q46/Q64.

Trade-off: C was the engineering ask that never got product questions. D answers those questions: native Swift is already a Program.

---

## Q69 — Instant leftovers #240–#245: leave catalog truth, or triage now?

- **Status:** `open`
- **Question:** Catch-up graded Puzzle/Songbook/Gate/Casino Open or Blocked. User said do not close them.

10-foot:

```text
#240 Puzzle    partial
#241 Songbook  partial, hold 0.150 TextInput
#242 Gate      blocked public 502
#243 Casino    blocked no receive address
#244 #245      partial
```

Options:

- **A.** Leave Open/Blocked as catalog truth. This ADR does not touch them.
- **B.** Triage now (still do not close without evidence).
- **C.** Close as “not this main.”

What I think: **A.** Instant issues.knophy.com is the catalog. Chat claims are untrusted. C is forbidden.

Trade-off: they stay noisy. That is honest.

---

## Q70 — Parent Instant issue for ADR 0011: create now, or after decisions lock?

- **Status:** `open`
- **Question:** Phase B wants a parent issue. Phase A can interview without one.

10-foot:

```text
NOW                 AFTER LOCK
  this folder       parent issue + successCriteria per plan step
  qanda.md          workLog
```

Options:

- **A.** Create parent issue now, empty criteria, link from README.
- **B.** After decisions lock (Phase B). README stays TBD until then.
- **C.** No Instant issue; git folder is enough.

What I think: **B.** The skill says issue tracker is execution SoR. Interview SoR is this folder. Creating a hollow #NNN now invites “done” without answers.

Trade-off: a cold agent might miss the folder. README path is in catch-up.

---

## Q71 — Secrets / `.lavish/` / credentials: confirm never in git?

- **Status:** `open`
- **Question:** Foldkit dirty tree skipped `.lavish/`. Instant tools use `with-instant-tools-credentials`. Confirm they never land.

10-foot:

```text
NEVER COMMIT
  .lavish/
  admin tokens
  refresh tokens
  with-instant-tools-credentials output
```

Options:

- **A.** Confirm never. If a commit already has them, revert that path only.
- **B.** Allow demo env files if they are the public demo app id.
- **C.** Vend credentials for one-laptop Instant.

What I think: **A.** Public demo app id `5417c2e3-…` is not a secret. Tokens are.

Trade-off: none. B is already how FoldkitCounterV01 is documented.

---

## Q72 — Worktrees leftover from catch-up: delete, keep, list?

- **Status:** `open`
- **Question:** `tca-rust-port-dir-tow`, `tca-rust-port-scribe-stress`, and others exist. Landing used dir-tow as main.

10-foot:

```text
tca-rust-port              ?
tca-rust-port-dir-tow      main @ 1fd1bb3  (landed)
tca-rust-port-scribe-stress  (scribe, other main)
```

Options:

- **A.** Keep worktrees. List in findings. Do not merge scribe-stress into Counter gospel.
- **B.** Delete leftover worktrees after confirming main has the commits.
- **C.** Make dir-tow the only checkout; remove others.

What I think: **A.** Do not delete checkouts from an ADR answer. Scribe-stress is another main (Q65).

Trade-off: disk clutter. Safer than rm.

---

## Q73 — Phase B Instant issues only after decisions lock?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A.** Architecture interview first. No implementing remainder P0s from agent guesses. The last four days were C.
- **Question:** Skill says do not implement remainder P0s unless the human answers. Confirm.

Options:

- **A.** No implementation of P0s (screen, kill selectedId, wire FFI, thread processorID) until the relevant Q is `decided`.
- **B.** Implement “obvious” deletes in parallel with the interview.
- **C.** Implement everything the agent thinks, then retrofit answers.

What I think: **A.** The last four days _are_ C. This interview exists so that stops.

Trade-off: A feels slow. It is the product.

---

## Q74 — If the human disagrees with “what I think” on a P0, halt that leaf only or the whole plan?

- **Status:** `open`
- **Question:** Example: agent picks Q60 A (single Counter); human picks B (Counters now). Does work on processorID/V01 stop?

Options:

- **A.** Halt only leaves that depended on the overridden pick. Unrelated decided Qs may proceed after lock.
- **B.** Halt the whole plan until every P0 Q is decided.
- **C.** Agent continues on its picks until told to stop.

What I think: **A**, with **B** until Q00/Q60/Q65 are decided — those three are the spine.

Trade-off: A requires a dependency table in `plan.md`. That is Phase B.

---

## Q75 — ASCII layers across TS / Rust / Swift: one ADR or split later?

- **Status:** `open`
- **Question:** Q12 (Foldkit), Q27 (Rust), Q51 (Swift paint). Same law or three answers?

10-foot:

```text
LAW CANDIDATE
  Program owns the tree (screen or Destination)
  CLI/TUI/SwiftUI/Compose only paint it
  no host-authored product ASCII
```

Options:

- **A.** One law for all languages. Answer Q12 and apply.
- **B.** Per-port: Foldkit screen, Rust JSON+ratatui, Swift PaintedScreen — all legal adapters of one Program.
- **C.** Split a later ADR for ASCII.

What I think: **B** as adapters, **A** as ownership. The Program owns identity; the paint runtime may be ANSI, ratatui, or SwiftUI.

Trade-off: C delays the law that already failed Instant `selectedId`.

---

## Q76 — Scope of ADR 0011: include Rust+TCA2 in this folder, or sibling ADRs?

- **Status:** `open`
- **Question:** This file already holds Foldkit + Rust + Swift + landing. Keep one interview, or split after Q00?

Options:

- **A.** One folder, one walk. This is the double-check of “all of this work.”
- **B.** After Q00/Q60, split 0012 rust-ports and 0013 counter-swift. This folder keeps Foldkit + landing.
- **C.** Three ADRs now; this file was only sourcing.

What I think: **A until Q60 is decided.** If gospel is single Counter, Swift Qs stay; many Counters Qs defer. Splitting first loses the spine.

Trade-off: a long `qanda.md`. That is the point of sourcing first.

---

## Q77 — Multiple Counters Instant: Program tape (`foldkitMessageProposals`) or FoldkitCounterV01 snapshot-log?

- **Status:** `open`
- **Question:** Single Counter Instant is snapshot-log (`count` + `message` on FoldkitCounterV01). Multiple Counters Instant uses `makeSharedProgramTape` over `foldkitMessageProposals`. Which is gospel **for counters (plural)**? (Single Counter remains Q41/Q60.)

10-foot:

```text
Single Counter     FoldkitCounterV01   count + message
Multiple Counters  makeSharedProgramTape  proposals + accepted occurrences
Do not unify by stuffing rows into V01 (Rust Q25 leak).
```

```ts
// examples/counters/instant-host/src/makeTape.ts
export const makeCountersTape = (store, processorId, subjectId) =>
  makeSharedProgramTape({
    Message,
    identity: { programId: MultipleCountersProgram.id, ... },
    store,
  })
```

Options:

- **A.** Instant Program tape for Multiple Counters. V01 stays the single-counter snapshot-log.
- **B.** Snapshot-log for Multiple Counters too (identified rows as tables).
- **C.** Both: snapshot for counts, tape for navigation Messages.

What I think: **A.** Snapshot-log cannot represent identified rows, retirement, or Navigation without becoming a second Model. Q25 already says stop writing `counter_rows` into V01.

Trade-off: two Instant apps / two protocols. That is two Programs.

---

## Q78 — Who owns add/delete counter identity: Program `CounterId` or Instant entity UUIDs?

- **Status:** `open`
- **Question:** Hosts mint `counter-N` at the input boundary; Program validates uniqueness/retirement. Instant rows use `crypto.randomUUID()` for proposals. Who owns domain identity?

10-foot:

```text
Program  CounterId = counter-[A-Za-z0-9_-]+  rows + retiredCounterIds
Adapter  nextAllocatedCounterId(model)
Instant  makeId: crypto.randomUUID()    envelope only
```

Options:

- **A.** Program `CounterId`. Instant UUIDs are envelope ids, not counter ids.
- **B.** Instant entity ids are counter ids.
- **C.** `compose.forEach` numeric `nextId` / `ClickedAddRow`.

What I think: **A.** Same as Q10: add is not generic row append. Delete retires `CounterId`; it does not delete Instant occurrence rows.

Trade-off: hosts still allocate. Allocation is an input boundary, not a second ledger.

---

## Q79 — Confirmation/alert: Program sum only, host modal, or Program sum + native mapping?

- **Status:** `open`
- **Question:** Fact and delete are `CounterDetailMode` on Navigation. React-A/B map them to modal/dialog. May a host own a modal boolean? (Q04 is the Model shape; this is the host law.)

10-foot:

```text
Program  maybeMode = FactAlert | DeleteConfirmation | none
Adapter  React-A ModalShell; React-B dialog/sheet
         Instant ReadyWindow  <-- no mode paint
```

Options:

- **A.** Program sum only. Host paints. No host modal boolean.
- **B.** Host modal (`window.confirm` / React state) is the confirmation.
- **C.** Program sum + host native mapping. Dialog/sheet are paint of the same case.

What I think: **C.** Native `dialog` vs custom shell is adapter paint (`presentationStyleOf` already returns Sheet vs Dialog). Mutual exclusion stays in the Model. B is what ADR 0003 forbade.

Trade-off: Instant `App.tsx` currently cannot show these modes at all.

---

## Q80 — `ios-app/DerivedData-device/`: ignore, delete trees, or relocate Xcode derived data?

- **Status:** `open`
- **Question:** `/target/` and `/ios-app/DerivedData/` are gitignored. `DerivedData-device/` is present on the rust checkout and is **not** ignored.

10-foot:

```text
ignored:      /target/  /ios-app/DerivedData/
NOT ignored:  ios-app/DerivedData-device/
```

Options:

- **A.** Also ignore `/ios-app/DerivedData-device/` and never commit it.
- **B.** Delete the on-disk trees now; gitignore is enough going forward.
- **C.** Relocate Xcode derived data out of the repo.

What I think: **A.** Local delete is hygiene, not an ADR. Unignored DerivedData is a `git status` landmine.

Trade-off: none if we never commit it. C is nicer DX, more Xcode config.

---

## Q81 — Mismatches vs the ask: bugs after Q&A, or intended WIP?

- **Status:** `open`
- **Question:** ReadyWindow, dual `update`, no-op `FfiNavigator`, iPad `from` only in bootstrap — bugs to fix after lock, or intended product?

10-foot:

```text
CATALOG (intended Open/Blocked)     DRIFT (bugs after lock)
  leftover #240–#245                selectedId, dual update
                                    FfiNavigator no-ops, iPad from
```

Options:

- **A.** All mismatches are bugs. Fix from the findings table after lock.
- **B.** Intended WIP. Keep as the product.
- **C.** Split: leftover #240–#245 is catalog; ReadyWindow / dual update / no-op navigator / iPad `from` are bugs after lock.

What I think: **C.** The leftover board is catalog. The delete/polish table is drift, not gospel.

Trade-off: C is two buckets. A would treat Gate 502 as a code bug. B would bless Instant `selectedId`.

---

## Q82 — Accept `findings.md` as the meta-audit input?

- **Status:** `open`
- **Question:** Two source audits plus this folder’s `findings.md` — enough to interview from, or re-audit before more Qs?

Options:

- **A.** Accept `findings.md` as the meta-audit input. Do not re-audit as a gate.
- **B.** Re-run both audits on `077afe4a3` / `1fd1bb3` / `f5cb1a6` before any more Qs.
- **C.** Discard the architecture audit as Wallet-era; keep only the counters host audit plus findings.md.

What I think: **A.** Findings already name SHAs and seams. Re-audit is delay.

Trade-off: later host drift (Datastar, payments) is in CHANGELOG, not the 08-25 counters audit. Overview 01 covers that.

---

## Q83 — Stop landing other mains this session except this ADR folder?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A.** Focus on architecture in this folder (`intentions.md`, `qanda.md`, overviews). Do not land more product on exploring / rust / Swift from this conversation.
- **Question:** README already lists landed checkouts as not up for re-landing. Confirm: write only this ADR folder until Qs lock?

Options:

- **A.** Stop other mains. Only this ADR folder until decisions lock.
- **B.** Keep leftover catch-up in parallel (songbook ADT, Gate origin, Casino address).
- **C.** Allow exploring commits when tests pass; freeze rust / Swift only.

What I think: **A.** Another “land it all” pass would race this interview. Leftovers stay Open (Q69).

Trade-off: leftover #241 stays partial. That is Q69, not a reason to keep committing exploring.

---

## Q84 — `instant-counter` v3 `programScreen.tsx` still reads `counter.counter.count` after the `child` rename. Delete, fix, or ignore?

- **Status:** `open`
- **Question:** v3 Instant-counter consumes the Program via InteractionGraph but its host screen drifted to the old row payload name. Proof that host-authored screens rot.

10-foot:

```text
CORE rows: { id, child }
v3 host:   counter.counter.count   <-- drifted
```

```tsx
// examples/instant-counter/src/v3Demo/react/programScreen.tsx
<output>{counter.counter.count.toString()}</output>
```

Options:

- **A.** Not production. Delete or freeze v3 host screen; Instant production is Q09/Q12 (bindings or Program.screen).
- **B.** Fix the field name and keep v3 as a Program consumer.
- **C.** v3 is production Instant; Instant window `App.tsx` is leftover.

What I think: **A** unless Q09/Q12 pick v3. Host-authored screens that re-reach into row shape will rot again.

Trade-off: B is a one-line fix that teaches the wrong lesson if Instant `App.tsx` stays the shipped UI.

---

## Q85 — Where do evolving architecture ideas live?

- **Status:** `decided`
- **Asked:** 2026-08-26 (dictation: “where do you even encapsulate ideas”)
- **Answered:** 2026-08-26
- **Question:** Random markdown at the repo root? Agent “intentions”? Principles?

10-foot:

```text
THIS ADR FOLDER
  intentions.md   evolving ideas (home)
  qanda.md        questions + answers
  overviews/      ASCII
  findings.md     what code actually does
```

Options:

- **A.** This ADR folder. `intentions.md` is the home. `qanda.md` is the walk. No second gospel at repo root.
- **B.** A new `PRINCIPLES.md` at Foldkit root that every agent must read.
- **C.** Keep dumping into chat.

**Answer:** **A.** Created `intentions.md`. Principles that lock become decided Qs, then plan.md.

Trade-off: agents must be told this path. README now says so.

---

## Q86 — How does a device catch up when it was offline or not listening?

- **Status:** `decided`
- **Asked:** 2026-08-26 (dictation)
- **Answered:** 2026-08-26
- **Answer:** **A, with robustness required.** Snapshot is a cache. The law is the Message log. Boot = snapshot, then fold later Messages through the same `update`. Last-writer `count` is not the law (that is C, and it is the drift). Not D (second runtime). Not B as the product path (whole-log replay is allowed as a debug/harness mode). **Robust** is not a slogan: Q103 names the cases the algorithm must survive.
- **Question:** Local send already runs `update` immediately (offline, no network). Peers’ Messages fold through the same `update` when observed. If the device was off, or not subscribed, **how does it accumulate the missed Messages** so that after sync, every device’s representation matches?

10-foot:

```text
LOCAL (always)
  send(Message) → update(model, msg) → (next, commands)
  never waits on the network

PEERS (when listening)
  observe Instant → skip own echo → update(model, peerMsg)

CATCH-UP (OPEN)
  device was off / tab closed / radio down
  ? snapshot of count
  ? replay every Message since last seen
  ? snapshot + Messages after snapshot.at   (today's FoldkitCounterV01)
  ? something closer to Instant's EAV store (Q100)
```

```ts
// TODAY: examples/counter snapshot-log
// boot = count snapshot.value + messages with createdAtMs > snapshot.at
// tap  = fold locally, then transact { count, message }
```

Neighboring: Instant observe-emit is the live path. Headless tails new rows; it is not the window's Model. They said representations must match after sync, including offline ops. Reset does not combine with +/− (Q88). A last-writer snapshot of `count` alone loses concurrent increments (`3` and `5` → `5`, not `8`).

Options:

- **A.** Snapshot + Message log (today's V01). Boot from snapshot, fold later Messages. Snapshot is a cache, not the law. The law is the Message log.
- **B.** Message log only. No snapshot. Boot always replays the whole log (~2k rows today, grows forever).
- **C.** Snapshot is the law (last writer wins on `count`). Messages are telemetry. Concurrent +/− can drop.
- **D.** CRDT / operational transform on the integer. Messages are hints. Different runtime than `update`.

What I think: **A.** Matches the dictation (event sourcing + a way to accumulate). C is why they see counters fall out of sync. D invents a second `update`. B is honest and will get slow; slim query is a later harness (Q101), not a different law.

Trade-off: A still needs a total order (or a declared combine rule per Message — Q88). Own-echo skip still needs a Processor id (Q13). If two devices both Reset, last-in-log wins unless we say otherwise.

---

## Q87 — One Message catalog as the source of truth?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26
- **Answer:** **A, amended.** One catalog is `md(...)` plus the `actions` array. CLI tokens, action-menu keys, ASCII, React buttons, and Instant log tags all derive from that. Tests fail if a Message constructor is missing from `actions`. Not B (no new `Catalog` type). Not C (no parallel key maps).

  **Words:** the catalog answers whether this Action is **valid / enabled / supported in the current Model**. Not hidden. Code today has `valid` and a second field `hiddenBecause`, plus `TapHandle.Hidden`. If we keep a reason string, it is **why this Action is not valid**, not why it is hidden. Rename in the plan (`hiddenBecause`, `TapHandle.Hidden`, CLI `hidden` field). Do not keep "hidden" in the product language.

  Already decided, spelled out: Q88 (Reset vs increment) is fold every Message in log order. That is why the catalog does not get a `combines` field. Do not invent a new catalog type waiting on the later route-table question (Q89).

- **Question:** One dictionary of Messages: keys that send them, whether they are valid in the current Model, and whatever else the runtime needs. CLI, action menu, ASCII, and React buttons derive from that declaration. Not a pile of `switch`es.

10-foot:

```text
Program (core)     md + actions[] is the catalog
        │
        ├─ valid / listActions / action menu / CLI tokens
        └─ Instant     Message log rows are tags, not a second catalog

  examples/counter/core/src/message.ts
    Increment / Decrement / Reset = md({ keys, tokens, valid, … })
    actions = [Increment, Decrement, Reset]
    Message = Union(actions)
```

```ts
// core (catalog), not the React button:
export const Reset = md('Reset', {
  keys: ['r'],
  tokens: ['reset'],
  valid: (model, _context) => model.count !== 0,
  hiddenBecause: model =>
    model.count === 0 ? 'count is already 0' : undefined,
})
export const actions = [Increment, Decrement, Reset] as const
```

Neighboring: `listActions` projects `Program.valid`. Action-menu keys send the same Message (Q90 already: menu is a sibling slice). Q88 already: fold the log in order, so no `combines` on the catalog.

Options:

- **A.** Keep and tighten `md` + `actions` as the one catalog. Everything else derives. Tests fail if a Message is missing from `actions`.
- **B.** New type named `Catalog`, keyed by token. No decided field that `md` cannot already hold.
- **C.** Leave constructors plus separate key maps plus separate valid functions (drift in other examples).

What I think: **A.** Counter already has it. B abstracts ahead. C is the drift we are deleting.

Trade-off: A is already there. Agents still add parallel maps. Tests must fail if a Message is missing from `actions`.

---

## Q88 — How do we name Messages that do not combine (Reset vs +/−)?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26
- **Answer:** **B.** Always fold in log order. No catalog field. Reset-after-increment is “the log said so.” Not A (`combines` on the catalog). Not C (CRDT / second `update`). Catch-up order remains `(createdAtMs, from, seq, id)` (Q86). Event time is tap/persist, not reconnect (worked example below).
- **Question:** Increment and Decrement combine (`3` then `5` → `8`). Reset sets zero and does not combine. They asked if “commute” is the word (too academic) and said the declaration belongs in the one catalog because it changes runtime behavior.

10-foot:

```text
Increment  count = count + 1     combines with other Increment/Decrement
Decrement  count = count - 1     same
Reset      count = 0             does not combine; order vs +/− matters
```

Plain words that could live on the catalog:

- **combines** — folding two of these in either order (or both) gives the same Model
- **replaces** — later one wins; earlier +/− before a Reset are forgotten if Reset is in the log after them
- (avoid “commute / CRDT” in the catalog; keep those in a footnote)

Options:

- **A.** Catalog field `combines: true | false` (plain). Runtime: fold the log in order always; use `combines` only for catch-up / concurrent-batch optimizations and for tests.
- **B.** Always fold in log order. No catalog field. Reset-after-increment is just “the log said so.”
- **C.** Full CRDT on the integer. Reset is a different type. Academic, second `update`.

What I think: **B for the law** (the log is the law, `update` is total). **A as optional metadata** when we write the catch-up tests, named **combines**, not “commute.” Never C this week.

Trade-off: without A, two offline increments still need a total order when they meet (Instant `createdAtMs` + id). That is catch-up (Q86), not a new `update`.

Worked example (2026-08-26, clarifying “is event time used on reconnect?”):

**Yes. Tap/persist time, not reconnect time.** Each Message is stamped `createdAtMs = Date.now()` in `fillWriteTime` at the moment local `update` already ran. Memory Instant queues that **already-stamped** row while offline. `comeOnline` flushes the queue **without** calling `now()` again. Instant transact sends those attrs as written. A naive second `persist()` that re-stamps would be a bug; retry must keep the same Message **id** and the same `createdAtMs`.

Order of the log is `(createdAtMs, from, seq, id)`. Millisecond dominates. Same Processor, same millisecond: `seq` keeps Reset-then-+ as tapped (UUIDs must not reverse them).

Reset does **not** delete later +/−. It is one row. Fold `update` in that order. + that sit **before** Reset in the log are zeroed. + that sit **after** Reset still count. Last-writer `snapshot.value` is not the answer.

10-foot:

```text
LOCAL (always, even offline)
  send(Reset|Increment)
    → Counter.update immediately
    → persist stamps createdAtMs = now, id, from, seq
    → Instant write (or queue the same row)

ONLINE HEAL
  queued rows keep their stamps
  peer sees them as ordinary log rows
  if a row's createdAtMs is *before* lastApplied
    → LogRefolded: fold the known log from the boot base
  else
    → RemoteMessageReceived → same Counter.update

NOT
  reconnect time as the event time
  last snapshot.value wins
  “Reset means drop the other operator's +”
```

```ts
// packages/foldkit/src/runtime/start.ts  (persist)
createdAtMs: now,          // Date.now() at this persist
id: messageId, from, seq   // seq is per-Processor write order

// packages/foldkit/src/runtime/syncEngine.ts  (Memory offline)
if (isOffline) {
  queuedWrites.push(write) // already stamped; no second now()
  return { link: 'queued' }
}
comeOnline: applyWrite each queued row as-is

// start.ts onEvent: row earlier than lastApplied → foldLog()
```

Shared start: both screens show **5**. Phone goes **offline**. Laptop stays **online**.

```text
WALL CLOCK (event time = createdAtMs)

 t=0   both: 5. Phone radio down.
 t=20  Phone Reset     local 5→0    queue  Reset      ms=20 seq=0
 t=21  Phone +         local 0→1    queue  Increment  ms=21 seq=1
 t=22  Phone +         local 1→2    queue  Increment  ms=22 seq=2
       Phone screen = 2. Laptop still 5 (never saw Phone).

 t=30  Laptop +        local 5→6    deliver Increment ms=30
       Laptop screen = 6. Phone still 2 (still offline).

 t=40  Phone comes online. Three queued rows flush with ms 20,21,22.
```

Merged log (from the agreed 5, fold through the same `update`):

```text
  5 --[Reset  t20]--> 0
    --[+ Phone t21]--> 1
    --[+ Phone t22]--> 2
    --[+ Laptop t30]--> 3
```

**Settled count = 3.** Both screens end at 3.

While partitioned:

| Who    | Screen | Why                                         |
| ------ | ------ | ------------------------------------------- |
| Phone  | 2      | local Reset then ++, no Laptop + yet        |
| Laptop | 6      | one local + on the old 5, no Phone rows yet |

Processing at t=40:

1. Phone already applied its three Messages locally. It does not fold them again (echo-skip by this-run `from` / known id). It receives Laptop `+` at t=30, which is **after** Phone's lastApplied (t=22), so it is `RemoteMessageReceived` → Increment → **3**.
2. Laptop already applied its `+` (lastApplied t=30). Phone's three rows arrive with **earlier** `createdAtMs`. That is out of order → `LogRefolded`: start from the 5, fold Reset, +, +, Laptop +. Screen jumps **6 → 3**.

Laptop's increment is **not** dropped. It is applied **after** Reset because t=30 > t=20. Reset zeroed the old 5; the Laptop + then counts from 0.

Second interleave — Laptop + **before** Phone's Reset:

```text
 t=10  Laptop +        5→6     Increment ms=10
 t=20  Phone Reset     5→0     Reset     ms=20   (Phone still thinks 5)
 t=21  Phone +         0→1
 t=22  Phone +         1→2
 t=40  heal
```

```text
  5 --[+ Laptop t10]--> 6
    --[Reset  t20]--> 0
    --[+ Phone t21]--> 1
    --[+ Phone t22]--> 2
```

**Settled count = 2.** The Laptop + is still in the log, but Reset sits after it, so the Model forgets it. That is “does not combine.”

Wrong algorithm — restamp Phone's rows at reconnect t=40:

```text
  5 --[+ Laptop t30]--> 6
    --[Reset  t40]--> 0
    --[+ Phone t41]--> 1
    --[+ Phone t42]--> 2
```

Settled would be **2**, and the Laptop + that happened **after** Phone tapped Reset is wiped. That is reconnect-time, not event-time. The code must not do this.

Wrong algorithm — last snapshot.value wins: Phone cache 2 vs Laptop cache 6 → one integer, the other operator's Messages gone. That is Q86-C, rejected.

Clock skew: if Phone's wall clock is hours behind, its Reset can sort “in the past” of Laptop + that a human saw first. `seq` only orders the **same** Processor. We are not doing CRDT (option C) this week; the harness must still name the outcome (Q103 case 6).

---

## Q89 — Declarative route table: one record of routes, observed state, and sendable Messages?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q02 A: host paints the Program; URI is a carrier)
- **Answered:** 2026-08-26
- **Answer:** **B.** Land the route table now, even while Counter has one row. Each destination names what it observes and which catalog Actions it may send. Parser-printer stays: `Path` ↔ `/counter`. Hosts still pass `Path()`, not the string.

  Why B is not an empty duplicate: a later destination (they named Settings) will not send Increment. Some Actions may still be asked from anywhere (“add one”, “add fries”). The table is what an agent looks up: where that Action is allowed, and how to dispatch if we are not on that destination. Settings as a real second row is Q112.

- **Question:** Counter already has one destination and a parser-printer (`Path` ↔ `/counter`). Do we also want one table that names, for each destination, what it observes and which catalog Actions it may send? Or is the catalog (Q87) plus `Path` enough until there is a second place to go?

**What Counter has today**

`examples/counter/core/src/path.ts` names one destination, `Path` (`Counter`). A parser-printer turns that into `/counter` and back. `parse(print(Path()))` is `Path()`. `print(parse('/counter'))` is `/counter`. React already passes `Path()` into `useModel` and `useScreen`, not the string `'/counter'`. That is the carrier Q02 just locked: the Program names the place, the host does not.

The catalog (Q87) already lists Increment, Decrement, Reset. The Model already is `{ count }`. A second object that repeats “this route observes count and sends those three Actions” would say the same thing twice, unless a later destination is allowed to send only some Actions.

10-foot:

```text
TODAY  examples/counter/core/src/path.ts
  Path = r('Counter')
  pathRouter = literal('counter') → Path
  prints /counter

TABLE IF WE WRITE ONE NOW
  Counter: { path: /counter, observe: count, send: Increment|Decrement|Reset }
```

Options:

- **A.** Keep the one `Path` and the parser-printer. Observe is the Model. Send is the catalog (Q87). Grow a bigger table when there is a second destination.
- **B.** A real table now, even for one row: Counter observes `count`, may send Increment, Decrement, Reset. Same parser-printer law. Hosts still do not own the routes.
- **C.** Hosts own routes (Expo files, React Router). Core only stores the string `'/counter'`.

What I think: **B.** Q02 just said the host must not invent the place. A table that names the one place, what it shows, and which Actions it sends is that law written down. A is enough for Counter today and duplicates less. C is the Multiple Counters `useState(uri)` mistake again.

Trade-off: B writes observe/send next to Path even though Q87 already lists the Actions. That is duplication until a destination is allowed to send only a subset. A waits for that subset. Under the no-shortcut law, waiting only to save time is not a reason. Waiting because the catalog already is the send list is a reason.

---

## Q90 — Action menu: sibling slice via `compose.actionMenu`, nested in product, or host chrome?

- **Status:** `decided`
- **Answered:** 2026-08-26 (dictation)
- **Answer:** **A.** `Program.compose.actionMenu({ of: CounterProgram })`. Product and menu are siblings. Keys on Message defs send the same Message. Not host chrome.
- **Question:** Cmd-K action menu is navigational state. They want it as a **sibling** of the core product Program. Keys on Message defs send the same Message. `compose.actionMenu` already wraps a Program and puts `{ product, actionMenu }` on the Model.

10-foot:

```text
App = Program.compose.actionMenu({ of: CounterProgram })
Model = { product: { count }, actionMenu: Closed | Open }
```

Options:

- **A.** Keep `compose.actionMenu` as the sibling HOF. Product `update` stays pure. Menu is one extra slice.
- **B.** Put menu flags on the product Model.
- **C.** Host-only overlay. Core never sees Open/Closed.

What I think: **A.** That is the code they pointed at. Instant even syncs Open/Closed as a Message (`synced.ts` comment). C would make cmd-K a second Model.

Trade-off: menu Open on Instant is shared chrome. If that is wrong, it is a later Q — do not nest it into `count`.

---

## Q91 — Action menu: letter used to fuzzy-search vs the same letter sending a product Action?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26
- **Answer:** **D (new). Floating combo box. Focus decides.** Not A (Open always filters). Not B (keys always send). Not C (modifier).

  The menu is a floating combo box. That is sibling navigation state (Q90). Compose it in **Foldkit core**, not in `examples/counter`.

  - **Filter focused:** printable keys type into the query. Escape dismisses.
  - **Filter not focused (list / chrome):** declared Action keys send (`r` is Reset). j / k move one row. J / K and Cmd-Up / Cmd-Down jump to first / last.
  - Escape from the list **focuses the filter**. Escape again dismisses.

  Today’s test “sends Increment from + while Closed and while Open” encodes B. That test is the bug.

  Swift and Rust do not have this menu yet. Audit those hosts. Same combinator.

  Open Model today is only `{ focus: number, maybeQuery }`. Filter vs List is **Q110**.

- **Question:** Possible bug they noticed: if the Action you would send from the menu is a letter you are typing to filter, what happens?

10-foot:

```text
Reset.keys = ['r']
While menu Open:
  actionMenuMessageFromKey
    1. cmd-K / Esc
    2. productMessageFromKey  ← 'r' sends Reset even while Open
    3. only then printable keys filter the query
  isPrintableQueryKey excludes declared action keys
```

```ts
// examples/counter/core/src/actionMenuKeys.ts
// Action keys fire while Closed and while Open.
// Other printable keys filter the Open catalog.
```

Options:

- **A.** While Open, printable keys only filter. Product keys (`r`, `+`) wait until Closed. Enter sends the focused row.
- **B.** Keep current: declared Action keys always send, even while Open. Query cannot use those letters.
- **C.** While Open, `r` both filters and would send — pick with a modifier.
- **D.** Floating combo box. Focus decides. Filter focused: type filters, Escape dismisses. List focused: Action keys send, j/k move, Escape focuses Filter.

What I think: **D** (they said this). A and B ignore focus. C is a modifier hack.

---

## Q92 — Re-audit Foldkit navigation: `onUrlChange` / `onUrlRequest` too specific, avoid URI ↔ state loops?

- **Status:** `open`
- **Question:** Foldkit nav should be more generic. Click is not the only thing that changes URI. Printing state into the URI must not loop with parsing the URI back into state.

10-foot:

```text
TODAY  makeApplication routing: { onUrlRequest, onUrlChange }
WANTED  one loop:
  Model.nav --print--> carrier URI
  carrier URI --parse--> Message (OpenedNavigation / Path)
  same URI ⇒ no write
  click | back | deep link | cmd-K | Expo file | TanStack  are adapters
```

Options:

- **A.** Re-audit as a later Q-batch after Counter sync (Q86). Law: parser-printer + “same URI ⇒ no write.” Adapters map framework events to Messages.
- **B.** Rewrite `onUrlChange` / `onUrlRequest` this week on Counter.
- **C.** Leave the current two callbacks as the API.

What I think: **A.** They asked for a re-audit, not a rewrite in this dump. Counter has one path. Loops matter more when there are many routes.

Trade-off: B would freeze the wrong seam (Q08). C leaves the names they already dislike.

---

## Q93 — Expo adapter for Counter this slice? File-router codegen?

- **Status:** `open`
- **Question:** They were not sure they want Expo on Counter. Expo Router wants files per route. That would be generated from the Program's route table, then an adapter maps Messages to Expo.

10-foot:

```text
CORE     Path /counter   (one file worth of route)
ADAPTER  expo-router generated app/counter.tsx  OR  a single App.tsx
```

Options:

- **A.** No Expo this slice. Counter proof is CLI + Foldkit HTML + React `useModel`/`useActions`.
- **B.** Expo yes, single screen, no codegen (one route).
- **C.** Expo yes, and build file-router codegen now.

What I think: **A.** “Not sure” + Q102. Codegen is for many routes (Q89 B). One `/counter` does not need a generated tree.

Trade-off: no mobile file-router proof this week. Existing `examples/counter/expo` can stay a painter if it already is, without expanding it.

---

## Q94 — Nav adapters: language × framework × that framework's router?

- **Status:** `open`
- **Question:** Core TypeScript Program holds navigation. React may use React Router **or** TanStack. Plain HTML has no extra library. Expo has file-router. Adapters may be layered.

10-foot:

```text
Program (TS)  --nav Messages / parser-printer--
    ├─ HTML history adapter
    ├─ React + React Router adapter
    ├─ React + TanStack adapter
    └─ Expo file-router adapter (generated files)
```

Options:

- **A.** Yes, that is the combinatorics. Core does not import those libraries. One adapter per (framework, router). Version adapters against the platform version (note; DevOps).
- **B.** Pick one React router and one native router forever.
- **C.** Hosts own navigation (rejected in Q00).

What I think: **A** as the law. **Do not implement the matrix this week.** Counter needs one HTML/React painter.

Trade-off: A is why nav belongs in the Program. Building every cell now is the last four days.

---

## Q95 — Language-agnostic architecture: TS gospel, Swift/Rust ports, or Rust subsumes everything?

- **Status:** `open`
- **Question:** Represent the same pillars in TS, Swift, and Rust. They wonder if Rust (macros, Instant port, already on Android/iOS) should be the one compiler. Still prototyping. Not explored deeply.

10-foot:

```text
NOW     TS examples/counter is gospel
PORTS   counter-swift paints the same screen / Instant V01
        rust foldkit-nav / UniFFI  (prototype)
LATER?  rustc → iOS/Android/WASM as the one Program
```

Options:

- **A.** TS Counter is gospel. Swift and Rust are ports that must match V01. Rust-subsumes is an exploration, not this week's pick.
- **B.** Stop TS; Rust is the Program; TS is a host.
- **C.** Three independent Programs that happen to count.

What I think: **A.** Dictation: still prototyping, curious, not ready. B is Q96's dependency mountain.

Trade-off: A means UniFFI is not the iOS product (counter-swift already is). Matches earlier Q40/Q22.

---

## Q96 — If Rust compiles to every target, how do we organize side-effect dependencies (permissions, etc.)?

- **Status:** `open`
- **Question:** Every effect needs a platform dependency. Permissions on iOS vs Android through Rust, for every target. Lofty. Explore, do not pick a framework this week.

10-foot:

```text
Program Command  --Port-->  iOS permission adapter
                            Android permission adapter
                            test fake
Rust core cannot import UIKit and still be the one crate without Layers/Ports
```

Options:

- **A.** Note only. Ports/Layers (Foldkit dependencies skill, TCA `DependencyValues`) when a real effect exists. Not this week.
- **B.** Design a full Rust permission matrix now.
- **C.** Side effects stay in Swift/Kotlin; Rust is Model-only.

What I think: **A.** Explore at the point of need. Counter's side effects are Instant I/O, already a Port.

Trade-off: C is the UniFFI split they already have. Fine until a Command needs the camera.

---

## Q97 — Tracing / OTEL / slow-update warnings across Program, adapters, and paint?

- **Status:** `open`
- **Question:** Effect has OpenTelemetry. Foldkit has slow-update warnings and self-observation. They want that baked in and adapted through the view-agnostic layer. Dev-only for the human menu (Q98); traces may still exist in prod as telemetry.

10-foot:

```text
update duration  →  slow-update warning
Message in/out   →  trace across Instant / FFI / paint
Dev menu         →  development only (Q98)
```

Options:

- **A.** Keep Foldkit's existing slow-update + devtools. Require traces on Instant write/read as the next slice. Do not build a new observability product this week.
- **B.** Mandate OTEL on every host including paint before sync work.
- **C.** No tracing until production scale.

What I think: **A.** Sync robustness (Q86) first. Tracing that already exists stays. New OTEL is not the gospel.

Trade-off: B delays the thing they said is falling out of sync.

---

## Q98 — Client consumption: `useModel` + `useActions` + development-only debug?

- **Status:** `open`
- **Question:** React expert: those two hooks, plus maybe a debug hook. Dev menu (traces, logs, Messages) exists in Foldkit already. Must **not** ship in non-development. Same idea on every surface's adapter. Version adapters against platform versions (note).

10-foot:

```text
production window   useModel(Path())  useActions(Path())
development only    Dev menu / debug hook
never               second destination state in the view
```

Options:

- **A.** Yes. That's the React adapter law. Other surfaces get the same two verbs (`model`, `actions`) plus a dev-only third. Strip devtools from production builds.
- **B.** Always include the debug menu.
- **C.** Views may also hold URI / selectedId (rejected Q02).

What I think: **A.** Matches `@foldkit/react` today.

Trade-off: production must actually tree-shake the menu. That is a test, not a new API.

---

## Q99 — Canonical PISS: nested entity ADTs, URI observes a subset, maps to the view?

- **Status:** `open`
- **Question:** Document in brainstorming (`ideas/domain-as-tree-pis`): book, chapter, media, transcription, cart, money — nested ADTs. URI says which entities it observes and how they map to the view. Counter has none of this. Open exploration: who updates the snapshot of those entities; maybe the sync schema.

10-foot:

```text
COUNTER NOW     Model = { count }     Path = /counter
PISS LATER      entities: Book / Media / ...
                URI observes a slice
                view maps that slice
```

Options:

- **A.** Track as exploration in `intentions.md`. Do not add entity schemas to Counter.
- **B.** Start a parallel PISS Counter with entities this week.
- **C.** Instant schema _is_ the PISS; Program Model goes away.

What I think: **A.** They said Counter doesn't have it and they're happy to explore later. C is Instant-as-Model, which they rejected.

Trade-off: the “where is this observed / what else changes” glance is valuable and missing. Q89's observe/send table is the small version of this.

---

## Q100 — Instant EAV triples / a message queue closer to Instant's store?

- **Status:** `open`
- **Question:** Instant models EAV / AEV / AVE indexes. They self-host. Maybe expose more of that primitive: a Message queue closer to the metal instead of only syncing entities. LLMs have not written fast code here. Do not hold breath. Any attempt needs a harness (Q101).

10-foot:

```text
TODAY     Instant entities: count row + message rows  (or proposals)
MAYBE     append-only queue in Instant's store
NOT YET   custom EAV runtime written by an LLM
```

Options:

- **A.** Stay on Instant entities as they exist. Message log is the queue. Revisit EAV when a harness proves a need.
- **B.** Prototype an Instant-backed Message queue this week.
- **C.** Replace Instant with a custom triple store.

What I think: **A.** They said they have not had luck with LLM performance code. The Message log **is** already a queue. C is a new database.

Trade-off: A does not magically fix catch-up (Q86). It keeps the transport they already run.

---

## Q101 — Performance: local update instant, sync in milliseconds, harness for LLM hot paths?

- **Status:** `open`
- **Question:** Not worried about performance **up front**, except: local `update` is instantaneous; sync is milliseconds not seconds; no complicated machinery in the way; still robust. Any time we want “fast” code from an LLM, specify it and put a **harness** around it. Climbing tall buildings.

10-foot:

```text
LAW     send → update  =  sync, in-process, no await Instant
GOAL    peer visible on other device  ~ milliseconds
HARNESS before anyone writes a custom queue / CRDT / rustc rewrite
```

Options:

- **A.** Accept as constraints on Q86, not a separate rewrite. Add a catch-up / multi-device harness before changing the wire.
- **B.** Optimize Instant I/O first (custom EAV, Q100 B).
- **C.** Ignore timing until users complain.

What I think: **A.** The falling-out-of-sync bug is correctness first. A harness that two Processors agree after partition is the next artifact, not a faster JSON encoder.

Trade-off: “milliseconds” is a goal, not a SLA this week. The harness makes it measurable.

---

## Q102 — Explore at the point of need; do not let the LLM abstract ahead?

- **Status:** `decided`
- **Asked:** 2026-08-26 (dictation)
- **Answered:** 2026-08-26
- **Question:** They've been lazy letting the model “perfect” architecture. It created and modified things. They want the tool to iterate on ideas, not invent a fourth router or a Counters matrix before Counter sync works.

Options:

- **A.** Hard rule: no new abstraction until a decided Q names it. Multiple Counters, Expo codegen, Rust-subsumes, PISS entities wait.
- **B.** Keep generating ports “so we have them.”
- **C.** Freeze all code; docs only forever.

**Answer:** **A.** This interview exists because B happened. C is not the goal — Q86 still has to become a plan.

**Amended 2026-08-26:** A still means no unused types. It does **not** mean refuse a Focus ADT because it takes longer. “This week” is not a shortcut license. See this folder’s `AGENTS.md`.

Trade-off: many already-written Qs stay `deferred`. That is intended. Deferrals that exist only to save time are now suspect.

---

## Q103 — What must the Q86-A algorithm survive to count as robust?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26
- **Answer:** **A, amended.** The six cases are in. Additions from this answer:
  1. **Increment is the minimum.** Counter stays the basis. Richer Messages later; they must still fold through the same `update` + log. Do not invent a second algorithm for “complex.”
  2. **Observed failure is startup drift**, not only a long-running partition. Two apps (Foldkit GUI, counter-swift / “2E”) disagree **immediately** after launch until Reset or close/reopen. That is case 7. Treat it as the bug you already have.
  3. **Harness, not a one-shot test.** Instant connectivity is a **dependency knob** (Effect Layer / TCA `DependencyValues` / Instant’s own `isOnline`). Flip it in tests. Run **many times** (a dozen-class loop) so confidence is at assembly, not a lucky green.
  4. How the knob is injected is **Q105**.
- **Question:** Q86 locked snapshot-as-cache + Message log as law. Which failures are in the contract — so “robust” is a harness, not a hope?

10-foot:

```text
LAW (Q86 A)
  local update is immediate
  peer Messages fold through the same update
  boot = snapshot cache, then log after snapshot.at
  two devices, after sync, same Model

TODAY'S DRIFT (not robust)
  last-writer count wins → 3 and 5 become 5
  iPad from-id still "ios" → peer taps dropped as echo
  snapshot treated as the integer itself
```

Named cases (plain, not academic):

```text
1. Two devices increment while apart, then meet.
   Both increments stay. Count is the fold, not the latest snapshot.
2. Duplicate Instant delivery of the same Message id.
   Fold once. Second copy is a no-op.
3. Own echo vs a peer.
   Distinct Processor ids. Do not drop the peer as "I already did that."
4. Snapshot is behind the log (stale cache).
   Log after at still folds. Snapshot never silently replaces a longer log.
5. Device off, then on.
   Missed Messages appear; representation matches the peer that stayed up.
6. Reset vs increment (order).
   Log order is the law until Q88 says otherwise.
```

Options:

- **A.** Those six cases **are** robustness. Write them as a harness (two Processors, partition, heal) **before** changing the wire. Extra cases append here; they do not change Q86.
- **B.** Robust means a published CRDT / formal proof first, then code. The six cases wait.
- **C.** Robust means “keep A and try harder” with no named cases. Ship and watch.

What I think: **A.** You already said LLMs do not write this without a harness (Q101). The six cases are the harness. B delays the bug you already see. C is the last four days.

Trade-off: A does not yet pick Reset-vs-increment _policy_ (Q88) or Processor-id catalog (Q13). It only says those situations must have a defined, tested outcome. Snapshot remains a cache, never the winner of a conflict.

---

## Q104 — May the Program also describe layout (atomic tree + viewports), separate from the layout engine?

- **Status:** `decided` (continue both; not this week's gate)
- **Asked:** 2026-08-26 (follow-up: “we’ll come back to Q103”)
- **Answered:** 2026-08-26
- **Question:** Besides business logic and navigation, can the core Program describe **layout** in a language- and framework-agnostic atomic vocabulary (atoms, molecules, organisms, templates, screens), including variants for different viewports, while a separate **layout engine** on the target framework actually draws? React `paintScreen` already does the engine half.

10-foot:

```text
Program (core)
  productView / counterScreen  →  UiNode
  atoms: Text, Button, Column, Row
  viewport: wrapDevice(phone | …)   optional context
        │
        │  description only — no React, no SwiftUI, no CSS
        v
Layout engine (adapter)
  Expo/React  paintScreen.tsx   UiNode → View / Pressable / Text
  CLI/ASCII   renderScreen
  TUI         paintTui
```

```ts
// CORE: examples/counter/core/src/product.ts
export const productView = (model: Model): UiNode =>
  Column({}, Text(model.count.toString()), Row({}, ...buttons))

// ENGINE: examples/counter/expo/src/paintScreen.tsx
export const paintScreen = (node: UiNode, sendToken: (token: string) => void)
  : ReactNode => /* exhaustive match on Text | Button | Column | Row */
```

Neighboring: ADR 0008 already accepted this as a baseline for Foldkit UI. `Program.screen` is the description. Painters are the engine. Host-authored JSX (Instant `App.tsx`) is the other option still in the tree. They want **both** going forward — exploration, not a forced delete this week.

**Answer:** **Continue both.** Keep the host-neutral atomic tree + painters (`Program.screen` / `paintScreen` / ADR 0008). Also keep exploring hosts that paint without that tree. Do not make this the sync gate. Q103 stays the current question.

Trade-off: two layout stories until a later Q picks. That is explicit. Viewport variants stay `context.device` until we need more (Q102).

---

## Q105 — How do we flip Instant online / offline in the robustness harness?

- **Status:** `decided`
- **Asked:** 2026-08-26
- **Answered:** 2026-08-26
- **Answer:** **A.** One Instant connectivity Port. Words are **online** and **offline**, not connected/disconnected. Tests inject the Port: Effect `Layer` on Foldkit, `DependencyValues` on Swift. Instant’s own `isOnline` is that Port if it fits. Harness = two Processors + boot + offline/online + **N runs** (dozen-class). Local `update` still works while **offline**.
- **Question:** Tests must simulate Instant **offline** without killing the process or unplugging Wi‑Fi. Same Port on TypeScript (Effect Layer) and Swift (TCA / Point-Free Dependencies). Instant already has `isOnline` / `connectionStatus` in processor tests. Counter already swaps `InstantEngine` with `Layer.succeed(..., memorySyncedEngine)`. How do we wire the knob, and how many runs count as confidence?

10-foot:

```text
TEST
  two Processors (cli + react, or two memory engines)
  knob: Instant online | offline
  local update still works while offline
  flip to online → catch-up (Q86 A)
  assert same Model
  repeat N times   ← assembly confidence, not one green

TODAY
  Effect: MemoryLive = Layer.succeed(InstantEngine, memory…)
  Instant tests: Ref.isOnline + SubscriptionRef.connectionStatus
  Swift: TCA DependencyValues  (not yet a Counter Instant-offline dep)
```

```ts
// packages/instant/.../v3SharedProgramProcessor.test.ts
const isOnline = yield * Ref.make(false)
const connectionStatus = yield * SubscriptionRef.make(...'Closed')
// later: Ref.set(isOnline, true)

// examples/counter/core/src/startSynced.ts
export const MemoryLive = processor =>
  Layer.succeed(InstantEngine, memorySyncedEngine(processor))
```

Neighboring: the bug you see is **startup**: two GUIs open, counts disagree until Reset or quit/relaunch. The harness must cover boot, not only mid-session partition. Increment is the first Message; Reset is case 6 / Q88.

Options:

- **A.** One **Instant connectivity Port**. Tests inject it: Effect `Layer` on Foldkit, `DependencyValues` on Swift. Use Instant’s own **online / offline** if it is that Port. Harness = two Processors + boot + offline/online + **N runs** (dozen-class, fail if any run disagrees). (What I think.)
- **B.** Only Instant’s built-in offline. No Effect/TCA wrapper. TS and Swift tests each poke Instant differently.
- **C.** No in-process knob. Manual: open two apps, toggle airplane mode, look at the GUI. N runs by hand.

What I think: **A.** You named TCA/Effect dependencies and Instant’s knob in the same breath — that is one Port, two adapters. C is how we have no confidence today. B will drift the two languages.

Trade-off: A is a test seam, not a new sync algorithm. N runs will be slower; that is the point of assembly-level confidence. Memory Instant vs live Instant: start Memory so N is cheap; one live Instant nightly if you want, later.

---

## Q106 — How do we form `message.from` when one surface has many instances?

- **Status:** `decided`
- **Answered:** 2026-08-26
- **Answer:** **A, conditional.** `from = ${host}-${instance}`. Use Instant `localId` **only if it is stable across installs**. Otherwise mint. Catalog prefix stays. Stability meaning is **Q107** — Instant’s own docs promise refresh, not reinstall.
- **Asked:** 2026-08-26 (Q13 amendment: globally unique ids; Instant `localId` under investigation)
- **Question:** A catalog name (`react`, `counter-swift-ios`) is shared by every instance of that surface. Echo-skip needs **this running instance**. Instant may already expose `localId`. Foldkit already has `engineProcessorId({ processor, instance })` so two tabs on one Host do not collide — if `instance` is actually passed. How should `from` be built?

10-foot:

```text
ECHO SKIP     if message.from == my from  →  ignore (I wrote that)
COLLISION     two React tabs both from="react"  →  each drops the other

CANDIDATES
  from = localId                         globally unique, loses surface name
  from = react-<localId>                 catalog + instance
  from = react-<uuid we persist>         we mint; Instant not involved
  from = react                           REJECTED as the whole id (Q13 amend)
```

```ts
// packages/instant/src/sync/fromTransport.ts  (already in tree)
// Two Processors on the same Host, e.g. two browser tabs,
// need distinct `from` strings. `instance` disambiguates them.
export const engineProcessorId = (options: InstantOptions): string => {
  const host = Processor.Host.print(options.processor)
  if (options.instance === undefined || options.instance === '') {
    return host
  }
  return `${host}-${options.instance}`
}
```

Neighboring: harness (Q105) is two Processors, possibly the **same** surface twice. They must not share `from`. Subagent is checking whether Instant `localId` is per-tab, per-install, public, and stable across reload.

Options:

- **A.** `from = ${host}-${instance}` where `host` is the catalog (cli, react, counter-swift-ios, …) and `instance` is Instant `localId` if it is unique per running client; otherwise a UUID we mint. (What I think, pending localId facts.)
- **B.** `from = Instant localId` only. No catalog prefix.
- **C.** We always mint and persist our own UUID. Do not use Instant `localId`.
- **D.** Wait for the localId investigation before picking A/B/C.

What I think: **A**, unless localId is not unique per instance (then mint). Keep the catalog prefix so logs still say which surface wrote. **B** makes `from` opaque. **D** is allowed; say D if you want to wait.

Trade-off: if `localId` changes every boot, the log’s `from` churns (harmless for echo-skip, noisy for debugging). If `localId` is shared by two tabs, we must not use it as `instance`.

---

## Q107 — Instant `localId` survives refresh, not reinstall. Which stability does `from` need?

- **Status:** `decided`
- **Answered:** 2026-08-26
- **Answer:** **A.** `from` is unique **per run / per window**. Reinstall may mint a new `from` (fine). Instant `localId` is **not** `from` (shared across tabs; wiped on uninstall). **Mandate at the Program/runtime, all three languages** (TS, Swift, Rust): a host may not boot with a bare surface token (`cli`, `counter-swift-ios`). That bare token is the off-by-one / off-by-N they keep seeing. Browser `react-${uuid8}` per page load is acceptable. Hydration must **not** use `from` to skip history; it uses Message **id** + snapshot **watermark** so a new `from` after reload does not double-fold. Watermark is **Q108**.
- **Asked:** 2026-08-26 (Q106: “A as long as localId is stable across installs”)
- **Question:** Investigation landed. Instant `getLocalId(name)` is a UUID in the **device+app store** (IndexedDB `instant_${appId}_…` / RN AsyncStorage / Swift sqlite `instant_local_ids`). Docs and Reactor: same after **refresh**; **changes if local storage is deleted**. Two tabs **share** it. `'session'` is only another KV slot — still survives refresh, still shared. It is **not** unique per running instance and **not** stable across uninstall. Foldkit Counter already mints `react-${uuid8}` per JS load for `instance`. CLI/TUI/Swift often use a bare host token and **do** collide. Q106 said use localId only if stable across installs — **that condition fails**. What does `from` actually need?

10-foot:

```text
INVESTIGATION (Reactor.getLocalId)
  unique to this device + Instant app store
  two tabs, same origin, same appId  →  SAME id  (shared IndexedDB)
  reload                             →  SAME id
  uninstall / wipe store             →  NEW uuid
  Node admin Instant()               →  no getLocalId API

FOLDKIT COUNTER TODAY
  react/foldkit/svelte:  host + random uuid8 per load   (tabs do not collide)
  cli / tui:             bare "cli" / "tui"             (processes collide)
  counter-swift:         surface token; two windows share it

ECHO SKIP needs unique per RUNNING instance
LOCALID is a DEVICE identity (Scribe InstantClientID), not Processor from
```

Options:

- **A.** Refresh/restart of **this install** is enough. Reinstall may mint a new `instance` (old `from` is a dead peer). Two concurrent instances still need distinct ids (tab/process suffix, not one shared `guest` localId). (What I think for echo-skip.)
- **B.** Must survive uninstall + reinstall (Keychain / iCloud / something outside the app container). Then still add a per-window suffix so two tabs do not share `from`.
- **C.** In-memory UUID per process only. New `from` every launch. Echo-skip works. Log is noisier. Instant `localId` unused for `from`.

What I think: **A** for `message.from`. Echo-skip is “this running Processor,” not “this phone for life.” **B** is a real product if guest identity must survive reinstall — that is not the same field as `from`. Do not use a single shared `getLocalId('guest')` as `instance` when two tabs can open.

Trade-off: A fails your literal “across installs” if that meant uninstall. Say **B** if you need the same Processor id after deleting the app. C is the simplest harness (two Memory engines, two UUIDs) and can be the test double even if production uses A.

---

## Q108 — On boot, what is the watermark so we do not double-fold?

- **Status:** `asking` (quorum 2 filed **E** / `included`; archive is Q109; chat is Q02)
- **Asked:** 2026-08-26
- **Human (2026-08-26):** Not the person to pick watermark mechanics. Teach, then recommend something ideal. **Whole-log refold is not a good idea.** Want great performance and common sense. Old quorum (`01a03ed1…`) picked D; that is rejected as the product path. Later: “I don’t know what included means.” Also: persist / flatten the log on a daily or weekly cadence so it does not grow forever; after compact we can delete old Instant message rows.
- **Question:** After a reload, this run has a new author id (`from`). Old rows still say the previous `from`, so we cannot skip them as “I already did that.” The snapshot is a cached `count` plus a time (`at`). Today some hosts fold every Message whose clock is `>= at`. That can apply the Message that _made_ the snapshot a second time (count +1 extra). Two apps already disagree at launch. What is the boot law, same in TypeScript, Swift, and Rust?

10-foot:

```text
BOOT
  read snapshot { value, at, asOf }
  model.count = value
  fold Messages after the watermark through update
  skip Message.id already applied
  do NOT skip by from   (from is this run only)

TODAY
  messagesSinceSnapshot:  createdAtMs >= snapshot.at   ← includes the snapshot's own write?
  shouldApplyRemote:      from == me → skip             ← fails after new uuid8
                          appliedIds.has(id) → skip
                          createdAtMs < at → skip
```

```ts
// packages/instant/src/snapshotLog/snapshotLog.ts
message => message.createdAtMs >= snapshot.at

if (message.from === processorId) return false
if (appliedIds.has(message.id)) return false
if (message.createdAtMs < snapshot.at) return false
```

Already decided, spelled out:

- Q86: snapshot is a cache. The Message log is the law. After sync, representations match.
- Q107: `from` is unique per run / window. It is live echo-skip only. Boot must not skip history by `from`. Skip by Message **id**.

Neighboring: a write stores `snapshot.at =` that Message’s clock. Folding `createdAtMs >= at` then applies that same Message again. Count goes +1 extra. Off-by-N is that bug plus two CLIs or Swift windows sharing the same `from` (already rejected in Q107).

Options:

- **A.** Cut the log by clock: fold Messages whose time is **after** the snapshot time (`createdAtMs > at`). Always skip by Message **id**. `from` is live echo this run only. Same in TypeScript, Swift, Rust.
- **B.** Keep today’s `>= at` cut. Hide the snapshot’s own Message from the log, or add 1 millisecond to `at` so equality cannot collide.
- **C.** Remember the last applied Message **id**. Replay only Messages after that id. Clock time is for display.
- **D.** This week: do not start from the cached count. Fold the **whole log** from 0, skip by Message **id**. Write `asOf` as that Message’s **id** (today some writers put the processor name there). Clock time sorts the log; it does not decide who is in. `from` is live echo only. Same in TypeScript, Swift, Rust. **Rejected as the product path** (human, 2026-08-26). Debug/harness only.
- **E.** Proven prefix cache. Store `included` (Message ids already inside `value`). Boot from `value`, skip those ids, `update` only unknowns. Blank row, missing `included`, or `asOf` that is not a Message id: fold from 0 **once**, then write E. Clock sorts. Clock is not membership. Same in TypeScript, Swift, and Rust.

What I think: **E** (`included`). Quorum 2. Human has not accepted yet. Chat is **Q110**. Briefs: [proposer](overviews/q108-proposer.md), [debater](overviews/q108-debater.md), [resolver](overviews/q108-resolver.md).

**`included` in plain words**

`included` is the list of Message **names** (ids) that were already applied to produce the cached count. Not a clock. Not “cli”.

```text
You tapped + three times. Those taps are named M1, M2, M3.
The cache says count = 3.
included = M1, M2, M3

Boot:
  start at 3
  see M1, M2, M3 → already in included → skip
  see M4 from the other phone → not in included → update → 4
  write included = M1, M2, M3, M4

If included is missing (today’s asOf: "cli"):
  we do not know which taps are inside the 3
  fold from 0 once, then write included
  later we can archive old rows to a file and delete them (Q109)
```

Trade-off: a few extra bytes on the `count` row this week (Q45 can slim). Give up fencepost `>=` vs `>`. Give up whole-log GUI boot. Give up `foldedCount` as a fake stream revision.

### Quorum 2 recommendation

**Pick: E.** Proof is `included` (the set of Message ids already inside `value`). Not `foldedCount`. Not both. Status stays `asking`.

**Teach**

A fold is: take the count, run `update` with one Message, get the next count. Increment adds 1. Order matters (Q88).

A snapshot is a saved copy of the count so we do not re-run `update` on every old Message. Q86: cache, not law.

A watermark names which Messages are already inside that cache. It is not a clock time.

Clock fails because Instant last-writer `count` is one integer. Two phones increment apart. Both Message rows live. One integer remains. The winner's millisecond is not "every earlier Message is inside this number." Gospel `snapshotBoundary` hides a same-ms peer. `messagesSinceSnapshot` (`createdAtMs >= snapshot.at`) applies the snapshot's own write again.

Whole-log fold (old D) is correct and slow. Every launch would `update` once per historical Increment. FoldkitCounterV01 is already on the order of ~2k rows (Q45). That is debug and harness only. Not the GUI path.

**The law**

```text
WRITE  (one Instant transact)
  message  { id, tag, from, createdAtMs }
  snapshot { value, asOf: message.id, included: ids already in value, at }
  value is the fold of included. Not last-seen integer plus one.

BOOT   (TS / Swift / Rust, same function)
  if blank OR asOf is not a Message id OR included missing:
      model = init; fold all; skip by id; write E          // once
  else:
      model = snapshot.value
      for m in log ordered (createdAtMs, from, seq, id):
        if m.id in included: continue                     // cheap
        model = update(model, m)                          // new or missed
        included.add(m.id)
      compact: write the included you now hold

LIVE
  from == thisRun  → remember id, do not apply            // echo
  id in included   → skip
  else apply

DEBUG / HARNESS only
  model = init; fold all; skip by id                      // never the GUI path
```

`at` is sort and display only. Do not store EventStore revision, Kafka offset, Electric LSN, or a Replicache cookie. Instant does not give those this week. `foldedCount` is that revision in costume.

**What both briefs agreed on**

- E, not A/B/C. D is debug and harness only.
- One law in TypeScript, Swift, and Rust. Increment is the minimum case.
- `from` never hydrates (Q107). Skip by Message id.
- Snapshot is a cache (Q86). Fold in log order (Q88).
- Bare `asOf` with no proof is C: the earlier concurrent Increment still drops.
- Writer persists the fold it actually ran.
- Instant leftovers #240–#245 stay Open/Blocked. Do not push pointfreeco.
- Refuse CRDT, vector clocks, 1 ms bump, `serverCreatedAt` as membership, seeding `applied` with `cli` / `tui`.

**What they disagreed on, and why `included`**

Proposer: store `included`. Boot from `value`. Skip those ids. The concurrent loser is not in the set, so it folds. Cheap even when Instant LWW left a hole.

Debater: store `foldedCount`. Proven only if `asOf` is a Message id and `prefix.length == foldedCount`. Else fold from 0 once, then compact. Bare `asOf` is C.

`foldedCount` can only say "this is a contiguous prefix" or "it is not." The startup bug (3 and 5, LWW) is the not case. Then you pay whole-log fold, which is already rejected as the product path. Instant has no stream revision. Do not invent one.

`included` names the members. Boot fills holes. After boot, compact so the next launch skips what you just folded. Missing `included` fails closed the way the debater wanted: one fold from 0, then write E.

**Tests** (reload mints a new `from`; must not pass by echo-skip)

```text
1. RELOAD
   snapshot { value: 1, asOf: M1, included: {M1}, at: 1000 }
   m1 Increment id=M1 from=OLD createdAtMs=1000
   BOOT from=NEW
   expect 1, not 2

2. THEN m2 Increment id=M2 from=PEER createdAtMs=2000
   expect 2. N reloads still 2. Both Processors reload, same 2.

3. CONCURRENT LWW
   mA at=1000, mB at=999
   snapshot { value: 1, asOf: A, included: {A}, at: 1000 }
   BOOT expect 2                         // mB not in included

4. SAME MILLISECOND
   mA and mB both at=1000
   snapshot { value: 1, asOf: A, included: {A} }
   BOOT expect 2                         // do not cover the whole ms

5. 3 AND 5
   apart: A folds to 3, B folds to 5, both persist Messages
   Instant LWW count is 5 (or 3)
   heal + BOOT expect 8, not 5
   after compact, next BOOT still 8

6. LIVE inject m1 again → still 2
```

Tests that encode "`>=` returns the snapshot's own row" or "same millisecond is covered" are the bug, not the spec.

Quorum 1 recommendation (2026-08-26, rejected as the product path):

**Pick: D.** A is already shipped as gospel boot (`snapshotBoundary` in `packages/foldkit/src/runtime/start.ts`, Swift `snapshotLogHydration`, Rust `fold_after` / `created_at_ms <= snapshot_at`) and the observed bug is startup drift, so a fencepost `>=` vs `>` cannot be the fix. Instant last-writer `count` is not an EventStore checkpoint. The producing Message is named by **id** (`asOf`), never by wall clock; this week the cache is not a prefix, so boot folds the log from init.

**The law**

```text
WRITE  (one Instant transact; already atomic)
  message { id, tag, from, createdAtMs [, seq] }
  count   { value, asOf: message.id, at: createdAtMs }
  // today gospel fillWriteTime sets asOf: processor — must change
  // snapshotLog commitSnapshotLog already sets asOf: message.id

BOOT / CATCH-UP / LOG-REFOLD   (one function, all three languages)
  sort by (createdAtMs, from, seq if present, id)
  model    = init (0)          // not snapshot.value this week
  applied  = {}
  for m in log:
    if m.id in applied: continue
    model = update(model, m)
    applied.add(m.id)
  from is not consulted
  at is not a cut
  empty / blank snapshot = this same loop (already true on Runtime.start)

LIVE
  from == thisRun  → remember id, do not apply     (echo, this run only)
  id already applied → skip
  row out of order vs lastApplied
    → rerun BOOT on the known log (from init, not from snapshot.at)
  else apply, remember id

NOT
  createdAtMs > snapshot.at as membership
  snapshotBoundary max-tuple covering the whole millisecond
  messagesSinceSnapshot >= at
  skip-by-from at boot / hydration
  seed appliedIds with asOf unless asOf is a Message id in the log
  Rust seed watermark = max(createdAtMs) and replay nothing
```

**What this gives up**

- Boot is O(n) on the whole log until a later compaction Q names a real prefix. Counter-scale; Instant LWW makes that the honest path. Q86 A stays: snapshot is still **written** (cache). Q86 B (no snapshot) is not this pick.
- Last-writer `count` remains one integer. It is not a global prefix. Q103 case 1 (3 and 5 → 5) is this write. D stops treating that integer as “everything at or before `at` is inside `value`.”
- Same-ms: every Message still folds (no casualty). Order is the tuple above. Instant `message` rows have no `seq` (`InstantLogMessageRecord`); do not mandate `seq` on the wire this week. Same-actor same-ms may UUID-sort after reload.
- Clock skew: Messages are **not dropped**. They still sort by client `Date.now()` (Q88 residual: a late clock can sit “before” a Reset a human saw first).
- `subscribeQuery` can still emit a partial first payload. Next emission refolds from init and converges; first paint may be short.
- Legacy rows with `asOf: processor` fail closed: fold from init (correct). Until writers change, dashboard `asOf` stays a surface token.
- Instant has no “read after id.” D does not need one: gospel already reads `{ count: {}, message: {} }` and filters in process.

**What both briefs agreed on**

- `from` never hydrates. It is per-run UUID live echo-skip only (Q107 A).
- Always skip by Message **id** (Q103 case 2).
- One law in TypeScript, Swift, and Rust.
- No CRDT / OT / vector clocks this week. Increment is the minimum Message.
- Snapshot+Message stay one transact. Empty / blank snapshot = fold the whole log from init.
- Instant leftovers #240–#245 stay Open/Blocked. Do not push pointfreeco. Do not force hobby primaries onto main.
- Refuse Q108 B (1 ms bump). Refuse Instant `serverCreatedAt` as watermark.

**What they disagreed on**

- Proposer: `snapshot.at` is a legal Greg Young rolling snapshot; inclusive `>=` is the named off-by-one; strict `>` plus skip-by-id is the law. Split `shouldFoldAtBoot` (time+id, no `from`) from `shouldApplyLive` (`from` or id, no `at`). Do not seed `appliedIds` with `asOf` until dialects agree.
- Debater: A is already `snapshotBoundary`. Drift at launch is a bug **in that law**. Instant concurrent `.update` on the one `count` row clobbers; two Messages persist, one integer remains. Time cut means “every Message with `createdAtMs <= at` is already inside `value`.” Instant does not give that. SOTA checkpoints are commit position / offset / LSN / cookie — not client `Date.now()`. `seq` is a local lie (dropped on Instant). LogRefold from the snapshot boundary cannot save a row that sorts at or before `at`.
- Resolver: that is the real fork — is `snapshot.at` a legal checkpoint given Instant LWW on `count`, or must the checkpoint be a Message **id**, with time only as sort? Pick the second. C (fold rows _after_ the asOf tuple, using `value` as base) still fails Q103.1 when B’s Increment at 999 sits before A’s winning snapshot at 1000: truth is 2, C shows 1. D does not use `value` as a prefix this week.

Verified seams (not chat recap):

- `fillWriteTime` `asOf: processor`; `snapshotBoundary(at)` maxes `from`/`seq`/`id` so the whole millisecond is “already folded” (`packages/foldkit/src/runtime/start.ts`).
- `messagesSinceSnapshot` is `createdAtMs >= snapshot.at`; `commitSnapshotLog` `asOf: id`; `shouldApplyRemoteLogMessage` skip-by-from (`packages/instant/src/snapshotLog/snapshotLog.ts`).
- Swift copies `snapshotBoundary` and tests “same millisecond is covered” (`/Users/laptop/Sync/tca/dea/Sources/InstantTape/SnapshotLog.swift`).
- Rust `should_apply_remote` skips `created_at_ms <= snapshot_at` **and** `from == processor_id`; pull-before-bootstrap seeds watermark to max `createdAtMs` and replays nothing (`tca-rust-port` `counter-core` / `sync_log.rs`).
- Memory `isStaleSnapshot` refuses an older snapshot; Instant core `countEntity.update` does not.

**Tiny harness** (pass after D). Reload uses a **new** `from`. Must not fake-pass via echo-skip. Cases 1–2 fail today on `messagesSinceSnapshot >=` (double-fold) and **pass** on gospel `snapshotBoundary` — that is why A looks like a reload fix. Cases 3–4 fail today on gospel `Runtime.start` / Swift hydration / Rust `fold_after` (startup drift). All five must pass after D.

```text
1. RELOAD (no echo-skip fake pass)
   snapshot { value: 1, at: 1000, asOf: "cli" }     // processor token, not M1
   m1 Increment id=M1 from=OLD createdAtMs=1000
   BOOT from=NEW
   expect 1, not 2
   (folding m1 onto value=1 is the double-fold; skipping because
    from==NEW cannot exclude m1 — from is OLD)

2. THEN m2 Increment id=M2 from=PEER createdAtMs=2000
   expect 2. N reloads still 2, not 2N. Two Processors both reload, same 2.

3. CONCURRENT LWW  (Q103.1 / startup drift — Law A yields 1 today)
   mA Increment from=A createdAtMs=1000
   mB Increment from=B createdAtMs=999
   snapshot { value: 1, at: 1000, asOf: A }         // A won the count row
   BOOT from=NEW
   expect 2

4. SAME MILLISECOND  (snapshotBoundary covers the whole ms — yields 1 today)
   mA and mB both createdAtMs=1000
   snapshot { value: 1, at: 1000 }
   BOOT expect 2

5. LIVE inject m1 again → still 2 (id idempotent)
```

Tests that encode “the snapshot’s own row comes back from `>=`” (`snapshotLog.test.ts` “does not fold the Message history on read”) or “same-ms is covered” (`SnapshotLogTests.snapshotBoundaryCoversSameMillisecond`) are the bug, not the spec.

Refuse this week: CRDT, vector clocks, whole-log as “delete the snapshot row,” Q108 B, mandating `seq` on Instant, `serverCreatedAt` as watermark, seeding `appliedIds` with a processor token.

---

## Q109 — When the Message log grows, do we archive old rows to a flat file?

- **Status:** `open`
- **Question:** Instant message rows grow forever. They want a flatten: every day or week (or after N), write old Messages to a file, keep a proven cache, delete the Instant rows we no longer need. How often, and what stays live?

10-foot:

```text
TODAY     Instant { count, message } grows without bound
Q108 E    included names which ids are already in the cache
WANTED    after a cadence, write those old rows to a file
          snapshot stays; live log is only the tail
```

Options:

- **A.** Periodic compact. Proven snapshot + flat file of old Messages. Delete those Instant rows. Cadence is daily, weekly, or after N. Live boot uses E on the tail. (What they said.)
- **B.** Never delete Instant rows. Slim the query later (Q45). File archive is debug only.
- **C.** Delete without a file. Cache is enough. History is gone.

What I think: **A.** They named the file. C loses replay. B is today’s leak.

Trade-off: A is a new writer and a restore path. Cadence can stay “after N or weekly” until the harness names a number.

---

## Q110 — While the action menu is Open, is focus on the filter or on the list?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q91 D: combo box)
- **Answered:** 2026-08-26
- **Answer:** **C, amended.** A general Focus ADT. The action menu is the first client. Not A (menu-only chrome as the whole law). Not B (always focus the filter).

  Open always has a **query** (whether the filter is focused or not) and a **highlighted list item** as we scroll.

  Keys (all in Foldkit core):
  - Tab moves Focus.
  - Down moves Focus. Up from the top of the list moves Focus to the filter.
  - Escape: List → Filter, Filter → Closed.
  - Filter focused: type into the query.
  - List focused: Action keys send. j / k move. J / K and Cmd-Up / Cmd-Down jump.

  Cases Focus may name are **Q111**. No “too big this week.”

- **Question:** Q91 locked a floating combo box. Focus decides whether `r` types or sends Reset. Today Open is only `{ focus: rowIndex, maybeQuery }`. There is no Filter vs List. What is the Open Model, composed in Foldkit core?

10-foot:

```text
TODAY (packages/foldkit/src/program/actionMenu.ts)
  Closed | Open { focus: number, maybeQuery }
  Escape → dismiss
  example actionMenuKeys.ts sends product keys even while Open

Q91 D
  Closed
  Open + List     Escape → focus Filter. r / + send. j k move.
  Open + Filter   printable types. Escape → Closed.
```

```ts
// core today — no chrome:
export const Open = ts('Open', {
  focus: S.Number,
  maybeQuery: S.Option(S.String),
})
```

Neighboring: `Program.compose.actionMenu` already wraps a Program and puts `{ product, actionMenu }` on the Model. The smell is `examples/counter/core/src/actionMenuKeys.ts` plus an Open Model that cannot say “filter is focused.” Swift and Rust need the same combinator.

Options:

- **A.** `Open { chrome: List | Filter, focus, maybeQuery }`. Escape: List → Filter, Filter → Closed. Filter: type. List: Action keys + j/k + J/K + Cmd-Up/Down. All of this in Foldkit core.
- **B.** Open always focuses the filter (classic cmd-K). No List chrome. Then `r` never sends while Open.
- **C.** A general Focus ADT for any field. Menu is one client.

What I think: **C** (they said this). B is rejected. A is the menu behavior, not the whole law. Q102 does not block a Focus ADT they named.

---

## Q111 — What can Focus name?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q110 C)
- **Answered:** 2026-08-26
- **Answer:** **D (new).** Focus names the **filter** or a **catalog Action** (a Message the menu can send). Not a Model field like `count`. “Product fields” in A/B/C was the wrong word.

  The action menu exposes the same catalog as Q87: Increment, Decrement, Reset. Highlighted row is which Action. Filter is the other Focus. Tab / arrows move among Filter and those Actions.

- **Question:** Q110 locked a general Focus ADT. Query and highlighted row always exist while the menu is Open. What sum type names “what we are focused on”?

10-foot:

```text
ALWAYS ON OPEN
  maybeQuery     typed filter, even when an Action is focused
  highlighted    which catalog Action we have scrolled to

FOCUS (Tab / arrows move this)
  Filter
  Action   Increment | Decrement | Reset   (the catalog)
```

Neighboring: Q87 already said `md` + `actions` is the catalog. The menu is that catalog plus a filter. Focus does not name `count`.

Options:

- **A.** Menu only: `Filter | Row` (row is an index, not an Action).
- **B.** Program-wide now: `None | Filter | Row | Product(...)` (count, buttons as Model fields).
- **C.** Generic `Focus<Target>` where Target includes Model fields.
- **D.** `Filter` or a catalog **Action** (a sendable Message). Highlighted is which Action.

What I think: **D.** They said this. A/B/C used “product fields.” That was sloppy. The menu sends Messages.

Trade-off: Focus is keyed by Action token / constructor, not array index. That matches Q87.

---

## Q112 — Does Counter get a Settings destination, and are some Actions allowed from every page?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q89 B: land the route table)
- **Answered:** 2026-08-26
- **Answer:** **D (new).** Do **not** add Settings to gospel `examples/counter`. Add a new example, **counter with settings**, that **composes the core Counter Program** and does not invent a second Increment. `examples/counters` must also compose that same core Program.

  Settings observes a delay (how long to wait after Increment, Decrement, or Reset is chosen before the Message is sent) and can update that delay. URL can be `/counter/settings` or `/settings`. Not locked here.

  Do **not** navigate to a destination that lists the Action and then send. “Increment the current counter” from Settings is often nonsensical (no current counter unless Settings is a modal). Dispatch is dynamic. The same Message may be sent from more than one URI.

  The catalog is the organized list of Actions / Messages (taxonomy / vocabulary). What `send` on a destination means, if a Message can fire from several URIs, is Q113.

  Not A (navigate-then-send on gospel Counter). Not B (Settings on gospel Counter). Not C (no Settings example).

- **Question:** They picked a route table because a Settings screen would not send Increment, and because something like “add one” or “add fries” might be asked from whatever page you are on. Do we add Settings to Counter now, and how does a global ask find the destination that may send that Action?

**What Counter has today**

There is one destination. `Path` is `Counter`. The URL is `/counter`. The Model is `{ count }`. The catalog is Increment, Decrement, Reset. All three are valid on that one page (Reset only when count is not 0). There is no Settings. There is no delay. A Message is sent as soon as the Action is chosen.

**What they described**

A Settings page would change something like: how long to wait after Increment, Decrement, or Reset is chosen before the Message is actually sent. You would not increment the count from Settings. The table row for Settings would observe the delay (or whatever we store) and would not list Increment in `send`.

Separately: you might be on Settings, or on any later page, and still say “add one to the count” or “add fries to my cart.” If that Action is not allowed on the current destination, something has to look at the table, find where it is allowed, and dispatch. That might mean send it anyway (global), or navigate to Counter and then send, or refuse.

10-foot:

```text
TODAY
  Path = Counter
  /counter
  send: Increment, Decrement, Reset

IF SETTINGS EXISTS
  Path = Counter | Settings
  /counter          observe count, send Increment Decrement Reset
  /counter/settings observe delay, send (not Increment)
```

Options:

- **A.** Add Settings now. Path becomes `Counter | Settings`. Settings owns a delay (or the same kind of knob). Increment is not in Settings’ `send`. A global ask (“add one”) looks up the table: if this destination cannot send it, navigate to one that can, then send. Parser-printer for both URLs.
- **B.** Add Settings now. Same Path split. Global asks send from anywhere. The table’s `send` is only what the page’s buttons offer, not what the Program will accept.
- **C.** Do not add Settings yet. The table has one row (Counter). Write the Settings row when we name the delay field. Global versus per-page send waits too.

What I think: **A.** They asked to land the table so a second place is real. Settings is that place. A delay before send is a concrete Model field, not a ghost type. Global “do it anyway” without a home in the table is how hosts invent a second stack.

Trade-off: Counter grows a second destination and a delay field. That is the work. B makes `send` a lie (the page says no, the Program still does it). C leaves B’s table as one duplicated row.

---

## Q113 — If a Message can be sent from several URLs, what does a destination’s `send` list mean?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q112 D)
- **Answered:** 2026-08-26
- **Answer:** **A, amended.** `send` is what this page **presents** (buttons, menu rows). Not permission. The Program may still accept Increment while the URL is Settings. An agent may dispatch a Message for something this page is not showing. That is often an agent request that wraps the Message, and that wrapper can be sent from anywhere. Special dispatch if the payload must name which count. Not C as permission (“destinations this Action may be sent from”).
- **Question:** Q89 put `send` on each destination. Q112 said the same Message may be sent from more than one URI, and we do not navigate-then-send. So what is `send`? Buttons on this page? Permission? Or does the catalog say which destinations may send each Action?

**What we have decided**

Gospel `examples/counter` stays one place: `/counter`, count, Increment / Decrement / Reset. The route table still has that one row.

A new example, counter with settings, composes that same Counter Program. It adds Settings. Settings can update a delay. It does not invent its own Increment. Multiple Counters must compose the same core Program too.

The catalog (Q87) is the organized list of Actions. The usual word next to ontology is **taxonomy**: a classification of the Messages the Program can send. Ontology is “what exists.” Taxonomy is “how we group what we can do.” The catalog is the taxonomy of Actions.

**The fork**

If Settings does not list Increment under `send`, and a global ask still sends Increment while you are on Settings, then `send` is not permission. If Increment is forbidden on Settings because there is no “current counter,” then a global Increment must name **which** counter (or the one count in the settings example) and dispatch without changing the URL first.

10-foot:

```text
CATALOG (taxonomy of Actions)
  Increment, Decrement, Reset, UpdateDelay, …

DESTINATION ROWS
  Counter    observe count    send: ?
  Settings   observe delay    send: ?

Q112  same Message may leave from more than one URI
      do not navigate-then-send
```

Options:

- **A.** `send` is what this page offers (buttons, menu rows). The Program may still accept Increment on Settings. The table is chrome, not permission.
- **B.** `send` is permission. If Settings does not list Increment, Increment on Settings is invalid. A global ask that needs Increment names its payload (which count) and is sent without changing the URL. Dispatch is not “go to Counter first.”
- **C.** The catalog is the home. Each Action names the destinations it may be sent from (one, many, or all). The route table’s `send` is derived from that. Dynamic dispatch reads the Action, not “the page I am on.”

What I think: **A** (they picked this). C as permission is the wrong sentence. Syntax of what C _would_ have been, versus A, is below. Agent wrapper versus bare Increment is Q114.

**C (refused): Action carries destinations. Table must match or they drift.**

```ts
// C — each Action names where it may be sent from
export const Increment = md('Increment', {
  destinations: ['Counter', 'Settings'], // or destinations: 'global'
})
export const UpdateDelay = md('UpdateDelay', {
  destinations: ['Settings'],
})

// route table derived from that
Counter.send = [Increment, Decrement, Reset] // must equal filter(catalog, Counter)
Settings.send = [UpdateDelay, Increment] // Increment listed because destinations said so
```

If someone adds Settings to Increment’s `destinations` and forgets the Settings row, the two lists disagree. That is the drift.

**A (decided): table is chrome. Catalog has no destinations field.**

```ts
export const Increment = md('Increment', {
  keys: ['+'],
  tokens: ['increment'],
  valid: () => true,
})
export const UpdateDelay = md('UpdateDelay', {
  tokens: ['delay'],
  valid: () => true,
})

// route table: what this page shows, not what update will accept
Counter.offer = [Increment, Decrement, Reset]
Settings.offer = [UpdateDelay]

// while URL is Settings, Program.update still accepts Increment()
// an agent may send Increment() or wrap it (Q114)
```

---

## Q114 — When an agent asks to increment while you are on Settings, what Message is sent?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q113 A: `send` is chrome)
- **Answered:** 2026-08-26
- **Answer:** **Not C.** Never `AgentRequestedIncrement`. There is no `IncrementButtonTapped` in the catalog. The + button and the action menu both send `Increment()` today. The Program still updates on that one Increment case. They want to keep how the occurrence arrived (button, menu, agent, remote). A wrapper only around the agent (`AgentRequested`) does not record button versus menu. That home is **Q115**.
- **Question:** The page may not show Increment. An agent may still increment. Is that the same `Increment()` the button would send, or a wrapper such as `AgentRequested({ message: Increment() })` that can be sent from any URL?

**What Counter does today**

The + button and the action menu both send `Increment()`. There is no agent. There is no wrapper. `update` has one Increment case.

**What they said**

It might just send. It is really an agent request wrapping that Message, and that wrapper can be sent globally. Special dispatch only if the payload must name which count.

10-foot:

```text
ON /counter, human taps +
  send Increment()
  update Increment → count + 1

ON /settings, agent says “add one”
  A.  send Increment()                    same Message
  B.  send AgentRequested({ Increment() }) wrapper, then unwrap to Increment
  C.  send AgentRequestedIncrement(...)    a third catalog row
```

```ts
// A — same constructor the button uses
Increment()

// B — wrapper around a catalog Message
AgentRequested({ message: Increment() })

// C — a second Increment in the catalog
AgentRequestedIncrement({ maybeCounterId: Option.none() })
```

Options:

- **A.** Send `Increment()`. Same catalog row. Same `update` case. The agent is a Client, not a Message.
- **B.** Send a wrapper, `AgentRequested({ message })`, whose payload is a catalog Action. `update` unwraps and runs the same Increment case. The wrapper can be sent from any URL.
- **C.** A separate catalog Action for the agent. Two Increment-like rows.

What I think: **A** until we have a real agent Client. Wrapping is a second Message for the same fact. Q102: no unused type. If we need “who asked” later, that is a field on the envelope (Q42 / actor), not a second Increment.

Trade-off: A does not record “an agent asked.” B records that and needs a wrapper in the catalog. C splits the taxonomy.

They refused C. They also refused losing how it arrived. B-as-wrapper-only is not a complete home. Q115.

---

## Q115 — Where does “how this Increment arrived” live?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q114: fact is Increment, never a second Increment)
- **Answered:** 2026-08-26
- **Answer:** **A, amended.** `via` lives on the Message (`Increment({ via })`). It is an ADT, not a string. Cases: **Button** (button text, page URI), **ActionMenu** (filter text at send, page URI, maybe highlighted row), **Agent** (user question, page URI, how long it took). Not Remote. Not a wrapper. Analytics / tape. `update` does not branch on `via`. `actor` stays who (see below). They heard B and still tend A.
- **Question:** They want the tape to keep whether this occurrence came from the + button, the action menu, an agent, or a peer. Increment already exists. The envelope already exists. There is no `via` today. Where does that field go?

**What Counter does today**

`Increment()` is `{ _tag: 'Increment' }`. No payload. The React host verb is `clickedIncrement`, which enqueues that same value. The action menu enqueues the same value. There is no `IncrementButtonTapped` Message. `update(model, message)` receives the Message only. It does not receive the envelope.

The envelope already stores who and which Processor. It does not store how they asked.

```ts
// examples/counter/core/src/message.ts
export const Increment = md('Increment', {
  keys: ['+', '='],
  tokens: ['increment'],
})
Increment() // { _tag: 'Increment' }

// packages/foldkit/src/processor/processor.ts
export const MessageEnvelope = Schema.Struct({
  actor: Actor, // Authenticated | Guest | System  (who)
  originClientId: ClientId,
  ingressProcessorId: ProcessorId,
  createdAtMs: Schema.Number,
  // no via, no channel, no "button vs menu"
})
```

**Remote is already an axis.** A peer’s + is still `Increment()`. This Processor did not write it. That is `from` / `ingressProcessorId`, not a fifth `via` that overwrites Button. If the phone tapped +, the laptop should still see `via: Button` and `from: phone-…`.

10-foot:

```text
Program.update(model, Increment())     ← fact (count + 1)
envelope.actor                         ← who (Q42)
envelope / from                        ← which Processor (Q106)
???                                    ← how this occurrence was asked

  A.  Increment({ via: Button })       field on every catalog Message
  B.  envelope.via = Button            field next to actor
  C.  AgentRequested({ Increment() })  wrapper for some paths only
  D.  ClickedIncrement, ChoseIncrementFromMenu, …
```

```ts
// A — via on the Message. Agent sends Increment. No wrapper.
Increment({ via: 'Button' })
Increment({ via: 'ActionMenu' })
Increment({ via: 'Agent' })
Increment({ via: 'Key' })

// B — via on the envelope. Increment stays empty. Agent is a Client.
Increment()
envelope.via = 'Button' | 'ActionMenu' | 'Agent' | 'Key'

// C — wrapper only for the agent. Button vs menu still missing.
AgentRequested({ message: Increment() })

// D — one catalog row per trigger (they already refused AgentRequestedIncrement)
ClickedIncrement()
ChoseIncrementFromMenu()
```

Options:

- **A.** Put `via` on every catalog Message. `Increment({ via })`. The agent sends Increment with `via: Agent`. No `AgentRequested` wrapper. `update` can match on `via` if a path must behave differently.
- **B.** Put `via` on the envelope, next to `actor`. `Increment()` stays the fact. The agent is a Client that stamps `via: Agent`. `update` does not see `via` unless we change its signature. The tape and devtools still have it.
- **C.** Keep a wrapper Message for some paths (`AgentRequested`). Button versus menu is still lost unless we also do A or B. This is Q114 B as the only home. Incomplete.
- **D.** One Message per trigger (`ClickedIncrement`, `ChoseIncrementFromMenu`, `AgentRequestedIncrement`). They already refused the last of these.

What I think: **B** if `update` never matches (analytics belongs next to `actor`). They picked **A** and named the ADT. Lock A. Path versus printed URI, and whether every Action carries `via`, is Q116.

**`actor` (already on the envelope).** Who originated this occurrence. Not how they asked. Not which Processor (`from`).

```ts
export const Actor = Schema.Union([
  Schema.TaggedStruct('Authenticated', { subjectId: Schema.String }),
  Schema.TaggedStruct('Guest', {
    guestId: Schema.String,
    pairingId: Schema.String,
  }),
  Schema.TaggedStruct('System', { processorId: ProcessorId }),
])
```

Same signed-in person on two tabs: same `actor`, two `from` values. Phone tap still `via: Button`. Laptop sees that Button plus `from: phone-…`.

**Via they named (A).**

```ts
export const Via = S.Union([
  S.TaggedStruct('Button', {
    text: S.String, // '+'
    uri: S.String, // page it was clicked on (Path vs string is Q116)
  }),
  S.TaggedStruct('ActionMenu', {
    query: S.String, // what was typed when they sent
    uri: S.String,
    maybeHighlighted: S.OptionFromNullishOr(S.String),
  }),
  S.TaggedStruct('Agent', {
    question: S.String,
    uri: S.String, // page they were on when they asked
    maybeDurationMs: S.OptionFromNullishOr(S.Number),
  }),
])

Increment({ via: { _tag: 'Button', text: '+', uri: '/counter' } })
```

Trade-off: A puts analytics on the fact. Every `Increment()` call site must stamp `via`. Peers sync button text and agent questions inside Increment. B would have kept Increment empty. They chose A.

---

## Q116 — Does every catalog Action carry `via`, or only Increment?

- **Status:** `decided`
- **Asked:** 2026-08-26 (after Q115 A: `via` ADT on the Message)
- **Answered:** 2026-08-26
- **Answer:** **A.** Every catalog Action requires `via`. Same ADT. Settings later too. They did not reopen Q115 to B. Declaration → invocation → update is below. Path versus printed URI is Q117.
- **Question:** Increment will be `Increment({ via })`. Decrement, Reset, and later UpdateDelay are also sent from a button, the action menu, or an agent. Must those constructors take the same `via`, or is Increment the only one for now?

**What Counter does today**

Increment, Decrement, and Reset are empty tagged structs. The + / − / reset buttons and the action menu all send those empty values. There is no `via`.

```ts
Increment() // { _tag: 'Increment' }
Decrement() // { _tag: 'Decrement' }
Reset() // { _tag: 'Reset' }
```

After Q115, Increment is not empty. If Decrement stays empty, the catalog is uneven. An agent that says “reset” has no place for the question unless Reset also has `via`.

10-foot:

```text
catalog today     Increment | Decrement | Reset   (all empty)
after Q115 A      Increment({ via })
later settings    UpdateDelay({ maybe delay, ??? via })

  A.  every Action requires via
  B.  Increment only. Others stay empty until a caller needs it
  C.  via is optional on every Action (maybeVia)
```

```ts
// A
Increment({ via })
Decrement({ via })
Reset({ via })

// B
Increment({ via })
Decrement()
Reset()

// C
Increment({ maybeVia: Option.some(via) })
Reset({ maybeVia: Option.none() })
```

Options:

- **A.** Every catalog Action requires `via`. Same ADT. Button, ActionMenu, Agent. Settings later too.
- **B.** Only Increment carries `via` now. Decrement and Reset stay empty. Add the field when a caller needs it.
- **C.** Every Action has `maybeVia`. Senders may omit it.

What I think: **A.** The chrome paths are the same for − and reset. B makes Increment a special snowflake. C is a none that means “we forgot.” Path versus a printed URI string in `Via.uri` is the next fork if they want it split. I would store Path (Q89) and print for analytics.

Trade-off: A is more fields at every send site. B is a hole the first time someone resets from the agent. C lets tests send `Reset()` with no provenance.

**Declaration → invocation → update** (`md` already takes `fields`. Songbook `TypedSearch` is the same shape.)

```ts
// 1. Via is a tagged union. Not a Message. ts() for non-Message structs.
export const Button = ts('Button', {
  text: S.String,
  uri: S.String,
})
export const ActionMenu = ts('ActionMenu', {
  query: S.String,
  uri: S.String,
  maybeHighlighted: S.OptionFromNullishOr(S.String),
})
export const Agent = ts('Agent', {
  question: S.String,
  uri: S.String,
  maybeDurationMs: S.OptionFromNullishOr(S.Number),
})
export const Via = S.Union([Button, ActionMenu, Agent])

// 2. Declaration. Catalog metadata stays. fields is the payload.
export const Increment = md('Increment', {
  fields: { via: Via },
  what: 'Increments the count by one',
  why: 'Triggered when the user indicates a desire to increment the count',
  keys: ['+', '='],
  tokens: ['increment'],
  valid: () => true,
})

// 3. Invocation. Host stamps via. Then enqueue / send.
clickedIncrement: () =>
  enqueueMessage(
    Increment({
      via: Button({ text: '+', uri: '/counter' }),
    }),
  )

// action menu, on choose:
Increment({
  via: ActionMenu({
    query: 'inc',
    uri: '/counter',
    maybeHighlighted: Option.some('increment'),
  }),
})

// agent:
Increment({
  via: Agent({
    question: 'add one',
    uri: '/settings',
    maybeDurationMs: Option.some(840),
  }),
})

// 4. update. Same Increment case. via is present and unused.
Increment: () => [{ count: model.count + 1 }, []]
```

```text
button / menu / agent
        │
        ▼
Increment({ via })     Message value
        │
        ▼
enqueue / send         Client
        │
        ▼
update Increment       count + 1  (ignores via)
        │
        ▼
tape / Instant         peers get the same Increment({ via })
envelope.actor         who (unchanged)
envelope / from        which Processor (unchanged)
```

Today `Increment()` is `{ _tag: 'Increment' }`. After this it is `{ _tag: 'Increment', via: … }`. Tests and `clickedIncrement` must stamp `via`. `update` does not read it.

---

## Q117 — Does `Via` store a Path destination, or a printed URI string?

- **Status:** `asking`
- **Asked:** 2026-08-26 (after Q116 A: every Action has `via`)
- **Question:** Button, ActionMenu, and Agent all carry the page they were on. Q89 said hosts pass `Path()`, not `'/counter'`. They said URI. Which value lives on `via`?

**What Counter does today**

`Path = r('Counter')`. `Path()` is `{ _tag: 'Counter' }`. `pathRouter` prints `/counter`. Hosts must pass `Path()` into `useModel`. There is no Settings yet. A later Settings destination would be another Path case.

```ts
export const Path = r('Counter')
pathRouter() // prints /counter
```

10-foot:

```text
destination   Path()              { _tag: 'Counter' }
print         pathRouter          /counter
via.???       A Path   |  B string |  C both
```

```ts
// A — destination. Print when a dashboard wants a URL.
Button({ text: '+', path: Path() })

// B — printed relative URI. What they said (“URI”).
Button({ text: '+', uri: '/counter' })

// C — both. Can drift if someone edits one.
Button({ text: '+', path: Path(), uri: '/counter' })
```

Options:

- **A.** Store Path. The printer makes the string for analytics. Settings is another Path case, not another string convention.
- **B.** Store the printed relative URI (`/counter`). What they named. Hosts that only have `location.pathname` can stamp it without importing Path.
- **C.** Store both.

What I think: **A.** Q89. The URL is a projection. A string on every Action will drift from the printer the first time Settings lands (`/settings` vs `/counter/settings`). B is easier at a DOM click. C is two sources of truth.

Trade-off: A requires the host to know the current Path when it stamps `via`. B is a string that can go stale. C doubles the field.

Q118’s sketch stamps `Path()` inside the adapter. If they accept that, Q117 is **A** unless they still want the printed string on the tape.

---

## Q118 — Does the React adapter own IncrementButton, so the host only lays out?

- **Status:** `asking`
- **Asked:** 2026-08-26 (after they refused host-built `enqueueMessage(Increment({ via }))`)
- **Iterated:** 2026-08-26. They like `.props`. They want this **derived**, not listed by hand. Full paths below. Still drawing board.
- **Iterated (recovered into Delta, then Delta worktree died; record re-landed here):** critique + ideal-syntax proposal delivered in chat (one construction site; six derivable adapter slots; via unstampable without navigation in Model; labelOf leak; prose fields lie; lastScreenTag; two Processors per binding). Review comments answered; forks Q119-Q125 appended.
- **Iterated (canonical v2, after their comment review):** modes are DEAD (Settings is a route; fine-grained edit machines are Model ADTs, not URIs). No raw strings at mount sites: a child owns its branded slug. Flat app Model, no `product` nesting (`product` traced to Program.SyncedModel Ready { product }; dies); synced subset is a projection like counters' projectDomain. Explicit named root route. Focus is global chrome. Agents see every mount's catalog from anywhere (Q113: chrome is not permission). Full Counter + Gallery + framework utilities fence: chat 2026-08 and `overviews/q118-canonical-counter-gallery.md`. Root `glossary.md` created. CLAUDE.md linked to AGENTS.md; concrete-examples rule added; `document` skill at `.agents/skills/document/SKILL.md`.
- **Question:** `incrementButtonTapped` already exists, handwritten, in the Counter example. Puzzle copied the same helper. Foldkit has no derive. If IncrementButton + `.props` are derived from the catalog, which package owns that derive?

**What Counter does today**

Two host styles already exist. Neither stamps `via`.

1. Gospel React paints `useScreen` + `paintReact`. The host never names Increment. Tokens go through `sendScreenToken`.
2. React Native showcase lays out its own buttons and calls `actions.clickedIncrement`. That is the nasty path they refused.

Core already has the verb they want, under a slightly different name:

```ts
// examples/counter/core/src/factHandles.ts
incrementButtonTapped: tapped(Increment, send) // send(Increment())
```

`packages/react` hook tests already return `incrementButtonTapped`. `react-bindings` drifted to `clickedIncrement`. `productView` already builds host-neutral `Button({ token, label })` from the catalog. Foldkit HTML already lets a child publish attributes that the parent **spreads**. There is no `useComponents` yet.

10-foot:

```text
core          Increment({ via })     fact
core          incrementButtonTapped  handle (stamps via)
react adapter IncrementButton        <button> + .props
host Client   layout only            place the button

  button / menu / agent
        │
        ▼
  adapter stamps via (Path, label)
        │
        ▼
  Increment({ via }) → update (+1)
```

**Ideal sketch** (React adapter, not the host App):

```ts
// packages/react or counter-react-bindings
export const useActions = (path: Path) => ({
  incrementButtonTapped: () =>
    send(Increment({ via: Button({ text: '+', path }) })),
  decrementButtonTapped: () =>
    send(Decrement({ via: Button({ text: '−', path }) })),
  resetButtonTapped: gated(Reset, model, send, path),
})

export const useComponents = (path: Path) => {
  const actions = useActions(path)
  return {
    IncrementButton: withProps(actions.incrementButtonTapped, '+'),
    DecrementButton: withProps(actions.decrementButtonTapped, '−'),
    ResetButton: withProps(actions.resetButtonTapped, 'reset'),
  }
}
```

```tsx
// host Client. Layout only. No Increment. No via.
const { IncrementButton, DecrementButton, ResetButton } = useComponents(Path())

<main className="min-h-screen grid">
  <IncrementButton className="text-7xl" />
  <footer className="flex gap-3">
    <DecrementButton />
    <ResetButton />
  </footer>
</main>

// same objects, spread (HTML childAttributes pattern)
<button {...IncrementButton.props} className="absolute top-4 right-4" />
```

```tsx
// adapter IncrementButton. Host className / children land. onClick stays last.
const IncrementButton = Object.assign(
  (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...IncrementButton.props} {...props} />
  ),
  {
    props: {
      type: 'button',
      children: '+',
      onClick: incrementButtonTapped,
    },
  },
)
```

Action menu and agent are other adapters. They call `incrementButtonTapped` or send Increment with `via: ActionMenu` / `via: Agent`. The React host never writes that.

Options:

- **A.** Both. `useActions` → `incrementButtonTapped`. `useComponents` → `IncrementButton` plus `.props` for spread. Adapter stamps `via`. Host is layout only. Rename `clickedIncrement` back to Tapped.
- **B.** Components only. Host must use `<IncrementButton />`. No spread.
- **C.** Spread props only. Host always owns the `<button>`. No IncrementButton component.
- **D.** No `useComponents`. Gospel stays `useScreen` + `paintReact`. Custom layout is out.

What I think: **A.** They asked for the component and for spreading. Prior art is `incrementButtonTapped` + `productView` Button + HTML attribute spread. D is already gospel for the default window. A is how RN / a weird layout still does not construct Increment. Q117 becomes Path (the hook already has it) unless they want the printed string on the tape anyway.

Trade-off: first-pass A is two surfaces. They now want derive, not a handwritten IncrementButton map. That is the fork below.

**Lean so far (not locked):** keep `.props` spread. Host does not construct Increment. Name is `incrementButtonTapped`, not `clickedIncrement`.

### Where it lives today (full paths)

```text
CATALOG / FACT
  packages/foldkit/src/schema/index.ts
      md() — declaration. fields: { via } would go here later.

  examples/counter/core/src/message.ts
      Increment = md('Increment', { keys, tokens: ['increment'], … })
      actions = [Increment, Decrement, Reset]

  examples/counter/core/src/update.ts
      Increment: () => count + 1

  examples/counter/core/src/path.ts
      Path = r('Counter')   Path() is { _tag: 'Counter' }

  examples/counter/core/src/product.ts
      productView — Button({ token, label }) from `actions`. Host-neutral tree.

  examples/counter/core/src/program.ts
      CounterProgram.screen / .valid

HANDLE  (the prior art for incrementButtonTapped)
  examples/counter/core/src/factHandles.ts
      ProgramActions<Token> → `${Token}ButtonTapped`
      incrementButtonTapped: tapped(Increment, send)   HANDWRITTEN
      decrementButtonTapped, resetButtonTapped
      counterSyncedFactHandles(synced, send)

  examples/counter/core/src/factHandles.test.ts
      calls incrementButtonTapped()

  examples/puzzle/core/src/factHandles.ts
      SAME helper copied. yesButtonTapped, …

  examples/counter/core/src/listActions.ts
      token catalog for menu / LLM. No send.

  examples/counter/core/src/startSynced.ts
      handle.actions() → counterSyncedFactHandles

  examples/counter/core/src/startSynced.test.ts
      handle.actions().incrementButtonTapped()

  examples/counter/core/src/public.ts
      export * from factHandles

  packages/foldkit/src/          ← NO fact handle derive. Empty grep for ButtonTapped.

REACT HOOKS
  packages/react/src/hooks/hooks.ts
      useModel, useActions, useScreen, createProgramHooks
      useActions = slot.toActions(synced, send)
      NO useComponents

  packages/react/src/programHandle/programHandle.ts
      BindProgramConfig.toActions

  packages/react/src/hooks/hooks.test.tsx
      fake toActions returns incrementButtonTapped

  examples/counter/react-bindings/src/counterHandle.ts
      GOSPEL WIRE
      createProgramHooks(…, { toActions: counterSyncedFactHandles })
      exports useModel, useActions, useScreen

  examples/counter/react-bindings/src/windowHooks.test.tsx
      actions.incrementButtonTapped()

  examples/counter/react-bindings/src/counter.tsx
      OLD CLIENT
      clickedIncrement: () => enqueueMessage(Increment())
      createReplayableReactProgramClient

  examples/counter/react-bindings/src/counter.test.tsx
      actions.clickedIncrement()

  examples/counter/core/src/window.ts
      leftover CounterWindowActions.clickedIncrement

SPREAD PRIOR ART
  packages/foldkit/src/html/index.ts
      ChildAttribute — parent spreads published attrs into its element

HOSTS
  examples/counter/react/src/App.tsx
      useModel + useScreen + paintReact   (never names Increment)

  examples/counter/react/src/ScreenApp.tsx
      useScreen + paintReact

  examples/react-native-showcase/src/App.tsx
      CounterClient.useActions().clickedIncrement   (old client, homemade buttons)

  examples/counter/tui/src/tui.test.ts
  examples/counter/opentui/src/client.test.ts
      counterFactHandles(…).incrementButtonTapped
```

Two React stacks. Gospel hooks use Tapped. The old `CounterClient` uses `clickedIncrement`. That is the drift.

### Derive (not a handwritten map)

```text
message.ts actions[]
    token "increment"
        │
        ▼
packages/foldkit  deriveFactHandles(actions, send, { path, via: Button })
    incrementButtonTapped → Increment({ via: Button({ text: '+', path }) })
        │
        ▼
packages/react    deriveComponents(handles)
    IncrementButton + IncrementButton.props
        │
        ▼
examples/counter/react/src/App.tsx   layout only
```

Counter would delete the handwritten names in `factHandles.ts`. Puzzle would delete its copy.

Options:

- **A.** Foldkit derives the handles from `actions`. `@foldkit/react` derives `IncrementButton` + `.props`. Counter keeps `md` + `actions` + `update`. Delete `examples/counter/core/src/factHandles.ts` as a handwritten map (the generic stays in Foldkit).
- **B.** Keep handwritten `factHandles.ts` in the example. Only derive React components from those handles.
- **C.** Derive nothing. Keep listing `incrementButtonTapped` by hand (today). `useComponents` would also be a handwritten map.

What I think: **A.** They asked to derive this automatically. The example already invented `ProgramActions` + `${Token}ButtonTapped`. Puzzle copied it. That is the smell: higher-order compose belongs in `packages/foldkit`. React owns the widget. The host owns layout.

Trade-off: A is library work. B leaves two Puzzle/Counter copies. C is what they just refused.

### Code trace: Increment from core to the React + button

Gospel window is `App.tsx` + `useScreen` + `paintReact`. It does **not** call `incrementButtonTapped`. The + is a screen token. `incrementButtonTapped` is a second wire (`useActions`) that this window never uses.

```11:22:examples/counter/core/src/message.ts
export const Increment = md('Increment', {
  what: 'Increments the count by one',
  why: 'Triggered when the user indicates a desire to increment the count',
  keys: ['+', '='],
  tokens: ['increment'],
})
```

```59:78:examples/counter/core/src/message.ts
export const actions = [Increment, Decrement, Reset] as const

export const actionByToken = (token: string): Action | undefined => {
  const maybeAction = Array.findFirst(actions, action =>
    Array.contains(action.tokens ?? [], token),
  )
  // …
}

export const tokenOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.tokens ?? []), () => action.command ?? '')
```

```14:20:examples/counter/core/src/update.ts
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Increment: () => [{ count: model.count + 1 }, []],
```

```14:24:examples/counter/core/src/product.ts
export const productView = (model: Model): UiNode => {
  const buttons = Array.map(
    Array.filter(actions, action => action.valid(model, {})),
    action =>
      Button({
        token: tokenOf(action),
        label: labelOf(action),
      }),
  )
  return Column({}, Text(model.count.toString()), Row({}, ...buttons))
}
```

```28:39:packages/foldkit/src/renderers/elements.ts
export const Button = (props: {
  readonly label: string
  readonly token?: string
}): ButtonNode => ({
  _tag: 'Button',
  label: props.label,
  ...(props.token === undefined ? {} : { token: props.token }),
```

```34:42:examples/counter/core/src/program.ts
export const counterScreen: Program.ProgramScreen<Model> = (
  model,
  context: ActionContext = {},
): UiNode => {
  const product = productView(model)
  if (context.device === undefined) {
    return product
  }
```

```34:62:examples/counter/react-bindings/src/counterHandle.ts
const screenOf = (model): UiNode => {
  if (model._tag === 'Ready') {
    return counterScreen(model.product)
  }
  return startingScreen
}

const tokenToMessage = (token: string): AppMessage | undefined => {
  const action = actionByToken(token)
  if (action === undefined) {
    return undefined
  }
  return action()
}

const hooks = createProgramHooks(..., {
  toActions: counterSyncedFactHandles,
  toScreen: screenOf,
  tokenToMessage,
})
```

```101:107:packages/react/src/hooks/hooks.ts
export const useScreen = (path) => {
  const handle = getScreenHandle(path)
  const slot = getBoundProgram(path)
  return slot.toScreen(synced)
}
```

```26:41:examples/counter/react/src/App.tsx
export const App = () => {
  const screen = useScreen(Path())
  return (
    <main>
      {paintReact(screen, sendScreenToken, classNames)}
```

```48:65:packages/react/src/paintReact/paintReact.tsx
        Button: button => {
          const onClick = () => {
            sendToken(button.token)
          }
          return (
            <button type="button" onClick={onClick}>
              {button.label}
            </button>
          )
        },
```

```113:132:packages/react/src/hooks/hooks.ts
export const sendScreenToken = (token: string): void => {
  const message = slot.tokenToMessage(token)
  handle.send(message)
}
```

Click is `'increment'`. `tokenToMessage` returns `Increment()`. `update` runs Increment. `useScreen` paints again.

The other wire. `App.tsx` does not call it:

```59:95:examples/counter/core/src/factHandles.ts
const tapped = (action, send) => () => {
  send(action())
}

export const counterFactHandles = (model, send) => ({
  incrementButtonTapped: tapped(Increment, send),
})
```

---

## Q119 — One Enabled ADT on declarations, and delete the prose fields?

- **Status:** `open`
- **Asked:** 2026-08-26 (fork from the Q118 ideal proposal)
- **Question:** Collapse `valid` + `hiddenBecause` + `TapHandle.Hidden` into one `enabled: (model, context) => Enabled | Disabled({ because })`. Delete prose fields that restate code (`mutate`, `sideEffects`); `command` and `event` derive (first word / tag). **Amended by review:** delete `spoken` entirely (what/why give agents enough); tokens are never handwritten, the tag is the identity; presentation fields group under a `meta` tier (`meta: { label, keys }`) while semantic fields stay top-level (what, why, fields, enabled, destinations). Via.Button `text` renames to `label` (vocabulary amendment to Q115, which decided via = Button | ActionMenu | Agent on the Message).
- Options: **A** all of it. **B** Enabled ADT only. **C** prose deletion only. **D** leave as today.
- What I think: **A.**

---

## Q120 — Does the Model grow the navigation slice, derived into the existing seam?

- **Status:** `open`
- **Asked:** 2026-08-26
- **Question:** Q115/Q116 decided every Action carries `via` including the sender's page; nothing can stamp that truthfully while no Model field holds the destination. Does the app Model hold a NavigationStack, with `Navigation.make` deriving a `ProgramNavigation` consumed by the shipped ADR 0010 seam (`runtimeSeam.ts`: ProgramNavigation, HistoryPort, makeUriSync)? **Amended by review:** must adapt existing `foldkit/route` + seam, never a second router; HistoryPort is the platform-generic URI edge (browser history, argv, custom scheme, deep links).
- Options: **A** yes, now, even with one destination. **B** wait for a second page. **C** hosts keep owning location.
- What I think: **A.** C is the useState-URI smell (Q02: host uses the Program; Ready is only the session gate).

---

## Q121 — Does bindProgram collapse to `{ program, engine }` with one handle?

- **Status:** `open`
- **Asked:** 2026-08-26
- **Question:** `createProgramHooks` takes six slots (createHandle, createScreenHandle, toActions, toScreen, tokenToMessage, keyToMessage); every slot is a projection of the Program, and two handles let the window and the actions wire run on different Processors. Collapse to `bindProgram(Path(), { program, engine })` returning derived hooks, components, Screen, CommandMenu; no module-level lastScreenTag. **Amended by review:** `restore` also leaves the example core; hydration is the sync layer's job; Program.make defaults restore to identity.
- Options: **A** yes. **B** keep slots but default each from the Program. **C** keep today's config.
- What I think: **A**, with B's overrides only when a real Program needs one (Q102: nothing speculative).

---

## Q122 — Do Via cases exist for keyboard and CLI, or do keys stamp Button?

- **Status:** `open`
- **Asked:** 2026-08-26
- **Question:** Q115 locked Via = Button | ActionMenu | Agent. A keydown '+' and a CLI `counter increment` are none of those. What do they stamp?
- Options: **A** add Keyboard { key, path } and Cli { argv } now. **B** keys stamp Button (the key is the visible button's accelerator); CLI gets its case when the CLI Client lands on the new spine. **C** maybeVia (refused in Q116).
- What I think: **B**; A invents cases before a consumer exists (Q102), C reopens a decided Q.

---

## Q123 — Do Actions declare the destinations they are relevant on (typed), with the page table derived?

- **Status:** `asking` (chat is here)
- **Asked:** 2026-08-26 (supersedes the `offers: ['increment', ...]` string list they refused)
- **Recap of neighbors:** Q89 (decided B) wants a route table even at one row. Q113 (decided A) says a page's action list is chrome, what the page presents, never permission. Q112 (decided D) puts Settings in a separate example composing core Counter.
- **Question:** Pages (destinations) exist as their own declarations; each Action names the destinations it is relevant on by typed reference (`destinations: [Settings]`); the page-to-Actions table derives; boot asserts references. Chrome relevance only; agents may still dispatch anything from anywhere.
- Options: **A** optional `destinations`, omitted = relevant everywhere in this Program; derive; assert. **B** required on every Action. **C** page-side but typed. **D** nothing until a second page exists.
- What I think: **A.** Gospel Counter stays clean (three Actions omit it); the Settings example pins.
- **Aside (before answering):** they stated the ultimate goal: the application as a statically declared URI graph, framework-agnostic, root '/' = the Program's own namespace, composition by mount (child '/' becomes '/counter/<id>' in the parent), ADTs so impossible states are impossible; root app Model = domain + navigation + runtime context. Sketches: `overviews/uri-graph-sketch.md`, `overviews/showcase-domain-sketch.md`, canonical v2 in `overviews/q118-canonical-counter-gallery.md`.

---

## Q124 — Does devtools become a Foldkit Program with a host-neutral screen, React Client first?

- **Status:** `open`
- **Asked:** 2026-08-26 (their ask: adapt core devtools to be renderable anywhere, start with React)
- **Question:** Today `packages/devtools` renders into a DOM shadow root; only browser hosts get it. As a Program (Model: tape, handles, selection; screen: host-neutral nodes) every Client paints it, and its "send a Message" panel derives from the same catalog.tools projection agents use.
- Options: **A** yes, devtools core Program, React first, DOM overlay becomes one host. **B** DOM-only + data APIs. **C** leave as is.
- What I think: **A.**

---

## Q125 — Identity retirement: domain truth or a library sync slice?

- **Status:** `open`
- **Asked:** 2026-08 (from review: "identity retirement checks don't belong in a domain model?")
- **What it is:** `examples/counters/core/src/model.ts` keeps `retiredCounterIds` so a deleted Counter id can never be resurrected by a late-arriving Message during a tape fold (Created(c1), Deleted(c1), then a peer's Increment(c1) arrives; without retirement the fold could recreate the row). It exists for replay determinism, so yes, it is about the tape.
- **Question:** Does the RULE (deleted ids never revive) stay a domain refinement while the MECHANISM (the id ledger) moves into a library-owned sync slice, so example Models stop carrying bookkeeping?
- Options: **A** rule in domain, ledger in library slice. **B** keep both in the domain Model (today). **C** drop retirement and accept resurrection.
- What I think: **A.** C breaks replay determinism (Q88: fold the log in order, deterministically).

---

## How answers land

1. Chat is **Q123**; canonical v2 fence awaiting review. Q118 stays `asking` until its forks (Q119-Q125) resolve, then re-locks. Q117 stays `asking`. Q108 stays `asking` (quorum 2 filed E; human has not answered). Walk order: Q123 -> Q119 -> Q120 -> Q121 -> Q122 -> Q125 -> re-lock Q118 -> Q108/Q109.
2. Human answers in chat (A/B/C/D/E, amend, or new option).
3. File updated first: `decided` + **Answer** + date.
4. Chat confirms, then the next `open` Q with the hard separator.
5. New forks append as Q112+. They also edit this file while reading; apply those edits here first.

)
