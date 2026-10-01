# What the distributed-systems papers say about Foldkit's synced fold

**Status:** review of `technoplato/distributed` (commit `9aab1f45`) against the synced runtime, October 1, 2026. Commit `3c17371b9` implemented recommendation 1 (with a 24-hour lead cap instead of 5 minutes, because a 5-minute cap lets a device an hour slow diverge, plus a self-refold when a Processor's own stamp still sorts early), recommendation 4 (session policy as logged state, via `Session.compose`), recommendation 8 (Commands only on the sender), and recommendation 9 (ordered outbox). Instead of recommendation 5's checkable snapshot, boot now folds the whole Message log and the count row is write-only. Personal follow as presence (recommendation 12) waits on navigation.

**Short answer:** having every Processor fold the same rows in one fixed order is enough for them all to converge. Today's runtime doesn't meet that condition on the real Instant connection, for four concrete reasons, and each has a small fix backed by a specific paper. Separately, there is one real design choice the owner has to make.

Nothing was changed in `/Users/laptop/Development/foldkit` and nothing was written to the wiki. The only scratch is the clone at `/tmp/distributed` (commit `9aab1f45`, 2026-09-26). The repo's README says these are OCR conversions that nobody proofread, so quote the original PDFs if this gets published.

**How to read the citations.** Papers are `P01` to `P10`, each at `/tmp/distributed/papers/<NN-name>/<NN-name>.md` (repo path `papers/...`). `L` means line numbers in that Markdown file. Foldkit labels map to these absolute paths:

| Label                    | Absolute path                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `start.ts`               | `/Users/laptop/Development/foldkit/packages/foldkit/src/runtime/start.ts`                                                 |
| `syncEngine.ts`          | `/Users/laptop/Development/foldkit/packages/foldkit/src/runtime/syncEngine.ts`                                            |
| `sync.ts`                | `/Users/laptop/Development/foldkit/packages/foldkit/src/program/sync.ts`                                                  |
| `synchronization.ts`     | `/Users/laptop/Development/foldkit/packages/foldkit/src/synchronization/synchronization.ts`                               |
| `snapshotLog.ts`         | `/Users/laptop/Development/foldkit/packages/instant/src/snapshotLog/snapshotLog.ts`                                       |
| `core.ts`                | `/Users/laptop/Development/foldkit/packages/instant/src/snapshotLog/core.ts`                                              |
| `admin.ts`               | `/Users/laptop/Development/foldkit/packages/instant/src/snapshotLog/admin.ts`                                             |
| `fromTransport.ts`       | `/Users/laptop/Development/foldkit/packages/instant/src/sync/fromTransport.ts`                                            |
| `instantProgramStore.ts` | `/Users/laptop/Development/foldkit/packages/instant/src/instantProgramStore/instantProgramStore.ts`                       |
| `wire.ts`                | `/Users/laptop/Development/foldkit/examples/counter/core/src/wire.ts`                                                     |
| `startConfig.ts`         | `/Users/laptop/Development/foldkit/examples/counter/core/src/startConfig.ts`                                              |
| `main.tsx`               | `/Users/laptop/Development/foldkit/examples/counter/react/src/main.tsx`                                                   |
| `start.test.ts`          | `/Users/laptop/Development/foldkit/packages/foldkit/src/runtime/start.test.ts`                                            |
| `perms`                  | `/Users/laptop/Development/foldkit/examples/instant-counter/instant.perms.ts`                                             |
| `ADR0004`                | `/Users/laptop/Development/foldkit/docs/adr/0004-synchronized-program-session-modes.md`                                   |
| `QA0011`                 | `/Users/laptop/Development/foldkit/docs/adr/0011-one-program-hosts-and-ports/qanda.md`                                    |
| `EXPL`                   | `/Users/laptop/Development/foldkit/docs/explorations/instantdb-shared-program-processors.md`                              |
| `SchemaAST`              | `/Users/laptop/Development/foldkit/repos/effect-smol/packages/effect/src/SchemaAST.ts`                                    |
| `Reactor.js`             | `/Users/laptop/Development/foldkit/node_modules/.pnpm/@instantdb+core@1.0.65/node_modules/@instantdb/core/src/Reactor.js` |
| Swift reader             | `/Users/laptop/Sync/tca/dea/Sources/InstantTape/SnapshotLog.swift`                                                        |

## Bottom line

1. **Convergence.** If every Processor folds the same rows in one deterministic order, each Model depends only on the set of rows. That is the CRDT paper's "Strong Convergence", and the `message` table is literally that paper's Log CRDT: a grow-only set merged by union. Today's runtime falls short on the real Instant connection for four reasons:
   - `seq` is stripped before it reaches Instant.
   - The ordering timestamp is a raw wall clock.
   - Each Processor decides who a Message applies to from its own launch flag.
   - Boot trusts a single snapshot of one writer's view, cut at a wall-clock time.
2. **The real choice: event-time order or numbered positions.**
   - Event-time order was decided in ADR 0011 Q88. It means a row that arrives late can always sort before rows already applied, so refolds never go away and deleting old rows needs a lateness limit.
   - Numbered positions match ADR 0004's "one globally ordered accepted Message history". Once assigned, a position never changes. That gives a one-number watermark, a smaller boot query, and safe deletion of old rows. The cost: it changes Q88's answer when an offline Reset races an online tap.
   - Instant can hand out dense positions today with a `unique()` attribute. I confirmed in Instant's server source that a duplicate value rejects the whole transaction.
3. **Snapshots** aren't needed for correctness. They are needed for boot cost and for deleting old rows, which the owner asked for. A snapshot must say exactly which prefix of the agreed order it covers (the Part-Time Parliament's "law book" plus the number of the last decree in it). It must never be cut at a wall-clock time.
4. **Session policy** should be a logged Message, folded like any other. A Message's audience then comes from the policy in force at its position in the log. `generation` works like VR's view number or Raft's term, and should be used as compare-and-set. Raft's two-step "joint consensus" isn't needed, because the policy decides how rows are interpreted, not how they are ordered.
5. **Figma-style "follow someone"** is presence (ephemeral) that a Subscription turns into local Navigation Messages. Only the durable Follow mode belongs in the log, and its expiry must be a logged Message proposed after a timeout.

