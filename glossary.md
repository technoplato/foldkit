# Glossary

Shared vocabulary for Foldkit, its examples, and ADR 0011. Every term gets a
concrete example. If a word is not in here and two files disagree about it,
add it here first.

## Program anatomy

- **Program**: one portable unit of Model + Messages + update + catalog +
  navigation + screen. e.g. `CounterProgram`. Knows nothing about React,
  browsers, or terminals.
- **Model**: the single source of truth for one Program occurrence. e.g.
  `{ count: 3 }`.
- **Domain**: the Model fields that are product truth and sync to peers.
  e.g. counters' `rows` and `retiredCounterIds`, but not `navigation`.
- **projectDomain**: the function selecting the synced subset of a Model.
  Prior art: `examples/counters/core/src/model.ts` `projectDomain`.
- **Message / Fact**: a past-tense record of something that happened, folded
  by update. e.g. `Increment({ via })`. Never imperative.
- **Action**: a catalog-declared Message a person or agent can cause on
  purpose. e.g. `Increment`, `Reset`. All Actions are Messages; not all
  Messages are Actions (`GotCounter` is not).
- **Catalog**: the single ordered value of all Action declarations. Menus,
  keyboard maps, buttons, agent tools, and analytics derive from it. e.g.
  `Catalog.make([Increment, Decrement, Reset])`.
- **Enabled / Disabled**: the one validity vocabulary on a declaration.
  e.g. Reset at count 0 is `Disabled({ because: 'count is already 0' })`;
  the button disables with it, the menu dims with it, the agent refuses
  with the same sentence.
- **update**: the pure fold `(Model, Message) => [Model, Commands]`. e.g.
  `Increment: () => [{ count: model.count + 1 }, []]`.
- **screen**: the host-neutral view tree a Program describes. e.g.
  `Column({}, Text('3'), Row({}, ...catalog.buttons(model)))`. Painters
  (React, TUI, ASCII) draw it; they never invent product controls.
- **Command**: a described side effect returned by update. e.g.
  `FetchWeather`, `pushUrl('/counter/c1')`.

## Provenance and sync

- **via**: the ADT on every Action recording how the occurrence arrived.
  e.g. `Increment({ via: Button({ label: '+', path: Detail({ id }) }) })`.
  Cases: Button, ActionMenu, Agent. Analytics, never behavior.
- **Envelope**: transport facts around a Message on the tape: who
  (`actor`), which occurrence wrote it (`from`), when. Not part of update's
  input.
- **ProcessorId / from**: the per-run id of one occurrence. e.g. a browser
  tab mints `react-a1b2c3` at boot; the same person's second tab has a
  different one. Used for live echo-skip only, never to skip history.
- **Actor**: who originated an occurrence: `Authenticated | Guest |
System`. Same person in two tabs = same actor, two `from`s.
- **Occurrence**: one running instance of a Program. e.g. the same Counter
  open in Safari, a TUI, and an iPhone is three occurrences with one tape.
- **Processor**: the running engine of one occurrence that consumes
  Messages and advertises capabilities.
- **Client**: one complete runnable adapter (browser app, CLI, Expo app).
  One Client can host several Processors.
- **Host**: the surface that embeds a Client and grants it a carrier
  prefix. e.g. the website mounts the gallery at `/`, an iOS app mounts it
  at `foldkit://gallery`.
- **Engine**: the sync transport a Program occurrence runs on. e.g.
  Instant, Memory. Local Programs have none.
- **Gate / Synced**: the session ADT an engine wraps around an app:
  `Starting | Failed({ error }) | Ready({ app })`. A Program without an
  engine has no gate; it can never be "Starting".
- **Tape / Message log**: the append-only log of enveloped Messages. The
  law; snapshots are cache.
- **Snapshot**: a cached fold of the tape. e.g. `{ value: 8, at, asOf }`.
- **Watermark**: the proof of which Messages a snapshot already includes,
  so boot does not double-fold (Q108, asking).

## Navigation

- **Destination**: a place a user can be; one case of a closed Schema sum.
  e.g. `Detail({ id: CounterId('c1') })`. Lives in the Model, in the stack.
- **Route**: the pairing of one Destination case with its URI shape via a
  parser-printer. e.g. `route(Detail, pipe(literal('counter'),
schemaSegment(CounterId)))`.
- **Router**: every Route of a Program composed; parses a path to a
  Destination and prints it back. Law: `parse(print(d))` equals `d`.
