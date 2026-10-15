# Plan 02 | Total declarations: Actions, Facts, ownership, and what they touch

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R3-01, R3-04, R3-07, R3-09, R3-10, R3-13 to R3-15, R3-19, R4-01, R4-02,
R4-08 to R4-11, R4-13 to R4-15, R4-17, R4-19, R4-20). Closes audit
items 3 (narrow escape hatch), 8 (where an Action is offered), and 12 (ADT
smells), and the owner's rule: a value that may be `undefined` at the call
site is a smell.

Notation: sum types in this plan are written in outline form, `A | B({ x })`,
for brevity; each is an `S.Union` of callable tagged structs in code, as plan
02's North Star shows for `Openness`.

## The rule this plan applies

Constructors may take optional configuration. Declarations may not. Every
value a consumer reads (a declaration, an entry, a handle, a protocol frame)
is total: no `?`, no `| undefined`, no boolean standing in for a kind, no
string standing in for a structure. Where a constructor accepts an omission,
the declaration records the default it chose.

## What is wrong today, measured against the code

`packages/foldkit/src/catalog/catalog.ts` and its consumers:

- `ActionDeclaration.isPayloadFree: boolean` beside `maybeChoose: Option<…>`
  encode one three-way kind with two fields; `Entry.isPayloadFree` repeats it.
- `ChooseDeclaration.isOpen: boolean` and `valueOf: (token) => Option<unknown>`
  erase the value type at the declaration.
- Choice tags are strings (`choiceTagOf` prints `'Increment:3'`), and
  `useActions` exposes only payload-free Actions, so a component presses
  `bound.press('Increment:3')`.
- `ActionHandle.isEnabled` sits beside `maybeBecause` (two fields for one
  `Availability`), and every press returns a `boolean`.
- `enabled` is a function, so the sentence it refuses with exists only at run
  time; a skill cannot print "unavailable when the count is 0".
- Nothing says where an Action is offered; screens hand-pick tags
  (`entriesTagged(…, [Add.tag])`).
- Facts (`OpenedUri`, `HeardFinal`, `RefreshedBalances`) are plain tagged
  structs with no declaration at all, so nothing can say what they write.
- Nothing says which Model fields are synced, device-local, or navigation;
  `keepOnRefold` and `isLocalOnly` approximate it per Message and only on a
  refold, and an `update` arm may read any field, so two devices can fold one
  Message differently.
- `Program` has twelve optional members (`restore?`, `subscriptions?`,
  `managedResources?`, `ports?`, `migrations?`, `synchronization?`,
  `versionedEvents?`, `valid?`, `screen?`, `catalog?`, `interaction?`,
  `navigation?` in `packages/foldkit/src/program/program.ts`), and
  `ProgramSynchronization` has four (`sessionPolicyOf?`, `keepsOwnNavigation?`,
  `keepOnRefold?`, `isLocalOnly?`); `ProgramCommand` has three (`args?`,
  `key?`, `effectManifest?`).
- Ids are minted inside `update` (`nextCounterId`), so a refold can move them
  (R1-02; plan 05 carries the `forEach` fix, this plan carries `mints`).

## North Star

