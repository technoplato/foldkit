# Plan 07 | The static graph: where, what, and what changes what

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-13 to R2-16, R2-32, R3-01, R3-07, R3-09, R3-14, R3-15, R3-20, R4-01,
R4-02, R4-10, R4-12, R4-14, R4-17, R4-19). Answers
the owner's question "what Actions update my net worth" as a compile-time
question, with no runtime Model and no syntax tree walk.

## The questions, and what answers each

| Question                                     | Answered from                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Where can Action X be performed?             | `at` on the Action declaration (plan 02), printed as URIs by Navigation                                                                     |
| What Actions can be performed at URI U?      | the Destination U parses to, then every Action whose `at` includes it                                                                       |
| What Model is observed at URI U?             | `reads` on the screen declared for that Destination                                                                                         |
| What changes Model field F?                  | `writes` on Actions and facts, `produces` and `answeredBy` on both, `reconcile`'s declared `reads` and `writes`, and the derive declaration |
| What does Action X lead to?                  | `leadsTo` on Local and Navigation declarations (`stay`, `push(D)`, `present(D)`, `back`)                                                    |
| What does a Domain change do on this device? | `reconcile`'s declared `reads`, `writes`, and `when` sentence (plan 02), read as `Reconciles` edges (R4-19)                                 |

All six are declarations. None needs a Model value or a parse of `update`.
What is compiled and what is checked is stated below.

## North Star

The finance Model and Catalog live in plan 08; this plan quotes what it needs
and defines nothing twice.

```ts
// examples/finance/core/src/model.ts (plan 08 has the whole Model)
const Fields = S.Struct({
  …,
  accounts: Keyed.array(Account, 'accountId'),
  quotes: Keyed.array(Quote, 'security'),
  rates: Keyed.array(ExchangeRate, ['from', 'to']),
  refreshRequests: Keyed.array(RefreshRequest, 'requestId'),   // Domain: what a device asked the worker for
  linkSessions: Keyed.array(LinkSession, 'linkSessionId'),   // Domain: Linked | Failed per session, written by the origin (R4-10)
  linking: Linking,
  navigation: Navigation.NavigationStack(Destination),
})
export const Model = Ownership.declare(Fields, { deviceOwned: ['linking'], navigation: ['navigation'] })
const path = Path.of(Model)

export const Derivations = Derive.declare(Model, {
  netWorth: Derive.from([path.baseCurrency, path.accounts, path.positions, path.quotes, path.tokens, path.tokenPrices, path.spotPrices, path.rates, path.manualAssets, path.debts], netWorthOf),
  freshness: Derive.from([path.accounts, path.positions, path.quotes, path.tokenPrices, path.spotPrices, path.rates, path.manualAssets], freshnessOf),
})

export const reconcile = Reconcile.declare(Model, {
  reads: [path.linkSessions, path.navigation],
  writes: [path.navigation],
  when: 'the LinkFlow on screen names a session that linkSessions marks Linked',
  step: (shared, evolve) => evolve({ navigation: Navigation.dismissed(LinkFlow, flow => isLinked(shared, flow.linkSessionId)) }),
  device: {
    reads: [path.linkSessions, path.linking],
    writes: [path.linking],
    when: 'this device started a session that linkSessions marks Linked',
    step: (view, evolve) => evolve({ linking: () => doneFor(view) }),
  },
})

// examples/finance/core/src/message.ts (plan 08 has the whole Catalog)
export const LinkBank = Action.press('LinkBank', {
  what: 'Connects a bank through Plaid',
  why: 'The person wants their balances counted',
  at: Where.at([Accounts, Connect]),
  mints: { linkSessionId: LinkSessionId },
  writes: [path.linking],                                   // DeviceOwned, so the Action is Local
  refusals: [Refusal.when(isLinking, 'a link is already in progress')],
  produces: ['SucceededCreateLinkToken', 'FailedCreateLinkToken'],   // tags, typed against the fact union
  answeredBy: [],
  leadsTo: LeadsTo.stay,
  needs: [],
  …
})

export const RefreshBalances = Action.press('RefreshBalances', {
  what: 'Asks the worker to refresh every connected balance now',
  why: 'The person wants fresh numbers before a decision',
  at: Where.at([Accounts, Dashboard]),
  mints: { requestId: RequestId },
  writes: [path.refreshRequests],                           // Domain, so the worker's Subscription sees it
  refusals: [Refusal.when(isRefreshing, 'a refresh is already running')],
  produces: [],
  answeredBy: ['RefreshedBalances', 'RefreshedPositions', 'FailedRefresh'],   // facts another Processor writes
  leadsTo: LeadsTo.stay,
  needs: [],
  …
})

export const SucceededCreateLinkToken = Fact.define('SucceededCreateLinkToken', {
  what: 'Plaid issued a link token for this device',
  fields: { linkSessionId: LinkSessionId, token: LinkToken },
  writes: [path.linking],                                   // Local, so it may lead somewhere
  produces: ['ReceivedPublicToken'],
  answeredBy: [],
  leadsTo: LeadsTo.present(LinkFlow),
  stampedAt: StampedAt.sendTime,
})

export const LinkedInstitution = Fact.define('LinkedInstitution', {
  what: 'A bank or brokerage is connected',
  fields: { linkSessionId: LinkSessionId, institution: Institution, accounts: S.Array(Account) },
  writes: [path.institutions, path.accounts, path.linkSessions],
  produces: [],
  answeredBy: [],
  leadsTo: LeadsTo.stay,                                    // Domain; the device's flow ends through reconcile
  stampedAt: StampedAt.sendTime,
})

// examples/finance/core/src/navigation.ts
Navigation.pushScreen(Dashboard, Route.here, {
  title: () => 'Dashboard',
  reads: [Derivations.netWorth, Derivations.freshness, path.accounts],
  paint: dashboardScreen,                                   // (view: View<Model>, device) => UiNode; reads view.netWorth
})
```