## 1. Papers in the repo

1. **P01 Lamport 1978, Time, Clocks. High.** Happened-before (L47-51), the Clock Condition (L79-81), clock rules IR1/IR2 (L103-107), a total order with a process tie-break (L113-117), why a central scheduler alone misorders (L125), the replicated state machine method and its "wait until you've heard from everyone" rule (L145, L161-165), and the physical-clock rule IR2' (L225). This is where the timestamp fix comes from.
2. **P02 Lamport, Shostak, Pease 1982, Byzantine Generals. Low.** We assume crashes, not traitors, so the 3m+1 machinery doesn't apply. Three parts are useful:
   - "All nonfaulty processors must use the same input value" (§6, L344). That rules out per-Processor launch flags and clock reads inside the fold.
   - A missing message can only be detected by timeout with bounded clock skew (A3, L361-367).
   - Unforgeable signatures (A4, L192) make impersonation impossible (L359). That is the way past the honest-client assumption.
3. **P03 Chandy, Lamport 1985, Distributed Snapshots. High for snapshots.** A recorded state is only meaningful if it agrees on which messages were sent and received (§3.1, Example 3.1 and equations 1-4, L131-151). Otherwise you record two tokens or none, which is exactly the `count` row plus `at` cutoff bug.
4. **P04 Fischer, Lynch, Paterson 1985, FLP impossibility. Medium, as a guardrail.** With no timeouts and no way to tell dead from slow, no protocol can guarantee agreement if even one process may stop (L47-49). The fold's convergence needs no agreement. Finality does (a compaction point, a mode change everyone accepts). So use Instant as the arbiter and use timeouts only for liveness.
5. **P05 Oki, Liskov 1988, Viewstamped Replication. High for policy epochs.**
   - View numbers are totally ordered (L53).
   - A viewstamp, (view, timestamp), says exactly which events a state reflects (L59).
   - A request carrying a stale view number is rejected and retried in the new view (L156, Figure 2 step 4 at L126).
   - A new view starts with a `newview` record that carries the state (L323).
   - Unique call ids prevent duplicate execution (L113, L142). "I'm alive" heartbeats detect failures (L247).
6. **P06 Lamport 1998, The Part-Time Parliament. High.**
   - Decrees are numbered and written in indelible ledgers (§1.2, L53-63).
   - The president numbers decrees, and a late decree must never get a number before one already passed. Gaps are filled with a no-op "olive day" decree (§3.1, L368, L377-383).
   - Decree-ordering property (§3.2.1, L393).
   - **Law books plus "the number of the last decree" they reflect (§3.3.2, L411-415).** This is a snapshot with a watermark.
   - Leases with explicit terms and a clock margin (§3.3.3, L425-435). Reads that never go backward, via decree numbers (§3.3.4, L459, L473-477). Redundant decrees so ledgers re-converge (§3.3.5, L489-499).
   - Membership changed by decree with a lag, and the decree that locked Parliament out for good (§3.3.6, L505-511). Time can't naturally be part of the state (§4.1, L548-550).
   - The single-decree proofs (§2 and the Appendix) don't matter here.
7. **P07 Lamport 2001, Paxos Made Simple. High.**
   - A single acceptor that takes the first proposal is the base case (§2.2, L49). An Instant `unique()` attribute is exactly that.
   - The leader decides where each command goes (§3, L163). Gaps block execution and are filled with no-ops (L169-177).
   - The server set lives in the state and changes by ordinary commands, with a lag (L187).
   - Majority quorums and leader election are unnecessary, because Instant is our one acceptor.
8. **P08 Nakamoto 2008, Bitcoin. Low.** Proof of work, incentives, and simplified payment verification don't apply. Three framings help:
   - Either a trusted orderer (the "mint") decides what came first, or everyone must agree on one history (§2, L23). We already trust Instant.
   - Old data is discarded only once it is buried deep enough (§7, L68). That is the compaction rule.
   - Resolving forks by switching branches (§5, L54) is our refold.
