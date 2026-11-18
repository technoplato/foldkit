---
name: foldkit-composition
description: Compose Foldkit Programs with the combinators instead of hand-rolling folds. Use when a Program holds a list of children, presents a child as a modal, nests Programs, wraps a Program for sync, or when scoring an example against the composition rubric (3 is best; new examples must score 3 today).
---

# Foldkit Composition

Build a Program out of Programs. Every list is `forEach`, every modal child is
`presents`, every nested Program is `compose` or `scope`, every Catalog over a
list is `lift`, and a parent never writes a row update, a stack edit, an id
mint, or a Domain-or-Navigation classifier by hand. The composition plan in
the Foldkit repository's plans folder is the design; this skill is the rule.
Where the design names an API that does not exist yet, the "3 (today)" column
below says what the current API can meet.

## Combinators and where each lives

| Need                                              | Combinator                              | Source                                          | Exists                                                                                                                                                                                                                            |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several Programs side by side, one field each     | `Program.compose({ a, b })`             | `packages/foldkit/src/program/compose.ts`       | yes                                                                                                                                                                                                                               |
| One child under a fixed key                       | `Program.scope('child', Child)`         | same                                            | yes                                                                                                                                                                                                                               |
| Many rows of one child, identified by a string id | `Program.compose.forEach({ of })`       | same                                            | yes, Model and update only, with rows minted from `nextId` inside the fold (a refold reassigns them), so a "3 (today)" list carries its ids in the payload from a minting Command; catalog, navigation, screen lifting is planned |
| A child shown in a modal with its own lifecycle   | `Program.compose.presents({ ask, of })` | planned                                         | no                                                                                                                                                                                                                                |
| Wrap a Program for sync (Starting, Ready, Failed) | `Program.compose.sync({ of })`          | `packages/foldkit/src/program/sync.ts`          | yes                                                                                                                                                                                                                               |
| The one action menu over a Program                | `ActionMenu.compose({ of })`            | `packages/foldkit/src/actionMenu/actionMenu.ts` | yes                                                                                                                                                                                                                               |
| Session mode and settings over a Program          | `Session.compose({ of })`               | `packages/foldkit/src/session/session.ts`       | yes                                                                                                                                                                                                                               |
| A child Catalog offered once over a list of rows  | `Catalog.lift(childCatalog, …)`         | `packages/foldkit/src/catalog/catalog.ts`       | yes, payload-free children only                                                                                                                                                                                                   |
| A child Catalog offered inside a parent's screen  | `Catalog.within(childCatalog, …)`       | same                                            | yes                                                                                                                                                                                                                               |
| A child's navigation under the parent's slug      | `Navigation.composeNavigation`          | `packages/foldkit/src/navigation/compose.ts`    | yes                                                                                                                                                                                                                               |
| Ordered Model steps that accumulate Commands      | `Update.combine`                        | `packages/foldkit/src/update/update.ts`         | yes                                                                                                                                                                                                                               |
| Child Commands crossing a boundary                | `Command.mapMessages`                   | `packages/foldkit/src/command/index.ts`         | yes                                                                                                                                                                                                                               |

Read `examples/counter/core/src/app.ts` for the smallest composition
(`ActionMenu.compose({ of: Session.compose({ of: CounterProgram }) })`) and
`examples/multiple-counters/core/src/message.ts` for `Catalog.lift`. Do not
copy `examples/multiple-counters/core/src/update.ts`: it is the hand-rolled
shape `forEach` replaces, it mints ids inside the fold (a refold reassigns
them), and it scores 1 below.

## The rubric

Score each example 1, 2, or 3 on three rows; the example's score is its
lowest row. 3 is best. Every row is dated: "today" rows are what the current
APIs can meet and are what `examples/AGENTS.md` gates new examples on now;
"planned" rows apply once the declaration and composition plans land, to new
examples first. An existing example below the gate reports its score in its
README and keeps merging bug fixes; it does not block.

