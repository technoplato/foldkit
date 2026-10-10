# Plan 01 | One terminal runtime for every Program

Status: Proposed. Design only; nothing here is built. Revised after
adversarial rounds 1 to 4 (R2-03, R2-04, R2-22, R2-23, R2-32 to R2-34,
R3-01, R3-03 to R3-05, R3-16, R3-19, R4-03, R4-09, R4-11, R4-14, R4-18). Closes audit items 1 (terminal
leftovers), 2 (env reads in core), and 7 (tail with changes), and ADR 0014
Decision 1. ADR 0014 names `foldkit/cli` as the home of the runtime; this
plan puts it in a new `foldkit/terminal` subpath and amends ADR 0014 when
accepted.

## The problem in one paragraph

A terminal command must see state that is up to date even though the state
depends on side effects: a microphone that is open, an audio player that is
playing, a sync engine that is receiving rows, a Command that has not
returned. A one-shot process cannot hold any of that, so the Program must live
in a daemon and every command must be a client of it. Today each app builds
that daemon by hand (Counter: 7 files; Books: 8 source files, 807 lines, plus
a 506-line test; Multiple Counters: none, so it is one-shot and would kill
any live work). Nothing asks the Program what it needs to stay alive. The
runtime below makes the daemon the framework's, driven by the Program's own
declarations, so a terminal host is one call plus its platform Layers.

## Goals

1. A terminal host is one file with one call and one Layers file. It names
   the command, points at the App, and provides the platform Layers the App's
   service tags need. It names no Action, route, socket, tape, or engine.
2. Daemon first. The Program runs in one daemon per App per engine per OS
   user, signed in as one actor at a time. A command, a `tui`, a `watch`,
   and a `tail` are clients of it.
3. Liveness is derived from declarations, never from a host's guess: the
   daemon stays alive while the Program has live work it declared as such.
4. `tail` prints every applied Message with the Model fields it moved, and
   every reconciled change beside the Message that caused it.
5. The runtime is Program-agnostic and engine-agnostic (plan 06). It runs on
   the engine the example names once, outside core, so its commands share the
   log its web page uses, and on a durable Local log for a tool that names no
   engine.
6. A one-shot run of a Program with live work fails loudly in development.
7. One conformance suite every terminal surface passes (ADR 0014 Decision 2,
   extended with daemon assertions).

## North Star

The whole terminal host of a dictation app:

```ts
#!/usr/bin/env node
// examples/dictate/cli/src/entry.ts
import { terminal } from 'foldkit/terminal'

await terminal({
  name: 'dictate',
  app: () => import('dictate-core-example').then(core => core.DictateApp),
  engine: () =>
    import('dictate-core-example/engine').then(module => module.engine), // the example's one engine descriptor
  layers: () => import('./layers.js').then(module => module.terminalLayers),
})
```

```ts
// examples/dictate/cli/src/layers.ts: the platform Layers the App's service tags need, Node only
export const terminalLayers = Layer.mergeAll(
  Microphone.layer(coreAudioCapture), // the signed capture helper, plan 01a
  Recognizer.layer(appleSpeechHelper),
)
```

Core declares the service tags (`services: [Microphone, Recognizer]` in
`App.define`) and nothing platform-bound, so a browser host imports the same
core and supplies browser Layers. What a person gets from the entry file,
with no further host code:

```text
dictate                      paint the current screen and every Action
dictate start                press an Action by its derived word
dictate rename --title "Standup"   a Fill Action, typed by its Schema
dictate stop
dictate tui                  the live terminal UI, attached to the daemon
dictate watch                repaint as the Model changes
dictate tail                 every Message as it is applied, with its changes
dictate tail --json          the same as NDJSON
dictate menu open            the action menu, as every other host has it
dictate key k --meta         press any key
dictate help                 usage from the build-time manifest
dictate login                the App's identity flow
dictate daemon status        pid, uptime, engine, actor, liveness reasons, attached clients
dictate daemon stop          send the App's stop Action, wait for Idle, release, exit
dictate daemon restart       hand over to a daemon of this build
dictate daemon logs
dictate install              put `dictate` on PATH
```

`help` and `login` must work before a daemon exists, and the client path
never imports core. The build emits a static manifest (commands, usage, each
Action's routes, the identity flow's kind, and the key of the engine the entry
names) from plan 08's `SkillDocument` plus the entry's `engine`, and the
client reads it (R4-03).

## Topology

