# Adversarial audit | Round 2 | 2026-10-09

Scope: the owner's two saved messages, `round-1.md` and `round-1-response.md`,
`plans/README.md`, plans 00 to 10 and 01a as revised,
`skills/foldkit-composition/SKILL.md`, the uncommitted diff of
`skills/foldkit-composable-architecture/SKILL.md`, the "Composition rubric" in
`examples/AGENTS.md`, principles 7 and 8 in `PRINCIPLES.md`, and the
glossary's "Plans vocabulary (proposed)". Claims about code were checked on
branch `claude/platform-adapter-packages` at `ae05f4b7a` plus the uncommitted
edits as they stood after 18:28 on 2026-10-09, with the installed React Router
8.3.0 (`packages/react/node_modules/react-router`), `@react-navigation/core`
7.21.11, and Effect 4.0.0-beta.97 (`repos/effect-smol`). Platform claims were
checked against Instant's server source (instantdb/instant, read through
`gh`) and against Instant's and Supabase's documentation fetched the same day;
where a claim rests on my own knowledge instead, the finding says so. The
reviewed client app is "the reviewed app" here and none of its identifiers
appear; the file count under R1-01 was made without printing its name.

## Verdict

The plans cannot yet be accepted as a design. Round 1 changed them a great
deal: of its 60 findings, 23 fixes are verified, 34 are partial, 1 is not
fixed (the example inventory), and 2 regressed (R1-26's socket digest now
includes the build, so each build gets its own daemon; R1-59's prefix
derivation returns the whole URL under React Router 8.3.0). The prose rules
hold: no em dashes, no labels on the plans' own writing, Foldkit capitalized,
and the client named nowhere in `plans/`. Three new problems block, and each
sits in a foundation the other plans build on. Minted ids come from a 32-bit
per-run instance, so ids and Supabase's unique key collide at modest scale,
a colliding `Add` is silently dropped, and no type exists for a Message
before its id is minted (R2-01). One category per Message cannot protect
device-owned fields, so a peer that folds Dictate's `Start` or finance's
`LinkBank` takes on a recorder or a Link flow it does not have, and the
default rule classifies every not-yet-migrated Action as Navigation (R2-02).
Derived liveness never reaches Idle for Books, the app plan 01 cites as its
example, because its always-on Subscriptions count as live work (R2-03).
Beneath those, four clusters remain. Sync: Instant keeps the lost-row race
R1-33 fixed for Supabase, Instant rooms cannot attest a snapshot offer so
every Instant boot is a cold fold, Supabase's policies hide System rows from
the person whose log they are in, and Instant Cloud closes on 2027-08-31
while every example targets it (R2-05 to R2-09). Finance: market data written
by every device onto a log nobody snapshots, a `ClosedDay` that freezes a
computed value, and a device-owned Link flow that cannot survive Plaid's
OAuth redirect (R2-10 to R2-12). The static graph: `Update.writes` as written
constrains nothing, `Each` cannot find a row's id, facts cannot declare what
they lead to, and `Derive.model` has no mechanism (R2-13 to R2-16).
Placement and rubric: `availabilityOf` measures `at` against the top of the
stack, which is the action menu while it is open, and the "3 today" column
cannot be met by any example with a dialog or a detail page (R2-04, R2-17).
What is close: plan 09's total order and decode rule, plan 04's tabs and
stack in a Sheet, plan 03's one-API surface, plan 10's capability framing,
and the 08a slice once it takes a Program instead of an `App`.

## Round 1 fixes

Verified: present and sound. Partial: present but incomplete, or the problem
moved elsewhere. Not fixed: the problem stands as round 1 found it.
Regressed: the fix introduced a new problem.

