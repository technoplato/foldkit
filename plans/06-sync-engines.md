# Plan 06 | Sync without a favorite engine, and snapshots nobody saves

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-05 to R2-09, R2-22, R2-25, R2-27, R1-48, R3-02, R3-03, R3-05, R3-06,
R3-17, R3-18, R3-20, R3-21, R4-03 to R4-07, R4-16, R4-18). The Supabase adapter is
designed here and not built, per the owner's "don't integrate anything yet",
with a date on that choice: Instant Cloud shuts down on 2027-08-31. Closes
audit items 2 (engine choice in core), 10 (one wire), and 11 (snapshot and
engine models).

## What is wrong today

- `Runtime.SyncEngine` (`packages/foldkit/src/runtime/syncEngine.ts`) is
  Instant in disguise: its doc says "Instant I/O surface", `Memory` is "a fake
  Instant", `read()` returns `{ snapshot: unknown | undefined, messages }`,
  `write()` takes `{ snapshot, message }` so every write also stores a
  snapshot row, `readSince?` is optional, `SyncEvent` is `Snapshot | Message`.
- Two Instant layouts coexist: the Counter's `count` and `message` tables with
  the payload packed into `tag` as `Tag:{json}`, and `programMessage` with a
  `payload` column for every other app. Neither has a `seq` column.
- Three Instant targets are named in code and notes (`5417c2e3`, `e7c49961`,
  `bd40c50a`), all Instant Cloud apps, and Instant Cloud closes on
  2027-08-31 (its announcement; the owner's self-hosting report of
  2026-10-04 plans a move by Q1 2027).
- The engine is chosen in core (`startCounter` reads `COUNTER_TAPE`).
- `from` packs host, instance, and room into one string that `includes('-mine-')`
  parses, and `keepsOwnNavigation` parses the host out of it through a closed
  list.
- Instant's read cursor counts rows in `serverCreatedAt` order, and Instant's
  server stamps that column with the transaction's start time, so a row that
  starts first and commits last lands behind a cursor already read (the same
  race as a Postgres `now()` keyset).

## North Star

Core declares what travels. Hosts choose where.

```ts
// core: examples/dictate/core/src/app.ts, engine-free
export const DictateApp = App.define({
  program: Dictate,
  log: Log.declare({ app: 'dictate', version: 1, Message: Dictate.Message }),
  server: Server.needed, // the Scribe Projection and the reverse feed are serverOnly work (plan 01a, R4-18)
  services: [Microphone, Recognizer], // service tags; Layers come from hosts
  identity: Identity.interactive(deviceCodeFlow), // transcripts are a person's rows on a shared engine (R4-04)
})

// the example's one engine descriptor: examples/dictate/core/src/engine.ts, exported as `dictate-core-example/engine`.
// Every host imports it; the Program's own modules never do (a lint rule), so core stays engine-free (R4-03).
export const engine = Engine.instant({ app: InstantApps.dev })

// a browser host
startApp(DictateApp, {
  host: Host.react,
  engine: Engine.browser(engine),
  layers: browserLayers,
})

// a terminal host: the descriptor unless FOLDKIT_ENGINE overrides it; `local` only for an example that names none
await terminal({
  name: 'dictate',
  app: () => import('dictate-core-example').then(core => core.DictateApp),
  engine: () =>
    import('dictate-core-example/engine').then(module => module.engine), // the example's one engine descriptor
  layers: () => import('./layers.js').then(module => module.terminalLayers),
})

// a server worker on Kafka
startApp(DictateApp, {
  host: Host.server, // kind Server: the one host kind that starts serverOnly work
  engine: Engine.kafka({ brokers, topic: 'foldkit.dictate' }),
  layers: workerLayers,
})

// tests
startApp(DictateApp, {
  host: Host.headless, // kind Headless: folds everything, starts no serverOnly work
  engine: Engine.memory(),
  layers: testLayers,
})
```

## The envelope