```text
dictate start ──┐                                   ┌── Microphone (ManagedResource, Node Layer)
dictate tui   ──┼── socket ──► daemon ── Program ───┼── Recognizer (ManagedResource, Node Layer)
dictate tail  ──┘              │                    └── audio levels (Subscription)
                               └── Engine (Instant | Supabase | Kafka | Local)
```

- One daemon per `(App.id, Engine.key, OS user)`. The socket and the daemon
  lock are keyed by exactly those three, which a client knows before any
  daemon exists (the engine key is in the manifest), so a client from a new
  build reaches the running daemon and the
  handshake below decides what happens (R2-22). The actor is the daemon's
  state, not part of the key (R3-03): the daemon signs in as one actor, holds
  that actor's Local log and outbox under a state path that names the actor
  (`…/foldkit/<appId>/<engineKey>/actors/<actorKey>/`), and `login` as
  another actor hands the daemon over under the new actor the way `restart`
  does. `daemon status` prints the actor.
- The socket path is short and hashed (`fk-<digest>.sock`, under macOS's
  104-byte limit; a named pipe on Windows) in the per-user runtime
  directory: `$XDG_RUNTIME_DIR/foldkit/` on Linux, `$TMPDIR` on macOS, which
  is per user there. Today's helper writes `/tmp/fkc-<12 hex>.sock`
  (`packages/foldkit/src/cli/paths.ts`), a shared directory this plan
  replaces. The pid and daemon lock live in the state directory
  (`~/Library/Application Support/foldkit/<appId>/<engineKey>/` on macOS,
  `$XDG_STATE_HOME/foldkit/...` elsewhere).
- The engine is the example's one engine descriptor
  (`<app>-core-example/engine`, plan 06), which `terminal()` receives as
  `engine` and every other host imports too, unless `FOLDKIT_ENGINE` overrides
  it; `local` is the default only for an example that names none. Core's
  `App.define` stays engine-free, and the build writes the descriptor's key
  into the manifest, so a client hashes its socket path without loading core
  or an adapter (R4-03). The Counter and Multiple Counters commands therefore
  fold the same Instant log their web pages write, as `examples/AGENTS.md`
  requires (R3-05). `daemon status` prints the engine the daemon runs on.
- A device-exclusive resource (the microphone) is held under one exclusive
  lock per resource in one per-user directory shared by every App and
  engine (`…/foldkit/locks/microphone`), so two daemons of one App on two
  engines, or of two Apps, can never both open it (R3-03).
- The first client that needs the daemon spawns it under the daemon lock, so
  two clients never spawn two daemons, and waits for its socket. Later clients
  connect.
- The daemon script is the same entry file, spawned as
  `node entry.js --foldkit-daemon`; `terminal()` sees the flag, `await import()`s
  its runtime, then calls `app()` and `layers()`.
- The client path imports Node builtins only.
- An App that declares `serverOnly` work (plan 06) needs a server Processor.
  On Local, where the daemon is the only Processor, the daemon takes the
  server role (`Host.server`) and runs that work itself; on a shared engine
  with no reachable worker, `daemon status` says so and the Actions whose
  `answeredBy` facts come from the worker refuse with "no worker is running
  for this log" (R3-05). A worker is seen through its lease row on engines
  with `lease: Rows` (a row within its `until` means a live holder), by
  deployment on Kafka, and by the daemon itself on Local (R4-11). A finance
  daemon on Local receives no webhooks and polls instead (R4-18).
- Memory engines (tests) and `RunIn.InProcess()` run the Program in the client
  process; the dev guard below refuses that for a Program with live work.

## Liveness

Live work is declared, never inferred from a stream that happens not to end
(R2-03). The option is `Liveness.holdsDaemon`, not `keepsAlive`, because
Subscriptions already have `keepAliveEquivalence` for another purpose and
Books' clock sets it (R3-16):

```ts
Subscription.make(…, { liveness: Liveness.holdsDaemon })   // the clock while playing, the recognizer stream while listening, the Audible import until done
Subscription.make(…, { liveness: Liveness.observes })      // the default: a shelf, a sign-in state, a live query
ManagedResource.make(…, { liveness: Liveness.holdsDaemon }) // the microphone, the audio player
```

```ts
export const LiveReason = S.Union([
  HoldingSubscription({ key: SubscriptionKey }),
  HeldResource({ key: ResourceKey }),
  CommandInFlight({ command: CommandName, since: Millis }),
  PendingWrites({ count: S.Int }),
  AttachedClient({ clientId: ClientId, host: Host }),
  RecentClient({ until: Millis }),
])

export const Liveness = S.Union([
  Idle({ since: Millis }),
  Busy({ reasons: S.NonEmptyArray(LiveReason) }),
])
```

