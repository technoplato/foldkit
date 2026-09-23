# View-agnostic audit | Counter and Counters on main

**Status:** audit of `main` at `e85066ac7`, taken September 22, 2026. Rubric:
`PRINCIPLES.md` (draft, same date) and `CONSTITUTION.md`. The host-level audit
in `counters-view-agnostic-client-audit.md` (August 25, 2026) stays valid for
its scope; this one is about the architecture across both examples.

Evidence labels: **Verified** means a typecheck, a test run, or a traced code
path confirmed it. **Plausible** means the code implies it but nobody
reproduced it.

**Follow-up, September 23, 2026:** branch `claude/canonical-counter` acts on
this audit for the Counter. The Counter core, its seven hosts, and the
headless tail typecheck and pass. The legacy react-bindings client stays only
for react-native-showcase. The Catalog (`Enabled | Disabled` included) is the only
place Actions are declared. The action menu is a presented `NavigationStack`
destination. Hosts drive the Program through `Interaction.bind` and generic
adapters instead of hand-written key maps and handles. Mirror, SharedDomain,
and Follow are synchronization modes. Still open from this audit: Counters
navigation and adapters, Puzzle, `via` (it changes the wire that counter-swift
reads), and a React Navigation carrier.

## Summary

1. **`main` does not build.** `@foldkit/instant` has one type error, the Counter
   core has 22, and six Counter core tests fail. Most of it comes from merge
   `573c6e617`, which interleaved two incompatible named-share designs. Green
   typechecks elsewhere were hiding this because downstream packages compiled
   against build output from August 25 and September 11.
2. **The Program is renderer-free, but its projections are not first-class.**
   The Action catalog, key map, screen, and navigation are hand-derived per
   example (`factHandles.ts`, `actionMenuKeys.ts`, `parseArgv.ts`,
   `navigatorInstructions.ts`), so "define once" breaks at every host.
3. **Combinators compose only the fold.** `compose` and `forEach` drop `valid`
   and `screen`, so a composed Program loses its menu rows and screen.
   Counters works around this by overriding the `forEach` result field by
   field.
4. **Navigation has good primitives and no adopters.** `NavigationStack`,
   `PresentationStyle`, and `stackInstructions` are well built and tested,
   but no example uses them. There are two competing adapter seams, the React
   bridge desynchronizes on browser Back, and React Native has no navigator
   at all.
5. **Seven decided ADR 0011 questions are not in code yet** (Q87, Q91, Q110,
   Q111, Q115, Q116, Q122). `glossary.md` describes `Catalog.make`, `via`,
   and `Enabled | Disabled` as if they exist; none of them do.

## Build and test snapshot

Typecheck ran against freshly rebuilt dependencies (`foldkit`,
`@foldkit/instant`, `@foldkit/react`, both example cores, `instant-host`, and
both `react-bindings`).

| Package                  | Typecheck | Tests                                  |
| ------------------------ | --------- | -------------------------------------- |
| `packages/instant`       | 1 error   | not run                                |
| `examples/counter/core`  | 22 errors | 101 passed, 6 failed                   |
| `examples/counter/*`     | 8 errors  | not run (cli 3, foldkit 4, headless 1) |
| `examples/counters/core` | 1 error   | 82 passed (vitest skips types)         |
| `examples/counters` root | 3 errors  | not run                                |
| other counters hosts     | clean     | not run                                |

Workspace note: before this audit, 447 of 460 `node_modules` links pointed at
a deleted worktree (`~/Development/foldkit-nav-sync-df7c`). A fresh
`pnpm install` fixed it. `pnpm` still exits non-zero because the `sharp`
build script is not approved (`pnpm approve-builds`).

## What is working well

- **Renderer-free Program type.** `packages/foldkit/src/program/program.ts`
  keeps Model, Message, init, update, and screen free of any renderer.
- **Schema-enforced invariants.** `examples/counters/core/src/model.ts` checks
  unique ids, lifetime limits, and "detail names an active counter" in the
  Schema itself (Constitution VII).
- **Stale-result discipline.** Counters carries `presentationId`,
  `requestId`, and `confirmationId` so late fact results cannot land on the
  wrong presentation (Constitution IV.8).
- **Navigation vocabulary.** `packages/foldkit/src/navigation/structure.ts`
  makes an empty stack unrepresentable, gives presentation styles payloads
  (`Drawer({ from })`), and proves `apply(diff(a, b), a) == b` in 510 lines of
  tests.
- **One screen, many painters.** Counter's `counterScreen` is painted by
  React, Expo, Svelte, TUI, OpenTUI, and the CLI from one tree.

