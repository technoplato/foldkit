# Adversarial audit | Round 3 | 2026-10-09

Scope: the owner's saved messages, rounds 1 and 2 with their responses,
`plans/README.md` with its 30 decisions, plans 00 to 10 with 01a and 05a,
`skills/foldkit-composition/SKILL.md`, the diff of
`skills/foldkit-composable-architecture/SKILL.md`, the rubric in
`examples/AGENTS.md`, principles 7 and 8, the glossary's "Plans vocabulary
(proposed)" with its edited Message, Fact, and Engine entries, and
`scripts/score-examples.py` (untracked; it writes 05a). Claims about code were
checked on branch `claude/platform-adapter-packages` at `ae05f4b7a` plus the
uncommitted edits as they stood at 19:41, against React Router 8.3.0 in
`packages/react/node_modules/react-router`, Effect 4 in `repos/effect-smol`,
and Instant's permission documentation read from instantdb/instant through
`gh`. Where a claim rests on reasoning rather than a run, the finding says so.
The reviewed client is named nowhere here; a search that printed only counts
found its name in no file under `plans/`, `skills/`, the principles, the
glossary, the agent files, or the score script.

## Verdict

The plans cannot be accepted as a design yet, and one change stands between
them and acceptance. Round 2's fixes mostly hold: of its 41 findings, 24 fixes
are verified and 17 are partial, and none regressed. Of the 37 round 1 items
round 2 left open, 22 now hold and 15 remain partial; R1-26 and R1-59 are no
longer regressions, and R1-41 is partly fixed. The writing rules hold in
everything this branch wrote: no em dashes, no labels on the plans' own
writing, Foldkit capitalized in prose, and no inline code span broken across
lines.

One problem blocks (R3-01), and it sits in plan 02's foundation. Ownership is
declared per field, a Message may write fields of one ownership only, and a
remote Message applies through the Domain projection with device fields
merged back. So nothing lets a Domain fact change what a device shows or holds,
and nothing stops a Domain arm from reading a device's fields. The plans' own
declarations need the first and are exposed to the second: plan 05's
`DeletedCounter` removes every Destination that names the counter on every
device (what Multiple Counters does today in one Domain Message), plan 08's
Link flow ends on the device whose `linkSessionId` a server-written fact
carries (the R2-12 fix), and plan 07's `LinkedInstitution` and
`SucceededCreateLinkToken` lead somewhere. Under plan 02 those either do not
build or fail plan 07's own check. It is a design blocker rather than an
implementation detail because the remedy changes the signature of Domain
update arms and adds one per-device reaction that refolds, peer offers,
`tail`, and the static graph must all model; choosing it after acceptance
would reopen plans 02, 05, 07, and 08.

Complete, for a design, therefore means three things. First, R3-01 resolved
by one mechanism written into plans 02, 05, 07, and 08. Second, four premises
corrected so the owner decides on accurate ones: decision 6 reads as if a
peer's offer spares a newcomer the full fold, and under the read-only rule it
never does (R3-02); decision 25's backfill writes wrong history under plan
09's clock rule (R3-08); plan 01's default engine contradicts
`examples/AGENTS.md` and decision 10's own proposal and strands `serverOnly`
work (R3-05); and the rubric's mechanical pass leaves half the examples
unscored, with its only 3 an example that has no host (R3-12). Third, nothing
else: the other seven Majors (daemon keying, `Do.at`, leases, the worker's
view of device requests, the read path for derived fields, the stored label,
a host screen over a Program) are rules each plan can add at its first
migration step without reopening a foundation, and the nine Minors, the 30
listed decisions, and the six new questions below can be left to
implementation and to the owner. Counts: 1 Blocking, 11 Major, 9 Minor.

## Round 2 fixes

Verified: present and sound. Partial: present but incomplete, or the problem
moved; the row says what is missing. No round 2 fix is "Not fixed" or
"Regressed".