- `ProgramRuntime` gains `liveness(): Liveness` and `whenIdle(grace)`. Only
  `holdsDaemon` Subscriptions and ManagedResources count, plus Commands in
  flight, pending writes, and attached clients.
- Books marks its clock and transcript Subscriptions, its Audible import
  (which follows an import until it is done, wherever the person goes
  meanwhile, R3-19), and its audio player `holdsDaemon`; its shelf, member,
  and readings Subscriptions observe. When playback ends the player releases,
  the clock stops, liveness becomes `Idle`, and the grace runs. Conformance
  cases run Books' real Subscriptions to `Idle` and hold the daemon through
  an import with no client attached.
- `idleGrace` is a terminal-host option with a ten-minute default, passed to
  `terminal()`, not declared in core.
- `dictate daemon status` prints the reasons.

### The development guard

`runProgramCommand` and `RunIn.InProcess()` check `Program.liveWork(program)`:
a Program that declares any `holdsDaemon` Subscription or ManagedResource, or
whose `init` returns Commands, fails with `ProgramNeedsDaemonError({ reasons })`
in development.

## Protocol version 2

Newline-delimited JSON over the socket, every frame an Effect Schema value.
One connection per client. Streaming responses for `Attach`.

```ts
export const Invocation = S.Union([
  Press({ tag: ActionTag }),
  Choose({ tag: ActionTag, segment: Segment }),
  Fill({ tag: ActionTag, fields: JsonObject }),
])

export const ClientRequest = S.Union([
  Hello({
    protocol: S.Literal(2),
    appId: AppId,
    programVersion: S.Int,
    schemaHash: Hash,
    buildId: BuildId,
    client: Host,
    clientId: ClientId,
  }),
  Show({ size: TerminalSize }),
  Do({ at: Uri, invocation: Invocation, flags: S.Array(Flag) }), // the address the command acts at; judged and applied there
  Open({ uri: Uri }),
  Back({ uri: Uri }),
  Read(),
  Attach({ kind: AttachKind, size: TerminalSize }), // Tui | Watch | Tail
  Key({ input: KeyInput }),
  Resize({ size: TerminalSize }),
  Status(),
  Stop({ reason: StopReason }),
])

export const DaemonResponse = S.Union([
  Painted({
    stdout: S.String,
    stderr: S.String,
    exitCode: S.Int,
    outcome: Outcome,
  }),
  Applied({
    before: Json,
    after: Json,
    changes: S.Array(FieldChange),
    reconciled: S.Array(FieldChange),
  }),
  Model({ model: Json }),
  Frame({ title: S.String, lines: S.Array(TerminalLine) }),
  Event({
    at: Millis,
    from: From,
    message: Json,
    changes: S.Array(FieldChange),
    reconciled: S.Array(FieldChange),
  }),
  DaemonStatus({
    pid: S.Int,
    since: Millis,
    engine: EngineKey,
    actor: Actor,
    liveness: Liveness,
    clients: S.Array(AttachedClient),
    identity: IdentityStatus,
    build: BuildId,
  }),
  Refusing({ reason: S.String, fix: S.String }),
  Failed({ cause: S.String }),
])

export const FieldChange = S.Struct({
  path: ModelPath,
  before: S.Option(Json),
  after: S.Option(Json),
})
```

- `Hello` carries the protocol, the App id, the `programVersion`, the schema
  hash, and the build id. A protocol or schema mismatch answers `Refusing`
  naming both sides. A build mismatch answers `Refusing` with the fix
  ("stop the recording, then `dictate daemon restart`"), and `restart` hands
  over: the old daemon finishes its live work, releases, and the new build's
  daemon takes the socket.
- A one-shot command acts at an address (`Do.at`). The daemon resolves an id
  prefix against its Model, parses the address into pages (never into a
  presentation), reconciles that View, and judges availability there
  (placement, refusals, capabilities, plan 02). A Domain or Local Action is
  applied to that View: its Domain and Local results are kept, its Commands
  run in the daemon, its `leadsTo` is dropped, and nothing Navigation-owned
  is logged, so no attached client's screen moves and a question open in a
  TUI does not refuse a command at another page (R3-04, R4-09). A Navigation
  Action (`open 1`, `delete 1`) moves the daemon's own navigation, is logged
  as the daemon's move, and prints the moved View ("at /counters/1", "Delete
  Counter 1?"), so the CLI's two-step delete keeps its tests: `confirm-delete`
  is a presented child's Action, enabled only while the question is open on
  the daemon, and otherwise refused with "no delete is waiting for an answer".
  The client fills `at` from the invocation using the manifest's routes
  (`/counters/<id>` for `rename <id>`); `--at` overrides it. A TUI client acts
  at the daemon's current screen (R2-04).