| Id    | Status    | What was found                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-01 | Partial   | A case-insensitive search finds the client's name nowhere in `plans/`, `PRINCIPLES.md`, `glossary.md`, `skills/`, or either transcript. The fail-closed PII pattern is still only a proposal (README decision 1), and the count disagrees: plan 00 line 257 and the response say eight files, README line 64 and plan 08 line 412 say five; the search finds five tracked files, all in `examples/personal-cfo`, on `technoplato/main` |
| R1-02 | Partial   | `mints` landed (plan 02 lines 142 to 150), but ids built from a 32-bit per-run instance collide, no type names a Message before minting, and today's `compose.forEach` still mints in the fold while the "3 today" column recommends it (R2-01, R2-17)                                                                                                                                                                                 |
| R1-03 | Partial   | Threat model and attested transports stated; Instant rooms have no permissions (R2-06); step 5 reads "the receipt-ordered prefix ... up to the watermark's position", the comparison step 7 forbids, and an offered Model is painted Ready and acted on before it is checked (R2-07)                                                                                                                                                   |
| R1-04 | Partial   | 08a is first in the build order, but `Skill.ofApp(app: App)` (plan 08 line 60) takes plan 06's `App`, and 08a adds `at` to the Catalog, so it does not "depend on nothing" (README line 33; R2-38)                                                                                                                                                                                                                                     |
| R1-05 | Verified  | Plan 06 lines 250 to 251 save nothing; README decision 6 carries ADR 0013's numbers. (The owner-philosophy memory still says "never saved as truth", R2-36; the cost for finance is understated, R2-10)                                                                                                                                                                                                                                |
| R1-06 | Verified  | Message 2 is saved verbatim; `PRINCIPLES.md` lines 3 to 6 cite it and mark principles 7 and 8 proposed; principle 8's example is labeled proposed                                                                                                                                                                                                                                                                                      |
| R1-07 | Verified  | The follow-ups are saved verbatim; the four readings are README decisions 2 to 5                                                                                                                                                                                                                                                                                                                                                       |
| R1-08 | Partial   | "3 today" added and existing examples keep merging, but the column contradicts the undated row 1 (R2-17), and `skills/foldkit-composable-architecture/SKILL.md` lines 27 to 34 still require a `NOTE:` on every hand-written `Got*` and cite `GotVendingMessage`, which has neither a NOTE nor an OutMessage (`examples/world/core/src/message.ts` line 16)                                                                            |
| R1-09 | Partial   | `Fact.define`, `produces`, and Produces edges landed; `leadsTo` is required by plan 07 but absent from plan 02's declaration (lines 166 to 179), and facts cannot declare `produces`, so the `LinkBank` chain plans 07 and 08 print is not derivable (R2-15)                                                                                                                                                                           |
| R1-10 | Partial   | Compiled versus checked is stated; `Update.writes` as written constrains nothing (R2-13)                                                                                                                                                                                                                                                                                                                                               |
| R1-11 | Partial   | `ModelPath` is an ADT, but `Each` carries no key and the builder has no Model to check against (R2-14)                                                                                                                                                                                                                                                                                                                                 |
| R1-12 | Partial   | The Domain fact is self-contained; how a navigation-local Confirm becomes a logged fact is unspecified, and the two North Stars disagree (R2-24)                                                                                                                                                                                                                                                                                       |
| R1-13 | Partial   | `availabilityOf` reaches every surface, but placement is measured against the top of the stack (the menu, when open) and against one navigation every daemon view shares (R2-04)                                                                                                                                                                                                                                                       |
| R1-14 | Partial   | Per-kind lifting added; a lifted Choose becomes a "Fill offered as a two-step choice" (plan 05 line 122), which `ActionKind` (plan 02 lines 119 to 128) cannot express, since `Fill` carries no choices                                                                                                                                                                                                                                |
| R1-15 | Verified  | `FormState` in the Model and a total `prefill` (plan 02 lines 228 to 232)                                                                                                                                                                                                                                                                                                                                                              |
| R1-16 | Verified  | `openness: Closed \| Open` (plan 02 lines 121 to 130) with Books, Read Aloud, and the transcript player named                                                                                                                                                                                                                                                                                                                          |
| R1-17 | Partial   | The table omits `ProgramCommand.args?`, `key?`, and `effectManifest?` (`program.ts` lines 53 to 59), keeps `ownNavigation: (processorId) => boolean` (plan 02 line 323), counts nine optional `Program` members where `program.ts` lines 147 to 179 has twelve, and the four-way `Category` mixes Message routing with field ownership (R2-02)                                                                                         |
| R1-18 | Partial   | `Interactive \| Viewer` added, but 35 of 40 non-test files that call `Program.make` declare no catalog, not 20, and a Viewer cannot hold apps that have buttons (R2-18)                                                                                                                                                                                                                                                                |
| R1-19 | Verified  | `@foldkit/react/react-router` stays a subpath (plan 03 lines 127 to 131)                                                                                                                                                                                                                                                                                                                                                               |
| R1-20 | Partial   | Handles by kind and `for(value)` landed; `bound.scope(Counters)` is ambiguous for a Program composed twice and cannot scope one row (R2-28)                                                                                                                                                                                                                                                                                            |
| R1-21 | Partial   | The function form landed; the North Star's `{' '}` child throws in React Navigation 7.21.11, and the screen and ownership model has gaps (R2-21)                                                                                                                                                                                                                                                                                       |
| R1-22 | Verified  | One typed stack per tab, the restated law, decision 13. (Written as a TypeScript type, not a Schema, R2-32)                                                                                                                                                                                                                                                                                                                            |
| R1-23 | Verified  | `PageStack` with no `maybeModal` (plan 04 lines 209 to 214). (A leave guard on such a Sheet reopens the two-modal question, R2-20)                                                                                                                                                                                                                                                                                                     |
| R1-24 | Partial   | Drawer container, nesting, and guards added; `useBlocker` requires a data router and neither React Router carrier is one (R2-20)                                                                                                                                                                                                                                                                                                       |
| R1-25 | Verified  | `terminal({ name, app, layers })`; core declares service tags only                                                                                                                                                                                                                                                                                                                                                                     |
| R1-26 | Regressed | Paths are short, but the digest now includes the build (plan 01 line 116), so each build gets its own daemon and R1-27's handshake never meets a mismatch; on Linux `os.tmpdir()` is a shared `/tmp` and the digest omits the user and actor (R2-22)                                                                                                                                                                                   |
| R1-27 | Partial   | `Hello` carries the five fields, but over a build-keyed socket it never meets an old daemon (R2-22), and "read-only on a newer version" is a new trap (R2-23)                                                                                                                                                                                                                                                                          |
| R1-28 | Verified  | No `Send`; Catalog presses and declared carrier facts only; a `0600` token for loopback (plan 01 lines 247 to 252). (Plan 02 lines 149 and 220 still name `Send`, R2-33)                                                                                                                                                                                                                                                               |
| R1-29 | Verified  | Durable Local log, outbox, `daemon stop` waits for Idle (plan 01 lines 294 to 302). (Two daemons can append one log, R2-22)                                                                                                                                                                                                                                                                                                            |
| R1-30 | Verified  | `AcknowledgeFinal` Command, `Permission` sum, signed helper, spike gate (plan 01a lines 23, 26, 149 to 158)                                                                                                                                                                                                                                                                                                                            |
| R1-31 | Partial   | A Projection is a headless Program with typed Commands; its lease has no engine primitive, its log order does not survive late rows, and the reverse Scribe feed has N writers (R2-25)                                                                                                                                                                                                                                                 |
| R1-32 | Verified  | One `InstantApps` table; `seq`, actor, host, instance, room through the shared schema; decision 8. (All three targets are Instant Cloud apps, which close on 2027-08-31, R2-08)                                                                                                                                                                                                                                                        |
| R1-33 | Partial   | Sound for Supabase, but the Instant engine keeps the same race (R2-05), and the lock serializes every app's inserts (R2-27)                                                                                                                                                                                                                                                                                                            |
| R1-34 | Verified  | `cleanup.policy=delete`, `retention.ms=-1`, keyed by instance, browsers through a gateway                                                                                                                                                                                                                                                                                                                                              |
| R1-35 | Partial   | `actor` is a sum, but `read_own` hides System rows from the person whose log they are in, and nothing names whose log a row belongs to (R2-09)                                                                                                                                                                                                                                                                                         |
| R1-36 | Partial   | `host`, `instance`, `room` are fields, but `keepsOwnNavigation` still parses the host out of `from` (`packages/foldkit/src/session/session.ts` lines 838 to 841, through `hostOfFrom`'s closed list, which an open host set removes), and plan 02 keeps `ownNavigation: (processorId) => boolean`                                                                                                                                      |
| R1-37 | Partial   | `VendorVault`, `LinkTimedOut`, per-actor erasure added; but the default category makes `LinkBank` Domain (R2-02), the flow cannot survive Plaid's OAuth redirect (R2-12), and erasure misses System rows (R2-09)                                                                                                                                                                                                                       |
| R1-38 | Verified  | Visibility, Activity, TreatAs, Side, and Connection are sums; `Linking.Done` is distinct. (Options still encode account kinds, R2-30)                                                                                                                                                                                                                                                                                                  |
| R1-39 | Partial   | One writer and a `netWorthHistory` field; but the fact freezes `netWorth`, a worker outage leaves gaps, and "one writer" has no primitive (R2-11, R2-25)                                                                                                                                                                                                                                                                               |
| R1-40 | Partial   | A `Capability` sum and named Layers; `needs` is missing from plan 02's declaration and `availabilityOf` cannot see the host (R2-26)                                                                                                                                                                                                                                                                                                    |
| R1-41 | Not fixed | Still four of 74 examples scored; the inventory is deferred to a migration step that relies on a `pnpm foldkit score` command that does not exist yet (the `foldkit` bin has one subcommand, `telemetry`); `examples/counters` is still cited in `AGENTS.md` line 80, `PRINCIPLES.md` line 15, and `glossary.md` line 17                                                                                                               |
| R1-42 | Verified  | `dictate` beside `transcribe` with a reason; `finance` replaces `personal-cfo`; decision 16                                                                                                                                                                                                                                                                                                                                            |
| R1-43 | Verified  | One Model in plan 01a, quoted by plan 01. (Plan 01's tail sample prints a path that Model does not have, R2-14)                                                                                                                                                                                                                                                                                                                        |
| R1-44 | Partial   | One Catalog table; but plan 07's Model (lines 25 to 34) still lacks six of plan 08's fields, so the two plans' answers to "what changes net worth" differ (R2-15)                                                                                                                                                                                                                                                                      |
| R1-45 | Partial   | Action refusals are data; the per-choice sentence the finding cited ("it is already open") is still computed inside `choices` (R2-40)                                                                                                                                                                                                                                                                                                  |
| R1-46 | Verified  | `Schema.toJsonSchemaDocument` (`repos/effect-smol/packages/effect/src/Schema.ts` line 13418) after `Schema.toCodecJson` (line 13470)                                                                                                                                                                                                                                                                                                   |
| R1-47 | Partial   | One decode rule; but the new example row is a `Decrement` at `seq` 41 carrying an id minted at `seq` 41 by the same writer, and the readers are still not run (R2-33)                                                                                                                                                                                                                                                                  |
| R1-48 | Partial   | `Page`, `Link`, `Received`, and `Cursor` fixed; `capabilities.presence` and `presence: NoPresence()` state one fact twice, and `Paging.yes \| Paging.no` is a boolean by another name (plan 06 lines 111 and 115)                                                                                                                                                                                                                      |
| R1-49 | Partial   | `Flag` and `RunIn` are sums; `ActionToken` keeps `tag: S.String` and `segment: S.String`, is spelled two ways across plans 01 and 02, reuses the glossary's deprecated "Token", and the `Identity` snippet is not TypeScript (R2-32, R2-33)                                                                                                                                                                                            |
| R1-50 | Verified  | A build-time manifest serves `help` and `login` (plan 01 lines 100 to 103)                                                                                                                                                                                                                                                                                                                                                             |
| R1-51 | Verified  | The five existing kinds plus `Terminal`, always passed                                                                                                                                                                                                                                                                                                                                                                                 |
| R1-52 | Verified  | Counter's hosts rescored, `rows` a literal key, `MintableId`, `detail` an `Option`, `onDismiss` gone                                                                                                                                                                                                                                                                                                                                   |
| R1-53 | Partial   | Inventory and painters fixed; criterion 1 forbids the `./painters` import the Books window makes (R2-29)                                                                                                                                                                                                                                                                                                                               |
| R1-54 | Partial   | `foldkit/skills`, a version stamp, no hand sections; field descriptions appear in the skill's rubric (line 50) but not in plan 05's (line 194) or `examples/AGENTS.md`; generated skills land in the published plugin tree (R2-37)                                                                                                                                                                                                     |
| R1-55 | Partial   | `Derive.model`, `Projection.define`, and `Mount.selector` defined; new undefined names (`Catalog.entriesAt`, `Navigation.current`, `Offer.allows`, `needs`, `Path.derived`, `Engine.Instant.browser`, `Host.React`), and `Mount.selector` collides with the Mount primitive (R2-32, R2-35)                                                                                                                                             |
| R1-56 | Partial   | Decisions sections, the glossary section, the ADR note, and the path landed; new collisions (Fact, Engine, Offer, viewer) and dependency gaps (R2-35, R2-38)                                                                                                                                                                                                                                                                           |
| R1-57 | Partial   | The skill's list glitch is fixed and Processor capitalized; 18 inline code spans in 8 plans still break across lines (plan 00 lines 63, 74, 90, 173, 181, 202; plan 01 254; plan 02 205, 228; plan 03 10; plan 05 173; plan 06 203, 276; plan 09 35, 42, 129, 176; plan 10 99, each with the next line)                                                                                                                                |
| R1-58 | Verified  | `tsc -p examples/counter/react/tsconfig.json --noEmit` exits 0 with `trial` included; `knip.json` lists `trial/main.tsx` as an entry                                                                                                                                                                                                                                                                                                   |
| R1-59 | Regressed | `useResolvedPath('.')` returns the whole URL inside a splat route in React Router 8.3.0 (R2-19)                                                                                                                                                                                                                                                                                                                                        |
| R1-60 | Verified  | The Access sign-in is marked unverified and gates the adapter (plan 06 lines 214 to 217)                                                                                                                                                                                                                                                                                                                                               |

## New findings

| Id    | Severity | Plan                            | One line                                                                                                 |
| ----- | -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| R2-01 | Blocking | 02, 05, 06, 09                  | Minted ids collide at modest scale, and nothing types a Message before its id is minted                  |
| R2-02 | Blocking | 02, 01a, 08                     | One category per Message cannot protect device-owned fields; the default rule unsyncs unmigrated Actions |
| R2-03 | Blocking | 01                              | Derived liveness never reaches Idle for Books                                                            |
| R2-04 | Major    | 02, 05, 01                      | Placement is measured against the wrong Destination: the open menu, and one navigation for every view    |
| R2-05 | Major    | 06, 09                          | The Instant engine keeps the lost-row race R1-33 fixed for Supabase                                      |
| R2-06 | Major    | 06                              | Instant rooms cannot attest a snapshot offer, so every Instant boot is a cold fold                       |
| R2-07 | Major    | 06                              | The offer's check still compares orders, and an unchecked Model can be acted on                          |
| R2-08 | Major    | 06, README                      | Instant Cloud closes on 2027-08-31, and no plan mentions it                                              |
| R2-09 | Major    | 06, 08                          | Supabase's policies hide System rows from the person whose log they are in                               |
| R2-10 | Major    | 08, 06                          | Finance writes market data from every device onto a log nobody snapshots                                 |
| R2-11 | Major    | 08, `PRINCIPLES.md`             | `ClosedDay` freezes a computed value into the log and has no writer when the worker is down              |
| R2-12 | Major    | 08                              | A device-owned Link flow cannot survive Plaid's OAuth redirect or learn that it finished                 |
| R2-13 | Major    | 07                              | `Update.writes` as written constrains nothing                                                            |
| R2-14 | Major    | 02, 07, 08, 01                  | `Each` cannot find a row's id, and `Path.field(...)` never sees the Model it checks                      |
| R2-15 | Major    | 02, 07, 08                      | Facts cannot declare what they lead to, so the plans' own net worth answers disagree                     |
| R2-16 | Major    | 07, 08                          | `Derive.model` names a result without a mechanism                                                        |
| R2-17 | Major    | 05, skill, `examples/AGENTS.md` | "3 today" contradicts the undated rows and steers new examples onto the id bug                           |
| R2-18 | Major    | 02                              | `Program = Interactive \| Viewer` misses fifteen sites and cannot hold the apps it names                 |
| R2-19 | Major    | 04                              | `FoldkitOutlet` would read the whole URL as its prefix (R1-59 regressed)                                 |
| R2-20 | Major    | 04                              | Leave guards: `useBlocker` needs a data router, and a guarded Sheet needs a second modal                 |
| R2-21 | Major    | 04                              | Inward React Navigation: the North Star throws and the ownership rule has gaps                           |
| R2-22 | Major    | 01, 06                          | A daemon per build lets two daemons hold one App and its microphone (R1-26 regressed)                    |
| R2-23 | Major    | 01, 09                          | One newer row makes every older Processor read-only                                                      |
| R2-24 | Major    | 05                              | `presents` does not say how a local Confirm becomes a logged Domain fact                                 |
| R2-25 | Major    | 06, 08, 01a                     | "Exactly one writer" has no primitive                                                                    |
| R2-26 | Minor    | 02, 10                          | Capabilities are in neither the declaration nor `availabilityOf`                                         |
| R2-27 | Minor    | 06                              | Supabase operating details: lock scope, deadlocks, truncated live rows                                   |
| R2-28 | Minor    | 03                              | `bound.scope(Program)` is ambiguous and cannot scope one row                                             |
| R2-29 | Minor    | 03                              | Plan 03's canonical criteria forbid its own Books window                                                 |
| R2-30 | Minor    | 08                              | Finance Model gaps: Option-encoded kinds, three inputs dropped, Catalog holes                            |
| R2-31 | Minor    | 01a, 08                         | Names against `CLAUDE.md`: Options without `maybe`, facts not verb-first                                 |
| R2-32 | Minor    | 01, 02, 04, 05, 07, 08, 10      | North Star code that does not compile or cannot work                                                     |
| R2-33 | Minor    | 01, 02, 09                      | Protocol leftovers and duplicates                                                                        |
| R2-34 | Minor    | 00, 01, 02, README              | Counts that disagree with the code or with each other                                                    |
| R2-35 | Minor    | glossary, 02, 06, 10            | New vocabulary collides with old                                                                         |
| R2-36 | Minor    | auto-memory                     | The owner-philosophy memory keeps readings round 1 rejected                                              |
| R2-37 | Minor    | 08, `.claude-plugin`            | Generated skills would land in the published plugin's tree                                               |
| R2-38 | Minor    | README                          | Dependencies the README does not list                                                                    |
| R2-39 | Minor    | 02, 03                          | Handles report a kind as a boolean, and the gate is a development-only throw                             |
| R2-40 | Minor    | 02                              | Refusals are only partly data, and only the sender checks them                                           |
| R2-41 | Minor    | 01a                             | Dictation details: ranges as choices, an unclassified search                                             |

## R2-01 | Blocking | Minted ids collide, and nothing types a Message before its id is minted

**Claim.** Plan 02 lines 142 to 150: `mints` fills fields "at send time from
the Processor's identity: `Id.fromMint({ host, instance, seq })`, printed
short in URIs", so "a refold cannot reassign it", and "`update` treats a
second row with a known id as a no-op". Plan 05 lines 110 to 112: ids are
"never reused, and never reassigned by a refold".

**Evidence.**

- `instance` is "eight lowercase hex characters minted per run" (plan 06
  line 93, plan 09 line 93). Every example mints it today as
  `globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 8)`
  (`examples/counter/core/src/startConfig.ts` lines 47 to 51; the same in
  `multiple-counters`, `books`, `read-aloud`, `reminders`): 32 random bits per
  run. A run is every tab load, every daemon start, and every in-process
  command. By the birthday bound, one host repeats some instance with
  probability about 1 percent after 10,000 runs and about 69 percent after
  100,000.
- A repeat means two runs mint the same `(host, instance, seq)` from `seq` 1
  on. Plan 06 enforces `unique (host, instance, seq)` across every app and
  actor in `program_message` (line 176), so the later run's rows fail to
  insert; for minted fields the later `Add({ counterId })` names a counter
  that already exists and "is a no-op". A counter added on a phone silently
  never exists: R1-02's wrong-row class again, now probabilistic and global.
- The check is only "a well-formed minted id" (plan 02 lines 149 to 150).
  Nothing ties the id to the row that carries it, so any writer can mint in
  another writer's namespace.
- `actions.add.press()` (plan 02 line 109) sends a Message without
  `counterId`, and `update` receives one with it. No type names the
  unminted form, and `Catalog.messageFor` (`catalog.ts` line 593, pure today)
  cannot build `Add` without a `seq`. Tests that call `update` directly must
  invent ids; Multiple Counters' `app.test.ts` lines 89 to 99 ("never hands a
  counterId out twice") asserts ids `1` and `3`, which plan 05 lines 81 to 83
  promise to keep.
- Display is undecided. Plan 09 line 68 prints `react-4f2a9c1e-41`; plan 04
  line 213, plan 05 lines 63 and 121, plan 07 line 81, and the new glossary
  entry for Segment ("`CounterIdSegment` prints `3`", `glossary.md` lines 220
  to 222) still print `3`. The Multiple Counters README promises "Counter 3"
  and numbers that are never handed out twice (lines 51 to 53), and
  `CLAUDE.md` line 11 and `AGENTS.md` line 26 make `/counters/counter/c1` the
  canonical example. "Printed short" is lossy unless `parse` consults the
  Model, which would make `parse(print(d)) = d` depend on state.
- The id embeds a per-run Processor id that the glossary keeps "for live
  echo-skip only" (`glossary.md` lines 46 to 48), and it rides in every
  shared link.

**Fix.** Mint 128 bits: a UUIDv7 per minted field, or the row's own `id`,
which is already a UUID (plan 06 line 86). If `(host, instance, seq)` stays a
key, make `instance` 128-bit and scope uniqueness by
`(app, actor, host, instance, seq)`. Check that a minted id names the writing
row. Define `Unminted<M>`, the Message a host presses, and mint in the
runtime's send path behind a `Mint` service with a deterministic test Layer
(`Mint.sequence('t')` giving `t-1`, `t-2`). Separate identity from display:
store a display number or name with the row when it is minted (it may repeat
after two concurrent adds; it never moves), and decide what URIs and CLI
tokens show (question 1).

## R2-02 | Blocking | One category per Message cannot protect device-owned fields

**Claim.** Plan 02 lines 316 to 331: one
`categoryOf: (message) => Domain() | Navigation() | LocalOnly() | DeviceOwned()`,
"derived from writes". Plan 01a lines 119 and 134 to 137: `recorder` and
`permission` "are DeviceOwned (`keepOnRefold`), so they never travel". Plan
08 lines 318 to 320: `linking` is DeviceOwned, "so a Link token never
reaches the log and one device's abandoned flow cannot block another".

**Evidence.**

- Device ownership belongs to fields (`recorder`, `linking`); the category
  belongs to Messages. `Start` writes `recorder` and `sessions` (plan 01a
  line 45) and is logged (plan 01 lines 329 to 332); `LinkBank` writes
  `linking` (plan 08 line 353). Neither writes only `navigation` and neither
  is a declared fact, so by the default rule (plan 02 lines 328 to 331) both
  are Domain.
- A Domain Message from a peer runs the whole `update` on the local Model
  with its Commands dropped (`packages/foldkit/src/program/sync.ts` lines 407
  to 421), and `keepOnRefold` runs only on `LogRefolded` (lines 379 to 391).
  So device B folding A's `Start` shows `Listening` with no microphone, and
  folding A's `LinkBank` shows "a link is already in progress": the R1-37
  symptom, unchanged.
- `HeardPartial` is LocalOnly (plan 01a line 59) but writes
  `sessions[].segments`, a Domain field. Every refold replaces `sessions`,
  so on the recording device the live partial transcript vanishes whenever
  a late row arrives.
- Plan 02 line 176 says `writes` is "`[]` for an Action that only
  navigates", while `Open` writes `navigation` (line 74). "Every write is
  under `navigation`" is true of an empty list, and the migration alias
  `Catalog.action` defaults to `writes: []` (line 358). Unless each Program
  keeps its hand-written classifier through the migration (which the rubric
  scores 1), every not-yet-migrated Action classifies as Navigation and,
  under SharedDomain, stops reaching peers. For the Counter that is
  `Increment` itself.

**Fix.** Declare ownership per field on the Model Schema
(`Domain | DeviceOwned | Navigation`); check at build time that a logged
Message writes only Domain fields; fold every remote Message through the
Domain projection and merge device-owned fields back, not only on a refold.
Split mixed Actions: `Start` is device-owned and returns the Command that
opens the microphone, and `StartedSession({ sessionId })` is the Domain fact.
Never derive Navigation from an empty `writes`, and keep each Program's
existing classifier while the alias exists.

## R2-03 | Blocking | Derived liveness never reaches Idle for Books

**Claim.** Plan 01 goal 3 (lines 30 to 33) and lines 150 to 158: the daemon
stays alive while there is "an active Subscription", among other reasons;
"Subscriptions ... are declared on the Program and gated by the Model, so the
runtime already knows which are active"; and Books' "end when the title
finishes or after ten idle minutes" falls out.

**Evidence.**

- A Subscription is `modelToDependencies` plus `dependenciesToStream`
  (`packages/foldkit/src/subscription/subscription.ts` lines 26 to 47).
  Nothing marks one active or idle; a gated Subscription is only one whose
  stream happens to complete.
- Books declares `shelf` (`examples/books/core/src/subscriptions.ts` lines 65
  to 82), `member` (lines 89 to 103), and `readings` (lines 123 to 129) with
  constant dependencies, and its own doc says the readings arrive "for as long
  as the Program runs" (lines 56 to 57). Those streams never complete, so
  Books' daemon is `Busy` forever and plan 01's Books claim does not hold.
  Any Program with an always-on feed (a shelf, a sign-in state, a live
  query) behaves the same.
- The development guard (lines 165 to 168) rightly refuses one-shot runs of
  such Programs, so the daemon is the only path, and it never idles.

**Fix.** Make live work a declaration: each Subscription and ManagedResource
says `KeepsAlive` or `Observes` (total, `Observes` by default), and liveness
counts only `KeepsAlive` entries, held resources, Commands in flight, pending
writes, and attached views. Books marks `clock` and `transcript`. Add a
conformance case that runs Books' real Subscriptions to `Idle` after
playback ends.

## R2-04 | Major | Placement is measured against the wrong Destination

**Claim.** Plan 02 lines 214 to 222: `availabilityOf(entry, model)` is
`Offer.allows(entry.at, Navigation.current(model))`, else
`Disabled({ because: 'not offered here' })`, and `messageFor`, the daemon,
handles, the menu, and agent tools all go through it.

**Evidence.**

- `Navigation.current` is never defined. The stack's top today is "the
  modal, else the last page" (`navigation/structure.ts` lines 219 to 222),
  and the action menu is "carried as a navigation destination"
  (`actionMenu/actionMenu.ts` line 100; `menuOf` reads it from `topEntry`,
  lines 721 to 729). While the menu is open, every Action chosen from it is
  "not offered here" unless it is declared everywhere.
- Plan 02 places `Add` and `Open` at `[CounterList]` (lines 53 and 65).
  Multiple Counters' test "never stacks one counter page on another" opens
  Counter 2 from Counter 1's page through the menu (`app.test.ts` lines 128
  to 135), and plan 05 lines 81 to 83 keep "every assertion it has today".
  Today `a` adds a counter from any page.
- One daemon holds one Model for every view (plan 01 lines 28 to 29 and
  114). With a TUI on `/counters/1`, `counters add` from a second terminal is
  refused, and an agent tool must first send `Open` or `Back` frames that
  move the screen the person is looking at. ADR 0014's "Safari took over the
  terminal" is the same class of failure.
- The placement sentence comes first, so "not offered here" hides the
  specific one ("answer the delete question first"), and plan 02's North
  Star still hand-writes `Refusal.when(isConfirming, …)` on `Add` and `Open`
  (lines 56 and 75), the rule placement was meant to replace (plan 05 lines
  155 to 159).

**Fix.** Define `Navigation.current` as the topmost Destination that is not
chrome (the menu, a focus overlay). Let a one-shot command or an agent press
carry the address it acts at (`Do({ at: Uri, action })`), checked against
`at` without moving anyone's screen, or give each daemon view its own
navigation. Decide whether `at` gates keys and the menu at all (question 2),
and make `Add` and `Open` match the tests that must stay true.

## R2-05 | Major | The Instant engine keeps the lost-row race R1-33 fixed for Supabase

**Claim.** Plan 06 line 142: Instant's `readSince` is an "offset in
`serverCreatedAt` order (exists)". Plan 09 line 124: "The read position
counts rows in server receipt order (`serverCreatedAt` on Instant, ...)".
Plan 06 lines 338 to 339 require that "Two inserts started in opposite order
and committed in opposite order are both returned by the next `readSince`".

**Evidence.**

- Today's Instant transports page by `offset` with
  `order: { serverCreatedAt: 'asc' }`
  (`packages/instant/src/programLog/programLog.ts` lines 117 to 127) and keep
  the number of rows read as the cursor (`snapshotLog/snapshotLog.ts` lines
  494 to 520).
- Instant's server stamps a triple's `created_at` with
  `current_unix_timestamp_ms()`, defined as
  `EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC') * 1000` (instantdb/instant,
  `server/resources/migrations/08_add_createdAt_for_triples.up.sql`; set on
  insert in `server/src/instant/db/model/triple.clj`). `NOW()` is the
  transaction's start, which is R1-33's `now()` problem: a transaction that
  starts first and commits last sorts behind rows a reader already counted,
  the offset shifts, and the next page returns an already-seen row and never
  the late one.
- The stamp has millisecond resolution and every triple of one transaction
  shares it, so offset paging over a non-unique key can also skip or repeat
  rows at a page boundary.
- Gap detection per `(host, instance)` (plan 06 lines 129 to 130) catches the
  loss only when the same writer writes again.

**Fix.** State that Instant fails the commit-order case as specified. Give
the Instant engine an overlap: re-read from `cursor - K` (or from the last W
seconds of `serverCreatedAt`) and deduplicate by id, with K sized to the
longest commit delay observed. Run the conformance case against Instant
before trusting its cursor.

## R2-06 | Major | Instant rooms cannot attest a snapshot offer, so every Instant boot is a cold fold

**Claim.** Plan 06 line 142 gives Instant "an Instant room with permissions
on `auth.id`", and lines 257 to 261 accept offers only where the transport
"proves the sender is the same actor ... An engine without that proof has
`presence: NoPresence()` and newcomers cold-fold".

**Evidence.**

- Instant's permissions apply to namespaces ("Each top-level key represents
  one of your namespaces", `instantdb.com/docs/permissions.md`, fetched
  2026-10-09), and its presence and topics page describes no access control
  for rooms. The repository relies on unguessable room ids instead: "Joins a
  high-entropy session room without making its presence authoritative"
  (`packages/instant/src/processorRoom/processorRoom.ts` line 50).
