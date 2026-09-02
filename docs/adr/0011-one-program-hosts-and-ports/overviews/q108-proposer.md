# Q108 quorum 2 | proposer

**Status:** brief only. Does not decide Q108 in `qanda.md`.  
**Pick:** **E** (new). Bookmark by Message **id**. Boot is cheap. Same law in TypeScript, Swift, and Rust.  
**Not:** A (clock cut), B (1 ms bump), C (cut after one id with no prefix proof), D (fold the whole log from 0 on every boot).

Quorum 1 resolver `01a03ed1-d539-7e80-a429-51e265f48c36` picked **D**. Michael rejected that as the product path. D stays **debug / harness only**.

Already decided, not reopened: Q86 (snapshot is a cache; the Message log is the law), Q88 (fold in log order; no catalog `combines`), Q105 (one Instant online/offline Port; harness = two Processors + N runs), Q107 (`from` is this run only; skip history by Message **id**). Increment is the minimum case. `examples/counter` is the gospel. Instant leftovers #240–#245 stay Open/Blocked. Do not push pointfreeco.

---

## Teach me

Two apps (Foldkit GUI and counter-swift / TCA 2) can show different counts **at launch**. Reset or quit/reopen “fixes” it. That is a boot bug, not only a long partition.

**Fold** means: take the current count, run `update` with one Message, get the next count. Increment adds 1. Reset sets 0. Order matters (Q88).

**Snapshot** means: a saved copy of the count so we do not re-run `update` on every old Message. Q86 already said this is a cache. The Message log is the law.

**Watermark** means: the bookmark that says “the cache already includes everything up to here.” Boot starts at the cache and only folds Messages **after** that bookmark.

A real bookmark names **which Messages are already inside the cache**. It does not name a clock time.

**Why “fold the whole log” is slow.** Every boot would run `update` once per historical Increment. FoldkitCounterV01 is already on the order of ~2k rows (Q45). That number only grows. Walking a list of ids is cheap. Running `update` on the whole history is the expensive part. When Messages get richer than Increment, that cost gets worse. Common sense: do not pay it on every launch.

**Why “cut by clock” is wrong.** Today several hosts treat `snapshot.at` (a millisecond) as the bookmark.

- A write stores `snapshot.at =` that Message’s clock, then some hosts fold every Message with `createdAtMs >= at`. Equality applies the Message that _made_ the cache a second time. Count goes +1 extra. That is the off-by-one.
- Gospel Foldkit boot tries to dodge equality by covering the **whole millisecond** (`snapshotBoundary`). Same-ms peer Increments are then treated as “already inside the cache.” They are not. That is off-by-N.
- Two phones can increment while apart. Instant keeps **one** `count` integer (last writer wins on that row). Both Message rows still exist. The winner’s clock is not “every Message before this time is inside this integer.” A peer Increment with an earlier clock is dropped. Two apps that cut the log differently disagree at startup.

`from` cannot save this. Q107: each run mints a new author id. After reload, old rows still say the previous `from`. Skipping “my” history by `from` either drops real work or (with a new `from`) applies it again.

```text
10-foot:

  Program (core)     update(model, Message) is the only fold
        │
        ├─ adapter     paint the count
        └─ Instant     one count row (cache) + message rows (law)

  TODAY the cache is not a bookmark:
    Instant update() overwrites count.value
    two Increments → two message rows, one integer
    hosts then cut the log by createdAtMs
```

---

## Ideal law

**E. Prefix cache, named by Message id.**

A snapshot is legal only when `value` is the fold of a **known set** of Messages (a prefix: those ids, and only those ids). The bookmark is that set. The newest id in the set is `asOf`. The clock is for sorting and display. It is not membership.

Boot starts at `value` and runs `update` only for Messages whose id is **not** in the set. That is O(new Messages), plus any Message the last-writer cache missed. It is not O(entire log).

Blank snapshot, or a legacy `asOf` that is a processor name and not a Message id: treat the cache as untrusted. Fold from 0 **once**, then write a legal E snapshot. That is migrate / first room, not the steady product path.

```text
WRITE (one Instant transact)
  message  { id, tag, from, createdAtMs [, seq] }     append
  snapshot { value, asOf: message.id, included: ids already in value, at }

BOOT  (TS / Swift / Rust, same function)
  if snapshot blank OR asOf is not a Message id in the log:
      model = init; fold all; skip by id; then write E          // once
  else:
      model = snapshot.value
      applied = snapshot.included
      for m in log ordered (createdAtMs, from, seq, id):
        if m.id in applied: continue                           // cheap
        model = update(model, m)                               // new or missed
        applied.add(m.id)

LIVE
  from == thisRun  → remember id, do not apply                 // echo
  id in applied    → skip
  else apply

DEBUG / HARNESS only
  model = init; fold all; skip by id                           // never the GUI path
```

Same law in TypeScript, Swift, and Rust. Increment is the minimum Message. No second `update`.

