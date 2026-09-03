# Findings — ADR 0011

Verified in git and source, 2026-08-26. Chat recaps are untrusted.

## 2026-08-26 resume (new chat)

Picked up mid-interview. **Q87 decided A:** `md` + `actions` is the catalog. Vocabulary is valid / enabled / supported in the current Model, not hidden. Code still says `hiddenBecause` and `TapHandle.Hidden`; rename in the plan.

**Q108** stays `asking`. Human: teach the watermark; do not ask them to pick fenceposts; **whole-log refold is not a good idea**; want performance and common sense.

Old Grok TUI quorum (rust cwd, parent `01a03bf9-7bfc-71c2-bb6d-f65330370825`):

- Proposer `01a03ec9-9ee8-7390-a041-e4ff155482fb`
- Debater `01a03ec9-9ee8-7390-a041-e50006a03fa0`
- Resolver `01a03ed1-d539-7e80-a429-51e265f48c36` → recommended **D** (fold whole log from 0)

Quorum 2 (this Cursor chat):

- [Debater](13f51efa-fdb9-4a8f-8859-1b7ab7932e84) landed `overviews/q108-debater.md` → **E** via `foldedCount` proof
- [Proposer](54917b52-bd70-4ac8-94ce-db88a4c3d24a) landed `overviews/q108-proposer.md` → **E** via `included` id set
- [Resolver](28258d9b-b639-483f-be66-108a3b8c2833) filed **E** with proof `included` under Q108 in `qanda.md` (plus `overviews/q108-resolver.md`). Boot from `value`, skip those ids, fold unknowns. Missing proof: fold from 0 once, then write E. Old D stays debug/harness only. Q108 still `asking`. Human has not answered.

**Q91 decided D:** floating combo box. Filter focused → type filters, Escape dismisses. List focused → Action keys send, j/k move, Escape focuses Filter. Compose in Foldkit core. Smell: `actionMenuKeys.ts` in the Counter example. Swift / Rust audit. See `smells.md`.

**Q110 decided C:** general Focus ADT. Query and highlighted row always exist while Open. Tab / arrows move Focus. Escape List → Filter → Closed. No “too big this week.” Cases are Q111.

No-shortcut law lives in this folder’s `AGENTS.md`. Repo `AGENTS.md` was not wiped (Foldkit conventions).

**Q111 decided D:** Focus names the filter or a catalog Action (a Message the menu sends). Not Model fields like `count`.

**Q02 decided A.** Host uses the Program. Starting / Failed / Ready is the Instant session gate only. `ReadyWindow { count }` may project the number. It may not grow `selectedId` or pick the page.

**Q112 decided D.** Gospel Counter stays one page. New example “counter with settings” composes the core Counter Program (delay + Settings). `examples/counters` composes that same core. No navigate-then-send. Same Message may leave from more than one URI. Catalog is the taxonomy of Actions. What `send` means is Q113.

**Q113 decided A.** Destination `send` / `offer` is what the page presents. Not permission. Program may accept Increment on Settings. Agent may dispatch a Message this page does not show. C’s `destinations` field on each Action is refused (syntax of that drift is in qanda Q113).

**Q114 decided (not C).** Never `AgentRequestedIncrement`. No `IncrementButtonTapped` in the catalog. The Program updates on `Increment`. They want how it arrived (button, menu, agent, remote). A wrapper only for the agent does not record button versus menu.

**Q115 decided A.** `via` is an ADT on the Message: Button `{ text, uri }`, ActionMenu `{ query, uri, maybeHighlighted }`, Agent `{ question, uri, maybeDurationMs }`. Not Remote. Analytics. `update` does not branch. `actor` stays who (Authenticated / Guest / System). Envelope B was the analytics-only home; they chose A.

**Q116 decided A.** Every catalog Action requires `via`. Same ADT. They did not reopen Q115 to B.

**Q122 decided A.** Add `Keyboard { key, uri }` and `Cli { argv, uri }`. A keydown and a CLI argv are not Button. Stamping Button would lie. Via keeps how the fact arrived.

Chat is **Q118**, still drawing board. Code trace is under Q118: gospel React + is `productView` token → `paintReact` → `sendScreenToken('increment')` → `Increment()`. `App.tsx` does not call `incrementButtonTapped`. That handle is a second wire on the same `createProgramHooks`.

Q03+ Multiple Counters questions are messy and still deferred. Skip them while reading.

## 2026-08-26 dictation (decoded)