- By the plan's own rule, Instant has `NoPresence()`. Every example writes to
  Instant (decision 2) and nothing is saved (plan 06 lines 250 to 251), so
  every boot of every example is a cold fold: about 900 ms and 1.5 MB for the
  Counter's log in ADR 0013, more for larger logs (R2-10). README decision 6
  offers "none" as one of two choices, while on Instant it is the cost of
  every boot unless a cache is kept.

**Fix.** Say it in plan 06 and in decision 6. If offers on Instant matter,
attest them without room permissions: sign offers with a key only the
actor's devices hold, or relay them through a server that checks the
session. Otherwise drop Instant from the presence column.

## R2-07 | Major | The offer's check still compares orders, and an unchecked Model can be acted on

**Claim.** Plan 06 step 5 (lines 266 to 272): the requester "reads the
receipt-ordered prefix's ids up to the watermark's position and compares
count and fingerprint ... It paints the offered Model at once as `Ready`,
then refolds ... A hostile offer is therefore visible for at most one
refold." Step 7 (lines 275 to 277): watermarks and cursors "are never
compared to each other".

**Evidence.**

- The watermark's position is a fold-order position (ADR 0013 Decision 4;
  plan 06 lines 276 to 277). A "receipt-ordered prefix up to" it is the
  comparison step 7 forbids. A correct check needs every row's order key:
  the cold fold's download without payloads.