And the question, answered at build time:

```ts
const graph = Graph.of(FinanceApp)

Graph.whatWrites(graph, Derivations.netWorth)
// {
//   via: netWorth ← baseCurrency, accounts, positions, quotes, tokens, tokenPrices, spotPrices, rates, manualAssets, debts
//   directly: [RefreshedBalances, RefreshedPositions, RefreshedQuotes, RefreshedTokens, RefreshedTokenPrices,
//              RefreshedSpotPrices, RefreshedExchangeRates, RefreshedValuation, LinkedInstitution, Disconnected,
//              AddAsset, EditAsset, RemoveAsset, AddDebt, EditDebt, RemoveDebt, HideAccount, UnhideAccount,
//              TreatAsCash, TreatAsInvestment, SetBaseCurrency, AddManualAccount, EditManualAccount,
//              AddManualPosition, AddManualToken, OverrideKind],
//   through: [{ from: LinkBank, chain: [SucceededCreateLinkToken, ReceivedPublicToken, LinkedInstitution], answered: true },
//             { from: LinkBrokerage, chain: [SucceededCreateLinkToken, ReceivedPublicToken, LinkedInstitution], answered: true },
//             { from: Reconnect, chain: [SucceededCreateLinkToken, ReceivedPublicToken, LinkedInstitution], answered: true },
//             { from: RefreshBalances, chain: [RefreshedBalances], answered: true },
//             { from: Disconnect, chain: [Disconnected], answered: true }],
// }

Graph.actionsAt(graph, '/finance/accounts/<id>')
// [HideAccount, Reconnect, Disconnect, TreatAsCash, TreatAsInvestment, EditDebt, RemoveDebt, EditManualAccount, OverrideKind, AddManualPosition, Back]

Graph.observedAt(graph, '/finance/dashboard')
// [netWorth, freshness, accounts]

Graph.reconciles(graph, path.linking)
// [{ when: 'this device started a session that linkSessions marks Linked', reads: [linkSessions, linking], writes: [linking] }]
```

`LinkBank` writes only `linking`, so it is not a direct writer; it appears
under `through` because `produces` on the Action and on each fact in the
chain declares the path to `LinkedInstitution`, which writes `institutions`,
`accounts`, and `linkSessions` (R2-15); the last hop is `answeredBy`, because
the origin writes `LinkedInstitution` (plan 08, R4-10), so every chain that
ends there is marked `answered`. `RefreshBalances` appears under `through` with
`answered: true`: its `RefreshedBalances` is written by the worker in answer
to the request the Action wrote, which `answeredBy` declares (R3-07).
`whatWrites` is the transitive closure over `Produces` and `AnsweredBy` edges
from every direct writer.

```sh
pnpm foldkit graph examples/finance --format mermaid > docs/finance-graph.md
pnpm foldkit graph examples/finance --what-writes netWorth
```

## The graph