This is ordinary event sourcing. A snapshot is the model after a known prefix. Replay only what is not in the prefix. Consumers skip work they have already done by **event id**. Kafka calls the bookmark an offset and still dedupes by event id. Replicache’s cookie names the data the client already has; `lastMutationID` names which mutations are already in the patch. Electric’s `offset` is a position in a log, not `Date.now()`. Instant `update` on one number is last writer wins. It is not that prefix.

---

## What we store

On the Instant `count` row (today: `asOf`, `at`, `value` in `packages/instant/src/snapshotLog/snapshotLog.ts`):

| Field      | Meaning                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `value`    | Cached count. The fold of `included`. Not the law.                                                                               |
| `asOf`     | Message **id** of the newest included Message. Never a processor name (`cli`, `counter-swift-ios`). Never a clock.               |
| `included` | Every Message **id** already inside `value`. The prefix proof. Array or id→true map; do not pick the Instant column here (Q100). |
| `at`       | `createdAtMs` of `asOf`. Sort and display only. Not a cut.                                                                       |

Log order stays `(createdAtMs, from, seq if present, id)` (Q88). Instant message rows today have no `seq` (`InstantLogMessageRecord`). Do not invent a wire `seq` this week.

Do **not** store Instant `serverCreatedAt` as membership. Do **not** store `from` as membership.

While a Processor is running, `applied` is that same id set in memory. After reload, `from` is new (Q107). Seed `applied` from `snapshot.included`. If `included` is missing (legacy rows), the cache is untrusted.

A writer must put **its known fold** in the cache: the running count and every id it has applied. Not “1 from a cold Increment.” `commitSnapshotLog` already stamps `asOf: id`. Gospel `fillWriteTime` still stamps `asOf: processor`. Swift `snapshotLogWrite` copies that. Those dialects must meet E.

---

## Live vs boot

|                   | `from`                                                                        | Message `id`                             | Clock `at`                            |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| **Live**          | This run only. If `from == thisRun`, remember the id and do not apply (echo). | Skip if already applied.                 | Sorts the log. Does not decide apply. |
| **Boot / reload** | Ignore. New `from` must not skip or double-fold history.                      | Skip if id is in `included` / `applied`. | Sorts the log. Does not decide apply. |

Q107 already locked this split. Q108 only names the bookmark `id` talks to.

---

## Why not whole-log

Folding from 0 on **every** boot wastes the cache Q86 already asked us to write. It gets slower forever. Local `update` on a tap stays instant either way. The pain is launch and catch-up.

Full replay is allowed only when named as such:

1. **Debug / harness.** Prove the cache matches the log (Q101). Do not ship this as GUI boot.
2. **Untrusted cache.** Blank row, or `asOf` is not a Message id. Fold from 0 **once**, write E, stop.
3. **Optional nightly reconcile.** Sample: fold from 0 in the harness, compare to E boot. Not the product path.

Quorum 1 D as everyday boot is rejected.

---

## Tests

Smallest harness: two Processors, Instant online/offline Port (Q105), **N** runs. Reload mints a **new** `from`. Tests must not pass by echo-skip.

```text
1. RELOAD
   snapshot { value: 1, asOf: M1, included: {M1}, at: 1000 }
   m1 Increment id=M1 from=OLD createdAtMs=1000
   BOOT from=NEW
   expect 1, not 2

2. THEN m2 Increment id=M2 from=PEER createdAtMs=2000
   expect 2. N reloads still 2. Both Processors reload, same 2.

3. CONCURRENT LWW  (Q103.1 / startup drift)
   mA Increment from=A createdAtMs=1000
   mB Increment from=B createdAtMs=999
   snapshot { value: 1, asOf: A, included: {A}, at: 1000 }   // A won the count row
   BOOT from=NEW
   expect 2                                                 // fold mB; it is not in included

4. SAME MILLISECOND
   mA and mB both createdAtMs=1000
   snapshot { value: 1, asOf: A, included: {A}, at: 1000 }
   BOOT expect 2                                            // do not cover the whole ms

5. LIVE inject m1 again → still 2                           // id idempotent
```

Cases 1–2 fail today on `messagesSinceSnapshot` (`createdAtMs >= snapshot.at`) in `packages/instant/src/snapshotLog/snapshotLog.ts`. Cases 3–4 fail today on gospel `snapshotBoundary` in `packages/foldkit/src/runtime/start.ts`, Swift `snapshotLogHydration` in `/Users/laptop/Sync/tca/dea/Sources/InstantTape/SnapshotLog.swift`, and Rust `fold_after` (`created_at_ms <= snapshot_at`) in `/Users/laptop/Sync/tca/ports/rust/tca-rust-port-dir-tow/examples/counter-core/src/fold.rs`. Rust `sync_log.rs` also seeds a watermark to max `createdAtMs` and replays nothing.

Tests that encode “same millisecond is covered” or “do not fold the snapshot’s own row because `>=`” are the bug, not the spec.

Open, not decided here: Q45 (full-log hydrate vs slim query of unknowns), Q100 (Instant EAV / queue), Q101 (performance harness around this boot).

---

## Risks