- There is one frame per job: `Do` presses a Catalog Action through
  `availabilityOf`; `Open` and `Back` send the two carrier facts a Program
  declares. A client can send no other fact: resource facts (`HeardFinal`)
  come only from the daemon's own Subscriptions and Commands, so no local
  process can forge one onto the shared log. Loopback TCP, when used,
  requires a token from a `0600` file in the state directory.
- A daemon that sees a newer `programVersion` on the log keeps folding and
  writing while those rows decode; it becomes read-only only when a newer
  row fails to decode or a `RetiredVersion({ below })` fact says so, so a
  branch run or a rollback cannot freeze every older Processor (R2-23).
- `Painted.stderr` and `outcome` are total; `Refusing` is a response, not a
  surface; `Flag` is a sum (`Meta | Control | Shift | Named`);
  `RunIn = Daemon() | InProcess()`.

## Tail with changes

`dictate tail` attaches as `Tail`. The daemon, which is the one folding, emits
one `Event` per applied Message with `changes` as `FieldChange` values keyed
by row key, and `reconciled` for the device-owned and navigation fields the
Program's `reconcile` step moved in answer (plan 02). Human output keeps
today's columns and adds the moved fields; the sample below is for plan 01a's
Model:

```text
14:02:11  CLI      4f2a9c1e  Heard final  sessionId "0192c6c8…"  segmentId "0192c6c9…"  words 4
  sessions[0192c6c8…].segments[0192c6c9…]   None → Final (words 4)
  live                                       Some → None          reconciled
14:02:12  React    ad55df2e  Rename  sessionId "0192c6c8…"  title "Standup"
  sessions[0192c6c8…].title                  "Untitled" → "Standup"
```

`HeardFinal` is Domain and writes only the session; `live` is this device's
field, cleared by `reconcile` once the segment it shows is in the session
(R3-01), which is why the line is marked. `--json` prints each `Event` as
one NDJSON line. `--tag Heard*`, `--from react`, `--no-changes`, and
`--no-reconciled` filter. `--log` reads the engine feed instead (today's
behavior: what every Processor receives). The headless printer in
`examples/counter/headless/src/print.ts` becomes a test of `Event` formatting.

## Identity

```ts
export type Identity =
  | Readonly<{ _tag: 'None' }>
  | Readonly<{ _tag: 'FromEnvironment'; read: IdentityReader }> // read a token; refuse with a fix when missing
  | Readonly<{ _tag: 'Interactive'; flow: IdentityFlow }> // may open a browser or print a device code
```

A plain TypeScript union, not a Schema, because its members carry effects.
The daemon acquires identity before starting the Program. On refusal it
answers every client with `Refusing({ reason, fix })` for a short linger and
exits; the client prints the fix (`dictate login`). `login` runs the flow the
manifest names and, when a daemon is running as another actor, hands it over
under the new one. Books' `cloudflared access login` becomes one
`IdentityFlow` value in the Books terminal host's Layers file, not in core.

## Data that must not be lost

- With `Engine.local`, the daemon appends to a durable NDJSON log under the
  actor's state path before `update` returns, under the daemon's exclusive
  lock, so an idle exit loses nothing and two daemons never write one file
  (plan 06).
- With Instant or Supabase, an outbox under the same path holds rows until
  `append` returns `Delivered`, so a daemon killed while offline loses nothing.
- `daemon stop` sends the App's stop Action (for Dictate, `Stop`), waits for
  `Idle` so the recognizer's last finals land, then releases every
  ManagedResource and exits. `SIGTERM` does the same with a bounded wait.

## Telemetry and install

The runtime attaches telemetry with `role: 'daemon'`, names each client's
surface from its `Hello` Host through `onBehalfOf`, and writes to the
platform log directory. `install` writes a launcher on PATH;
`examples/books/scripts/install-books-command` is the model.

## Package boundary

- `foldkit/terminal` (new subpath): `terminal()`, protocol v2, liveness,
  daemon lifecycle, the client library. Node and Bun.
- `foldkit/cli` keeps painting and parsing: `paintProgram`, `programUsage`,
  `parseProgramArgv`, `runProgramCommand` (in-process, guarded).
