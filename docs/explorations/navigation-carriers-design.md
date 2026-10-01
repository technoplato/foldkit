# Foldkit navigation: one Program, five carriers

**Status:** design proposal, October 1, 2026. Read-only review of branch `claude/platform-adapter-packages` at HEAD `0af7e7225`. Nothing in the repository was changed.

## How to read the citations

Every path below is absolute through one of these aliases:

- `FK` = `/Users/laptop/Development/foldkit`
- `RR` = `FK/node_modules/.pnpm/react-router@8.3.0_react-dom@19.2.3_react@19.2.3__react@19.2.3/node_modules/react-router/dist/development`
- `NAV` = `FK/node_modules/.pnpm/@react-navigation+native@7.3.14_react-native@0.86.2_@babel+core@7.29.7_@types+react@19.2.17_react@19.2.3__react@19.2.3/node_modules/@react-navigation/native`
- `CORE` = `FK/node_modules/.pnpm/@react-navigation+core@7.21.11_react@19.2.3/node_modules/@react-navigation/core`
- `ROUT` = `FK/node_modules/.pnpm/@react-navigation+routers@7.6.4/node_modules/@react-navigation/routers`
- `NS` = `FK/node_modules/.pnpm/@react-navigation+native-stack@7.18.6_@react-navigation+native@7.3.14_react-native@0.86_c24105292b7e392d23e0ad20e6c33282/node_modules/@react-navigation/native-stack` (this is the copy linked to react-native 0.86.2)
- `SCR` = `FK/node_modules/.pnpm/react-native-screens@4.26.2_react-native@0.86.2_@babel+core@7.29.7_@types+react@19.2.17_react@19.2.3__react@19.2.3/node_modules/react-native-screens`
- `RN` = `FK/node_modules/.pnpm/react-native@0.86.2_@babel+core@7.29.7_@types+react@19.2.17_react@19.2.3/node_modules/react-native`
- `OT` = `FK/node_modules/.pnpm/@opentui+core@0.5.4_typescript@6.0.3_web-tree-sitter@0.25.10/node_modules/@opentui/core`
- `ER` = `https://github.com/expo/expo/blob/sdk-57/packages/expo-router` (Expo Router is not installed, so these are GitHub links)

**Line numbers.** Repo line numbers are from HEAD `0af7e7225`. Some code exists only in the working tree, such as the untracked `FK/packages/foldkit/src/session/`; those citations are marked **(WT)**. Someone else edited `program.ts`, `actionMenu.ts`, `start.ts` and `session/` while I worked, so WT numbers may have moved.

**Evidence.**

- The core algorithms were prototyped and run under `/tmp/navproto/`. It imports the built `FK/packages/foldkit/dist/route/parser.js` and `navigation/structure.js`.
  - `scenarios.ts` passes all 20 print and parse cases plus 7 carrier scenarios.
  - `api/navigation.ts` and `api/counter.ts` type-check the proposed signatures and the canonical Counter declarations with the repo's strict compiler flags.
- Library behavior was checked against installed sources, with probe scripts under `/tmp/rr-carrier-probe`, `/tmp/rn-nav-probe`, `/tmp/opentui-probe` and `/tmp/expo-router-research` (a sparse clone of `expo/expo` at `sdk-57`).
- What remains unverified is listed in section 8 and in the test plan.

---

## 0. Decisions in one page

1. **State stays as it is.** The Model's `NavigationStack` (root plus styled entries) stays the only navigation state (`FK/packages/foldkit/src/navigation/structure.ts:115-118`). Two laws are added:
   - An entry's identity is its printed path.
   - An entry's style is a function of its Destination.
2. **One navigation declaration replaces the two colliding `ProgramNavigation` types** (`FK/packages/foldkit/src/program/program.ts:76-80` and `FK/packages/foldkit/src/navigation/runtimeSeam.ts:21-42`). It holds the slug, the Destination Schema, the root, one route per Destination case (built from the existing `RouteCase`, `FK/packages/foldkit/src/route/parser.ts:59-62`), and an optional stack lens.
3. **Carriers report only two facts:**
   - `OpenedUri({ uri, via })` for launch, link, deep link, history jump, CLI `open`, or following someone.
   - `NavigatedBack({ uri })` for Back, swipe back, header back, hardware back, modal dismissal, Escape, or CLI `back`.

   Dismissal is a pop (ADR 0009 amendment, `FK/docs/adr/0009-portable-navigation-adapters.md:152-156`).

4. **The whole stack prints to one URI.** Root and pushed or presented entries go in the path; configuration goes in the query. Example: `/counter/session/menu?q=re`. Parsing is total: strict with backtracking first, then lenient with a `NotFound` destination that keeps the attempted segments. A non-canonical URI is adopted, and the carrier is then corrected with a replace.
5. **One generic carrier loop (`runCarrier`) runs against a four-member driver** (`name`, `read`, `perform`, `subscribe`). It:
   - diffs carrier state against the Model's plan by entry key;
   - keeps at most one write in flight;
   - suppresses echoes with expectations and the rule "same URI means no write" (Q92, `FK/docs/adr/0011-one-program-hosts-and-ports/qanda.md:2606-2630`);
   - classifies carrier changes against the Model's plan, not against the carrier's previous state;
   - re-corrects the carrier whenever the Program refuses a move.
6. **Web: the browser history is the carrier.** React Router runs as a _controlled_ `<Router location navigator>`, so its `Link` and `useNavigate` report facts instead of writing history. React Router 8.3.0's `router.subscribe` is marked private, and only the raw history layer exposes the POP delta (section 4.1).
7. **React Navigation and Expo Router share one structural native-stack driver.**
   - Route keys are entry keys, and every change is a keyed `reset`.
   - Expo Router uses one generic `_layout.tsx` plus `[...path].tsx`. It cannot import `@react-navigation/*` (section 4.3), which is why the driver is structural.
8. **OpenTUI** paints the plan and lets the Program's key map turn Escape into `NavigatedBack`. The **CLI** gains `open <uri>`, `back` and `where`, and its daemon keeps the Model between invocations.
9. **Sync:**
   - Navigation Messages keep the `Navigation` category.
   - Remote moves reach carriers only through the Model.
   - A launch URI never moves a Mirror session.
   - Follow-as-presence feeds the leader's URI into the follower's Model as `OpenedUri({ via: Following })`.
10. **Mount law:** a mounted child keeps its own stack inside one parent entry, so `/counters/counter/c1/settings` is `[CounterList, Push CounterAt({ key: c1, stack: [Counter, Push CounterSettings] })]`.

---

## 1. Core model

### 1.1 Navigation state

**Kept as is:** `NavigationStack<D> = { root: D, presented: NothingPresented | PresentingEntries<D> }`, where entries are `{ destination, style }` and `style` is one of `Push | Sheet | BottomSheet | FullScreenCover | Dialog | Popover | Drawer` (`FK/packages/foldkit/src/navigation/structure.ts:59-67, 74-77, 115-143`). It is already Schema-backed, so it decodes, replays and syncs. It is already what `ActionMenu.compose` keeps in the Model (`FK/packages/foldkit/src/actionMenu/actionMenu.ts:502-508`).

**Laws added.** `Navigation.make` enforces them and the tests check them:

1. **Identity is the path.** An entry's carrier key is the printed path (no query) of the stack truncated at that entry.
   - `[Counter, Push SessionSettings, Dialog ActionMenu('re')]` has keys `/counter`, `/counter/session`, `/counter/session/menu`.
   - Query changes are configuration, not new screens. This follows the glossary rule "Identity goes in the path; configuration goes in the query" (`FK/glossary.md:118-120`).
   - Every non-root route must print at least one segment, so keys are unique and prefix-closed.
   - This replaces `stackInstructions`' value equality (`FK/packages/foldkit/src/navigation/structure.ts:296-316`). Under that equality, typing `r` into the menu filter is a `ReplaceTop`, which a native carrier would animate as dismiss plus present.
2. **Style is a function of the Destination.** It is `styleOf(destination)`, declared on the route. The ADR 0009 amendment already says style views derive from destination kind (`FK/docs/adr/0009-portable-navigation-adapters.md:136-138`). React Navigation needs this, because changing a mounted screen's presentation remounts it on iOS (`SCR/src/components/Screen.tsx:126-141, 206`; `SCR/ios/RNSScreen.mm:276-286`). With this law, a key always keeps one presentation.
3. **Suffix law for composed chrome.** Destinations added by an outer combinator always sit above the inner Program's entries. An example stack is `[Counter, Push SessionSettings, Dialog ActionMenu]`, where SessionSettings is added by `Session` and the menu by `ActionMenu`.
   - A combinator strips its suffix before delegating to its child.
   - If the child's stack changes, the suffix is dropped. For example, any product navigation closes the menu.
   - Types stay sound, because a child only ever sees its own Destinations.

**Additions to `structure.ts`.** Today `presentedEntries` is private (`FK/packages/foldkit/src/navigation/structure.ts:162-171`).

```ts
/** The entries above the root, oldest first. */
export const entriesOf: <Destination>(
  stack: NavigationStack<Destination>,
) => ReadonlyArray<Presented<Destination>>

/** The root plus the first `count` entries. */
export const truncated: <Destination>(
  stack: NavigationStack<Destination>,
  count: number,
) => NavigationStack<Destination>

/** True for styles that hide what is beneath them: Push, FullScreenCover. */
export const isOpaque: (style: PresentationStyle) => boolean
```

**Tabs and split views later, without redesign.** Containers become Destination cases whose payload holds nested stacks: the same mechanism as the mount law (section 1.5).

- Example: `Tabs({ selected: 'Home', stacks: { Home: NavigationStack<HomeD>, Search: NavigationStack<SearchD> } })` as the root.
  - The URI prints the selected tab's path, then that tab's stack: `/home/item/42`. Unselected stacks stay in the Model and are not URL-addressable.
  - The carrier plan becomes a tree, `CarrierPlan.container: Option<TabsView>`. React Navigation maps it to a tab navigator with one native stack per tab, the web prints the selected path, and OpenTUI and the CLI print a tab bar.
- `Split({ primary, secondary })` follows the same pattern, with `secondary` in the path after a reserved segment such as `/inbox/m1/(detail)/thread/9`.
- No existing type changes. `NavigationStack` stays the leaf.

### 1.2 The facts carriers send

New file `FK/packages/foldkit/src/navigation/message.ts`:

```ts
import { Schema as S } from 'effect'

import { ProcessorId } from '../processor/processor.js'
import { m, ts } from '../schema/index.js'

// MESSAGE

/** How a URI reached the Program. Analytics, plus Following for presence. */
export const UriVia = S.Union([
  ts('Launch'),
  ts('Link'),
  ts('DeepLink'),
  ts('History'),
  ts('Cli'),
  ts('Agent'),
  ts('Following', { processorId: ProcessorId }),
])
/** How a URI reached the Program. */
export type UriVia = typeof UriVia.Type

/** Someone opened a URI: launch, link, deep link, history jump, CLI, follow. */
export const OpenedUri = m('OpenedUri', { uri: S.String, via: UriVia })

/** A person went back to the entry printed as `uri`: Back, swipe, dismissal, Escape. */
export const NavigatedBack = m('NavigatedBack', { uri: S.String })

/** Every carrier navigation Message. All of them are Navigation. */
export const Message = S.Union([OpenedUri, NavigatedBack])
/** A carrier navigation Message. */
export type Message = typeof Message.Type
```

`ProcessorId` is `FK/packages/foldkit/src/processor/processor.ts:12-18`.

**How the stack owner folds them** (`FK/packages/foldkit/src/navigation/transition.ts`, new):

| Fact                      | Fold                                                                                                                                                                                                 | Example                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `OpenedUri({ uri, via })` | `parseStack(uri)` (total), then `settle(model, stack)`. Under a Mirror session, `via: Launch` is ignored (section 5.4).                                                                              | `/counter/menu?q=re` becomes `[Counter, Dialog ActionMenu('re', focus: OnFilter(best match))]`                      |
| `NavigatedBack({ uri })`  | Truncate to the deepest entry whose key equals the path of `uri`, keeping the Model's own entry values (lower-entry configuration survives). If no entry matches, fold as `OpenedUri(uri, History)`. | Model `/counter/session/menu?q=re` plus `NavigatedBack('/counter/session')` gives `[Counter, Push SessionSettings]` |

