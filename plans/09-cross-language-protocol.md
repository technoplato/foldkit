# Plan 09 | One protocol for Messages and Models across languages

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-01, R2-05, R2-09, R2-23, R2-33, R3-02, R3-08, R3-18, R3-21, R4-11,
R4-13, R4-16). Closes audit item 10 and audits the
Swift and Rust readers the owner says did not work.

## Why the readers did not work

Audited by reading `technoplato/counter-swift` at `f5cb1a6` (a clone in the
session's scratchpad) and `tca-rust-port` at `main@1fd1bb3`
(`/Users/laptop/Sync/tca/ports/rust/tca-rust-port`; the GitHub clone aborted
with a partial pack). Neither was built or run; the Swift package needs a
local TCA26 checkout and the Rust crate needs an admin token. The findings
are what the source says, and the migration below starts by running both
against the vectors so the list becomes what actually fails.

Neither reader fails at I/O. Swift's own log shows it reading 2,160 to 2,519
rows from app `5417c2e3…` and writing pairs. Both fail on meaning:

1. **They boot from the `count` row**, cut by `at` in whole milliseconds.
   TypeScript stopped reading that row on 2026-10-02 (ADR 0013) because a
   last-writer integer cannot say which Messages it includes. Both readers'
   tests encode the bug ADR 0011 Q108 names (`snapshotBoundaryCoversSameMillisecond`
   in Swift, `fold_after` in Rust).
2. **They froze on 2026-08-25 while the wire moved.** TypeScript added owned
   rooms (`-mine-`, `-share-` in `from`, 2026-09-11), the `Tag:{json}` payload
   grammar (2026-09-23), local snapshots and `programVersion` (2026-10-02), and
   the `programMessage` table (2026-10-03). Neither reader parses `Tag:{json}`
   or reads `programMessage`.
3. **Swift uses one `from` per platform** (`counter-swift-ios`), so an iPhone
   and an iPad drop each other's live rows as echoes (ADR 0011 Q43, Q107).
   `CounterRootView.swift` builds `CounterFeature.State()` without a Processor
   id. Rust uses `rust-<kind>-<pid>`, which is right.
4. **Order and clock differ.** The readers order by `(createdAtMs, id)` and
   stamp the raw wall clock; TypeScript orders by `(createdAtMs, from, seq, id)` and stamps `max(now, lastSeen + 1)`.
5. **Late rows are lost.** Swift rebuilds from its own last write, so a peer's
   row that lands late and sorts earlier is never counted; Rust's
   `take_remotes` marks such rows seen and drops them.
6. **Silent failures.** Swift's `LiveSnapshotLogStore.swift` wraps an
   all-or-nothing decode in `try? … ?? []`, so one malformed row empties the
   whole log without an error. Swift's log shows a failed write from an
   ordered-outbox lane conflict and earlier writes to the wrong app id.
7. **Rust is incomplete.** `sync_log.rs` is not compiled into the binary;
   three live tests are `#[ignore]`; `counters-nav/src/sync.rs` writes
   `counter_rows` into the shared app by default; it needs the admin token.
8. **TypeScript disagrees with itself** on `asOf`: `runtime/start.ts` writes
   the Processor id, `snapshotLog.ts` writes the Message id.

The lesson is not that Swift and Rust are hard. It is that the protocol lived
in TypeScript source, so every TypeScript change was a silent protocol change.

## The protocol, pinned

`docs/protocol/foldkit-log-v1.md` becomes the one normative document; the
TypeScript, Swift, and Rust implementations are conformant or they are wrong.
Its contents:

### 1. The envelope

```json
{
  "id": "0192c6c8-5e3e-7a4b-9f1e-3d2c1b0a9f8e",
  "app": "multiple-counters",
  "programVersion": 2,
  "tag": "Decrement",
  "payload": { "counterId": "0192c6c7-1a2b-7c3d-8e4f-5a6b7c8d9e0f" },
  "owner": { "_tag": "Person", "id": "8d3c…" },
  "actor": { "_tag": "Authenticated", "id": "8d3c…" },
  "host": "react",
  "instance": "4f2a9c1e7b3d5e6f8a9b0c1d2e3f4a5b",
  "seq": 41,
  "createdAtMs": 1760036531123
}
```

- `id`: a UUIDv7 in its canonical 36-character lowercase form
  (`8-4-4-4-12`), minted by the sender; a retry reuses it; readers
  deduplicate by it. Swift's `UUID(uuidString:)` and Rust's
  `Uuid::parse_str` read it as is. The 26-character base-32 form is a URI
  Segment (plan 02) and never appears on the wire (R3-18).
- `app`: the App id; a reader filters by it and ignores every other app's rows.
- `programVersion`: integer, required on write; a reader applies the App's
  migrations from that version (ADR 0013 point 7).
- `tag`: the Message's `_tag`, exactly.
- `payload`: a JSON object, `{}` when the Message has no fields. Field encoding
  is the Program's Message Schema JSON codec; the vectors pin the shapes that
  are not obvious (Option, Date, branded ids, nested tagged unions, minted
  ids). A minted id in the payload is the same canonical form, minted by the
  sender's send path (plan 02): by the row that carries it when the Action
  mints it (`Add`), or by an earlier row when the Action names an existing
  row (`Decrement` above).
- `owner`: `Person { id } | Public | Room { name }`, whose log the row is in;
  policies and erasure go by it.
- `actor`: `Authenticated { id } | Guest { id } | System { name }`, who wrote
  it. A System actor (a worker) writes into a person's log.
- `host`: grammar `[a-z][a-z0-9]*(-[a-z0-9]+)*`; today's values are `cli`,
  `tui`, `opentui`, `headless`, `foldkit`, `react`, `svelte`, `expo-ios`,
  `expo-android`; Swift and Rust add `swift-ios`, `swift-macos`,
  `swift-watchos`, `rust-cli`, `rust-tui`. A host is a value an adapter
  exports; there is no registry to join, and a reader never parses a host
  out of a longer string.
- `instance`: 32 lowercase hex characters (128 bits) minted per run.
- `seq`: per `(owner, host, instance)` write counter starting at 1, so two
  rows one Processor wrote in one millisecond keep their order.
- `createdAtMs`: integer milliseconds, stamped `max(now, maxSeen + 1)`,
  ignoring a seen value more than 24 hours ahead. One declared exception
  (R3-08): a System writer may stamp a fact declared
  `stampedAt: Carried({ field })` (plan 02) with the time that field carries
  (`ClosedDay.closesAtMs`, plan 08), so a backfilled day folds at the day's
  close; every reader treats such a row as a late row and refolds, as the
  next rule says, and accepts it only from a System actor, skipping and
  reporting it from anyone else as it would a row that fails to decode
  (R4-13).
- `from`, where a layout keeps it, is the display string `<host>-<instance>`;
  it is printed from the fields above and never parsed.

### 2. Order and fold

Total order: `createdAtMs`, then `host` (byte order), then `instance`, then
`seq`, then `id`. The fold is `init`, then `update` over every row in that
order. One rule for decode failures: a row whose `tag` is unknown or whose
`payload` fails the Message Schema is skipped by the fold and reported on the
live feed and in telemetry; it is never applied as a guess and never empties
the log. A row that arrives after a later-ordered row was applied triggers a
refold from the nearest in-memory checkpoint before it (plan 06); an offer is
never a base to refold from, under either option the owner may pick (R4-16).

### 3. Echo and duplicates

On the live feed, skip rows whose `(host, instance)` is this Processor's.
Everywhere, drop a row whose `id` was already applied. Never skip by sender
when reading history.

### 4. Startup

Fold from the start, or from a peer offer verified as plan 06 says (row set
checked in fold order by count and fingerprint, the offered Model painted
read-only and then replaced by the reader's own fold). Never from a
last-writer `count` row. The read position is engine-specific: a
commit-ordered position on Supabase, Kafka, and the Local log; a receipt
count with an overlap re-read on Instant (plan 06).

### 5. Versions and the handshake

Every client-to-daemon or client-to-gateway session opens with `Hello { protocol, appId, programVersion, schemaHash, buildId }`. A protocol or schema
mismatch answers `Refusing` naming both sides; a build mismatch answers
`Refusing` with the restart fix. A Processor keeps folding and writing while
newer rows decode; it becomes read-only only when a newer row fails to
decode or a `RetiredVersion({ below })` fact says so (R2-23).

### 6. Storage layouts

| Engine   | Layout                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instant  | table `programMessage`, one column per envelope field (`ownerKind`, `ownerId`, `actorKind`, `actorId`, `host`, `instance`, `seq` added through the shared schema). Legacy Counter layout: table `message` with `tag` packed as `Tag` or `Tag:{json}`, no `seq`, no actor, no owner; readers upcast it |
| Supabase | table `program_message`, snake_case columns, `owner_kind`, `owner_id`, `actor_kind`, `actor_id`, `position` (plan 06)                                                                                                                                                                                 |
| Kafka    | topic per App; the envelope as the record value; `instance` as key; `actor` verified by the gateway                                                                                                                                                                                                   |
| Local    | NDJSON, one envelope per line                                                                                                                                                                                                                                                                         |

### 7. Message meaning

Per App, generated from the Catalog by plan 08 (the skill's Actions table is
normative prose) and pinned by vectors: for the Counter, `Increment` adds one,
`Decrement` subtracts one, `Reset` sets 0 and changes nothing at 0.

### 8. Sessions

Counter Messages apply on every Processor under every session policy; Session
and ActionMenu Messages follow the category derived from ownership and the
session rule, which the vectors pin for `Mirror` and `SharedDomain`.

### 9. Control plane

Snapshot requests and offers (plan 06) travel on presence, never on the log,
as frames with the same field rules and an attested actor. The terminal
protocol v2 (plan 01) is a separate frame set (`Hello`, `Do`, `Open`, `Back`,
`Attach`, …) whose Messages are encoded with this envelope's payload rules;
Scribe's remote control (`agent.hello`, `agent.command`, `agent.result`,
`agent.transition`) maps onto `Hello`, `Do`, `Applied`, `Event` one to one,
so one client library drives both.

## Conformance vectors

`packages/foldkit/test/protocol/vectors/*.json`, generated by TypeScript and
committed, each a triple of input rows, expected fold, and expected
diagnostics:

- the Q108 cases: concurrent writes in one millisecond; a late row sorting
  earlier; a same-sender pair with `seq` reversed by `id`;
- tag parses: `Increment` → `{}`; `ChangedActionMenuQuery:{"query":"re"}`
  → `{ query: 're' }`; `ActionMenuQueryChanged:res` → skipped and reported;
  `SharedNamedCounter` → skipped and reported;
- payload encodings: `Option` as `{ "_tag": "None" }` and `{ "_tag": "Some", "value": … }` (the Effect JSON codec's form, pinned by vector), a branded
  id as its encoded string, a minted id, a nested tagged union;
- echo and duplicate handling; `Room` owners excluded from a public read;
- the runtime's own Navigation facts, `Followed({ move })` with a Destination
  that has fields and `LeftProgram` (plan 02, R4-11); `CoveredByHost` is Local
  and never on the wire;
- startup from a verified offer versus a wrong one;
- the handshake refusals, and the read-only rule on an undecodable newer row.

Each reader runs the vectors in its own test suite. A reader that passes them
is conformant; a TypeScript change that alters a vector is a protocol change
and must bump `foldkit-log-v1` to `v2` with an upcast.

## JSON Schema for codegen

`pnpm foldkit schema <app>` writes JSON Schema 2020-12 for the App's Message
union and Model with `Schema.toJsonSchemaDocument(Schema.toCodecJson(App.Message))`
(the codec first, because the document describes the encoded side), so Swift
(`Codable` through a generator) and Rust (`serde` through `typify`) derive
their types instead of hand-writing them. A vector round-trips the generated
Schema through both generators. The `schemaHash` in `Hello` is a hash of
Effect's `SchemaRepresentation` of the Message Schema, which describes the
encoded side, the wire, with its checks and annotations, so two Programs
whose rows mean the same thing share a hash; a change on the decoded side
that encodes the same (a `S.String` field becoming `S.NumberFromString`) is
caught by `buildId`, not by the hash (R3-18, R4-16). The JSON Schema document
is not hashed, because Effect documents it as best-effort.

## What each reader needs

| Reader        | Change                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| counter-swift | mint a 128-bit `instance` per run and pass it into `State`; read `programMessage` or upcast `Tag:{json}`; order by `(createdAtMs, host, instance, seq, id)`; stamp `max(now, maxSeen + 1)`; skip and report on decode failure instead of emptying the log; boot from the start or a verified offer; drop `count` reads; run the vectors; export `swift-*` hosts |
| tca-rust-port | finish the clone and compile `sync_log.rs`; a non-admin client transport; stop writing `counter_rows`; the same wire changes as Swift; un-ignore the live tests against the vectors                                                                                                                                                                             |
| TypeScript    | agree with itself on `asOf` (or stop writing `count`); emit the vectors; the Instant engine upcasts legacy rows and re-reads its overlap; the handshake                                                                                                                                                                                                         |

## Migration

1. Write `docs/protocol/foldkit-log-v1.md` from this plan and the TypeScript
   behavior; emit the vectors; TypeScript passes them.
2. Build and run both readers against the vectors; replace the reading-based
   list above with what fails.
3. Fix the TypeScript `asOf` disagreement; stop writing `count` once both
   readers read the log.
4. Swift and Rust against the vectors; both repos pin the protocol version in
   their README.
5. JSON Schema export and the schema hash in `Hello`.