One row shape for every engine, every language (plan 09 is normative):

```ts
export const Actor = S.Union([
  Authenticated({ id: ActorId }),
  Guest({ id: ActorId }),
  System({ name: S.String }),
])
export const Owner = S.Union([
  Person({ id: ActorId }),
  Public(),
  Room({ name: S.String }),
]) // whose log a row is in

export const EncodedRow = S.Struct({
  id: MessageId, // UUIDv7 in its canonical 36-character lowercase form, minted by the sender (plan 09)
  app: AppId,
  programVersion: S.Int,
  tag: S.String,
  payload: JsonObject, // {} for a payload-free Message
  owner: Owner, // whose log; policies and erasure go by it
  actor: Actor, // who wrote it
  host: HostName, // 'react', 'cli', 'swift-ios'; grammar in plan 09
  instance: Instance, // 32 lowercase hex characters minted per run
  seq: S.Int, // per (owner, host, instance) write counter from 1
  createdAtMs: S.Int,
})
```

`from` is a display string printed from `host` and `instance`, never parsed.
Every field is required; a legacy Counter row (`Tag:{json}` in the tag
column, no `programVersion`, no `seq`, no actor, no owner) is upcast by the
Instant engine at its boundary with `actor: Guest`, `owner: Public`, and `seq`
from the row's receipt order. Owned and shared rooms are `Owner.Room`, not a
suffix on `from`.

## The log, as an interface

```ts
export type LogEngine = Readonly<{
  key: EngineKey                                          // 'instant-bd40c50a-dictate', 'supabase-<ref>-dictate', 'kafka-<cluster>-dictate', 'local', 'memory-<n>'
  paging: Paging                                           // CommitOrdered() | ReceiptOrdered({ overlap: Duration })
  presence: Presence                                       // None() | Channel({ attested: Attestation })
  lease: LeaseSupport                                      // None() | Rows({ clock: EngineClock })  (R2-25: single writers)
  append: (row: EncodedRow) => Effect.Effect<Link, EngineError>
  readSince: (maybeCursor: Option.Option<Cursor>) => Effect.Effect<Page, EngineError>
  live: Stream.Stream<Received, EngineError>              // rows as the engine receives them
}>

export type Link = Delivered() | Queued({ because: QueueReason }) // outline notation, as in plan 02
export type Page = More({ rows, cursor }) | Last({ rows, cursor }) // outline notation
export type Received = Readonly<{ row: EncodedRow }>                   // cursors come from readSince, never per live row
```

- No snapshot in `append`. The log is the law; nothing else is written per
  Message.
- Capabilities are sums on the engine, not optional methods and not
  booleans: `paging` says whether a cursor is commit-ordered (Supabase, with
  its trigger) or receipt-ordered with an overlap the runtime must re-read
  (Instant), `presence` says whether offers can be attested, `lease` says
  whether single-writer leases exist.
- `live` can miss rows on every transport; the runtime re-reads from the
  cursor on reconnect and on a timer, re-reads the `overlap` time window
  behind the cursor on receipt-ordered engines and deduplicates by id, and
  detects a gap per `(owner, host, instance)` from `seq` among the rows it
  can see.
- The fold is deterministic from the envelope's order
  (`createdAtMs, host, instance, seq, id`, plan 09), so delivery order and
  partitioning do not matter. A late row is a refold from the nearest
  in-memory checkpoint before it: the runtime keeps a Model every few
  thousand rows during a fold, in the process only, never saved, so a late
  row costs the tail of the log and not the whole of it (R3-02).

## Engines