9. **P09 Shapiro et al. 2011, CRDTs. High.**
   - Strong Convergence (Definition 3, L120). Rollback-based systems need every replica to settle conflicts the same way (L116).
   - Commutativity (Definition 6, L148). Operation-based types need exactly-once causal delivery (§2.4, L144).
   - Counters converge because increment and decrement commute (L53, L222).
   - The Log CRDT and Wuu-Bernstein garbage collection: an entry can be discarded only once every process has received it, which stalls while any process is down (§4.2, L230-234).
   - Ways to settle concurrent conflicting updates (§3.3, L204-210). Observed-remove ("add wins") semantics (§5.3, L297-301).
10. **P10 Ongaro, Ousterhout 2014, Raft (USENIX ATC copy). High.**
    - Replicated state machines over one log (§2, L57-63). Consistency must not depend on clocks (L69, §5.6 L335).
    - Terms act as a logical clock, and stale requests are rejected (§5.1, L206).
    - Each entry carries an index and term and never moves (§5.3, L238, L249). "Logs are not allowed to have holes" (L103). Requests are idempotent (§5.5, L331).
    - Configurations are log entries, and switching servers over directly is unsafe (§6, L351, L368).
    - **This copy omits §7** on clients and log compaction (L388-390). Raft's snapshot design is only in the extended paper, which isn't in the repo.

**Relevant prior art that is not in the repo** (from memory, not checked here):

- Hybrid logical clocks (Kulkarni et al. 2014).
- Vector clocks (Mattern 1989, which P09 cites as [11]).
- Bayou's tentative versus committed writes (P09 cites it as [20]). It is the closest historical match to the positioned design in section 5.
- Local-first software and Automerge (Kleppmann et al.).
- Calvin: sequence first, then execute deterministically.
- Event sourcing.
- CALM. In its terms, Reset is the non-monotonic operation that needs coordination.

## 2. What the runtime does today

**F1. `seq` never reaches a real transport.** So the decided order `(createdAtMs, from, seq, id)` (`QA0011:2338`) isn't what runs.

- `fillWriteTime` stamps `seq` (`start.ts:123-129`).
- `fromTransport.write` then decodes the row through `InstantLogMessageRecord` (`fromTransport.ts:114-120, 183-197`), which has no `seq` field (`snapshotLog.ts:47-53`). Effect Schema drops unknown keys by default (`SchemaAST:446-447`).
- The `message` entity has no `seq` attribute (`snapshotLog.ts:132-136`), and both writes send only `createdAtMs`, `from`, and `tag` (`core.ts:29-33`, `admin.ts:46-50`). Reads rebuild rows without `seq` (`snapshotLog.ts:285-293`).
- When the writer's own row echoes back, it overwrites the local copy that still had `seq` (`start.ts:550-554`). A missing stamp sorts before a present one (`syncEngine.ts:289-304`), so until the echo arrives, the writer and its peers can order the same rows differently.
- The tests can't catch this: the in-memory engine stores rows verbatim (`syncEngine.ts:123`). The Q108 debater already called `seq` "a local lie" (`QA0011:3356`).

**F2. The ordering timestamp is a raw wall clock**, `Date.now()` at write time (`start.ts:92, 437`).

- A Processor applies its own Message at the end of its local Model (`start.ts:612-618`) and never refolds for its own rows (`start.ts:550-554`).
- Example: Laptop writes Increment stamped 10_000_000. Phone's clock is an hour slow (it reads 6_400_000). Phone shows 1, the user taps Reset, and it is stamped 6_400_000.
- In the agreed order the Reset now sorts first, so Laptop refolds to 1 while Phone keeps showing 0.
- Q88 noted clock skew as a leftover issue (`QA0011:2485`). In fact it breaks the guarantee that Processors holding the same rows show the same Model.

**F3. Boot starts from a wall-clock cut of one writer's view, not a prefix of the log.**

- Every write stores the writer's whole Model as the snapshot with `at = now` (`start.ts:396-401, 433-439, 118-122`). It goes into one `count` row that every write overwrites (`snapshotLog.ts:121-131`, `core.ts:28`).
- The boot cutoff covers the entire millisecond (`start.ts:167-179`), and boot folds only rows after it (`start.ts:365-369, 512-526`).
- Double count: X's clock runs 60 s fast and it writes Increment at T+60000. W applies it, then writes its own Increment with snapshot {value 2, at T+1000}. A new Processor folds X's row again and shows 3.
- Loss: rows stamped before `at` that the writer hadn't seen yet (offline, in flight, concurrent) are dropped. This is P03's two-token/zero-token failure, and it is the "startup drift" bug (`QA0011:2891`).
- The in-memory engine refuses an older snapshot (`syncEngine.ts:113-126`). Instant overwrites unconditionally (`core.ts:27-34`).
- The Swift reader copies the cutoff and orders by `(createdAtMs, id)` only (Swift reader:65-99). So TypeScript and Swift order same-millisecond rows from different Processors differently.

**F4. Each Processor decides audiences from its own launch flag.**

