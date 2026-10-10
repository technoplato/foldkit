---
name: foldkit-composable-architecture
description: Compose Foldkit Programs, applications, updates, Commands, Submodels, OutMessages, Subscriptions, and lifecycle effects. Use for feature architecture, parent-child composition, reducer-like update logic, or moving domain behavior out of a Foldkit view or host.
---

# Foldkit Composable Architecture

Keep one explicit loop: Model is state, Message is a fact, update returns the
next Model plus finite Commands, and the runtime performs effects. Start with
`$foldkit` for repository conventions, then use this skill for composition.

## Workflow

1. Read the nearest complete example before designing. Use
   `examples/counter/core/src/` for a small renderer-free Program,
   `examples/multiple-counters/core/src/` for identified child composition
   (its `message.ts` shows `Catalog.lift`; its `update.ts` is the hand-rolled
   shape `$foldkit-composition` replaces), and `examples/auth/src/` for
   Submodels with OutMessages. For lists, modal children, nesting, and the
   composition rubric, use `$foldkit-composition`.
2. Define Model and Message with Effect Schema. Give Messages verb-first,
   past-tense factual names. Make mutually exclusive states a tagged union.
3. Type init and update returns explicitly. Keep update pure and exhaustive
   with Effect `Match` and `withReturnType`.
4. Define each side effect as a named `Command.define`. Convert success and
   failure into Messages inside the Effect. Never run an Effect from update.
5. Compose children with the combinators (`Program.compose`, `scope`,
   `compose.forEach`, `compose.sync`, `Catalog.lift`), which derive the child
   Message wrapper, the fold arm, and `Command.mapMessages` for you. A
   hand-written `Got*Message` constructor is the convention at a Submodel
   boundary with OutMessages (`examples/auth`) and needs no comment; a `Got*`
   wrapper around a child a combinator would have lifted is hand rolling.
   Opening a nested tool such as a vending menu is `Operating(childModel)` on
   the parent attention union, not a boolean beside the walker;
   `examples/world/core` shows that union, and its `GotVendingMessage` wrapper
   around a child with no OutMessage is the hand rolling to avoid (it scores
   1 in the composition rubric).
6. Choose the lifecycle primitive by cause: Command after a Message,
   Subscription for an external stream gated by Model, ManagedResource for a
   stateful handle needed by Commands, Mount for element-scoped DOM work, and
   CustomElement for a native component.
7. Keep a portable domain in `Program.make` when more than one renderer or host
   should run it. Keep renderer, platform Layer, URI carrier, and launch policy
   in clients.
8. Drive the change with focused update, Story, or Scene tests. Use
   `$foldkit-testing` for the appropriate test level.

## Invariants

- Keep Model as the single source of truth. Do not add host-local domain state,
  mutable module state, callbacks in Model, or view-local business logic.
- Use `Option` and tagged unions instead of sentinel values and boolean state
  combinations.
- Keep Commands next to the update behavior that emits them.
- Use `Update.combine` for ordered, composable Model steps that accumulate
  Commands. Do not make an update step execute a Command.
- Treat `ts-pfw-*` as a separate runtime. Do not name `@tca/*` APIs in Foldkit
  code unless the task explicitly integrates that package.

## Source anchors

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/program/compose.ts`
- `packages/foldkit/src/catalog/catalog.ts` (`lift`, `within`)
- `packages/foldkit/src/command/index.ts`
- `packages/foldkit/src/update/update.ts`
- `packages/foldkit/src/submodel/submodel.ts`
- `examples/multiple-counters/core/src/message.ts`
- `examples/auth/src/update.ts`
