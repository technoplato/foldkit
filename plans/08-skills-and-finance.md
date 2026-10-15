# Plan 08 | Skills generated from the Program, proven on a finance example

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-02, R2-09 to R2-12, R2-15, R2-30, R2-31, R2-34, R2-37, R2-38, R3-01,
R3-05 to R3-09, R3-20, R3-21, R4-01, R4-06, R4-10, R4-12, R4-13, R4-18). Closes
audit item 8 and the owner's request for a finance example (net worth, bank
linking through Plaid, brokerage linking through SnapTrade) whose skills
markdown is generated instead of kept in sync by hand.

Decisions the owner took on 2026-10-09 (`plans/user-messages/2026-10-09-follow-ups.md`,
message 1): the example lives in this repository as `examples/finance`; it
references no outside product; the generated skill is published nowhere by
this repository; the generator's one job is the Program's markdown.

This plan has two halves with different dates. **08a** generates skills from
today's Catalog and ships first, because the owner said "number eight was not
started, that's something I need now". **08b** is the finance example, which
depends on plans 01, 02, 04, 06, and 07.

## The problem the generator solves

A hand-kept skill drifts from the code it describes. A production
personal-finance app was reviewed for this plan (the review stays outside
this repository); its agent skills are hand-written markdown that cites
source files by line number, and the net worth formula it describes lived in
several places that disagreed. Every fact such a skill restates is one the
Program already holds once: the formula is a derived field; the states are
Model sums; labels, keys, and refusal sentences are the Catalog; routes are
the Navigation; "what refreshes balances" is a `writes` edge in the graph. So
the skill is a projection of the Program, and the markdown cannot drift
because nobody writes it.