- Hosts delete `daemon.ts`, `view.ts`, `settings.ts`, `inProcess.ts`,
  `session.ts`, `tail.ts`, `watch.ts` and keep `entry.ts` plus `layers.ts`.
  Books' ffplay player becomes an `AudioPlayer` Layer in its terminal host's
  `layers.ts`; the `AudioPlayer` service tag and the Program that uses it stay
  in core.

## Proof: a dictation CLI

`examples/dictate` is a speech transcription app driven completely by the
terminal, modeled on Scribe. Its Model, Actions, facts, lifecycle, and the
questions it raises are in `plans/01a-dictate-from-scribe.md`, which this
plan quotes rather than restates. One sentence on names: an Action is what a
person presses (`Stop`, a Local Message that writes `recorder`); the fact its
Command produces is what the log records when the effect is done
(`StoppedSession`, Domain); both go through `update`.

The daemon is what makes the example possible: between `dictate start` and
`dictate stop` the microphone is open in the daemon, the recognizer is
running, and every final segment is a Domain fact on the log, so a browser
host paints the transcript live.

## Conformance suite

Every terminal surface passes ADR 0014 Decision 2, plus:

- A Program with declared live work never runs one-shot
  (`ProgramNeedsDaemonError`).
- Two clients racing never spawn two daemons; a client from another build reaches
  the running daemon and gets `Refusing` with the restart fix; `restart`
  hands over without a second daemon ever holding the microphone; two
  daemons of one App on two engines contend for one microphone lock and
  exactly one opens it.
- Killing a client never stops the daemon; `daemon stop` sends the stop Action,
  waits for `Idle`, and releases every ManagedResource before exit; `SIGTERM`
  does the same.
- Books' real Subscriptions reach `Idle` after playback ends; an Audible
  import holds the daemon with no client attached until it finishes; with no
  live work and no clients, the daemon exits after the grace.
- `tail` prints one change per leaf a Message moved, keyed by row key, marks
  reconciled changes, and prints nothing for a Message that moved none.
- A client cannot send a resource fact; a `Do` the Catalog refuses at its
  address is refused by the daemon with the same sentence, and no attached
  client's screen moves; with a delete question open in an attached TUI,
  `counters add` at `/counters` from a second terminal is applied, and the
  TUI's question stays open; `delete 1` then `confirm-delete` as two one-shot
  commands deletes, `confirm-delete` alone is refused with "no delete is
  waiting for an answer" (today's `cli.test.ts`), and `rename` at the page of
  a deleted counter is refused because the address View is reconciled first.
- A client with another protocol or schema hash gets `Refusing` naming both,
  never a hang.
- `login` as another actor hands the daemon over; the previous actor's Local
  log and outbox are untouched under their own path.
- Telemetry names the surface of the view that caused each Message.
- A daemon killed while offline loses no row once it restarts.

## Migration

| Host                             | Today                                           | After                                    |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `examples/counter/cli`           | 7 files, 255 lines                              | `entry.ts` (6 lines), no Layers needed   |
| `examples/multiple-counters/cli` | one-shot, 82 lines, plus `tui.ts`               | `entry.ts`                               |
| `examples/books/cli`             | 8 source files, 807 lines, plus a 506-line test | `entry.ts` plus `layers.ts` (the player) |
| `examples/counter/headless`      | 407-line printer                                | a formatting test                        |

`COUNTER_TAPE`, `COUNTER_TAPE_PATH`, `VITE_COUNTER_TAPE`,
`EXPO_PUBLIC_COUNTER_TAPE` are deleted; the Memory engine stays a test fake
reached through `Engine.memory()` in tests only.

## Decisions for the owner

1. Daemon scope: one daemon per `(App, engine, OS user)`, signed in as one
   actor at a time, with `login` as another actor handing it over
   (proposed); or a daemon per actor on its own socket, which needs the view
   to learn the actor before it connects.
2. Idle grace default: ten minutes (proposed, Books' value).
3. Terminal clients: a one-shot Domain or Local command is judged and applied
   at its address with no attached screen moving, a one-shot Navigation
   command moves the daemon's screen, and a presented child's Actions need
   the presentation open on the daemon (proposed, which keeps the CLI's delete
   tests); or every client keeps its own navigation; or a command may confirm
   unasked (R4-09).
4. The Local log: durable (proposed) or lost on exit (plan 06, decision 5).
5. The engine of an example's commands: the example's one engine descriptor,
   the same Instant app its web page uses (proposed), or the Local log; and
   where the descriptor lives: a subpath of the example's core package that
   the Program's modules never import (proposed), or a package of its own
   (R4-03).
