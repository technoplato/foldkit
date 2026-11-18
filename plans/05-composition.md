# Plan 05 | Composition as ergonomic as TCA

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-01, R2-17, R2-24, R2-28, R2-32, R1-14, R1-41, R3-01, R3-10, R3-12,
R3-19, R4-08, R4-09, R4-11, R4-12, R4-17, R4-19). Closes audit item 9 and defines the rubric `examples/AGENTS.md`
enforces. The mechanical score of every example is in
`plans/05a-example-scores.md`.

## What TCA gives that Foldkit makes you write

| TCA                                                  | Foldkit today                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Scope(state: \.child, action: \.child) { Child() }` | `Program.compose({ child })` or `scope('child', Child)`; derives Model, Message, update only                                                                                                                                               |
| `.forEach(\.rows, action: \.rows) { Row() }`         | `compose.forEach({ of })` derives Model, Message, update, and mints `id: string` rows from `nextId` inside the fold; nothing for catalog, navigation, screen, sync, so Multiple Counters hand-rolls 154 lines of update and 167 of message |
| `.ifLet(\.$destination, action: \.destination)`      | hand-written `askedToDelete`, `closedQuestion`, `deletedCounter` stack edits                                                                                                                                                               |
| `@Presents var destination`                          | `maybeModal` in the stack (exists) but no child Program lifecycle on present or dismiss                                                                                                                                                    |
| `store.scope(state: \.rows[id:])`                    | nothing; a row component must know the parent's Model                                                                                                                                                                                      |
| `Reducer` builder with `Reduce` plus children        | `Update.combine` exists; children are folded by hand in `M.tagsExhaustive`                                                                                                                                                                 |
| `_printChanges()`                                    | `Program.modelChangeLines` exists, used by one example                                                                                                                                                                                     |

And one bug both the hand-rolled version and today's `forEach` have (R1-02,
R2-17): ids are minted from a counter inside `update`, so a late row that
forces a refold reassigns them, and a logged `Increment({ counterId: 1 })`
can count a counter another device added. Plan 00 records it; the `forEach`
below cannot have it, and the rubric scores it 1 wherever it remains.

## North Star

Multiple Counters, whole core logic:

```ts
// examples/multiple-counters/core/src/program.ts
export const Counters = Program.compose.forEach({
  of: Counter,
  slug: 'counters',
  rows: 'counters',
  Id: CounterId, // Id.uuid7('CounterId'); minted by the sender, plan 02
  segment: CounterIdSegment,
  label: row => Option.getOrElse(row.title, () => `Counter ${row.number}`), // the title Rename wrote, else the number stamped at Add
  detail: row => Option.some(`count ${row.count}`),
  preferred: shownOf,
  add: Action.press('Add', {
    what: 'Adds a counter at the end of the list, starting at 0',
    why: 'The person wants another count',
    label: 'Add counter',
    keys: ['a'],
    mints: { counterId: CounterId },
    stamps: { number: domain => domain.highestNumber + 1 }, // a Domain high-water mark, filled at send time (plan 02)
  }),
  remove: Program.compose.presents({
    ask: DeleteQuestion, // Dialog over the list or a page; carries { counterId }
    of: DeleteQuestionProgram, // a two-Action Program: Confirm | Cancel
    style: Navigation.Dialog(),
    title: ({ counterId }, view) => `Delete ${labelOf(view, counterId)}?`,
    onConfirm: ({ counterId }) => DeletedCounter({ counterId }), // the Domain fact the parent's Command produces
  }),
})
```

What `forEach` derives, and Multiple Counters no longer writes:

- **Model**: `{ counters: Keyed.array(Row<CounterId, Counter.Model & { number, title }>, 'counterId'), highestNumber, navigation }`.
  There is no `nextId`: ids arrive on the log, minted by the sender; `Add`
  inserts through `evolve.insert`, which ignores a known key (R4-17); and the
  array Schema refuses a duplicate key at a restore or an offer.
- **Catalog**: the child's Actions lifted per kind (below), plus `Add`,
  `Open`, `Delete`, `Confirm`, `Cancel` with `at`, `writes`, `refusals`,
  `leadsTo` filled in.
- **Navigation**: `/counters` (root list), `/counters/<id>` (child page, pushed
  above the list only), `/counters/delete/<id>` (the question, Dialog over
  list or page), NotFound. `isAllowedAbove` rules come from the shape.
- **Screens**: the list (one row per child: label, detail, the child's Actions
  for that row, Open, Delete), the child page (the child's own screen plus
  Delete), the question, the missing-child page. Each screen asks
  `Catalog.entriesAt`; none lists tags.
- **update**: lifted child Messages reach the child's `update` for that row;
  `Add` inserts a row with the minted id and the stamped number and raises
  `highestNumber`, and a second `Add` with a known id is a no-op; `Open` pushes; `Delete` presents; the
  question's `Confirm` returns the Command that produces `DeletedCounter`,
  a Domain fact that removes the row on every device and nothing else;
  `Cancel` dismisses.
- **reconcile**: the step plan 02 defines, derived from the shape, with
  `reads: [counters, navigation]`, `writes: [navigation]`, and a `when`
  sentence; after every fold step it drops the Destinations that name a row
  the list no longer has. That is how this device leaves the page of a
  counter another device deleted, with no logged Message and no Domain arm
  reading `navigation` (R3-01, R4-19).
- **synchronization**: derived from ownership (plan 02): `Add`, the lifted
  child Messages, and `DeletedCounter` are Domain; `Open`, `Delete`,
  `Confirm`, `Cancel`, `OpenedUri`, `NavigatedBack`, `Followed`, and
  `LeftProgram` are Navigation; `CoveredByHost` is Local (plan 02, R4-11).

The remaining hand-written core is the two combinator wrappers
(`Session.compose`, `ActionMenu.compose`) and the `App.define`, about 30
lines. `app.test.ts` keeps every assertion it has today (its id assertions
use `Mint.sequence`, which yields valid UUIDv7s), plus the one this plan
adds: permute late rows and assert every logged Message still names the row
it named when written, and every row keeps the label it was stamped with.
The README's promise "Delete Counter 2, add another, and you get Counter 3"
holds on one device because the stamp is `highestNumber + 1` and a delete
never lowers the mark; it fails only when two devices add before either sees
the other's row (R3-10, R4-08), which the README says. A rename writes
`title` and leaves `number` alone.

## The combinators

### `compose.forEach`, completed

```ts
export type ForEachConfig<
  Child,
  Model,
  Id,
  Rows extends keyof Model,