```ts
// examples/multiple-counters/core/src/model.ts
const Fields = S.Struct({
  counters: Keyed.array(CounterRow, 'counterId'), // CounterRow = { counterId, number, title: Option<Title>, count }
  highestNumber: S.Int, // the Domain high-water mark Add stamps from; a delete never lowers it (R4-08)
  navigation: Navigation.NavigationStack(Destination),
})
export const Model = Ownership.declare(Fields, { navigation: ['navigation'] }) // everything else is Domain; Program.make adds a DeviceOwned `forms` for the Fill Actions
const path = Path.of(Model)

// examples/multiple-counters/core/src/message.ts
export const Add = Action.press('Add', {
  what: 'Adds a counter at the end of the list, starting at 0',
  why: 'The person wants another count',
  label: 'Add counter',
  keys: ['a'],
  at: Where.at([CounterList, CounterDetail]),
  mints: { counterId: CounterId },
  stamps: { number: domain => domain.highestNumber + 1 }, // filled at send time from the sender's Domain fields, carried in the payload
  writes: [path.counters, path.highestNumber],
  refusals: [Refusal.when(isConfirming, 'answer the delete question first')],
  produces: [],
  leadsTo: LeadsTo.stay,
  needs: [],
})

export const Open = Action.choose('Open', {
  what: 'Opens the counter on its own page',
  why: 'The person wants to focus on one count',
  label: 'Open',
  keys: ['o'],
  at: Where.at([CounterList, CounterDetail]),
  field: 'counterId',
  Id: CounterId,
  segment: CounterIdSegment,
  prompt: 'Which counter?',
  choices: view => Array.map(view.counters, counterChoice),
  preferred: shownOf,
  openness: Openness.closed,
  nothingToChoose: 'there are no counters yet',
  writes: [path.navigation],
  refusals: [Refusal.when(isConfirming, 'answer the delete question first')],
  produces: [],
  leadsTo: LeadsTo.push(CounterDetail),
  needs: [],
})

export const Rename = Action.fill('Rename', {
  what: 'Names the counter',
  why: 'The person wants to tell counters apart',
  label: 'Rename',
  keys: [],
  at: Where.at([CounterDetail]),
  fields: { counterId: CounterId, title: Title },
  prefill: view => ({ counterId: shownOf(view), title: Option.none() }),
  writes: [path.counters.each.title], // the title; `number` is stamped once and never written again
  refusals: [],
  produces: [],
  leadsTo: LeadsTo.stay,
  needs: [],
})

export const DeletedCounter = Fact.define('DeletedCounter', {
  what: 'A counter is gone, on every device',
  fields: { counterId: CounterId },
  writes: [path.counters],
  produces: [],
  leadsTo: LeadsTo.stay, // Domain facts never move navigation themselves; reconcile does
})

// examples/multiple-counters/core/src/reconcile.ts
export const reconcile = Reconcile.declare(Model, {
  reads: [path.counters, path.navigation],
  writes: [path.navigation],
  when: 'a Destination names a counter the list no longer has',
  step: (shared, evolve) =>
    evolve({
      navigation: Navigation.withoutDestinations(destination =>
        namesMissingCounter(shared, destination),
      ),
    }),
})
```

And what every host gets, typed:

```tsx
const { model: count, actions } = useFeature(
  Counters.row(counterId),
  row => row.count,
)
actions.add.press() // Press: the runtime mints counterId and stamps number at send time; returns Sent | Refused({ because })
actions.open.choose(counterId) // Choose: a typed value, never a string tag
actions.open.for(counterId).availability // one choice's availability, not the whole list
actions.rename.fill({ counterId, title }) // Fill: the payload Schema's Type
actions.reset.availability // Enabled | Disabled({ because })
```

## Kinds

```ts
export const ActionKind = S.Union([
  Press(),
  Choose({
    field: FieldName,
    prompt: S.String,
    nothingToChoose: S.String,
    openness: Openness,
  }),
  Fill({ fields: S.Array(FieldName) }),
])

export const Openness = S.Union([Closed(), Open()]) // Open: a value not in the list is accepted when the Schema decodes it
```

- **Press** has no payload the person supplies. It may still carry minted
  and stamped fields (below).
- **Choose** fills one field from choices the Model offers. The field's
  value may be a Struct, which is how a child's Choose lifts over a list as a
  two-step choice: the lifted `Export` has one payload field, `selection`, a
  Struct of `counterId` and `format`, so the wire shape (plan 09) is one
  object under one key. `Open` keeps today's `accepts`: Books, Read Aloud, and the transcript
  player let a person type a page or a position that is not in the list.
- **Fill** takes a payload the caller supplies. It renders as a form on hosts
  with one, as `counters rename <counter> --title Standup` on the CLI, and as
  a menu row that opens the form.

### Minted and stamped fields