| Engine   | Rows                                                                  | `paging`                        | `live`                                                                   | `presence`                                | `lease`  | Identity                                       |
| -------- | --------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | -------- | ---------------------------------------------- |
| Instant  | `programMessage` filtered by `app` and `owner` (legacy tables upcast) | `ReceiptOrdered({ overlap })`   | query subscription on the newest window (exists), plus timed `readSince` | `Channel({ attested: SealedByActorKey })` | `Rows()` | guest, or an Access-minted token (exists)      |
| Supabase | table `program_message` (below)                                       | `CommitOrdered()`               | `postgres_changes` on insert, filtered by `app`, plus timed `readSince`  | `Channel({ attested: PrivateChannel })`   | `Rows()` | Supabase Auth; the Access bridge needs a spike |
| Kafka    | topic per App, `cleanup.policy=delete`, `retention.ms=-1`             | `CommitOrdered()` (offsets)     | consumer group                                                           | `None()`                                  | `None()` | SASL; `actor` verified by the gateway          |
| Local    | an NDJSON file in the state directory (terminal hosts only)           | `CommitOrdered()` (file offset) | the daemon's own appends                                                 | `None()`                                  | `None()` | the OS user                                    |
| Memory   | an array                                                              | `CommitOrdered()`               | listeners                                                                | `Channel({ attested: Trusted })` (tests)  | `Rows()` | none; tests only                               |

### Instant, Cloud and self-hosted

Instant Cloud closes on 2027-08-31. `InstantApps` is one table in
`@foldkit/instant` with `dev`, `production`, `counterV01`, and `selfHosted({ baseUrl })`; examples name `dev` until the owner's decision below. The same
server source runs self-hosted, so the receipt-ordered cursor and the room
behavior are the same there.

- `paging: ReceiptOrdered({ overlap })`: Instant stamps `serverCreatedAt`
  with the transaction's start time, so the runtime re-reads every row whose
  `serverCreatedAt` falls within `overlap` of the newest row it has seen (a
  duration, default 30 seconds, set from the longest commit delay observed)
  and deduplicates by id. A row count would miss rows in a burst such as the
  worker's price batch (R3-20). The strict commit-order conformance case is
  expected to fail on Instant as specified; the overlap case must pass.
- `presence: Channel({ attested: SealedByActorKey })`: Instant permissions
  apply to namespaces, not rooms, and everyone in a room receives every
  topic, so an offer is sealed, not only signed (R4-07): the request is
  signed with a key kept in a `foldkitDeviceKeys` namespace whose permissions
  allow only `auth.id`'s own rows, a peer answers only a request that
  verifies, and the offer is encrypted with a key derived from the same
  secret, so a device of another actor in the room sees a request it cannot
  answer and an offer it cannot read. A `Guest` actor has no key and
  cold-folds; the owner may instead turn offers off on Instant (decision 1). `foldkitDeviceKeys` and
  `foldkitLeases` are new namespaces, so they enter Scribe's shared schema
  with the `foldkit` prefix `AGENTS.md` requires (R3-20).
- `programMessage` gains `seq`, `ownerKind`, `ownerId`, `actorKind`,
  `actorId`, `host`, and `instance` through the shared-schema process in
  `AGENTS.md`; Scribe's `ownerUserID` maps to `owner`, not to `actor`.
- Instant's rules for `programMessage`, written beside the Supabase SQL and
  entering Scribe's `instant.perms.ts` through the same process (R4-04):
  `view` and `create` when `ownerKind == 'person'` and `ownerId == auth.id`;
  when `ownerKind == 'public'` and the app is listed in `foldkitPublicApps`
  (`create` only where it is `writable`); when `ownerKind == 'room'` and a
  `foldkitRoomMembers` row joins `auth.id` to the room; and
  `actorKind == 'system'` only for the worker's own identity. A `Guest` has
  no `auth.id` and may write only to a writable public app as
  `actorKind == 'guest'`; every other owner needs a signed-in person, which
  is why `DictateApp` declares an interactive identity. The worker signs in
  as a dedicated identity through `db.asUser` for every data and lease write,
  so the rules run; the admin token is for schema and migration only (R4-06).
  Scribe's existing rule (`ownerUserID == auth.id`) is one arm of this set,
  not a replacement for it.