> = Readonly<{
  of: Child // a full Program (plan 02)
  slug: Slug
  rows: Rows // a literal key of the parent Model; never 'navigation'
  Id: MintableId<Id> // a branded UUIDv7 Schema that mints itself
  segment: S.Codec<Id, string>
  label: (row: RowOf<Child>) => string // reads the stamped number or the title; never computes a number
  detail: (row: RowOf<Child>) => Option.Option<string>
  preferred: (view: View<Model>) => Option.Option<Id>
  add: AddRule // Add(pressAction) | NoAdd()
  remove: RemoveRule // Presents(config) | NoRemove()
  fields: Fields // sibling fields, as today
}>
```

`NoAdd()` and `NoRemove()` are explicit variants. Ids are minted by the
sender at send time (`mints`, plan 02), so they are on the log before any
fold, never reused, and never reassigned by a refold. Numbers are stamped the
same way (`stamps`) from a Domain high-water mark and travel in the payload,
so a refold reads them back.

### Lifting per kind

`Catalog.lift` today replaces a child's fields with the row id and recognizes
only payload-free children. The completed lift handles each kind:

| Child Action kind             | Lifted Action                                                              | CLI                                      |
| ----------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Press (`Increment`)           | Choose over rows: `Increment({ counterId })`                               | `counters increment <counter>`           |
| Choose (`Export({ format })`) | Choose whose value is a Struct `{ counterId, format }`, asked in two steps | `counters export <counter> srt`          |
| Fill (`SetCount({ count })`)  | Fill with the id added: `SetCount({ counterId, count })`                   | `counters set-count <counter> --count 7` |

A Choose's value may be a Struct (plan 02), so the two-step case is a Choose,
not a Fill, and `childOf` returns the row id and the child's own Message with
its own fields intact, for every kind.

What else lifts, and how (R3-19):

- `at`: a child Action declared `Where.everywhere` is offered at the row's
  Destinations, which are the parent's list (as a Choose over rows) and the
  row's own page; a child `at` that names child Destinations maps each to
  the row's page. A lifted Action is never offered under the parent's
  question, because the parent's refusals are added to every lifted Action.
- `refusals`: the child's refusals are evaluated against the row's View; the
  parent's (`isConfirming`) are prepended, so "answer the delete question
  first" is the first sentence everywhere.
- `keys`: a child key is bound on the row's page only; on the list a key
  would be ambiguous across rows, so the list offers the Choose through the
  menu and the CLI.
- `writes`: the child's paths are prefixed with `path.counters.each`, so the
  graph (plan 07) reads `Increment` as a writer of
  `counters[counterId].count`.

### Row scope

`Counters.row(counterId)` is a mount path: `bound.scope(Counters.row(id))`
gives a React component the Counter's own Model and handles for one row, so
the Counter's row component is reused inside Multiple Counters without
knowing the parent's Model (R2-28). A Program mounted twice is addressed by
its mount path, never by its id.

### `compose.presents`

A child Program presented as a modal with a lifecycle (TCA `@Presents` plus
`ifLet`), with one rule a synced log needs: the child's Model is navigation
state, so nothing Domain may depend on it.

```ts
Program.compose.presents({
  ask: DeleteQuestion, // the Destination that opens it, with its fields
  of: DeleteQuestionProgram, // the child Program shown in the modal; its init is pure
  style: Navigation.Dialog(),
  title: (destination, view) => string,
  onConfirm: destination =>
    DeletedCounter({ counterId: destination.counterId }), // a self-contained Domain fact
})
```

- The child's `init` runs when the Destination is presented, from `Delete`
  and from the carrier's `OpenedUri` fold alike, so a deep link to
  `/counters/delete/<id>` opens the same question. A presented child's `init`
  returns no Commands (checked at build time), so a remote device that folds
  the presentation under Mirror is never half-initialized (R2-24).
- The child's Model lives in the modal entry and is dropped on dismiss. It is
  Navigation state: under SharedDomain each device has its own, and it never
  rides in a peer snapshot offer. It holds only what the Destination's fields
  reproduce (`{ counterId }` for the question), so every one of the child's
  Messages is a Navigation Message (`Confirm`, `Cancel`). Typing is never a
  Navigation Message: a presented Fill keeps its draft in the device's
  `forms` field (plan 02), keyed by the Destination, and its modal entry
  carries the Destination alone. One home each: the stack says where the
  person is, `forms` says what they are typing, and under Mirror a keystroke
  never reaches the log (R3-19).
- The emission is two log entries: the child's `Confirm` (Navigation) closes
  the question on the devices that follow this device's navigation, and
  `update` returns a Command that produces `onConfirm(destination)`, the
  Domain fact every device folds (`DeletedCounter`). Between the two the
  counter is still there with its question closed, for the few milliseconds
  the Command takes; the log records both, and `tail` shows them in order,
  followed by the reconciled navigation change on any device that was
  showing the counter.
- The child's Actions are offered `at: Where.at([ask])` only, and
  `availabilityOf` refuses them everywhere else, so "nothing beneath the
  dialog can be pressed" holds on every surface. A one-shot command reaches
  them only while the question is open on the daemon, because an address
  parses into pages, never into a presentation (plan 02, R4-09).

### `compose` and `scope`, completed

`Program.compose({ a, b })` lifts catalog (`Catalog.within` per child,
exists), navigation (`Navigation.composeNavigation`, exists, each child
under its slug), screen (a `Column` of children unless the parent gives a
layout), reconcile (the children's steps run in order), and synchronization
(union of the children's classifications). The structural `AnyProgram` bag
that drops these is retired with plan 02's total Program record.

### `Update.combine` and child folding

A parent that composes by hand still exists for irregular shapes, such as a
Submodel with OutMessages (the typing game). It gets `Update.child(lens, Child.update)` so a fold arm is one line, and `Command.mapMessages` stays the
only way Commands cross a boundary. A hand-written `Got*` wrapper at such a
boundary is the repository's convention (`CLAUDE.md`), not a smell; the smell
is a `Got*` union a combinator would have derived.

## The rubric

Every example scores 1, 2, or 3. 3 is best (the owner said "make sure things
are getting threes"; the dictated "one, two, three, best to worst" reads the
other way, and the owner confirms the direction in the README). The
example's score is its lowest row. Every row is dated: "today" rows are
what the current APIs can meet and gate a new example now; "planned" rows
apply once plans 02 and 05 land. An existing example below the gate reports
its score in its README and keeps merging bug fixes.

| Score       | Composition                                                                                                                                                                                                                                                                                                                                                                                                                        | Declarations                                                                                                                                                                                                                                                                               | Hosts                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 (planned) | Every list is `forEach`; every modal child is `presents`; every nested Program is `compose` or `scope`; no `Got*` union a combinator would derive; category derived from ownership; stack moves only through `leadsTo`; device consequences of Domain changes only through `reconcile`                                                                                                                                             | Every Action is `Action.press`, `choose`, or `fill` with `at`, `writes`, `refusals`; every fact is `Fact.define`; ownership declared; ids minted and labels stamped at send; every state a sum; every Model field described; no optional a consumer reads; screens ask `Catalog.entriesAt` | One entry file with one call plus one Layers file; names no Action, route, word, or style; no `react-bindings` package; one React API                                                     |
| 3 (today)   | Lists use `compose.forEach` or `Catalog.lift` with ids carried in the Message's payload from a minting Command, never from `forEach`'s `nextId`; nesting uses `compose`, `scope`, `Session.compose`, `ActionMenu.compose`; the required `messageCategory` classifier is written once per Program; stack moves use `Navigation.pushed`, `presented`, and `withoutDestinations`; `Got*` only at a Submodel boundary with OutMessages | Every Action is `Catalog.action` with `what`, `why`, `meta`; every state a sum; a screen's buttons come from a per-screen Catalog built with `Catalog.make`, never from a tag filter over the whole Catalog                                                                                | Hosts name no Action, route, word, or style; React hosts use `@foldkit/react/interaction` only; a terminal host has `entry` and `daemon` and no copied view, settings, or in-process file |
| 2 (today)   | One hand-written fold for an irregular shape, with a `NOTE:` naming the missing combinator; otherwise as above                                                                                                                                                                                                                                                                                                                     | One documented optional                                                                                                                                                                                                                                                                    | Host-specific chrome (a Dock, a brief) still painted from the Program's declaration; a React host on the root API alone                                                                   |
| 1 (today)   | Hand-written row updates by id, ids minted in `update` (today's `forEach` included), a `Got*` union a combinator would derive, tag filters over the whole Catalog in a screen                                                                                                                                                                                                                                                      | Booleans for states, `?` in declarations, string tags through `bound.press`                                                                                                                                                                                                                | A host that names an Action or route; a daemon, view, settings, or in-process file per app beyond `entry` and `daemon`; two React APIs in one app                                         |

What "hand rolling" means, concretely, with the example that does it today:

- row updates by id (`withCounter`, `countedBy` in Multiple Counters' `update.ts`)
- ids minted in `update` (`nextCounterId` in the same file; `nextId` in today's `forEach`)
- stack edits that `leadsTo` or `reconcile` would declare (`askedToDelete`, `closedQuestion`, `deletedCounter`; a smell against the planned row only, since they use `Navigation.pushed`, `presented`, and `withoutDestinations`, which "3 (today)" allows)
- a per-Program `categoryOf` beyond the one required classifier (Multiple Counters' `program.ts`)
- tag filters over the whole Catalog in a screen (`entriesTagged(…, [Add.tag])` in `screen.ts`)
- two `Choose` configs for one idea (`whichCounter` in `message.ts`)
- a daemon, view, settings, and in-process file per terminal host (Counter, Books)
- `clickedIncrement: () => enqueueMessage(Increment())` maps (every `react-bindings`)

## Scores today

Two passes exist, and the reading pass is the authority wherever they
disagree (R3-12):

- `scripts/score-examples.py` writes `plans/05a-example-scores.md`. It scores
  every directory that builds a Program or an application (`Program.make`,
  `Program.compose`, `Runtime.makeApplication`, `makeElement`, `makeProgram`,
  `Runtime.run`), so Foldkit DOM apps such as `auth` and `todo` and the legacy
  `counters` are in; a directory with no host at all (`transcript-player`,
  which has only `core/`) is listed as hostless and not scored; a fixture
  with none of those calls is "not a Program". Each proxy implements one
  "today" row and the file says which; the Hosts proxy counts terminal files
  per host directory beyond `entry`, `daemon`, and `layers`, so Multiple
  Counters' `tui.ts` beside a one-shot `entry.ts` scores 1 as reading does,
  and a React host on the root API alone scores 2 by the row this round added
  (R4-12). The proxies cannot see a `?` in a declaration or a `meta.title?`,
  so they score Declarations 3 where reading gives 2.
- The reading pass, so far over four examples:

| Example           | Composition | Declarations | Hosts | Score |
| ----------------- | ----------- | ------------ | ----- | ----- |
| Counter           | 3 (today)   | 2            | 1     | 1     |
| Multiple Counters | 1           | 2            | 1     | 1     |
| Books             | 1           | 2            | 1     | 1     |
| legacy `counters` | 1           | 1            | 1     | 1     |

Counter's hosts score 1 because its CLI has `settings.ts`, `inProcess.ts`,
`session.ts`, `tail.ts`, and `watch.ts` beyond `entry` and `daemon`; Multiple
Counters' because its CLI is one-shot with a `tui.ts` beside it, which is a
view file per host. No example reaches 3 by reading today. Multiple Counters
is the proof case: it goes to 3 (planned) when `forEach` lands. Whether the
apps built without `Program.make` are expected to reach 3 is the owner's
decision below; the script scores them so the answer has numbers. Legacy
`examples/counters` is retired (decision below); the references to it in
`AGENTS.md`, `PRINCIPLES.md`, and `glossary.md` now point at Multiple
Counters.

## Migration

1. The reading pass over `plans/05a-example-scores.md`; one issue per
   example below the gate; `scripts/score-examples.py` is committed with the
   plans and becomes `pnpm foldkit score`.
2. Plan 02's total Program record, Action kinds, `mints`, `stamps`,
   ownership, `reconcile`, and `availabilityOf`.
3. `compose.presents`; `forEach` lifting catalog (per kind, with `at`,
   `refusals`, `keys`, `writes`), navigation, screen, reconcile,
   synchronization, with sender-minted ids and stamped labels; row scope;
   `compose` and `scope` the same.
4. Rebuild Multiple Counters on it. `app.test.ts`, `impossible.test.ts`, and
   the late-row permutation test are the acceptance tests; the README's
   "things that cannot happen" list is rewritten for minted ids and stamped
   numbers, says when a number can repeat, and says that a command from a
   second terminal is judged at its own address while a question is open in
   a TUI (R4-09); the CLI's two-step delete keeps its tests.
5. `examples/AGENTS.md` gates new examples at "3 (today)" now and at
   "3 (planned)" once step 3 lands.

## Decisions for the owner

1. Rubric direction: 3 is best (proposed) or 1 is best.
2. Retire legacy `examples/counters` (proposed), or keep it as a host
   comparison museum with a README that says it scores 1.
3. Whether an existing example below the gate blocks its own feature work
   until it migrates, or only new examples are gated (proposed).
4. Whether the apps built without `Program.make` (Foldkit DOM apps such as
   `auth` and `todo`, the legacy `counters`) are scored by this rubric and
   expected to reach 3 (proposed), or outside it.
