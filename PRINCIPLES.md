# Foldkit Principles

**Status:** Draft for review, September 23, 2026. Principles 7 and 8 were
added October 9, 2026 from the owner's words in
`plans/user-messages/2026-10-09-follow-ups.md` (message 2); they are proposed
until the owner accepts this file.

These are the design principles Foldkit builds toward. They say what good
looks like and why. `CONSTITUTION.md` holds the enforceable rules; when a
principle and the Constitution disagree, the Constitution governs until it is
amended. Shared words (Program, Catalog, Destination, Carrier, Mount) are
defined in `glossary.md`.

Every principle comes with a test you can run against a change and a concrete
example from `examples/counter` (one count) or `examples/multiple-counters` (a
list of counters with detail pages).

## 1. Define once

Every product fact is declared in exactly one place: the Program. Menus,
buttons, keyboard maps, CLI commands, agent tools, router tables, and deep
links are derived from that declaration. Nobody retypes them beside it.

Example: `Increment` is declared once in
`examples/counter/core/src/message.ts` with its keys (`+`, `=`) and its
availability rule. The React button, the action menu row, the `+` key, and
`counter do increment` all come from that declaration. Adding a `Double`
Action means one new declaration and one update arm, and nothing else.

**Test:** count the files a new Action or Destination touches. The target is
two: the declaration and its update arm. Every extra file is a projection
someone typed by hand.

**Smell:** a hand-written list that mirrors a Schema union. A `showSurfaces`
array copying `HostId`, a `factHandles.ts` naming every Action, or a React
Router route list repeating the Program's router.

## 2. Universal by default

A Program runs unchanged in every host: browser, React, React Native, Node
CLI, TUI, and headless tests. It never asks which platform it is on. Platform
differences enter through adapters and Effect Layers. A host that cannot do
something says so through a declared capability, not through a branch in
update.

Example: clicking `+` on the React page, tapping `+` in Expo, typing `+` in
the TUI, and running `counter increment` all send the same `Increment`. The
Counter Program never asks which host it is in. Hosts differ only in how they
paint its screen tree and read input.

**Test:** a headless test can drive every feature with no DOM, no `window`,
and no `process.env`.

**Smell:** a Program module that sniffs `navigator.product === 'ReactNative'`,
reads `process.env`, or keeps a list of its own hosts.

## 3. Higher-order composition

Programs compose through combinators that take Programs and return Programs:
`compose`, `forEach`, `ActionMenu.compose`, `sync`, and mounting. A combinator lifts
every projection of its children, not only the fold: Model, Message, update,
the Action catalog, navigation, the screen, and the sync projection. A
composed Program is as complete as its parts.

Example: `ActionMenu.compose({ of: CounterProgram })` returns a Program whose
Catalog, interaction, screen, and synchronization classifier all still work,
plus a presented action menu. The Counter declares nothing about the menu.
`Program.compose.sync` then lifts that interaction once more, so every entry
reads Disabled with "Waiting for the first sync snapshot." until the first
snapshot arrives.

**Test:** compose a Program inside another Program. If anything the child
could do on its own stops working, the combinator is dropping a projection.

**Smell:** a parent that re-declares its child's Actions, routes, or screen.
A combinator result overridden field by field with `Object.assign`.

## 4. Ergonomics is a feature

The correct thing must be the shortest thing to write. Types flow from the
declaration. Call sites never need casts, string tokens, global registries, or
knowledge of Foldkit internals. A new host is small enough to read in one
sitting.

Example: the whole React Counter host is `ProgramProvider`, `Screen`,
`ActionMenuDialog`, and `useKeyBindings` from `@foldkit/react/interaction`.
None of them name Increment, Decrement, or Reset. Labels, keys, and the
"count is already 0" sentence all come from the Catalog.

**Test:** write a new host for an existing Program. If it needs more than one
adapter import plus its own bookkeeping, the library is missing a
derivation.

**Smell:** `sendScreenToken('increment')`, `as unknown as`, or
`S.decodeUnknownSync` used to recover a type that a combinator lost.

## 5. The Program owns the truth; adapters translate

There is one Model per Program occurrence. It is the only answer to "what does
the product believe right now", including where the user is. Adapters paint
that Model and translate native input into Messages. Browser history, argv,
React Navigation, and expo-router are carriers: they show the Model's
destination and report user moves back as Messages. They never keep a second
navigation state machine.