- The row-set check proves which rows the offerer claims, not that `model`
  is their fold (R1-03's second point). A buggy peer with a correct
  watermark passes, its Model is painted `Ready`, and Actions pressed
  meanwhile become Domain rows chosen from a wrong Model. The refold
  replaces the Model; it does not remove those rows.
- Any settled peer of the actor answers (step 2), so every one of them does,
  each with the whole Model. Supabase
  Broadcast caps a payload at 256 KB on Free and 3,000 KB on Pro
  (`supabase.com/docs/guides/realtime/quotas`, fetched 2026-10-09); a finance
  Model with positions, quotes, and history, or a dictation Model with every
  session's words, can exceed that.
- The offerer must send "the fold of a Processor that wrote none of the
  rows" (step 4) with nothing saved: a full refold on the offering device per
  request. Plan 02 line 321 declares `projectDomain: (model) => DomainModel`,
  which no step uses.

**Fix.** Check the row set in fold order; keep the requester read-only
(Actions refused with a sentence such as "checking this device's copy") until
its own fold agrees; let one peer answer (the smallest instance, say); cap or
chunk the offer; recompute derived fields on accept; say where the offerer's
fold comes from.

## R2-08 | Major | Instant Cloud closes on 2027-08-31, and no plan mentions it

**Claim.** Plan 06 decision 2 (lines 367 to 369) and README decision 8 (lines
82 to 84) choose among `bd40c50a`, `e7c49961`, and `5417c2e3`; the Supabase
adapter stays design-only, after the identity spike, near the end of plan
06's migration (line 356).

**Evidence.** Instant's announcement in its repository
(`client/www/_posts/instant_team_joins_openai.md`): "On August 31st, 2027,
all cloud apps will shut down." The owner's project memory records the same
date and a plan to move every app on `e7c49961` and `bd40c50a` to
self-hosted Instant by Q1 2027 (report at
`~/Sync/audit/instant-self-hosting-2026-10-04.md`). All three targets the
plans offer are Instant Cloud apps; no plan names self-hosted Instant, and
the owner's "Super Base should work as well as InstantDB" now has a date.

**Fix.** Name the shutdown in plan 06 and the README; add self-hosted Instant
(its base URL in `InstantApps`) to decision 8; decide whether
`@foldkit/supabase` moves from design to build before the cut-over; confirm
that self-hosted Instant has the same `serverCreatedAt` and room behavior
(it is the same source, R2-05 and R2-06).

## R2-09 | Major | Supabase's policies hide System rows from the person whose log they are in

**Claim.** Plan 06 lines 192 to 198: `read_own` requires
`actor_kind = 'authenticated' and actor_id = auth.uid()::text`, and System
rows come from the worker's service role. Plan 08 lines 386 to 399: webhook
facts and `ClosedDay` are System rows in "a person's log", and erasure
deletes "their rows".

**Evidence.**

- A row the worker writes for a person has `actor_kind = 'system'`, so
  neither `read_own` nor `read_public` (lines 194 to 195; finance is not a
  public app) lets that person read it. Every device misses
  `ConnectionExpired`, the daily close, and any webhook-fed balance.
- Nothing in the envelope says whose log a row is in. Plan 06 lines 155 to
  156 map Scribe's `ownerUserID` to the Authenticated actor, which conflates
  owner and writer, so a System row has no owner on Instant either.
- Gaps are detected per `(host, instance)` (plan 06 lines 95 and 129 to 130).
  One worker instance writes for many people, so each person sees a sparse
  subset of its `seq`; the check finds gaps that never fill and reads
  forever.
- `read_public` returns every row of a public app, including `Mine` and
  `Share` rooms, which today are filtered only on the client
  (`packages/instant/src/sync/fromTransport.ts` lines 47 to 68).
- Per-actor erasure (plan 08 lines 397 to 399) misses System rows, which hold
  a person's daily net worth. On Kafka with `retention.ms=-1`, keyed by
  instance (plan 06 line 144), no per-person deletion exists.

**Fix.** Add `owner` to the envelope (whose log: a person, public, or a
shared room) beside `actor` (who wrote it); write the policies on `owner_id`
and `room`; give each writer a `seq` per owner stream, or detect gaps only
among rows a reader can see; erase by owner; for Kafka, crypto-shred or keep
personal data off it.

## R2-10 | Major | Finance writes market data from every device onto a log nobody snapshots

**Claim.** Plan 08 lines 139 to 150 and 389 to 392: refresh cadence (token
prices every 2 minutes, quotes every 15 minutes in market hours, balances
when older than 2 hours) is "a Subscription gated by `Syncing` and by
staleness", and each result is a fact. Principle 7 (`PRINCIPLES.md` lines
149 to 151): every value is "folded from it on every device".