**Why there is no separate dismiss fact.** A native dismissal (iOS swipe-down, a backdrop tap, Android back on a modal) removes the top entry, which is exactly "back to the entry beneath". The ADR 0009 amendment rejected imperative dismiss actions for this reason (`FK/docs/adr/0009-portable-navigation-adapters.md:155-156`). The menu's own `DismissedActionMenu` stays as an in-app fact (`FK/packages/foldkit/src/actionMenu/actionMenu.ts:91-92`).

**Why `NavigatedBack` carries the target URI instead of a count.** Under Mirror, a remote push can land while the local user swipes back. A count would pop the wrong entry; a URI names the entry the person returned to.

### 1.3 Declaring Destinations and their parser-printers

**Route additions** (`FK/packages/foldkit/src/route/parser.ts`), extending the exemplar rather than replacing it:

```ts
/** The state a Biparser prints into. Exported so mounts can compose printers. */
export type PrintState = Readonly<{
  segments: ReadonlyArray<string>
  queryParams: QueryParams.QueryParams
}>

/** Matches at the current position without consuming a segment. */
export const here: Biparser<{}>

/** Nests a Biparser's value under one field, so a mount can carry a child value. */
export const field: <K extends string, A>(
  name: K,
  biparser: Biparser<A>,
) => Biparser<Record<K, A>>

/** Splits a relative URI into decoded path segments and its raw search. */
export const splitUri: (
  uri: string,
) => Readonly<{ segments: ReadonlyArray<string>; search: string }>
```

Why each is needed:

- `PrintState` is currently a private type (`parser.ts:35-38`).
- `here` is needed because `Route.root` succeeds only on an empty remaining path (`parser.ts:336-350`), so it cannot be the first route of a stack that has entries after it.
- `splitUri` replaces `program/route.ts`'s `indexOf` sentinel version (`FK/packages/foldkit/src/program/route.ts:153-171`).
- **Encoding fix in the same change.** `param` prints the raw value (`parser.ts:179-183`) and `pathToSegments` never decodes (`parser.ts:108`), so `/counters/counter/a b` does not round-trip. Printing must `encodeURIComponent` each segment, and `splitUri` must decode it.

**Navigation routes** (`FK/packages/foldkit/src/navigation/declaration.ts`, new; type-checked in `/tmp/navproto/api/navigation.ts`):

```ts
/** Where a Destination may sit: the stack's root, above an entry, or anywhere as the fallback. */
export const Placement = S.Literals(['Root', 'Entry', 'Fallback'])
/** Where a Destination may sit in a stack. */
export type Placement = typeof Placement.Type

/** One Destination case, its slug-relative parser-printer, and its stack rules. */
export type DestinationRoute<Destination> = Readonly<{
  routeCase: Route.RouteCase<Destination, any>
  placement: Placement
  styleOf: (destination: Destination) => PresentationStyle
  isAllowedAbove: (below: Destination) => boolean
  titleOf: (destination: Destination) => string
}>

/** Options shared by the route constructors. */
export type RouteOptions<Destination> = Readonly<{
  isAllowedAbove?: (below: Destination) => boolean
  title?: (destination: Destination) => string
}>

/** Declares the Destination a stack can start from. */
export const root: <Destination, Value>(
  routeCase: Route.RouteCase<Destination, Value>,
  options?: Pick<RouteOptions<Destination>, 'title'>,
) => DestinationRoute<Destination>

/** Declares a Destination pushed above another. */
export const push: <Destination, Value>(
  routeCase: Route.RouteCase<Destination, Value>,
  options?: RouteOptions<Destination>,
) => DestinationRoute<Destination>

/** Declares a Destination presented over another with one style. */
export const present: <Destination, Value>(
  routeCase: Route.RouteCase<Destination, Value>,
  style: PresentationStyle,
  options?: RouteOptions<Destination>,
) => DestinationRoute<Destination>

/** Lifts a child's route into a wider Destination union, so combinators never cast. */
export const liftRoute: <Child extends Parent, Parent>(
  route: DestinationRoute<Child>,
  narrow: (destination: Parent) => Option.Option<Child>,
) => DestinationRoute<Parent>
```

**The one declaration** replaces both `ProgramNavigation` types:

````ts
/** The URL word a Program owns, declared once. `counter` in `/counter`. */
export const Slug = S.NonEmptyString.pipe(S.brand('Slug'))
/** The URL word a Program owns, declared once. */
export type Slug = typeof Slug.Type

/** Reads and writes the stack a Model holds. */
export type StackLens<Model, Destination> = Readonly<{
  get: (model: Model) => NavigationStack<Destination>
  set: (model: Model, stack: NavigationStack<Destination>) => Model
}>

/** Whether a carrier records each move as history or replaces in place. */
export const HistoryMode = S.Literals(['Record', 'Replace'])
/** Whether a carrier records each move as history or replaces in place. */
export type HistoryMode = typeof HistoryMode.Type

/**
 * A Program's navigation: its Destinations, their routes, and, once a
 * combinator adds one, the stack its Model holds.
 *
 * @example
 * ```typescript
 * Navigation.make({ slug: Slug.make('counter'), Destination: Counter, root: Counter(), routes: [counterRoute] })
 * // printStack(stackAtRoot(Counter())) === '/counter'
 * ```
 */
export type ProgramNavigation<Model, Destination> = Readonly<{
  slug?: Slug
  Destination: ProgramSchema<Destination>
  root: Destination
  routes: Array.NonEmptyReadonlyArray<DestinationRoute<Destination>>
  stack?: StackLens<Model, Destination>
  screenOf?: (model: Model, destination: Destination) => Option.Option<UiNode>
  settle?: (
    model: Model,
    stack: NavigationStack<Destination>,
  ) => NavigationStack<Destination>
  isDismissible?: (model: Model, destination: Destination) => boolean
  historyOf?: (model: Model) => HistoryMode
  backKeys?: ReadonlyArray<string>
}>

/** Validates and returns a declaration. Throws NavigationDeclarationError at definition time. */
export const make: <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
) => ProgramNavigation<Model, Destination>
````

What the optional hooks are for:

- `settle` recomputes Model-dependent fields that the URI does not carry. Example: after parsing `/counter/menu?q=re`, the menu's `focus` highlight is computed from the Catalog using the existing `opened` and `withQuery` (`FK/packages/foldkit/src/actionMenu/actionMenu.ts:236-262`).
- `screenOf` paints one Destination. Stack carriers keep several screens mounted at once, so `Program.screen(model)` (one tree, `FK/packages/foldkit/src/program/program.ts:34-37`) is not enough.
- `historyOf` returns `Replace` while following someone (section 5.3).
- `backKeys` defaults to `['Escape']`.

**`make` rejects these at definition time:**

- no Root route prints `root`;
- two routes at one placement start with the same literal;
- a product route uses a reserved chrome segment (`menu`, `session`).

These follow canonical v2's "reserved keys boot-asserted" (`FK/docs/adr/0011-one-program-hosts-and-ports/overviews/q118-canonical-counter-gallery.md:51-53`).

**Uses of the declaration.** `Program.navigation?: ProgramNavigation<Model, any>` keeps its field name (`program.ts:138`) with the unified type. `runtimeSeam.ts` is deleted (section 7.2). Its `stackOf(model: unknown)` was the untyped half the audit flagged (`FK/docs/explorations/view-agnostic-principles-audit.md:224-225`).

**The fallback Destination** is library-owned, added by the stack combinator:

```ts
/** The Destination for a URI no route matched; it keeps the attempted segments. */
export const NotFound = ts('NotFound', { segments: S.NonEmptyArray(S.String) })
```

Its route is `Route.rest('segments')` (`parser.ts:373-405`) with placement `Fallback`, style `Push`, allowed above anything. It always parses, so it is tried only in the lenient pass.

### 1.4 Who owns the stack: composition

**New `Navigation.compose`** (`FK/packages/foldkit/src/navigation/compose.ts`). It is the one stack owner. `ActionMenu.compose` and `Session.compose` call the same helper, so every layer behaves the same way:

```ts
/** Adds Destinations and routes to a Program's navigation, creating the stack the first time. */
export const compose: <
  Child extends Program<any, any, any, any, any>,
  Added = never,
>(
  config: Readonly<{
    of: Child
    Destination?: ProgramSchema<Added>
    routes?: ReadonlyArray<DestinationRoute<DestinationOf<Child> | Added>>
    screenOf?: (
      model: NavigationModelOf<Child, Added>,
      destination: Added,
    ) => Option.Option<UiNode>
    id?: string
    version?: number
  }>,
) => NavigationProgram<Child, Added>
```

What the stack owner does:

1. **Model.** The child's fields stay flat, plus `navigation: NavigationStack(Child Destinations | Added | NotFound)`. `navigation` is a reserved field, as in `FK/packages/foldkit/src/actionMenu/actionMenu.ts:494-499`. If the child already holds a stack, the union is widened instead of rejected; today `ActionMenu.compose` throws there.
2. **Message.** The child's Messages plus `Navigation.Message`. The outermost stack owner folds `OpenedUri` and `NavigatedBack` for the whole stack (section 1.2).
   - Inner stack owners also receive the fact, so chrome like Session can react (for example, a local move stops following). The outermost result wins.
   - Programs without a stack never receive these facts, so the Counter's exhaustive `update` (`FK/examples/counter/core/src/update.ts:15-23`) is untouched.
3. **Synchronization.** Navigation facts are classified `Navigation`, wrapping the child's `messageCategory` the way `ActionMenu.compose` does (`actionMenu.ts:793-797`).
4. **Interaction.** It adds the `navigation` facet (section 3.2), and an Escape fallback. If the inner `pressKey` returned nothing for a back key and the stack is deeper than the root, it returns `back(model)`. The menu still claims Escape first while it is open (`actionMenu.ts:645-647`).
5. **Screen.** `screen(model)` becomes `screenOf(model, base(stack))`, where the base is the topmost opaque entry. Hosts that only paint `bound.screen()` therefore already show Session settings when it is pushed.

**Two `ActionMenu.compose` changes:**

- Extend an existing stack instead of throwing.
- Emit `ChoseActionMenuAction` before the chosen Action (today it comes after, `actionMenu.ts:625-635`).

  The suffix law already makes "choose Session settings from the menu" correct, but the tape should read "chose, then did".

**`Program.compose.sync` must lift navigation.** Today `make` gets catalog, interaction and screen but not `navigation` (`FK/packages/foldkit/src/program/sync.ts:522-536`). The lifted facet answers `Option.none()` while the Model is `Starting` or `Failed`, in the same `whenReady` style as `liftInteraction` (`sync.ts:446-519`).

### 1.5 The mount law

The glossary promises `/counters/counter/c1` "with zero new child declarations" (`FK/glossary.md:95-99`); canonical v2 adds child-owned slugs (`q118-canonical-counter-gallery.md:48-50`). The audit found that the law is not implemented (`FK/docs/explorations/view-agnostic-principles-audit.md:251-254`).

**Representation: the child's stack nests inside one parent entry.** The parent's Destination union gets a case holding the child's key and its own stack:

```ts
// examples/counters/core/src/navigation.ts (phase 3)
export const CounterAt = ts('CounterAt', {
  key: CounterId,
  stack: Navigation.NavigationStack(CounterProgram.navigation.Destination),
})

export const navigation = Navigation.make({
  slug: Slug.make('counters'),
  Destination: S.Union([CounterList, CounterAt]),
  root: CounterList(),
  routes: [
    Navigation.root(Route.caseOf(Route.here, Route.casePathOf(CounterList))),
    Navigation.mountEach({
      child: CounterProgram.navigation,
      Case: CounterAt,
      key: Route.schemaSegment('key', CounterId),
    }),
  ],
})
```

Signatures:

