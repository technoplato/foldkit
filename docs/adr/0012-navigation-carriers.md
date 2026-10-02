# ADR 0012 | Navigation carriers

Date: 2026-10-01

Status: Accepted and implemented. The core is in `packages/foldkit/src/navigation/`. Composition is in `Session.compose` and `ActionMenu.compose`. The carriers are the program CLI (`open`, `back`, `where`), OpenTUI, `@foldkit/react/navigation` and `@foldkit/react/react-router` for the web, and `@foldkit/react-native/react-navigation` and `@foldkit/react-native/expo-router` for native. Supersedes ADR 0010.

The full design, with the evidence behind each law, is `docs/explorations/navigation-carriers-design.md`.

## Context

ADR 0010 proposed a runtime-owned URI loop: diff `stackOf(previous)` against `stackOf(next)` and drive history through a `HistoryPort` of `push`, `replace`, and `back`. It landed as `makeUriSync`. Designing carriers for the browser, React Navigation, Expo Router, OpenTUI, and a CLI from one declared code base exposed three problems.

1. Diffing consecutive Models cannot tell a carrier's echo of our own write from a person's move. A remote push that lands while someone swipes back pops the wrong entry.
2. `push`, `replace`, and `back` cannot express a native stack, where one keyed reset is the write that keeps unchanged screens mounted.
3. Each app hand-wrote `printStack` and `parseUri`. Navigation should print and parse from the declaration.

## Decision

1. **Declaration.** A Program's navigation declares a slug and one route per Destination. A route is a Biparser relative to the entry beneath it, plus a placement (`Root`, `Entry`, or `Fallback`), `styleOf`, `isAllowedAbove`, and `titleOf`. For example, the Counter's slug `counter` with a root route on `Route.here` prints `/counter`, and the Session route on `Route.literal('session')` prints `/counter/session`.
2. **One URI for the whole stack.** `printStack` prints every entry's path and every entry's configuration: `[Counter, Push SessionSettings, Dialog ActionMenu('re')]` prints `/counter/session/menu?menu.q=re`. Each entry's query keys are prefixed with the path segments that entry prints, so a search page's `q` and the menu's `q` never collide: `/shop/search/menu?search.q=cats&menu.q=re`. The root prints no segments of its own, so its keys stay bare. `parseStack` is total. It tries a strict parse with backtracking, then a lenient one whose unmatched tail becomes `NotFound`, then a `NotFound` root for a URI outside the slug, then the root stack. `/counter/nope` parses to `[Counter, Push NotFound(['nope'])]` and prints back unchanged.
3. **Two facts.** `OpenedUri({ uri, via })` and `NavigatedBack({ uri })`. `NavigatedBack` names the entry it returns to, so applying it twice, or after a remote push, still lands on `/counter`.
4. **Identity is the printed path.** A carrier plan lists the entries root first, each keyed by its path: `/counter`, `/counter/session`, `/counter/session/menu`. The query is configuration, so typing in the menu replaces the entry instead of pushing a new one.
5. **One carrier loop, tiny drivers.** `runCarrier(source, driver)` diffs the carrier against the plan by key, performs one move, and waits for the driver's expectation. A carrier change the plan did not cause becomes a fact. The loop then waits for the Program's answer before it writes again, and gives up after three writes toward one plan. A driver is `read`, `perform`, and `subscribe`: `browserHistoryDriver(window)` for the web, `keyedStackDriver(stack)` for React Navigation and Expo Router.
6. **The Program decides.** Carriers only report. Under `MirrorNavigation`, for example, the Program ignores a `Launch` so a newcomer adopts the shared stack, and the loop then writes the shared stack to the newcomer's carrier.

## Consequences

- `makeUriSync`, `HistoryPort`, `parseResultToOption`, and `sameStack` are removed from `foldkit/navigation`. `RouterPlugin` and `createNavigationAdapter` stay until Multiple Counters adopts carriers.
- The web host keeps React Router as a controlled renderer of the plan: `browserHistoryDriver` writes history, and React Router's `<Link>` reports `OpenedUri`.
- OpenTUI and the CLI have no external carrier. They launch with `launch(bound, uri)` and go back with `backOneEntry(bound)`.
- Expo Router nests the root layout's stack under a `__root` slot. Its keyed stack resets only that nested stack and spreads in the existing root and layout states, so the layout never remounts and Expo Router's web linking pushes history: browser Back from `/counter/session` returns to `/counter`.
- Under `MirrorNavigation`, a cold deep link such as `/counter/session` joins the shared screen; under `KeepNavigationLocal` it opens. A deep link that arrives while running always opens.