- `lease: Rows({ clock: ServerTime })`: a `foldkitLeases` namespace whose
  rule lets only the worker identity write, and only when the stored `until`
  is before the server's `request.time` or the holder is itself. The worker
  acquires as that identity through `db.asUser`, never with the admin token,
  confirms by reading the row back, and carries the row's `epoch` into every
  effect it issues (single writers, below; R4-06).

### Supabase, designed

```sql
create sequence program_message_position;
create table program_message (
  id uuid primary key,
  app text not null,
  program_version int not null,
  tag text not null,
  payload jsonb not null default '{}'::jsonb,
  owner_kind text not null check (owner_kind in ('person', 'public', 'room')),
  owner_id text not null,
  actor_kind text not null check (actor_kind in ('authenticated', 'guest', 'system')),
  actor_id text not null,
  host text not null,
  instance text not null,
  seq int not null,
  created_at_ms bigint not null,
  position bigint not null,
  constraint program_message_writer_seq unique (app, owner_kind, owner_id, host, instance, seq)
);
create index program_message_owner_position on program_message (app, owner_kind, owner_id, position);

-- commit-ordered position: the trigger holds a transaction-level advisory lock per app, so two
-- inserts for one app cannot commit out of position order; inserts are single statements
create function program_message_assign_position() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('program_message'), hashtext(new.app));
  new.position := nextval('program_message_position');
  return new;
end $$;
create trigger program_message_position before insert on program_message
  for each row execute function program_message_assign_position();

create table public_apps (app text primary key, writable boolean not null);
create table program_room (app text not null, room text not null, owner_id text not null, primary key (app, room));
create table program_room_member (app text not null, room text not null, actor_id text not null, primary key (app, room, actor_id));
create table program_room_invite (app text not null, room text not null, token_hash text not null, expires_at timestamptz not null, primary key (app, room, token_hash));

alter table program_message enable row level security;
alter table public_apps enable row level security;
alter table program_room enable row level security;
alter table program_room_member enable row level security;
alter table program_room_invite enable row level security;
alter table program_lease enable row level security;
-- program_lease and program_room_invite have no client policy: the worker's service role and the invite function alone reach them (R4-05, R4-06)
create policy read_public_apps on public_apps for select using (true);
create policy read_own_rooms on program_room for select using (owner_id = auth.uid()::text
  or exists (select 1 from program_room_member m where m.app = program_room.app and m.room = program_room.room and m.actor_id = auth.uid()::text));
create policy read_own_log on program_message for select
  using (owner_kind = 'person' and owner_id = auth.uid()::text);
create policy read_public on program_message for select
  using (owner_kind = 'public' and app in (select app from public_apps));
create policy read_room on program_message for select
  using (owner_kind = 'room' and exists (select 1 from program_room_member m
    where m.app = program_message.app and m.room = program_message.owner_id and m.actor_id = auth.uid()::text));
create policy append_to_own_log on program_message for insert
  with check (owner_kind = 'person' and owner_id = auth.uid()::text and actor_kind = 'authenticated' and actor_id = auth.uid()::text);
create policy append_to_public on program_message for insert
  with check (owner_kind = 'public' and app in (select app from public_apps where writable)
    and ((auth.uid() is null and actor_kind = 'guest') or (actor_kind = 'authenticated' and actor_id = auth.uid()::text)));
create policy append_to_room on program_message for insert
  with check (owner_kind = 'room' and actor_kind = 'authenticated' and actor_id = auth.uid()::text and exists (select 1 from program_room_member m
    where m.app = program_message.app and m.room = program_message.owner_id and m.actor_id = auth.uid()::text));
create policy read_own_memberships on program_room_member for select using (actor_id = auth.uid()::text);
create policy add_member on program_room_member for insert
  with check (exists (select 1 from program_room r where r.app = program_room_member.app and r.room = program_room_member.room and r.owner_id = auth.uid()::text));
-- a person joins through accept_room_invite(token), a security definer function that checks the token's hash and expiry and inserts the membership for auth.uid()
-- the worker inserts System rows into a person's log through the service role; the key lives only on the worker host
create table program_lease (name text primary key, holder text not null, epoch bigint not null, until timestamptz not null);
```