`mints: { counterId: CounterId }` names fields the runtime fills at send time
behind a `Mint` service. A minted id is 128 bits: `Id.uuid7('CounterId')`
declares a branded UUIDv7, time-ordered and collision-free at any scale. The
row's own `id` is minted the same way. `Mint.live` draws UUIDv7s;
`Mint.sequence(seed)` in tests draws valid UUIDv7s from a fixed time and a
counter, so a test id decodes everywhere a live one does and prints short in
test names through `Id.short` (R3-13).

`stamps: { number: domain => domain.highestNumber + 1 }` names fields the
send path fills from the sender's Domain fields and the payload carries, so a
refold reads them back instead of recomputing them. A counter's `number` is
stamped once, at `Add`, from a Domain high-water mark that `Add` raises and
`DeletedCounter` never lowers, so "delete Counter 2, add another, and you get
Counter 3" holds on one device; it repeats only when two devices add before
either sees the other's row (R3-10, R4-08). The number and the name are two
fields: `Rename` writes `title`, never `number`, so a renamed counter keeps
its number. A stamp reads `DomainOf<Model>` plus the DeviceOwned fields its
declaration names (`stamps.reading: [path.recorder]`), so a device field such
as a link token cannot reach the log through a stamp by accident.

- `Unminted<M>` is the Message a host presses: `M` without its minted and
  stamped fields. `Catalog.messageFor` and every handle produce
  `Unminted<M>`; the runtime's send path mints, stamps, and produces `M`;
  `update` only ever sees `M`. Devtools dispatch and scripted replays of
  presses go through the same send path; a replay of recorded Messages folds
  them as they are.
- A minted id is on the log before any fold sees it, so a refold cannot
  reassign it. `Add`'s arm inserts through `evolve.insert`, which ignores a
  key the array already has, so a second row with a known id is a no-op in
  `update`; `Keyed.array` refuses to decode a duplicate key at a restore or an
  offer, so one can never enter from outside (R3-14, R4-17).
- Identity and display are separate. URIs carry the id's segment, the
  26-character base-32 form of the UUID (`/counters/01j9r3x8k2q5z7w9v6b4n1m0p3`);
  the envelope and payloads carry the canonical 36-character UUID (plan 09);
  the daemon resolves a unique prefix a command typed against its Model before
  `parse`, a convenience outside the route law (R4-09); menus and screens show
  the title, or `Counter <number>` when there is none. The display policy is
  the owner's decision (README).
- `instance` is 128 bits too (32 hex characters), and the engine's unique
  key is `(app, owner, host, instance, seq)` (plan 06).

### Facts

`Fact.define(tag, { what, fields, writes, produces, answeredBy, leadsTo, stampedAt })`
declares a Message that nobody presses: the result of a Command (`RefreshedBalances`,
`FailedRefresh`), of a Subscription (`HeardFinal`), or of a carrier
(`OpenedUri`, `NavigatedBack`). A fact has no `at`, no keys, no refusals. It
carries `writes`, `produces`, `answeredBy`, and `leadsTo`, so the static graph
(plan 07) and the synchronization classifier read facts and Actions alike.
`stampedAt` is `SendTime` for every fact but one kind: `Carried({ field })`
names a time the fact carries (`ClosedDay.closesAtMs`, plan 08), which a
System writer may stamp as the row's `createdAtMs` (plan 09); a reader
accepts such a row only from a System actor (R4-13).

`produces` is a list of fact tags typed against the Program's fact union
(`produces: ['SucceededCreateLinkToken', 'FailedCreateLinkToken']`), never
values, so a module loads in any order and a retry loop is expressible
(R3-15). A fact another Processor writes in answer to this Message (the
worker's `RefreshedBalances` after a device's `RefreshBalances`) is declared
under `answeredBy`, on Actions and facts alike (`ReceivedPublicToken` is
answered by `LinkedInstitution`, which the origin writes, plan 08), so the
graph's chain is declared, not assumed (R3-07, R4-10).