```ts
export type Graph = Readonly<{
  program: ProgramRef // id, version
  destinations: ReadonlyArray<DestinationNode> // tag, route pattern, placement rule, reads, shell
  actions: ReadonlyArray<ActionNode> // tag, kind, what, why, keys, at, mints, stamps, writes, refusals, produces, answeredBy, leadsTo, needs
  facts: ReadonlyArray<FactNode> // tag, what, writes, produces, answeredBy, leadsTo, stampedAt, category
  fields: ReadonlyArray<FieldNode> // path, Schema summary, ownership, derivedFrom
  reconciles: ReadonlyArray<ReconcileNode> // reads, writes, and the when sentence of each reconcile step (R4-19)
  edges: ReadonlyArray<Edge> // OfferedAt | Writes | Reads | DerivesFrom | Produces | AnsweredBy | LeadsTo | Reconciles
}>
```

`Graph.of(app)` reads declarations only: the Catalog, the declared facts, the
Navigation, the Model Schema with its ownership, derive, and reconcile
declarations. It runs in a build step and in tests. Output formats: JSON (for
tools and the skills generator, plan 08), Mermaid and DOT (for docs), and a
markdown table set.

## Paths are values

`ModelPath` is plan 02's ADT (`Field | Each | Variant | Present | Derived | Here`). `Path.of(Model)` is anchored to the Schema, so `path.accounts.each.balance`
compiles and `path.acounts` does not. An array declares its row key once, by
being built with `Keyed.array(Account, 'accountId')` or
`Keyed.array(ExchangeRate, ['from', 'to'])`, a wrapper Schema that carries
the key in its type, because an annotation would leave the TypeScript type
unchanged and invisible to `Path.of` (R3-14); decoding fails on a duplicate
key, so no `Each` path can address two rows. An array built with `S.Array`
alone gets `Index()` and the rubric scores it 2. A derived field is
`Derived({ name })`, addressable in `reads` and in `whatWrites`, never in
`writes` (R2-14). The same value is what `modelChangeLines` reports and what
the graph's edges carry; strings appear only when printed.

## Derived fields

`Derive.declare(Model, { … })` declares computed fields with their inputs as
paths and their functions; the App's const is named `Derivations` and the
library type is `DerivationsOf<Model>`, with `Derive.none` for a Program that
derives nothing, so neither name is used twice (the name `Derived` belongs to
the `ModelPath` member, R3-09, R4-14). The mechanism (R2-16): derived fields are not
in the Model and `update` never writes them. Everything that paints or
decides receives `View<Model>` (plan 02): the Model plus its derived fields,
computed on read and memoized per Model reference. A screen reads
`view.netWorth` the way it reads `view.accounts`; a refusal's `when` and a
Choose's `choices` do the same; `update` never receives a `View`. A View is a
thin wrapper that computes a derived field the first time it is read and
remembers it for that Model reference, so `reconcile`, which receives a View
after every fold step, costs nothing unless its `reads` name a derived field;
a cold fold computes `netWorthOf` once per `ClosedDay` row, where plan 08's
arm reads it, and never otherwise (R4-14). Tests call `Derive.of(Derivations)(fields)` directly. `netWorthOf` is
one pure function (six divergent copies become one, plan 08).
`Graph.whatWrites` follows `DerivesFrom` edges from the derived field to its
input paths and returns every writer of any of them, so a rename of an
account counts as a writer of `netWorth`, which is sound; a finer answer
would narrow the inputs to `path.accounts.each.balance` and friends; plan
08's declaration lists whole fields, and the narrowing is a follow-up once the
depth measurement passes.

## What is compiled and what is checked

The owner asked for a compile-time answer. Here is exactly what the type
checker proves and what a test checks:

**Compiled:**

1. Every path in `writes`, `reads`, a reconcile declaration, and a derive
   declaration names a field the Model Schema has, through `Path.of(Model)`.
2. Every Action and fact declares `writes`, `produces`, `answeredBy`, and
   `leadsTo`; every Action declares `at`, `refusals`, and `needs`; a Program
   without them does not build.
3. Every `at` names a Destination the Navigation declares, every `produces`
   and `answeredBy` names a declared fact tag, and no `writes` names a
   derived field.
4. A Message's category follows from the ownership of its `writes`, a
   Message that writes two ownerships does not build, a Domain arm receives
   `DomainOf<Model>` and so cannot read a device field or `navigation`, and a
   Domain declaration with a `leadsTo` other than `stay` does not build
   (plan 02, R3-01).