```ts
/** Mounts one child at its slug: `/{slug}` then the child's own relative URI. */
export const mount: <Parent, ChildModel, Child, Case>(
  config: Readonly<{
    child: ProgramNavigation<ChildModel, Child>
    Case: Case
    isAllowedAbove?: (below: Parent) => boolean
  }>,
) => DestinationRoute<Parent>

/** Mounts a child per key: `/{slug}/{key}` then the child's own relative URI. */
export const mountEach: <Parent, ChildModel, Child, Key, Case>(
  config: Readonly<{
    child: ProgramNavigation<ChildModel, Child>
    Case: Case
    key: Route.Biparser<Readonly<{ key: Key }>>
    isAllowedAbove?: (below: Parent) => boolean
  }>,
) => DestinationRoute<Parent>
```

**The law in one line.** If the child prints its stack `s` as relative URI `u`, the parent prints `CounterAt({ key, stack: s })` as `{parent prefix}/{child slug}/{key}{u}`. Parsing composes the same way, outermost first (ADR 0010, `FK/docs/adr/0010-program-navigation-seam.md:54-57`). Because each layer is an inverse pair on canonical input, `parse(print(x)) = x` composes too.

| URI                                                                      | Model stack                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `/counter` (standalone)                                                  | `[Counter]`                                                                           |
| `/counters`                                                              | `[CounterList]`                                                                       |
| `/counters/counter/c1`                                                   | `[CounterList, Push CounterAt({ key: c1, stack: [Counter] })]`                        |
| `/counters/counter/c1/settings` (the Q112 "counter with settings" child) | `[CounterList, Push CounterAt({ key: c1, stack: [Counter, Push CounterSettings] })]`  |
| `/counters/counter/c1/menu?q=re`                                         | `[CounterList, Push CounterAt(c1, [Counter]), Dialog ActionMenu('re')]`               |
| Gallery at `/`, mounting Counters: `/counters/counter/c1`                | `[Gallery, Push CountersAt({ stack: [CounterList, Push CounterAt(c1, [Counter])] })]` |

How it works:

- **Nested destinations.** Nesting composes because a mount route's child parser is itself a stack parser. It is a greedy prefix parse; reserved chrome segments keep it unambiguous.
- **Flat for carriers.** Carriers still see one flat plan: the nested entries expand to keys `/counters`, `/counters/counter/c1`, `/counters/counter/c1/settings`. Each expanded entry carries its mount path (`['counter', 'c1']`), so `screenAt` routes to the child's `screenOf` with the child's Model slice.
- **Child-level navigation.** Child Messages are lifted as `GotMount({ path, message })` (canonical v2 decision 5, `q118-canonical-counter-gallery.md:56-59`). The mount writes the child's resulting stack into its entry, pushing the entry if it is absent.
- **Same mechanism as tabs.** This is the nesting pattern section 1.1 uses for tabs.

**Top-level slug.** A standalone Program is mounted by its host at its slug, so the Counter's root prints `/counter`. This keeps decided Q89 (`Path` to `/counter`, `qanda.md:2492-2496`) while the Counter's own routes stay slug-relative (`Route.here` for its root). A host that mounts at `/`, like the gallery (`FK/glossary.md:57-59`), declares no slug.

### 1.6 Canonicalization and not-found

- **Canonical URI.** `canonicalUri(u) = printStack(parseStack(u))`.
  - A carrier showing a non-canonical URI gets `OpenedUri(u)`, and the Model adopts the parsed stack.
  - `carrierMove` then sees that the carrier URI differs from the plan and replaces it. That replace is the redirect: one history entry, no loop.
  - This is the owner's rule "the seam refuses non-canonical URIs; no silent home rewrite" (`q118-canonical-counter-gallery.md:65-66`). It replaces `makeUriSync.open` returning `None` with no defined follow-up (`FK/packages/foldkit/src/navigation/runtimeSeam.ts:112-126`).
- **Not found is a Destination, not a redirect.**
  - `/counter/nope` parses to `[Counter, Push NotFound(['nope'])]` and prints back unchanged, so the URL bar keeps what the person typed, and Back goes to `/counter`.
  - `/nope` parses to `[NotFound(['nope'])]`.
  - This fixes the Counters prior art that silently mapped not-found to the list (`FK/examples/counters/core/src/route.ts:65`).
- **The one non-NotFound fallback.** Only an empty path (`/`) falls back to the root stack, and that is a canonical redirect to `/counter`.

---

## 2. Printing a whole stack to one URI and parsing it back

### 2.1 Grammar

```
uri    := path [ "?" query ]
path   := "/" slug root-segments entry-segments*
query  := the union of every entry's query keys, in print order
```

- **Path: identity.** The root's own segments come first (none for the Counter), then each entry's segments, relative to the entry beneath.
- **Query: configuration.** Each entry's `Route.query(schema)` adds its keys (`FK/packages/foldkit/src/route/parser.ts:712-797`). The key sets must not collide within one stack; `make` checks the declared route schemas.
- **Not URL-addressable.** These stay in the Model and are reset to their declared defaults by parsing, then fixed by `settle`:
  - the menu's `focus` (`OnFilter | OnAction`, `FK/packages/foldkit/src/actionMenu/actionMenu.ts:50-65`);
  - Session's `following`;
  - the sync mode;
  - every domain field (`count`);
  - any per-run id. The glossary forbids tokens, PII and per-run ids in the query (`FK/glossary.md:118-120`).

  The round-trip law therefore holds at the skeleton level, as the ADR 0009 amendment states (`FK/docs/adr/0009-portable-navigation-adapters.md:140-146`): `printStack(parseStack(printStack(s))) === printStack(s)` for every valid stack, and `parseStack(printStack(s))` equals `s` with every non-addressable field reset.

### 2.2 Algorithm (prototyped in `/tmp/navproto/core.ts`)

**Print** is a fold over the stack. Start from `PrintState` holding the slug. Print the root through its route's `RouteCase.parser.print`. Then print each entry; an entry that adds no segment is a declaration error. Each prefix is rendered to `{ key: path, uri: path?query }`. The last entry's `uri` is the stack's URI.

**Parse** works like this:

1. Split the URI into decoded segments and the raw search.
2. **Strict pass.** Try every `Root` route in declaration order (`Effect.firstSuccessOf`, as `oneOf` does at `parser.ts:527-545`). For each success, recursively try every `Entry` route allowed above the current top until the segments run out. A route that consumes nothing fails. Backtracking finds a full parse whenever one exists.
3. **Lenient pass.** Run only if strict parsing fails. It is the same search with the `Fallback` route appended at every level, giving the longest valid prefix plus `NotFound(rest)`.
4. **Root fallback.** If even that fails (only an empty path can), return `stackAtRoot(root)`.

`oneOfCases` cannot be reused for entry levels, because it demands that every segment be consumed (`parser.ts:568-571`). The stack parser composes `RouteCase.parser.parse` directly.

### 2.3 Counter URIs (all checked by `/tmp/navproto/scenarios.ts`)

| Input                                | Canonical             | Stack                                                                                                |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `/counter`                           | `/counter`            | `[Counter]`                                                                                          |
| `/counter/session`                   | same                  | `[Counter, Push SessionSettings]`                                                                    |
| `/counter/menu`                      | same                  | `[Counter, Dialog ActionMenu('')]`                                                                   |
| `/counter/menu?q=re`                 | same                  | `[Counter, Dialog ActionMenu('re')]`                                                                 |
| `/counter/session/menu?q=fo`         | same                  | `[Counter, Push SessionSettings, Dialog ActionMenu('fo')]`                                           |
| `/counter/nope`                      | same                  | `[Counter, Push NotFound(['nope'])]`                                                                 |
| `/nope`                              | same                  | `[NotFound(['nope'])]`                                                                               |
| `/`                                  | `/counter` (replace)  | `[Counter]`                                                                                          |
| `/counter/`                          | `/counter`            | `[Counter]`                                                                                          |
| `/counter/menu?q=`                   | `/counter/menu`       | `[Counter, Dialog ActionMenu('')]`                                                                   |
| `/counter/menu?q=re&utm_source=mail` | `/counter/menu?q=re`  | `[Counter, Dialog ActionMenu('re')]`                                                                 |
| `/counter/menu?q=a%20b`              | `/counter/menu?q=a+b` | `[Counter, Dialog ActionMenu('a b')]`                                                                |
| `/counter/session/session`           | same                  | `[Counter, Push SessionSettings, Push NotFound(['session'])]` (Session is not allowed above Session) |

Deep-link spellings map onto the same URIs:

- `foldkit-counter://counter/session` becomes `/counter/session`. The scheme is declared at `FK/examples/counter/expo/app.json:5`. In a custom-scheme URL the first word parses as the host, so the adapter rebuilds `/` + host + path.
- A universal link such as `https://counter.knophy.com/counter/session` uses its path.

---

## 3. One generic carrier algorithm

### 3.1 Pure pieces (`FK/packages/foldkit/src/navigation/carrier.ts`)

```ts
/** One stack entry as every carrier sees it. */
export type CarrierEntry<Destination> = Readonly<{
  key: string
  uri: string
  destination: Destination
  maybeStyle: Option.Option<PresentationStyle>
  title: string
  isDismissible: boolean
}>

/** What every carrier shows for one Model: entries root first, and the URI. */
export type CarrierPlan<Destination> = Readonly<{
  entries: Array.NonEmptyReadonlyArray<CarrierEntry<Destination>>
  uri: string
  history: HistoryMode
}>

/** The carrier plan for one stack. */
export const planOf: <Model, Destination>(
  navigation: ProgramNavigation<Model, Destination>,
  model: Model,
  stack: NavigationStack<Destination>,
) => CarrierPlan<Destination>

/** What a carrier shows now, in plan terms. Keys are empty when the carrier holds an unknown entry. */
export type CarrierSnapshot = Readonly<{
  keys: ReadonlyArray<string>
  uri: string
  maybePosition: Option.Option<number>
}>

/** The one move that takes a carrier from its snapshot to a plan. */
export type CarrierMove<Destination> =
  | Readonly<{ _tag: 'Unchanged' }>
  | Readonly<{ _tag: 'Reconfigure' }>
  | Readonly<{
      _tag: 'Push'
      entries: Array.NonEmptyReadonlyArray<CarrierEntry<Destination>>
    }>
  | Readonly<{ _tag: 'Pop'; count: number }>
  | Readonly<{
      _tag: 'Replace'
      popCount: number
      entries: Array.NonEmptyReadonlyArray<CarrierEntry<Destination>>
    }>
  | Readonly<{ _tag: 'Reset' }>

/** Diffs a carrier snapshot against a plan by entry key, then by URI. */
export const carrierMove: <Destination>(
  snapshot: CarrierSnapshot,
  plan: CarrierPlan<Destination>,
) => CarrierMove<Destination>

/** The fact a carrier change means, or none when the carrier already shows the plan. */
export const classifyCarrierChange: <Destination>(
  snapshot: CarrierSnapshot,
  plan: CarrierPlan<Destination>,
  via: UriVia,
) => Option.Option<Message>
```

`carrierMove` rules (`c` is the common key prefix length):

- same keys and same URI: `Unchanged`; same keys, different URI: `Reconfigure`;
- `c === 0`: `Reset`;
- snapshot keys are a strict prefix of the plan: `Push(plan.entries.slice(c))`;
- the plan is a strict prefix of the snapshot: `Pop(snapshot.keys.length - c)`;
- otherwise: `Replace(popCount, plan.entries.slice(c))`.

`classifyCarrierChange` rules:

- carrier equals the plan: none. This is the inbound half of "same URI means no write".
- non-empty snapshot keys that are a strict prefix of the plan's keys: `NavigatedBack({ uri: snapshot.uri })`.
- anything else: `OpenedUri({ uri: snapshot.uri, via })`.

It compares against the Model's plan, not against the carrier's previous state. So a two-entry jump through the browser's long-press history menu is one correct `NavigatedBack`.

### 3.2 The driver contract, and the interaction facet adapters use

```ts
/** A carrier state our own write will produce. */
export type Expectation = Readonly<{
  label: string
  isMetBy: (snapshot: CarrierSnapshot) => boolean
}>

/** One carrier change, from a user move or from our own write. */
export type CarrierEvent = Readonly<{ snapshot: CarrierSnapshot; via: UriVia }>

/** The only code a carrier adapter writes. */
export type CarrierDriver<Destination> = Readonly<{
  name: string
  read: () => CarrierSnapshot
  perform: (
    move: CarrierMove<Destination>,
    plan: CarrierPlan<Destination>,
    snapshot: CarrierSnapshot,
  ) => Option.Option<Expectation>
  subscribe: (listener: (event: CarrierEvent) => void) => () => void
}>
```

