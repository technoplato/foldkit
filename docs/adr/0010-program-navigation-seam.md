# ADR 0010 | Program-level navigation seam

Date: 2026-08-24

Status: Accepted in part — seam types + URI sync helpers landed (441cbc8a2); makeApplication integration pending

## Context

ADR 0009 (amended) landed the navigation vocabulary: `PresentationStyle`,
`Presented`, `NavigationStack`, `stackInstructions` with the round-trip law,
`RouterPlugin` + `createNavigationAdapter` for host routers, and app-level
URI projection laws proven in Multiple Counters. What remains is the owner's
root requirement: navigation as a root-level Program concern so applications
compose deterministically, and state syncing to the URI on every surface
through one boundary instead of per-app convention.

Today a Program carries navigation inside its own Model by hand
(`examples/counters/core/src/model.ts`), prints URIs through app-owned
routers, and each host wires carriers and adapters itself. That works but
does not compose: two composed Programs cannot share one address space, and
nothing in the `Program` type tells a host that navigation exists.

## Decision (proposed)

1. `Program` gains an optional `navigation` field:

```ts
export type ProgramNavigation<Destination> = Readonly<{
  /** Closed destination union, Schema-backed. */
  readonly Destination: ProgramSchema<Destination>
  /** Stack <-> URI biparser pair over the destination union. */
  readonly printStack: (stack: NavigationStack<Destination>) => string
  readonly parseUri: (uri: string) => Result.Result<NavigationStack<Destination>, ParseError>
  /**
   * Reads the stack out of the app Model and writes a new one back.
   * Keeps Model ownership in the app while the runtime owns sync.
   */
  readonly stackOf: (model: unknown) => NavigationStack<Destination>
  readonly withStack: (model: unknown, stack: NavigationStack<Destination>) => unknown
}>

// on Program:
readonly navigation?: ProgramNavigation<never> // existential at the type level; helpers recover it
```

2. The runtime owns the URI loop when `navigation` is present. On boot it
   parses the carrier URI into a stack and opens it (`OpenedNavigation`
   fact). After every update it diffs `stackOf(previous)` against
   `stackOf(next)`, applies `applyStackInstructions` semantics to history
   via the browser plugin today (`pushUrl`/`replaceUrl`/`back` from
   foldkit/navigation), and reparses canonically. Other surfaces reuse the
   same diff through their carriers; plugins translate.

3. Composition rule: composing two Programs with `navigation` fields nests
   stacks - the parent's presented entries may carry child roots. Address
   spaces concatenate (`/parent/.../child/...`) because printers compose the
   same way routes do under `oneOfCases`. Deep links parse outermost-in.

4. Apps keep their bespoke `Navigation` sums only until they adopt the seam;
   counters' `uriProjection` laws become the acceptance tests for the
   runtime loop (same URIs, same round trips).

## Consequences

- `Runtime.makeApplication`/`makeElement` grow one optional behavior branch;
  hosts without `navigation` are untouched.
- The transient-identity asymmetry (presentation ids never enter URIs)
  becomes framework law via the skeleton comparison proven in counters.
- Plugins become the only router-specific code anywhere: web today,
  react-navigation/expo-router named-route translations already shipped.

## Non-goals

- No serialization of stacks into URIs beyond canonical paths (no replay
  tapes in URLs; see ADR 0003).
- No cross-Program shared history in v1.
