---
name: foldkit-navigation
description: Build state-driven Foldkit navigation with typed route unions, bidirectional parser-printers, Program state and replay routes, and client URI carriers. Use for pages, deep links, query parameters, startup routes, intents, redirects, canonical URLs, or route and replay tests.
---

# Foldkit Navigation

Model a destination as data. Parse a URI into typed input or a factual Message,
let update change Model, and let view render the destination. A route must not
execute a side effect directly.

## Workflow

1. Define the destination union with Effect Schema. Make impossible
   presentations unrepresentable instead of combining route booleans.
2. Build bidirectional routes with `foldkit/route`. Use `schemaSegment` for
   branded or refined single-segment values and `query` for query data.
3. Keep parsing and printing together. Prefer `oneOfCases` with explicit case
   paths when routing a tagged destination union.
4. Convert navigation input into startup state or a Message such as
   `ChangedUrl` or `OpenedNavigation`. Emit `pushUrl`, `replaceUrl`, or external
   load effects from named Commands.
5. Use `Program.makeRouter` for the engine-owned portable state and replay URI
   contract. Use `Program.routeCase` and `Program.makeDestinationRouter` when
   one typed destination router joins multiple Program route cases. Keep domain
   intent routes separately composed at their domain or host boundary.
6. Keep the portable relative URI in the Program layer. Let each client add an
   HTTPS origin, native scheme, command-line argument, or request path.
7. Test `parse(print(value))`, canonical printing after parse, and idempotent
   canonicalization. Include invalid segments, unknown routes, query ordering,
   route aliases, and restoration Commands.

## Boundaries

- Do not hand-build paths at call sites when the canonical printer exists.
- Do not put private keys, access tokens, PII, or secret-bearing Model fields in
  a URI.
- Do not treat a parsed intent as permission to execute it. update decides the
  next Model and finite Commands.
- Do not claim a deep link works on a native client from a web-only route test.

## Source anchors

- `packages/foldkit/src/route/parser.ts`
- `packages/foldkit/src/program/route.ts`
- `examples/routing/src/route.ts`
- `examples/auth/src/update.ts`
- `examples/counters/core/src/route.ts`
- `examples/cardboard/core/src/route.ts`
- `examples/replayability/core/src/destination.ts`
- `examples/client-matrix/foldkit/src/carrier.ts`
- `skills/generate-client-matrix/references/matrix-contract.md`