`perform` returns `Option.none()` when the write is complete and synchronous (`pushState`, a repaint). It returns an `Expectation` when the carrier reports the result later: `history.go(-k)`, a React Navigation `state` event.

`FK/packages/foldkit/src/interaction/interaction.ts` gains a navigation facet beside `ProgramInteraction` (`interaction.ts:144-154`). `bind` exposes it (`FK/packages/foldkit/src/interaction/bind.ts:37-50, 66`), so every adapter needs only the bound Program:

```ts
/** How any carrier reads a Program's navigation and reports moves, as pure functions. */
export type NavigationInteraction<Model, Message> = Readonly<{
  plan: (model: Model) => Option.Option<CarrierPlan<unknown>>
  defaultUri: string
  canonicalUri: (uri: string) => string
  openUri: (model: Model, uri: string, via: UriVia) => ReadonlyArray<Message>
  navigateBack: (model: Model, uri: string) => ReadonlyArray<Message>
  back: (model: Model) => ReadonlyArray<Message>
  screenAt: (
    model: Model,
    entry: CarrierEntry<unknown>,
  ) => Option.Option<UiNode>
}>

// ProgramInteraction gains: navigation: Option.Option<NavigationInteraction<Model, Message>>
// BoundInteraction gains:
//   navigation: () => Option.Option<CarrierPlan<unknown>>
//   openUri: (uri: string, via: UriVia) => boolean
//   navigateBack: (uri: string) => boolean
//   back: () => boolean
//   screenAt: (entry: CarrierEntry<unknown>) => Option.Option<UiNode>
//   canonicalUri: (uri: string) => Option.Option<string>
```

### 3.3 The loop

```ts
/** Keeps one carrier showing a bound Program's navigation until the returned stop runs. */
export const runCarrier = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  driver: CarrierDriver<unknown>,
  options: CarrierOptions = {},
): (() => void) => {
  let maybeInFlight: Option.Option<InFlight> = Option.none()
  let maybeLaunchUri = Option.orElse(options.launchUri ?? Option.none(), () =>
    Option.some(driver.read().uri),
  )
  let hasLaunched = false
  let corrections = 0
  let correctedUri = ''
  let isStopped = false

  const reconcile = (): void => {
    if (isStopped || Option.isSome(maybeInFlight)) {
      return
    }
    Option.match(bound.navigation(), {
      onNone: () => undefined,
      onSome: plan => {
        if (plan.uri !== correctedUri) {
          correctedUri = plan.uri
          corrections = 0
        }
        const snapshot = driver.read()
        const move = carrierMove(snapshot, plan)
        if (move._tag === 'Unchanged') {
          return
        }
        if (corrections >= maximumCorrectionsOf(options)) {
          report(options, GaveUpCorrecting({ uri: plan.uri }))
          return
        }
        corrections += 1
        maybeInFlight = Option.map(
          driver.perform(move, plan, snapshot),
          expectation => ({
            expectation,
            timer: setTimeout(expire, expectationTimeoutOf(options)),
          }),
        )
        if (Option.isNone(maybeInFlight)) {
          reconcile()
        }
      },
    })
  }

  const reconcileSoon = (): void => queueMicrotask(reconcile)

  const onModel = (): void => {
    if (hasLaunched || Option.isNone(bound.navigation())) {
      reconcile()
      return
    }
    hasLaunched = true
    const launchUri = Option.getOrElse(maybeLaunchUri, () => '')
    const isEcho = Option.match(bound.canonicalUri(launchUri), {
      onNone: () => true,
      onSome: canonical =>
        Option.exists(bound.navigation(), plan => plan.uri === canonical),
    })
    if (!isEcho) {
      bound.openUri(launchUri, Launch())
    }
    reconcileSoon()
  }

  const onCarrier = ({ snapshot, via }: CarrierEvent): void => {
    if (Option.isNone(bound.navigation())) {
      maybeLaunchUri = Option.some(snapshot.uri)
      return
    }
    const isOwnWrite = Option.exists(maybeInFlight, ({ expectation }) =>
      expectation.isMetBy(snapshot),
    )
    clearInFlight()
    if (isOwnWrite) {
      reconcile()
      return
    }
    Option.match(
      Option.flatMap(bound.navigation(), plan =>
        classifyCarrierChange(snapshot, plan, via),
      ),
      {
        onNone: reconcile,
        onSome: fact => {
          M.value(fact).pipe(
            M.tagsExhaustive({
              OpenedUri: ({ uri, via: factVia }) => bound.openUri(uri, factVia),
              NavigatedBack: ({ uri }) => bound.navigateBack(uri),
            }),
          )
          reconcileSoon()
        },
      },
    )
  }

  const stopModel = bound.subscribe(onModel)
  const stopCarrier = driver.subscribe(onCarrier)
  onModel()
  return () => {
    isStopped = true
    clearInFlight()
    stopModel()
    stopCarrier()
  }
}
```

`expire` drops a stale expectation, reports `ExpectationExpired({ label })`, and reconciles. The defaults are `expectationTimeoutMs: 1000` and `maximumCorrections: 3`. `CarrierOptions` is `Readonly<{ launchUri?: Option<string>; expectationTimeoutMs?: number; maximumCorrections?: number; onDiagnostic?: (d: CarrierDiagnostic) => void }>`. `let` appears only for the loop's own mutable carrier bookkeeping, which is not navigation state.

### 3.4 Echo suppression, stated as rules

1. **Outbound.** Write only when `carrierMove(snapshot, plan)` is not `Unchanged`.
2. **Inbound.** Report a fact only when the event does not meet the in-flight expectation and the snapshot differs from the plan.
3. **One batch in flight.** Model changes during a write coalesce, and the latest plan wins after settlement. A remote move and a local move landing together cost one carrier write.
4. **Bounded correction.** A plan the carrier will not take (for example, a router that drops our write) is retried three times for that plan URI, then reported. There is no infinite loop.

These replace the failed reconciliation hook `useCarrierReconciliation` (`FK/examples/counters/react/src/reactRouterMain.tsx:41-65`). That hook compared pathnames and sent app actions back; it was the "second state machine" that PRINCIPLES.md's smell list names (`FK/PRINCIPLES.md:113-114`).

### 3.5 A native move that already happened, versus a Program move

- **Native-first moves.** iOS swipe-back, header back and modal swipe-down; Android sheet drag; browser Back. The carrier already changed (section 4.2 cites where). The event classifies as `NavigatedBack(uri)`.
  - Usually the Program agrees, the plan becomes equal to the snapshot, and nothing is written.
  - If the Program refuses, for example while an Observe follower is following, `reconcileSoon` re-pushes. The web pushes the entry again; React Navigation re-pushes with a fresh route key, because iOS will not show a natively dismissed controller again (`SCR/ios/RNSScreenStack.mm:700-715`).
- **JS-first moves.** Android header back and hardware back go through React Navigation's JS state, and native follows. The same path applies.
- **Preventing a refused move up front.** A plan entry with `isDismissible: false` maps to `gestureEnabled: false`, `headerBackVisible: false` and an Android `BackHandler` that reports the fact without popping. `usePreventRemove` is avoided, because it also blocks our own resets (`CORE/src/usePreventRemove.tsx:46-54`).
- **Program moves.** The Model changes, the plan changes, `perform` runs with an expectation, the event meets it, and no fact is reported.
- **Disagreement always resolves the same way.** The Program wins and the carrier is corrected, because reconciliation always compares the carrier against the plan.

### 3.6 What the prototype proved

`/tmp/navproto/scenarios.ts` runs `runCarrier` against a simulated browser history (asynchronous `go`, synchronous `pushState`) and a simulated native stack (asynchronous state events). All of these pass:

- **Web:** the full sequence of launching at the default URI, pushing, opening the menu, typing in it, pressing Back, and a Program pop.
- **Web:** a Program pop whose `go(-1)` is still in flight when a remote opens the menu. The expectation is met by position, then the push is written, and no false fact is reported.
- **Web:** a cold deep link while `Starting`, history seeding, then Back to `/counter`.
- **Web:** a non-canonical launch redirected with replace.
- **Web:** two quick Backs from depth 3.
- **Web:** a not-found launch that keeps its URL and seeds the root.
- **Native:** the initial reset; a push; a swipe back; a swipe before our own state event arrives (classified correctly after the expectation mismatch); a remote Mirror move.
- **Refused moves:** a refused Back on web and a refused swipe on native are both corrected.

---

## 4. Per-carrier mapping and adapters

### 4.0 One table for every carrier

| `CarrierMove` | Web (browser history)                               | React Navigation                            | Expo Router            | OpenTUI | CLI     |
| ------------- | --------------------------------------------------- | ------------------------------------------- | ---------------------- | ------- | ------- |
| Unchanged     | nothing                                             | nothing                                     | nothing                | nothing | nothing |
| Reconfigure   | `replaceState(top)`, throttled                      | keyed `reset`; params change, no remount    | targeted keyed `reset` | repaint | print   |
| Push(n)       | n × `pushState`                                     | keyed `reset`; native animates the top push | targeted keyed `reset` | repaint | print   |
| Pop(k)        | `go(-k)` when position ≥ k, else `replaceState`     | keyed `reset`; native animates the pop      | targeted keyed `reset` | repaint | print   |
| Replace(k, n) | k = n = 1: `replaceState`; else `go(-k)`, then Push | keyed `reset`; replace animation            | targeted keyed `reset` | repaint | print   |
| Reset         | `replaceState`, plus seed prefixes at launch        | keyed `reset`                               | targeted keyed `reset` | repaint | print   |

| Carrier event                                                                               | Fact                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| popstate landing on an entry whose stored keys are a strict prefix of the plan              | `NavigatedBack(uri)`                             |
| popstate to a forward or unknown entry                                                      | `OpenedUri(uri, History)`                        |
| React Router `<Link>` or `useNavigate()(to)`                                                | `OpenedUri(uri, Link)`                           |
| `useNavigate()(-1)`, OpenTUI Escape, CLI `back`                                             | `back()`, which sends `NavigatedBack(uri)`       |
| iOS swipe, header back or modal dismissal; Android header back, hardware back or sheet drag | `NavigatedBack(uri of the new top)`              |
| OS deep link while running                                                                  | `OpenedUri(uri, DeepLink)`                       |
| cold-start URL, argv `--at`, `open`                                                         | `OpenedUri(uri, Launch)` / `OpenedUri(uri, Cli)` |

### 4.1 React Router (web)

**Ground truth (React Router 8.3.0):**

- `router.subscribe`, `router.state` and `router.navigate(number)` are tagged `@private PRIVATE - DO NOT USE` (`RR/lib/router/router.d.ts:25-31, 69-77, 90-97`).
- A POP from our own `navigate(-1)` is indistinguishable from the Back button (`RR/lib/router/router.js:406-411`).
- Only the raw history listener receives `delta` (`RR/lib/router/history.js:285-295`). The router uses it only for blockers (`RR/lib/router/router.js:230-270`).
- Same-URL `navigate` pushes a duplicate entry (`RR/lib/router/router.js:430-433`; probe in `/tmp/rr-carrier-probe`).
- Hooks are the worst fit: transitions collapse intermediate locations, and `navigate` does nothing before the first layout effect (`RR/lib/hooks.js:281-287`; `RR/lib/dom/lib.js:162-165`).
- React Router's own precedent for undoing a POP is `go(-delta)` (`RR/lib/router/router.js:230-268`).
- The stable, public controlled router is `Router({ basename, location, navigationType, navigator })` with `Navigator { createHref, go, push, replace }` (`RR/lib/components.d.ts:650-694`; `RR/lib/context.d.ts:56-62`). `createPath` and `parsePath` are exported (`RR/index.d.ts:44`).

**Design: Foldkit owns `window.history`, and React Router renders from the Program.**