Example: the Counter's action menu is a destination presented on the Model's
`NavigationStack`. `ActionMenuModal` from `@foldkit/react-native/interaction`
shows it as a `Modal` only while the Model presents it. Android's back button
fires `onRequestClose`, which sends `DismissedActionMenu`, and the Model closes
the menu. The Modal never keeps an open flag of its own.

**Test:** remove the carrier (no router, no URL bar) and the Program still
knows exactly what is on screen. Replay the Message log and you land on the
same destination.

**Smell:** `useState` holding a URI beside the Model. A reconcile effect that
compares `location.pathname` against the Model and patches one of them.

## 6. Synchronization is a declared mode

Every synced Message is classified once, as Domain or Navigation, by the
Program's `synchronization` declaration. The session's mode, not a host,
decides which Processors apply it (ADR 0004):

- **Mirror** (the default): every Processor applies everything, so a menu
  opened on the laptop also opens on the phone.
- **SharedDomain**: Domain Messages apply everywhere; Navigation Messages apply
  only on the Processor that sent them, so the count syncs while each device
  keeps its own menu.
- **Follow**: one leader's navigation drives every follower. An Observe
  follower watches and cannot steer; a RemoteControl follower may steer.

Example: open the Counter on two browser tabs. `⌘K` on one opens the menu on
both. Choose "Keep navigation local" from either tab's menu, and every device
switches at the same log position: now `⌘K` opens only that tab's menu, and
choosing Increment from it still moves the count on both. The mode is session
state folded from the tape, never a launch flag, so two tabs cannot disagree.

**Test:** open the same Program on two Processors in each mode, move only
navigation on one, and confirm the other follows exactly when the mode says
it should.

**Smell:** a host deciding what to sync, or a Program running SharedDomain or
Follow without a `synchronization` classifier. Runtime.start refuses that with
`MissingProgramSynchronization` rather than guessing.

## 7. Sync engine, not database

The Message log carried by a sync engine (Instant, Supabase used as a log
store, a Kafka topic) is the only truth, and every value a product shows is
folded from it on every device. Nobody writes a SQL function, a nightly job, a
cache, or a read model to keep a computed value in step, because there is
nothing to keep in step: a computed value is a derived Model field, and a
history series is a Model field a Subscription appends to. A projection to a
table exists only for an outside system that cannot read the log, and it is
written from facts, never computed by hand.

Example: a finance Program derives `netWorth` from balances, positions,
quotes, exchange rates, manual valuations, and debts with one function, and
keeps `netWorthHistory` as a Model field appended once a day by one declared
writer. A chart host reads the Model. A hand-kept copy of such a formula in a
database function or a scheduled job is the thing this principle rules out.

**Test:** list every place a product value is computed. The target is one, the
Program. Every extra place is a copy that will drift.

**Smell:** a database function or scheduled job that restates a rule `update`
already encodes; a table column holding a value the Model derives.

## 8. Declare actions and schema; the implementation falls out

A Program is declared, not assembled: its Model Schema, its Catalog of Actions
(each with what, why, where it is offered, and what it writes), its
Destinations and their routes. Hosts, the CLI, menus, keyboard maps, the
skills markdown an agent reads, the static graph, and the wire are derived
from that declaration. The Elixir world's declarative resources (the Ash
framework on Phoenix, where attributes and actions are declared and the data
layer, API, and authorization derive from them) are the closest prior art;
Foldkit's version keeps the Elm loop and derives the surfaces.

Example (proposed syntax, `plans/02-action-declarations.md`):
`Action.press('Increment', { what, why, label, keys, at, writes })` is the
whole declaration. From it come the React button, the `+` key, the
`counter increment` command, the menu row, the skill's Actions table row, and
the graph edge that answers "what changes the count". Today's
`Catalog.action('Increment', { what, why, meta })` already derives the first
four.

**Test:** add one Action and count the files touched beyond its declaration
and update arm. Every extra file is an implementation detail that should have
fallen out.

**Smell:** a surface that lists Actions by hand; a markdown page that
describes a Program and is edited by a person.

## Using these principles

When reviewing a change, run the eight tests. A change that fails one needs
either a fix or a written exception under the Constitution's governance
section.

When two principles pull against each other, the Constitution's conflict order
applies (Governance, section 4). That order ranks convenience last, below
portability. If ergonomics should outrank portability, that is a Constitution
amendment, not a local judgment call.