**Evidence.**

- A Subscription runs on every device and in every daemon, so each one calls
  Plaid and SnapTrade on the same schedule and logs its own
  `RefreshedBalances`: R1-39's N-writer problem, fixed only for `ClosedDay`.
  Plaid bills its Balance product per request (from my knowledge of Plaid's
  pricing, not verified here), and every extra call counts against rate
  limits.
- A token price every 2 minutes is 720 rows a day per writer. With nothing
  saved (plan 06 lines 250 to 251) a cold boot folds every row since the
  first day; the Counter's 3,000 rows already cost 900 ms and 1.5 MB (ADR
  0013). Plan 06 decision 1 prices "none" with the Counter's numbers only.

**Fix.** Choose per input: market data local to each device with
`freshness` (devices may disagree for minutes), or written by the single
worker alone; give finance its own compaction or snapshot decision; state its
boot cost in decision 6.

## R2-11 | Major | `ClosedDay` freezes a computed value into the log and has no writer when the worker is down

**Claim.** Plan 08 lines 393 to 396: the worker emits
`ClosedDay({ day, zone, netWorth })` once per calendar day "in the person's
declared zone", and `update` appends it once and ignores a second.

**Evidence.**

- `netWorth` in the fact is a stored computed value, which principle 7 rules
  out ("Nobody writes ... a read model to keep a computed value in step";
  Smell: "a table column holding a value the Model derives",
  `PRINCIPLES.md` lines 151 to 152 and 167 to 168). A late row stamped before
  the day's end changes that day's fold on every device but not the frozen
  number; a new `netWorthOf` changes today's figure and none of history. The
  drift principle 7 exists to end comes back, spread over time.
- If the worker is down at midnight, no row is written and the series has a
  gap; no plan says the worker backfills on restart.
- "One writer" has no mechanism. The worker runs the same App, so a
  Subscription that emits `ClosedDay` runs on every device too unless
  something gates it (R2-25).
- `Fields` (lines 268 to 283) has no declared time zone.

**Fix.** `ClosedDay({ day, zone })` only, with `update` recording
`netWorthOf(model)` at that point of the fold, so a refold or a new formula
recomputes history; the worker emits every missing day when it starts; a
`timeZone` field; one single-writer primitive (R2-25).

## R2-12 | Major | A device-owned Link flow cannot survive Plaid's OAuth redirect or learn that it finished

**Claim.** Plan 08 lines 257 to 266 and 316 to 320: `Linking` is
DeviceOwned, holds `AtProvider({ provider, token, since })`, and "never
reaches the log".

**Evidence.**

- For OAuth institutions on the web, Plaid sends the page to the bank and
  back to a redirect URI, after which Link must be reopened with the same
  link token and the received redirect URI; Plaid suggests keeping the token
  in local storage across the redirect (from my knowledge of Plaid's OAuth
  guide, not fetched here). With `linking` device-owned and nothing saved,
  the returning page starts at `Idle` with no token.
- SnapTrade's connection portal and Plaid's hosted flows can finish in
  another tab, process, or device, and completion reaches the server as a
  webhook (also from my knowledge of both vendors' documentation). The
  worker's `LinkedInstitution` carries nothing that says which device's flow
  it ends, so device A stays `AtProvider` until `LinkTimedOut`.
- The exchange has no declaration: `Exchanging` (line 262) has no writer, no
  fact carries the public token, and `LinkBank`, `LinkBrokerage`, and
  `Reconnect` produce only token facts (lines 353 to 355). The public token is
  a short-lived credential, so the fact that carries it must be LocalOnly.
- Under the default category, `LinkBank` is Domain (R2-02).

**Fix.** Mint a `linkSessionId` at `LinkBank` and carry it through
`ReceivedPublicToken` (LocalOnly), the `ExchangePublicToken` Command, and the
Domain `LinkedInstitution({ linkSessionId, … })`, so each device recognizes
its own flow; decide how the token survives a redirect (question 8).

## R2-13 | Major | `Update.writes` as written constrains nothing

**Claim.** Plan 07 lines 140 to 151:
`Add: Update.writes([Path.field('counters')], (model, { counterId }) => evo(model, { counters: Array.append(model.counters, rowOf(counterId)) }))`,
so "an update arm can write only what it declared", and "nested paths narrow
the nested evolver".

**Evidence.**

- Foldkit's `evo` takes a function per key, `(a: O[K]) => O[K]`
  (`packages/foldkit/src/struct/index.ts` lines 3 to 5 and 25 to 33).
  `Array.append(model.counters, rowOf(counterId))` is an array, so the
  example does not compile; the data-last `Array.append(rowOf(counterId))`
  would.
- The arm calls the module-level `evo` and returns `Model`. The helper never
  sees that call, and `return { ...model, navigation }` type-checks inside
  it.
- The arm repeats `[Path.field('counters')]`, a second copy of `Add.writes`
  (plan 02 line 55). The type checker would guard the arm's copy while the
  graph reads the declaration's.
- An evolver for an `Each` path is a function from rows to rows; its type
  cannot stop it from adding, dropping, or reordering rows, so
  `counters[].title` cannot be enforced through the evolver's type, and
  `Variant` and `Present` paths need narrowing combinators no plan defines.

**Fix.** What TypeScript can express:
`Update.writes(Add, (model, message, evolve) => evolve({ counters: Array.append(rowOf(message.counterId)) }))`,
where `Add` supplies the paths, `evolve` is `evo` over `Pick<Model, Heads>`
with `evo`'s `StrictKeys`, and the arm returns an opaque `Written<Heads>` so a
raw Model or a spread does not type-check; per-row writes go through
`evolve.row('counters', id, rowEvolve)`. Ask decision 10 with that shape and
its limits.

## R2-14 | Major | `Each` cannot find a row's id, and `Path.field(...)` never sees the Model it checks

**Claim.** Plan 02 lines 195 to 210: `Each({ then })` is "every row of an
Array, keyed by the row's id", and `Path.field('counters').each().field('title')`
"builds one from the Model Schema, so an unknown name fails to compile".

**Evidence.**

- `Each` carries no key, and a Schema does not say which field is an id. The
  plans' own arrays do not have one: a `Position` is identified by
  `accountId` and `security`, an `ExchangeRate` by `from` and `to`, a `Quote`
  by `security`, a `SpotPrice` by `metal`, a `DayClose` by `day` (plan 08
  lines 195 to 255); `speakers` and each segment's `words` (plan 01a lines 93
  to 115) have none at all.
- `Path.field('counters')` takes no Model. In a call chain only the outermost
  call is contextually typed, so the first segment cannot be checked against
  anything.
- Plan 07 line 63 uses `Path.derived('netWorth')`, which is not a member of
  the ADT, and `Derive.from` takes string arrays (plan 07 line 37, plan 08
  lines 286 to 312), while plan 07 line 122 says strings appear only when
  printed.
- Plan 02's `Rename` writes `counters[].title` (line 87), but `forEach` rows
  are `{ id, child }` (`packages/foldkit/src/program/compose.ts`, the `Row`
  Schema at lines 513 to 516), and plan 05 derives a row's title from its id
  (line 36). Plan 01's tail sample prints `segments[s-0a1f]` (lines 263 to 266) for segments that
  live in `sessions[].segments`, and `recorder.level` crosses a `Variant`
  the printer must name.

**Fix.** `Each({ key, then })` with composite keys and an index fallback
marked as such; the key declared once, on the array Schema or by `forEach`; a
Model-anchored builder (`const path = Path.of(Model)`); `Derived({ name })`
in the ADT; `Derive.from` over `ModelPath` values; a tail sample generated
from the Model.

## R2-15 | Major | Facts cannot declare what they lead to, so the plans' own net worth answers disagree

**Claim.** Plan 07 lines 73 to 79 and 88 to 90, and plan 08 lines 111 to 113:
`LinkBank` changes net worth "through" `LinkedInstitution`.

**Evidence.**

- `LinkBank` declares `produces: [SucceededCreateLinkToken, FailedCreateLinkToken]`
  (plan 07 line 48; plan 08 line 353). The chain to `LinkedInstitution` runs
  through facts (the token, the person finishing Link, the public token, the
  exchange), and `Fact.define` takes `{ what, fields, writes, category }`
  with no `produces` (plan 02 line 154). By the plans' own declarations the
  edge does not exist.
- `leadsTo` is required and tested by plan 07 (lines 16, 49, 103, 160) but
  absent from plan 02's declaration (lines 166 to 179).
- `FailedRefresh` writes `freshness` (plan 08 lines 371 to 372), a derived
  field plan 07 lines 174 to 175 reject.
- Plan 07's Model (lines 25 to 34) still lacks `baseCurrency`,
  `institutions`, `tokens`, `tokenPrices`, `spotPrices`, and
  `netWorthHistory`, though line 90 says `LinkedInstitution` writes
  `institutions`; its answer (lines 75 to 76) omits the token and spot facts
  plan 08 lists. Plan 08's sample skill, presented as generated, omits
  `baseCurrency`, `RefreshedTokens`, and `TreatAsCash` although its
  `Derive.from` reads those fields (lines 286 to 299 and 359): the hand-kept
  sample already drifts from its own Model.

**Fix.** `produces` on facts and `whatWrites` as a transitive closure over
Produces edges; `leadsTo` in plan 02; one finance Model that plan 07 quotes;
generate the sample skill from the declarations it shows, or mark it
illustrative and fix the three omissions.

## R2-16 | Major | `Derive.model` names a result without a mechanism

**Claim.** Plan 07 lines 36 to 39 and 167 to 175: `Derive.model(Fields, { ... })`
"annotates the Schema with computed fields and their inputs"; plan 08 lines
285 to 313 derive `netWorth` and `freshness` that way.

