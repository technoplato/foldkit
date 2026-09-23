# Foldkit Principles

**Status:** Draft for review, September 23, 2026.

These are the design principles Foldkit builds toward. They say what good
looks like and why. `CONSTITUTION.md` holds the enforceable rules; when a
principle and the Constitution disagree, the Constitution governs until it is
amended. Shared words (Program, Catalog, Destination, Carrier, Mount) are
defined in `glossary.md`.

Every principle comes with a test you can run against a change and a concrete
example from `examples/counter` (one count) or `examples/counters` (a list of
counters with detail pages).

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
`NavigationStack`. The React Native host shows it as a `Modal` only while the
Model presents it. Android's back button fires `onRequestClose`, which sends
`DismissedActionMenu`, and the Model closes the menu. The Modal never keeps an
open flag of its own.

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

Example: open the Counter on two browser tabs. With no flag, `⌘K` on one opens
the menu on both. With `?sync=shared-domain` on both tabs, `⌘K` opens only
that tab's menu, and choosing Increment from it still moves the count on
both.

**Test:** open the same Program on two Processors in each mode, move only
navigation on one, and confirm the other follows exactly when the mode says
it should.

**Smell:** a host deciding what to sync, or a Program running SharedDomain or
Follow without a `synchronization` classifier. Runtime.start refuses that with
`MissingProgramSynchronization` rather than guessing.

## Using these principles

When reviewing a change, run the six tests. A change that fails one needs
either a fix or a written exception under the Constitution's governance
section.

When two principles pull against each other, the Constitution's conflict order
applies (Governance, section 4). That order ranks convenience last, below
portability. If ergonomics should outrank portability, that is a Constitution
amendment, not a local judgment call.