5. `reconcile` is typed to write only the DeviceOwned and Navigation paths
   its declaration lists, and its Navigation step reads `SharedOf<Model>`,
   never a device field (R4-01).
6. With the typed update helper, an update arm can write only what the
   declaration says (R2-13):

```ts
Add: Update.writes(Add, (domain, message, evolve) =>
  evolve({
    counters: evolve.insert(rowOf(message.counterId, message.number)), // ignores a key the array already has (R4-17)
    highestNumber: current => Math.max(current, message.number),
  }),
)
// `domain` is DomainOf<Model> for a Domain declaration; `message.number` was stamped at send (plan 02).
// The declaration supplies the paths; `evolve` is `evo` over Pick<Domain, declared heads> with evo's
// StrictKeys, and the arm returns an opaque Written<typeof Add>, so a raw Model or a spread does not
// type-check. A per-row write goes through evolve.row('counters', message.counterId, row => …), whose
// id parameter is the key type Keyed.array carries.

Rename: Update.writes(Rename, (domain, message, evolve) =>
  evolve.row('counters', message.counterId, row =>
    evo(row, { title: () => Option.some(message.title) }),
  ),
)

// An arm with Commands returns a pair; it is still typed on DomainOf<Model> (R4-02)
HeardFinal: Update.writes(HeardFinal, (domain, message, evolve) => [
  evolve.row('sessions', message.sessionId, session => appendSegment(session, message.segment)),
  [AcknowledgeFinal({ segmentId: message.segment.segmentId })],
]),
```

What the helper cannot express: an `Each` write constrains which rows are
touched through `evolve.row`, but the row evolver's type cannot stop it from
touching two fields of the row when one was declared; `Variant` and
`Present` writes narrow through `evolve.variant` and `evolve.present`
combinators. Those are the arms the generated check covers.

**Checked by generated tests** (`Graph.check(app)` in `foldkit/test`):

- generates Message sequences from the Catalog and the declared facts,
  folds each from `init`, so every Model it tests is one a running app can
  reach (an Arbitrary Model from the Schema would include a question for a
  counter that does not exist, R3-20), and asserts for each step that the
  paths that moved are within the Message's `writes`, and that each declared
  write moved in at least one sequence;
- runs `reconcile` after each step and asserts the paths it moved are within
  its `writes` and the paths it read, through the same recording proxy, are
  within its `reads`;
- paints each Destination's screen with a `View` wrapped in a recording proxy
  and asserts the paths touched, derived reads recorded as `Derived` paths,
  are within `reads`;
- asserts `leadsTo` against the stack after each Local and Navigation step;
- asserts every refusal's `when` holds on some reachable `View`.

A violation names the Message, the undeclared path, and the shrunk sequence
that reached it. The typed helper is the default for every arm; an arm that
opts out is scored 2 and relies on the check alone.

## Refusals are data

`refusals` on Actions and on choices (plan 02) give the graph every sentence
an Action can refuse with, in order, so the skill prints "unavailable when: a
delete question is open" without evaluating anything.

## What stays out

- Commands' external effects (an HTTP call) are not Model writes; the facts
  they produce are declared with their own `writes`, and `produces` or
  `answeredBy` links the chain.
- Submodel-internal paths appear under the parent's path through `compose`'s
  lifting; `forEach` rows appear as `counters[]`, keyed by the declared key.

## Migration

1. `ModelPath` as a value, `Path.of`, `Keyed.array`, `Derive.declare`,
   `View<Model>`, and `Reconcile.declare` in `foldkit/schema`; the
   type-depth measurement on Books' Model.
2. `at`, `writes`, `refusals`, `produces`, `answeredBy`, `leadsTo`, `needs`
   on Action kinds and `writes`, `produces`, `leadsTo` on facts (plan 02);
   `reads` on screens.
3. `evolve.variant` and `evolve.present` (`Update.writes`, `Update.byCategory`,
   `evolve.row`, and `evolve.insert` land with plan 02, R4-02); `Graph.of`,
   `Graph.check`, the CLI (`pnpm foldkit graph`).
4. Counter and Multiple Counters declare and pass `Graph.check`; the finance
   example is the first to need `Derive`.

## Decisions for the owner

1. Is "declared, compiled where the types reach, checked by generated tests
   where they cannot" static enough, or must every update arm use
   `Update.writes` so nothing is left to a test?
