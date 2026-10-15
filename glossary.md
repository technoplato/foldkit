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
  Prior art: `examples/counter/core/src/program.ts` `projectDomain`.
- **Message**: a record of something that happened, folded by update.
  Either an Action, which a person presses and is named by its verb
  (`Increment`, `Add`), or a Fact, which a Command, Subscription, or carrier
  produces and is named in the past tense (`RefreshedBalances`); see both
  below. e.g. `Increment({ via })`.
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
- **Engine**: where Messages travel: Instant, Supabase, Kafka, Memory
  (tests), or Local (a durable log for one machine, no sync). A host's
  choice, never core's. Defined in full under "Plans vocabulary" below.
- **Gate / Synced**: the session ADT an engine wraps around an app:
  `Starting | Failed({ error }) | Ready({ app })`. A Program without an
  engine has no gate; it can never be "Starting".
- **Tape / Message log**: the append-only log of enveloped Messages. The
  law; snapshots are cache.
- **Snapshot**: a cached fold of the tape. e.g. `{ value: 8, at, asOf }`.
- **Watermark**: the proof of which Messages a snapshot already includes,
  so boot does not double-fold. e.g. the newest row's position, `count:
2694`, and a fingerprint of those row ids (ADR 0013).
- **Local snapshot**: one device's own fold of the tape, kept in
  `localStorage`, AsyncStorage, or a file, with its watermark. A reload
  paints it at once and folds only the rows since (ADR 0013).

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
- **NavigationStack**: `{ root, pages, maybeModal }`
  (`packages/foldkit/src/navigation/structure.ts`). Root always exists, so
  an empty stack is unrepresentable. `maybeModal` holds at most one
  `Modal`, always over the pages, so two modals at once and a page above a
  modal are unrepresentable too. e.g. `/counter/session/menu` is
  `{ root: Counter, pages: [SessionSettings], maybeModal: Some(menu) }`.
- **Choosing Action**: a Catalog Action that fills one field from a value
  the person picks second, declared with `choose`. It is one entry
  everywhere: the menu shows `Decrement counter ›` and then asks "Which
  counter?", a button presses `DecrementCounter:3`, the CLI takes
  `decrement-counter 3`, and a bare press or key takes the preferred
  choice, such as the counter whose page is open.
- **ModalStyle**: every PresentationStyle except `Push`. A modal covers the
  pages; pushing a page while one is open puts the page beneath it.
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
  unchanged. e.g. the child Action `Increment({ via })` lifts to parent Message
  `GotCounter({ id: 'c1', message: Increment({ via }) })` (compose.forEach
  `GotChild` prior art). Catalog lift = the same wrapping applied to
  derived handles and agent tools so callers never build wrappers by hand.
- **Carrier**: the host-specific spelling of a URI: browser location, argv
  (`counter show`), custom scheme (`foldkit://counter/c1`), deep link.
- **Carrier plan**: what every carrier shows for one Model: the stack's
  entries root first, each keyed by its printed path, plus the whole
  stack's URI. e.g. keys `/counter`, `/counter/session`,
  `/counter/session/menu` with URI `/counter/session/menu?menu.q=re`
  (`navigation/carrier.ts`).
- **Carrier driver**: the only code a carrier adapter writes: `read`,
  `perform`, `subscribe`. e.g. `browserHistoryDriver(window)` for the web,
  `keyedStackDriver(stack)` for React Navigation and Expo Router.
- **Carrier loop (ADR 0012)**: `runCarrier(bound, driver)` writes the
  carrier toward the plan and reports a change the plan did not cause as
  `OpenedUri` or `NavigatedBack`. e.g. browser Back from
  `/counter/session` reports `NavigatedBack({ uri: '/counter' })`.
  Supersedes the ADR 0010 seam (`HistoryPort`, `makeUriSync`).
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
- **Fact handle** (deprecated name; the plans say **Action handle**): a
  derived zero-arg sender for one Action, named
  `<tag>ButtonTapped`. e.g. `incrementButtonTapped()` sends
  `Increment({ via })`. The only construction site for Action values.
- **Component (.props)**: the React packaging of a fact handle:
  `<IncrementButton />` or `<button {...IncrementButton.props} />`.
- **Scene switcher (anti-pattern)**: swapping local view state without
  Model/Message/route composition. e.g. today's `examples/showcase`:
  empty `CounterScene {}` structs, hand-mirrored `urlToNavigation` /
  `navigationToPath`, children booted as separate apps. Not canonical.

## Plans vocabulary (proposed, 2026-10-09)

Terms introduced by `plans/` and not yet in code. Proposed until the plan that
owns each is accepted; then they move up into the sections above.

- **App**: a Program plus what every host needs to run it: how it syncs,
  whether it needs a server, the service tags it needs, the identity it
  requires. Declared once in core (`App.define`, plan 06) and engine-free:
  the example names its one engine in a descriptor every host imports, and a
  host may override it.
- **Engine (plans)**: the full definition of the entry above: a `LogEngine`
  value a host passes. e.g. a terminal resolves one from its configuration
  or the App's declared default; a browser passes
  `Engine.instant.browser(...)`.
- **LogEngine**: the engine interface: `append`, `readSince(cursor)`, `live`,
  and the capabilities it declares. Plan 06. Replaces today's Instant-shaped
  `SyncEngine`.
- **Cursor**: an engine-opaque read position: commit-ordered on Supabase,
  Kafka, and the Local log; receipt-ordered with an overlap re-read on
  Instant (plan 06).
- **Daemon**: the one process that holds a live App occurrence for a terminal.
  Plan 01.