- `appliesTo` uses `config.policy` (`start.ts:270, 279-300`), both in the fold (`start.ts:377`) and live (`start.ts:574`).
- Hosts build that policy from `?sync=`, `COUNTER_SYNC`, or argv, always at generation 0 (`startConfig.ts:66-79`, `main.tsx:16-26`, `/Users/laptop/Development/foldkit/examples/counter/tui/src/entry.ts:24`, `/Users/laptop/Development/foldkit/examples/counter/cli/src/session.ts:34`). `generation` is never compared anywhere.
- ADR 0004 decided the opposite: each accepted Message gets a fixed audience, recorded along with the policy generation (`ADR0004:52, 70-71`; also `synchronization.ts:61-64`).

**F5. The snapshot drops navigation, but Mirror shares it.**

- The snapshot discards navigation on encode and resets it to the root on decode (`wire.ts:34-55`), while Mirror shares Navigation Messages with everyone (`synchronization.ts:223`).
- So under Mirror, a Processor that boots from a snapshot shows the menu closed while its peers have it open.
- ADR 0004 anticipated this: "Full-Model checkpoints are Processor projections once navigation can differ" (`ADR0004:121-123`).

**F6. Commands run on peers depending on arrival order.**

- A remote Message that arrives in order hands the child's Commands to the receiving runtime (`sync.ts:382-394`). A refolded Message discards them (`start.ts:349-353, 380`).
- The exploration doc decided only one chosen Processor executes (`EXPL:31-34`). This is latent for the Counter, which has no Commands.

**F7. The outbox breaks per-sender ordering and lives only in memory.**

- A later write goes out directly (`start.ts:445`) while earlier failed writes wait in the outbox (`start.ts:311-312, 446-448, 467-482, 605-608`).
- In the browser this rarely matters: an offline Instant write resolves as `enqueued` (`instantProgramStore.ts:88-92`), which maps to `queued` (`fromTransport.ts:122-129`), and Instant stores and replays it in order itself (`Reactor.js:1555-1558, 1612-1613, 1635-1672`).
- Node processes using the admin transport (CLI, TUI) rely on the outbox and lose its contents when they exit.

**F8. Every subscription update delivers the whole `message` table** (`snapshotLog.ts:169-173`, `core.ts:56-89`), and boot reads all of it (`core.ts:44-55`). So today's snapshot saves CPU but no I/O. Every late row refolds from the boot snapshot (`start.ts:577-592`).

**F9. Any client can rewrite log rows.** The rules allow `message.update: 'true'` (`snapshotLog.ts:159-166`). Instant's rules can bind authorship and make rows immutable, and the instant-counter example does both (`perms:1, 9, 59-63, 70-74`).

**F10. `asOf` means two different things:** a Processor id in `start.ts:120`, and a Message id in `snapshotLog.ts:453, 483-485`.

**F11. Rows this version can't decode are handled inconsistently.** The fold skips them silently (`start.ts:376-378`). Live, they raise a decode error, but the Model stays Ready (`start.ts:559-573`, `sync.ts:66, 97`). So two Program versions on one log can fold different rows. The exploration doc requires an explicit incompatible state instead (`EXPL:331-333`).

**What already works:**

- Duplicate rows are dropped by Message id (`start.ts:328-338, 555-557`; `fromTransport.ts:153, 163-169`).
- A Processor skips its own echo using a per-run `from` (`QA0011:3084`).
- Increment and Decrement commute.

## 3. Answers to the seven questions

**Q1. Convergence.**

- **Is one deterministic order over the same rows enough?** Yes, if four conditions hold:
  1. The order is computed from row contents alone, identically everywhere (P01 L113-117).
  2. Whether a row applies depends only on the row and the rows before it, never on local configuration (P02 L344).
  3. Any snapshot you start from is a prefix of that order.
  4. Each row is applied once.

  Then the Model depends only on the set of rows (P09 Definition 3, L120; Log CRDT at L230-232). That is Lamport's state machine method: "all processes order the commands according to their timestamps" (P01 L163; also P10 L61 and P07 L157). Today conditions 1, 2, and 3 fail (F1, F3, F4, F10, F11). Condition 4 holds.

- **Rows that arrive late but sort earlier.**
  - Lamport only lets a process run command T once it has heard from every other process with a later timestamp (P01 L145, L163). That requires a known set of processes that are all up, and one failure halts everything (L165).
  - With per-run Processor ids and offline phones, you never know that set. So an optimistic runtime has to roll back and refold, and every replica must settle conflicts the same way (P09 L116). That is what `start.ts` does today.
  - The only way to never rewind is to assign numbered positions. A late item gets the next number and is never slotted in front of one already passed (P06 L377-383; P07 L163). Only your own unconfirmed rows then get re-applied on top ("rebase").
  - That is how Instant's own client works: it replays unconfirmed writes on top of each server result, using a server transaction id as the watermark (`Reactor.js:733-813, 1454-1463`).
- **Which timestamp is safe given clock skew?**
  - Wall clocks aren't safe. They violate P01 L79-81, and safe physical clocks need drift bounds and clocks that only move forward (L198-215), which phones and browsers don't give.
  - Lamport's physical-clock rule IR2' (L225) keeps millisecond units: stamp `max(now, newest known createdAtMs + 1)`. Break ties by `from`, then `seq`, then `id` (L115).
  - Vector clocks detect concurrency (P09 L220) but don't give a total order, and they grow with every per-run Processor id.
  - Only a sequence assigned by the server gives finality (P10 L238, L249; P06 §1.2).
