# Q108 quorum 2 | resolver

**Status:** recommendation only. Does not decide Q108. Chat is **Q91**.  
**Pick:** **E.** Proof field is `included` (Message ids already inside `value`). Not `foldedCount`. Not both.

Full write-up lives under `## Q108` in `qanda.md` (Quorum 2 recommendation). This file is the short pointer.

## Stored

```text
snapshot { value, asOf: Message id, included: those ids, at }
```

`at` sorts and displays. It does not cut. Instant has no EventStore revision, Kafka offset, Electric LSN, or Replicache cookie this week. Do not store those names as Foldkit fields. `foldedCount` is that revision in costume.

## Proves / boot

Proven when `asOf` is a Message id in the log **and** `included` is present. Then boot from `value` and `update` only ids not in `included`. Else fold from 0 **once**, write E, stop. Debug/harness may always fold from 0. That is never the GUI path.

Writer duty: `value` is the fold of `included`. Not last-seen Instant integer plus one.

## Why not the other proof

Debater's `foldedCount` is right that bare `asOf` is C. It is wrong as the everyday proof. Instant LWW means the cache is often not a contiguous prefix. Count mismatch then pays whole-log fold (old D), which the human rejected as the product path. `included` fills the hole cheaply, then compact.

## Seams re-checked (TS only)

- `fillWriteTime` sets `asOf: processor`. `snapshotBoundary` covers the whole millisecond (`packages/foldkit/src/runtime/start.ts`).
- `messagesSinceSnapshot` is `createdAtMs >= snapshot.at`. `commitSnapshotLog` sets `asOf: id`. Instant `countEntity.update` overwrites one integer (`packages/instant/src/snapshotLog/snapshotLog.ts`, `core.ts`).
- Swift / Rust seams: see the two briefs. Not re-opened here.

Instant leftovers #240–#245 stay Open/Blocked. Do not push pointfreeco.