Under principle 7 (`PRINCIPLES.md`, from the owner's message 2) there is no
other copy to keep in step: the formula is one function folded on every
device, history is folded from a day-close fact, and only an outside system
that cannot read the log gets a Projection.

## 08a | Skills from today's Catalog, now

```sh
pnpm foldkit skills examples/counter            # writes examples/counter/skills/SKILL.md
pnpm foldkit skills examples/counter --check    # CI: fails when the committed skill drifts
```

08a takes a Program, not plan 06's `App`, so it depends on nothing in the
other plans (R2-38). Sources available today: `what`, `why`, `meta.label`,
`meta.keys`, `Catalog.commandOf`, `enabled` evaluated at `init` for the
"unavailable at start" note, and the Navigation's printed routes. `at` is a
minimal addition (`Where.everywhere` by default, `Where.at([...])` where a
Program says so). The output is deterministic (Catalog order, then route
order), stamps the Program id and `version`, never a date, and is
byte-compared by `--check` in `pnpm check`. There are no hand-written
sections: the owner said "we don't want hand rolling anything", so a skill is
generated or it does not exist. Generated files are committed beside their
example, `examples/<app>/skills/SKILL.md`, never under the repository's
`skills/`, which `.claude-plugin` publishes (R2-37).

The module is `foldkit/skills`, not `@foldkit/markdown` (which turns markdown
into Foldkit views, the opposite direction).

```ts
// outline: the module's three signatures, not code (plan 02's notation)
export const Skill = {
  ofProgram: (program: AnyProgram): SkillDocument,       // pure data: frontmatter, sections, tables
  render: (document: SkillDocument): string,              // deterministic markdown
  check: (program: AnyProgram, committed: string): CheckResult,   // Same() | Drifted({ diff })
}
```

The same `SkillDocument` renders to an MCP tool list (per-Action tools with
the payload Schema as JSON Schema) for `@foldkit/devtools-mcp`, to the CLI's
`help`, and to the terminal manifest plan 01 reads, so the four agree by
construction.

## 08b | The finance example

### North Star skill

Illustrative, hand-typed here from the declarations below; the real file is
generated and byte-checked (R2-15).

```markdown
---
name: finance
description: Net worth from linked banks (Plaid), brokerages (SnapTrade), market prices, exchange rates, and manual assets and debts. Generated from finance-core-example version 1; do not edit.
---

# Finance

## Places

| Address                       | Shows                               | Reads                                |
| ----------------------------- | ----------------------------------- | ------------------------------------ |
| /finance/dashboard            | Net worth, its parts, and how fresh | netWorth, freshness, accounts, debts |
| /finance/accounts             | Every linked and manual account     | accounts, institutions               |
| /finance/accounts/<id>        | One account, its state, its actions | accounts[]                           |
| /finance/accounts/assets/<id> | One manual asset                    | manualAssets[]                       |
| /finance/accounts/connect     | Link a bank or a brokerage          | linking                              |

## Actions

| Command                              | Keys | What                                | Where                                        | Changes               | Unavailable when              |
| ------------------------------------ | ---- | ----------------------------------- | -------------------------------------------- | --------------------- | ----------------------------- |
| finance link-bank                    |      | Connects a bank through Plaid       | /finance/accounts, /finance/accounts/connect | linking               | a link is already in progress |
| finance reconnect <institution>      | r    | Repairs an expired connection       | /finance/accounts/<id>                       | linking               | the connection is not expired |
| finance hide-account <account>       | h    | Leaves the account out of net worth | /finance/accounts/<id>                       | accounts[].visibility |                               |
| finance treat-as-cash <position>     |      | Counts the position as cash         | /finance/accounts/<id>                       | positions[].treatAs   |                               |
| finance add-asset --category --value | a    | Adds a manual asset                 | /finance/accounts                            | manualAssets          |                               |
| finance set-base-currency --currency |      | Reports in another currency         | /finance/dashboard                           | baseCurrency          |                               |

## Inputs

| Input           | Fed by                 | Written by | Refreshed                        | Stale after |
| --------------- | ---------------------- | ---------- | -------------------------------- | ----------- |
| Balances        | RefreshedBalances      | the worker | when older than 2 hours          | 1 day       |
| Security prices | RefreshedQuotes        | the worker | every 15 minutes in market hours | 1 day       |
| Token prices    | RefreshedTokenPrices   | the worker | every 2 minutes                  | 1 hour      |
| Exchange rates  | RefreshedExchangeRates | the worker | every 4 hours                    | 2 days      |

## What changes net worth

netWorth is derived from baseCurrency, accounts, positions, quotes, tokens, tokenPrices, spotPrices, rates, manualAssets, debts.
Directly: RefreshedBalances, RefreshedPositions, RefreshedQuotes, RefreshedTokens, RefreshedTokenPrices, RefreshedSpotPrices, RefreshedExchangeRates, RefreshedValuation, LinkedInstitution, Disconnected, AddAsset, EditAsset, RemoveAsset, AddDebt, EditDebt, RemoveDebt, HideAccount, UnhideAccount, OverrideKind, AddManualAccount, EditManualAccount, AddManualPosition, AddManualToken, TreatAsCash, TreatAsInvestment, SetBaseCurrency.
Through a chain: LinkBank, LinkBrokerage, and Reconnect (SucceededCreateLinkToken, ReceivedPublicToken, then LinkedInstitution, answered by the origin); RefreshBalances (answered by RefreshedBalances, RefreshedPositions); Disconnect (answered by Disconnected).

## States

Connection: Linked | Syncing | NeedsReauth | Expired | Broken
Linking (this device only): Idle | TokenRequested | AtProvider | Exchanging | Done | Failed | TimedOut

## Rules

- Net worth = cash + investments + crypto + metals + manual assets − max(debts, 0), each in the base currency through the rates in the Model; hidden and inactive accounts, sold positions, and duplicates are excluded; a short position is a liability; a missing rate holds the value out and is reported as Missing. (one function: netWorthOf)
```

Every row is read from a declaration (plan 02) or the graph (plan 07); the
Inputs table comes from the worker's declared cadence and the `freshness`
thresholds; the Rules sentence is the derive declaration's description. Every
Model field carries a description (`S.annotate({ description })`), which the
rubric requires of a 3.

### The independent variables

Net worth is not a sum of balances. An inventory of the reviewed app found 46
independent inputs (kept outside the repository, with the owner's graphic),
and this plan's first draft held about a third of them. Every vendor-fed
input is a Model field with an `asOf`, written by one server-hosted worker
(plan 06, single writers), so devices never call vendors, never disagree,
and never multiply the log (R2-10).

| Inventory group (count) | Fields                                                                                                                                                                                                                                                               | Fed by                                                                      | Written by     | Cadence, declared once                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Cash (6)                | `accounts` (`balance`, per-kind `available`, `margin`, a manual account's entered `balance`), the brokerage depository fallback as a fold rule, `treatAs`                                                                                                            | `RefreshedBalances`, `AddManualAccount`, `EditManualAccount`, `TreatAsCash` | worker; person | when older than 2 hours                                                                   |
| Brokerage (8)           | `positions` (`quantity`, `multiplier`, `side`, `institutionValue`, sold positions dropped), `quotes` (the close, for repricing), account `kind: Brokerage({ total })` with the derived total when the broker's is missing, a manual stock's `quantity`               | `RefreshedPositions`, `RefreshedQuotes`, `AddManualPosition`                | worker; person | positions when older than 6 hours and on webhook; quotes every 15 minutes in market hours |
| Crypto (5)              | `tokens`, `tokenPrices` (by `tokenId`), aggregator-held crypto as `institutionValue`, `treatAs` for crypto marked cash, the dust filter as a named decision                                                                                                          | `RefreshedTokens`, `RefreshedTokenPrices`, `AddManualToken`, `TreatAsCash`  | worker; person | 6 hours; 2 minutes                                                                        |
| Exchange rates (2)      | `rates`, `baseCurrency`; a failed read is `FailedRefresh` and `freshness`, never a silent base-currency assumption                                                                                                                                                   | `RefreshedExchangeRates`, `SetBaseCurrency`, `FailedRefresh`                | worker; person | every 4 hours                                                                             |
| Manual assets (8)       | `manualAssets[].valuation` (`Entered` for property, vehicle, private, physical, other; `Appraised` for property and vehicle), `spotPrices` for precious metals, a business's `ownership` and linked accounts                                                         | `AddAsset`, `EditAsset`, `RefreshedValuation`, `RefreshedSpotPrices`        | person; worker | on edit; appraisals monthly; metals every 2 hours                                         |
| Debts (4)               | `debts` (aggregator liabilities, brokerage liabilities as negated margin, manual liabilities), `nonNegativeDebts` as a named decision                                                                                                                                | `RefreshedBalances`, `AddDebt`, `EditDebt`                                  | worker; person | on refresh; on edit                                                                       |
| Flags (5)               | `visibility`, `activity`, the sweep de-duplication rule by institution and account, `kind` overrides, no sanity caps (an outlier is `Suspect` in `freshness`)                                                                                                        | `HideAccount`, `UnhideAccount`, `OverrideKind`, fold rules                  | person; fold   | on edit                                                                                   |
| Missing everywhere (8)  | currency on entered values: `Money`; staleness: `freshness`; shorts: `side`; cross-provider duplicates: fold rule; fresh crypto marks: `tokenPrices` by id; accrued interest, pending transactions, deferred taxes: out of scope, listed in the skill as not counted |                                                                             |                |                                                                                           |

History (`netWorthHistory`, written by `ClosedDay`) is a record of the sum,
not an input, and is described under History below.

### Model

```ts
export const Money = S.Struct({ amount: S.Number, currency: Currency }) // every value carries its currency
export const Freshness = S.Union([
  Fresh(),
  Stale({ since: Millis }),
  Missing(),
  Suspect({ because: S.String }),
])

export const Connection = S.Union([
  Linked({ since: Millis }),
  Syncing({ since: Millis }),
  NeedsReauth({ because: S.String }),
  Expired(),
  Broken({ because: S.String }),
])

export const Visibility = S.Literals(['Shown', 'Hidden'])
export const Activity = S.Literals(['Active', 'Inactive'])
export const TreatAs = S.Literals(['Cash', 'Investment'])
export const Side = S.Literals(['Long', 'Short'])
export const PriceSource = S.Literals(['Broker', 'Market', 'Institution'])

export const AccountSource = S.Union([
  Linked({ institutionId: InstitutionId }),
  Manual(),
])
export const AccountKind = S.Union([
  Depository({ available: Money }),
  Brokerage({ total: Money, margin: Money }),
  Credit({ limit: Money }),
  Loan({ principal: Money }),
  Other(),
])
export const Institution = S.Struct({
  institutionId,
  name,
  provider: Provider,
  connection: Connection,
}) // Provider = Plaid | SnapTrade
export const Account = S.Struct({
  accountId,
  source: AccountSource,
  kind: AccountKind,
  balance: Money,
  visibility: Visibility,
  activity: Activity,
  treatAs: TreatAs,
  asOf: Millis,
})
export const Position = S.Struct({
  accountId,
  security: SecurityId,
  quantity: Quantity,
  multiplier: S.Int,
  side: Side,
  maybeInstitutionValue: S.Option(Money),
  treatAs: TreatAs,
  asOf: Millis,
})
export const Quote = S.Struct({
  security: SecurityId,
  price: Money,
  source: PriceSource,
  asOf: Millis,
})
export const TokenSource = S.Union([
  Wallet({ address: WalletAddress }),
  Exchange({ accountId: AccountId }),
  Manual(),
])
export const Token = S.Struct({
  tokenId: TokenId,
  source: TokenSource,
  quantity: Quantity,
  asOf: Millis,
})
export const TokenPrice = S.Struct({
  tokenId: TokenId,
  price: Money,
  asOf: Millis,
})
export const SpotPrice = S.Struct({
  metal: Metal,
  pricePerOunce: Money,
  asOf: Millis,
})
export const ExchangeRate = S.Struct({
  from: Currency,
  to: Currency,
  rate: S.Number,
  asOf: Millis,
})
export const Valuation = S.Union([
  Appraised({ value: Money, provider: ValuationProvider, asOf: Millis }),
  Entered({ value: Money, enteredAt: Millis }),
])
export const ManualAsset = S.Struct({
  assetId,
  category: AssetCategory,
  valuation: Valuation,
  visibility: Visibility,
})
// AssetCategory = Residential | Commercial | Vehicle | PrivateInvestment | Physical | Metal({ ounces }) | Collectible | Business({ ownership, linkedAccounts }) | Other
export const Debt = S.Struct({
  debtId,
  category: DebtCategory,
  balance: Money,
  visibility: Visibility,
  asOf: Millis,
})
export const DayClose = S.Struct({
  day: CalendarDay,
  netWorth: Money,
  provenance: Provenance,
}) // netWorth computed by the fold at the ClosedDay fact, never carried by it; Provenance = Live | Backfilled (R4-13)

export const Linking = S.Union([
  // DeviceOwned: never synced; the Link token never reaches the log
  Idle(),
  TokenRequested({
    linkSessionId: LinkSessionId,
    provider: Provider,
    since: Millis,
  }),
  AtProvider({
    linkSessionId: LinkSessionId,
    provider: Provider,
    token: LinkToken,
    since: Millis,
  }),
  Exchanging({
    linkSessionId: LinkSessionId,
    provider: Provider,
    since: Millis,
  }),
  Done({ linkSessionId: LinkSessionId, institutionId: InstitutionId }),
  Failed({
    linkSessionId: LinkSessionId,
    provider: Provider,
    because: S.String,
  }),
  TimedOut({ linkSessionId: LinkSessionId, provider: Provider }),
])

const Fields = S.Struct({
  baseCurrency: Currency,
  timeZone: TimeZoneSetting, // Unset | Zone({ zone }); the worker closes no day while Unset (R4-13)
  institutions: Keyed.array(Institution, 'institutionId'),
  accounts: Keyed.array(Account, 'accountId'),
  positions: Keyed.array(Position, ['accountId', 'security']),
  quotes: Keyed.array(Quote, 'security'),
  tokens: Keyed.array(Token, 'tokenId'),
  tokenPrices: Keyed.array(TokenPrice, 'tokenId'),
  spotPrices: Keyed.array(SpotPrice, 'metal'),
  rates: Keyed.array(ExchangeRate, ['from', 'to']),
  manualAssets: Keyed.array(ManualAsset, 'assetId'),
  debts: Keyed.array(Debt, 'debtId'),
  netWorthHistory: Keyed.array(DayClose, 'day'),
  refreshRequests: Keyed.array(RefreshRequest, 'requestId'), // a device's ask, Domain so the worker's Subscription sees it (R3-07)
  pendingDisconnects: Keyed.array(DisconnectRequest, 'institutionId'),
  linkSessions: Keyed.array(LinkSession, 'linkSessionId'), // Domain: Linked | Failed per session, written by the origin, read by reconcile (R4-10)
  linking: Linking,
  navigation: Navigation.NavigationStack(Destination),
})

export const Model = Ownership.declare(Fields, {
  deviceOwned: ['linking'],
  navigation: ['navigation'],
})
const path = Path.of(Model)

export const Derivations = Derive.declare(Model, {
  netWorth: Derive.from(
    [
      path.baseCurrency,
      path.accounts,
      path.positions,
      path.quotes,
      path.tokens,
      path.tokenPrices,
      path.spotPrices,
      path.rates,
      path.manualAssets,
      path.debts,
    ],
    netWorthOf,
  ),
  freshness: Derive.from(
    [
      path.accounts,
      path.positions,
      path.quotes,
      path.tokenPrices,
      path.spotPrices,
      path.rates,
      path.manualAssets,
    ],
    freshnessOf,
  ),
})
```

Every state is a sum; a credit account cannot carry a margin because the
kind carries the fields that belong to it; a token's source is a sum, not an
optional account (R2-30). Option-typed values carry the `maybe` prefix
(R2-31). `linking` is DeviceOwned, so every Action that writes it is Local
and never reaches the log, and one device's flow cannot block another
(R2-02).

`reconcile` (plan 02) is the Program's one device step, declared once:

```ts
export const reconcile = Reconcile.declare(Model, {
  reads: [path.linkSessions, path.navigation],
  writes: [path.navigation],
  when: 'the LinkFlow on screen names a session that linkSessions marks Linked',
  step: (shared, evolve) =>
    evolve({
      navigation: Navigation.dismissed(LinkFlow, flow =>
        isLinked(shared, flow.linkSessionId),
      ),
    }),
  device: {
    reads: [path.linkSessions, path.linking],
    writes: [path.linking],
    when: 'this device started a session that linkSessions marks Linked',
    step: (view, evolve) => evolve({ linking: () => doneFor(view) }),
  },
})
```

The Navigation step reads only Domain and Navigation fields: it dismisses a
`LinkFlow` whose `linkSessionId` the Domain `linkSessions` field marks
`Linked`, so under Mirror every peer that followed the presentation leaves it
at the same row (R4-01). The device step moves this device's `linking` to
`Done` when `linkSessions` marks the session it started; every other device,
whose `linking` is `Idle`, changes nothing (R3-01, R4-10). A Mirror peer that
followed `Followed({ move })` into the flow paints "linking at
<institution> on another device" from the Domain row, never an empty sheet. Screens, refusals, and choices read
`View<Model>`, so the Dashboard reads `view.netWorth` beside `view.accounts`
(plan 07, R3-09).

`netWorthOf` is the one formula, each rule a named term the skill prints:

- `inBaseCurrency`: every `Money` converts through `rates`; a missing rate
  holds the value out of the total and `freshness` says `Missing`, instead of
  treating it as the base currency.
- `cash`: shown, active depository balances plus brokerage cash plus margin
  plus positions marked `Cash`.
- `investments`: `Long` positions times the best `Quote` (`Broker`, then
  `Market`, then `Institution`), with the contract multiplier; a `Short`
  position is a liability.
- `crypto`: tokens times `tokenPrices` by `tokenId`, never by a symbol string.
- `metals`: ounces times `spotPrices`.
- `manual`: each `Valuation`; a business is its confirmed value times
  ownership minus the linked accounts already counted.
- `excluded`: `Hidden`, `Inactive`, sold positions, and the same account
  reached through two providers (matched by institution and account id at
  fold time, not only at link time).
- `nonNegativeDebts`: debts are floored at zero (a named decision).
- No sanity caps: an outlier is flagged `Suspect` in `freshness` and shown,
  never dropped.

`freshnessOf` compares each input's `asOf` with its declared threshold, so a
dashboard can say "net worth as of 14:02; metals price is 3 days old" instead
of adding a stale price silently.

### History

`ClosedDay({ day, closesAtMs })` is a Domain fact the worker emits once per
calendar day in the Model's `timeZone`, carrying the day's end and no value;
`update` records `netWorthOf(domain)` at that point of the fold into
`netWorthHistory`, so a late row or a new formula recomputes history on every
device and nothing frozen drifts (R2-11). The fold order is `createdAtMs`
first (plan 09), so a day backfilled after an outage would fold after every
row written since and record the net worth at the restart, a flat line
(R3-08). Two ways out, the owner's decision below: the worker, a System
writer, stamps a backfilled row's `createdAtMs` with `closesAtMs`, a declared
exception to plan 09's clock rule that every reader refolds for as it would
for any late row (proposed); or the worker emits nothing for a missed day
and the history keeps a gap. `update` ignores a second `ClosedDay` for a day
it has. `timeZone` is `Unset` at `init` and written by `SetTimeZone`, a Choose on
the Dashboard; the worker closes no day while it is `Unset`, so no device
ever folds a zone another device guessed (R4-13). `ClosedDay` declares
`stampedAt: Carried('closesAtMs')` (plan 02), which is what lets a System
writer backdate it and lets a reader refuse a backdated row from anyone
else. A backfilled day records the inputs the Model held at that close, which
are the last prices the worker wrote before it went down; its `DayClose` says
`Backfilled`, so a chart can mark it.

### Catalog

The one table plan 07 quotes:

| Action              | Kind                                        | At                      | Writes                | Produces, or answered by                                               | Category |
| ------------------- | ------------------------------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------------- | -------- |
| `LinkBank`          | Press, mints `linkSessionId`                | Accounts, Connect       | linking               | produces `SucceededCreateLinkToken`, `FailedCreateLinkToken`           | Local    |
| `LinkBrokerage`     | Press, mints `linkSessionId`                | Accounts, Connect       | linking               | produces `SucceededCreateLinkToken`, `FailedCreateLinkToken`           | Local    |
| `Reconnect`         | Choose (institution), mints `linkSessionId` | AccountDetail, Accounts | linking               | produces `SucceededCreateLinkToken`, `FailedCreateLinkToken`           | Local    |
| `Disconnect`        | Choose (institution)                        | AccountDetail           | pendingDisconnects    | answered by `Disconnected`                                             | Domain   |
| `HideAccount`       | Choose (account)                            | AccountDetail           | accounts[].visibility |                                                                        | Domain   |
| `UnhideAccount`     | Choose (account)                            | Accounts                | accounts[].visibility |                                                                        | Domain   |
| `OverrideKind`      | Choose (kind)                               | AccountDetail           | accounts[].kind       |                                                                        | Domain   |
| `AddManualAccount`  | Fill, mints `accountId`                     | Accounts                | accounts              |                                                                        | Domain   |
| `EditManualAccount` | Fill                                        | AccountDetail           | accounts[]            |                                                                        | Domain   |
| `AddManualPosition` | Fill                                        | AccountDetail           | positions             |                                                                        | Domain   |
| `AddManualToken`    | Fill, mints `tokenId`                       | Accounts                | tokens                |                                                                        | Domain   |
| `TreatAsCash`       | Choose (position)                           | AccountDetail           | positions[].treatAs   |                                                                        | Domain   |
| `TreatAsInvestment` | Choose (position)                           | AccountDetail           | positions[].treatAs   |                                                                        | Domain   |
| `AddAsset`          | Fill, mints `assetId`                       | Accounts                | manualAssets          |                                                                        | Domain   |
| `EditAsset`         | Fill                                        | AssetDetail             | manualAssets[]        |                                                                        | Domain   |
| `RemoveAsset`       | Choose (asset)                              | AssetDetail             | manualAssets          |                                                                        | Domain   |
| `AddDebt`           | Fill, mints `debtId`                        | Accounts                | debts                 |                                                                        | Domain   |
| `EditDebt`          | Fill                                        | AccountDetail           | debts[]               |                                                                        | Domain   |
| `RemoveDebt`        | Choose (debt)                               | AccountDetail           | debts                 |                                                                        | Domain   |
| `SetBaseCurrency`   | Choose (currency)                           | Dashboard               | baseCurrency          |                                                                        | Domain   |
| `SetTimeZone`       | Choose (time zone)                          | Dashboard               | timeZone              |                                                                        | Domain   |
| `RefreshBalances`   | Press, mints `requestId`                    | Accounts, Dashboard     | refreshRequests       | answered by `RefreshedBalances`, `RefreshedPositions`, `FailedRefresh` | Domain   |

Facts (`Fact.define`, each with `writes`, `produces`, and `leadsTo`), named
verb-first and past tense (R2-31): `SucceededCreateLinkToken` (linking; Local;
produces `ReceivedPublicToken`; leads to the `LinkFlow` presentation),
`FailedCreateLinkToken` (linking), `ReceivedPublicToken` (linking; Local,
carries the short-lived public token; produces `FailedLink`; answered by
`LinkedInstitution`), `LinkedInstitution` (institutions, accounts,
linkSessions; carries `linkSessionId`; written by the origin, which is the
worker's HTTP face and writes as the worker's System actor, so the single
writer stays one, R4-10; Domain, so `leadsTo: stay`, and the starting device
ends its flow through `reconcile`), `FailedLink` (linking), `TimedOutLink` (linking),
`Disconnected` (institutions, accounts, positions, pendingDisconnects; the
worker's answer to `Disconnect`), `RefreshedBalances`, `RefreshedPositions`,
`FailedRefresh` (each also clears the `refreshRequests` row it answers; so the
request a device wrote is what the worker's Subscription observes and what
the fact closes, R3-07), `RefreshedQuotes`, `RefreshedTokens`,
`RefreshedTokenPrices`, `RefreshedSpotPrices`, `RefreshedExchangeRates`,
`RefreshedValuation` (`freshness` reads each input's `asOf`),
`ExpiredConnection` (Plaid `ITEM_LOGIN_REQUIRED`), `LostConnection` (SnapTrade
`CONNECTION_BROKEN`), `StartedSync`, `FinishedSync`, `ClosedDay` (`stampedAt: Carried('closesAtMs')`).

### The Link flow, device by device

`LinkBank` mints a `linkSessionId` and moves this device's `linking` to
`TokenRequested`; its Command asks the server origin for a link token and
ends in `SucceededCreateLinkToken` (Local), which moves to `AtProvider` and
leads to the `LinkFlow` presentation. The person finishes the vendor's flow;
the host reports `ReceivedPublicToken` (Local); its Command exchanges the
token through the origin, which is the worker's HTTP face and writes as the
worker's System actor (R4-10), and the origin writes
`LinkedInstitution({ linkSessionId, … })`, declared under
`ReceivedPublicToken`'s `answeredBy`, which every device folds into
`institutions`, `accounts`, and `linkSessions` and nothing else. The device whose `linking`
carries that `linkSessionId` ends its flow through `reconcile` (plan 02; the
declaration is above): its `linking` moves to `Done` and the `LinkFlow`
presentation is dismissed, with no logged Message and no Domain arm reading a
device field (R3-01, R2-12). A flow that finishes elsewhere (a hosted flow,
another tab) still produces `LinkedInstitution` with the session's id, and the
starting device recognizes it. A web OAuth redirect loses the page: how the
token survives it is the owner's decision below.

### Lifecycle

- Plaid and SnapTrade calls are Commands behind a `FinanceGateway` service.
  Its live Layer runs through a server origin that holds the vendor secrets;
  its test Layer replays recorded fixtures. The browser never holds a vendor
  secret.
- Per-item access tokens, user secrets, and the mapping from a webhook's item
  id to a person's log live in a `VendorVault` service on the server, never
  on the log. The vault is not a computed value, so principle 7 does not
  apply to it.
- All vendor-fed facts are written by the worker, a `Host.server` Processor
  with a `System` actor, into the person's log (`owner: Person`), under the
  single-writer primitives of plan 06; devices read them through the owner
  policies (R2-09). The App declares `server: Server.needed`, so a terminal
  on Local runs the worker inside its daemon, polling instead of receiving
  webhooks (R4-18), and a device that sees no worker (no live lease row,
  plan 01) says so. Every worker effect is idempotent or fenced by
  the lease epoch (upserts keyed by the fact's id, vendor calls deduplicated
  by `requestId`), because a lease cannot exclude a holder that paused past
  expiry (plan 06, R3-06). Webhooks arrive the same way, so every device sees
  `ExpiredConnection` as a Message, not as a column flip.
- Refresh cadence is a `serverOnly` Subscription in the worker gated by
  `Syncing`, by staleness in the Model, and by `refreshRequests` and
  `pendingDisconnects`, declared once; a device's press is a Domain write the
  worker observes, never a Command the worker would drop (R3-07).
- Erasure: a person's log is per owner; deleting the person deletes their
  rows, the System rows written into their log, and their vault entries.
  Admin aggregates across people are out of scope for this example.

### Navigation

`Navigation.tabs` (plan 04): `dashboard` and `accounts`. Every URI begins with
its tab's slug, as plan 04 requires (R3-20): `/finance/dashboard`,
`/finance/accounts`, `/finance/accounts/<id>`, `/finance/accounts/assets/<id>`
pushed in the accounts stack, `/finance/accounts/connect` presented as a
Sheet, and the disconnect question as a Dialog. There is no transactions tab
in the first cut, because no input needs transactions.

### What it replaces

`examples/personal-cfo` is a net-worth Program with CLI and Expo hosts, no
live Plaid or SnapTrade, and five tracked files that name the reviewed client
(R2-34). `examples/finance` replaces it; `personal-cfo` is retired in the
same change, and whether its public history needs a rewrite is a decision in
the README.

## Migration

1. **08a now**: `foldkit/skills`, `Skill.ofProgram` on Counter and Multiple
   Counters, skills committed beside each example, `--check` in `pnpm check`,
   the MCP and CLI renderings.
2. `examples/finance` core and React host against recorded fixtures; retire
   `personal-cfo`.
3. The worker, the vault, projections, and the hosted deployment once plans
   01 and 06 land.

## Decisions for the owner

1. `examples/personal-cfo`: retire it with `examples/finance` (proposed), and
   rewrite the fork's public history to remove the client's name, or leave
   the history.
2. The finance example's hosted deployment: live vendors with production
   access, retention, and deletion (proposed, after the identity spike), or
   recorded fixtures only.
3. The web OAuth redirect: the host may keep the link token in session
   storage keyed by `linkSessionId` across the redirect (a device-local
   saved value, not a snapshot), or finance uses a popup or hosted flow only
   (proposed).
4. Finance boot cost with nothing saved: accept it, or allow the worker to
   write a daily checkpoint for this App only (a saved snapshot, plan 06
   decision 1).
5. `nonNegativeDebts` and the crypto dust filter: keep the floor, drop the
   filter (proposed).
6. History after a worker outage (R3-08): let the worker stamp a backfilled
   `ClosedDay` with the day's close, a declared exception to the clock rule
   that every reader refolds for (proposed), or keep gaps.
7. Manual accounts, positions, and tokens in the first cut: `AddManualAccount`,
   `EditManualAccount`, `AddManualPosition`, `AddManualToken`, and
   `OverrideKind` (proposed, because the inventory counts those inputs), or
   out of the first cut (R4-12).