## Findings

### P0 | `main` does not build (Verified)

- `packages/instant/src/snapshotLog/snapshotLog.ts:344` returns an `Option`
  from `Array.filterMap`, which in Effect 4 expects a `Result`. Introduced in
  `ff0429cb5`.
- Merge `573c6e617` took `update.ts`, `startLive.ts`, `message.ts`, and the
  tests from the named-share branch (`972fa1cdc`) but kept `model.ts`,
  `share.ts`, `wire.ts`, and `path.ts` from the other parent. The two sides are
  different designs, not one design missing a hunk:

  |        | Design A (on `main` now)        | Design B (`972fa1cdc`)                         |
  | ------ | ------------------------------- | ---------------------------------------------- |
  | URI    | `/kitchen`                      | `/counter/kitchen`                             |
  | Grants | CLI-local `shareLedger.ts` file | `owner` / `granted` on the Instant count row   |
  | Model  | unchanged                       | `maybeShareName`, `maybeOwner`, `maybeGranted` |

  Example failure: `update.ts:19` writes `maybeShareName` into a Model that
  does not declare it, and `path.test.ts` expects `/counter/kitchen` while
  `path.ts` prints `/kitchen`.

- `examples/counters/core/src/interactionGraph.ts:210` matches Counter
  Messages exhaustively and breaks because Counter's union grew
  (`OpenedNavigation`, `SharedNamedCounter`). See "Higher-order composition".
- `examples/counters/src/server.ts:22-23` imports `./render.js` and
  `./surfaceLabel.js`, which only exist under `examples/counters/datastar/`.
  It is an orphan copy of the Datastar server. `examples/counters/src/main.ts:67`
  reads `reason` from `FailedCounterFact`, which now has `cause`.
- `examples/counter/cli/src/daemon.ts:156,187` call functions with the wrong
  argument count. `examples/counter/foldkit` and `headless` tests build Models
  from plain `{ count }` objects instead of `Model.make`.
- **Process gap:** downstream packages typecheck against `dist/`, and stale
  `dist/` cuts both ways. Against Counter's September 11 build, counters core,
  `counter/foldkit`, and `counter/headless` looked clean while their real
  errors were hidden, and `counter/cli` showed 17 errors of which 3 are real.
  Against the August 25 `instant-host` build, every counters host showed false
  errors. CI must build dependencies before typechecking examples, or examples
  must resolve sibling packages from source.

### Define once

- **Counters declares each destination in at least five unions.**
  `Navigation` (`model.ts:99-111`), `NavigationTarget` (`message.ts:15-37`),
  `NavigationOpening` (`message.ts:40-69`), route cases (`route.ts:15-19`), and
  `NavInstruction` (`navigatorInstructions.ts:13-50`). The React bridge adds a
  second `instructionPath` (`react/src/routerBridge.ts:31-45`) and React Router
  repeats the paths (`reactRouterMain.tsx:79-91`). Adding one destination
  touches about ten files.
- **Counter hand-derives what the catalog should derive.** `factHandles.ts`
  names every Action. `listActions.ts` reshapes `Program.valid`.
  `actionMenuKeys.ts` routes keys. `product.ts:7-12` special-cases Reset by
  identity for its label. `window.ts:265-268` checks `token === 'reset'`.
- **The CLI retypes the Program.** `cli/src/parseArgv.ts` hardcodes the host
  list already declared as `HostId` (`core/src/hostSurface.ts:31-42`) and the
  help text "Send increment, decrement, or reset" (line 318). Its `via` is a
  third vocabulary (`'token' | 'palette' | 'spoken'`).
- **Two wire strategies.** Counter hand-writes tag strings with prefixes and
  JSON (`core/src/wire.ts:132-205`). Counters uses the versioned event registry
  (`counters/core/src/wire.ts`). The Message Schema already knows how to
  encode itself.

### Higher-order composition

- **Combinators drop projections.** `compose` builds
  `make({ id, version, Model, Message, init, restore, update })`
  (`compose.ts:280-288`) and `forEach` the same without `restore`
  (`compose.ts:669-676`). `valid`, `screen`, subscriptions, ports, and
  synchronization are lost. `actionMenu` lifts `valid` and `screen`, but for
  exactly one child.
- **Counters overrides `forEach` wholesale** (`counters/core/src/program.ts:89-108`):
  new Model, Message, init, restore, and update. It then re-decodes at runtime
  to recover types: `SchemaParser.decodeUnknownResult` in `updateFields`
  (lines 43-49) and `S.decodeUnknownSync(Message)` on every Command Message
  (lines 56-64). The second one throws on failure inside Command mapping.
