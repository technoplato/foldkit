# ADR 0013 | Local snapshots

Date: 2026-10-02

Status: Accepted and implemented in `packages/foldkit/src/runtime/localSnapshot.ts` and `start.ts`. The Counter keeps one in `localStorage` on the web, in AsyncStorage on Expo, and in `~/.cache/foldkit/foldkit-counter-v01.json` on the terminal hosts. Answers Q108 for the boot path; Q109 (compaction) stays open.

## Context

The Message log is the law and a snapshot is a cache (Q86). Boot ignored the shared count row and folded the whole log, which Q108 rejected as the product path ("whole-log refold is not a good idea"). In the browser it was worse: the engine booted empty and every old row arrived as a live Message, so a reload replayed all of them on screen. The Counter's log is about 2,700 rows.

A shared count row cannot say which Messages it includes: one integer, written last-writer-wins by several Processors. A Processor's own fold can.

## Decision

1. **Each device keeps its own fold.** `Runtime.start({ ..., localSnapshot })` takes a `LocalSnapshotStore`: one text value with `load` and `save`. `LocalSnapshot.webStorage`, `LocalSnapshot.fromPromises` (AsyncStorage), and `localSnapshotFile` from `foldkit/cli` (Node and Bun) build one. No remote snapshot is trusted at boot.
2. **The watermark is a proof, not a clock.** A snapshot stores the newest row's log position, the number of rows it folded, and an order-free fingerprint of their ids. Boot trusts it only when the log rows at or before that position match the count and fingerprint exactly. `[m1, m2, m3]` folded to `count: 3` is proven by any log whose first three rows are those ids; a row that lands late behind the position, or a row that vanished, breaks the proof and the runtime folds the whole log once.
3. **Paint first, reconcile behind.** With a snapshot, the Program is Ready at once with the saved Model, then the runtime reads the log, folds only the rows past the watermark, and sends `LogRefolded` if anything changed. A failed read keeps the snapshot on screen. Without a snapshot, boot reads once and folds once; old rows are never replayed as live Messages.
4. **A snapshot holds only what every Processor sees.** It is the fold as a Processor that wrote none of the rows, so navigation one Processor keeps local under SharedDomain never leaks into it. Two tabs can share one store, and a new run, which has a new Processor id (Q107), can start from any of them.
5. **The Program's version owns the shape.** A snapshot is the Program's own Model, encoded with its own Schema and stamped with its id and version. A snapshot from another version is dropped and rebuilt from the log, which the new version folds with its own update, so snapshots never need migrating. Compatibility work belongs to Messages: an old row must still decode into the current Message union.

## Consequences

- A Counter reload against the production log paints the count in about 135 ms with no Starting screen and no replay; before, it showed Starting for about 900 ms and replayed old rows.
- The terminal hosts and the CLI daemon start from the file and fold only the rows since their last run.
- The shared count row is still written for counter-swift and the Rust reader. Boot never reads it.
- Open: stamping each Message row with the writer's Program version, so a reader can upcast an old shape and skip a newer one explicitly. That needs an Instant schema change.
- Open: Q109 compaction. A trusted published snapshot plus a file of old rows would let boot read only the tail; today the whole log is still downloaded, just not refolded.
