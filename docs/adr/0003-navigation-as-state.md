# ADR 0003 | Navigation as State

Date: 2026-07-26

Status: Proposed for detailed review

## Context

Foldkit needs to model navigation with the same guarantees as the rest of an Elm
Architecture Program. The Model is the single source of truth, Messages are facts,
and navigation side effects belong to host adapters. A router, React hook, terminal
loop, or native navigation library must not become a second imperative coordinator or
hide a second mutable navigation Model.

The first proof is Multiple Counters. The Program owns an identified list of Counter
Submodels. A user can add a counter, increment or decrement any row by identity, open
one counter detail, request a number-specific counter fact, and delete a counter after
confirmation.

Counter fact and delete confirmation are presentations over the counter detail. They
must be mutually exclusive. Modeling them as two booleans, two independent optional
values, or host-local modal state would permit an invalid state where both are visible.

Replay is related to navigation but is not navigation. An earlier exploration encoded
the replay event sequence into the browser URL. That makes the URL an event log rather
than a projection of the current destination and causes the carrier to grow with every
Message.

## Decision

Navigation is a Schema-backed sum type in the Program Model:

```text
Navigation
  CounterList
  CounterDetail(counterId, maybeMode)

CounterDetailMode
  CounterFactAlert(status)
  DeleteCounterConfirmation
```

`maybeMode` can contain one `CounterDetailMode` case or no case. Counter fact and
delete confirmation therefore cannot be represented simultaneously. The fact alert
contains its own `LoadingCounterFact | LoadedCounterFact | FailedCounterFact` request
state. The fact request remains a Command and its success or failure returns through a
Message.

The Multiple Counters core owns the only Model, Message union, update, Commands,
navigation route projection, destination projection, and valid interaction derivation.
Every host consumes those definitions. A host can render a destination and translate a
native event into a provided Message. It cannot invent a valid domain action or execute
the fact effect itself.

Destination and mode projections use exhaustive tagged-union matches. Adding a new
navigation or presentation case without a corresponding mapping is a TypeScript build
failure. Runtime fallbacks are reserved for invalid external inputs such as an unknown
counter identifier or an unmatched URL.

The initial host order is:

1. A one-shot CLI that redraws by printing the final Program destination. `--verbose`
   prints the commands valid in that exact state and mode.
2. A React web client that observes the same Program. Browser history projects the
   navigation state into the current path and converts `popstate` destinations back
   into Messages.
3. Next.js after the core projection and browser history seam are stable.
4. React Navigation and Expo Router after the web proof. File-based routing may need a
   scaffold generator, but generated files remain adapters over the same exhaustive
   destination mapping.

The current URL vocabulary is intentionally small:

```text
/counters
/counters/:counterId
/counters/:counterId/fact
/counters/:counterId/delete
```

It describes visible navigation state only. It contains no Messages or replay tape.
Saving a replay tape produces a UUID-addressed saved replay route. Tape compression is
deferred. The navigation URL never expands to carry the tape's events.

Cross-platform adapters may express operations such as push, pop, replace, present,
dismiss, select tab, open drawer, and show modal. Those are adapter effects derived
from a Model transition. They are not Messages in a generic imperative coordinator and
Foldkit does not copy a platform library's complete navigation state into the domain.

## Evaluation Rubric

Every dimension must score 3. Averaging cannot compensate for domain leakage,
unrepresentable-state failures, or replay errors.

| Dimension               | 1                                                                          | 2                                                                                    | 3                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain precision        | Fact and delete presentation can coexist or live outside the Model.        | The Model prevents common invalid states but relies on host rules.                   | One `CounterDetailMode` sum type makes mutual exclusion structural, and every request state is explicit.                                                            |
| Program ownership       | Clients own navigation rules, action validity, or fact effects.            | Core and clients split the same decision logic.                                      | Core owns Model, Messages, update, Commands, routes, destinations, and valid interactions. Hosts only render and forward native input.                              |
| Exhaustive mapping      | A missing destination silently falls back at runtime.                      | Some mappings are exhaustive while presentation or route mappings are open-ended.    | Navigation, destination, detail mode, fact status, and URL printing use exhaustive matches that fail the build when a case is missing.                              |
| URL and replay boundary | URLs contain event sequences or host router state becomes canonical.       | URLs project destinations, but saved replay identity or history feedback is unclear. | URLs project only navigation state, browser history re-enters through Messages, and saved tapes use UUID routes separate from navigation.                           |
| CLI proof               | CLI duplicates transitions or accepts actions invalid in the current mode. | CLI runs the Program but hard-codes part of action availability.                     | CLI resolves every token from the core interaction set, runs the shared Program, redraws the final destination, and prints current valid commands with `--verbose`. |
| React proof             | React owns a second state machine or performs fact effects.                | React shares the Program but duplicates domain action rules.                         | React observes the shared Model, renders exhaustive destinations, forwards core interactions, and projects navigation to browser history.                           |
| Verification            | The concept is described but not executed.                                 | Focused unit checks pass without process or browser evidence.                        | Type checks, core tests, CLI process tests, React production build, and browser interaction evidence all pass.                                                      |

## Consequences

The domain does not model a React Navigation stack, an Expo filesystem, or a browser
history array. It models visible application destinations and presentations. Each
adapter determines the smallest platform operation needed to reconcile its native
surface with the next Model.

The first React proof uses a private example-only binding. It does not canonize a
public React adapter API. Likewise, the current interaction manifest is example core
code. A public Foldkit API should be extracted only after the same shapes survive the
Next.js and native adapter proofs.