Gospel is `examples/counter`, not Multiple Counters. Program owns logic, `screen`, and a Message catalog (`md` + `actions`). Action menu is sibling state via `compose.actionMenu`. Local `update` is immediate and offline. Peers fold through the same `update`. Catch-up: **Q86 A** / **Q103 A**. Snapshot is a cache, the Message log is the law. Robustness is a harness: Instant disconnect as a dependency knob, many runs. **Observed failure:** two apps disagree **at startup** until Reset or close/reopen (Foldkit GUI and counter-swift / TCA 2). Not only long-running drift. Increment is the minimum case; Counter stays the basis. Instant `getLocalId(name)` is a UUID in the Instant KV store (`localToken_${name}`). Same after refresh. **Shared by every tab** of that origin+appId. **New UUID if storage is wiped / app reinstalled.** Not a running-instance id. Foldkit browser Counter already uses `host-${uuid8}` per load. CLI/TUI/Swift often omit `instance` and collide. Q106 A (`host-instance`); Instant localId is not `from`. **Q107 A:** per-run/per-window `from`, mandated in TS/Swift/Rust. Bare surface tokens (CLI, TCA 2, Swift) match the off-by-one / off-by-N at startup. Hydration is Message id + snapshot watermark, not `from`. Boot watermark is **Q108**. Today `messagesSinceSnapshot` uses `createdAtMs >= snapshot.at` — possible extra fold of the snapshot’s own write. Quorum 1 recommended **D** (whole-log from init). Human rejected that. Quorum 2 recommends **E** (`included` id set). Still `asking`. Ideas live in this folder (`intentions.md`). Do not abstract ahead of need. Layout: Program may describe a host-neutral atomic tree (`productView` / `counterScreen`); engines like Expo `paintScreen` draw it. Keep that path **and** host-authored paint. Q104. Does not block Q103.

## Spirit asked

One core Program owns navigation, business logic, and synchronization. Adapters paint. Reuse existing Swift Navigation and rust-navigation. ASCII layers may still be needed. FFI through Kotlin/Swift was requested without product questions about native stacks.

## What landed

### Foldkit (`077afe4a3`, `ml/exploring-view-agnosticism`)

- `Program.compose.forEach` + `GotChild` on Multiple Counters. Domain add/delete stay field-owner Messages. This matches the composition spirit.
- `Program.screen` exists on the **single** Counter (`examples/counter`). Multiple Counters **has no `screen`**. Hosts match `Destination` or Instant `ReadyWindow`.
- Instant `ReadyWindow` is a second, lossy Model: `selectedId?` + `count?`. Fact and delete exist on the Program and in the URI table; Instant React/Expo/Vue/Svelte do not paint them.
- Production Instant React `App.tsx` stores URI in `useState` and ignores `presenter`. React-A/B destination paint is unused.
- Core exports two `update`s. `story.test.ts` calls the field-owner one with `GotChild` and dies.
- ADR 0010 `makeUriSync` landed; no example calls it. `makeApplication` integration still pending.
- Leftover payments / dual-camera / counters server documented in the change log. Different mains.
- `examples/instant-counter` v3 `programScreen.tsx` still reads `counter.counter.count` after rows renamed the payload to `child`.
- `compose.forEach` does not copy `child.screen` onto the parent Program (`compose.ts` `make({ id, version, Model, Message, init, update })` only). Parent authors its own screen.
- Leftover Program: `leftoverUnclosableIssueIds = 240, 241, 242, 243` — Closed is unrepresentable on those ids.

### Rust (`1fd1bb3`, `technoplato/tca-rust-port` main)

- `foldkit-nav` is on main (URI, carrier, instruction diff). Sibling `rust-navigation` is the Point-Free Swift Navigation port (`AlertState`, `UIBinding`, `UINavigationPath`). They are not substitutes. `Agents.md` still says the sibling is “the sole navigation implementation.”
- UniFFI `CountersController` + JSON snapshots + `FfiNavigator` exist. Swift `@main` is `TranscriptionStressView`. Android `NavHost` routes Counter / Speech / Location — **not** `CountersScreen`.
- Swift `FfiNavigator` push/pop are no-ops (“NavigationStack derives from snapshots”). Android push/pop are commented stubs.
- UniFFI Counters uses `SimulatedFactClient`, no Instant. CLI/TUI `--instant` on counters-nav writes **`counter_rows`** into FoldkitCounterV01, which is the snapshot-log app (`count` + `message`). Those are not the same tape.
- Tutorial `CounterStore` (UniFFI / WASM / `examples/counter`) is a second Increment/Decrement/Reset core, not `counter-core-example`.
- `ios-app/DerivedData-device/` is on disk and **not** gitignored (`DerivedData/` is).
- `technoplato/tca-rust-port` and `technoplato/TCA26` 404 unauthenticated (private). `develop` on rust still points at `c3a0fa3`.

### counter-swift (`f5cb1a6`, `technoplato/counter-swift`)