- **Client (terminal)**: a short-lived process that talks to the daemon: a
  one-shot command, `tui`, `watch`, or `tail`. Plan 01. Not **View** below.
- **Liveness**: the daemon's reasons to keep running, as a value:
  `Idle({ since }) | Busy({ reasons })`. Only Subscriptions and
  ManagedResources declared `holdsDaemon` count, with Commands in flight,
  pending writes, and attached views (plan 01).
- **Fact**: a Message a Command, Subscription, or carrier produces and nobody
  presses, as opposed to an Action, which a person presses. Declared with
  `Fact.define` (plan 02) so it carries `writes`, `produces`, and a category
  like an Action. e.g. `RefreshedBalances`, `HeardFinal`, `OpenedUri`. (The
  older "Fact handle" entry above predates this split.)
- **Where**: where an Action is offered: `Where.everywhere` or
  `Where.at([CounterList, CounterDetail])`. The `at` key on a declaration.
  Not the navigation `Placement` (`Root | Entry | Fallback`), which is where
  a Destination sits in a stack, and not a peer snapshot offer (plan 06).
- **ModelPath**: a typed path into the Model as a value
  (`Field | Each | Variant | Present | Derived | Here`), where `Each` names the
  row key the array Schema declares, never an index. What `writes`, `reads`,
  and change lines use. Plan 02 and 07.
- **Mint**: a field the runtime fills at send time, behind a `Mint` service,
  with a 128-bit id (a UUIDv7), so an id is on the log before any fold sees
  it and two runs cannot collide. e.g. `Add` mints `counterId`. Tests use
  `Mint.sequence`, which draws valid UUIDv7s from a fixed time and a counter.
  Plan 02 and 05.
- **Capability**: something a host Layer can do, as a value
  (`Microphone()`, `AudioPlayer()`), declared as `needs` on an Action and read
  by availability so an Action is never offered where no Layer provides it.
  Plan 02 and 10.
- **Projection**: a headless Program, run by one leased server Processor,
  that folds Domain facts in log order and returns typed write Commands for
  an outside system that cannot read the log. Plan 06. Never a copy of a
  computed value for the Program's own hosts.
- **Owner**: whose log a row belongs to (`Person({ id })`, `Public`, or a
  `Room`), beside **Actor**, who wrote it. Policies and erasure go by owner.
  Plan 06.
- **Ownership**: a Model field's home, declared on the Schema: `Domain`
  (synced), `DeviceOwned` (this device only), or `Navigation`. A Message
  writes fields of one ownership; Domain and Navigation Messages are logged,
  Local ones are not; a Domain change reaches a device's own fields through
  **Reconcile**. Plan 02.
- **Reconcile**: a declared, never-logged step the runtime runs on every
  device after every fold step, with `reads`, `writes`, and a `when`
  sentence; its Navigation step reads only Domain and Navigation fields and
  its device step writes only DeviceOwned fields. e.g. dropping the page of
  a counter another device deleted. Plan 02.
- **Stamp**: a field the send path fills from the sender's Domain fields and
  the payload carries, so a refold reads it back. e.g. a counter's `number`
  at `Add`, from a high-water mark. Plan 02.
- **View**: the Model plus its derived fields (`Derive.declare`, typed
  `DerivationsOf<Model>`), what screens, refusals, and choices read; computed
  on read, memoized per Model. `update` never receives one. Plan 02 and 07.
- **Shell**: what stays on screen while the stack changes: a tab bar, a
  sidebar, a dock. Declared on the navigation (plan 04). Not glossary
  **Chrome**, which is cross-cutting UI state such as the action menu.
- **Prefix**: the host-owned path under which a Program is mounted inside an
  existing app, such as `/legacy` for `/legacy/counter`. Derived from the
  matched host route, never typed twice. Plan 04.
- **Tabs**: several stacks side by side with one active, one typed stack per
  tab. Plan 04.
- **Segment**: how an id prints as one word in a URI, a tag, or a command, as
  a `Codec<Id, string>`. e.g. `CounterIdSegment` prints a minted UUID as its
  26-character base-32 form `01j9r3x8k2q5z7w9v6b4n1m0p3`; the envelope and
  payloads keep the canonical 36-character UUID; a display label such as
  "Counter 3" is a stamped field, not the id. Replaces the deprecated word
  **Token** in plans.
- **Processor Host versus Host**: `Processor.Host` (`React`, `Cli`, `Tui`, ...)
  names the kind of runtime an occurrence runs on and spells `from`. Glossary
  **Host** above is the embedding surface that grants a carrier prefix. The
  code's name predates this glossary; plan 10 keeps `Processor.Host`.

## DEATH (temporary house)

Terms for `DEATH/`, the Distributed Elm Architecture Teaching Hospital.
This folder is a temporary house, not Foldkit public API.

- **DEATH**: Distributed Elm Architecture Teaching Hospital. The benchmark
  and contest. e.g. a team yields a counter that still answers increment
  after offline sync. Not DEF. Not ShrinkBench.
- **Gambit**: a wager with upside and downside. e.g. prepaid model budget
  plus optional stake: you get scored if the yielded program answers every
  claimed command; you lose the entry if the budget hits zero first. Not a
  gamble.
- **Patient**: the program under care. First patient: Foldkit Counter
  (`examples/counter`), visible number then plus then minus then shared
  then offline.
- **Yield**: the team locks Run A and asks for Run B. Scoring starts.
  e.g. agents stop, harness sends increment, program must answer.
- **Tape (DEATH)**: Messages recorded by a sync engine, then replayed onto
  programs and surfaces. e.g. peer `Increment` lands on the tape and folds
  through the same `update`. This is not glossary **Carrier** (URI
  spelling). Do not say "carriers" for sync replay.
