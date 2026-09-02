# Q118 iteration — critique + ideal syntax proposal (2026-08-26)

Condensed re-land (the full first draft lived in the Delta thread; its
worktree copy became unreachable). Superseded in part by
`q118-canonical-counter-gallery.md`.

Critique of the then-current shape:

1. One fact, three construction sites: `Increment()` hand-built in
   `factHandles.ts` (tapped), `counterHandle.ts` (tokenToMessage), and
   `counter.tsx` (clickedIncrement). Q116 (every Action carries via)
   breaks all three at once.
2. Six derivable adapter slots handwritten per Program
   (createProgramHooks). Puzzle copied factHandles.ts whole.
3. Presentation leaked from the catalog (`labelOf` special-cases Reset by
   identity).
4. Prose fields that can lie (`mutate`, `sideEffects` restate update).
5. Two validity vocabularies (`valid` + `hiddenBecause` + TapHandle.Hidden).
6. Navigation absent from the Model, making decided Q115/Q117 via.path
   unstampable.
7. `lastScreenTag` module singleton; `createScreenHandle` second Processor.
8. Example code string-parses library menu tokens.

Law installed: declare once, construct once, derive everywhere. Forks
Q119-Q124 came from this; Q125 followed in review.