- **What InstantDB gives, and what I looked up to find out:**
  - Atomic transactions across several entities.
  - Last-write-wins on concurrent writes, done by tailing Postgres' write-ahead log (founder stopachka, Show HN thread, news.ycombinator.com/item?id=41322281).
  - Live queries return complete result sets plus a `processed-tx-id` watermark, and the client re-applies its unconfirmed writes on top (`Reactor.js:665-693, 733-813, 1454-1463`).
  - Offline writes are stored and replayed in client order. A rejected write is dropped and rolled back (`Reactor.js:201-212, 963-985, 1555-1558, 1635-1672`).
  - `unique()` attributes are enforced by Postgres. A duplicate rejects the whole transaction with `record-not-unique` (instantdb/instant `server/src/instant/util/exception.clj`, `throw-record-not-unique!` and the `:unique-violation` mapping; the docs say "Instant will guarantee this constraint").
  - `serverCreatedAt` can order a query, but its value isn't returned to clients (docs/instaql; issue #1019, closed with no visible resolution; it appears only in `order` types in `@instantdb/core` `queryTypes.ts:144,149`).
  - Presence lasts as long as the connection and is cleaned up on leave. Topics are fire-and-forget (docs/presence-and-topics).
  - **Not given:** a log position the app can see, causal delivery across clients, or conditional writes other than uniqueness.

**Q2. Commutativity.**

- **What commutes.** Increment and Decrement commute (P09 L53, L148), so the Counter only needs exactly-once delivery, which dropping duplicates by id already gives. The canonical Counter marks all its Messages Domain (`/Users/laptop/Development/foldkit/examples/counter/core/src/program.ts:29-32`).
- **What doesn't.**
  - Reset doesn't commute with Increment: starting from 5, Increment then Reset gives 0, but Reset then Increment gives 1.
  - The action menu's Messages are Navigation (`/Users/laptop/Development/foldkit/packages/foldkit/src/actionMenu/actionMenu.ts:791-801`). They are "set the destination" facts and don't commute with each other.
  - A policy change doesn't commute with Navigation, because it changes how Navigation applies.
- **What ordering is needed.** You need a total order. Causal order alone leaves a concurrent Reset and Increment unordered, and you must pick one deterministic tie-break (P09 L204-210). The clock rule gives a total order that also respects causality (P01 L115).
- **Making Reset vs Increment races sane.** There are three semantics that all converge; pick one on purpose:
  - (a) Event time (Q88). With the clock fix, only truly concurrent pairs are decided by the clock.
  - (b) Arrival order (numbered positions). A Reset zeroes everything confirmed before it.
  - (c) Observed reset (P09 L297-301). The Reset zeroes only what its sender had seen.

  Option (c) needs a Model that tracks each Processor's contribution, which is the kind of "second update" Q86 and Q88 turned down.

**Q3. Snapshots.**

- **Are they needed?** Not for correctness: the log is the law (`QA0011:2238`, `EXPL:25-27`). They are needed for boot cost and for deleting old rows (`QA0011:3123, 3418`). So the owner's "we kind of do" is right in P06's sense: law books holding "only the current state of the law and the number of the last decree whose passage was reflected in that state", plus the last week's decrees in the back (L411-415). VR's viewstamp says the same thing (P05 L59).
- **Today's snapshot isn't a consistent cut** (P03 L131-151).
- **Q108 option E is wrong for Reset** (`QA0011:3218-3224`): it applies rows the snapshot doesn't include after the snapshot, even when they sort before rows it does include. Counterexample:
  - Rows i1 to i5 give a count of 5. A writes Reset R at t=10. B's offline Increment I, stamped t=5, arrives late.
  - A's snapshot is {value 0, included i1-i5 and R}.
  - The correct event-time fold is 5, then I gives 6, then R gives 0. Option E boots at 0 and then applies I, giving 1.
- **Late rows and checkpoints.**
  - A checkpoint at position P is only a valid starting point for rows after P. A late row that sorts before P forces a refold from an older checkpoint.
  - Deleting rows at or below P is safe only once nothing can still arrive before P. That is P09's Wuu-Bernstein rule (L234), and it stalls while any process is down. With per-run ids that means a timeout-based lateness limit; P04 L47-49 explains why a timeout is unavoidable.
  - With numbered positions, P is final, a checkpoint is one integer, and deleting below it is always safe (P06 §3.3.2; P08 L68).

**Q4. Session policy as replicated state.**

- **Put the policy in the state and change it with an ordinary Message.** P07 L187: "The current set of servers can be made part of the state and can be changed with ordinary state-machine commands." Also P06 L505-509, and P10 L368 ("a server always uses the latest configuration in its log").
- **Today's per-tab flags are Raft's unsafe direct switch** (P10 L351): Processors change at different times.
- **Which Messages a new policy governs.** Every Message after the policy row, and none before it (`ADR0004:70-71` already says older recipients never change).
- **What `generation` is.** It is an epoch like a VR view number or a Raft term (P05 L53, P10 L206), and it should be used as compare-and-set:
  - A change applies only if its `expectedGeneration` equals the generation in force at its position. So of two racing changes, the first in log order wins and the second does nothing.
  - The v3 demo already carries `expectedPolicyGeneration` (`/Users/laptop/Development/foldkit/examples/instant-counter/src/v3Demo/shared/policyRequest.test.ts:184`).
  - A sender that finds the generation has moved re-checks and undoes its optimistic Navigation, the way a VR client refreshes its view and retries (P05 L126).