- **Path / URI**: the printed projection of a Destination. e.g.
  `/counter/c1`. Never stored in the Model.
- **Slug**: the branded URL word a Program owns for itself, declared once.
  e.g. `Counter.slug` prints `counter`; a parent writes `at: Counter.slug`,
  never the raw string.
- **NavigationStack**: `{ root, presented }` where presented is
  `NothingPresented | PresentingEntries` (`packages/foldkit/src/navigation/
structure.ts`). Root always exists, so an empty stack is unrepresentable.
- **Stack root vs root URI**: stack root = bottom entry of the stack
  (`Gallery()`); root URI = the path `/` that prints for the Program's
  default Destination. Related, not the same word.
- **PresentationStyle**: how an entry overlays what is beneath it: `Push |
Sheet | BottomSheet | FullScreenCover | Dialog | Popover | Drawer`. This
  is the tree/stack consolidation: one presented enum entry is tree-based
  navigation, a run of entries is a stack.
- **Mount**: grafting a child Program (router, catalog, Model slice) into a
  parent under the child's slug. Law: child `/` becomes parent
  `/counter/...`. Nesting composes: gallery mounts counters, counters
  mounts counter, so `/counters/counter/c1` exists with zero new child
  declarations.
- **Mount path**: the typed address of one mounted occurrence inside a
  composition. e.g. `['Counters', 'Counter', id]`. Disambiguates the same
  Program mounted twice.
- **Lift**: wrapping a child value so it travels through a parent
  unchanged. e.g. child fact `Increment({ via })` lifts to parent Message
  `GotCounter({ id: 'c1', message: Increment({ via }) })` (compose.forEach
  `GotChild` prior art). Catalog lift = the same wrapping applied to
  derived handles and agent tools so callers never build wrappers by hand.
- **Carrier**: the host-specific spelling of a URI: browser location, argv
  (`counter show`), custom scheme (`foldkit://counter/c1`), deep link.
- **HistoryPort**: the three verbs a carrier implements: `push`, `replace`,
  `back` (`runtimeSeam.ts`).
- **Seam (ADR 0010)**: `ProgramNavigation` + `HistoryPort` + `makeUriSync`;
  diffs observed Models' stacks and drives history. e.g. stack `[Gallery]`
  changing to `[Gallery, Push Detail(c1)]` emits one `history.push
('/counter/c1')`.
- **Deep link law**: every occupiable Destination prints a URI, including
  private ones. Access is permissions, not the absence of a link.
- **Query parameter**: shareable view configuration on a Destination, via
  `query()`. Identity goes in the path (`/counter/c1`); configuration goes
  in the query (`/songbook?search=hymn`). Never tokens, PII, or per-run ids.
- **Feature state**: fine-grained in-page state modeled as a nested ADT in
  the Model, not the URI. e.g. `Editing = Clean({ base }) | Dirty({ base,
draft }) | Saving({ base, draft })`. It may PROJECT into a URI
  (`/edit`) when deep-linkable, but the machine itself lives in the Model.

## Chrome and derivation

- **Chrome**: cross-cutting UI state that is not product truth: action
  menu, focus. Compositional; depends only on catalog projections, never on
  a concrete domain type.
- **Action menu**: the cmd-k combo box (Q91). Rows derive from the catalog:
  label, keys, Enabled/Disabled with its sentence.
- **Focus**: the single global answer to "what has the keyboard". One
  field; two focused things are unrepresentable (Q110/Q111).
- **Token**: deprecated. The old handwritten wire word (`'increment'`)
  between screen Buttons and Messages. Replaced by the tag-derived identity.
- **Fact handle**: a derived zero-arg sender for one Action, named
  `<tag>ButtonTapped`. e.g. `incrementButtonTapped()` sends
  `Increment({ via })`. The only construction site for Action values.
- **Component (.props)**: the React packaging of a fact handle:
  `<IncrementButton />` or `<button {...IncrementButton.props} />`.
- **Scene switcher (anti-pattern)**: swapping local view state without
  Model/Message/route composition. e.g. today's `examples/showcase`:
  empty `CounterScene {}` structs, hand-mirrored `urlToNavigation` /
  `navigationToPath`, children booted as separate apps. Not canonical.