- **Host concerns leak through composition.** Counter's Message union carries
  CLI and Instant occupancy (`OpenedNavigation({ device, path })`,
  `SharedNamedCounter`) in `core/src/message.ts:63-88`. Every Program that
  composes Counter now inherits them. That is why counters broke.
- **The action menu discovers dispatch by duck typing.** `actionByTokenOf`
  (`actionMenu.ts:315-333`) looks for an undeclared `actionByToken` property.
  A Program without it gets a menu whose selections silently do nothing.
- Library code in `compose.ts` and `actionMenu.ts` uses `switch`, `findIndex`,
  `rows[index]!`, `readTag` if-chains, and casts. These are the combinators
  every app depends on, and they are where type inference is lost.

### Universal by default

- **The core package knows its hosts.** `hostSurface.ts` lists every host,
  their files, and GitHub URLs pinned to the stale
  `ml/exploring-view-agnosticism` branch (line 11). `show.ts` is the CLI
  renderer. `actionMenuKeys.ts:193-204` sniffs React Native.
- **`process.env` as a side channel.** `startLive.ts:68-78` writes
  `process.env['COUNTER_COUNT_ID']` so `wire.ts:52-67` can read it back.
  `activeCountId()` runs inside the snapshot encoder on every persist.
  Plausible: in a browser bundle without a `process` global this throws.
  Node-based tests cannot catch it.
- **The wire fails open (Verified).** `wire.ts:204` decodes any unknown tag as
  `Increment()`. `wire.ts:190-192` decodes any direction that is not `Up` as
  `Down`. Example: an older client reading a `SharedNamedCounter` row counts
  it as a +1. Constitution II.4 requires rejecting unknown payloads.
- **Chrome is synced as domain (Verified).** Every child Message is persisted
  (`sync.ts:480-484`), including every action menu keystroke. Meanwhile
  `actionMenu.ts:549-551` closes an open menu on any non-menu Message.
  Example: Bob types `res` in the menu on his laptop; Alice presses `+` on her
  phone; Alice's Increment folds on Bob's laptop and closes his menu. Occupancy
  (`maybeDevice`, `maybePath`) also lives in the product Model and the
  durable count row.

### Ergonomics

- **`@foldkit/react` uses module globals.** One registry keyed by path tag
  (`programHandle.ts:105`) and a `lastScreenTag` singleton that decides which
  Program receives `sendScreenToken` (`hooks.ts:94-133`). Two screens on one
  page send to whichever rendered last.
- **Two runtimes per binding.** `getScreenHandle` starts a second handle when
  none is installed (`programHandle.ts:202-215`), which is a second Processor
  for the same Program in the same window.
- **Local Programs see sync gates.** `useModel` always returns
  `SyncedModel` (`Starting | Failed | Ready`), even for a Program with no
  engine. The glossary says such a Program can never be Starting.
- **Inline selectors re-subscribe.** `useModel(path, selector)` puts the
  selector in memo dependencies (`hooks.ts:61-74`). An inline selector that
  returns a fresh object makes `useSyncExternalStore` see a new snapshot
  every read.
- **A second runtime in the core.** `window.ts:159-294` is a hand-rolled
  runtime beside `Runtime.start`, with its own memory tape that folds update
  by hand (`window.ts:124-146`) and a lossy `ReadyWindow { count }` model.
- **Counters React still has the three Models ADR 0011 flagged.** `useState`
  URI (`react/src/App.tsx:30`), `ReadyWindow.selectedId`
  (`App.tsx:79`), and an unused `presenter` prop (`App.tsx:28`). `App.tsx`
  never paints the fact alert or the delete confirmation.

### Navigation

- **Nothing adopts the library stack.** No example uses `NavigationStack`,
  `stackInstructions`, `makeUriSync`, or `reactNavigationPlugin`. `Program`
  has no `navigation` field (`program.ts:65-111`), so ADR 0010 is unfinished.
- **Two seams, two policies.** `plugin.ts:87-124` maps a Dialog push to
  `PresentPath` and a non-Push `ReplaceTop` to `Dismiss` plus `PresentPath`.
  `runtimeSeam.ts:69-94` maps every push to `history.push`. The seam's
  `stackOf(model: unknown)` is untyped (`runtimeSeam.ts:37-41`).
- **Four translation layers in the React bridge.** `NavInstruction` becomes
  `StackInstruction<string>` becomes `NativeCall` becomes `WebRouterPort`
  (`routerBridge.ts`). Using `string` as the Destination erases the type ADR
  0009 wanted to keep.
