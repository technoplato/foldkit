# ADR 0009 | Portable navigation adapters and one painted screen

Date: 2026-08-24

Status: Proposed for detailed review

## Context

ADR 0003 made Navigation a Schema sum type in the Model and proved it with
Multiple Counters: list, detail, and two mutually exclusive detail modes
(counter fact alert, delete confirmation). Carriers resolve canonical URIs
into `OpenedNavigation` through `resolveNavigationCarrier`, so deep links
already have one source of truth.

What is still missing is the other direction, at native fidelity. When the
Model's Navigation changes, each platform must translate that fact into its
own router operations: history entries on web, stack pushes and modal
presentations on React Native, file routes under expo-router. Today nothing
owns that translation, so every client would reinvent it with slightly
different semantics. Separately, ADR 0008 owns how one product tree paints to
DOM, ASCII, and terminal; this ADR owns how one Navigation state moves each
platform's router. The two together give the full story: paint the same tree,
drive the same transitions, from the same state.

## Decision

### 1. Adapters never decide navigation

The Program projects transitions; adapters execute them.

```text
navigatorInstructions(previous, next) -> ReadonlyArray<NavInstruction>

NavInstruction
  PushCounterDetail(counterId)
  PopCounterDetail
  PresentCounterFactAlert(counterId)
  DismissCounterFactAlert
  PresentDeleteConfirmation(counterId)
  DismissDeleteConfirmation
```

Pure, exhaustive, ordered. Mode swaps emit dismiss then present. Detail to
detail across ids emits pop then push; adapters may collapse that pair onto a
native replace. Committed and tested in
`examples/counters/core/src/navigatorInstructions.ts`.

### 2. One four-call contract per adapter

```ts
interface Navigator {
  readonly push: (path: string) => void
  readonly pop: () => void
  readonly present: (path: string) => void
  readonly dismiss: () => void
}
```

`applyNavigatorInstructions` walks projected instructions and prints paths
from the same routers the carrier parses, so pushes and deep links cannot
disagree. A new surface implements four functions and subscribes to Model
transitions; it writes no routing logic of its own.

### 3. Router mapping matrix

| Scenario                 | Foldkit HTML             | React web + tanstack-router  | RN + react-navigation                   | Expo + expo-router                 | CLI / TUI          |
| ------------------------ | ------------------------ | ---------------------------- | --------------------------------------- | ---------------------------------- | ------------------ |
| List at boot             | runtime route `/counter` | `createRouter` root route    | initial route of Stack                  | generated `app/index.tsx` redirect | argv default       |
| Show detail (push)       | internal link            | `history.push(detail)`       | `navigate('CounterDetail')`             | generated `[counterId].tsx` push   | screen switch      |
| Modal on detail (fact)   | overlay paint            | dialog over route            | `navigate(..., {presentation:'modal'})` | generated `fact.tsx` modal route   | mode row in screen |
| Modal on detail (delete) | overlay paint            | confirm dialog               | modal, destructive                      | generated `delete.tsx` modal route | gated handle       |
| Modal on home (add)      | overlay paint            | sheet/dialog on list         | presentModal on list route              | generated list-modal route         | interaction prompt |
| Dismiss / pop            | Message only             | `history.back()`             | `goBack()` / `dismiss()`                | `router.back()`                    | Message only       |
| Deep link cold start     | carrier parse            | loader redirects via carrier | linking config maps path                | file route params via carrier      | argv via carrier   |

Status: instructions + Navigator contract and expo-router generation are
implemented and tested. tanstack-router, react-navigation, and the generated
file wiring land with their client packages; each is now a thin consumer of
the committed contract.

### 4. expo-router files are generated, deterministically

`expoRouterFiles()` emits the app directory from the route table: index
redirect, list route, `[counterId]` push route, and `fact` / `delete` modal
routes whose screens forward params into the carrier path helpers. Output is
byte-stable across runs (tested), checked in, and regenerated when the route
table changes. File-based routing becomes a build artifact of the Program,
not a second hand-written source of truth.

### 5. Child collections ride compose.forEach

`Program.compose.forEach({ of: CounterProgram })` already derives
`{ nextId, rows }` with `GotChild({ id, message })`, add/remove, and command
mapping, mirroring TCA's ForEachStore. Counters' hand-rolled
`GotCounterMessage` + `rows` has the same shape (`{ id, counter }`). Follow-up
migration: give forEach an embedded-fields option so collection state composes
alongside sibling Model fields (navigation, identity ledgers), then delete the
hand-rolled arms. Until then both shapes coexist without drift risk because
the manual pattern is covered by the same tests.

## Consequences

- One more indirection between Model and native APIs. Accepted: it is the
  only seam at which platform routers may touch navigation, and it is fully
  testable without any device.
- Instruction vocabulary grows only when Programs grow destinations; adding a
  destination means adding printers plus instructions plus generated routes
  in one change.
- Modal-on-home (add-counter sheet) needs a home-presentation instruction
  pair when it ships; the union extends without breaking existing adapters.

## Files

- `examples/counters/core/src/navigatorInstructions.ts` (+ test)
- `examples/counters/core/src/expoRouterCodegen.ts` (+ test)
- Related: ADR 0003 navigation-as-state, ADR 0008 atomic UI surfaces

## Amendment 2026-08-24 | Destination-carries-style, joint states, and the root seam

Owner review settled the open question about where presentation intent
lives. The answer: in destination state, generalized in the framework, not
in per-app instruction unions.

1. `foldkit/navigation` now ships the vocabulary:
   `PresentationStyle` (Push | Sheet | BottomSheet | FullScreenCover |
   Dialog | Popover(anchor) | Drawer(from: Side)), `Presented`, and
   `NavigationStack` with `stackInstructions` / `applyStackInstructions`
   obeying `apply(diff(a, b), a) == b`. Adapters translate style cases to
   native presentations; they never decide when to navigate.

2. Vocabulary rule learned from owner review of `DrawerFromLeft` /
   `DrawerFromRight`: a closed axis with a real reader becomes a named
   payload ADT on its case (`Drawer { from: Side }`), never suffix-enumerated
   case names. Suffixes defeat structural grouping and do not scale.

3. Joint presentation composes instead of optionaling: drawer-open-while-
   popover-presented is two stacked entries. No stored booleans anywhere;
   style views derive (`presentationStyleOf`) from destination kind.

4. State-to-URI is law, not convention: `canonicalNavigationUri` /
   `navigationFromUri` prove print-parse round trips at the skeleton level,
   excluding transient presentation ids by design. A driven walk asserts
   URI changes iff navigation changes across every interaction. Next step:
   lift this into a Program-level navigation config so every surface syncs
   state to URI through one runtime boundary (root-level seam), composing
   applications deterministically.

5. Hole-26 reclassification: prefixed identity grammar keeps composite
   segments because interactionGraph legitimately mints ids from colon-
   composite occurrence identities and nothing parses on colons.

Borrowed from Point-Free SwiftNavigation: per-case concurrent
presentations, item-over-isPresented discipline (no boolean beside a
destination), per-entry URI printing. Rejected: binding write-back
(unidirectional flow), type-erased path values (Schema types print
directly), imperative dismiss actions (dismissal is Pop).