- Live path is `CounterFeature` + snapshot-log on FoldkitCounterV01. CLI `show` / `do` / `live` match Foldkit `npm run count` gospel **when `processorID` is passed into State**.
- `CountersFeature` + InstantTape (`foldkitMessageProposals`) remain tests-only. Boot still constructs unused `makeStore`.
- `f5cb1a6` commit message: iPhone and iPad distinct live processor IDs. Code only threads the id into **bootstrap** (SQLite cache name). `CounterRootView` still does `CounterFeature.State()` → Message `from` is `"counter-swift-ios"` on iPad too.
- `counterScreen` / `PaintedScreen` is the one layout. SwiftUI and ANSI both paint it. That is the right adapter shape.
- TCA 2 via absolute path `/Users/laptop/Sync/tca/canonical/TCA26`. Do not push to pointfreeco. tvOS is offline because Instant authorizer does not compile.

## Delete vs polish (candidates; lock in Qs)

| Surface                                  | Why it is a candidate                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Instant `ReadyWindow.selectedId`         | Second navigation Model                                                |
| Host `useState` URI beside Model         | Third Model                                                            |
| Unused React `presenter` prop            | Documented lie                                                         |
| Dual exported `update`                   | Lying public API                                                       |
| UniFFI Counters not on `@main` / NavHost | Looks shipped; is not                                                  |
| `FfiNavigator` no-op push/pop            | Callback without a job                                                 |
| `counter_rows` on FoldkitCounterV01      | Wrong protocol on the gospel app                                       |
| Tutorial `CounterStore`                  | Second Counter domain                                                  |
| `CountersFeature` on live counter-swift  | Second Program in one package                                          |
| InstantTape `actor: String`              | Not Foldkit `Authenticated \| Guest \| System`                         |
| Action menu `r` while Open               | Declared Action keys still send; cannot type `r` to filter Reset (Q91) |

## Instant leftovers (catalog truth)

Do **not** close from this ADR: #240 Puzzle (partial), #241 Songbook (partial, hold 0.150 TextInput), #242 Gate (blocked public 502), #243 Casino (blocked no receive address), #244/#245 partial.

## Gospel candidates (lock in Q00 / Q60)

1. **Single Counter** on FoldkitCounterV01 (`5417c2e3-c6b9-476d-a962-2e11c83492aa`): Foldkit `examples/counter`, counter-swift `CounterFeature`, a Rust Counter adapter that is not on V01 yet.
2. **Multiple Counters** as the navigation proof: `examples/counters`, rust `counters-nav`, later Swift Navigation collection.

These are different Instant schemas and different Programs. Picking both as “the gospel this week” is how the last four days drifted.

## 2026-08 recovered record (Delta thread; worktree copy died, re-landed here)

The Cursor chat was recovered into Delta at Q118 (code trace of Increment). Since then: ideal-syntax proposal (critique: one fact had three construction sites; six derivable adapter slots handwritten; via (Q115/Q116) unstampable because no Model field holds the destination; labelOf leaks presentation; mutate/sideEffects prose lies; lastScreenTag singleton; two Processors per binding). Review comments answered; forks Q119-Q125 filed. Canonical v2 delivered: full Counter + Gallery + framework utilities fence (`overviews/q118-canonical-counter-gallery.md`). Root `glossary.md` created; CLAUDE.md linked to AGENTS.md with the concrete-examples rule; `document` skill at `.agents/skills/document/SKILL.md`; comment-above-never-beside rule in AGENTS.md.

Their review decisions folded in: modes are dead (Settings is a route; edit machines are Model ADTs); no raw strings at mount sites (child-owned branded slug); flat app Model with projectDomain-style sync projection (no `product` nesting); explicit named root route; focus is global chrome; agents see every mount's catalog from anywhere; books syncs; today's `examples/showcase` is explicitly non-canonical (scene switcher: empty scene structs, hand-mirrored urlToNavigation/navigationToPath, hardcoded /showcase prefix).

**Upstream probe:** `foldkit/foldkit` main `e13c3a07` is 1600 commits ahead of this branch's merge-base (`8c3885ec` "add bidirectional parsing for router"). Fork origin main is `d89f48de`. Relevant recent upstream ergonomics: composable click controls (#1196), focus boundary attributes (#1195), derived parent OutMessage from foldOutMessage (#1147), popover arrow (#1125), oxlint rejects empty parent OutMessage mappers (#1172). Plan a dedicated upstream sync before the catalog derive lands. Probe ref: `refs/remotes/upstream-probe/main` (on the machine where the probe ran).

The `adr-decision-qanda` skill lives at `~/.codex/skills/adr-decision-qanda/SKILL.md` on the laptop only; its operative rules are restated in this folder's AGENTS.md and "How answers land".