- **It is not a Raft membership change.** Raft needs its two-step joint consensus because the configuration decides who forms a majority (P10 L351-353). Our policy only maps a row and its prefix to an audience, which is a pure function, so one log entry is enough.
- **Switching into Mirror or Follow must carry the navigation everyone adopts**, the way VR's `newview` record carries the state (P05 L323).
- **A policy change must always apply.** If the policy could block its own change, you get P06's drowned-sailors decree, which locked Parliament out for good (L509-511).

**Q5. Presence ("Alice follows Bob").**

- **Personal follow is ephemeral.**
  - Bob publishes his current destination in Instant presence.
  - While Alice's Model says she follows Bob, a Subscription turns his presence updates into local Navigation Messages.
  - Nothing goes into the shared log (P06 L548-550; `EXPL:120-127`).
- **Expiring a crashed peer.**
  - Presence ends when the connection leaves. Add a heartbeat timestamp for suspended phones, because detecting absence needs a timeout (P02 L361-367, P05 L247, P10 L212).
  - A crashed follower needs no cleanup: "following" lives only in its own Model. If Bob disappears, Alice's Subscription emits `StoppedFollowing({ reason: LeaderLeft })`.
- **The durable Follow mode (presenter and projector) is policy and belongs in the log.** Its expiry is a logged `DetachedFollowers` Message that any Processor proposes after the leader's lease lapses (P06 L425-435).

**Q6. Offline, partitions, duplicates.**

- **The +2 test.** It converges for the two partitioned Processors, because Increments commute. It fails in two cases (add both to the benchmark):
  - A third Processor that boots after the heal. If A's snapshot {value 1, at 1000} won the `count` row, B's Increment stamped 999 is filtered out (`start.ts:365-369`), so the third Processor shows start + 1. This is Q108's "concurrent LWW" case (`QA0011:3381-3386`).
  - A Node CLI that exits while still offline (F7).
- **Duplicates.** Dropping rows by id is the standard answer (P10 L331, P05 L113, P06 L93). Retries must reuse the exact same row, including its stamps, which `start.ts:446-448, 467-482` already does.

**Q7. Anything else in the repo that should change the design.**

- **Same inputs everywhere** (P02 L344): no local flags, no clocks, and no silently skipped rows inside the fold (F4, F11).
- **Commands run once, on the Processor that sent the Message** (F6; P05 L142).
- **Ledgers are indelible** (P06 L57): make Instant rows immutable (F9).
- **Digests let Processors detect divergence** (P06 §3.3.5).
- **Sign rows** once trusting clients isn't enough (P02 L359; the repo's `originProof` module).
- **No holes in the log** (P10 L103).
- **Irrelevant:** proof of work and incentives (P08), the 3m+1 machinery (P02 §§2-3, 5), and majority quorums, leader election, and joint consensus (P06 §2, P07 §2, P10 §5.2, §5.4, §6). We aren't replicating the database; Instant is the one acceptor.

## 4. Recommendations

1. **Stamp `createdAtMs` with a hybrid logical clock.**
   - **Papers:** P01 L79-81, L107, L213, L225; P10 L69.
   - **Change:** `rememberRow` (`start.ts:328-333`) moves `clockMs` up to each row's `createdAtMs`, but ignores rows more than about 5 minutes ahead of local time. `persist` stamps `max(Date.now(), clockMs + 1)` instead of `nowMs()` (`start.ts:437`). Apply the same rule in the Swift and Rust writers.
   - **Effect:** in F2's example, Phone stamps 10_000_001 and every Processor shows 0. A Processor's own optimistic Model now always equals the fold.
   - **Risk:** low. Still an integer in milliseconds. One broken far-future clock is capped by the 5-minute bound.
2. **Put `seq` and `generation` on the wire, and make the in-memory engine strip unknown fields like production does.**
   - **Papers:** P01 L87, L131; P10 L331.
   - **Change:** add both fields to `snapshotLog.ts:47-53, 132-136, 216-221, 285-293, 311-323`, `core.ts:29-33`, and `admin.ts:46-50`. In `syncEngine.ts:113-126`, run rows through the same Schema `fromTransport.ts` uses.
   - **Risk:** low. Swift and Rust must ignore fields they don't know.
3. **One order in every language.**
   - **Papers:** P01 L115; P02 L344.
   - **Change:** fix the Swift reader's `(createdAtMs, id)` order (Swift reader:65-99) to `(createdAtMs, from, seq, id)`, and add a shared test vector that TypeScript, Swift, and Rust all check.
   - **Risk:** low.