### React Presentation Follow-Up

The next proof keeps one example-only `ReplayController` behind `useModel`,
`useActions`, and `useReplay`, then implements two exhaustive React presentation
mappings:

- React-A maps `CounterFactAlert` and `DeleteCounterConfirmation` to one custom
  modal shell.
- React-B maps the fact alert to a responsive sheet and delete confirmation to a
  native browser `dialog`.

React-B is the preferred experiment because a destination case can select the native
surface that best fits its meaning. This does not add presentation state to React. The
dialog opens only when the delete case is present in the Model, and every native
dismiss signal sends a Message. React-A remains implemented as the useful minimal
adapter comparison.

The browser's modal `dialog` makes the rest of the document inert. React-B therefore
renders the same replay controls inside that active destination and omits the ordinary
floating instance for that one case. Replay remains usable without changing the Model
or weakening native modal behavior.

The proof also tightened the renderer-independent replay contract. Frame zero is
not a settled branch point when a tape contains initial Commands. That rule lives
in `ReplaySession`, while the React binding projects the typed failure as a useful
control message. No React-specific presentation behavior moved into Foldkit core.

An OpenTUI React host consumes the same hooks. It renders the core-derived valid
interaction list in a terminal `select`, forwards the selected interaction through
`useActions`, and controls the same replay stream with keyboard input. This validates
the binding and message mapping outside the DOM without changing the core Program.

Deep links to a missing counter normalize to the list. Opening a fact deep link enters
the fact alert in its loading case and restore starts `FetchCounterFact`. The URL stays
the same when the request becomes loaded or failed because those are presentation
contents, not new destinations.

Authentication, authorization, record sharing, tabs, drawers, popovers, multi-column
navigation, tape redaction, and PII detection remain outside this first proof. They
need separate domain designs rather than additional optional fields on Multiple
Counters.

## Outcome Assessment | 2026-07-26 12:19 EDT

| Dimension               | Score | Evidence                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain precision        |     3 | `CounterDetailMode` contains exactly `CounterFactAlert` or `DeleteCounterConfirmation`, held in one `Option`. Core and host tests prove that requesting a fact while delete confirmation is active cannot replace or combine the mode.                                                                                                   |
| Program ownership       |     3 | `counters-core-example` owns the Model, Message union, Counter Submodel routing, fact Command, update, restore, URL projection, destination projection, and valid interactions. CLI, React, and Foldkit hosts import them.                                                                                                               |
| Exhaustive mapping      |     3 | Navigation-to-destination, destination-to-interaction, detail-mode, fact-status, route-to-navigation, and navigation-to-path mappings use `M.tagsExhaustive`. Adding a case without a handler fails type checking.                                                                                                                       |
| URL and replay boundary |     3 | Live paths contain only the list, detail, fact, or delete destination. Browser `popstate` re-enters update through `OpenedNavigation`; stale deleted-counter entries are normalized with `replaceState`. Existing saved replay store tests prove UUID-addressed storage and integrity without using the navigation URL as an event tape. |
| CLI proof               |     3 | Unit and process tests prove identity routing, loaded facts, confirmed deletion, final-screen output, state-specific verbose commands, and a handholdy invalid-action error that lists valid tokens.                                                                                                                                     |
| React proof             |     3 | The production build passes. Live browser checks prove row-specific updates, detail paths, fact loading, mutually exclusive delete controls, deep-link restore, Back navigation, deleted-counter history normalization, and an empty error console.                                                                                      |
| Verification            |     3 | Core tests, CLI process tests, Foldkit Scene and Story tests, React and Foldkit production builds, type checks, lint, formatting, dead-code analysis, replay UUID tests, and live Chrome interaction pass.                                                                                                                               |

The independent evaluation initially scored the React and URL dimensions 2 because a
stale deleted-counter history entry could be normalized by pushing a new list entry.
The adapter now marks `popstate` reconciliation and replaces stale entries. The
adversarial list, detail, delete, confirm, Back, Back sequence remains on the normalized
list without adding history entries.

The result is 21/21 and passes the stricter gate because every dimension scores 3.
The ADR remains Proposed until the broader navigation vocabulary and follow-up adapter
order receive the planned detailed review.

## Expo Showcase Follow-Up | 2026-07-27 13:45:11 EDT

The Expo showcase validates this decision at an application scene boundary. A
renderer-free Showcase Program owns a `Navigation` union covering Home, Counter,
Multiple Counters, Calculator, and Fact. `TappedCounterButton` and the other factual
tap Messages select scenes through update. `OpenedNavigation` lets an external path
enter the same update function. Scene selection does not produce a Command because
the selected scene is application state, not a side effect.

The React and React Native host renders the current navigation case. Expo Web
projects the Model to browser history and converts browser Back into
`OpenedNavigation`. Expo native accepts incoming Linking paths through the same
portable parser-printer. Each child Program keeps its own Model, replay tape, state
path, and replay path. The Showcase Program has a separate tape that can inspect and
branch scene-selection history without replaying child domain Messages.

The validated portable scene paths are `/showcase`, `/showcase/counter`,
`/showcase/counters`, `/showcase/calculator`, and `/showcase/fact`. Scheme,
authority, browser history, native Linking, and rendering remain platform adapter
concerns.

The remaining framework question is the smallest renderer-neutral navigation carrier.
The current evidence supports an injected Effect capability that reads the initial
relative path, observes externally opened paths, and pushes or replaces a printed
path. It does not support an imperative global router or a second navigation store.
The carrier remains example-local until another non-Expo host validates the same
surface.
