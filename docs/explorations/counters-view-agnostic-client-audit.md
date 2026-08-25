# Multiple Counters | View-agnostic client audit

Status: source audit of `examples/counters` against the `examples/counter`
exemplar, taken 2026-08-25 ~13:15 EDT on `ml/exploring-view-agnosticism`
(post `1b00e47f8`). This document records deviations from the exemplar's
purity bar and the ownership boundaries that would close them. It does not
establish a new Foldkit package API and changes nothing by itself.

Findings marked OPEN were re-verified immediately before this document was
written. Findings marked RESOLVED describe work already merged during the
audit window and are kept for context.

## Snapshot gates

| Package            | Typecheck | Tests                          |
| ------------------ | --------- | ------------------------------ |
| counters core      | clean     | 82/82                          |
| src (foldkit HTML) | FAIL      | 11/12 (Finding 3)              |
| react              | clean     | 22/22 (routerBridge now green) |
| expo               | clean     | 6/6                            |
| headless           | clean     | 7/7                            |
| instant-host       | clean     | 21/21                          |
| cli                | clean     | 21/21 (stale dist rebuilt)     |
| opentui            | clean     | 15/15                          |

## Finding 1 — HTML host mutates during render and owns resolution policy (OPEN)

The exemplar's view (`examples/counter/foldkit/src/view.ts`) is pure: paint
the screen tree, map tokens to messages, done. `src/main.ts`'s `makeView`
instead keeps mutable closure state that the view itself writes to:

- `src/main.ts:385` — `currentModel.value = Option.some(model)` inside render.
- `src/main.ts:335,352` — `renderedActions.value = new Map(...)` inside
  `interactionsView`, a side table the delegated click listener later reads.
- `src/main.ts` (Mount factory) — ~80 lines of policy in the host: link
  href/origin/target classification, popstate interception, and interaction
  resolution via the cached action map.
- Client-local failures bypass the Model entirely via direct DOM writes
  (`reflectHtmlClientResolutionError`).

Why it matters: view purity is an architecture invariant ("view must not
access external state or close over mutable variables"), and the cached map
is a second source of truth for "what is on screen" that can drift from the
live Model. ADR 0008 already gives the pure shape: paint the projected tree;
resolve causes against the live Model at event time.

Target shape:

1. View paints only labels/roles/reference keys from
   `MultipleCountersInteractionGraph.project(model)` — no cache, because the
   graph is derived from Model and can be re-projected at event time.
2. Resolution becomes a pure function of `(live model, referenceKey,
   occurrenceId)`: project, find by reference key, resolve through
   `foldkit/interaction-graph`'s admission path. Delete the rendered-action
   registry.
3. URL classification moves to `foldkit/navigation` via
   `Runtime.makeApplication`'s `routing` config (`onUrlRequest`/
   `onUrlChange`) where a single-page runtime fits, or shrinks to carrier
   enqueue only inside the Mount where it does not.
4. Client-local failures become Messages (`FailedClientResolution`) rendered
   by the view under `Role('alert')`, replacing direct `document.*` writes.

## Finding 2 — Navigation translation ownership (MOSTLY RESOLVED)

Original deviation: every host hand-translated NavInstructions into stack
vocabulary, including emitting `{_tag: 'Dismiss'}`, a tag `StackInstruction`
never had. During this audit window, `d178f6b8c` and `1b00e47f8` collapsed
the web hosts onto one shared bridge and mapped dismissals to `Pop` with an
explanatory comment (a presented entry pops; the port emits `DismissCall`),
and tanstack/react-router/data-router surfaces now reuse it. React host is
22/22 green as a result.

Remaining step when promoting beyond the example: the translator belongs
beside the types it targets (`foldkit/navigation`, next to `StackInstruction`
and `applyStackInstructions`), keyed off `presentationStyleOf` derivation,
with paths printed only by the same `foldkit/route` printers the carrier
parses. Hosts supply a dumb port object; ADR 0009's "adapters never decide
navigation" then holds mechanically rather than by convention.

## Finding 3 — Two exported updates; Message union advertises more than one accepts (OPEN, failing test)

Since `f098fe3e2` moved child routing into `Program.compose.forEach`,
`counters-core-example` exports two executables:

- `update` (`core/src/update.ts`) — accepts only `FieldOwnerMessage`.
- `MultipleCountersProgram.update` — composed boundary accepting the full
  `Message` union including `GotChild`.

The exported `Message` union includes `GotChild`, so half the public surface
rejects members of the advertised vocabulary. `src/story.test.ts` picks the
raw one and crashes (`Match exhaustive: absurd`); the root suite runs 11/12.
`forEachAdoption.test.ts` demonstrates the correct call form
(`MultipleCountersProgram.update`) — the fix is to make that the ONLY
executable boundary: keep field-owner handling internal to the combinator's
`updateFields`, export the composed update (type-narrow unused subscription
and managed-resource slots in compose options rather than destructuring),
and point Story/Scene at it.

## Ownership map

| Concern                        | Core Program                                     | Foldkit module                                        | Host adapter                                  |
| ------------------------------ | ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Valid-interaction projection   | `interactionsForModel`, occurrence identities    | `foldkit/interaction-graph` (project/admission)       | paints labels/roles/keys only                 |
| Cause resolution               | typed failures per destination                   | `foldkit/interaction-graph` (`resolveWithContext`)    | supplies occurrence id + identity source      |
| URI spelling                   | route schemas                                    | `foldkit/route` printer/parser pairs                  | none (hosts never build paths)                |
| Navigation transitions         | `navigatorInstructions` diff                     | `foldkit/navigation` (`StackInstruction`, plugins)    | dumb port: push/pop/present/dismiss           |
| Browser history/click classes  | `OpenedNavigation` carrier                       | `Runtime.makeApplication` routing or navigation ports | native event enqueue only                     |
| Effects                        | `FetchCounterFact` Command                       | `Command.define` + injected `Layer` (`CounterFactClient`) | chooses Static/Http Layer                 |
| Client-local failure reporting | `FailedClientResolution` Message                 | view renders under `Role('alert')`                    | no `document.*` writes outside paint          |

## References

- Exemplar purity bar: `examples/counter/foldkit/src/view.ts`
- ADR 0008 atomic UI surfaces, ADR 0009 portable navigation adapters,
  ADR 0010 program-level navigation seam
- Precedent for this document:
  `docs/explorations/client-agnostic-runtime-audit.md`