- **Browser Back desynchronizes (Verified by code path, not reproduced in a
  browser).** `useCarrierReconciliation` (`reactRouterMain.tsx:41-65`) is a
  second navigation state machine. Scenario: on `/counters/counter-c1` the
  user presses Back. The hook calls `actions('/counters').back()`, which
  returns early because the list URI has no selected counter
  (`instant-host/src/window.ts:285-291`). The Program still says
  `CounterDetail`; the page paints the list from the URI. The user opens
  `counter-c2`; the Program emits Pop then Push, and the port runs
  `router.navigate(-1)`, leaving a history entry the user never meant to
  leave. Back and forward across `/fact` and `/delete` are ignored entirely,
  because `programPath` drops the mode (lines 45-51) and only
  `CounterDetailTarget` is handled (line 60).
- **React Native has no navigator.** `examples/counters/expo` depends on
  neither React Navigation nor expo-router. The URI is `useState`
  (`expo/src/App.tsx:254`). Swipe-back and the Android back button never
  reach the Program. `expoRouterCodegen.ts` generates files nothing uses.
- **Latent plugin bugs.** Web `SetRoot` prints the root while entries remain
  presented (`plugin.ts:94-100`), so the URL can show the root under a visible
  detail. React Navigation maps `ReplacePath` to Back plus push
  (`plugin.ts:185-196`), which pops the top entry instead of replacing the
  root. A path that fails to parse is dropped silently (`plugin.ts:162-171`).
- **The mount law is not implemented.** The glossary promises
  `/counters/counter/c1` with zero new child declarations. Counters
  hand-declares `/counters/:counterId` (`route.ts:21-41`), and Counter's own
  routes (`/counter`, `/counter/increment`) do not nest.

### Action menu

- **Focus is an index** (`actionMenu.ts:32-35`), not the Focus ADT from Q110
  and Q111. An index goes stale when a peer's Message changes the catalog.
- **Selection is a string token** (`ActionCommandMenuSelectionMade({ token })`
  at lines 70-77), painted as `action-menu:${token}` (line 360) and parsed
  back by prefix (lines 609-626).
- **Focus is baked into label text.** `menuLabel` prefixes `> `
  (lines 335-345), so painters cannot style focus or expose `aria-selected`.
- **Key routing lives in the example** (`counter/core/src/actionMenuKeys.ts`),
  against the smells.md law. `r` while Open still sends Reset instead of
  filtering (Q91), and j and k do not move focus.
- **The menu is appended, not presented.** Its screen is a Column under the
  product (lines 571-581). There is no Dialog or Popover semantics, no focus
  trap, and no accessible role (Constitution XIII).
- **Filtering matches only the token** (lines 274-287), not `what` or
  `spoken`.

### Security boundary (Verified)

`InstantSnapshotLogPermissions` (`snapshotLog.ts:143-160`) allows anyone to
view, create, and update every `count` and `message` row, and the query reads
every row and filters in process (`snapshotLog.ts:162-166`). Two consequences:

- Named-share access ("Carol cannot occupy kitchen") holds only for honest
  clients, under either design.
- Message rows are updatable, so the log the glossary calls "the law" is not
  append-only.

Constitution XVII.2 applies: state this limitation where the named-share
feature is documented until Instant rules enforce it.

## Recommendations

### Target shape

One Program declares four projections, every combinator lifts all four, and
every adapter interprets them generically.

```ts
// examples/counters/core/src/navigation.ts (sketch)
export const CounterList = ts('CounterList')
export const CounterDetail = ts('CounterDetail', { counterId: CounterId })
export const CounterFact = ts('CounterFact', {
  counterId: CounterId,
  requestId: CounterFactRequestId,
})
export const DeleteCounter = ts('DeleteCounter', {
  counterId: CounterId,
  confirmationId: DeleteCounterConfirmationId,
})
export const Destination = S.Union([
  CounterList,
  CounterDetail,
  CounterFact,
  DeleteCounter,
])

export const navigation = Navigation.make({
  Destination,
  router: Route.oneOfCases(/* one case per Destination, via caseOf */),
  styleOf: M.type<Destination>().pipe(
    M.tagsExhaustive({
      CounterList: () => Push(),
      CounterDetail: () => Push(),
      CounterFact: () => Dialog(),
      DeleteCounter: () => Dialog(),
    }),
  ),
  stack: {
    get: (model: Model) => model.navigation,
    set: (model: Model, stack) => evo(model, { navigation: () => stack }),
  },
})

export const CountersProgram = Program.make({
  // ...Model, Message, init, update
  catalog,
  navigation,
  screen,
})
```

What each adapter becomes:

- **Web (React Router, TanStack, plain history):** one splat route renders the
  Program. The adapter reads the location, applies stack diffs, and reports
  carrier moves as a fact such as `ChangedNavigation({ stack })`. Echo is
  impossible because the adapter compares the carrier with
  `printStack(stack)` before acting.
- **React Native (React Navigation):** map `NavigationStack` to React
  Navigation state (`{ index, routes }`). Program to carrier: push or pop for
  one-step diffs (native animation), `reset` otherwise. Carrier to Program:
  `onStateChange` reports swipe-back and hardware back. `styleOf` maps to
  screen options (`Dialog` to `transparentModal`, `Sheet` to `formSheet`).
  The `linking` config is generated from the router. Prefer this over
  expo-router, whose file tree fights state-driven navigation; if expo-router
  stays, use one catch-all `app/[...path].tsx`.
- **CLI:** `counters open /counters/counter-c1` parses through the same
  router; `counters back` is a Pop; `counters do increment` comes from the
  catalog; `counters show` paints `screen`. `effect/unstable/cli` can derive
  the commands from the catalog Schemas.

The same model fixes the action menu: it becomes a presented entry
(`Presented(ActionMenu, Dialog)`), so React paints a dialog, React Native a
modal, and the CLI a prompt, all from one declaration.

### Sequenced plan

**P0 | Make `main` green and honest (about a day).**

1. Fix `snapshotLog.ts:344` (return a `Result`).
2. Pick one named-share design and restore it wholesale. Recommended: Design B
   (`/counter/kitchen`, grants on the row every client can read). Reserve
   Action names so a share called `increment` cannot collide with
   `/counter/increment`.
3. Fix `interactionGraph.ts:210`, the counters root (delete the orphan
   `src/server.ts`, change `reason` to `cause`), the CLI argument counts, and
   the tests that bypass `Model.make`.
4. Make CI build dependencies before typechecking examples, so a stale `dist/`
   can never hide breakage again.
5. Make `wire.ts` fail closed on unknown tags.

**P1 | One navigation seam (your main ask).**

1. Add typed `navigation` to `Program` (finish ADR 0010) and merge the two
   seams into one adapter contract: read carrier, apply diff, report carrier
   moves.
2. Migrate counters to `NavigationStack` plus one router, and delete
   `NavigationTarget`, `NavigationOpening`, `NavInstruction`, `Navigator`, and
   the bridge translation. Keep "at most one dialog over a detail" as a Schema
   filter on the Model, since a generic stack could otherwise represent a
   dialog over a dialog.
3. Ship the web adapter in `@foldkit/react`, with browser Back and forward
   tests across `/fact` and `/delete`.
4. Ship a React Navigation adapter and wire `examples/counters/expo` to it.
5. Add `open` and `back` to the counters CLI through the same seam.

**P2 | Catalog and action menu (define once for Actions).**

1. `Catalog` in `foldkit` with typed entries, `Enabled | Disabled({ because })`
   (Q87), and `via` stamped by adapters (Q115, Q116, Q122).
2. Rebuild `actionMenu` on the catalog: Focus ADT (Q110, Q111), key routing
   in core (Q91), selection by Action rather than token, local-only (not
   synced), and closing only on its own selections.
3. Derive React components and hooks (`<IncrementButton />`, Q118) and CLI
   `do` subcommands from the catalog. Delete `factHandles.ts`,
   `listActions.ts`, and `actionMenuKeys.ts`.

**P3 | Composition and sync hygiene.**

1. Make `compose` and `forEach` lift `catalog`, `navigation`, and `screen`,
   then add mounting with child-owned slugs so `/counters/counter/c1`
   composes.
2. Redesign `forEach` so counters can use it without overriding it (parent
   owns add and delete; `forEach` routes child Messages and lifts
   projections).
3. Move occupancy to Instant presence, which keeps `maybeDevice`, `maybePath`,
   and `OpenedNavigation` out of Counter's Model and Message union.
4. Replace `@foldkit/react`'s registry with a Provider, give one handle per
   Program, and type `useModel` by whether the Program has an engine.
5. Move host concerns out of `counter-core-example` (`hostSurface.ts`,
   `show.ts`, keydown sniffing, env reads).
6. Enforce named-share access and append-only messages in Instant rules.

## Open decisions for the owner

1. Which named-share design wins: `/kitchen` or `/counter/kitchen`?
2. Should occupancy stay durable domain state (today's L8 behavior) or move to
   presence?
3. React Native: React Navigation directly, or keep expo-router with a
   catch-all route?
4. Is `PRINCIPLES.md` a separate file, or should its principles become
   Constitution articles?
