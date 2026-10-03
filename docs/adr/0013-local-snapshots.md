# ADR 0013 | Local snapshots

Date: 2026-10-02

Status: Accepted and implemented in `packages/foldkit/src/runtime/localSnapshot.ts` and `start.ts`, with cursor reads in `@foldkit/instant`. The Counter keeps its local state in `localStorage` on the web, in AsyncStorage on Expo, and in `~/.cache/foldkit/foldkit-counter-v01.json` on the terminal hosts. Answers Q108 for the boot path; Q109 (compaction) stays open.

## Context

The Message log is the law and a snapshot is a cache (Q86). Boot ignored the shared count row and folded the whole log, which Q108 rejected as the product path ("whole-log refold is not a good idea"). In the browser it was worse: the engine booted empty and every old row arrived as a live Message, so a reload replayed all of them on screen and downloaded the whole log, about 3,000 rows and 1.5 MB for the Counter.

A shared count row cannot say which Messages it includes: one integer, written last-writer-wins by several Processors. A Processor's own fold can.

## Decision

1. **Each device keeps its own state.** `Runtime.start({ ..., localSnapshot })` takes a `LocalSnapshotStore`: one text value with `load` and `save`. `LocalSnapshot.webStorage`, `LocalSnapshot.fromPromises` (AsyncStorage), and `localSnapshotFile` from `foldkit/cli` (Node and Bun) build one. The state holds up to four snapshots, the rows after the oldest of them, and the engine cursor. No remote snapshot is trusted at boot.
2. **A series of snapshots, pruned as it grows.** The newest snapshot floats: each save replaces it until it is 200 rows past the one before, then it stays as an anchor and a new one floats. Past four, the oldest is dropped, and so are the rows before the new oldest. With counts `[177, 380, 400]`, a row that lands late at row 300 refolds from 177 over the rows kept since, not from zero. Only a row older than every kept snapshot makes the runtime read the whole log again.
3. **The cursor names the rows already received.** It is how many rows the engine had received, in the order it received them; Instant orders by `serverCreatedAt` and rows are never deleted, so the count is stable. Boot asks only for rows after the cursor, and a row an offline device synced late is received late, so it is never behind a cursor. The live feed watches only the newest 100 rows. A live row behind the last applied one may be one a snapshot already folded, whose id this device no longer keeps, or one that landed late, so it triggers one cursor read, and only rows that read returns can force a refold. The cursor moves every five seconds while rows arrive and before each final save.
4. **The watermark is a proof, not a clock.** Each snapshot stores the newest row's position, the number of rows it folded, and an order-free fingerprint of their ids that grows by addition, so a device that kept only recent rows can still print the watermark of the whole log. When the runtime does read the whole log, it drops any snapshot the log no longer proves.
5. **Paint first, reconcile behind.** With local state, the Program is Ready at once with the newest snapshot, then the runtime reads past the cursor and sends `LogRefolded` if anything changed. A failed read keeps the snapshot on screen. Without local state, boot reads once and folds once; old rows are never replayed as live Messages.
6. **A snapshot holds only what every Processor sees, and only what the engine confirmed.** It is the fold as a Processor that wrote none of the rows, so navigation one Processor keeps local under SharedDomain never leaks into it, and two tabs can share one store. A write is left out until the engine returns it, so a write that never lands is never kept.
7. **The Program's version owns the shape.** A snapshot is the Program's own Model, encoded with its own Schema and stamped with its id and version; state from another version is dropped and rebuilt from the log. Every row the runtime writes carries `programVersion`; the Instant schema gained the optional attribute on 2026-10-02. Compatibility belongs to Messages: an old row must decode into the current Message union through the wire Schema, and a row from a newer version that does not decode is skipped.

## Consequences

- A Counter reload against the production log paints in about 105 ms and downloads 73 KB, of which 21 KB is Instant's handshake and 50 KB the newest-rows window. Before, it showed Starting for about 900 ms, replayed old rows, and downloaded about 1.5 MB.
- The CLI daemon boots from its cache file: 435 to 821 ms against 1,184 ms without it.
- The shared count row is still written for counter-swift and the Rust reader. Boot never reads it.
- A terminal command right after the daemon starts may print the saved count before the log read lands.
- Open: Q109 compaction. The cursor counts rows, so a compaction that deletes rows must also publish the count it removed, or cursors from before it must be dropped.
- Open: upcasting a row by its `programVersion` when the wire Schema alone cannot tell an old shape from a new one.
