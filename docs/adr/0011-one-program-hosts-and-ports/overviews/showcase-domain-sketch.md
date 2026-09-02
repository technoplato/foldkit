# Showcase domain sketch (2026-08, superseded by the Gallery)

First scaled-up composition sketch (showcase mounting every example).
Review verdicts that shaped canonical v2:

- Today's `examples/showcase` is explicitly non-canonical: a scene
  switcher (empty scene structs, hand-mirrored urlToNavigation /
  navigationToPath, hardcoded /showcase prefix), not a composition.
- Nested mounts compose transitively: /counters/counter/c1 exists with
  zero new child declarations.
- The same child mounted twice forces mount-path addressing
  ('Counter/Increment' vs 'Counters/Counter/Increment').
- Session gates compose per mount; local children have no gate; no
  combined global status exists.
- books syncs (was wrongly Local in the sketch).
- Identity retirement traced to replay determinism; placement is Q125.
- Focus is global; one action menu; agents see every mount's catalog.

Canonical result: `q118-canonical-counter-gallery.md`.