4. **Make the session policy logged state, and decide each row's audience from it.**
   - **Papers:** P07 L187; P06 L505-511; P10 L351, L368; P05 L53, L126, L156, L323; `ADR0004:52, 70-71`.
   - **Change:**
     - Add a runtime-level `ChangedSessionPolicy({ expectedGeneration, policy, navigation })` Message that is exempt from audiences.
     - `foldLog` (`start.ts:354-389`) carries `{ model, policy }` through the fold and replaces `config.policy` in `start.ts:270, 279-304, 574`. Stamp `generation` on each row in `fillWriteTime`.
     - `?sync=` (`startConfig.ts:66-79`) only proposes a change; it never applies one locally.
     - A session with no policy rows keeps `legacyMirrorSessionPolicy` (`synchronization.ts:248-249`).
   - **Example:** tab A launched with `?sync=shared-domain`, tab B with no flag. Today B mirrors A's menu but A doesn't mirror B's. After this change both read the same policy.
   - **Risk:** medium. Readers must accept the new tag before any writer sends it (`EXPL:335-337`). Until positions exist, make policy changes online-only: a late offline change stamped earlier could otherwise win after the fact.
5. **Replace the clock cutoff with a snapshot that can be checked.**
   - **Papers:** P03 L131-151; P06 L411-415; P05 L59; P09 L120.
   - **Change:**
     - The `count` row records `throughKey` (the order key of the newest row folded), `rowCount`, an order-independent digest of the folded row ids, the policy, and navigation under Mirror. `asOf` becomes `throughKey.id`.
     - At boot (`start.ts:497-541`), recompute the count and digest over rows at or below `throughKey`. If they match, start from the snapshot. If not, fold from the beginning and write a fresh snapshot.
     - Delete the millisecond-wide cutoff (`start.ts:167-179`). This depends on recommendation 1.
   - **Example** (`QA0011:3381-3386`): two rows at or below (1000, A) against a recorded count of 1 is a mismatch, so boot folds from the start and shows 2. Today it shows 1.
   - **Risk:** low to medium. Readers that ignore the snapshot still fold correctly.
6. **The snapshot follows the policy.**
   - **Papers:** `ADR0004:121-123`; P02 L344.
   - **Change:** `wire.ts:34-55` keeps navigation when the policy is Mirror or Follow, and only the domain projection under SharedDomain.
   - **Risk:** low.
7. **Refold from the nearest local checkpoint, not from boot.**
   - **Papers:** P03 L208-243; P06 L415.
   - **Change:** keep a small ring of (key, Model, policy) checkpoints. `start.ts:577-592` refolds from the newest one at or before the late row.
   - **Risk:** low (performance only).
8. **Run Commands only on the Processor that sent the Message.**
   - **Papers:** `EXPL:31-34`; P05 L142.
   - **Change:** `sync.ts:382-394` returns no Commands for `RemoteMessageReceived`.
   - **Risk:** low.
9. **Keep each sender's writes in order, and make the outbox survive restarts.**
   - **Papers:** P01 L131; P03 L63; P05 L55.
   - **Change:** when the outbox isn't empty, queue new writes behind it instead of writing directly (`start.ts:445`). Persist the outbox for Node hosts.
   - **Risk:** low.
10. **Stop at a row you can't decode instead of skipping it.**
    - **Papers:** P02 L344; `EXPL:331-333`.
    - **Change:** in `start.ts:376-378, 559-573`, enter an explicit Incompatible state.
    - **Risk:** low.
11. **Make log rows immutable and tied to their author.**
    - **Papers:** P06 L57; P02 L192, L359.
    - **Change:** in `snapshotLog.ts:150-167`, set `message.update` to `'false'`. Write with `create`, and treat `record-not-unique` on the id as already delivered. Bind the author field to `auth.id`, as `perms:9` does.
    - **Risk:** medium. Every client needs guest auth, and the Node admin token bypasses rules.
12. **Presence for personal follow; a logged detach for durable Follow.**
    - **Papers:** P06 L425-435, L548-550; P02 L361-367; P10 L212.
    - **Change:** as in Q5.
    - **Risk:** low.
13. **New test-harness cases** (extending Q103 and Q105). No risk.
    - A third Processor that boots after each heal.
    - A Processor whose clock is an hour slow.
    - Same-millisecond rows from two Processors.
    - An in-memory engine that strips fields like Instant.
    - Two Program versions on one log.
    - A CLI that exits while offline.
14. **Later stage: dense positions through an Instant unique attribute** (section 5).
    - **Papers:** P06 L368, L377-383, L393, L411-415; P07 L49, L163, L169-177; P10 L69, L103, L249.
    - **Risk:** high. It changes Q88's answer for concurrent offline Resets.

## 5. Recommended minimal design

### Stage 1: correct under today's decisions (Q86, Q88, Q107)

