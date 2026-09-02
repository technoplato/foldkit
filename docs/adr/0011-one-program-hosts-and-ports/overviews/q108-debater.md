# Q108 quorum 2 — debater

Independent brief. Did not read `overviews/q108-proposer.md`. Does not decide Q108 in `qanda.md`.

## Teach me

A **fold** is: start from a Model, run `update` once per Message, in a fixed order. The Counter Model after a fold is whatever those Messages produce. Increment then Increment is 2. Increment then Reset is 0. The log decides. That is Q88.

A **prefix** is the first N Messages of that ordered log. Nothing missing in the middle. If the log is `M1, M2, M3`, then `{M1, M2}` is a prefix and `{M1, M3}` is not.

A **watermark** is the name of “I already folded this prefix; only fold what comes after.” EventStore (Greg Young) names it with a **stream revision**: snapshot metadata says “I folded through event #N,” then you read forward from N+1. Kafka names it with a **consumer offset** (partition + number). Electric names it with a **shape offset / LSN**. Replicache names it with a server **cookie** plus per-client `lastMutationID`. None of those are `Date.now()`.

Wall clock is when a laptop thought it was. It is not a position. Two phones can increment in the same millisecond. One clock can sit an hour behind. Kafka will _look up_ an offset from a timestamp if you ask, then it still stores the **offset**. Instant does not give you an offset. Client `createdAtMs` is the stamp `fillWriteTime` / `commitSnapshotLog` put on the row. It sorts the log. It does not say “everything at or before this time is inside this integer.”