The Program's Message union is assembled from its Catalog's Actions and its
declared facts; a tag in neither does not exist. Three facts the runtime
declares for every Program (R4-11): `CoveredByHost` (Local; a host screen
covers the Program, plan 04), `LeftProgram` (Navigation; a host pop removed
the Program's root), and `Followed({ move })` (Navigation; a Local
declaration's `leadsTo`, applied, below). They appear in plan 05's derived
categories and plan 09's vectors.

## Ownership is declared per field, and category follows from it

```ts
export const Ownership = S.Literals(['Domain', 'DeviceOwned', 'Navigation'])

export const Model = Ownership.declare(Fields, {
  deviceOwned: ['permission', 'recorder', 'live', 'copies', 'query'],
  navigation: ['navigation'],
}) // every other field is Domain; a Program with a Fill Action gets a DeviceOwned `forms` from Program.make (R4-15)
```

- A field is Domain (synced, folded identically everywhere), DeviceOwned
  (this device's only: a microphone state, a Link flow, a form draft), or
  Navigation (where this device is; the session policy decides whether it
  travels).
- A Message's category is derived from the ownership of every path in its
  `writes`, and it must be one of: all Domain → `Domain` (logged, folded by
  every Processor); all Navigation → `Navigation` (logged, applied per the
  session policy); all DeviceOwned → `Local` (never logged). A Message that
  writes fields of two ownerships does not build: split it. `Start` becomes
  a Local Action that writes `recorder` and returns the Command that opens
  the microphone, and `StartedSession({ sessionId })` is the Domain fact
  (plan 01a). A Message with `writes: []` declares its category explicitly.
- **Domain arms see only the Domain part.** `update` is assembled by category,
  `Update.byCategory({ domain, navigation, local })`, so every Domain arm,
  written with the typed helper `Update.writes` or by hand, is typed on
  `DomainOf<Model>` and cannot read `navigation` or a device field; the
  helper's arm may return `[Written<D>, Commands]`, so `HeardFinal`, whose
  arm returns `AcknowledgeFinal`, uses it too (R4-02). The runtime applies
  every Domain Message to the Domain part on every path alike: the sender's
  own send, a remote row, a refold, an accepted offer. "Folded identically
  everywhere" holds by construction (R3-01). A Navigation arm receives the
  Model with its Domain and Navigation parts; a Local arm receives the whole
  Model.
- **A Domain change reaches a device through `reconcile`.** A Program
  declares `Reconcile.declare(Model, { reads, writes, when, step })`: `reads`
  and `writes` are paths, `when` is the sentence the graph and the skill print
  (R4-19), and `step` is typed to write only the Navigation paths listed and
  to read `SharedOf<Model>`, the Domain and Navigation parts, never a device
  field, so every Mirror peer reconciles the shared stack the same way
  (R4-01). A second `device` step with its own `reads`, `writes`, and `when`
  may read the whole View and write DeviceOwned paths. The runtime runs both
  after every fold step, inside a refold as on a live apply, and a checkpoint
  holds the reconciled Model, so a refold and a live fold agree; nothing is
  logged, `tail` prints the changes as reconciled, and the graph draws
  `Reconciles` edges from `reads` to `writes`. Multiple Counters drops every
  Destination that names a counter that is gone; finance dismisses a
  `LinkFlow` whose `linkSessionId` the Domain `linkSessions` field marks
  `Linked`, and its device step moves `linking` to `Done`; dictate clears
  `live` when its segment appears in `sessions`. A Domain fact therefore
  declares `leadsTo: LeadsTo.stay`; only Local and Navigation declarations
  may lead anywhere else, and the build refuses a Domain declaration that
  tries. Whether such consequences are automatic or shown until the person
  moves on is the owner's decision (README).
- A `leadsTo` on a Local declaration is this device's own move. The runtime
  applies it to `navigation` after the arm, and it travels as this device's
  navigation does under the session policy: under Mirror it is logged as the
  Program's Navigation fact `Followed({ move })`, where `move` carries the
  Destination value with its fields and the style, so a peer rebuilds the
  same entry (R4-01); under SharedDomain nothing is logged. A refold treats
  `navigation` by policy too: under Mirror it is refolded with the log like a
  Domain field, under SharedDomain it is kept, as today's `keepOnRefold`
  keeps it. A Program whose flows present DeviceOwned state paints that screen
  from the Domain row the Destination names, so a Mirror peer that followed
  shows "linking at <institution> on another device", never an empty sheet;
  the owner may instead restrict such Programs to SharedDomain (README).
- During migration the deprecated `Catalog.action` alias requires an explicit
  `category`; nothing is ever classified by an absence.

## Total declaration

```ts
export type ActionDeclaration<Tag, Model, Destination> = Readonly<{
  tag: Tag
  kind: ActionKind
  what: string
  why: string
  label: string
  title: string // defaults to label; never optional here
  keys: ReadonlyArray<string> // [] is a value
  at: Where<Destination> // everywhere | at(NonEmptyArray<DestinationTag>)
  mints: ReadonlyArray<MintedField> // [] for most Actions
  stamps: ReadonlyArray<StampedField<DomainOf<Model>>> // [] for most Actions; reads Domain fields plus the device fields `stamps.reading` names
  writes: ReadonlyArray<ModelPath> // [] only with an explicit category
  category: Category // derived from writes, or declared when writes is empty
  refusals: ReadonlyArray<Refusal<Model>> // ordered; the first that holds names the because
  produces: ReadonlyArray<FactTag> // the facts its own Commands may end in
  answeredBy: ReadonlyArray<FactTag> // the facts another Processor writes in answer
  leadsTo: LeadsTo<Destination> // stay | push(D) | present(D) | back; stay for every Domain declaration
  needs: ReadonlyArray<Capability> // [] for most Actions
}>

export type Refusal<Model> = Readonly<{
  when: (view: View<Model>) => boolean
  because: string
}>
```

`enabled` is derived: `Enabled()` when no refusal holds, else
`Disabled({ because })` from the first that does. The sentences are data, so
the skill prints "unavailable when: the count is already 0" without running
anything. A Choose's per-choice refusals are data too
(`Choice.refusals: ReadonlyArray<Refusal>`), so "it is already open" is
printable. Refusals are for people: they stop a press before it is sent. The
Domain rule that two devices might both pass (`Reset` at 0 on two screens at
once) lives in `update`, which stays total and folds whatever the log holds.

### `View<Model>`: what screens, refusals, and choices read

Screens, painters, refusals, choices, and `prefill` receive `View<Model>`:
the Model plus its derived fields (plan 07's `Derivations`), computed on read
and memoized per Model reference. A screen reads `view.netWorth` the way it
reads `view.accounts`; the recording proxy in `Graph.check` records a derived
read as a `Derived` path (R3-09). `update` never receives a `View`.

### `ModelPath` is a value, not a string

```ts
export type ModelPath =
  | Field({ name: string; then: ModelPath })
  | Each({ key: RowKey; then: ModelPath })      // every row of a keyed Array; the key is carried by the array Schema's type
  | Variant({ tag: string; then: ModelPath })   // inside one member of a tagged union
  | Present({ then: ModelPath })                // inside Some of an Option
  | Derived({ name: string })                   // a derived field (plan 07); never in writes
  | Here()

export type RowKey = Single({ field: string }) | Composite({ fields: NonEmptyArray<string> }) | Index()
```

`Path.of(Model)` returns a builder anchored to the Model Schema
(`path.counters.each.label`), so an unknown name fails to compile.
`Keyed.array(Row, 'counterId')` and `Keyed.array(Rate, ['from', 'to'])` return
a wrapper Schema that carries the key in its type (an annotation would not,
R3-14), decode fails on a duplicate key, and `evolve.row` takes the key's
type from it. An array declared with `S.Array` alone gets `Index()`, which
the rubric scores 2 because a deletion then shifts every later row's path.
The same value is what `modelChangeLines` reports and what `tail` prints
(`FieldChange { path, before: Option<Json>, after: Option<Json> }`); strings
appear only when printed. The type-level derivation is measured against
Books' Model before this lands, because a recursive Destination union can
hit TypeScript's depth limit.

### Availability is placement, refusals, and capabilities together

```ts
availabilityOf(entry, view, context) =
  firstHolding(entry.refusals, view) ?? // the specific sentence first
  missingCapability(entry.needs, context.capabilities) ??
  runtimeRefusal(entry, context.runtime) ?? // Covered: 'a host screen is open'; WorkerMissing: 'no worker is running for this log'
  (Where.allows(entry.at, Navigation.current(view))
    ? Enabled()
    : Disabled({ because: 'not offered here' }))
```

- `Navigation.current` is the topmost Destination that is not chrome: the
  action menu and focus overlays are skipped, so an Action chosen from the
  open menu is measured against the page beneath it.
- A key, the menu, or an attached TUI acts at the current screen, so `view`
  is the daemon's View. A one-shot command or an agent names an address
  (`Do({ at, invocation })`, plan 01). The daemon resolves any id prefix
  against its Model, parses the address into pages only, never into a
  presentation (a presented child's Actions need the presentation open on
  the daemon, so `confirm-delete` with no question open is refused with "no
  delete is waiting for an answer", as today's CLI tests promise, R4-09),
  reconciles that View, and judges availability there. A Domain or Local
  Action is then applied to that View: its Domain and Local results are kept,
  its Commands run in the daemon, and its `leadsTo` is dropped, so no
  attached screen moves and nothing Navigation-owned is logged from an
  address. A Navigation Action (`open`, `delete`) moves the daemon's own
  navigation, is logged as the daemon's move, and prints the moved View. A
  refusal such as "answer the delete question first" is judged at the
  command's address, so a question open in an attached TUI blocks the TUI and
  not a command at another page (R3-04); decision 19 names that. The build
  manifest carries each Action's routes, so a client fills `at` from the
  invocation (`/counters/<id>` for `rename <id>`), with `--at` to override.
  An agent's `Do` through a host whose screen is covered (plan 04) is refused
  with the cover sentence.
- `context.runtime` carries what the runtime knows and no declaration can:
  the cover (`Covered | Uncovered`, plan 04) and the worker
  (`NotNeeded | Seen | Missing`, plan 06), each with one fixed sentence the
  skill prints (R4-11).
- `context.capabilities` is what the host's Layers provided (plan 10); an
  Action whose `needs` is unmet paints disabled with "this surface has no
  microphone".
- `Catalog.messageFor`, the daemon's `Do`, the React handles, the menu, and
  agent tools all go through `availabilityOf`. A row from a peer is never
  refused: `update` is total.

### Fill forms live in the Model, on the device

A Fill's draft and validation live in one DeviceOwned `forms` field keyed by
the presenting Destination, never in a modal entry, so a keystroke is never a
logged Navigation Message under Mirror and never a second state machine in a
host (R3-19). The value per Destination is `FormState<Fields>`, in outline
`Editing({ draft, issues, guard }) | Submitting({ fields })`, where `guard`
is `Quiet | Asking` for the leave question plan 04 paints, so the guard is
DeviceOwned too and a Mirror peer never paints it over an empty form (R4-15).
`Program.make` adds `forms` to every Program with a Fill Action, which is why
no example Model lists it. `prefill` returns a total record of Options, one
`Option<Fields[K]>` per key, never a `Partial`.

## Entries and handles

```ts
export type Entry<Destination> = Readonly<{
  tag: string
  kind: EntryKind                    // Press | Choose({ choices, preferred, openness }) | Fill({ fields, prefill })
  what: string
  why: string
  label: string
  title: string
  keys: ReadonlyArray<string>
  at: Where<Destination>
  availability: Availability
  refusals: ReadonlyArray<RefusalText>   // the sentences, for printing
}>

export type Choice<Value> = Readonly<{ value: Value; title: string; detail: Option<string>; availability: Availability; refusals: ReadonlyArray<RefusalText> }>

export type Outcome = Sent() | Refused({ because: string })

export type PressHandle = Readonly<{ entry: Entry; availability: Availability; press: () => Outcome; props: ButtonProps }>
export type ChooseHandle<Value> = Readonly<{
  entry: Entry
  availability: Availability
  choices: ReadonlyArray<Choice<Value>>
  preferred: Option<Value>
  for: (value: Value) => Readonly<{ availability: Availability; choose: () => Outcome }>
  choose: (value: Value) => Outcome
}>
export type FillHandle<Fields> = Readonly<{ entry: Entry; availability: Availability; prefill: PrefillOf<Fields>; fill: (fields: Fields) => Outcome }>
```

`ActionsOf<P>` maps each Catalog member to its handle by kind, keyed by its
uncapitalized tag. Handles are memoized per entry, `for(value)` reads one
choice, and every press returns `Sent | Refused({ because })`, never a
boolean.

## The sync gate

`useFeature`, `useModel`, and `useActions` are typed on the App's Ready View
and legal only under `WhenReady`, which provides it through context. Outside
it they throw, in every build, with the sentence "useFeature reads a Ready
Model; render it inside WhenReady or read useStatus", and a lint rule
(`foldkit/feature-inside-when-ready`) reports the misuse at edit time. No
selector branches on `_tag`. Binding to a composed Program resolves the slice
by mount path (`Counters.row(counterId)`, `bound.scope(path)`), never by id
(plan 03).

## One Program record, with a total Catalog

```ts
export type Program<Model, Message, …> = Readonly<{
  id: string
  version: number
  Model: ProgramSchema<Model>              // with ownership declared
  Message: ProgramSchema<Message>          // assembled from catalog and facts
  init, update, restore                    // restore defaults to identity
  reconcile: Reconcile<Model>              // Reconcile.none for a Program with no device consequences
  catalog: AnyCatalog                      // Catalog.none for a Program with nothing to press
  facts: ReadonlyArray<AnyFact>            // [] is a value
  derivations: DerivationsOf<Model>        // Derive.none when nothing is derived (R4-14)
  screen: ProgramScreen<Model>             // (view: View<Model>, device: Device) => UiNode
  navigation: ProgramNavigation<Model, Destination>   // Navigation.single(slug) for one screen
  synchronization: ProgramSynchronization  // derived from ownership; overridable per tag
  subscriptions, managedResources, ports, migrations, versionedEvents   // empty values, not absence
}>
```

Of the 41 non-test files that call `Program.make`, 35 declare no catalog, 8
of them list presses through the deprecated `valid`. Each migrates in its own
change, and for those with buttons that is a Catalog per app, not a
constructor swap; the sizing is per example in plan 05's inventory
(`plans/05a-example-scores.md`). `valid` is deleted at the end.

### One classifier for synchronization

```ts
export type Category = Domain() | Navigation() | Local()

synchronization: {
  categoryOf: (message) => Category,       // derived from ownership and writes; overridable per tag
  session: SessionRule,                     // FromModel(policyOf) | Fixed(policy)
  navigationOf: (host) => Shared() | Own(), // replaces keepsOwnNavigation(processorId)
}
```

`isLocalOnly`, `keepOnRefold`, and `projectDomain` are derived from the
ownership declaration and disappear from the surface.

## Catalogued smells and their total forms

| Today                                                                    | Total form                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `isPayloadFree`, `maybeChoose`, `Entry.isPayloadFree`                    | `kind: Press \| Choose \| Fill`                                                              |
| `ChooseDeclaration.isOpen: boolean`, `valueOf: unknown`                  | `openness: Closed \| Open`; `Id` carried in the kind, value typed                            |
| choice tags `'Increment:3'`                                              | `choose(value)` on a typed handle; the wire keeps `{ counterId }`                            |
| `ActionHandle.isEnabled` beside `maybeBecause`; `press(): boolean`       | `availability: Availability`; `press(): Sent \| Refused`                                     |
| `enabled: (model) => Availability` only                                  | `refusals` as data on Actions and choices; `enabled` derived                                 |
| `meta.title?`                                                            | `title` defaulted to `label` in the declaration                                              |
| ids minted in `update`; display numbers computed in `update`             | `mints` and `stamps` filled at send time; `Unminted<M>` for presses                          |
| `keepOnRefold?`, `isLocalOnly?`, `projectDomain`, arms reading any field | ownership per field; Domain arms on `DomainOf<Model>`; `reconcile` for device consequences   |
| `keepsOwnNavigation?: (processorId) => boolean`                          | `navigationOf: (host) => Shared \| Own`                                                      |
| `Program.catalog?` and eleven more optionals                             | one record, every member total (`Catalog.none`, `Reconcile.none`, `[]`, identity)            |
| `ProgramCommand.args?`, `key?`, `effectManifest?`                        | `args: Record` (`{}`), `key: Option`, `manifest: Manifest` (`Manifest.none`)                 |
| `ActionContext = {}`, `device?`                                          | `Device = Watch \| Phone \| Tablet \| Computer \| Tv \| Terminal`, always passed             |
| `ProgramHandle.host?`, `onBehalfOf?`                                     | `host: Host` required; `onBehalfOf` total, identity for inert handles                        |
| `BindableProgram` all-optional                                           | `bind` takes a `Program`; an inert bind is `Interaction.inert(program)`                      |
| `Flags: Record<string, string>` with `'1'`                               | `Flag = Meta \| Control \| Shift \| Named({ name, value })`                                  |
| `Do({ token: string })`                                                  | `Invocation = Press({ tag }) \| Choose({ tag, segment }) \| Fill({ tag, fields })` (plan 01) |
| `CliDaemonOk.previous?`                                                  | `Applied { before, after, changes }` (plan 01)                                               |
| `LogRowOrder.from?`, `seq?`                                              | required on the envelope; legacy rows upcast at the engine (plan 06)                         |

## Migration

1. `Action.press`, `Action.choose`, `Action.fill`, and `Fact.define` beside
   `Catalog.action`, which becomes a deprecated alias that infers the kind,
   defaults `at: Where.everywhere`, `produces: []`, `answeredBy: []`,
   `leadsTo: LeadsTo.stay`, `needs: []`, and requires `category` and
   `writes`.
2. `Ownership.declare`, `Keyed.array`, `Path.of`, the `ModelPath` ADT, the
   `FieldChange` ADT, `View<Model>`, `Reconcile.declare`, `DomainOf`,
   `Update.byCategory`, and `Update.writes` with `evolve.insert` (moved here
   from plan 07 so the Multiple Counters rebuild has typed Domain arms,
   R4-02); `modelChangeLines` keyed by row key; the depth measurement on
   Books.
3. The `Mint` service, `stamps`, `Unminted<M>`, and minting in the send path,
   including devtools dispatch.
4. `availabilityOf` with context, and the address-scoped evaluation for
   `Do.at`, in `messageFor`, the daemon, handles, and agent tools.
5. Rewrite Counter and Multiple Counters declarations (with `reconcile`),
   then the React handles by kind, then the menu, CLI, and painters.
6. The total Program record, one example per change over the 41 sites.
7. Delete the deprecated alias, `isPayloadFree`, `maybeChoose`, `valid`, and
   the optionals in the table, one release later.

## Decisions for the owner

1. Display of minted ids: full id in URIs; on screens a `number` stamped at
   `Add` from a Domain high-water mark, beside an optional `title` that
   `Rename` writes (proposed); or a per-list display number recomputed from
   the rows, which repeats after any delete. The README promise ("numbers
   never handed out twice") holds on one device under the proposal and fails
   only when two devices add before either sees the other's row (R4-08).
2. Placement as a hard gate for keys, the menu, the CLI, and agents
   (proposed, measured at the current screen or the named address), or only a
   rule for what a screen paints.
3. Whether `Fill` renders a generic form on every host (proposed) or only on
   the CLI and the menu until a form painter exists.
4. Whether a Domain consequence on a device is automatic through `reconcile`
   (proposed, which is what Multiple Counters does today) or shown ("deleted",
   "linked") until the person moves on.