| Id    | Status   | What was found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-01 | Partial  | 128-bit UUIDv7 ids behind `Mint`, `Unminted<M>`, a 128-bit `instance`, and identity apart from display landed (plan 02 lines 163-186). The display label cannot "never move" as specified, because `Add` declares only `mints: { counterId }` and nothing fills a label at send time (R3-10); `Mint.sequence('t')` ids are not UUIDv7s (R3-13); Supabase's unique key omits `app` (R3-17)                                                                                                                                                                                                                                                                                                                                                                                 |
| R2-02 | Partial  | Ownership per field, category from writes, mixed writes refused, and `Start` split into a Local Action and a Domain fact all landed (plan 02 lines 200-230, plan 01a lines 43-71). The rule cannot carry a Domain fact's consequences on a device, which plans 05, 07, and 08 rely on, and it leaves Domain arms free to read device fields (R3-01)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R2-03 | Verified | `Liveness.keepsAlive` and `observes` on Subscriptions and ManagedResources; Books marks its clock, transcript, and player; a conformance case runs Books to Idle (plan 01 lines 126-163). The default misses Books' Audible import (R3-19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2-04 | Partial  | `Navigation.current` skips chrome and `Do` carries an address (plan 02 lines 294-316, plan 01 line 195). Refusals still read the daemon's one navigation, a presented child has no Model at an address nobody opened, and no view can compute `at` (R3-04)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2-05 | Verified | Instant is `ReceiptOrdered({ overlap })` with a deduplicated re-read, and the strict commit-order case is expected to fail there (plan 06 lines 163-167). The overlap is a row count sized by a time (R3-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R2-06 | Verified | Offers on Instant are signed with an HMAC key in a `deviceKeys` namespace whose rows only `auth.id` can read; a Guest cold-folds (plan 06 lines 168-172). The namespace must follow the shared-schema rule (R3-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R2-07 | Verified | The row set is checked in fold order from the key list, the offer is painted read-only until the device's own fold agrees, one peer answers, a ceiling caps size, derived fields are recomputed (plan 06 lines 270-300). What that costs is new: no offer shortens the wait for an interactive app (R3-02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2-08 | Verified | The 2027-08-31 shutdown is named in plan 06 (lines 20-23, 156-161) and the README (lines 57-59), with `InstantApps.selfHosted` and decisions 5 and 9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R2-09 | Verified | `owner` beside `actor`, policies and erasure by owner, `seq` per `(owner, host, instance)`, no personal data on Kafka (plan 06 lines 85-103, 213-224). Rooms and public appends have no policy (R3-17)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R2-10 | Verified | Every vendor-fed input is written by one server worker (plan 08 lines 142-147, 463-469). The worker cannot see a device's request (R3-07)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R2-11 | Partial  | `ClosedDay({ day })` carries no value and `timeZone` is a field (plan 08 lines 306-308, 393-400). A backfilled day folds after everything written since it ended, plan 09's clock rule forbids dating it earlier, and nothing writes `timeZone` (R3-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R2-12 | Partial  | `linkSessionId` runs through `ReceivedPublicToken` and `LinkedInstitution` (plan 08 lines 439-451). "The device whose `linking` carries that `linkSessionId` moves to `Done`" needs a Domain fact to write a DeviceOwned field, which plan 02 refuses to build and its merge-back discards (R3-01)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R2-13 | Partial  | Checked against the real `evo`: over `Pick<Model, Heads>`, `StrictKeys` rejects an undeclared head (`packages/foldkit/src/struct/index.ts` lines 7-14, 25-33), so the typing claim holds. The helper returns only `Written`, while every update returns `[Model, Commands]` (`packages/foldkit/src/update/update.ts` lines 30-33), so each arm with a Command (`Confirm`, `HeardFinal`, `LinkBank`) opts out and scores 2; the arm still reads the whole Model (R3-01)                                                                                                                                                                                                                                                                                                    |
| R2-14 | Partial  | `Each({ key, then })`, `Keyed.by`, `Path.of(Model)`, and `Derived({ name })` landed (plan 02 lines 269-292). Plan 01's tail sample (lines 272-278) is still not generated from the Model: it shows `sessions[…].segments[…] Partial → Final`, though `sessions` holds only `Final` (plan 01a lines 113-127, 152-154), and the Domain fact `HeardFinal` moving the DeviceOwned `live`. `Keyed.by` needs a typed wrapper (R3-14)                                                                                                                                                                                                                                                                                                                                            |
| R2-15 | Partial  | Facts declare `produces` and `leadsTo`, and `whatWrites` is a closure (plan 02 lines 188-198, plan 07 lines 106-110). Plan 07 still drifts from plan 08: `actionsAt('/finance/accounts/<id>')` (lines 99-100) lists `UnhideAccount`, offered at Accounts (plan 08 line 413), and `Back`, which is not an Action, and omits `TreatAsCash`, `TreatAsInvestment`, and `RemoveDebt` (plan 08 lines 414-415, 421); its `RefreshBalances` chain drops `RefreshedPositions` (07 line 96 against 08 line 122); line 159 says plan 08 narrows net worth's inputs to `path.accounts.each.balance`, but plan 08 lines 331-345 list whole fields. `produces` as values does not load (R3-15)                                                                                          |
| R2-16 | Partial  | Derived fields are a view the runtime computes, never written by `update`, recomputed on an accepted offer (plan 07 lines 146-159). Nothing says how a screen, painter, or refusal reads one (R3-09)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R2-17 | Partial  | Rows are dated, and "3 (today)" admits the classifier, `Navigation.pushed`, and per-screen Catalogs. Still contradicted: `examples/AGENTS.md` lines 181-185 call "stack edits in `update`" and "a per-Program Domain-or-Navigation classifier" hand rolling the rubric forbids; the skill's top row is labeled "3", not "3 (planned)" (line 51); its "2 (today)" keeps "one `Catalog.action` not yet migrated to a kind" (line 53), true of every Action today; it still says `forEach` rows carry "a branded id" (line 22), though `compose.ts` line 514 has `id: S.String`; and today's `forEach` cannot take an id from a payload (`ClickedAddRow` has none, `compose.ts` lines 524 and 624-625), so a "3 (today)" list needs a hand-written add arm in `updateFields` |
| R2-18 | Verified | One Program record with `Catalog.none`, and the 35 of 41 count (plan 02 lines 374-401); plan 10 says "paint-only"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R2-19 | Partial  | The prefix is `useLocation().pathname` minus `useParams()['*']` (plan 04 lines 146-151). React Router 8.3.0 matches against the decoded path and returns decoded params (`lib/router/utils.js` lines 247-252, 488-507) while `useLocation().pathname` stays encoded, so `/legacy/counter/notes/caf%C3%A9` yields the prefix `/legacy/counter/notes`. The leaf match's `pathnameBase` (lines 494-499, reachable through the exported `UNSAFE_RouteContext`) is the prefix itself                                                                                                                                                                                                                                                                                           |
| R2-20 | Verified | Guards are the guarded screen's own state, the web carrier restores the address and reports, `useBlocker` is not used (plan 04 lines 226-238). `Leaving` names two types (R3-16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R2-21 | Partial  | The stray text child is gone and `routeName` keeps two Programs apart (plan 04 lines 80-85, 158-166). A Program move while a host screen covers the span is unspecified (R3-11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R2-22 | Partial  | The socket and lock are keyed by four values, the build travels in `Hello`, `restart` hands over, the engine has a default (plan 01 lines 102-116, 242-247). The view cannot know the actor it must key by, the state directory omits the actor, the microphone lock is per App and engine, and `os.tmpdir()` is a shared `/tmp` on Linux (R3-03)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R2-23 | Verified | Read-only only on an undecodable newer row or a `RetiredVersion` fact (plan 01 lines 257-260, plan 09 lines 134-136, decision 23)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R2-24 | Verified | `presents` emits the Domain fact through a Command from the child's `Confirm`, as two log entries, with a pure child `init` and one North Star (plan 05 lines 141-174). Its claim that `DeletedCounter` also removes Destinations on every device is R3-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2-25 | Partial  | `runsOn: serverOnly`, `Lease.hold`, a settle window, and a compensation policy landed (plan 06 lines 302-343). The lease promises more than a lease can (R3-06), `serverOnly` work never runs on the default engine and no Foldkit host is named as a server (R3-05), and the worker cannot see a request that writes nothing (R3-07)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R2-26 | Verified | `needs` on the declaration, `availabilityOf(entry, model, context)`, an `Unavailable` Layer per service, one name `Recognizer` (plan 02 lines 243-250 and 294-313, plan 10 lines 25-35)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R2-27 | Verified | A per-app advisory lock key, single-statement inserts, a decode failure on `live` triggering a read, unique violations matched by constraint name (plan 06 lines 197-232)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R2-28 | Verified | `bound.scope(mountPath)` and `Counters.row(counterId)` (plan 03 lines 51-85, plan 05 lines 133-139). Reusing the Counter's `CounterBadge` imports another example's host code (R3-19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R2-29 | Verified | The window may import `./painters`, and a shared painter lives in `examples/shared/painters` (plan 03 lines 115-127, 167-176)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R2-30 | Verified | `AccountSource`, `TokenSource`, per-kind fields, the inputs mapped by group, the missing Actions, and the asset route (plan 08 lines 140-161, 188-267, 402-423). The group counts sum to 47 against the 46 stated (R3-21); finance URIs and plan 04's tab grammar disagree (R3-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R2-31 | Verified | `maybeGap` and `maybeInstitutionValue`; facts verb-first and past tense (plan 01a lines 62-71, plan 08 lines 425-437)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R2-32 | Partial  | `Identity`, the Program record, the `evo` call, `Host.make`, `title`, `Tabs`, the unbound `counterId`, and `{' '}` are fixed. Plan 08 lines 61-65 still write `Skill` as an object literal of parameter lists with no bodies (`ofProgram: (program: AnyProgram): SkillDocument,`), the syntax round 2 flagged; plan 02 writes `ModelPath`, `RowKey`, `Outcome`, and `Category` (lines 272-280, 344, 406) and plan 06 writes `Link` and `Page` (lines 126-128) as types built from constructor calls, the form round 2 flagged in `Identity`, without an outline label; plan 02 lines 112-118 declare finance's `RefreshedBalances` in Multiple Counters' `message.ts` with a `path` that has no `accounts`                                                                |
| R2-33 | Partial  | No `Send`, one `Do` with an `Invocation`, `RunIn.InProcess()`, a separate frame set, and a consistent example row. The new rule in plan 09 lines 85-86, that a minted id in a payload "was minted by an earlier row of the same writer, never by the row that carries it", is false for every `Add` row and for a writer acting on another writer's row (R3-18)                                                                                                                                                                                                                                                                                                                                                                                                           |
| R2-34 | Verified | Five files, twelve optional members, 35 of 41 sites, and Books at 8 files and 807 lines plus a 506-line test all match the code. Other counts drift (R3-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R2-35 | Partial  | `Where`, `Container.selector`, and "paint-only" removed three collisions. The glossary still gives "Fact" two meanings, contradicts plan 02 on what is logged, and gains new collisions (R3-16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R2-36 | Verified | `owner-philosophies.md` says nothing is saved and cites principles 7 and 8; `counters-audit-2026-10.md` records the rubric direction as open; both are indexed in `MEMORY.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R2-37 | Verified | Generated skills go to `examples/<app>/skills/SKILL.md` (plan 08 lines 51-55); the published composition skill cites no `plans/` path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R2-38 | Verified | 08a takes a Program; the README lists 01 on 08a, 03 on 05, and 08b on 01 (lines 25, 28, 34). Two other edges are missing (R3-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R2-39 | Verified | Handles return `Sent \| Refused({ because })`; `useFeature` outside `WhenReady` throws in every build, with a lint rule (plan 02 lines 344-372)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R2-40 | Verified | `Choice.refusals` as data; refusals are for people and `update` keeps the Domain rules (plan 02 lines 259-267)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R2-41 | Verified | `Share` is a Fill `{ from, to }` and `Search` writes the DeviceOwned `query` (plan 01a lines 57-59, 141)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Round 1 carry-overs

The round 1 items round 2 rated Partial (34), Not fixed (R1-41), or Regressed
(R1-26, R1-59).

| Id    | Status   | What was found                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-01 | Verified | The client is named in no file under `plans/`, the skills, the principles, the glossary, the agent files, or the score script. Five tracked files in `examples/personal-cfo` still name it on the public fork, and the fail-closed scanner pattern lives outside this repository; both are decision 1                                                                                                                                                       |
| R1-02 | Verified | Ids are minted by the sender and on the log before any fold (plan 02 lines 163-177); `forEach` has no `nextId` (plan 05 lines 60-62, 114-116); the late-row permutation test is an acceptance test (plan 05 lines 85-87, 251-254)                                                                                                                                                                                                                           |
| R1-03 | Verified | Attested channels, a fold-order row-set check, and a read-only paint replaced by the device's own fold (plan 06 lines 266-300). R3-02 is what that costs                                                                                                                                                                                                                                                                                                    |
| R1-04 | Verified | 08a ships first and takes a Program (README lines 40-42, plan 08 lines 37-58)                                                                                                                                                                                                                                                                                                                                                                               |
| R1-08 | Partial  | See R2-17. The composable-architecture skill (step 5 of its diff) cites `GotVendingMessage` in `examples/world` as the `Got*` convention at an OutMessage boundary, but world has no OutMessage (`examples/world/core/src/message.ts` lines 15-21) and 05a scores it 1                                                                                                                                                                                      |
| R1-09 | Verified | `Fact.define` with `writes`, `produces`, and `leadsTo`, and `Produces` edges (plan 02 lines 188-198, plan 07 lines 117-128). The drift between plans 07 and 08 is under R2-15                                                                                                                                                                                                                                                                               |
| R1-10 | Partial  | See R2-13: the typed helper has no place for Commands                                                                                                                                                                                                                                                                                                                                                                                                       |
| R1-11 | Verified | One `ModelPath` ADT keyed by row key serves `writes`, `reads`, and change lines (plan 02 lines 269-292, plan 01 lines 235-239)                                                                                                                                                                                                                                                                                                                              |
| R1-12 | Verified | The child's Model is navigation state, the Domain fact is self-contained, `parse` stays pure, and the carrier's fold runs `init` (plan 05 lines 141-174)                                                                                                                                                                                                                                                                                                    |
| R1-13 | Partial  | See R2-04                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-14 | Partial  | A lifted Choose is a Choose whose value is a Struct (plan 05 lines 123-131). But a Choose fills one `field` (plan 02 lines 140-145 and 154-155), and the lifted `Export({ counterId, format })` has two; the plans do not say whether the Struct is one payload field or two, which decides the wire shape plan 09 pins                                                                                                                                     |
| R1-17 | Verified | The smell tables match the code, `ProgramCommand`'s three optionals and `navigationOf` included (plan 00 lines 225-249; `packages/foldkit/src/program/program.ts` lines 53-59, 62-105, 130-180)                                                                                                                                                                                                                                                             |
| R1-18 | Verified | See R2-18                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-20 | Verified | See R2-28                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-21 | Partial  | See R2-21                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-24 | Verified | A drawer container, nesting, and guards painted by the screen (plan 04 lines 102-139, 198-238)                                                                                                                                                                                                                                                                                                                                                              |
| R1-26 | Partial  | No longer a regression: the build left the socket key (plan 01 lines 102-108). See R2-22 and R3-03                                                                                                                                                                                                                                                                                                                                                          |
| R1-27 | Verified | A new build's view now reaches the running daemon and gets `Refusing` with the restart fix (plan 01 lines 242-247); the version rule is R2-23's                                                                                                                                                                                                                                                                                                             |
| R1-31 | Partial  | A Projection is a headless Program with typed Commands, a settle window, and a compensation policy (plan 06 lines 316-343). Its lease cannot exclude a paused holder (R3-06); it folds `Renamed` (line 333), which plan 01a never declares (its Domain Action is `Rename`, a Fill), so a Projection folds Domain Actions as well as facts; and it reads `HeardFinal({ segment })`, while plan 01's tail sample prints `sessionId`, `segmentId`, and `words` |
| R1-33 | Verified | Commit-ordered positions under a per-app lock on Supabase, and an overlap re-read on Instant (plan 06 lines 163-167, 201-232)                                                                                                                                                                                                                                                                                                                               |
| R1-35 | Verified | See R2-09                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-36 | Verified | `host`, `instance`, and `owner` are fields, and `navigationOf: (host) => Shared \| Own` replaces the string parse (plan 02 lines 405-413, plan 06 lines 106-111)                                                                                                                                                                                                                                                                                            |
| R1-37 | Partial  | See R2-12                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-39 | Partial  | See R2-11                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-40 | Verified | See R2-26                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-41 | Partial  | Every directory is listed (05a), but a proxy puts 37 of 74 outside the rubric, the one 3 has no host, and the reading pass has not started (R3-12). The legacy `examples/counters` citations now point at Multiple Counters (`AGENTS.md` line 80, `PRINCIPLES.md` lines 14-16, `glossary.md` line 17)                                                                                                                                                       |
| R1-44 | Partial  | See R2-15                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-45 | Verified | See R2-40                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-47 | Partial  | One decode rule and a consistent example row. Neither reader has been built or run (plan 09 lines 9-15), which is what the owner's "didn't really work" asked about; the new minted-id rule is false (R2-33)                                                                                                                                                                                                                                                |
| R1-48 | Verified | `Page`, `Link`, `Received`, `Cursor`, and capabilities as single sums (plan 06 lines 115-128). `paging: None()` contradicts "`readSince` required" (R3-20)                                                                                                                                                                                                                                                                                                  |
| R1-49 | Verified | `Invocation`, `Flag`, and `RunIn` are sums, and `Identity` is a TypeScript union (plan 01 lines 177-183, 261-263, 287-294)                                                                                                                                                                                                                                                                                                                                  |
| R1-53 | Verified | 24 directories, each with a destination (plan 03 lines 155-165). "20 are packages" names 21 (R3-21)                                                                                                                                                                                                                                                                                                                                                         |
| R1-54 | Verified | `foldkit/skills`, a version stamp, no hand sections, files beside each example (plan 08 lines 37-71)                                                                                                                                                                                                                                                                                                                                                        |
| R1-55 | Partial  | See R2-32                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-56 | Partial  | Every plan has a decisions section and the README collects most of them, but seven plan decisions are missing from the README's 30 and two dependency edges are absent (R3-21); the glossary still collides (R3-16)                                                                                                                                                                                                                                         |
| R1-57 | Verified | No inline code span breaks across lines in any file this branch wrote (checked by a script over the plans, the README, both skills, the principles, and `examples/AGENTS.md`). Five committed glossary entries outside the new section still do (lines 49-50, 70-71, 81-82, 107-108, 145-146)                                                                                                                                                               |
| R1-59 | Partial  | No longer a regression. See R2-19                                                                                                                                                                                                                                                                                                                                                                                                                           |

## New findings

| Id    | Severity | Plan                   | One line                                                                                                          |
| ----- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| R3-01 | Blocking | 02, 05, 07, 08, 01     | Ownership by writes cannot carry a Domain fact's consequences on a device, and Domain arms may read device fields |
| R3-02 | Major    | 06, README             | No peer offer shortens the wait for an interactive app, and decision 6 reads as if it does                        |
| R3-03 | Major    | 01, 06                 | The daemon is keyed by an actor the view cannot know, and its files are not keyed by it                           |
| R3-04 | Major    | 01, 02                 | `Do.at` moves placement to the command's address and leaves refusals and presented children at the daemon's       |
| R3-05 | Major    | 01, 06, 08, 10         | The default engine contradicts the owner's sync rule, and `serverOnly` work has nowhere to run                    |
| R3-06 | Major    | 06, 08, 01a            | A lease without fencing cannot promise that two server Processors never both run                                  |
| R3-07 | Major    | 08, 02, 07             | The finance worker cannot see a request a device makes                                                            |
| R3-08 | Major    | 08, 09, README         | A backfilled `ClosedDay` records the wrong value, and plan 09's clock rule forbids the fix                        |
| R3-09 | Major    | 07, 08                 | `Derive.view` says where derived values are computed, not how anything reads them                                 |
| R3-10 | Major    | 02, 05, 07             | The stored label has no mechanism to stay put, and "Counter 3" repeats after any delete                           |
| R3-11 | Major    | 04                     | No rule for a Program move while a host screen covers it in React Navigation                                      |
| R3-12 | Major    | 05, 05a                | The mechanical scores do not measure the rubric, half the examples are left out, and the only 3 has no host       |
| R3-13 | Minor    | 02, glossary           | `Mint.sequence` ids fail a UUIDv7 brand, and dispatch tools bypass minting                                        |
| R3-14 | Minor    | 02, 07                 | `Keyed.by` cannot be a plain annotation, and nothing rejects duplicate keys                                       |
| R3-15 | Minor    | 02, 07                 | `produces` written as values cannot load and cannot express a cycle                                               |
| R3-16 | Minor    | glossary, 01, 04, 07   | The glossary still collides with the plans and the code                                                           |
| R3-17 | Minor    | 06                     | Supabase's policies cover two of three owners                                                                     |
| R3-18 | Minor    | 09, 02, glossary       | Ids printed in a form the protocol does not define, and a schema hash that can miss a change                      |
| R3-19 | Minor    | 01, 02, 03, 05         | Five gaps in liveness, lifting, forms, components, and migration order                                            |
| R3-20 | Minor    | 06, 07, 08             | Five gaps in checks, paging, URIs, and namespaces                                                                 |
| R3-21 | Minor    | README, 00, 03, 06, 08 | Counts, cross-references, and seven decisions missing from the README                                             |

## R3-01 | Blocking | Ownership by writes cannot carry a Domain fact's consequences on a device, and Domain arms may read device fields

**Claim.** Plan 02 lines 211-228: a field is Domain ("synced, folded
identically everywhere"), DeviceOwned, or Navigation; a Message's category
follows from the ownership of its `writes`; "A Message that writes fields of
two ownerships does not build: split it"; and "Every remote Message is applied
through the Domain projection, and device-owned fields are merged back from
the local Model after each apply".

**Evidence.**

- The plans' own declarations write two ownerships.
  - Plan 05 lines 75-78: the question's `Confirm` "returns the Command that
    produces `DeletedCounter`, which removes the row and every Destination
    that names it on every device". That writes `counters` (Domain) and
    `navigation` (Navigation). It is what Multiple Counters does today in one
    Domain Message: `deletedCounter` removes the counter and "every page and
    question that named it, on every device that folds the deletion"
    (`examples/multiple-counters/core/src/update.ts` lines 83-93), and
    `ConfirmDelete` is `'Domain'` (`program.ts` line 23).
  - Plan 08 lines 446-448: the origin writes `LinkedInstitution` as a Domain
    fact, and "the device whose `linking` carries that `linkSessionId` moves
    to `Done`". `linking` is DeviceOwned (plan 08 lines 324-327); a remote
    apply merges it back, so it never moves. The R2-12 fix rests on this
    sentence.
  - Plan 07 lines 58-72: `SucceededCreateLinkToken` writes `linking` and
    declares `leadsTo: LeadsTo.present(LinkFlow)`; `LinkedInstitution` writes
    `institutions` and `accounts` and declares `leadsTo: LeadsTo.back`. Plan
    07 line 208 checks "`leadsTo` against the stack after `update`", so each
    must move `navigation`: left undeclared, the generated check fails;
    declared, the Message mixes ownerships and does not build.
  - Plan 01 lines 272-275: the tail sample shows the Domain fact `HeardFinal`
    moving `live`, which plan 01a lines 65-67 make DeviceOwned and hand to
    `ClearedLive`.
- Reads are unconstrained. `Update.writes` hands the arm the whole `model`
  (plan 07 lines 181-186), and the only rule about reading is plan 05 lines
  144-145 ("nothing Domain may depend on" a presented child's Model). The
  sender applies its own Message to its full Model while peers apply it
  "through the Domain projection", so an arm that reads `navigation` (the
  counter whose page is open, say) or `recorder` folds differently on each
  device. What a projection's non-Domain fields hold during a remote apply is
  not stated, and the rule as written also covers remote Navigation Messages,
  which under Mirror must move `navigation`.
- Plan 06 lines 281-283 send the offerer's Domain fields "as they stand ...
  and no refold", which equals a fold of the log only if no Domain arm read a
  device field.

**Why it blocks.** Plan 05's `forEach` North Star, plan 08's Link flow, and
plan 07's check cannot be built or pass under plan 02 as written, and the
remedy is not local: it changes the signature of Domain update arms and adds a
step that refolds, peer offers, `tail`, and the graph must model.

**Fix.**

1. Type Domain arms on the Domain part: for a Domain declaration,
   `Update.writes(Declaration, (domain, message, evolve) => …)` receives
   `DomainOf<Model>`, and the runtime applies every Domain Message to the
   Domain part on every path (the sender's own send, a remote row, a refold,
   an offer), so "folded identically everywhere" holds by construction. Say
   that a remote Navigation Message applies to `navigation` per the session
   policy.
2. Choose one way for a Domain change to reach a device and write it into
   plan 02. Either a Model-gated Subscription that emits a Local or
   Navigation fact when its dependencies change (`FinishedLink({ linkSessionId })`
   when `institutions` gains this device's session, `ClosedMissingCounterPage`
   when the shown counter is gone), which uses an existing primitive and keeps
   every change a Message in `tail`; or a declared
   `reconcile: (model: Model) => Model`, typed to write only DeviceOwned and
   Navigation fields, which the runtime runs on every device after every apply
   and refold, never logs, prints in `tail` as derived changes, and the graph
   reads as `Reconciles` edges.
3. Allow a `leadsTo` other than `stay` only on Local and Navigation
   declarations; a Domain fact leads somewhere through step 2.
4. Restate plan 05 lines 75-78, plan 08 lines 446-448, plan 07's two facts,
   and plan 01's tail sample against the rule. Owner question 3 below decides
   which consequences are automatic.

## R3-02 | Major | No peer offer shortens the wait for an interactive app, and decision 6 reads as if it does

**Claim.** README decision 6 (lines 81-86): "On Instant, offers need the
signed-key namespace of plan 06 or every boot is a cold fold." Plan 06 lines
277-280: without an attested channel, "newcomers cold-fold, which on Instant
without the key namespace is every boot".

**Evidence.**

- Nothing is saved (plan 06 lines 270-271), so every page load, every daemon
  start, and every Expo launch is a newcomer.
- Step 5 (plan 06 lines 284-292): the newcomer reads the full fold-order key
  list, paints the offer with every Action refused, refolds the log in the
  background, and offers Actions only once its own fold agrees. The time to an
  interactive app is the key list plus the offer's round trip plus a full cold
  fold, longer than a cold fold alone. The offer buys an earlier first paint
  and nothing else.
- The fold grows without bound. Navigation Messages are logged (plan 02 lines
  216-218), including every page open and every action menu keystroke
  (`ChangedActionMenuQuery` is a logged tag in plan 09 line 177); finance adds
  hundreds of rows a day (plan 08 lines 142-147); and plan 09 lines 112-113
  refold "from the start" on every late row, which concurrent writers make
  routine.

**Fix.** Restate decision 6 with its real options: (a) nothing saved, every
boot waits for a full fold, and an offer only paints sooner; (b) a verified
offer from the same actor and the same build is usable at once while the
device refolds in the background and replaces it on a mismatch, which accepts
R1-03's buggy-peer risk for one refold (owner question 1); (c) a saved
per-device cache or a server checkpoint. Keep in-memory checkpoints so a late
row refolds from the nearest one instead of from the start; they are never
saved, so they do not touch the owner's rule.

## R3-03 | Major | The daemon is keyed by an actor the view cannot know, and its files are not keyed by it

**Claim.** Plan 01 lines 102-111: "One daemon per
`(App.id, Engine.key, OS user, actor)`. The socket and the lock are keyed by
exactly those four", with the pid, lock, and log in
`~/Library/Application Support/foldkit/<appId>/<engineKey>/`. Lines 114-116:
the microphone is "held under one exclusive lock in the state directory across
daemons of every build".

**Evidence.**

- The view computes the socket path before any daemon exists ("The first view
  that needs the daemon spawns it", line 117), imports only Node builtins
  (line 122), and never loads Layers. Identity is acquired by the daemon
  (lines 295-296), and Books' `IdentityFlow` lives in the host's Layers file
  (lines 298-299), which only the daemon loads (lines 119-121). The one value
  the view must hash first is one only the daemon can learn.
- The state directory omits the actor, so two actors' daemons (decision 18: "a
  sign-in as another actor starts a second daemon") share one pid file, one
  daemon lock, one Local NDJSON log (plan 06 lines 252-258), and one outbox.
- The microphone lock sits in a directory per App and engine, so two daemons
  of one App on two engines, the case R2-22 raised, take two locks and both
  open the microphone.
- Lines 105-108 say the path follows "today's `cliDaemonSocketPath`" as
  `${tmpdir}/fk-<digest>.sock`, with `tmpdir` "the per-user temporary
  directory, never a shared `/tmp`". Today's helper writes
  `/tmp/fkc-<12 hex>.sock` (`packages/foldkit/src/cli/paths.ts` line 26), and
  Node's `os.tmpdir()` is `/tmp` on Linux unless `TMPDIR` is set; the per-user
  directory there is `$XDG_RUNTIME_DIR`.

**Fix.** Key the socket and lock by `(App, engine, OS user)` and have the
daemon answer a view signed in as someone else with `Refusing` and the fix
(`dictate daemon restart`), or have `login` write the current actor to a file
in the state root that the view reads; put the actor in the state path; hold
device-exclusive locks in one per-user directory shared by every App and
engine; use `$XDG_RUNTIME_DIR` on Linux and describe today's helper as it is.

## R3-04 | Major | `Do.at` moves placement to the command's address and leaves refusals and presented children at the daemon's

**Claim.** Plan 01 lines 248-250: "A one-shot command acts at an address
(`Do.at`): the daemon checks the Action's availability there without moving
any attached view's screen". Plan 02 lines 308-310: `context.at` "is the
address a one-shot command or an agent names".

**Evidence.**

- `availabilityOf` (plan 02 lines 297-302) evaluates `entry.refusals` against
  `model`, the daemon's one Model, and only placement against `context.at`.
  `Add` and `Open` refuse `when(isConfirming, …)` (plan 02 lines 70 and 91),
  which reads the daemon's navigation. With a TUI showing "Delete Counter 3?",
  `counters add` from a second terminal at `/counters` is refused with "answer
  the delete question first" for a question that is not at its address.
- A presented child's Model lives only in the modal entry (plan 05 lines
  163-165). `Do({ at: '/counters/delete/<id>', invocation: Confirm })` against
  a daemon with no question open has no child Model to update, and presenting
  one would move the screen plan 01 promises to leave alone.
- No plan says where a one-shot view gets `at`. The command
  `counters rename <id> --title Standup` is offered only at `CounterDetail`
  (plan 02 line 102); the view imports no core (plan 01 line 122), and the
  manifest (lines 89-91) lists commands and usage, not routes.

**Fix.** Evaluate availability and apply the invocation against the Model with
its navigation replaced by the stack `parse(at)` gives (running a presented
child's pure `init`), keep the Domain and Local results, and drop the
Navigation result, so no screen moves. Put each Action's routes in the build
manifest so the view fills `at` from the invocation (`/counters/<id>` for
`rename <id>`), with `--at` to override. Add the TUI-dialog case to plan 01's
conformance list.

## R3-05 | Major | The default engine contradicts the owner's sync rule, and `serverOnly` work has nowhere to run

**Claim.** Plan 01 line 112: "`FOLDKIT_ENGINE` defaults to `local`". Plan 06
lines 308-310: `serverOnly` Subscriptions and ManagedResources start "only on
a Processor whose host kind is `Server`; every other host folds their facts
and starts nothing".

**Evidence.**

- A terminal host names no engine (plan 01 line 27) and core names none (plan
  06 line 35: "Core declares what travels. Hosts choose where."). So the
  Counter, Multiple Counters, and Books CLIs start on a Local log that their
  web and Expo hosts never see, against `examples/AGENTS.md` lines 17-18
  ("Every example shares its state through Instant from the first run"), the
  owner's recorded rule, and README decision 10's own proposal ("one engine
  per example").
- Local is terminal-only and has no server role (plan 06 line 153), so a
  finance CLI on the default starts no worker: no balances, no prices, no
  `ClosedDay`, and nothing refuses or says why.
- Plan 06 uses `Host.headless` both for the Kafka worker (line 62) and for
  tests on `Engine.memory()` (line 69); plan 10 line 120 defines
  `HostKind = Browser | Native | Terminal | Server` and does not say which kind
  `Host.headless` is. Either tests start vendor work or the worker starts
  none.

**Fix.** Let an App declare the engine its hosts use unless configured
(`App.define({ defaultEngine: Engine.instant.browser({ app: InstantApps.dev }) })`
and its terminal counterpart), which `FOLDKIT_ENGINE` overrides, with `local`
only for an App that declares none (owner question 2). An App with
`serverOnly` work declares that it needs a server; a Processor that cannot
reach one says so in `status` and in a refusal, or the daemon takes the server
role on Local, where it is the only Processor. Add `Host.server` of kind
`Server`, distinct from `Host.headless`.

## R3-06 | Major | A lease without fencing cannot promise that two server Processors never both run

**Claim.** Plan 06 lines 311-314: "`Lease.hold(name)` ... a conditional write
with a lease duration, renewed while held, so two server Processors never
both run the same Projection."

**Evidence.**

- A holder that pauses past `until_ms` (a collection pause, a sleeping laptop,
  a partition) resumes believing it holds the lease while a second Processor
  already does. `program_lease (name, holder, until_ms)` (line 220) carries no
  fencing token, and the effects' targets (Scribe's tables, Plaid, SnapTrade)
  could not check one. Plan 06 line 329 already concedes that uploads and
  deletes "are logged, not undone".
- Instant's lease is "a conditional write" (line 176). Instant's rules can
  read the stored row, the new row, and the server's `request.time`
  (instantdb/instant `client/www/app/docs/permissions/page.md`, read through
  `gh` on 2026-10-09), but two acquirers that both read an expired row both
  pass the rule unless each reads the lease back after writing.
- Whose clock measures `until_ms` is not stated.

**Fix.** State the guarantee a lease gives: at most one holder at a time,
except across a pause longer than the lease. Require every leased effect to be
idempotent (upserts keyed by the fact's id, vendor calls deduplicated by a
request key) or fenced by a lease epoch the target stores; compare expiry on
the engine's clock (Postgres `now()`, Instant `request.time`); stop issuing
effects a margin before expiry; acquire by conditional write and confirm by
reading back.

## R3-07 | Major | The finance worker cannot see a request a device makes

**Claim.** Plan 02 lines 222-224: "`RefreshBalances` is `Domain` because it
produces Domain facts and must be seen by the worker". Plan 08 lines 411 and
423: `Disconnect` and `RefreshBalances` write nothing.

**Evidence.**

- The worker folds these as remote Messages. A remote Message's Commands are
  dropped (`packages/foldkit/src/program/sync.ts` lines 407-421), and the
  worker's `serverOnly` refresh Subscription is gated by the Model (plan 08
  lines 468-469; `modelToDependencies` in
  `packages/foldkit/src/subscription/subscription.ts` lines 25-47), which a
  Message that writes nothing leaves unchanged. Pressing Refresh never
  refreshes, and Disconnect never removes the vendor item or its vault entry.
- `produces` means "the facts its own Commands may end in" (plan 02 lines
  194-195), but `RefreshedBalances` comes from another Processor's
  Subscription, so the chain `RefreshBalances` to `RefreshedBalances` that
  plan 07 (line 96) and the skill (plan 08 line 122) print is not what the
  declaration says.

**Fix.** Make a request write a Domain field the worker's Subscription
observes (`refreshRequests` keyed by request id, `pendingDisconnects`), and
let the worker's fact clear it; or declare a server reaction (a server
Processor runs the Commands of a Domain Message it folds, once, under its
lease). Give `produces` a form for facts another Processor writes so the
graph's chain is declared, not assumed.

## R3-08 | Major | A backfilled `ClosedDay` records the wrong value, and plan 09's clock rule forbids the fix

**Claim.** Plan 08 lines 395-400: `update` records `netWorthOf(model)` "at
that point of the fold", and "The worker emits every missing day when it
starts after an outage". README decision 25 proposes that backfill.

**Evidence.** The fold order is `createdAtMs` first (plan 09 line 107), and
every writer stamps `max(now, maxSeen + 1)` (plan 09 line 100). A day
backfilled at restart therefore folds after every row written since that day
ended and records the net worth at the restart. Three missed days get the same
value, a flat line where the history should move, and no writer may date a
row earlier so that it folds at the day's close. Separately, nothing writes
`timeZone` (plan 08 line 308; the Catalog at lines 406-423 has no such
Action), although every close is computed in it.

**Fix.** Let `ClosedDay` carry `closesAtMs` (the day's end in `timeZone`) and
let a System writer stamp `createdAtMs` with it, as a declared exception to
plan 09's rule that every reader refolds for; or choose gaps, decision 25's
other option. Restate decision 25 with that choice (owner question 5), and add
`SetTimeZone`.

## R3-09 | Major | `Derive.view` says where derived values are computed, not how anything reads them

**Claim.** Plan 07 lines 148-154: derived fields "are not in the Model", the
runtime computes them "as a memoized view after each fold step and before
each paint", and "painters, refusals, and screens read `Derived.netWorth`
through the same `path` vocabulary".

**Evidence.**

- A path is a value, not a reader. A screen is `(model, context?) => UiNode`
  (`packages/foldkit/src/program/program.ts` lines 37-40) and a refusal is
  `when: (model: Model) => boolean` (plan 02 line 254); neither receives
  derived values, so a Dashboard declared with `reads: [Derived.netWorth, …]`
  (plan 07 line 77) must call `netWorthOf(model)` itself.
- `Graph.check` paints "with a Model wrapped in a recording proxy" (plan 07
  line 206). The proxy sees `accounts`, `positions`, `quotes`, and the rest
  read by `netWorthOf`, never `Derived.netWorth`, so either `reads` lists
  every input or the check fails.
- "After each fold step" runs `netWorthOf` once per row during a cold fold of
  the whole log.
- `Derived` names both a `ModelPath` member (plan 02 line 277) and the derive
  view (plan 07 line 39).

**Fix.** Pass screens, painters, and refusals a `View<Model>` (the Model plus
its derived fields, computed on read and memoized per Model reference); have
the recording proxy record derived reads as `Derived` paths; compute on paint,
on availability, and on an accepted offer, not per fold step; rename the view
(`Derivations`).

## R3-10 | Major | The stored label has no mechanism to stay put, and "Counter 3" repeats after any delete

**Claim.** Plan 02 lines 178-180: `Add` "writes a display `label` ("Counter
3", the sender's count plus one) that may repeat after two concurrent adds and
never moves". Plan 05 line 38 computes it from `model.counters.length + 1`,
"stored on the row at Add; never recomputed" (line 105).

**Evidence.**

- If `update` evaluates `label`, a refold evaluates it again at the row's new
  fold position, so it moves. If the sender evaluates it, it must travel in
  `Add`'s payload, but `Add` declares only `mints: { counterId }` (plan 02
  line 68, plan 05 line 46), `Unminted<M>` removes only minted fields (plan 02
  lines 171-173), and `Mint` makes ids, not labels. Plan 07 line 182 reads
  `message.label`, a field no declaration has.
- "Count plus one" repeats on one device with no concurrency. Multiple
  Counters' own test adds a counter, deletes Counter 2, and adds again,
  expecting the new counter to be 3
  (`examples/multiple-counters/core/src/app.test.ts` lines 89-99); with this
  label the last add is a second "Counter 2". The README promises "Delete
  Counter 2, add another, and you get Counter 3"
  (`examples/multiple-counters/README.md` line 53).

**Fix.** Declare send-time fields beside `mints` (for example
`stamps: { label: model => … }`) that the send path fills from the sender's
Model and the payload carries, so a refold reads them back; number from the
largest label the sender has seen plus one, which repeats only under
concurrent adds; restate decision 21 with that.

## R3-11 | Major | No rule for a Program move while a host screen covers it in React Navigation

**Claim.** Plan 04 lines 160-165: "a host screen pushed above a Program entry
... stays above it, and the suffix driver writes only the Program's span and
reports a host pop that crosses the mount as `NavigatedBack`".

**Evidence.** Today's driver resets the whole navigator to the plan on every
Program move (`packages/react-native/src/reactNavigation/foldkitStack.tsx`
line 92). When the Model pushes while a host screen covers the span (a peer
under Mirror, a key, the menu, or an agent), the new Program page goes beneath
the visible host screen; `Navigation.current` then names a page nobody sees,
and keys, the menu, and `availabilityOf` act there. A host pop that removes
the Program's root is reported as `NavigatedBack`, which cannot remove a root
the Model always has (`packages/foldkit/src/navigation/structure.ts` lines
122-126), so the Model and the screen disagree.

**Fix.** State one rule and test it: while a host screen covers the span, the
carrier reports it and keys and the menu stop acting on the Program; a Program
move either dismisses the covering host screens or waits until the span is
uncovered (owner question 6); a host pop that removes the Program's root
reports its own fact, and the Model returns to its root.

## R3-12 | Major | The mechanical scores do not measure the rubric, half the examples are left out, and the only 3 has no host

**Claim.** Round 2 response, R1-41: "`plans/05a-example-scores.md` scores
every example by proxy (37 Programs, 1 at 3, 37 outside the rubric)". Plan 05
lines 221-225 repeat it.

**Evidence.**

- `scripts/score-examples.py` line 98 puts any directory without
  `Program.make(` or `Catalog.action(` outside the rubric. That excludes the
  legacy `examples/counters`, a `Program.compose.forEach` Program
  (`examples/counters/core/src/program.ts` lines 24 and 98) that plan 05 line
  232 scores 1, 1, 1 by reading, and 32 more that build an app with
  `Runtime.makeApplication`, `makeElement`, `makeProgram`, or `run`, among
  them `examples/auth`, the Submodel and OutMessage exemplar the
  composable-architecture skill cites in its first step. The owner asked that
  "the examples follow this ... make sure things are getting threes".
- The one 3, `transcript-player` (05a line 85), has no `Program.make` and no
  host directory at all, only `core/`, so its Hosts 3 is the absence of
  hosts.
- The proxies do not follow the dated rows. Booleans for states score 2 beside
  a Catalog (script line 86), though row 1 (today) scores them 1; terminal
  host files beyond two score 2 (line 90), though row 1 (today) scores them 1;
  a `react-bindings` package scores 1 (line 88), though only the planned row
  names it; stack edits without a combinator score 2 (line 84), though "3
  (today)" allows `Navigation.pushed`.
- 05a and plan 05's reading table disagree on Counter, Multiple Counters, and
  Books Declarations (3 against 2) and on Multiple Counters Hosts (3 against
  2).

**Fix.** Ask the owner whether apps without `Program.make` are scored (owner
question 4); make each proxy cite the row and date it implements; leave a
hostless directory unscored; run the reading pass before any score is quoted;
commit the script with the plans or drop the reference to it.

## R3-13 | Minor | `Mint.sequence` ids fail a UUIDv7 brand, and dispatch tools bypass minting

**Claim.** Plan 02 lines 166-169: `Id.uuid7('CounterId')` "declares a branded
UUIDv7 string", and "`Mint.sequence('t')` in tests gives `t-1`, `t-2`" (also
the glossary's Mint entry).

**Evidence.** If the brand checks the format, `t-1` fails to decode wherever a
test row passes through an engine, since `append` takes an `EncodedRow` (plan
06 line 121), and fails `CounterIdSegment` on `/counters/t-1`; if the brand
does not check, every string is a `CounterId` and the brand guards nothing.
`foldkit_dispatch_message` in `packages/devtools-mcp` takes a whole Message
(plan 00 lines 146-148), so an agent invents the id, and a replay that
re-presses recorded presses instead of refolding recorded Messages mints new
ids.

**Fix.** `Mint.sequence` yields valid UUIDv7s from a fixed time and a counter,
with a short form for test names; devtools dispatch and scripted replays go
through the send path with `Unminted<M>`.

## R3-14 | Minor | `Keyed.by` cannot be a plain annotation, and nothing rejects duplicate keys

**Claim.** Plan 02 lines 283-288: an array "declares its key once, on the
Schema (`Keyed.by('counterId')`, …)", which `Path.of(Model)` and `evolve.row`
use.

**Evidence.** Effect 4's `Schema.annotate` returns the Schema it was given,
with the same TypeScript type (`repos/effect-smol/packages/effect/src/Schema.ts`
lines 537-539), so a key recorded as an annotation is invisible to `Path.of`
and to the id parameter of `evolve.row`. Nothing in the plans fails a decode
with two rows under one key, so an `Each` path or `evolve.row` can address two
rows, and "a second `Add` with a known id is a no-op" (plan 05 lines 74-75) is
kept by hand in `update`.

**Fix.** `Keyed.by` returns a wrapper Schema that carries the key in its type;
decoding fails on a duplicate key; `evolve.row` takes the key's type from it.

## R3-15 | Minor | `produces` written as values cannot load and cannot express a cycle

**Claim.** Plan 02 line 248 types `produces` as `ReadonlyArray<FactTag>`, but
every North Star passes fact values.

**Evidence.** Plan 07 line 52: `LinkBank` lists `SucceededCreateLinkToken`, a
`const` declared at line 58 of the same module; evaluating the array reads it
before initialization and throws at load. A retry loop (a failed link that
produces a fresh token request) cannot be written in any order with values.

**Fix.** Tags typed against the Program's fact union
(`produces: ['SucceededCreateLinkToken']`), or thunks; say which.

## R3-16 | Minor | The glossary still collides with the plans and the code

**Evidence.**

- Ownership (glossary lines 221-223): "A logged Message may write only Domain
  fields." Plan 02 lines 216-218 log Navigation Messages too.
- Message (lines 18-19): "Never imperative", beside the Action examples
  `Increment` and `Reset` and the plans' `Add`, `Start`, and `LinkBank`.
- Fact: the Lift entry calls `Increment({ via })` a "child fact" (line 120),
  and "Fact handle" sends Actions (line 160), beside the new Fact, a Message
  nobody presses (line 193).
- Cursor (line 184): "in receipt order", while Supabase, Kafka, and Local are
  commit-ordered (plan 06 lines 148-154).
- Liveness (lines 190-192): "an active Subscription", while only `keepsAlive`
  ones count (plan 01 lines 153-155).
- `Engine.Instant.browser` (line 180) against `Engine.instant.browser` (plan
  06 line 49, plan 10 line 84).
- App (lines 175-177): "Hosts add only the surface and its Layers", while the
  engine is "A host's choice" (lines 60-62).
- New collisions: `Liveness.keepsAlive` beside Subscriptions' existing
  `keepAliveEquivalence` (`packages/foldkit/src/subscription/subscription.ts`
  lines 25-47), which Books' `clock` already sets
  (`examples/books/core/src/subscriptions.ts` line 86) and plan 01 line 156
  would also mark `keepsAlive`; `Derived` as a `ModelPath` member and as the
  derive view (R3-09); `Leaving` as the guard's answer
  (`Leaving.allowed | Leaving.ask`, plan 04 lines 131-135 and 228) and as the
  screen's state (`Editing | Asking`, line 230).

**Fix.** Correct the entries, and rename `Liveness.keepsAlive` (for example
`Liveness.holdsDaemon`), the derive view, and one of the two `Leaving` types.

## R3-17 | Minor | Supabase's policies cover two of three owners

**Evidence.** Plan 06 lines 213-218 give a select policy for `person` and
`public` owners and an insert policy for `person` only. `Owner.Room` rows (the
owned and shared rooms of line 110) can be neither read nor written, and only
the service role can append a `public` row, so a public app such as Multiple
Counters cannot write on Supabase, and today's `-mine-` and `-share-` rooms
have no Supabase form. The unique constraint (line 197) omits `app`, which
plan 02 line 186 includes.

**Fix.** A room membership table with select and insert policies on it; an
insert policy for public apps, or a sentence that public apps are read-only on
Supabase; one key in both plans.

## R3-18 | Minor | Ids printed in a form the protocol does not define, and a schema hash that can miss a change

**Evidence.** `id` is "UUIDv7, lowercase" (plan 09 line 76, plan 06 line 92),
but the envelope prints `01j9r3x8k2q5z7w9v6b4n1m0p3` (plan 09 lines 62 and
66; also plan 02 line 181 and the glossary's Segment entry), a 26-character
base-32 string that Swift's `UUID(uuidString:)` and Rust's
`uuid::Uuid::parse_str` both reject. The minted-id sentence in lines 85-86 is
false (R2-33). `schemaHash` hashes the output of `Schema.toJsonSchemaDocument`
(line 197), which Effect documents as best-effort
(`repos/effect-smol/packages/effect/src/Schema.ts` line 13410), so a Schema
change the document cannot express leaves the hash unchanged.

**Fix.** Pin the canonical 36-character UUID in the envelope and the payload,
with the base-32 form only as a URI Segment; correct the sentence; hash a
representation that covers the whole Schema (Effect's `SchemaRepresentation`),
not the JSON Schema document.

## R3-19 | Minor | Five gaps in liveness, lifting, forms, components, and migration order

- Liveness defaults to `observes`, so unmarked long work ends after the grace.
  Books' Audible import "follows an import until it is done, wherever the
  person goes meanwhile" (`examples/books/core/src/subscriptions.ts` lines
  59-61 and 159) and is missing from plan 01's `keepsAlive` list (lines
  156-157). Mark it and add a conformance case.
- The lift table (plan 05 lines 123-127) does not say how a child's `at`,
  `refusals`, and `keys` lift, and lines 63-65 fill in `at` only for `Add`,
  `Open`, `Delete`, `Confirm`, and `Cancel`. A child `Increment` declared
  `Where.everywhere` and lifted unchanged stays pressable under the delete
  question, against lines 172-174. Say that a lifted `at` becomes the parent's
  row Destinations.
- A presented Fill's `FormState` is a DeviceOwned field (plan 02 line 320),
  but a presented child's Model lives in the modal entry as Navigation state
  (plan 05 lines 163-165). Under Mirror the second sends every keystroke to
  the log and the first sends none. Give it one home.
- Plan 03 lines 54-75 write `CounterBadge` "once in the Counter example" and
  reuse it inside Multiple Counters, an import of another example's host code
  that R2-29's fix routes through `examples/shared/painters` only for
  painters. Put shared components there too.
- Plan 03's migration (lines 202-205) deletes the bindings of gate, settings,
  puzzle, ingest, casino, songbook, and issues, none of which declares a
  Catalog (05a), so `useFeature` gives them no `actions` until each gets one
  (plan 02 migration step 6). Order and size the Catalog first.

## R3-20 | Minor | Five gaps in checks, paging, URIs, and namespaces

- `Graph.check` folds "Arbitrary Models (from the Schema)" (plan 07 line
  203), most of them unreachable (a question for a counter that does not
  exist), so it reports writes no running app makes, and "every refusal's
  `when` is reachable by some generated Model" (line 209) says nothing about
  the app. Generate Models by folding arbitrary Message sequences from `init`.
- Instant's overlap is a row count sized by a time ("sized to the longest
  commit delay observed, default 200", plan 06 lines 163-166). By reasoning,
  not measurement: during a burst, such as the worker writing a batch of
  prices, more than 200 rows can commit within one delay. Re-read a time
  window of `serverCreatedAt` instead.
- `paging: None()` (plan 06 line 118) contradicts "`readSince?` → required"
  (line 351), and no engine uses it. Drop it.
- Finance's `/finance/assets/<id>` and `/finance/connect` (plan 08 lines
  476-478) do not begin with a tab slug, which plan 04 line 185 says every
  Tabs URI does. Print them under a tab or declare them outside the tabs.
- `deviceKeys` and `lease` (plan 06 lines 168-176) are new Instant
  namespaces, which `AGENTS.md` line 64 requires to go into Scribe's shared
  schema "with names that can't collide". Say so and prefix them.

## R3-21 | Minor | Counts, cross-references, and seven decisions missing from the README

- The README says its decisions are "Collected from every plan's "Decisions
  for the owner"" (lines 63-64), but seven are missing: plan 01 decision 2
  (idle grace), plan 02 decision 3 (a generic Fill form), plan 03 decision 2
  (`@foldkit/react/replay`), plan 05 decision 3 (whether an existing example
  below the gate is blocked), plan 06 decision 6 (Supabase identity), and plan
  10 decisions 1 and 2 (unplanned host cells, a browser Dictate).
- The dependency column omits plan 06 on plan 02 (an offer is the Domain
  projection, plan 06 lines 281-283) and plan 09 on plans 06 and 08 (offers in
  its startup rule, lines 123-125; Message meaning from plan 08, line 149).
- Plan 08's group counts (lines 149-161) sum to 47; the text (line 142) and
  the README (line 34) say 46.
- Plan 03 lines 14-19: "20 are packages" names 21, and 21 of the 24
  directories have a `package.json`.
- Plan 00 line 33: 42 tracked `package.json` files name those three packages,
  not 43.
- Plan 06 line 120: "(plan 25: single writers)" means R2-25.

## What the owner asked that no plan covers

- "I'd appreciate if you do a Superbase adapter": still design only (decision
  5), and its policies need R3-17 before it is built.
- "The Swift and Rust readers didn't really work ... so we need to audit them
  as well": read, not built or run (plan 09 lines 9-15); running them is
  migration step 2.
- "Make sure the examples follow this ... make sure things are getting
  threes": no example reaches 3 by reading, 37 directories are outside the
  scoring, and the reading pass has not started (R3-12).
- "If new actors come into the system ... maybe they can ask for a snapshot
  and then programs with the same user can respond": they can ask, but under
  the read-only rule a newcomer still folds the whole log before it can act
  (R3-02).
- "Make sure everything's committed and pushed to main": nothing is
  committed; `plans/`, `skills/foldkit-composition/`,
  `scripts/score-examples.py`, and `examples/counter/react/trial/` are
  untracked, and eleven tracked files are modified. The round 2 response
  defers this until the audit is done, as the owner's message allows.

## Questions only the owner can answer

New; the README's 30 are not repeated.

1. Peer offers: should a verified offer from the same actor and the same build
   be usable at once, with the device refolding in the background and
   replacing the Model on a mismatch, or stay read-only until the device's own
   fold, which with nothing saved means every boot waits for a full fold?
   Decision 6 does not offer the first.
2. Should an example's terminal commands default to the example's own engine
   (the Counter CLI on the same Instant app as its web page, as
   `examples/AGENTS.md` requires today), or to the Local log, as plan 01
   proposes?
3. When another device deletes the counter this device is showing, or the
   server finishes this device's bank link, should this device leave the page
   and end the flow by itself, as Multiple Counters does today, or show
   "deleted" or "linked" until the person moves on? The answer picks R3-01's
   mechanism.
4. Are the 37 directories without `Program.make` (Foldkit apps such as
   `auth` and `todo`, and the legacy `counters`) scored by the composition
   rubric and expected to reach 3, or outside it?
5. Finance history after a worker outage: a backfilled day is right only if
   the worker may date a row at that day's close, an exception to the clock
   rule every reader follows. Allow the exception, or keep gaps? This replaces
   the premise of decision 25.
6. When a host screen covers a Program inside a React Navigation app, may a
   Program move (a peer under Mirror, a key, an agent) dismiss it, or must the
   move wait until the person comes back?