Q86 already locked the split: the Message log is the law; the snapshot is a cache. A cache is legal only when it is the fold of a **prefix**. Last-writer `count.value` on Instant is one integer on one entity. Instant’s own design is last-write-wins on colliding triples ([Instant essay: triples + LWW, CRDT later](https://www.instantdb.com/essays/next_firebase)). Two Increment **message** rows do not collide (different entity ids). Two writes to the one `count` row **do**. Both Messages survive. One integer remains. That integer is not a prefix. That is why 3 and 5 become 5, and why two apps already disagree at **startup**.

Q107 already locked: `from` is this run / this window. After reload it is a new UUID. You skip a row by Message **id**, not by `from`.

```text
10-foot:

  Program (core)     update is the only fold
        │
        ├─ adapter     paints count; does not invent a second update
        └─ Instant     message rows = law
                       count row   = cache, only if it names a prefix

  TODAY the cache does not name a prefix. It names a time and a last writer.
```

## Code today (verified)

Three dialects already boot three different ways. Same Instant app. That is the startup bug, not a fencepost.

**TypeScript gospel** (`packages/foldkit/src/runtime/start.ts`):

- Write: `fillWriteTime` sets `snapshot.asOf = processor` (surface token, not a Message id) and `at = Date.now()`.
- Boot: start at `snapshot.value`, then fold rows **after** `snapshotBoundary(at)`. That boundary maxes `from` / `seq` / `id` so **every row in that millisecond is treated as already folded**.
- Live: skip by `from == this Processor`; skip known ids; a row that sorts before `lastApplied` triggers `LogRefold` from that same boundary, not from init.
- Test `start.test.ts` “boots by folding the Message log, not the stale count row” only has Messages **after** `at`. It does not catch a peer Increment that sorts **before** the winning snapshot.

**TypeScript snapshot-log helper** (`packages/instant/src/snapshotLog/snapshotLog.ts`):

- Write: `commitSnapshotLog` sets `asOf` to the **Message id**. Different writer than `fillWriteTime`.
- Cut: `messagesSinceSnapshot` is `createdAtMs >= snapshot.at` (includes the snapshot’s own row).
- Live: `shouldApplyRemoteLogMessage` skips `from == me`, skips known ids, skips `createdAtMs < at`. Seeds `appliedIds` with `asOf` if non-empty. Fine when `asOf` is a Message id. Poison when `asOf` is `"cli"`.
- Test `snapshotLog.test.ts` “does not fold the Message history on read” encodes `>=` returning the snapshot’s own row as the “live” set. That is the inclusive cut, not a prefix proof.

**Swift** (`/Users/laptop/Sync/tca/dea/Sources/InstantTape/SnapshotLog.swift`):

- `snapshotLogHydration` copies `snapshotBoundary`. Start at `snapshot.value`, fold only rows after the whole-millisecond wall.
- `snapshotLogWrite` sets `asOf` to `processorID`, same as `fillWriteTime`.
- `shouldApplyLiveLogMessage` skips `from` and known ids. No `at` cut on live. Better than TS helper live. Boot still uses the time wall.

**Rust** (`/Users/laptop/Sync/tca/ports/rust/tca-rust-port-dir-tow/examples/counter-core/src/fold.rs`, `wire.rs`, `counter-synced/src/sync_log.rs`):

- `fold_after` / `should_apply_remote`: skip `created_at_ms <= snapshot_at` (strictly newer). `asOf` is the processor id.
- `SnapshotLogBridge::bootstrap`: seeds `appliedIds` with `asOf` (a token like `"tui"`), then skips `created_at_ms <= snapshot.at`.
- Pull **before** bootstrap: `seed_from` sets the watermark to **max `createdAtMs` in the log** and replays **nothing**. A late opener can adopt `snapshot.value` and ignore every Message.

```text
SAME LOG, THREE BOOTS

  Instant LWW count.value = 1
  mA Increment id=A at=1000
  mB Increment id=B at=999

  start.ts / Swift   snapshotBoundary(1000) covers the whole ms
                     B at 999 is "already in 1"  → show 1

  snapshotLog.ts     >= 1000 includes A, skip B   → show 1 or 2
                     depending on asOf seed

  Rust fold_after    skip <= 1000, start at 1     → show 1
  Rust pre-bootstrap watermark = max(ms)          → show 1, fold none

  LAW (Q86, Q103.1)  fold A and B                 → show 2
```

Instant write is one transact of `count.update` + `message.update` (`packages/instant/src/snapshotLog/core.ts`). Atomic pair. Still LWW on the one `count` entity. The Message append is not LWW. The cache is.

## Attacks

### A — Naive time-cut (`createdAtMs > snapshot.at`)

A is already shipped, three ways (`>=`, `<=` skip, `snapshotBoundary`). Two apps still disagree at launch. Changing `>=` to `>` fixes one reload off-by-one (do not fold the Message that _wrote_ the snapshot). It does not fix concurrent Increments.

Time-cut means: “every Message with `createdAtMs <= at` is already inside `value`.” Instant does not promise that. Phone B’s Increment at 999 is in the log. Phone A’s snapshot at 1000 won the integer. A drops B. Count 1. Truth 2.

Clock skew: a late laptop stamps `createdAtMs` in the past. Time-cut drops it as “already folded.” It was never folded.

Same millisecond: `snapshotBoundary` hides the peer that shares `at`. That is not a feature. That is casualty. Tests that say “same millisecond is covered” (`SnapshotLog.swift` comments; Rust `fold_after_skips_the_snapshotted_instant`) are the bug dressed as gospel.

Wall clock is not EventStore revision, not Kafka offset, not Electric LSN, not a Replicache cookie. A uses it as if it were. Refuse A as the product watermark.

### B — 1 ms bump / hide the snapshot row

Add 1 to `at`, or delete/hide the producing Message, so `>=` does not double-fold. Fencepost theater. The reload +1 goes away. Concurrent 3 and 5 still become 5. Clock skew still drops a real row. Hiding a law-row so the cache looks clean is lying to the log.

`serverCreatedAt` is the same idea with Instant’s clock. Still a clock. Still not a prefix name. Refuse B.

### C — Replay after last Message id, start from cached count

Remember `asOf = last Message id`. Boot: `model = snapshot.value`, fold only rows that sort **after** that id. Clock is display/sort only. Skip by id. This is what a _real_ EventStore snapshot does **when `value` is the fold of every event through that id**.

Instant last-writer `count` is not that.

```text
C FAILS (resolver’s case, confirmed)

  mB Increment at=999
  mA Increment at=1000
  snapshot { value: 1, asOf: A }    // A won LWW

  C: start at 1, fold after A
     B sorts before A → skipped
     show 1
  truth: 2
```

C is A with a better name and the same lie: “this integer is a prefix.” It is not, until a writer proves it. Without a proof, C is the startup drift with nicer vocabulary.

### D — Whole-log fold from init on every boot

Correct. Slow as a _law_. Quorum 1 picked this. Human rejected it as the product path. Agreed.

You already **download** the whole log. `snapshotLogQuery` is `{ count: {}, message: {} }`. Q45 is still open; Instant has no “read after id” this week. The paid cost is already I/O plus a sort. The extra cost D adds is running `update` on every old Increment.

For Counter, 2k integer adds are cheap. That is not the point. The product asked for a cache (Q86 A). Throwing the cache away on every launch is not common sense. It also trains every host to treat `value` as decoration, so the next Program with a fat Model pays O(n) forever.

**Debug-only full replay is fine.** Label it debug. Harness uses it to check the cache. Product boot must not.

D as “delete the snapshot row” is also wrong. Keep writing the cache. Just do not start from it when it is not a prefix.

### CRDT / OT / vector clocks as Counter `update`

Q88 already refused a second `update`. Increment combines. Reset does not. A G-counter is a map of per-replica totals. Instant gives you one LWW integer, not that map. A vector clock tells you “these two Increments are concurrent.” It does not tell you what Reset-then-Increment means. You still fold the log in order.

Instant’s authors said LWW is the 80/20 and CRDT is later research. We do not ship a paper this week. Increment is the minimum Message. Same `update` in TypeScript, Swift, and Rust. Refuse CRDT as the Counter runtime.

## Ideal law

**E. Proven prefix cache.** Boot is cheap when the snapshot is a real prefix. When it is not (LWW clobber, late row, legacy `asOf` token), fold from init **once**, then write a proven snapshot so the next boot is cheap. Debug may always fold from init.

```text
ORDER   (createdAtMs, from, seq if present, id)
        time sorts. time is not membership.

PROVEN  asOf is a Message id that exists in the log
        prefix = every Message with order <= asOf.order
        prefix.length == foldedCount

BOOT    if proven:
          model = snapshot.value
          fold Messages after asOf
          skip by Message id
        else:
          model = init (0)
          fold the known log
          skip by Message id
          compact: write a proven snapshot

LIVE    from == thisRun  → remember id, do not apply
        id already applied → skip
        row sorts before lastApplied
          → treat cache as unproven, run BOOT
        else apply, remember id

WRITE   one transact: Message row always
        count row = cache of a prefix you actually folded
          asOf        = last included Message id   (never "cli")
          at          = that Message's createdAtMs (sort only)
          value       = fold of that prefix
          foldedCount = prefix.length

NOT     createdAtMs > at as membership
        snapshotBoundary covering the whole millisecond
        skip-by-from at boot
        seed appliedIds with a processor token
        start from value just because asOf is an id (that is C)
```

Why this is performant and common sense:

- Gospel already holds every Message in process. Counting `prefix.length` is a scan you already paid for. Running `update` on 2k old Increments is what you skip when the proof holds.
- After a clean session, `foldedCount` matches, boot folds only new rows. That is the EventStore move, shaped for Instant (no revision, no LSN, no “read after id”).
- After the LWW race (3 and 5), `foldedCount` is 1 and the prefix through the winner has 2 rows. Proof fails. One fold-from-init. Compact `{ value: 2, asOf: later id, foldedCount: 2 }`. Next launch is cheap and shows 8, not 5.
- Reload with a new `from`: skip by id. If legacy `asOf` is `"cli"` (today’s `fillWriteTime` / Swift `snapshotLogWrite` / Rust `commit`), proof fails closed. Fold from init. Show 1, not 2. Then compact so the next reload does not pay that again.

Same function in TypeScript, Swift, and Rust. Empty / blank snapshot (`asOf == ""` and `at == 0` in Swift `isBlankCountSnapshot`) is already “unproven”: fold from init.

Write rule that makes proofs hold: do not publish `value = local increment of last-seen LWW integer` unless `foldedCount` is the prefix you really folded. A writer who only knows their own tap should set `foldedCount` to 1 and `asOf` to their Message. Boot then sees a longer prefix through that id and invalidates. Safer: after BOOT / LogRefold, compact the cache from the fold you just did. Live Increment can still append a Message immediately (Q101: local `update` is instant). The cache write is “I folded this prefix,” not “I won the integer.”

## What we store

```text
count  (one row, id = c0a7c001-0000-4000-8000-000000000001)
  value         cached Model (count)
  asOf          Message id of the last Message in the prefix
  at            createdAtMs of that Message (sort / debug, not a cut)
  foldedCount   how many Messages that value includes

message  (one row per intent, delete: false)
  id            UUID, skip key
  tag           Increment | Decrement | Reset
  from          this run only (Q107). live echo-skip. never hydration.
  createdAtMs   tap/persist time (Q88). sort key. not a watermark.

optional later, not this week
  seq           already in Runtime.start writes; not on InstantLogMessageRecord
  prefixHash    if Message delete is ever allowed
```

`foldedCount` is an Instant `i.number()` this week. No EventStore revision. No Kafka offset topic. No Electric LSN header. Legacy rows without `foldedCount` or with `asOf` equal to a processor token are unproven.

## Tests

Reload uses a **new** `from`. Must not pass by echo-skip. N is a dozen-class loop (Q103 / Q105).

```text
1. RELOAD (legacy asOf token)
   snapshot { value: 1, at: 1000, asOf: "cli" }   // unproven
   m1 Increment id=M1 from=OLD createdAtMs=1000
   BOOT from=NEW
   expect 1, not 2
   then compact so asOf=M1, foldedCount=1

2. RELOAD (proven cache)
   snapshot { value: 1, at: 1000, asOf: M1, foldedCount: 1 }
   m1 Increment id=M1 …
   BOOT from=NEW
   expect 1
   do not run update on M1

3. THEN m2 Increment id=M2 from=PEER createdAtMs=2000
   expect 2. N reloads still 2, not 2N.
   Two Processors both reload, same 2.

4. CONCURRENT LWW  (Q103.1 / startup drift)
   mA Increment from=A createdAtMs=1000
   mB Increment from=B createdAtMs=999
   snapshot { value: 1, at: 1000, asOf: A, foldedCount: 1 }
   prefix through A has 2 rows → unproven
   BOOT expect 2
   compact { value: 2, foldedCount: 2 }
   next BOOT expect 2 without folding both again

5. SAME MILLISECOND
   mA and mB both createdAtMs=1000
   snapshot { value: 1, at: 1000, asOf: A, foldedCount: 1 }
   if B sorts before A: unproven → fold → 2
   if B sorts after A: proven → start 1, fold B → 2
   never "whole ms is covered"

6. LIVE inject m1 again → still 2 (id idempotent)

7. NEW from ON RELOAD
   first boot from=react-aaa, Increment
   second boot from=react-bbb
   must not skip the first Increment as echo
   must not double-fold it either

8. 3 AND 5
   apart: A folds to 3, B folds to 5, both persist Messages
   Instant LWW count is 5 (or 3)
   heal + BOOT expect 8, not 5
   after compact, next BOOT still 8
```

Tests that encode “`>=` returns the snapshot’s own row” or “same-ms is covered” are not the spec.

## Refuse

Cargo-cult SOTA Instant cannot provide this week:

- EventStore stream revision / `$all` commit position
- Kafka consumer offset (or timestamp-seek-as-law)
- Electric shape offset / Postgres LSN as a Foldkit watermark
- Replicache pull cookie / `lastMutationID` map (no Replicache server)
- Instant `serverCreatedAt` as watermark
- Custom EAV queue / closer-to-the-metal Instant (Q100). The Message table is the queue.
- CRDT, OT, vector clocks as `update`
- Mandating `seq` on Instant rows
- “Query Messages after id” (not in Instant this week; filter in process)
- Whole-log fold as the everyday product path (D)
- 1 ms bump (B)
- Time-cut membership (A)
- Trusting `value` after an id with no `foldedCount` proof (bare C)
- Seeding `appliedIds` with `"cli"` / `"tui"` / `"counter-swift-ios"`
- Using `from` to skip history
- Pushing this to pointfreeco

Keep Instant entities. Keep one `update`. Keep the cache. Name the prefix or do not use the cache.