**Evidence.** An annotation computes nothing. `update` returns Model values
that never pass through a Schema decode, so a decode-time transformation
would leave `netWorth` stale after every update. Recomputing after `update`
in the runtime makes the value `update` returns stale in every test that
calls it, and `evo(model, { netWorth: … })` stays possible outside
`Update.writes`. A peer offer (R2-07) carries a `netWorth` the row-set check
never verifies. `Derive.from` lists whole top-level fields, so the graph
counts every writer of any account field, a rename included, as changing net
worth: sound, but coarser than the owner's question.

**Fix.** Say where the value lives: stored fields are `Fields`; derived
fields are a memoized view the runtime computes after each fold step and
before each paint, readable by painters and refusals, never written by
`update`; tests call `Derive.of(Model)(fields)`; an accepted offer recomputes
them; inputs are `ModelPath`s, not whole fields.

## R2-17 | Major | "3 today" contradicts the undated rows and steers new examples onto the id bug

**Claim.** Plan 05 lines 186 to 197, `skills/foldkit-composition/SKILL.md`
lines 41 to 53, and `examples/AGENTS.md` lines 170 to 179: "3 today" is "what
the current APIs can meet" and the gate for a new example; rows 2 and 1 carry
no date.

**Evidence.**

- "3 today" accepts "Lists use `compose.forEach`", and today's `forEach`
  mints ids in `update` from `nextId` (`packages/foldkit/src/program/compose.ts`
  lines 624 to 631). Row 1 scores "ids minted in `update`" a 1, and the
  skill's workflow says "Never mint an id in `update`" (line 87). The skill's
  table calls `forEach` rows "identified by a branded id" (line 21); they are
  `id: S.String` (compose.ts line 514).
- `ProgramSynchronization.messageCategory` is required
  (`packages/foldkit/src/program/program.ts` line 63), so every synced Program
  writes a classifier (the Counter's `messageCategory: () => 'Domain'`,
  Multiple Counters' ten-arm match). "3 today" allows it; row 1 and the
  skill's invariant (lines 100 to 101) call it hand rolling.
- No Action navigates declaratively today. Multiple Counters edits the stack
  with `Navigation.pushed` and `withoutDestinations`
  (`examples/multiple-counters/core/src/update.ts` lines 51 to 99), and row
  1's "stack edits in `update`" therefore scores every example with a page or
  a dialog 1.
- `Catalog.entries` returns every entry, so a screen that shows different
  Actions per page has only tag filtering
  (`examples/multiple-counters/core/src/screen.ts` lines 18 to 22, 67, 91 to
  93, 138 to 141).
- Row 2's "one `Catalog.action` not yet migrated to a kind" is true of every
  Action today.
- So no new example with a list, a detail page, or a dialog can pass the
  gate. The merge block R1-08 removed for existing examples returns for every
  new one.

**Fix.** Date every row. In "3 today", allow the required classifier and
stack edits through `Navigation.pushed` and `presented`, name the mechanism a
screen should use to pick its Actions (per-screen sub-catalogs built with
`Catalog.make`, if that is the intent), and require ids carried in payloads
from a minting Command, never from `forEach`'s `nextId`.

## R2-18 | Major | `Program = Interactive | Viewer` misses fifteen sites and cannot hold the apps it names

**Claim.** Plan 02 lines 297 to 312: of 40 `Program.make` sites, 20 declare no
catalog, and "each migrates to one of the two constructors in its own
commit".

**Evidence.**

- `grep -rln "Program\.make\b" examples packages`, without tests and `dist`,
  finds 41 files. Five examples mention a catalog at all (`books`, `counter`,
  `multiple-counters`, `read-aloud`, `reminders`), plus the React test fixture
  `packages/react/src/test/routedCounter.ts`; the other 35 do not, and 8 of
  them list their presses through the deprecated `valid`
  (`examples/settings/core/src/program.ts` line 62,
  `examples/casino/core/src/program.ts` line 61).
- "A tag in neither [the Catalog nor the declared facts] does not exist"
  (plan 02 lines 160 to 161). A Viewer therefore cannot have buttons, so most
  of the 35 must become `Interactive` with a full Catalog (`what`, `why`,
  `label`, `at`, `writes`, `refusals`, `produces` per Action): a rewrite per
  app, not a constructor swap.
- `ActionMenu.compose` adds Actions, so every composed Viewer becomes
  Interactive; the kind does not survive composition.
- `S.Union([Interactive({ catalog, screen, ... }), ...])` puts functions in a
  Schema, which plan 01 line 285 rules out for `Identity` for the same reason.
- Plan 10 lines 33 to 34 and 55 use "viewer" for a host that lacks a
  capability and runs the same Interactive Program.

**Fix.** Recount and size the migration per app. Prefer one Program record
with a total `catalog` (possibly `Catalog.none`) and declared facts over a
two-kind union, or rename the kind so it does not collide with plan 10's
viewer hosts.

## R2-19 | Major | `FoldkitOutlet` would read the whole URL as its prefix (R1-59 regressed)

**Claim.** Plan 04 lines 145 to 150: `FoldkitOutlet` "reads its prefix from
the matched route (`useResolvedPath('.')`)" inside
`<Route path="/legacy/counter/*">` (lines 50 to 57).

**Evidence.** In React Router 8.3.0, `useResolvedPath` resolves against
`getResolveToMatches(matches)`
(`packages/react/node_modules/react-router/dist/development/lib/hooks.js`
lines 529 to 538), which takes the leaf match's full `pathname`, splat
included (`lib/router/utils.js` lines 591 to 594:
`idx === pathMatches.length - 1 ? match.pathname : match.pathnameBase`). At
`/legacy/counter/counter/session`, `useResolvedPath('.')` returns
`/legacy/counter/counter/session`; stripping that leaves the Program at its
root on every address.

**Fix.** Prefix = `useLocation().pathname` minus `useParams()['*']`, which
works outside data routers, with tests at `/legacy/counter`,
`/legacy/counter/`, and a nested splat.

## R2-20 | Major | Leave guards: `useBlocker` needs a data router, and a guarded Sheet needs a second modal

**Claim.** Plan 04 lines 128 to 138 and 224 to 230: "React Router's
`useBlocker` and React Navigation's `beforeRemove` are the carriers' ways to
hold the native pop until the Program answers", and a guard turns "a pop or a
tab switch into a presented question".

**Evidence.**

- `useBlocker` calls `useDataRouterContext("useBlocker")`, which throws
  "useBlocker must be used within a data router" (React Router 8.3.0
  `lib/hooks.js` lines 814 to 819 and 1247 to 1248). `FoldkitRouter` renders a
  plain `<Router location navigator>`
  (`packages/react/src/reactRouter/reactRouter.tsx` line 160), and the inward
  North Star uses `<BrowserRouter>`; neither is a data router.
- On the web, `popstate` fires after history has moved, so a carrier can only
  restore the address and then ask.
- An edit form presented as a Sheet, such as plan 04's own `AccountEditor`
  (lines 122 to 125), is the common case for a guard. Its question would be a
  second modal,
  which `NavigationStack` cannot hold (one `maybeModal`,
  `navigation/structure.ts` lines 110 to 136) and plan 04 keeps
  unrepresentable (lines 211 to 212).
- Whether React Navigation's native stack can hold an iOS swipe-back through
  `beforeRemove` depends on its version (not verified here).

**Fix.** A carrier-level guard that restores the address and reports the
attempt as a Message; the question as feature state of the guarded screen
(`Leaving = Editing | Asking`), painted by that screen rather than as a modal;
a native-stack check before naming `beforeRemove`.

## R2-21 | Major | Inward React Navigation: the North Star throws and the ownership rule has gaps

**Claim.** Plan 04 lines 80 to 86 and 154 to 161: `{foldkitScreens(Stack, counter)}`
returns "a `<Stack.Group>` with one keyed screen per plan entry", and "the
host owns the routes below the mount, the Model owns the routes from the
mount up".

**Evidence.**

- Line 83 is `{foldkitScreens(Stack, counter)}{' '}`. `@react-navigation/core`
  7.21.11 builds route configs from `React.Children.toArray(children)` and
  throws on any child that is not a `Screen`, a `Group`, or a fragment
  (`lib/module/useNavigationBuilder.js` lines 57 to 95), so the string `' '`
  throws "A navigator can only contain 'Screen', 'Group' or 'React.Fragment'
  as its direct children (found ' ')".
- `FoldkitStack` declares one screen name and many keyed routes
  (`packages/react-native/src/reactNavigation/foldkitStack.tsx` lines 79 to
  83), not a screen per entry. Two Programs mounted in one host navigator
  would both declare `entryRouteName`.
- A host screen pushed above a Program screen (a notification or a deep link
  into a host page) is neither below the mount nor the Program's; the suffix
  driver's next write would erase or reorder it.

**Fix.** Remove `{' '}`; name the route per Program; state what the driver
does with host routes above the suffix (keep them above, or refuse host
pushes over the mount) and test both.

## R2-22 | Major | A daemon per build lets two daemons hold one App and its microphone (R1-26 regressed)

**Claim.** Plan 01 lines 114 to 122: socket
`${tmpdir}/fk-<digest of app, engine key, protocol, build>.sock`, with lock,
pid, and log in a state directory keyed by app and engine; lines 241 to 246:
a build mismatch answers `Refusing`.

**Evidence.**

- A view from a new build computes a different socket and never reaches the
  old daemon, so the handshake never meets a build mismatch. While Dictate is
  `Listening`, the old daemon is `Busy` and keeps the microphone, and
  `dictate stop` from the new build reaches a new, idle daemon. Both append
  the same Local NDJSON log (plan 06 lines 232 to 234), and the second
  overwrites the first's pid file.
- The engine comes from `FOLDKIT_ENGINE` at run time (plan 06 line 50) with no
  stated default, so `dictate start` under two environments starts two
  daemons that both want the microphone.
- On Linux `os.tmpdir()` is a shared `/tmp`, and the digest omits the OS user
  and the actor that decision 1 (lines 374 to 377) keys the daemon on.
  Today's helper digests a program id and an isolation key into
  `/tmp/fkc-<12 hex>.sock` (`packages/foldkit/src/cli/paths.ts` lines 7 to
  27).

**Fix.** Key the socket and lock by `(app, engine, OS user, actor)` only and
carry the build in `Hello`; a newer view gets `Refusing` with "stop the
recording, then `dictate daemon restart`", and `restart` hands over. Hold one
exclusive lock per device-exclusive resource (the microphone) across daemons.
Give `FOLDKIT_ENGINE` a default and print the chosen engine in
`daemon status`.

## R2-23 | Major | One newer row makes every older Processor read-only

**Claim.** Plan 09 lines 131 to 134 and plan 01 lines 244 to 246: "A
Processor that sees a row with a newer `programVersion` than its own becomes
read-only and refuses Actions until upgraded."

**Evidence.** One Instant project carries every app (`AGENTS.md` line 61),
and examples write to the shared dev app (plan 06 decision 2). A developer
running a branch at version N+1 against it, or a release rolled back after
one write, leaves a newer row on the log, and every Processor at version N
refuses every Action from then on. ADR 0013 Decision 7 already handles the
real hazard: a newer row that does not decode is skipped.

**Fix.** Go read-only only when a newer row fails to decode, or when a
deliberate `RetiredVersion({ below })` fact says so; keep folding and writing
while newer rows decode.

## R2-24 | Major | `presents` does not say how a local Confirm becomes a logged Domain fact

**Claim.** Plan 05 lines 136 to 154: the child's Model is navigation-local,
and its OutMessage "is turned into a self-contained Domain fact
(`DeletedCounter({ counterId })`) that every device folds".

**Evidence.**

- The child's `Confirm` writes the child's Model, so it is Navigation and,
  under SharedDomain, never reaches peers. The Domain fact must be a separate
  logged Message, and `update` can produce one only through a Command: two
  log entries, and a moment in which the dialog has closed and the counter is
  still there. No plan shows that Command.
- Line 141 maps `outMessage => DeletedCounter({ counterId })` with
  `counterId` unbound; the North Star (lines 46 to 52) has no `style`, which
  the combinator section has (line 139); `ConfirmDelete` names the child
  Program (line 48) and a parent Action (line 61); `Cancel` (lines 73 and 77)
  and `CancelDelete` (line 61) name one Action.
- Under Mirror, device B folds A's `Delete`, presents the question, and runs
  the child's `init`, but Commands from remote Messages are dropped
  (`packages/foldkit/src/program/sync.ts` lines 407 to 421), so a child whose
  `init` returns Commands is half-initialized on B.

**Fix.** Specify the emission (`presents` returns a Command that succeeds with
the fact), the two entries, and what a remote device does with the child's
`init`; keep one North Star.

## R2-25 | Major | "Exactly one writer" has no primitive

**Claim.** Plan 06 lines 305 to 307: a Projection runner "holds a lease per
projection (a `Lease` row on the engine)" and "records the cursor it
reached". Plan 08 lines 386 to 396: one worker writes webhooks and
`ClosedDay`. Plan 01a lines 165 to 167: a Scribe recording reaches `dictate`
through "a read Subscription over Scribe's entities, declared as facts".

**Evidence.**

- `LogEngine` is `append`, `readSince`, `live`, and `presence` (plan 06 lines
  109 to 116): append-only, with no lease and no mutable row. Kafka has no
  row to lease.
- A Projection "folds Domain facts in log order" (line 287) but receives them
  in receipt order and resumes from a receipt cursor. A late row means the
  writes it already issued to Scribe's tables went out of fold order, and a
  refold re-issues every write since: idempotent upserts converge, uploads
  and deletes do not.
- The read Subscription over Scribe's entities runs on every device, so each
  emits the same facts: the N-writer problem R1-39 named.

**Fix.** One primitive used by Projections, the worker, and imports: an
engine lease capability, or a server-hosted Processor role that a Program
can gate Subscriptions on. A refold policy for Projections (apply only facts
older than a settling window, or compensate).

## R2-26 | Minor | Capabilities are in neither the declaration nor `availabilityOf`

**Evidence.** Plan 10 lines 29 to 32 refuse an Action whose declaration
`needs` a capability; plan 02's `ActionDeclaration` (lines 166 to 179) has no
`needs`, and `availabilityOf(entry, model)` (lines 214 to 218) takes no host.
Effect requires every service a Command uses to be provided, so a "viewer"
host (plan 10 line 55) must provide a stub Layer for each missing service,
which no plan shows. Plan 10 line 60 says `SpeechRecognizer` where plans 01
and 01a say `Recognizer`.

**Fix.** `needs: ReadonlyArray<Capability>` in plan 02;
`availabilityOf(entry, model, capabilities)`; an `Unavailable` Layer per
service tag; one name for the recognizer.

## R2-27 | Minor | Supabase operating details: lock scope, deadlocks, truncated live rows

**Evidence.**

- The trigger locks one key for every app and actor
  (`hashtext('program_message')`, plan 06 line 184), so every insert in the
  project commits one at a time. Readers read one app, so a key per app
  (`pg_advisory_xact_lock(hashtext('program_message'), hashtext(new.app))`)
  keeps the guarantee with less contention. A transaction-level lock
  releases at commit, so Supavisor's transaction pooling is safe; but a
  multi-statement transaction that inserts a row and then updates the vault
  can deadlock with one that does the reverse, so inserts should be single
  statements.
- Postgres Changes truncates a record over 1,024 KB to its fields of 64 bytes
  or less, processes changes on one thread, and checks authorization once per
  subscriber (`supabase.com/docs/guides/realtime/quotas` and
  `.../postgres-changes`, fetched 2026-10-09). A large `payload` arrives
  without it, and plan 09 lines 106 to 110 would skip that row as
  undecodable.
- "A unique violation on `id` is `Delivered`" (line 201) must check the
  constraint's name, since `(host, instance, seq)` is unique too (R2-01).
- What does hold: Realtime Authorization works as plan 06 says (private
  channels opened with `private: true`, policies on `realtime.messages`,
  `realtime.topic()`, and `auth.uid()`;
  `supabase.com/docs/guides/realtime/authorization`, fetched 2026-10-09).
  The trigger's ordering argument also holds, from my knowledge of Postgres
  rather than a run: `pg_advisory_xact_lock` is held until commit or
  rollback, and a committing transaction becomes visible before it releases
  its locks, so positions become visible in lock order.

**Fix.** A per-app lock key; single-statement inserts; a live row that fails
to decode triggers a read instead of a skip; match unique violations by
constraint.

## R2-28 | Minor | `bound.scope(Program)` is ambiguous and cannot scope one row

**Evidence.** Plan 03 lines 80 to 83 resolve `useFeature(Counters)` "by
composition path" but take only a Program. A Program composed twice has two
slices; the glossary's Mount path exists for exactly that ("Disambiguates
the same Program mounted twice", `glossary.md` lines 115 to 117). There is no
row scope like TCA's `store.scope(state: \.rows[id:])`, so the escape-hatch
row (lines 55 to 74) must know Multiple Counters' Model
(`countOf(model, counterId)`) instead of reusing the Counter's own
component.

**Fix.** `bound.scope(mountPath)`, with a row path such as
`Counters.row(counterId)`.

## R2-29 | Minor | Plan 03's canonical criteria forbid its own Books window

**Evidence.** Criterion 1 (line 167) allows imports only from
`@foldkit/react` and React; the Books window imports `booksPainters` from
`./painters` (lines 103 and 112 to 117). `GoogleBooksPreview` moves to
`examples/read-aloud/react/src/painters.tsx` (line 157) while Books' painters
use the same component, so one example would import another's host file or
copy it.

**Fix.** Allow `./painters` by name; put a painter two apps share in a
package.

## R2-30 | Minor | Finance Model gaps: Option-encoded kinds, three inputs dropped, Catalog holes

**Evidence.**

- Options encode kinds: `Account.institutionId`, `available`, and `margin`
  (plan 08 lines 185, 188, 189) vary with `kind`, so a credit account with a
  margin is representable; `Token.accountId` (line 213) encodes wallet versus
  exchange.
- The inventory the owner asked for
  (`~/Sync/audit/finance-net-worth-inputs-2026-10-09/net-worth-inputs.html`)
  lists 46 inputs. Plan 08 groups them in ten rows (lines 139 to 150) with no
  mapping, and three of the inventory's "missing everywhere" inputs (M6
  accrued interest on debts, M7 pending transactions, M8 deferred taxes) have
  no field and no decision.