```text
message row  { id, from: "<host>-<instance>", seq, createdAtMs (hybrid clock), tag: "Tag" | "Tag:{json}", generation }
order key    (createdAtMs, from, seq, id), compared the same way in TS, Swift, Rust

learn(row)   if row.createdAtMs <= now() + 5 min: clockMs = max(clockMs, row.createdAtMs)
stamp()      createdAtMs = max(now(), clockMs + 1); clockMs = createdAtMs   (once; retries reuse it)

fold         state = verified snapshot, else { model: init, policy: legacy Mirror }
             for each row after state.throughKey, in key order:
               undecodable            -> stop: Incompatible
               ChangedSessionPolicy c -> if c.expectedGeneration == state.policy.generation:
                                           state.policy = c.policy
                                           under Mirror/Follow: state.model.navigation = c.navigation
               child Message m        -> if audience(state.policy, category(m), row.from) includes me:
                                           state.model = update(state.model, m).model   (Commands dropped)

live         own Message: apply at the end (valid because of the clock rule), then persist
             remote row after lastApplied: apply; otherwise refold from the nearest checkpoint; known id: skip
snapshot     any writer: { value, policy, navigation?, throughKey, rowCount, idsDigest, asOf: throughKey.id }
             it either checks out at boot or is ignored, so last-writer-wins on the row is harmless
presence     personal follow via presence + Subscription; durable Follow via policy rows + a logged detach
compaction   none; rows may still arrive late, and about 2k rows (QA0011:1348) is fine to read in full
```

### Stage 2: numbered positions, finality, deleting old rows

```text
placement    { position: Int unique indexed, messageId: String unique indexed, placedBy }
online send  transact([message.create(row), placement.create({ position: maxConfirmed + 1, messageId })])
             record-not-unique -> wait for the next update, rebase, retry at the new maximum
offline send message.create(row) only (Instant queues it durably); place on reconnect, in seq order, one batch per transaction
stranded     a row unplaced for T seconds may be placed by any Processor, never ahead of that author's lower seq
gap          if position n is empty while n + 1 exists for T seconds, any Processor places a NoOp at n
view         confirmed = snapshot.value + positions (snapshot.position, k], contiguous only
             visible   = confirmed + own unconfirmed rows in seq order (rebase; confirmed rows never move)
snapshot     { position, value, policy, navigation? }; boot queries placement where position > snapshot.position
compaction   archive, then delete rows at or below snapshot.position minus a retention tail
policy       an ordinary placed row with compare-and-set; it governs positions after it
```

**Why this is sound:**

- A unique `position` makes Instant the single acceptor for each slot (P07 L49). A unique `messageId` prevents placing a row twice.
- Positions never change (P10 L249). Gaps block and are filled with no-ops (P07 L169-177, P06 L381-383).
- The snapshot is P06's law book with its decree number.
- Clocks stop affecting correctness (P10 L69). It also matches Instant's own client model (`Reactor.js:1454-1463`) and `ADR0004:10-11, 60-62`.

**What it changes:** Q88's first worked example (`QA0011:2411-2437`) settles at 2 instead of 3, because Phone's offline Reset is placed after Laptop's later tap. The second example (`QA0011:2453-2470`) still settles at 2.

## 6. Open questions for the owner, with my recommendation

1. **Event time (Q88) or position order for non-commuting Messages across a partition?**
   - **My recommendation:** event time with the hybrid clock now, and positions (Stage 2) once deleting old rows matters. Positions are the only way to get the compaction asked for in Q108 and Q109 without a lateness limit.
   - **If event time stays permanently:** pick a lateness limit H. Rows older than H must be re-stamped before upload, which means Foldkit has to hold offline rows itself rather than handing them to Instant's queue. Delete only below every Processor's acknowledged watermark minus H (P09 L234).
2. **Q108 watermark?** A checkable snapshot now (recommendation 5), and one integer later. Don't adopt option E as written; it fails the Reset counterexample in Q3.
3. **With positions, may a Reset erase an offline tap it never saw?** Accept it for now. Observed reset (P09 §5.3) needs a per-Processor Model, which Q86 and Q88 rejected.
4. **When switching into Mirror, whose navigation wins?** The requester's, carried in the policy row (P05 L323). The alternative is resetting everyone to the root.
5. **Keep logging Navigation under SharedDomain?** Yes, to keep one global sequence (`ADR0004:60-62`), but debounce `ChangedActionMenuQuery`, which writes one row per keystroke (`/Users/laptop/Development/foldkit/packages/instant/src/snapshotLog/messageWire.ts:25-26`).
6. **Personal follow or the durable Follow mode first?** Personal follow, built on presence. Durable Follow can come later, with a logged detach.
7. **Program version mismatch?** Enter an Incompatible state and never skip rows (recommendation 10).
8. **Tighten Instant permissions now?** Yes for immutable rows. Bind authors once every client has guest auth.
9. **How far ahead may another clock be before it stops advancing ours?** 5 minutes, with a visible diagnostic when a row exceeds it.
10. **Rollout order for wire changes?** Readers first in TypeScript, Swift, and Rust (accept `seq`, `generation`, the new tag, and the new count fields), then writers (`EXPL:335-337`). Ship the shared ordering test vector with them.
11. **Stage 2 schema?** A slim `placement` entity in the snapshot-log app, which keeps Q41's direction (`QA0011:1214-1243`). Borrow the v3 unique position-key pattern (`/Users/laptop/Development/foldkit/packages/instant/src/v3Schema/entities.ts:17, 27, 32`), with no designated sequencer, since choosing one is still open (`EXPL:12-15`).

**Limits:**

- I ran no tests.
- I couldn't find the Rust reader. Its behavior is only as reported in Q108 (`QA0011:3364`).
- The out-of-repo prior art listed above is from memory.
- Under the wiki rules this analysis would belong in `wiki/analyses/`, but I left the wiki untouched as instructed.