- `FK/packages/foldkit/src/navigation/browserHistory.ts` (new, DOM-only, no React) implements the driver:
  - It stores `{ foldkit: { keys, position } }` in each entry's `history.state`.
  - `read`: `{ keys, uri: pathname + search minus basename, maybePosition: position }`; an entry without our state reads `keys: []`.
  - `perform` follows section 4.0.
    - `go(-k)` returns `Expectation({ isMetBy: snapshot => position === before - k })`.
    - Reconfigure writes are throttled to one per 300 ms, trailing. Safari rate-limits `replaceState`, and React Router's own history falls back to a full `location.assign` when `pushState` throws (`RR/lib/router/history.js:303-308`).
  - `subscribe`: `popstate` with `via: History()`.
  - Seeding: on the first Reset of a fresh entry, it replaces with entry 0 and pushes the rest, so Back from a cold deep link stays in the app. That is what the prototype's `webDeepLink` scenario exercises.
- `FK/packages/react/src/navigation/navigation.tsx` (new, exported as `@foldkit/react/navigation`):

```tsx
/** Props for {@link FoldkitRouter}. */
export type FoldkitRouterProps = Readonly<{
  children?: ReactNode
  basename?: string
  seedHistoryOnLaunch?: boolean
}>

/** Lets the bound Program drive the browser URL and React Router's location. */
export const FoldkitRouter = ({
  children,
  basename,
  seedHistoryOnLaunch,
}: FoldkitRouterProps): ReactElement => {
  const bound = useBound()
  const driver = useMemo(
    () =>
      browserHistoryDriver({
        window,
        ...(basename === undefined ? {} : { basename }),
        seedHistoryOnLaunch: seedHistoryOnLaunch ?? true,
      }),
    [basename, seedHistoryOnLaunch],
  )
  useEffect(() => runCarrier(bound, driver), [bound, driver])
  const location = Option.match(useNavigationPlan(), {
    onNone: () => driver.read().uri,
    onSome: plan => plan.uri,
  })
  const navigator: Navigator = useMemo(
    () => ({
      createHref: to =>
        `${basename ?? ''}${typeof to === 'string' ? to : createPath(to)}`,
      push: to => {
        bound.openUri(typeof to === 'string' ? to : createPath(to), Link())
      },
      replace: to => {
        bound.openUri(typeof to === 'string' ? to : createPath(to), Link())
      },
      go: delta => (delta === -1 ? bound.back() : window.history.go(delta)),
    }),
    [bound, basename],
  )
  return (
    <Router
      location={location}
      navigator={navigator}
      {...(basename === undefined ? {} : { basename })}
    >
      {children}
    </Router>
  )
}

/** The bound Program's carrier plan, re-rendering on every Model change. */
export const useNavigationPlan: () => Option.Option<CarrierPlan<unknown>>

/** Paints the topmost opaque entry, then every presented entry above it. */
export const NavigationScreen: (
  props: Readonly<{ classNames?: PaintClassNames }>,
) => ReactElement | null
```

Notes on the adapter:

- **Why the effect cleanup is enough.** StrictMode's double effect creates and stops one carrier run, and the driver's listener is removed by the stop function. React Router's history keeps a single listener slot (`RR/lib/router/history.js:340-346`), but we do not use React Router's history at all.
- **Constraint.** A host page cannot also mount `createBrowserRouter` or `BrowserRouter`: two history instances disagree about deltas, as the `/tmp/rr-carrier-probe` probe showed. This is documented in section 8.
- **Counter React host.** It wraps `<App/>` in `<FoldkitRouter>`. `<Screen/>` and `<ActionMenuDialog/>` keep working (`FK/packages/react/src/interaction/interaction.tsx:384, 418`), because `screen(model)` now paints the base entry and the menu is still read from `menu()`.

### 4.2 React Navigation (native-stack)

**Ground truth (native-stack 7.18.6, react-native-screens 4.26.2):**

- **Route keys survive resets.** Supplied keys survive rehydration, and reusing a key keeps the mounted screen (`ROUT/src/StackRouter.tsx:202-264`; `NS/src/views/NativeStackView.native.tsx:559-560`).
- **JS never picks push or pop; native diffs the keyed children.**
  - iOS: a new top over a kept old top is an animated push; a removed top is a pop; a new top replacing the old one uses `animationTypeForReplace`, which defaults to `push` in code (`SCR/ios/RNSScreenStack.mm:577-673`; `NS/src/views/NativeStackView.native.tsx:106, 383`).
  - Android: `SCR/android/src/main/java/com/swmansion/rnscreens/ScreenStack.kt:183-218`.
- **Recommended reset:** `{ ...getRootState(), routes, index: routes.length - 1 }`.
  - Partial resets regenerate the navigator key (`ROUT/src/StackRouter.tsx:202-264`).
  - A full state without `routeNames` throws (`ROUT/src/BaseRouter.tsx:64`).
  - `dispatch` updates the store synchronously (`CORE/src/useSyncState.tsx:26-34`).
- **`onStateChange` cannot tell our resets from native moves.** It fires for both and carries no origin (`CORE/src/BaseNavigationContainer.tsx:346-425`). It is skipped on first mount, so the initial state is read in `onReady` (`:336-344, 420-424`).
- **Native moves dispatch `StackActions.pop(n)` with `source` and `target`** (`NS/src/views/NativeStackView.native.tsx:597-619`). Android hardware back is a bare `GO_BACK` that exits the app at the root (`NAV/src/useBackButton.native.tsx:11-34`; `RN/Libraries/Utilities/BackHandler.android.js:23-37`).
- **The key diff is the robust echo test**, since the Program's entry keys are the route keys.
- **Card after modal.** On iOS, a `card` placed after a modal is pushed underneath it (`SCR/ios/RNSScreenStack.mm:675-724`). A route after a modal with no explicit presentation becomes `modal` (`NS/src/utils/getModalRoutesKeys.ts:5-26`).
- **Presentation can be computed per route.** `options` and `screenOptions` may be functions of `{ route, navigation, theme }` (`CORE/src/types.tsx:212-218, 827-833`).
- **Listener leak.** Listeners added through the ref before mount are re-added on every commit (`NAV/src/NavigationContainer.tsx:125`; `CORE/src/createNavigationContainerRef.tsx:52-64`). Use the `onStateChange` prop instead.
- **Handle linking yourself.** Omit `linking` and use `RN/Libraries/Linking/Linking.js:35, 89-92` directly (`NAV/src/NavigationContainer.tsx:81`).

**Design.** A structural driver in `FK/packages/react-native/src/navigation/nativeStackDriver.ts`. It imports nothing from `@react-navigation`, so Expo Router can reuse it (section 4.3):

```ts
/** The part of a native-stack route the driver reads and writes. */
export type NativeStackRoute = Readonly<{
  key: string
  name: string
  params?: Readonly<Record<string, unknown>>
}>

/** The part of a navigator state the driver reads and resets. */
export type NativeStackState = Readonly<{
  key: string
  index: number
  routes: ReadonlyArray<
    NativeStackRoute & Readonly<{ state?: NativeStackState }>
  >
  routeNames: ReadonlyArray<string>
}>

/** The container surface both React Navigation and Expo Router expose. */
export type NativeStackContainer = Readonly<{
  isReady: () => boolean
  getRootState: () => NativeStackState
  dispatch: (action: Readonly<{ type: string; target?: string }>) => void
}>

/** How one native-stack host names, parameterizes, and observes entries. */
export type NativeStackDriverConfig = Readonly<{
  container: NativeStackContainer
  reset: (state: NativeStackState) => Readonly<{ type: string }>
  stackOf: (root: NativeStackState) => Option.Option<NativeStackState>
  routeNameOf: (entry: CarrierEntry<unknown>, index: number) => string
  paramsOf: (entry: CarrierEntry<unknown>) => Readonly<Record<string, unknown>>
  subscribe: (listener: () => void) => () => void
}>

/** A carrier driver over any native stack whose route keys are entry keys. */
export const nativeStackDriver: (
  config: NativeStackDriverConfig,
) => CarrierDriver<unknown>
```

How the driver behaves:

- **`read`** maps the stack's routes to keys, stripping the `#n` generation suffix. A route without a `/`-key is foreign, so keys read as `[]`. The URI is the one the driver last wrote for the top key.
- **`perform`**, for every move except `Unchanged`, dispatches `{ ...reset({ ...stack, routes, index }), target: stack.key }`.
  - Routes are `{ key: routeKeyOf(entry.key), name: routeNameOf(entry, index), params: paramsOf(entry) }`.
  - It returns `Expectation({ isMetBy: snapshot => keys and uri equal the plan })`.
- **Generations.** When an event shows a key that the Model still held removed by the user, the driver bumps that path's generation, so a later re-push uses `/counter/session#1` (`SCR/ios/RNSScreenStack.mm:700-715`).
- **`subscribe`** registers the listener; the host calls it from `onStateChange`. Native events report `via: History()` (the via is unused for `NavigatedBack`).

**Options from style** (`FK/packages/react-native/src/navigation/options.ts`):

| PresentationStyle | `presentation`     | Other options                                            |
| ----------------- | ------------------ | -------------------------------------------------------- |
| Push              | `card`             |                                                          |
| Sheet             | `pageSheet`        |                                                          |
| BottomSheet       | `formSheet`        | `sheetAllowedDetents: 'fitToContents'`                   |
| FullScreenCover   | `fullScreenModal`  |                                                          |
| Dialog            | `transparentModal` | `animation: 'fade'`; content draws the dimmed backdrop   |
| Popover           | `transparentModal` | `animation: 'fade'`; the anchor is unsupported on native |
| Drawer({ from })  | `transparentModal` | `animation: 'slide_from_left'` or `'slide_from_right'`   |

Valid values: `NS/src/types.tsx:632, 664, 683`; `SCR/src/types.tsx:29-49`.

Every entry also gets:

- `title: entry.title`;
- `gestureEnabled: entry.isDismissible`;
- `headerBackVisible: entry.isDismissible`;
- `headerShown: isOpaque(style)`.

**The component** (`FK/packages/react-native/src/navigation/foldkitStack.tsx`, exported as `@foldkit/react-native/react-navigation` so `/navigation` stays free of `@react-navigation` imports):

```tsx
const Stack = createNativeStackNavigator<{
  FoldkitEntry: Readonly<{ uri: string }>
}>()

/** Shows the bound Program's stack on a React Navigation native stack. */
export const FoldkitStack = ({
  deepLinks,
  starting,
}: FoldkitStackProps): ReactElement => {
  const bound = useBound()
  const navigationRef = useNavigationContainerRef<{
    FoldkitEntry: Readonly<{ uri: string }>
  }>()
  const stateListeners = useRef(new Set<() => void>())
  const maybeFirstPlan = useFirstReadyPlan(bound, deepLinks)
  return Option.match(maybeFirstPlan, {
    onNone: () => <>{starting ?? null}</>,
    onSome: ({ plan, launchUri }) => (
      <NavigationContainer
        ref={navigationRef}
        initialState={{
          index: plan.entries.length - 1,
          routes: Array.map(plan.entries, entry => ({
            key: entry.key,
            name: 'FoldkitEntry',
            params: { uri: entry.uri },
          })),
        }}
        onReady={() => {
          stopCarrier.current = runCarrier(
            bound,
            nativeStackDriver({
              container: navigationRef,
              reset: state => CommonActions.reset(state),
              stackOf: Option.some,
              routeNameOf: () => 'FoldkitEntry',
              paramsOf: entry => ({ uri: entry.uri }),
              subscribe: listener => {
                stateListeners.current.add(listener)
                return () => {
                  stateListeners.current.delete(listener)
                }
              },
            }),
            { launchUri },
          )
        }}
        onStateChange={() => {
          stateListeners.current.forEach(listener => listener())
        }}
      >
        <Stack.Navigator
          screenOptions={({ route }) =>
            nativeStackOptionsOf(entryFor(route.key))
          }
        >
          <Stack.Screen name="FoldkitEntry" component={EntryScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    ),
  })
}
```

Supporting pieces:

- **`useFirstReadyPlan`** waits for status `Ready`, reads `Linking.getInitialURL()` and maps it through `programUriOf(url, deepLinks)`. It applies the launch URI before mounting, so a cold deep link starts with the full stack and no animation. It also starts `Linking.addEventListener('url')`, which sends `OpenedUri(uri, DeepLink)`.
- **`EntryScreen`** renders `EntryContent` for `route.key`. It caches entries by key, so a screen animating out keeps its content. An `ActionMenu` destination renders the menu body (today's `ActionMenuModal` content without the `Modal` wrapper, `FK/packages/react-native/src/interaction/actionMenuModal.tsx:111-192`); anything else paints `bound.screenAt(entry)`.
- **Android back at the root** still exits the app, which is React Navigation's default.

### 4.3 Expo Router

**Ground truth (expo-router 57.0.24, which pairs with SDK 57: `ER/package.json#L3`; `https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json#L77`):**

- **It vendors React Navigation.** Since 56 it carries its own copy, and app code imports from `expo-router/react-navigation` (`ER/CHANGELOG.md#L363-L370`). Importing `@react-navigation/*` from non-node_modules code in an expo-router project is a Metro error (`https://github.com/expo/expo/blob/sdk-57/packages/@expo/cli/src/start/server/metro/withMetroMultiPlatform.ts#L750-L782`).
- **No controlled mode.** The container takes `initialState`, not `state` (`ER/src/react-navigation/core/types.tsx#L431`). `ExpoRoot` accepts no `onStateChange` (`ER/src/ExpoRoot.tsx#L28-L33`).
- **Observing state.** Use `useNavigationContainerRef` from `expo-router`, not the deprecated one in `expo-router/react-navigation` (`ER/src/hooks/useNavigationContainerRef.ts#L9-L11`; `ER/src/react-navigation/core/useNavigationContainerRef.tsx#L8-L18`), then `addListener('state')` (`ER/src/react-navigation/core/BaseNavigationContainer.tsx#L360-L364`).
- **One catch-all can hold many entries.** It is literally named `[...path]` with `params.path: string[]` (`ER/src/useScreens.tsx#L558-L572`). `push` always appends a new keyed entry (`ER/src/layouts/StackClient.tsx#L199-L395`).
- **Function-form options work only in layouts** (`ER/src/layouts/stack-utils/StackScreen.tsx#L27-L107`).
- **A cold deep link yields at most anchor plus target, never three screens** (`ER/src/fork/getStateFromPath.ts#L623-L654`).
- **Targeted reset** of the inner stack: `ref.dispatch({ ...CommonActions.reset({ index, routes }), target: getRootState().routes[0].state.key })`. The first route is the synthetic `__root` (`ER/src/getLinkingConfig.ts#L15-L47`; `ER/src/react-navigation/routers/BaseRouter.tsx#L41-L68`).
- **`+native-intent.tsx`** exports `redirectSystemPath({ path, initial })`, and returning `null` leaves navigation alone (`ER/src/types.ts#L31-L62`; https://docs.expo.dev/versions/latest/sdk/router/#nativeintent).

**Choice: one generic `app/_layout.tsx` plus `app/[...path].tsx`, not one file per Destination.**

- **Define once.**
  - Per-destination files are a second copy of the Program's router. PRINCIPLES.md names a router list that repeats the Program's router as a smell (`FK/PRINCIPLES.md:31-33`).
  - The Counters codegen was generated and never used (`FK/docs/explorations/view-agnostic-principles-audit.md:242-245`).
  - The menu can sit above any entry, a recursive grammar that a file tree cannot express without one file per parent-path combination.
- **No lost fidelity.**
  - Both designs produce the same native animations.
  - Both still need the Program to rebuild a multi-entry stack after a cold deep link (see the anchor-plus-target point above).
  - Typed routes add nothing, because the Program already owns typed Destinations.
- **Presentation from the parsed Destination.** In `_layout.tsx`, `<Stack.Screen name="[...path]" options={({ route }) => nativeStackOptionsOf(entryFor(route.key))} />` reads the plan entry for the route key. Its style came from `styleOf(destination)`, so it is fixed per key.

**The adapter** (new package `FK/packages/expo-router`, exported as `@foldkit/expo-router`; depends on `expo-router` and `@foldkit/react-native/navigation`):

```ts
/** The app/_layout.tsx body: an Expo Stack carried by the bound Program. */
export const FoldkitStackLayout: (
  props: Readonly<{ starting?: ReactNode }>,
) => ReactElement

/** The default export of app/index.tsx and app/[...path].tsx. */
export const FoldkitEntryRoute: () => ReactElement | null

/** Builds app/+native-intent.tsx's redirectSystemPath: warm links go to the Program, never to Expo. */
export const makeRedirectSystemPath: (
  config: Readonly<{
    bound: () => AnyBound
    deepLinks: DeepLinkConfig
  }>,
) => (event: Readonly<{ path: string; initial: boolean }>) => string | null
```

How the layout wires the driver:

- It calls `nativeStackDriver` with:
  - `container: useNavigationContainerRef()` from `expo-router`;
  - `reset: CommonActions.reset` from `expo-router/react-navigation`;
  - `stackOf: root => Option.flatMap(Array.head(root.routes), route => Option.fromNullishOr(route.state))`;
  - `routeNameOf: () => '[...path]'`;
  - `paramsOf: entry => ({ path: segmentsOf(entry.key) })`;
  - `subscribe: listener => container.addListener('state', listener)`, registered after ready and deduplicated.
- `app/index.tsx`, the anchor (`unstable_settings = { anchor: 'index' }`), shows the `Starting` screen. Once the Program is Ready, the first targeted reset replaces it with the plan, using `animation: 'none'` for that one reset.
- Cold start: `redirectSystemPath` returns `path` unchanged. The carrier reads the URI from Expo's catch-all params as its launch URI, dispatches `OpenedUri(Launch)`, and resets to the full keyed stack.
- Warm start: it calls `bound().openUri(uri, DeepLink())` and returns `null`, so Expo never pushes its own route.

**Host consequence.** The React Navigation host (`examples/counter/expo`, which imports `@react-navigation/native`) and the Expo Router host must be separate Metro projects: a new `examples/counter/expo-router`. Expo web gets automatic history sync from expo-router itself (`ER/src/fork/useLinking.ts#L403-L477`). v1 scopes the Expo Router carrier to iOS and Android (section 8).

### 4.4 OpenTUI

**Ground truth:**

- **No navigation built in.** No router, screen stack or modal (`OT/index.d.ts:1-29`; `OT/renderables/index.d.ts:1-24`).
- **Overlays.** Draw them with absolute positioning and `zIndex` (`OT/Renderable.d.ts:38-43, 64-71`). Dim the content beneath with a translucent full-size box or `opacity` (`OT/chunk-node-tq0x9mbj.js:1137-1140`).
- **Escape.** A lone Escape arrives after a hard-coded 20 ms timeout (`OT/chunk-node-tq0x9mbj.js:7375-7381`). Two fast Escapes merge into one `escape` with `meta: true` (`OT/chunk-node-crchpns1.js:5459-5461`).
- **Ctrl+C.** `exitOnCtrlC` destroys the renderer on the next tick, without `process.exit` (`OT/chunk-node-tq0x9mbj.js:7311, 7365-7372`).

**Design.** OpenTUI is the degenerate carrier. Its only state is the frame it last painted, so it needs no driver.

- `runOpenTui(bound, renderer, { launchUri })` (`FK/packages/opentui/src/interaction/runOpenTui.ts:29-89`) paints `paintPlan(plan)` when `bound.navigation()` is Some:
  - a header such as `counter › session   [esc] back   [?] actions   [q] quit`;
  - the base entry through `bound.screenAt(base)`;
  - each overlay above it, positioned by style, with the base dimmed. The menu keeps today's painter (`FK/packages/opentui/src/interaction/paintOpenTui.ts:149-200`), which now honors `MenuView.style` (`FK/packages/foldkit/src/interaction/interaction.ts:123-128`).
- **Keys need no host change.** Escape already goes to `bound.pressKey`. The Program's back-key fallback (section 1.4) sends `NavigatedBack`. `back` matches `Escape` with or without `meta`, so the double-tap merge still pops once.
- **Launch.** `launchUri` from argv or `foldkit-counter://…` goes through the same launch rule, using a `launchWhenReady(bound, uri, via)` helper that `runCarrier` also uses.
- **Two existing defects fixed in passing:**
  - repaint leaks the old tree's children: use `destroyRecursively()`, not `destroy()` (`runOpenTui.ts:60-63`);
  - Ctrl+C skips `bound.stop()`: listen for the renderer's `destroy` event (`FK/examples/counter/opentui/src/entry.ts:33-39`).

### 4.5 CLI

- **`runProgramCommand`** (`FK/packages/foldkit/src/cli/program.ts:216-243`) gains three verbs:
  - `open <uri>` calls `bound.openUri(uri, Cli())`; scheme URLs are mapped too.
  - `back` calls `bound.back()`, and exits with code 1 and "already at /counter" at the root.
  - `where` prints the plan URI.
- **`paintProgram`** (`program.ts:78-95`) prints `uri /counter/session` first, then the base entry's screen, then overlays (the menu lines exist today, `program.ts:36-48`). `programUsage` (`program.ts:101-120`) lists the new verbs.
- **The daemon keeps the Model between invocations** (`FK/examples/counter/cli/src/daemon.ts:20-36`; `FK/packages/foldkit/src/cli/protocol.ts:86-102`). So `counter open /counter/session` followed by `counter` shows Session settings.
- **One-shot runs** (Memory or File tape) start a new Processor each time (`FK/examples/counter/cli/src/session.ts:26-54`). Under SharedDomain they cannot keep navigation, so they accept `--at <uri>`: `counter --at /counter/session show`. `parseProgramArgv` already parses `--name value` flags (`FK/packages/foldkit/src/cli/argv.ts:27-54`).

---

## 5. Sync interplay

### 5.1 Remote Navigation Messages reach carriers only through the Model

- **Categories are unchanged.** `MessageCategory = 'Domain' | 'Navigation'` (`FK/packages/foldkit/src/synchronization/synchronization.ts:50-52`). Audience is resolved per Message (`synchronization.ts:211-227`; HEAD `FK/packages/foldkit/src/runtime/start.ts:279-293`).
- **Arrival.** A remote Message arrives as `RemoteMessageReceived` (HEAD `start.ts:595`). An out-of-order Message is handled by replacing the whole Model with `LogRefolded` (HEAD `start.ts:587`).
- **Carriers react the same either way.** The plan changes, `reconcile` writes, and the write's own event meets its expectation, so no local fact is reported. The carrier never asks where a change came from.

| Mode         | Remote `OpenedActionMenu`, `OpenSessionSettings` or `NavigatedBack` | What carriers do                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mirror       | Applied on every Processor                                          | **Web:** push, replace or `go` as for any move (history records it, so local Back undoes it everywhere). **React Navigation and Expo:** a native push or pop animation. **OpenTUI:** repaint. **CLI:** the next `show` prints it. |
| SharedDomain | Applied only on the originating Processor                           | Nothing moves. Domain Messages still change screens, and when a Domain Message invalidates a Destination (Counters: a peer deletes c1 while I am on it), `update` changes the stack deterministically and carriers follow.        |
| LogRefolded  | Model replaced                                                      | `Replace` or `Reset` moves, with no new history entries beyond what the diff needs.                                                                                                                                               |

### 5.2 Session as state (in progress in the working tree)

Uncommitted work keeps the mode in the Model:

- `Session.compose` adds `session: { mode: 'Mirror' | 'SharedDomain', generation }`, with Catalog Actions `MirrorNavigation` and `KeepNavigationLocal` (**(WT)** `FK/packages/foldkit/src/session/session.ts:26-70`).
- `ProgramSynchronization.sessionPolicyOf` makes every Processor read the same policy at the same log position (**(WT)** `FK/packages/foldkit/src/program/program.ts:62-71`).

This design builds on it:

1. **Session settings is Session's destination.** `Session.compose` adds the `SessionSettings` Destination with route `session` (pushed), an `OpenSessionSettings` Action (Navigation category), and `screenOf(SessionSettings)`. The screen shows the mode with the two mode Actions as buttons, and the follow state. Section 6 has the full page.
2. **The stack helper reads the mode for the launch rule** (section 5.4).
3. **Entering Mirror should converge stacks.** Under SharedDomain each Processor has its own stack, and switching to Mirror only mirrors future moves. Recommendation: `MirrorNavigation` carries the switching Processor's URI. Every Processor folds it at that log position, adopts `parseStack(uri)`, and starts Mirror on the same screen. Carriers follow with one `Reset` or `Replace`.

### 5.3 Follow as presence (Figma style)

- **Presence carries a derived URI.** Each Processor publishes `uri = plan.uri` in its presence. Instant processor rooms already publish and observe presence (`FK/packages/instant/src/processorRoom/processorRoom.ts:27-38`); the presence schema (`FK/packages/instant/src/schema/schema.ts:418-444`) gains `uri`. The URI is never stored, only derived (uri-graph sketch: `FK/docs/adr/0011-one-program-hosts-and-ports/overviews/uri-graph-sketch.md:9-14`).
- **Following is local Model state.** `presence: { following: Option<ProcessorId>, peers: ReadonlyArray<Peer> }` is changed by `StartedFollowing({ processorId })` and `StoppedFollowing()`. Both are Navigation category, so they stay local under SharedDomain. `projectDomain` excludes them.
- **A Subscription gated on `following` is Some** watches the leader's presence. When the leader's URI differs from the Model's plan URI, it sends `OpenedUri({ uri, via: Following({ processorId }) })`. The follower's Model moves, and its carriers follow it like any Program move.
- **Breaking follow.** Any local navigation fact with another `via` ends following in `Session`'s fold. This is why inner stack owners also receive navigation facts (section 1.4).
- **Carriers while following.** `historyOf(model)` returns `Replace`, so the web replaces instead of pushing and the follower's Back is not a list of the leader's moves. Native carriers still animate. OpenTUI and the CLI show a "following react-a1b2" line from the Program's screen.
- **RemoteControl** (a follower steering the leader) maps to a leader-addressed request Message whose fold is the leader's choice. It is deferred to section 8. The old `Follow` mode (`FK/packages/foldkit/src/synchronization/synchronization.ts:115-131, 181-208`) is superseded; the in-progress `SessionMode` already has only `Mirror | SharedDomain` (**(WT)** `session.ts:26`).

### 5.4 Launch URIs

- **SharedDomain.** Navigation is local, so a launch URI is always adopted, including on reload: a new Processor starts at the root, and the URL restores its place.
- **Mirror.** A launch URI never moves the room. The joiner lands where the room is, and the carrier is corrected to the room's URI. Explicit moves after joining (`Link`, `DeepLink`, `Cli`) still move it.
  - **Rule:** the stack helper ignores `OpenedUri({ via: Launch })` when `sessionPolicyOf(model)` is Mirror. Every Processor folds it the same way, so the decision lives in shared state, not in a host.
  - Without it, a stale reload or a default-URL tab would reset everyone's screen.
- **Snapshots must carry navigation under Mirror.** Today the Counter's `CountProjection` resets navigation to the root on every snapshot decode (`FK/examples/counter/core/src/wire.ts:34-55`). That is right for SharedDomain. Under Mirror, a Processor that boots from a snapshot has no navigation rows after the boundary to fold, so it diverges from long-running peers. See section 8.
- **Messages sent before the first snapshot are dropped** by the handle (`FK/packages/foldkit/src/runtime/handle.ts:119-129`). That is why carriers park while the plan is `None` and remember the latest carrier URI as the launch URI.

---

## 6. Canonical Counter navigation

**Composition:**

```ts
// examples/counter/core/src/app.ts
export const App = ActionMenu.compose({
  of: Session.compose({ of: CounterProgram }),
})
// App.Model: { count, session, presence, navigation: NavigationStack<Counter | SessionSettings | ActionMenu | NotFound> }
```

**Changes to the Counter itself.** `FK/examples/counter/core/src/navigation.ts:20-23` gains a slug, the route, and `screenOf`. This is type-checked in `/tmp/navproto/api/counter.ts`:

```ts
/** The Counter's only route: its root at the Program's slug. `/counter`. */
export const counterRoute = Navigation.root(
  Route.caseOf<Counter, {}>(Route.here, {
    embed: () => Counter(),
    extract: destination =>
      isCounter(destination) ? Option.some({}) : Option.none(),
  }),
  { title: () => 'Counter' },
)

/** The Counter's navigation: one root Destination at `/counter`. */
export const navigation = Navigation.make({
  slug: Navigation.Slug.make('counter'),
  Destination: Counter,
  root: Counter(),
  routes: [counterRoute],
  screenOf: model => Option.some(counterScreen(model)),
})
```

Everything else is library-owned:

- **`/counter/session`:** `Navigation.push(sessionRouteCase, { isAllowedAbove: isProduct, title: () => 'Session' })` inside `Session.compose`.
- **`/counter/menu?q=…`:** `Navigation.present(menuRouteCase, Dialog(), { isAllowedAbove: below => !isActionMenu(below), title: () => 'Actions' })` inside `ActionMenu.compose`. `focus` is restored by `settle`.

The Counter Program itself is untouched, which honors Q112-D, decided (`FK/docs/adr/0011-one-program-hosts-and-ports/qanda.md:3520-3533`). Section 8 asks the owner to confirm that session chrome is not the "Settings" Q112 kept out.

**What each carrier shows:**

| URI                     | Web (React Router carrier)                                                                             | React Navigation (Expo app)                                           | Expo Router app                             | OpenTUI                                                         | CLI                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `/counter`              | Count and buttons; "Actions (⌘K)"                                                                      | Root card titled "Counter"                                            | Same, route `[...path]` with key `/counter` | `counter` header, count, button row                             | `uri /counter` then the paint                 |
| `/counter/session`      | Session page, a new history entry; Back goes to `/counter`                                             | Card pushed, back button "Counter"; swipe or Android back pops        | Same                                        | `counter › session [esc] back`, Session screen                  | `uri /counter/session` then the Session lines |
| `/counter/menu?q=re`    | Dialog over the Counter (`ActionMenuDialog`), a history entry; Back closes it; typing replaces the URL | `transparentModal` with fade over the Counter; Android back dismisses | Same                                        | Boxed menu over the dimmed Counter; Esc in the filter dismisses | Menu lines with `query "re"`                  |
| `/counter/session/menu` | Dialog over the Session page                                                                           | Modal over the Session card                                           | Same                                        | Box over the dimmed Session screen                              | Session lines, then the menu                  |
| `/counter/nope`         | "No page at /counter/nope"; Back goes to `/counter`                                                    | NotFound card pushed over the Counter                                 | Same                                        | NotFound screen, `[esc] back`                                   | `uri /counter/nope` and the NotFound text     |

**The Session settings page.** `screenOf(SessionSettings)` paints:

- the line "Navigation is mirrored on every device" or "Navigation stays on this device";
- `actionButtons` for `MirrorNavigation` and `KeepNavigationLocal`, built from the Catalog with their Disabled sentences;
- the line "Following: nobody";
- a peer list. Follow buttons per peer need payload Buttons (section 8).

**Flows that exercise every carrier:**

1. **⌘K, then browser Back (web).**
   - `OpenedActionMenu` gives `[Counter, Dialog Menu]` and plan `/counter/menu`, so the carrier does `Push` (`pushState`).
   - Back fires popstate with stored keys `['/counter']`, a strict prefix, so `NavigatedBack('/counter')`, and the menu closes. No write follows, because the plan now equals the carrier.
2. **Choose "Session settings" from the menu.**
   - The Messages are `ChoseActionMenuAction`, then `OpenSessionSettings`, giving `[Counter, Push SessionSettings]`.
   - Web: snapshot `[/counter, /counter/menu]` against plan `[/counter, /counter/session]` is `Replace(1, 1)`, so `replaceState`. Back then goes straight to `/counter`.
   - React Navigation: one keyed reset. The modal top is gone and a card top is new: iOS dismisses and pushes. Verify on a device.
3. **Swipe back from Session (iOS).** `onDismissed` dispatches POP, the state event shows keys `['/counter']`, and that gives `NavigatedBack('/counter')`. The Program agrees and nothing is written.
4. **Mirror, two devices.** The laptop opens Session settings; the phone receives `RemoteMessageReceived(OpenSessionSettings)`, the plan changes, and the phone animates a native push with no local fact.
5. **SharedDomain.** Only the originating device moves. `Increment` from either menu still changes both counts.
6. **CLI daemon.**
   - `counter open /counter/session` prints `uri /counter/session`.
   - `counter back` prints `uri /counter`.
   - `counter menu open` prints `uri /counter/menu`, and under Mirror the web tab shows the dialog too.
7. **Cold deep link (phone).** `foldkit-counter://counter/session/menu?q=re` launches. After Ready, `OpenedUri(Launch)` is folded. Under SharedDomain the stack is three entries with no animation; under Mirror it is ignored and the phone joins the room's screen.

---

## 7. API, files, migration, tests

### 7.1 Where everything lives

| File                                                                                             | Contents                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FK/packages/foldkit/src/route/parser.ts` (change)                                               | `PrintState` export, `here`, `field`, `splitUri`, segment encoding and decoding                                                                                                                                                           |
| `FK/packages/foldkit/src/navigation/structure.ts` (change)                                       | `entriesOf`, `truncated`, `isOpaque`                                                                                                                                                                                                      |
| `FK/packages/foldkit/src/navigation/declaration.ts` (new)                                        | `Slug`, `Placement`, `DestinationRoute`, `root`, `push`, `present`, `liftRoute`, `StackLens`, `HistoryMode`, `ProgramNavigation`, `make`, `NotFound`                                                                                      |
| `FK/packages/foldkit/src/navigation/uri.ts` (new)                                                | `printStack`, `parseStack`, `canonicalUri`, `defaultUri`                                                                                                                                                                                  |
| `FK/packages/foldkit/src/navigation/message.ts` (new)                                            | `UriVia`, `OpenedUri`, `NavigatedBack`, `Message`                                                                                                                                                                                         |
| `FK/packages/foldkit/src/navigation/transition.ts` (new)                                         | `applyMessage` (section 1.2 fold)                                                                                                                                                                                                         |
| `FK/packages/foldkit/src/navigation/carrier.ts` (new)                                            | `CarrierEntry`, `CarrierPlan`, `planOf`, `CarrierSnapshot`, `CarrierMove`, `carrierMove`, `classifyCarrierChange`, `Expectation`, `CarrierEvent`, `CarrierDriver`, `CarrierOptions`, `CarrierDiagnostic`, `runCarrier`, `launchWhenReady` |
| `FK/packages/foldkit/src/navigation/compose.ts` (new)                                            | `Navigation.compose`, `mount`, `mountEach` (phase 3)                                                                                                                                                                                      |
| `FK/packages/foldkit/src/navigation/browserHistory.ts` (new)                                     | `browserHistoryDriver` (export subpath `foldkit/navigation/browser`)                                                                                                                                                                      |
| `FK/packages/foldkit/src/interaction/interaction.ts` and `bind.ts` (change)                      | `NavigationInteraction`; `BoundInteraction` navigation members                                                                                                                                                                            |
| `FK/packages/foldkit/src/program/program.ts` (change)                                            | `navigation?:` uses the unified `ProgramNavigation`                                                                                                                                                                                       |
| `FK/packages/foldkit/src/program/sync.ts` (change)                                               | lifts `navigation` and the facet `whenReady`                                                                                                                                                                                              |
| `FK/packages/foldkit/src/actionMenu/actionMenu.ts` (change)                                      | built on `Navigation.compose`; extends an existing stack; menu route plus `settle`; chose-before-action                                                                                                                                   |
| `FK/packages/foldkit/src/session/session.ts` (**(WT)**, change)                                  | `SessionSettings` Destination, route, `OpenSessionSettings`, `screenOf`, presence follow (phase 3)                                                                                                                                        |
| `FK/packages/foldkit/src/cli/program.ts` (change)                                                | `open`, `back`, `where`, `--at`, the URI line                                                                                                                                                                                             |
| `FK/packages/react/src/navigation/navigation.tsx` (new, `@foldkit/react/navigation`)             | `FoldkitRouter`, `useNavigationPlan`, `NavigationScreen`                                                                                                                                                                                  |
| `FK/packages/react-native/src/navigation/` (new, `@foldkit/react-native/navigation`)             | `nativeStackDriver`, `NativeStack*` types, `nativeStackOptionsOf`, `EntryContent`, `DeepLinkConfig`, `programUriOf`                                                                                                                       |
| `FK/packages/react-native/src/react-navigation/` (new, `@foldkit/react-native/react-navigation`) | `FoldkitStack` (the only module importing `@react-navigation/*`)                                                                                                                                                                          |
| `FK/packages/expo-router/` (new, `@foldkit/expo-router`)                                         | `FoldkitStackLayout`, `FoldkitEntryRoute`, `makeRedirectSystemPath`                                                                                                                                                                       |
| `FK/packages/opentui/src/interaction/` (change)                                                  | `runOpenTui(…, { launchUri })`, `paintPlan`, leak and Ctrl+C fixes                                                                                                                                                                        |
| `FK/examples/counter/*`                                                                          | core navigation and app; react: `FoldkitRouter`; expo: `FoldkitStack`; **new** `expo-router` host; opentui: `launchUri`; cli: no code change                                                                                              |

### 7.2 Migration from today's two seams

**Keep:**

- `NavigationStack`, `PresentationStyle`, the builders and `NavigationStack(Schema)` (`structure.ts:1-235`).
- `stackInstructions` and `applyStackInstructions`, which stay tested but are no longer used by carriers (`structure.ts:237-427`).
- `urlRequest.ts` and the `makeApplication` routing callbacks for non-stack Foldkit HTML apps (`FK/packages/foldkit/src/runtime/runtime.ts:543-546, 1717-1730`).
- `pushUrl` and friends for those apps (`FK/packages/foldkit/src/navigation/index.ts:54-85`).
- `route/parser.ts` (extended) and `route/transition.ts`.

**Change:** program, sync, actionMenu, session, interaction, bind, the CLI and the OpenTUI runner, as listed in 7.1.

**Delete:**

- **`plugin.ts` and `plugin.test.ts`.** This removes `RouterPlugin`, `NativeCall`, the three plugins and `createNavigationAdapter` (`FK/packages/foldkit/src/navigation/plugin.ts:1-225`). It removes their latent bugs too:
  - `SetRoot` printing the root under entries (`:94-100`);
  - React Navigation `ReplacePath` mapped to Back plus push (`:185-196`);
  - silent parse drops (`:162-171`).
- **`runtimeSeam.ts` and its test**, and the corresponding exports in `navigation/public.ts:42-60`.
- **After Counters migrates (phase 3):** `routerBridge.ts`, the reconciliation in `reactRouterMain.tsx`, `navigatorInstructions.ts`, `expoRouterCodegen.ts` and the hand-declared `/counters/:counterId` routes (`FK/examples/counters/core/src/route.ts:21-41`).
- **Docs:** rewrite the glossary's HistoryPort and Seam entries (`FK/glossary.md:110-115`), and write ADR 0012, "Navigation carriers", superseding ADR 0010 (`FK/docs/adr/0010-program-navigation-seam.md:5`).

**Order:**

1. **P0, Route additions.** Encoding, `here`, `splitUri`, with tests.
2. **P1, core.** Declaration, uri, message, transition, carrier, `Navigation.compose`, the ActionMenu, Session and sync changes, and the Counter core.
3. **P2, adapters.** Web, then React Navigation, then OpenTUI and the CLI, then Expo Router as a new host.
4. **P3.** The mount law, migrating Counters, and presence follow.

The old seams can be deleted at the end of P1, because nothing in `FK/examples/counter` imports them.

### 7.3 Test plan

**Pure tests (vitest, `FK/packages/foldkit/src/navigation/*.test.ts`).** The scenarios below are already written as `/tmp/navproto` simulations, ready to port.

- **`uri.test.ts`:**
  - the section 2.3 table;
  - encoding (`/counters/counter/a%20b`);
  - property tests through `Schema.toArbitrary` (present in Effect 4: `FK/node_modules/.pnpm/effect@4.0.0-beta.97/node_modules/effect/dist/Schema.d.ts:9059`), filtered to valid stacks: print is idempotent through parse, keys are unique and prefix-closed, and parse equals the stack with non-addressable fields reset;
  - `make` rejecting a missing Root route, colliding literals and reserved segments.
- **`transition.test.ts`:**
  - truncation by path keeps lower-entry configuration;
  - a `NavigatedBack` with no matching entry falls back to parsing;
  - Launch is ignored under a Mirror policy;
  - `settle` restores menu focus.
- **`carrier.test.ts`:**
  - `carrierMove` and `classifyCarrierChange` tables;
  - `runCarrier` with fake drivers for every section 3.6 scenario;
  - correction budget exhaustion, expectation timeout, and coalescing (three Model changes during one in-flight `go` give one write);
  - Starting gating, launch while Starting, and repeated start and stop (StrictMode).
- **`compose.test.ts`:**
  - suffix law (product navigation drops the menu);
  - Escape fallback (Escape with `meta` too);
  - chose-before-action order;
  - sync lifting (plan `None` while Starting, then Some);
  - Session plus ActionMenu union and reserved-segment assertion.

**Adapter tests:**

- **`browserHistoryDriver`** under jsdom: push, replace, `go` and popstate; state surviving reload; a hash-only entry reading as an unknown entry; basename; throttled Reconfigure.
- **React:** `FoldkitRouter` with `@testing-library/react`. A `<Link>` click gives `OpenedUri(Link)` and the URL updates; `useNavigate()(-1)` gives `back`; StrictMode works.
- **`nativeStackDriver`** with a fake structural container:
  - the reset payload keeps `routeNames` and `key`;
  - `target` is set;
  - the generation suffix appears after a native removal;
  - foreign keys read as unknown.
- **Expo:** `stackOf` and `__root` targeting; `makeRedirectSystemPath` for `initial` true and false.
- **OpenTUI:** `createTestRenderer` paint of the plan (header, overlays, dim); Escape gives `NavigatedBack`; the renderable count stays flat across 100 repaints.
- **CLI:** `runProgramCommand` `open`, `back`, `where`; extend `FK/examples/counter/cli/src/cli.integration.test.ts` for the daemon.

**Device and browser checks** (not verifiable here):

- **Browsers** (Chrome, Safari, Firefox): Back, Forward and long-press jumps across the section 6 URIs; reload at a deep URL under SharedDomain; bfcache restore (the runtime reloads, `FK/packages/foldkit/src/runtime/browserListeners.ts:133-146`); Safari's `replaceState` limit while typing in the menu.
- **iOS simulator:**
  - interactive swipe cancelled halfway, which should give no fact;
  - the long-press back menu popping several entries;
  - formSheet and modal swipe-down;
  - a remote push arriving during an interactive swipe (native defers updates during transitions, `SCR/ios/RNSScreenStack.mm:589-609`);
  - re-push after a native dismissal (generation key);
  - menu-to-Session replace;
  - the Dialog `transparentModal` look.
- **Android emulator:** hardware back on the menu, on Session and at the root (exit); header back; formSheet drag.
- **Expo Router on device:** the cold deep link builds three entries; the warm link goes through `+native-intent`; the first anchor reset does not animate.
- **Terminals:** Escape latency; a double Escape pops once; Ctrl+C runs cleanup.

---

## 8. Risks and open questions, each with a recommendation

1. **Should the menu filter be in the URL (`/counter/menu?q=re`)?** It follows the glossary's query rule, but it costs a write per keystroke. **Recommend yes, with the 300 ms web throttle.** If the owner prefers fewer writes, drop `q` from the route (one line) and keep only `/counter/menu`.
2. **Escape as back on the web.** It is consistent with "key routing in core" (Q91), but unusual in browsers. **Recommend on by default** through `backKeys`, so a web host can declare `[]`.
3. **Launch under Mirror.** **Recommend:** ignore Launch under Mirror (section 5.4), decided in the fold from `sessionPolicyOf`. This depends on the in-progress Session work landing.
4. **Converging stacks when entering Mirror.** **Recommend** that `MirrorNavigation` carry the switcher's URI.
5. **Snapshot projection under Mirror.** `CountProjection` drops navigation (`FK/examples/counter/core/src/wire.ts:34-55`), so joiners diverge. **Recommend:** the snapshot carries `navigation` (and `session`) when the folded mode is Mirror and resets it under SharedDomain. This is a sync-layer change.
6. **Session settings in the gospel Counter versus Q112-D.** **Recommend:** treat it as library chrome in `Session.compose`, so the Counter Program is unchanged. The owner should confirm this is not the product "Settings" Q112 excluded.
7. **Web coexistence.** Foldkit must own `window.history`. A host app's `createBrowserRouter` on the same page will desynchronize deltas. **Recommend:** document it; offer `basename` for sub-path embedding; do not build a data-router driver on `@private` APIs.
8. **iOS: a card after a modal is invisible** (`SCR/ios/RNSScreenStack.mm:675-724`). **Recommend:**
   - v1: `make` rejects a Push route allowed above a non-opaque Destination, unless that route itself presents. This is true for the Counter.
   - v2: presentation groups, one nested stack per presented entry (`ER/src/react-navigation/native-stack/views/__tests__/NativeStackView.nested-presentation.test.native.tsx#L29-L108` shows the pattern). Android formSheets reject nested stacks, so those stay flat.
9. **Expo Router vendors React Navigation, and `@react-navigation` imports are Metro errors there.** **Recommend:** keep the structural driver free of `@react-navigation`, use separate host projects, and keep `FoldkitStack` in its own subpath. Expo web is out of scope for v1, because expo-router's own history sync would be a second writer.
10. **Presence facts on the tape.** `ChangedPeers` and follow moves would be written to the shared log on every presence tick (HEAD `start.ts:612-618` persists every child Message). **Recommend:**
    - a third category, `Local`: applied only on the origin and kept in the local journal for replay, never written to the shared log;
    - `OpenedUri({ via: Following })` stays `Navigation`, so the follower's own rows replay what it saw.
11. **UiNode has no Link, and Button carries only an Action tag** (`FK/packages/foldkit/src/renderers/types.ts:28-37`). Following a specific peer, or linking to a Destination from a screen, needs either a payload on Button or a `Link({ uri })` node. **Recommend** `Link({ uri })`: a fact-producing node that every painter maps to its native link and that reports `OpenedUri(Link)`.
12. **Follow RemoteControl.** **Recommend deferring it.** When it lands, the follower's moves become leader-addressed requests that the leader's Program folds or ignores, so truth stays with the leader.
13. **Mount representation.** Nested stacks are recommended (section 1.5) over flattening child entries into the parent stack. Flattening needs context-dependent parsing, because a child entry needs the key printed beneath it.
14. **Engine routes collide with navigation.** `/{programId}/state` and `/{programId}/replay` (`FK/packages/foldkit/src/program/route.ts:346-349, 481-485`) share the path space. A Program whose `id` equals its slug would make `/counter/replay` ambiguous. **Recommend** a reserved prefix: `/_foldkit/{programId}/…`.
15. **`?sync=shared-domain` in the React host** (`FK/examples/counter/react/src/main.tsx:16-26`). It is dropped by the canonical redirect on the first reconcile. **Recommend:** move the mode to Session state (in progress) and delete the query flag. Until then, start the carrier after reading it, and accept that a reload loses it.
16. **Word collisions.**
    - "Mount" also names the DOM lifecycle primitive (`FK/CLAUDE.md`, "Choosing Lifecycle Primitives").
    - "Carrier" now also appears in `CatalogCarrierOf` (`FK/packages/foldkit/src/catalog/catalog.ts`, committed in `69161aecd`).

    **Recommend:** keep the glossary meanings and rename the type to `CatalogCarriage`, or note the collision in the glossary.

17. **Replay and devtools.** Time travel would make carriers write history for replayed Models. **Recommend:** carriers detach while the runtime is inspecting (`ProgramRuntime.replay`), or force `historyOf = Replace`.
18. **Unverified at runtime:**
    - iOS and Android animations for keyed resets;
    - two instances of one Expo route with different presentations;
    - `addListener('state')` duplicates in the vendored expo-router container;
    - late native events for screens our code removed (they should be harmless no-ops: `ROUT/src/StackRouter.tsx:557-581`).

    The device checklist in 7.3 covers all of them before P2 ships.