- `TreatAs` has two values and only `TreatAsCash`; there is no `RemoveDebt`;
  nothing writes `baseCurrency`; a `transactions` tab (line 404) has no data;
  `/finance/assets/{category}` (lines 406 to 407) leaves `AssetDetail`, where
  `EditAsset` and `RemoveAsset` are offered (lines 361 to 362), without a
  route.

**Fix.** `source: Linked({ institutionId }) | Manual()` and per-kind
balances; map the 46 inputs to fields or to recorded out-of-scope decisions;
complete the Catalog.

## R2-31 | Minor | Names against `CLAUDE.md`: Options without `maybe`, facts not verb-first

**Evidence.** "Prefix `Option`-typed values with `maybe`": `Listening.gap`
(plan 01a line 76), `institutionId`, `available`, `margin` (plan 08 lines
185, 188, 189), `institutionValue` (line 201), `accountId` (line 213).
"Messages are verb-first, past-tense facts": `MicrophoneSilent`,
`CaptureGapOpened`, `CaptureGapClosed`, `PermissionAnswered` (plan 01a lines
59 to 62), `LinkTimedOut`, `ConnectionExpired`, `ConnectionBroken`,
`SyncStarted`, `SyncFinished` (plan 08 lines 368 to 374).

**Fix.** `maybeGap`, `maybeInstitutionId`, and so on; `OpenedCaptureGap`,
`AnsweredPermission`, `TimedOutLink`, `StartedSync`, and so on.

## R2-32 | Minor | North Star code that does not compile or cannot work

**Evidence.**

- Plan 01 lines 279 to 283 write `Identity` as a type built from constructor
  calls.
- Plan 02 lines 298 to 301 put function-bearing members in `S.Union`.
- Plan 07 line 142 passes an array to `evo` (R2-13).
- Plan 10 line 118 assigns `{ name: 'ink', … }` to `Host`, a plain string
  where a branded `HostName` goes, which `CLAUDE.md`'s "Use callable
  constructors" rules out; plans 06 line 45 and 10 line 80 use `Host.React`
  and `Host.Foldkit` as members of a `Host` that is a Struct Schema with no
  registry.