| Score       | Composition                                                                                                                                                                                                                                                                                                                                                                                                                        | Declarations                                                                                                                                                                                                                    | Hosts                                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 (planned) | Every list is `forEach`; every modal child is `presents`; every nested Program is `compose` or `scope`; no `Got*` union a combinator would derive; category derived; stack edits only through declared navigation                                                                                                                                                                                                                  | Every Action is `Action.press`, `choose`, or `fill` with `at`, `writes`, `refusals`; every fact is `Fact.define`; every state a sum; every Model field described; no optional a consumer reads; screens ask `Catalog.entriesAt` | One entry file with one call plus one Layers file; names no Action, route, word, or style; no `react-bindings` package; one React API                                                     |
| 3 (today)   | Lists use `compose.forEach` or `Catalog.lift` with ids carried in the Message's payload from a minting Command, never from `forEach`'s `nextId`; nesting uses `compose`, `scope`, `Session.compose`, `ActionMenu.compose`; the required `messageCategory` classifier is written once per Program; stack moves use `Navigation.pushed`, `presented`, and `withoutDestinations`; `Got*` only at a Submodel boundary with OutMessages | Every Action is `Catalog.action` with `what`, `why`, `meta`; every state a sum; a screen's buttons come from a per-screen Catalog built with `Catalog.make`, never from a tag filter over the whole Catalog                     | Hosts name no Action, route, word, or style; React hosts use `@foldkit/react/interaction` only; a terminal host has `entry` and `daemon` and no copied view, settings, or in-process file |
| 2 (today)   | One hand-written fold for an irregular shape, with a `NOTE:` saying which combinator is missing; otherwise combinators                                                                                                                                                                                                                                                                                                             | One documented optional                                                                                                                                                                                                         | Host-specific chrome (a Dock, a brief) still painted from the Program's declaration; a React host on the root API alone                                                                   |
| 1 (today)   | Hand-written row updates by id, ids minted in `update` (today's `forEach` included), a `Got*` union a combinator would derive, tag filters over the whole Catalog in a screen                                                                                                                                                                                                                                                      | Booleans for states, `?` in declarations, string tags through `bound.press`                                                                                                                                                     | A host that names an Action or route; a daemon, view, settings, or in-process file per app beyond `entry` and `daemon`; two React APIs in one app                                         |

`Got*` is this repository's name for a child Submodel's result at a
hand-written boundary with OutMessages (`CLAUDE.md`), such as the typing game.
That is a 3. The smell is a `Got*` union written where `compose`, `scope`, or
`forEach` would have derived it. The `NOTE:` on a 2 names the missing
combinator, which is something a careful reader would otherwise get wrong.

Hand rolling, by name, with the file that does it today:

- row updates by id: `withCounter`, `countedBy`, `counted` in
  `examples/multiple-counters/core/src/update.ts`
- ids minted in the fold: `nextCounterId` in the same file, and `nextId` in today's `compose.forEach`
- stack edits in `update` that `leadsTo` would declare: `askedToDelete`,
  `closedQuestion`, `deletedCounter` in the same file (a smell against the
  planned row only; they use `Navigation.pushed`, `presented`, and
  `withoutDestinations`, which "3 (today)" allows)
- a per-Program classifier beyond the one required `messageCategory`: `categoryOf` in `examples/multiple-counters/core/src/program.ts`
- tag lists in screens: `entriesTagged(…, [Add.tag])` in
  `examples/multiple-counters/core/src/screen.ts`
- two `Choose` configs for one idea: `whichCounter` in
  `examples/multiple-counters/core/src/message.ts`
- a daemon, view, settings, and in-process file per terminal host:
  `examples/counter/cli/src/`, `examples/books/cli/src/`
- click-to-Message maps: every `examples/*/react-bindings`

## Workflow

1. Name the shape first: list, modal child, siblings, or sync wrapper. Pick
   the combinator from the table. If none fits, write the fold by hand, mark
   it `NOTE:` naming the missing combinator, and open an issue.
2. Declare before composing: the child is a full Program (catalog, screen,
   navigation, synchronization), so the combinator has something to lift.
3. Let the combinator derive Model, Message, init, update, catalog,
   navigation, screen, and synchronization. Write only what no combinator can
   know: titles, which row a bare press means.
4. Never mint an id in `update`. An id is on the log before any fold sees it
   (the declaration plan's `mints`); today, mint it in a Command and carry it
   in the Message's payload.
5. Keep the parent's tests on behavior ("nothing beneath the dialog can be
   pressed"), never on the combinator's internals.
6. Score the example with the rubric before opening the pull request. A new
   example below "3 today" does not merge; an existing one records its score.

## Invariants

- A child never knows its parent. Lifting is the parent's job.
- Ids are branded, minted by the sender, never reused, never reassigned by a
  refold.
- Commands cross a boundary only through `Command.mapMessages`.
- Domain-or-Navigation is derived from what a Message writes; a hand-written
  `categoryOf` is a smell.
- Screens ask the Catalog what is offered here; they do not list tags.
