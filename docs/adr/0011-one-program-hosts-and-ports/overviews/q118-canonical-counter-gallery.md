# Canonical v2 — Counter in full, the Gallery, and the framework utilities (2026-08)

The one-codeblock deliverable from the review round, mirrored from chat.
Feedback folded in: modes dead; child-owned slugs; flat app Model with a
projectDomain-style sync projection; explicit named root; global focus;
agents see everything; concrete example beside every abstract claim.
Nothing here is locked; Q123 is the live question.

```ts
// ═══════════════════════════════════════════════════════
// CANONICAL DRAFT v2 — Counter in FULL, the Gallery that
// composes it, and the framework utilities they need.
// Supersedes every earlier sketch. examples/showcase as
// it exists today is explicitly NON-canonical.
// ═══════════════════════════════════════════════════════
// ───────────────────────────────────────────────────────
// file: packages/foldkit/src/navigation/slug.ts
// ───────────────────────────────────────────────────────
import { Schema as S } from 'effect'

/** A URL word owned by the Program it names, declared
 *  exactly once. Branded so a parent cannot inline a raw
 *  string at a mount site; it must import the child's.
 *  e.g. Counter declares slug('counter'); the Gallery
 *  writes `child: CounterProgram` and the prefix falls
 *  out of CounterProgram.slug. Renaming a slug changes
 *  URLs only. Program id (tape identity) is separate. */
export const Slug = S.NonEmptyString.pipe(S.brand('Slug'))
export type Slug = typeof Slug.Type

export const slug = (word: string): Slug => Slug.make(word)
// end file

// See chat fence for graph.ts, via.ts, catalog.ts,
// program/app.ts, counter core (navigation, model,
// message, update, screen, init, program), gallery core
// (navigation, message, screen, program), and the
// end-to-end traces. This file records the decisions;
// the chat fence of 2026-08 is the full text and will
// land as real files when the plan phase begins.
```

Decisions this draft encodes:

1. Routes only. A "mode" was two things wearing one name: a real place
   (Settings: a route, `/settings`, push/pop) and in-page feature state
   (edit machines: `Clean | Dirty | Saving`, Model ADTs, not URIs).
2. `Navigation.make({ root, routes })`: root is named, never
   first-in-array. `Navigation.mount({ child })`: prefix defaults to the
   child's branded slug; override only on collision.
3. Flat app Model: `{ ...domain, <slug per mount>, navigation, chrome,
runtime }`, reserved keys boot-asserted; `projectDomain` selects the
   synced subset (prior art: examples/counters projectDomain).
4. Per-mount gates: engine-mounted children are `Starting | Failed |
Ready`; local children are bare values; no combined global status.
5. Mount-path addressing: `'Counter/Increment'` vs
   `'Counters/Counter/Increment'`; dispatch(send, path, tag, via) builds
   lift wrappers (`GotMount({ path, message })`; forEach's GotChild is
   the by-id prior art).
6. Catalog declarations: semantic tier top-level (what, why, fields,
   enabled, destinations, moves); presentation tier under `meta`
   ({ label, keys }); no tokens field (tag is the identity); no spoken.
7. `id` (tape identity) and `slug` (URL word) are distinct, both branded,
   both single-definition.
8. NotFound is a real destination carrying the attempted path; the seam
   refuses non-canonical URIs; no silent home rewrite.
9. Gallery has no domain and no update: pure composition. Tiles derive
   from the mount table (meta bag), each showing its child's own gate.