- Plan 04 lines 122 to 124 compute `title: ({ accountId }) => accountName(accountId)`
  with no Model to read the name from; lines 171 to 176 define `Tabs` as a
  TypeScript type while the Model is a Schema.
- Plan 05 line 141 (unbound `counterId`), plan 04 line 83 (`{' '}`), plan 08
  line 60 (`ofApp: (app: App): SkillDocument,` inside an object literal).

**Fix.** Make each compile, or label it as an outline.

## R2-33 | Minor | Protocol leftovers and duplicates

**Evidence.** Plan 02 lines 149 and 220 still name the daemon's `Send`, which
plan 01 removed (lines 247 to 252). Plan 01 has `Do` (line 193) and `Press`
(line 194) for one job. `ActionToken` is `PressToken | ChooseToken | FillToken`
in plan 01 (lines 176 to 180) and `Press | Choose | Fill` in plan 02 (line
350), with `tag: S.String` and `segment: S.String`, and "Token" is the
glossary's deprecated word (`glossary.md` lines 157 to 158). Plan 01 line 352
says "A view cannot send a fact" while `Open` and `Back` (lines 195 to 196)
send carrier facts. Plan 01 line 129 says `RunIn.inProcess` beside
`RunIn = Daemon() | InProcess()` (lines 254 to 255). Plan 09 lines 160 to 163
call the terminal frames "this envelope plus `Applied` and `Event`", which
they are not. Plan 09's example row (lines 64 to 75) is a `Decrement` at
`seq` 41 whose payload id `react-4f2a9c1e-41` was minted at `seq` 41 by the
same writer.

**Fix.** One frame per job, one spelling outside the deprecated word, and a
consistent example row.

## R2-34 | Minor | Counts that disagree with the code or with each other

**Evidence.** Plan 00 line 257 and the response's R1-01 row say eight files
name the client; README line 64 and plan 08 line 412 say five; a
case-insensitive search finds five tracked files. Plan 02 line 35 says
`Program` has nine optional members and names ten plus `valid`;
`program.ts` lines 147 to 179 has twelve (`interaction?` is not named). Plan
02 line 305 says 20 of 40 sites lack a catalog (R2-18: 35 of 40). Plan 01
lines 17 and 365 count Books' CLI as 9 files and 1,313 lines, which includes
the 506-line `cli.test.ts`; without it, 8 files and 807 lines.

**Fix.** Correct the numbers.

## R2-35 | Minor | New vocabulary collides with old

**Evidence.** `glossary.md` line 18 already defines "Message / Fact" as any
Message (`Increment({ via })`), and line 159's "Fact handle" sends Actions,
while the new "Fact" (line 192) is a Message nobody presses. "Engine" is
defined twice (lines 60 and 177): the first says "Local Programs have none",
the second makes Local an engine. "Offer" (line 196) names `at`, while plan
06 uses "offer" for peer snapshots throughout (`SnapshotOffered`, "peer
offer"). `Mount.selector` (plan 10 line 83) gives Mount, the element
lifecycle primitive, another meaning, the collision R1-56 removed from
`mountedAt`. "Viewer" is a Program kind in plan 02 and a host in plan 10.
The new Segment entry ("`CounterIdSegment` prints `3`", lines 220 to 222)
and the Mint entry (lines 203 to 205) cannot both hold.

**Fix.** Rename the new terms (or retire the old entries in the same change)
and fix the Segment example.

## R2-36 | Minor | The owner-philosophy memory keeps readings round 1 rejected

**Evidence.** `~/.claude/projects/-Users-laptop-Development-foldkit/memory/owner-philosophies.md`
item 5 says "Snapshots are never saved as truth", the reading R1-05 replaced
with "nothing saved"; it cites "`PRINCIPLES.md` principles 4 and 5 (added
2026-10-09)", which are 7 and 8; item 1 says a Subscription appends history,
which plan 08 replaced with one writer. `counters-audit-2026-10.md` records
"the composition rubric scores 1 to 3 with 3 best and 3 required" as the
owner's decision, while README decision 2 still asks it. Later sessions are
told to check every design against these files.

**Fix.** Correct those lines, or mark them proposed.

## R2-37 | Minor | Generated skills would land in the published plugin's tree

**Evidence.** Plan 08 lines 51 to 53 commit generated skills as
`skills/<program>/SKILL.md`. `.claude-plugin/marketplace.json` publishes the
plugin from the repository root (`"source": "./"`), whose `skills/` is the
plugin's skill directory; `plugin.json` lists 14 of its 15 entries (not
`foldkit-screens`). Whether Claude Code also loads unlisted directories was
not verified here. The owner's decision is that the generated skill "is
published nowhere by this repository". The manifest already ships
`foldkit-composition` at version 0.10.32, whose rule cites
`plans/05-composition.md` and `plans/02`, paths a plugin user does not have,
and whose "3" column names APIs that do not exist.

**Fix.** Generate into `examples/<app>/skills/` or another path outside the
plugin tree; keep plan paths out of published skills.

## R2-38 | Minor | Dependencies the README does not list

**Evidence.** README line 33 says 08a depends on nothing, but
`Skill.ofApp(app: App)` (plan 08 line 60) takes plan 06's `App`, and 08a adds
`at` to the Catalog (lines 46 to 47). Plan 01's `help` and `login` read 08a's
manifest (lines 100 to 103), but README line 25 lists 02 and 06. Plan 03's
canonical Multiple Counters needs plan 05's `forEach` (plan 03 line 181), but
README line 28 lists 02 and 04.

**Fix.** 08a takes a Program today; complete the column.

## R2-39 | Minor | Handles report a kind as a boolean, and the gate is a development-only throw

**Evidence.** `press: () => boolean`, `choose: (value) => boolean`, and
`fill: (fields) => boolean` (plan 02 lines 260, 270 to 271, 277) reduce
"sent" or "refused, and why" to a boolean, against plan 02's own rule (line
12). `WhenReady` is enforced by a throw "in development" (lines 288 to 293),
so production behavior is unstated.

**Fix.** Return the `Availability` that applied (or
`Sent | Refused({ because })`); hand the hooks out from `WhenReady` so use
outside it does not type-check.

## R2-40 | Minor | Refusals are only partly data, and only the sender checks them

**Evidence.** The sentence R1-45 cited, `Open`'s "it is already open", is a
per-choice availability computed inside `choices` (plan 02 lines 70 and 250
to 255), so a skill still cannot print it. Refusals run on the sender's Model
(lines 223 to 224); two devices can both pass `Reset`'s or `RemoveAsset`'s
check, so Domain rules need a second home in `update` that no plan names.

**Fix.** Per-choice refusals as data; one sentence that refusals are for
people and `update` keeps the Domain rules.

## R2-41 | Minor | Dictation details: ranges as choices, an unclassified search

**Evidence.** `Share` is "Choose (`range`)" over segment ranges (plan 01a
line 53), which enumerates every pair of segments, though a range is two
values. `Search` writes `query` (line 55) with no category, so the default
rule makes each search Domain and syncs it to every device.

**Fix.** `Share` as a Fill `{ from, to }`; `Search` as Navigation or
LocalOnly.

## What the owner asked that no plan covers

- "I'd appreciate if you do a Superbase adapter": still design only (README
  decision 5). Instant Cloud's shutdown on 2027-08-31 (R2-08) puts a date on
  that choice, and no plan says so.
- "The Swift and Rust readers didn't really work ... we need to audit them as
  well": read, not run (plan 09 lines 9 to 15); running them is migration
  step 2.
- "Make sure things are getting threes": still four of 74 examples scored;
  the `examples/counters` citations in `AGENTS.md` line 80, `PRINCIPLES.md`
  line 15, and `glossary.md` line 17 are unchanged; and "3 today" cannot be
  met by an example with a dialog or a detail page (R2-17).
- "Make sure everything's committed and pushed to main": nothing is
  committed (11 modified files, with `plans/`, `skills/foldkit-composition/`,
  and the trial untracked); `CLAUDE.md` asks for squash-merged pull requests,
  and no plan or note says when or how the push happens.
- "Create the complete list of all of the different independent variables
  ... and make some kind of pretty graphic": it exists outside the
  repository, but plan 08 does not map its 46 inputs to Model fields, and
  three have neither a field nor a decision (R2-30).

## Questions only the owner can answer

These are new; the README's 18 are not repeated.

1. Ids: a full minted id in every URI and CLI command
   (`/counters/react-4f2a9c1e-41`, `counters increment react-4f2a9c1e-41`), or
   a stored display number such as "Counter 3", which may repeat after two
   concurrent adds while identity stays unique? Multiple Counters' README
   promises numbers that are never handed out twice.
2. Placement: is `at` a hard gate for keys, the CLI, the action menu, and
   agent tools, or only a rule for what a screen paints? Today `a` adds a
   counter from any page and the menu opens Counter 2 from Counter 1's page.
3. Terminal views: should each view of one daemon (and each agent) keep its
   own navigation, or should a one-shot command carry the address it acts at
   and leave every screen where it is?
4. Liveness: which work keeps a terminal daemon alive: held resources and
   running Commands only, or also Subscriptions a Program marks as live?
5. Finance market data: Domain facts every device folds (devices agree, the
   log grows by hundreds of rows a day, every device calls the vendors),
   facts written by the worker alone, or values local to each device (cheap,
   devices may differ for minutes)?
6. Instant Cloud closes on 2027-08-31: move examples to self-hosted Instant,
   make Supabase the default engine, or both? Does that lift "design only"
   for `@foldkit/supabase`?
7. A newer `programVersion` on the log: read-only for older Processors
   (proposed), or keep writing while their rows decode, so a rollback stays
   possible?
8. Plaid's web OAuth redirect: may the web host keep the link token in
   session storage across the redirect (a saved, device-local value), or must
   finance use a popup or hosted flow only?
9. When the finance worker is down at midnight: backfill the missed days from
   the log when it restarts, or leave gaps?
10. Should erasing a person reach the rows a System writer put in their log
    (webhook facts, daily closes)? That needs an owner field on every row.
11. Where do generated skills live: beside each example, or in `skills/`,
    which the plugin publishes?