- Policies go by `owner`, so a System row the worker writes into a person's
  log is readable by that person (R2-09); erasure deletes by owner. Room
  rows (today's `-mine-` and `-share-` rooms) are read and written by the
  room's members; a member is added by the room's owner or joins through an
  invitation token the `accept_room_invite` function checks, never by
  inserting a membership for oneself (R4-05). A public app's rows are
  written by anyone when `public_apps.writable` says so, a guest only as
  `actor_kind = 'guest'` and a signed-in person only as themselves, which is
  Multiple Counters' case, and are read-only otherwise (R3-17). On a writable
  public log a guest can read every writer's `(host, instance, seq)` and
  insert the next `seq` first; the engine treats that unique violation as a
  taken row, below, rather than as its own bug. Every table has row level
  security; `public_apps` is readable by all and written by nobody but the
  service role. The writer key includes `app`, as plan 02's does.
- `append`: one single-statement `insert`; a unique violation on the primary
  key is `Delivered` (a retry that already landed); a violation of
  `program_message_writer_seq` whose stored row is not ours means another
  session took our `seq` (R4-05): the engine mints a new `instance`, retries
  from `seq` 1, and reports it, because 128-bit instances make a collision of
  our own a bug, not a chance.
- `readSince`: `where app = $1 and owner_kind = $2 and owner_id = $3 and position > $cursor order by position limit 500`.
- `live`: `postgres_changes` on insert filtered by `app`; a live row that
  fails to decode (Realtime truncates records over 1,024 KB) triggers a read
  instead of a skip; timed `readSince` while subscribed.
- `presence`: a private Realtime channel per `(app, owner)` with Realtime
  Authorization policies on `realtime.messages`; Broadcast carries snapshot
  requests and offers, chunked under the plan's payload cap.
- `lease`: `program_lease` with a conditional update
  (`where until < now() or holder = $me`), `until` compared on Postgres's
  clock, and `epoch` incremented on every acquisition for fencing. The table
  has row level security and no client policy, so only the worker's service
  role reaches it (R4-06).
- Identity: Supabase Auth. Signing in with a Cloudflare Access token through
  `signInWithIdToken` is not shown to work; a spike comes before this plan is
  accepted. Development uses a magic link.
- Package: `@foldkit/supabase`, one `LogEngine`, run against the conformance
  suite below.

### Kafka

A transport for server hosts; a browser reaches it through a gateway that
speaks the envelope over WebSocket. `cleanup.policy=delete` with
`retention.ms=-1`; keyed by `instance`; the cursor is the map of partition
offsets printed as one string. No per-person deletion exists, so a Kafka log
carries no personal data or is crypto-shredded per owner; `presence` and
`lease` are `None()`.

### Local

A terminal tool with no sync engine keeps a durable NDJSON log in its state
directory under the actor's state path, appended before `update` returns, so
a daemon that idles out loses nothing. One daemon per `(app, engine, OS user)`
holds the file under an exclusive lock (plan 01). Engines that can go offline
keep an outbox under the same path until `append` returns `Delivered`.

## Snapshots

The owner's words: "I can't think of a reason why we would need snapshots
anywhere saved, but if new actors come into the system ... maybe they can ask
for a snapshot and then programs with the same user can respond."

Threat model: a peer may be buggy (same `programVersion`, wrong build) or
hostile (anyone who can reach the channel). A Model offered by a peer is a
cache until this device has folded the log itself.

1. **Nothing is saved as a snapshot.** No per-Message snapshot row, no
   server checkpoint, no device cache, unless the owner picks one below.
2. **A newcomer asks its peers.** On boot the runtime publishes
   `SnapshotRequested { app, programVersion, by: { host, instance }, signature }`
   on `presence`. The settled peer with the smallest `instance` answers
   `SnapshotOffered { to, domain, watermark, programVersion, signature }`;
   the others stay quiet.
3. **The channel attests the sender.** Offers are accepted only where
   `presence` is `Channel({ attested })`: a Supabase private channel, or an
   Instant offer sealed with the actor's key after a signed request (R4-07). `None()` means newcomers
   cold-fold, which on Instant without the key namespace is every boot.
4. **The offer is the Domain projection.** Ownership is per field (plan 02),
   so the offerer sends its Domain fields as they stand, with no device-owned
   or navigation fields and no refold.
5. **The requester verifies the row set in fold order, then stays
   read-only until its own fold agrees.** It reads the fold-order key list
   (ids and order keys, no payloads) up to the offer's watermark and compares
   count and fingerprint; a mismatch drops the offer. It paints the offered
   Domain fields as `Ready` with every Action refused ("checking this
   device's copy"), refolds the log in the background, and replaces the
   Model with its own fold, sending `LogRefolded` if anything differed; only
   then are Actions offered. A hostile offer can be seen and never acted on
   (R2-07). The View's derived fields are computed on accept (plan 07).
   What this buys, stated plainly (R3-02): with nothing saved, the time to an
   app that accepts a press is the full fold either way; the offer buys an
   earlier first paint, nothing more. The owner may instead allow a verified
   offer from the same actor and the same build to be usable at once, with
   the refold in the background and the Model replaced on a mismatch, which
   accepts a buggy peer's Model for one refold (decision 1).
6. **Size.** An offer larger than the channel's cap is chunked; above a
   declared ceiling the offerer declines and the requester cold-folds.
7. **No peer within a short wait means a cold fold.** Its cost is the number
   the owner decides against below. A cold fold keeps in-memory checkpoints
   as it goes, so a late row never refolds from the start again in that
   process.

Privacy: an offer carries the Domain Model (for finance, every balance). It
travels only on an attested channel over TLS (private on Supabase, sealed on
Instant), never on the shared log, and never to a `Guest` actor or to a
request that does not verify.

## Single writers

Some work must run exactly once for an owner: a Projection, a worker that
calls vendors with the secrets (plan 08), an import from an outside system.
Two primitives, both declared:

- `Subscription.make(…, { runsOn: RunsOn.serverOnly })` and the same on
  ManagedResources: the runtime starts them only on a Processor whose host
  kind is `Server` (`Host.server`, defined below; plan 10 extends the set,
  R4-18); `Host.headless` is kind `Headless` and starts none, so a test on
  `Engine.memory()` never starts vendor work (R3-05). An App with such work declares `server: Server.needed`
  in `App.define`; on Local the daemon is the only Processor and takes the
  server role itself, and on a shared engine a Processor that cannot see a
  worker says so in `status` and in the refusal of every Action whose
  `answeredBy` facts come from the worker (plan 01).
- `Lease.hold(name)` on engines with `lease: Rows({ clock })`: a conditional
  write with a lease duration, renewed while held. What it guarantees, and
  no more (R3-06): at most one holder at a time, except across a pause
  longer than the lease (a stopped process, a sleeping laptop, a partition),
  during which a resumed holder may believe it still holds. So every leased
  effect is idempotent (upserts keyed by the fact's id, vendor calls
  deduplicated by a request key) or fenced by the lease's `epoch`, which the
  target stores and compares; expiry is measured on the engine's clock
  (Postgres `now()`, Instant `request.time`), never the holder's; a holder
  stops issuing effects a margin before expiry; acquisition is a conditional
  write confirmed by reading the row back. An engine with `lease: None()`
  runs at most one server Processor per owner by deployment, and says so in
  `status`. A Projection into tables that cannot carry an epoch (Scribe's) is
  fenced by idempotent upsert keys alone, and no shared-schema change is asked
  for it (R4-06).

```ts
export const HostKind = S.Literals([
  'Browser',
  'Native',
  'Terminal',
  'Server',
  'Headless',
])
export const Host = S.Struct({
  name: HostName,
  label: S.String,
  kind: HostKind,
})
export const server = Host.make({
  name: HostName.make('server'),
  label: 'Server',
  kind: 'Server',
})
export const headless = Host.make({
  name: HostName.make('headless'),
  label: 'Headless',
  kind: 'Headless',
})
```

`HostKind`, `Host.server`, and `Host.headless` land with this plan (build
step 3), so plan 10's open set of hosts extends a type that exists (R4-18).
On Local the daemon takes the server role; webhooks cannot reach it, so
vendor-fed work polls there.

## Projections

An outside system that cannot read the log (Scribe's `recordings` and
`transcriptionSegments` tables in plan 01a) is fed by a Projection: a
headless Program whose `update` folds Domain facts and returns typed
Commands, run by one leased server Processor.

```ts
export const scribeRows = Projection.define({
  name: 'scribe-rows',
  of: Dictate,
  tables: ScribeTables,                            // typed handles from Scribe's schema, never strings
  settle: Duration.seconds(30),                    // apply a fact only once it is older than this, so late rows rarely reorder
  compensate: 'Reissue',                           // on a refold that reorders, reissue idempotent upserts; deletes and uploads are logged, not undone
  update: (state, fact) =>
    M.value(fact).pipe(M.tagsExhaustive({
      HeardFinal: ({ sessionId, segment }) => [state, [ScribeTables.transcriptionSegments.upsert(segmentRowOf(sessionId, segment))]],
      Rename: ({ sessionId, title }) => [state, [ScribeTables.recordings.update(sessionId, { title })]],
      ...
    })),
})
```

A Projection records the cursor it reached and resumes after a restart;
examples default to the dev Instant app. It never feeds back into the App's
`update`, and it is never the way a Program's own hosts read a derived value
(principle 7). The reverse feed (a Scribe recording appearing in `dictate`)
is a `serverOnly` Subscription that emits facts, so it has one writer.

## Audit of the sync models

| Today                                                   | Total form                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SyncRead { snapshot: unknown \| undefined, messages }` | gone; boot is `readSince(None)` or a verified peer offer                     |
| `SyncWrite { snapshot, message }`                       | `append(row)`                                                                |
| `readSince?`                                            | required; `paging` says how its cursor orders                                |
| `SyncEvent = Snapshot \| Message`                       | `Received { row }`                                                           |
| `SyncLink = 'offline' \| 'queued' \| 'delivered'`       | `Link = Delivered \| Queued({ because })`                                    |
| `from` as a parsed string                               | `host`, `instance` fields; `from` printed for display; rooms are owners      |
| `LogRowOrder.from?`, `seq?`                             | required on `EncodedRow`; upcast at the Instant boundary                     |
| no actor, no owner                                      | `actor: Authenticated \| Guest \| System`; `owner: Person \| Public \| Room` |
| `processor: string` on the engine                       | `key: EngineKey`                                                             |
| `StartCounterConfig.tape?`                              | `Engine` sum passed by the host                                              |
| `Program.synchronization?`                              | required (plan 02); category derived from ownership                          |

## The engine conformance suite

One Vitest suite, run against Memory, Local, Instant (a test app), Supabase
(`supabase start`), and Kafka (a local broker) in CI:

- `append` then `readSince(None)` returns the row once; a duplicate `id`
  returns `Delivered` and stores one row.
- Two engines on one log see each other's rows on `live` within the engine's
  latency bound; neither sees its own as foreign.
- `readSince(cursor)` after `live` reconnects returns exactly the rows the
  stream missed; a `seq` gap triggers a read that fills it.
- Two inserts started in opposite order and committed in opposite order are
  both returned by the next `readSince` on a `CommitOrdered` engine, and by
  the overlap re-read on a `ReceiptOrdered` one.
- A late row is delivered and the runtime refolds; the fold equals a fresh
  fold of the full log.
- A peer offer from another actor is refused by the channel; one with a wrong
  watermark is dropped; a right one is painted read-only and then replaced by
  the requester's own fold with no visible change.
- Two server Processors contend for one lease; exactly one runs; a holder
  paused past expiry resumes and its fenced effect is rejected by epoch.
- Two writers with one `(owner, host, instance, seq)` under two different
  `app` values both land; the same key under one `app` is an `EngineError`.
- A room member reads and appends to the room's log; a non-member gets
  neither; a guest appends to a writable public app and not to a read-only
  one (Supabase).
- The legacy Counter row upcasts to `EncodedRow` and back without loss.

## Migration

1. `LogEngine` beside `SyncEngine`; an adapter from the old to the new for one
   release; `fromTransport` becomes the Instant `LogEngine` with the overlap.
2. `EncodedRow` with `owner`, `actor`, `host`, `instance`, `seq`; the Instant
   legacy upcast; the shared-schema change for `programMessage`.
3. `App.define`, `Engine`, `InstantApps` with `selfHosted`; delete
   `COUNTER_TAPE` and friends.
4. `presence` with signed offers on Instant; `Local` with its NDJSON log; the
   outbox; `lease`.
5. `@foldkit/supabase` against the conformance suite, after the identity
   spike, and before the Instant Cloud cut-over.
6. Kafka engine when a server-side consumer exists to want it.

## Decisions for the owner

1. **Saved snapshots and peer offers** (R3-02). (a) Nothing saved, your
   words: every boot waits for a full fold (about 900 ms and 1.5 MB per cold
   Counter boot; a finance log with market data grows by hundreds of rows a
   day, plan 08), and a peer offer only paints sooner, read-only, until this
   device's own fold agrees (proposed). (b) A verified offer from the same
   actor and the same build is usable at once while the device refolds in
   the background and replaces the Model on a mismatch, which accepts a
   buggy peer's Model for one refold. (c) A saved per-device cache (ADR
   0013: 105 ms and 73 KB) as a host opt-in, or a server checkpoint for long
   logs. In-memory checkpoints are kept in every case. On Instant, offers are
   sealed with the actor's device key and requests signed (proposed), or
   offers are off on Instant and every boot there is a cold fold (R4-07).
2. **The Instant target for examples**: `bd40c50a` (dev, the shared Scribe
   schema, proposed until the cut-over), `e7c49961`, `5417c2e3`, or
   self-hosted Instant now. Dictate signs in through an interactive identity
   so its transcripts are a person's rows there (proposed), or an App with no
   identity stays on the Local log (R4-04).
3. **Instant Cloud's shutdown on 2027-08-31**: move examples to self-hosted
   Instant, make Supabase the default engine, or both; and whether that lifts
   "design only" for `@foldkit/supabase` now.
4. **`examples/AGENTS.md`'s "Sync: Instant only"** with Supabase for finance
   and a Local log for engine-less terminal tools: amend to "one engine per
   example, never a per-tab or per-process store pretending to sync".
5. **The Local log file** for terminal tools with no engine: durable
   (proposed) or lost when the daemon exits.
6. **Supabase identity**: run the Access sign-in spike before accepting the
   adapter, or use Supabase Auth's own providers for the finance example.
7. **Erasure of System rows**: erase by owner, which reaches the rows the
   worker wrote into a person's log (proposed).
8. **Where an example names its engine, and which**: one engine descriptor
   per example, a subpath of its core package that the Program's own modules
   never import, naming the same Instant app its web page uses, which the
   build copies into the terminal manifest (proposed, which is what
   `examples/AGENTS.md` requires today); or the Local log for terminal
   commands; or a package of its own (R3-05, R4-03).
9. **Who may add a member to a shared room**: its owner, or anyone holding an
   invitation token the room's owner issued (proposed); or any member
   (R4-05).