- **Clock skew / same-ms.** Client `Date.now()` can put a late tap before a Reset a human saw first (Q88 residual). We still sort by that tuple. We do not drop a Message because its clock is old. Same-ms ties break on `from` / `seq` / `id`. We do not treat the whole millisecond as already folded.
- **Instant query completeness.** First `subscribeQuery` can be a partial payload. Next emission folds remaining unknown ids. First paint may be short. Representations match after the log is complete (Q86).
- **Snapshot is not a prefix.** Instant `countEntity.update` overwrites one integer (`packages/instant/src/snapshotLog/core.ts`; Instant `update` overwrites, it does not fold). Two Increments can leave two message rows and one `value`. If `included` names only the winner, boot still folds the loser (case 3). If a writer lies (`value` is not the fold of `included`), devices drift. Untrusted `asOf` fails closed: one full fold, then write E.
- **Thin last-writer cache.** LWW can replace a fat `included` with a thin one. Boot stays correct and temporarily folds more. The next persist must write the known fold again.
- **`included` size.** ~2k ids is fine for Counter this week. Slimmer reads are Q45 / Q100 / Q101, not a different watermark.

---

## Refuse

- CRDT or operational transform on the integer. That is a second `update` (Q86 D, Q88 C).
- Vector clocks.
- A second `update`.
- Q108 **B** (add 1 ms to `at`, or hide the snapshot’s own row).
- Instant `serverCreatedAt` as membership.
- Q108 **D** as the product / GUI boot path.
- Q108 **A** as the law (`createdAtMs > at`). Already shipped as `snapshotBoundary` and still wrong for last-writer `count`.
- Q108 **C** as the law (replay only after one `asOf` id, treat `value` as a contiguous prefix). Case 3 still loses `mB`.
- Seeding `applied` with a processor token.
- Mandating `seq` on Instant this week.
- Closing Instant leftovers #240–#245 from this Q. Do not push pointfreeco.

---

## Verified seams (not chat recap)

- `packages/instant/src/snapshotLog/snapshotLog.ts`: `messagesSinceSnapshot` is `createdAtMs >= snapshot.at`. `commitSnapshotLog` sets `asOf: id`. `shouldApplyRemoteLogMessage` skips `from == processorId` first, then id, then `createdAtMs < at`.
- `packages/instant/src/snapshotLog/core.ts`: one `count` id, `countEntity.update({ asOf, at, value })` plus a message row. Instant `update` overwrites the integer ([InstaML](https://www.instantdb.com/docs/instaml)).
- `packages/foldkit/src/runtime/start.ts`: `fillWriteTime` sets `asOf: processor`. `snapshotBoundary(at)` maxes `from` / `seq` / `id` so the whole millisecond is “already folded.” `foldLog` keeps rows only after that boundary. Out-of-order live rows `LogRefolded` through the same cut.
- `/Users/laptop/Sync/tca/dea/Sources/InstantTape/SnapshotLog.swift`: copies `snapshotBoundary`; `asOf` documented as Processor id; live skip is `from` then known ids.
- `/Users/laptop/Sync/tca/ports/rust/tca-rust-port-dir-tow/examples/counter-core/src/fold.rs` and `…/counter-synced/src/sync_log.rs`: `fold_after` skips `created_at_ms <= snapshot_at`; observe seeds `asOf` (often a surface token) and can set the watermark to max `createdAtMs` and replay nothing.

---

## SOTA (what they actually store)

1. [Greg Young on EventStore snapshots](https://stackoverflow.com/questions/16359330/are-snapshots-supported-in-eventstoredb): save state, then read the event stream **forward from the version the snapshot points to**. The bookmark is a stream version / event position, not a wall clock.
2. [Martin Fowler, Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html): application state is derivable from the event log and may be cached (overnight snapshot, replay from there after a crash). The log remains the law.
3. [Kafka-style consumers](https://www.trinitylogic.co.uk/blog/kafka-consumer-idempotency-exactly-once/): an **offset** is a log position; redelivery is normal; skip work already done by a stable **event id**.
4. [Replicache pull](https://doc.replicache.dev/concepts/how-it-works): an opaque **cookie** names the data the client already has; `lastMutationID` names which mutations are already in the patch. [Electric HTTP](https://electric.ax/docs/sync/api/http.md): `offset` is a position in the shape log (`offset=-1` means from the start). Automerge names a point by **heads** (hashes), not `Date.now()`.

None of them treat “last writer’s millisecond on one integer” as “every earlier event is inside that integer.”

---

## What I think

Recommend **E**. Teach the watermark as “which Message ids are already in the cached count.” Write `asOf` as a Message id and keep `included` so last-writer Instant cannot pretend a prefix. Boot folds only unknowns. `from` is live echo. Clock sorts.

Give up: a few extra bytes on the `count` row this week (Q45 can slim). Give up fencepost arguments about `>=` vs `>`. Give up whole-log GUI boot (quorum 1 D).

A is already in production and two apps still disagree at launch. B is a time hack. C still drops the earlier concurrent Increment. D is correct and slow; keep it for debug.
