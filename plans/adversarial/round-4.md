# Adversarial audit | Round 4 | 2026-10-09

## Verdict

The plans are acceptable as a design for the owner to decide on, and no
finding blocks the design itself; before the owner decides, the texts of
eight decisions need correcting, because each states something false or
leaves out what the choice costs. Round 3's blocker no longer blocks: every
plan it named now applies Domain Messages to `DomainOf<Model>`, carries a
Domain change onto a device through a declared, never-logged `reconcile`,
and lets no Domain fact lead anywhere, though R3-01's row below lists three
gaps in that fix. Of round 3's 21 fixes, 1 is verified and 20 are partial,
none missing; in most of the 20 the gap is a stale line, a missing field, or
a sentence in another plan. Of the 32 round 1 and 2 items round 3 left
partial, 10 are resolved and 22 are left, 14 of those narrower than before.
This round adds 20 findings: 0 Blocking, 9 Major, 11 Minor. No Major
changes a foundation signature; each is a rule or text that one or two plans
can add. Three of them are holes in concrete access rules (R4-05, the
Supabase policies; R4-06, the leases; R4-07, offers on Instant), and they
must be closed before any SQL or permission rule is applied, which
design-only status already guarantees. The decision texts to correct:

1. Decision 6 (peer offers): on Instant an offer is signed, not sealed, and
   anyone who joins its room can ask for one and read it (R4-07).
2. Decision 8 (the Instant target): the dictation example declares no
   identity, and no plan states the Instant owner rules its rows and the
   Scribe Projection would need (R4-04).
3. Decision 11 (how static is static enough): its second option,
   `Update.writes` on every arm, cannot be built while the helper returns no
   Commands (R4-02).
4. Decisions 18 and 38 (daemon scope, default engine): the default engine is
   declared in core, which plans 00 and 06 call the leak they remove and
   which the view cannot read to find its socket (R4-03).
5. Decision 19 (terminal views): a one-shot command at an address can
   confirm a delete no screen asked about and press an Action a dialog
   blocks, and the CLI's two-step delete stops working (R4-09).
6. Decision 21 (minted ids on screen): the stamped label repeats on one
   device after a delete or a rename (R4-08).
7. Decision 39 (device consequences): under Mirror, `reconcile` makes the
   shared stack depend on one device's own state (R4-01).

## Round 3 fixes

Verified: in the text and coherent with every plan that touches it.
Partial: present, but missing or contradicted somewhere; the row says where
and names the round 4 finding that carries the fix. No round 3 fix is
missing. Quotes are from the plans as they stand after the round 3 response.

| Id    | Severity | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3-01 | Blocking | Partial  | Resolved as a blocker: "Domain arms see only the Domain part" (plan 02 line 259), `Reconcile.declare` (lines 125-135, 267-279), "A Domain fact therefore declares `leadsTo: LeadsTo.stay`" (lines 275-276), restated in plan 05 (lines 78-85), plan 07 (lines 46-52, 91-97, 217-221), plan 08 (lines 371-392, 482-495), plan 01 (lines 315-325), and plan 01a (lines 26, 65-68). Not coherent everywhere: `reconcile` reads device state that Mirror does not share (R4-01); "holds by construction" (plan 02 line 264) only for arms written with `Update.writes`, which cannot return Commands (R4-02); finance's reconcile matches a session id that `Institution` does not store (R4-10) |
| R3-02 | Major    | Partial  | Decision 6 restated with options (a), (b), (c), and in-memory checkpoints kept in every case (README lines 81-93; plan 06 lines 148-151, 329-340, 464-473). Plan 09 lines 120-123 still refold "from a verified offer", which neither option allows (R4-16); on Instant the offer itself is readable by anyone in its room (R4-07)                                                                                                                                                                                                                                                                                                                                                           |
| R3-03 | Major    | Partial  | "keyed by exactly those three, which a view knows before any daemon exists" (plan 01 lines 107-109); the actor as state under `actors/<actorKey>/` (lines 110-115); one per-user lock directory (lines 129-132); `$XDG_RUNTIME_DIR` and `$TMPDIR`, with today's `/tmp/fkc-` helper described as it is (lines 116-121; confirmed at `packages/foldkit/src/cli/paths.ts` line 26). The engine key is now the App's `defaultEngine` (plan 01 line 124), declared in core (plan 06 line 43), which "the view path never imports" (plan 01 lines 93-94) and which the manifest does not carry (lines 94-96) (R4-03)                                                                               |
| R3-04 | Major    | Partial  | "builds a View whose navigation is the stack `parse(at)` gives ... and drops the Navigation result" (plan 01 lines 282-288; plan 02 lines 375-384); routes in the manifest and `--at` (plan 01 lines 288-290); the TUI-dialog case (lines 413-417). It breaks the CLI's tested two-step delete and lets `confirm-delete` act unasked (`examples/multiple-counters/cli/src/cli.test.ts` lines 92-107); it does not say whether `Confirm`'s Command runs or is logged (R4-09)                                                                                                                                                                                                                  |
| R3-05 | Major    | Partial  | `defaultEngine` and `server` (plan 06 lines 43-44); the override and the `local` rule (plan 01 lines 124-128; plan 06 line 56); `Host.server` and `Host.headless` (plan 06 lines 65, 72, 352-360; plan 10 lines 120, 129-131); status and refusal (plan 01 lines 140-145); README decision 38. Contradicted: plan 10's "Headless worker" row runs finance's "vendors, webhooks, ClosedDay" and Dictate's "projection runner" (line 64), and Dictate declares `Server.none` beside a `serverOnly` feed (R4-18); the engine now sits in core (R4-03); the glossary still says "never core's" (line 65, R4-20)                                                                                  |
| R3-06 | Major    | Partial  | "at most one holder at a time, except across a pause longer than the lease", idempotence or `epoch` fencing, the engine's clock, a margin, and a read-back (plan 06 lines 361-373); `epoch` and `until timestamptz` (line 249); the conformance case (lines 439-440); plan 08 lines 512-515; plan 01a lines 174-177. On Instant the conditional write is a permission rule that the worker's admin token skips, and on Supabase `program_lease` has no row level security (R4-06)                                                                                                                                                                                                            |
| R3-07 | Major    | Partial  | `refreshRequests` and `pendingDisconnects` written by the Actions and cleared by the worker's facts (plan 08 lines 321-322, 447, 460, 470-474, 517-520); `answeredBy` (plan 02 lines 229-231, 306; plan 07 lines 77, 137-141). `Fact.define` has no `answeredBy` (plan 02 line 219; plan 08 line 462; plan 07 line 155), though plan 07 line 211 says every fact declares it, and `LinkedInstitution`, which "the origin writes" (plan 08 line 487), is listed under `produces` (line 466) (R4-10)                                                                                                                                                                                           |
| R3-08 | Major    | Partial  | `ClosedDay({ day, closesAtMs })` and the declared exception (plan 08 lines 423-434; plan 09 lines 105-110); `SetTimeZone` (plan 08 lines 435, 459); decision 25 and plan 08 decision 6 restated (README lines 138-140; plan 08 lines 569-571). The exception covers "a fact whose declaration says so", and `Fact.define` has no such field; `timeZone` "defaults to the first device's zone at `init`" (plan 08 lines 435-436), a Domain value that differs per device (R4-13)                                                                                                                                                                                                              |
| R3-09 | Major    | Partial  | `View<Model>` for screens, painters, refusals, choices, and `prefill` (plan 02 lines 326-332; plan 07 lines 186-195; plan 08 lines 392-394); derived reads recorded as `Derived` paths (plan 07 lines 260-262); the derive view named `Derivations` (line 185). The glossary now defines View twice (lines 195, 241); `Derivations` is both a library type with `.none` (plan 02 line 461) and each App's const (plan 07 line 41; plan 08 line 333); "computes `netWorthOf` zero times" (plan 07 lines 192-194) against `reconcile`'s View after every apply and `ClosedDay`'s arm (plan 08 line 425) (R4-14)                                                                                |
| R3-10 | Major    | Partial  | `stamps` filled at send and carried in the payload, with `Unminted<M>` removing them (plan 02 lines 73, 191-203; plan 05 lines 39, 48, 117; plan 07 lines 228-231). "It repeats only under concurrent adds, never on one device" (plan 02 lines 195-196) is false: the stamp reads current rows, so Multiple Counters' own test gets a second "Counter 2" (`examples/multiple-counters/core/src/app.test.ts` lines 89-99), and `Rename` writes the stamped field (plan 02 line 110; plan 07 lines 237-241) (R4-08)                                                                                                                                                                           |
| R3-11 | Major    | Partial  | `CoveredByHost`, disabled Actions, dismiss or hold, `LeftProgram`, and four tested cases (plan 04 lines 164-176, decision 3; README decision 41); today's whole-navigator reset confirmed (`packages/react-native/src/reactNavigation/foldkitStack.tsx` line 92; `stack.ts` lines 135, 162-164). `availabilityOf` has no input for the cover (plan 02 lines 364-370), and `CoveredByHost` and `LeftProgram` appear in no other plan (R4-11)                                                                                                                                                                                                                                                  |
| R3-12 | Major    | Partial  | Every app scored (`scripts/score-examples.py` line 57); hostless directories listed (lines 110-112); proxies cite rows (05a lines 13-21); the reading pass is the authority (plan 05 lines 262-263); README decision 40. The Hosts proxy "the root React API alone scores 2" (script lines 94-100; 05a line 21) implements no rubric row, since row 2 (today) is host-specific chrome (plan 05 line 246); the terminal proxy counts files across hosts, so Multiple Counters' `tui.ts` passes it (05a line 63) though reading scores it 1 (plan 05 lines 284-287); `examples/AGENTS.md` line 175 still calls the planned column "3"                                                          |
| R3-13 | Minor    | Partial  | `Mint.sequence(seed)` draws valid UUIDv7s, with `Id.short` for test names, and devtools dispatch and replays use the send path (plan 02 lines 186-189, 198-203; plan 05 lines 92-93). The glossary still says "Tests use a sequence Layer (`t-1`, `t-2`)" (lines 216-217, R4-20)                                                                                                                                                                                                                                                                                                                                                                                                             |
| R3-14 | Minor    | Partial  | `Keyed.array` returns a wrapper Schema and decoding fails on a duplicate key (plan 02 lines 350-353; plan 07 lines 171-176); no plan writes `Keyed.by`. "so the no-op is a consequence of the Schema" (plan 02 lines 205-207) does not hold, since `update` decodes nothing and plan 07's `Add` arm appends unconditionally (line 229) (R4-17)                                                                                                                                                                                                                                                                                                                                               |
| R3-15 | Minor    | Verified | `produces` and `answeredBy` are tag lists typed against the fact union (plan 02 lines 226-231, 305-306); every `produces` in plans 02, 07, and 08 is a list of tags (plan 07 lines 62, 77, 87)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R3-16 | Minor    | Partial  | Message, Lift, Fact handle, Cursor, Liveness, App, Ownership, and Segment corrected, and Reconcile, Stamp, and View added (glossary lines 18-22, 122-126, 163-166, 179-256); `holdsDaemon` (plan 01 lines 152-159); `Guard = Quiet \| Asking` (plan 04 line 240). The committed Engine entry still says "A host's choice, never core's" (line 65); View has two entries (lines 195, 241); `Derivations` names a type, a module, and an App const; the Fact entry points "below" to an entry that is above (line 205) (R4-14, R4-20)                                                                                                                                                          |
| R3-17 | Minor    | Partial  | `program_room_member` with `read_room` and `append_to_room`, `public_apps.writable` with `append_to_public`, and `app` in the writer key (plan 06 lines 212, 227-247, 252-258; conformance lines 443-445). `join_room` lets any signed-in user join any room, `append_to_public` admits any actor for the anon key, and `public_apps` has no row level security (R4-05)                                                                                                                                                                                                                                                                                                                      |
| R3-18 | Minor    | Partial  | The canonical 36-character UUID in the envelope and payloads, with base-32 only as a URI Segment (plan 09 lines 62-66, 76-80; plan 06 line 95; plan 02 lines 208-210; glossary lines 251-256); the minted-id sentence corrected (plan 09 lines 87-91). "Effect's `SchemaRepresentation` of the Message Schema, which covers the whole AST" (plan 09 lines 207-209) is not what Effect builds: it follows each node's last encoding (R4-16)                                                                                                                                                                                                                                                   |
| R3-19 | Minor    | Partial  | Books' Audible import is `holdsDaemon` with a conformance case (plan 01 lines 181-187, 408-410; the import's comment is at `examples/books/core/src/subscriptions.ts` lines 59-61); `at`, refusals, keys, and writes lift per kind (plan 05 lines 146-161); drafts live in `forms` (plan 02 lines 392-399; plan 05 lines 197-202); shared components (plan 03 lines 57, 177-180); Catalogs first (plan 03 lines 206-212). No example Model declares `forms` (plan 02 lines 58-62; plan 01a lines 140-143; plan 08 lines 327-330), and plan 04's guard reads `model.form` (lines 131-136) (R4-15)                                                                                             |
| R3-20 | Minor    | Partial  | `Graph.check` folds Message sequences from `init` (plan 07 lines 252-257); the overlap is a `serverCreatedAt` window (plan 06 lines 121, 170-176); `paging: None()` is in no plan; `foldkitDeviceKeys` and `foldkitLeases` (plan 06 lines 179-183); tabbed finance URIs (plan 08 lines 527-532). The illustrative skill still prints `/finance/assets/<id>` and `/finance/connect` (plan 08 lines 96-97, 103) (R4-12)                                                                                                                                                                                                                                                                        |
| R3-21 | Minor    | Partial  | Decisions 31 to 37 (README lines 151-165); edges 06 on 02 and 09 on 06 and 08 (README lines 32, 35); groups summing to 46 (plan 08 lines 152-159); "21 are packages" (plan 03 line 14); 40 dependency lines (plan 00 line 33; plan 03 lines 19-22; 40 by `git ls-files`); "R2-25" (plan 06 line 123). The regroup names `EditAccount` and `OverrideKind` (plan 08 lines 152, 158), which no Catalog declares (lines 442-460) (R4-12)                                                                                                                                                                                                                                                         |

## Round 1 and 2 carry-overs

The 17 round 2 fixes and 15 round 1 items that round 3 marked partial.
Resolved: the problem round 3 named is gone. Left: some or all of it
remains; "narrower" means part of it was fixed. None was made moot.

| Id    | Outcome        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R2-01 | Left, narrower | Test ids are UUIDv7s (plan 02 lines 186-189) and the Supabase writer key includes `app` (plan 06 line 212); the label still repeats on one device (R4-08) and the glossary's Mint entry still says `t-1` (R4-20)                                                                                                                                                                                                                                                                                                                                                               |
| R2-02 | Resolved       | Domain consequences reach a device through `reconcile`, and Domain arms receive `DomainOf<Model>` (R3-01); the gaps that follow are new (R4-01, R4-02)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R2-04 | Resolved       | Refusals and presented children are judged at the command's address (plan 01 lines 282-291); its new gaps are R4-09                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R2-11 | Resolved       | `ClosedDay` carries `closesAtMs` and `SetTimeZone` writes `timeZone` (plan 08 lines 423-436); the default zone is new (R4-13)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R2-12 | Left           | The flow ends through `reconcile`, but `Institution` stores no `linkSessionId` for it to match (plan 08 lines 200-205, 389-392; R4-10)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R2-13 | Left           | `Update.writes` still returns only `Written` (plan 07 lines 232-235), and R3-01's guarantee now rests on it (R4-02)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R2-14 | Left, narrower | `Keyed.array` replaced `Keyed.by` and `live` is marked reconciled, but the tail sample still prints `Partial → Final` (plan 01 line 317) though `sessions` holds only finals (plan 01a lines 152-154)                                                                                                                                                                                                                                                                                                                                                                          |
| R2-15 | Left, narrower | `produces` holds tags now; `actionsAt('/finance/accounts/<id>')` still lists `UnhideAccount` and `Back` and omits `TreatAsCash`, `TreatAsInvestment`, and `RemoveDebt` (plan 07 lines 124-125 against plan 08 lines 448-457), and plan 07 lines 199-200 still say plan 08 narrows net worth's inputs, which plan 08 lines 334-347 list as whole fields                                                                                                                                                                                                                         |
| R2-16 | Resolved       | Screens, refusals, and choices read `View<Model>` (plan 02 lines 326-332); the naming gaps are R4-14                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R2-17 | Left, narrower | `examples/AGENTS.md` lines 185-188 allow the classifier and the stack moves, and the skill labels "3 (planned)"; the skill still says today's `forEach` rows carry "a branded id" (line 22) against `packages/foldkit/src/program/compose.ts` line 514 (`id: S.String`), and still names `askedToDelete`, `closedQuestion`, and `deletedCounter` as hand rolling (lines 67-68), though they use only `Navigation.pushed`, `presented`, and `withoutDestinations` (`examples/multiple-counters/core/src/update.ts` lines 55-98), which its own "3 (today)" row allows (line 52) |
| R2-19 | Left           | Plan 04 lines 146-151 still take the prefix as `useLocation().pathname` minus the decoded splat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2-21 | Resolved       | The covering-host rule exists (plan 04 lines 164-176); its gaps are R4-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R2-22 | Left, narrower | The actor is daemon state and device locks are per user (R3-03), but the engine key now comes from core, which the view cannot read (R4-03)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R2-25 | Left, narrower | `serverOnly` work runs on `Host.server`, the lease's limit is stated, and the worker sees requests (R3-05 to R3-07); the leases are open on both engines (R4-06) and plan 10 still gives worker cells to `Host.headless` (R4-18)                                                                                                                                                                                                                                                                                                                                               |
| R2-32 | Left, narrower | Plan 02 labels its outline notation (lines 9-11) and the finance fact misplaced in Multiple Counters is gone; plan 08 lines 62-66 still write `Skill` as an object of parameter lists, and plan 06 lines 129-131 write `Link` and `Page` from constructor calls with no outline label                                                                                                                                                                                                                                                                                          |
| R2-33 | Resolved       | The minted-id sentence names the row that mints the id (plan 09 lines 85-91)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R2-35 | Left, narrower | "Fact handle" is marked deprecated (glossary line 163) and Ownership matches plan 02 (lines 229-233); View now has two entries and Engine says "never core's" (R4-14, R4-20)                                                                                                                                                                                                                                                                                                                                                                                                   |
| R1-08 | Left           | Step 5 of the composable-architecture skill cites `examples/auth` for the convention but still sends readers to `examples/world/core` for `GotVendingMessage` (`skills/foldkit-composable-architecture/SKILL.md` line 35), a `Got*` wrapper with no OutMessage that 05a scores 1 (line 98)                                                                                                                                                                                                                                                                                     |
| R1-10 | Left           | See R2-13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-13 | Resolved       | See R2-04                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-14 | Resolved       | The lifted `Export` has one payload field, `selection` (plan 02 lines 171-174); the code span there breaks across lines (R4-20)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R1-21 | Resolved       | See R2-21                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-26 | Left, narrower | See R2-22                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-31 | Left           | The lease's limit is stated but the lease is open (R4-06); the Projection still folds `Renamed` (plan 06 line 392; plan 01 line 319), which plan 01a never declares (its Action is `Rename`, line 54), and reads `HeardFinal({ segment })` (plan 06 line 391) while the tail prints `sessionId`, `segmentId`, and `words` (plan 01 line 316)                                                                                                                                                                                                                                   |
| R1-37 | Left           | See R2-12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-39 | Resolved       | See R2-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-41 | Left, narrower | Every app is scored and hostless ones are listed (05a line 100); the reading pass covers four examples (plan 05 lines 277-282) and none is at 3                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R1-44 | Left, narrower | See R2-15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-47 | Left, narrower | The minted-id rule is right (plan 09 lines 85-91); the readers are read, not built or run (lines 9-15), which design only allows                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R1-55 | Left, narrower | See R2-32                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R1-56 | Left, narrower | Every plan decision is in the README (1 to 41) with the two edges round 3 asked for; new edges are missing (R4-18) and the glossary collides again (R4-14)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R1-59 | Left           | See R2-19                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## New findings

Severity as in round 3: Blocking would reopen a foundation plan if left
until after acceptance; Major is a rule or text a plan must add, or a false
premise in a decision; Minor is a gap, a drift, or a count.

| Id    | Severity | Plans                        | One line                                                                                                                  |
| ----- | -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R4-01 | Major    | 02, 06, 08                   | Under Mirror, `reconcile` and `Followed` make a device's stack depend on its own state, so a refold changes what it shows |
| R4-02 | Major    | 02, 07, 01a, README          | `DomainOf<Model>` holds by construction only through `Update.writes`, which cannot return Commands                        |
| R4-03 | Major    | 06, 01, 00, 08, glossary     | The default engine moved into core, where the plans place the leak they remove and where the view cannot read it          |
| R4-04 | Major    | 06, 01, 01a, README          | No plan states owner rules for the default engine, and Dictate has no identity on it                                      |
| R4-05 | Major    | 06                           | The Supabase policies let anyone join any room and let a guest write as anyone, and one table has no row level security   |
| R4-06 | Major    | 06, 08, 01a                  | Neither engine's lease is closed to other writers                                                                         |
| R4-07 | Major    | 06, README                   | On Instant an offer is signed, not sealed, and anyone in the room can ask for one                                         |
| R4-08 | Major    | 02, 05, 07, 08, README       | The stamped label repeats on one device, `Rename` overwrites it, and a stamp can copy a device field onto the log         |
| R4-09 | Major    | 01, 02, 04, 05, README       | The address-scoped `Do` breaks the CLI's two-step delete, confirms unasked, and leaves its Commands and logging unsaid    |
| R4-10 | Minor    | 08, 07, 02                   | The Link flow's end and chain rest on a field and a declaration kind that do not exist                                    |
| R4-11 | Minor    | 02, 04, 06, 01, 05, 09       | Refusals the runtime raises have no input in `availabilityOf`, and three new carrier facts are declared once each         |
| R4-12 | Minor    | 08, 07                       | The regrouped inventory names two Actions no Catalog has, and the answer to "what changes net worth" drops writers        |
| R4-13 | Minor    | 08, 09, 02                   | `timeZone` starts from a device, and the clock exception has no declaration field                                         |
| R4-14 | Minor    | glossary, 01, 02, 04, 07, 08 | `View` and `Derivations` each name two things, and a claim about when the View is built is contradicted                   |
| R4-15 | Minor    | 02, 01a, 08, 04              | No example Model declares the `forms` field its Fill Actions need                                                         |
| R4-16 | Minor    | 09                           | `SchemaRepresentation` covers only the encoded side, and plan 09 refolds from an offer                                    |
| R4-17 | Minor    | 02, 07                       | `Keyed.array` rejects a duplicate only at decode, so the duplicate `Add` no-op is still written by hand                   |
| R4-18 | Minor    | 10, 06, 08, 01a, README      | The server role is drawn three ways, and the build order uses host kinds before they exist                                |
| R4-19 | Minor    | 07, 02                       | `reconcile` declares what it writes, not what it reads, so the graph prints a sentence nothing declares                   |
| R4-20 | Minor    | glossary, 00, 02             | The glossary, a header, and two code spans still say the old thing                                                        |

## R4-01 | Major | Under Mirror, `reconcile` and `Followed` make a device's stack depend on its own state, so a refold changes what it shows

**Claim.** Plan 02 lines 267-271: `reconcile` is "typed to write only
DeviceOwned and Navigation paths. The runtime runs it on every device after
every apply and every refold, never logs it". Lines 280-284: a Local
`leadsTo` "travels as this device's navigation does under the session
policy: under Mirror it is logged as the Program's Navigation fact
`Followed({ leadsTo })`, so peers follow it".

**Evidence.** By reasoning over the plans' text, not a run.

- Nothing limits what `reconcile` reads. Finance's `reconcile` writes
  `navigation: Navigation.dismissed(LinkFlow)` when `finishedLinkOf(view)`
  is `Some`, which is "when `linking` is `AtProvider` or `Exchanging`"
  (plan 08 lines 374-392), and `linking` is DeviceOwned (lines 327-330).
- `SucceededCreateLinkToken` is Local and "leads to the `LinkFlow`
  presentation" (plan 08 line 464; plan 07 line 88). Under Mirror every peer
  presents `LinkFlow` through `Followed` with its own `linking` at `Idle` and
  no token to show, and no peer's `reconcile` ever dismisses it, while the
  linking device's does. The stack Mirror promises to share differs, and no
  logged Message says why.
- One device can disagree with itself. Plan 02 lines 487-488 derive
  `keepOnRefold` from ownership without saying whether a refold keeps or
  refolds Navigation under Mirror; today a refold replaces the Model except
  the kept fields (`packages/foldkit/src/program/sync.ts` lines 379-392). If
  Mirror navigation is kept, two devices that received concurrent moves in
  opposite orders keep different stacks. If it is refolded, a late row that
  refolds the linking device from a checkpoint before `Followed` presents
  `LinkFlow` again, and `reconcile`, which now reads `linking` as `Done`,
  leaves it open.
- When `reconcile` runs inside a refold is written three ways: "after every
  apply and every refold" (plan 02 line 270), "after every apply and
  refold" (plan 05 line 82), and "after each step" (plan 07 line 258). If a
  refold runs it once at the end, a Mirror log of `Delete(c2)`, another
  device's `DeletedCounter(c2)`, and `Delete(c3)` pressed after the question
  closed can fold to the list on the refolding device and to the c3
  question on a live one, depending on how a total `update` treats a
  present over an open modal.
- `Followed({ leadsTo })` carries a declaration, `LeadsTo<Destination>`
  (plan 02 line 307), written with a Destination tag such as
  `LeadsTo.push(CounterDetail)` (line 98), so a peer cannot rebuild a Local
  move to a Destination that has fields.

**Fix.** Under Mirror, let `reconcile`'s Navigation writes read only Domain
and Navigation fields (type the read side of those writes), and give
`LinkFlow` the `linkSessionId` so its dismissal reads `institutions` alone
(with R4-10's field). Say that `reconcile` runs after every fold step,
inside a refold and from a checkpoint, and that checkpoints hold the
reconciled Model; say what a refold does with Navigation fields under each
session policy; make `Followed` carry the Destination value. Or declare that
a Program whose flows present DeviceOwned state runs SharedDomain only
(owner question 1).

## R4-02 | Major | `DomainOf<Model>` holds by construction only through `Update.writes`, which cannot return Commands

**Claim.** Plan 02 lines 259-264: "For a Domain declaration,
`Update.writes(Declaration, (domain, message, evolve) => …)` receives
`DomainOf<Model>` ... "Folded identically everywhere" holds by construction
(R3-01)."

**Evidence.**

- The helper's arm "returns an opaque Written<typeof Add>" (plan 07 lines
  232-235); no plan gives it Commands, the gap round 3 recorded under R2-13.
- `HeardFinal` is a Domain fact (plan 01a lines 65-68) whose arm "returns
  `AcknowledgeFinal({ segmentId })`, a Command on the Recognizer" (line 26),
  so it cannot use the helper. "An arm that opts out is scored 2 and relies
  on the check alone" (plan 07 lines 266-268), and the check compares the
  paths that moved with `writes` (line 256), never what an arm read.
- No plan types an opted-out Domain arm. If the runtime passes only the
  Domain part (plan 02 lines 262-264) to an arm typed on the whole Model,
  `model.recorder` compiles and is `undefined` when the arm runs: the
  "possibly undefined" value the owner calls "mostly a code smell"
  (`plans/user-messages/2026-10-09-cli-runtime-and-platform-abstractions.md`
  line 14).
- README decision 11's second option, "`Update.writes` on every arm so
  nothing is left to a test" (lines 105-107), cannot be chosen while the
  helper has no Commands.
- The helper lands with plan 07 (its migration step 3, lines 292-293) at
  build step 6 (README line 53), after the Multiple Counters rebuild at
  step 4 (line 48), so the proof case is rebuilt before its Domain arms are
  typed on `DomainOf<Model>`.

**Fix.** Let the helper return `[Written<D>, Commands]`; assemble `update`
by category so that every Domain arm, helper or not, is typed on
`DomainOf<Model>`; move `Update.writes` into plan 02's migration; restate
decision 11.

## R4-03 | Major | The default engine moved into core, where the plans place the leak they remove and where the view cannot read it

**Claim.** Plan 06 line 43, under `// core`:
`defaultEngine: Engine.instant({ app: InstantApps.dev }), // what every host uses unless configured`.
Plan 01 lines 107-109: the socket and the daemon lock are keyed by
`(App.id, Engine.key, OS user)`, "which a view knows before any daemon
exists"; line 124: the engine is the App's `defaultEngine` unless
`FOLDKIT_ENGINE` overrides it.

**Evidence.**

- The plans name an engine in core as the defect they remove: "The engine
  is chosen in core" (plan 06 line 25, under "What is wrong today");
  "types the start config on `InstantSnapshotLogDatabase`, so core knows
  Instant" (plan 00 lines 47-48), closed by "engine chosen by the host"
  (line 58). Plan 06's North Star opens "Core declares what travels. Hosts
  choose where." (line 36), and the glossary says "A host's choice, never
  core's" (line 65). `InstantApps` lives in `@foldkit/instant` (plan 06
  lines 165-166), so every example's core would import the Instant adapter.
  The owner: "the sync needs to be made agnostic of what sync engine is
  actually being used"
  (`plans/user-messages/2026-10-09-cli-runtime-and-platform-abstractions.md`
  line 14).
- The view cannot compute its socket path. "The view path never imports
  core" (plan 01 lines 93-94) and "imports Node builtins only" (line 139).
  The manifest carries "commands, usage, each Action's routes, the identity
  flow's kind" (lines 94-96) and is built from plan 08's `SkillDocument`,
  which "takes a Program, not plan 06's `App`" (plan 08 lines 45-46), so it
  cannot carry the App's engine. Without `FOLDKIT_ENGINE` the view does not
  know the key it must hash, which is R3-03's defect moved from the actor
  to the engine.
- Browser hosts still pass the engine themselves (plan 06 line 52; plan 10
  line 84), so the default is restated per host rather than named once.

**Fix.** Name an example's engine once outside core (a file every host of
the example imports), have the build write its `EngineKey` into the
terminal manifest, and keep `App.define` engine-free; or keep an
engine-neutral descriptor in `App.define` and still put its key in the
manifest. Restate decisions 18 and 38 and the glossary's Engine entry with
the choice (owner question 3).

## R4-04 | Major | No plan states owner rules for the default engine, and Dictate has no identity on it

**Claim.** Plan 06 line 252: "Policies go by `owner`". Lines 40-47:
`DictateApp` defaults to `Engine.instant({ app: InstantApps.dev })` with
`identity: Identity.none`.

**Evidence.**

- Owner rules are written for Supabase only (plan 06 lines 230-247). For
  Instant, plan 06 adds columns and maps "Scribe's `ownerUserID` ... to
  `owner`" (lines 184-186). Scribe's rule for `programMessage` at
  `705b80f8`, the commit plan 01a reads, allows `view` and `create` only
  when `auth.id` is the row's `ownerUserID` or a linked account (Scribe's
  `instant.perms.ts` lines 1619-1635, read with `git show`). Under the rule
  plan 06 maps `owner` onto, a `Public` row (Multiple
  Counters' log, plan 06 line 257) or a `Room` row (the rooms R3-17 gave
  Supabase policies) cannot be created, and a worker's System row in a
  person's log can be written only with the admin token (R4-06).
- `DictateApp` declares `identity: Identity.none`, yet plan 01 offers
  `dictate login`, "the App's identity flow" (line 85), and "The daemon
  acquires identity before starting the Program" (line 341). With no
  identity there is no `auth.id`, so under the rule above the daemon cannot
  write; no plan says which owner a Guest's row gets, apart from the legacy
  upcast to `owner: Public` (plan 06 lines 110-113).
- Before R3-05 a tool with no engine kept its log in a file on the person's
  machine (plan 06 lines 288-294). Now dictated speech goes by default to a
  shared cloud app (the dev app other examples and Scribe's development
  build use, README decision 8, lines 96-98) under rules no plan has
  written, and the Projection into Scribe's tables, which are keyed by
  Scribe's owner, has no owner to write for.

**Fix.** Write Instant's rules beside the Supabase SQL for each owner
(Person, Public for listed apps, Room for members) and for System writers;
give Dictate an `Interactive` identity and a Person owner, or keep an App
with `Identity.none` on the Local log; say which owner a Guest's row gets
(owner question 4).

## R4-05 | Major | The Supabase policies let anyone join any room and let a guest write as anyone, and one table has no row level security

**Claim.** Plan 06 lines 253-257: "Room rows (today's `-mine-` and `-share-`
rooms) are read and written by the room's members through
`program_room_member`; a public app's rows are written by anyone, guests
included, when `public_apps.writable` says so".

**Evidence.** By reading the SQL and Supabase's documentation, not a run.

- `join_room` (line 247) checks only `actor_id = auth.uid()::text`, so any
  signed-in user, including a Supabase anonymous user, who "assumes the
  `authenticated` role" (supabase/supabase
  `apps/docs/content/guides/database/postgres/row-level-security.mdx` line
  93, read through `gh` on 2026-10-09), can add a membership for any
  `(app, room)`, after which `read_room` (lines 236-238) and
  `append_to_room` (lines 243-245) admit them. A `-mine-` room is an owned
  room.
- `append_to_public` (lines 241-242) checks
  `actor_id = coalesce(auth.uid()::text, actor_id)`, which holds for any
  `actor_id` when `auth.uid()` is null (the anon key), and nothing
  constrains `actor_kind`, so a guest can append as a named person or as
  `system`.
- Public rows are readable by anyone (line 235), so a guest learns each
  writer's `(host, instance, seq)` and can insert the next `seq` first; the
  writer's own append then violates `program_message_writer_seq`, which plan
  06 treats as an `EngineError` because "128-bit instances make a bug, not a
  chance" (lines 259-262).
- Row level security is enabled on two of the four tables (lines 230-231).
  Supabase: "A table in an exposed schema without RLS is readable and
  writable by any role with a grant on it" (`row-level-security.mdx` line
  12). `public_apps` (line 227) decides which apps anyone may write;
  `program_lease` is in R4-06.
- The conformance case (lines 443-445) tests a non-member reading and
  appending, not joining, a forged actor, or a taken `seq`.

**Fix.** Grant membership through the room's owner or an existing member
(an invitation the insert policy checks); in `append_to_public` require
`actor_kind = 'guest'` for the anon key and `actor_id = auth.uid()` with
`actor_kind = 'authenticated'` otherwise; enable row level security on
`public_apps` with a read-only policy; treat a `seq` collision from another
session as a refusal of that row, not an engine fault; add these cases to
the suite (owner question 7).

## R4-06 | Major | Neither engine's lease is closed to other writers

**Claim.** Plan 06 lines 187-191: on Instant "A holder acquires by a
conditional write whose rule compares the stored `until` with the server's
`request.time`, confirms by reading the row back, and carries the row's
`epoch`". Lines 270-272: on Supabase "a conditional update ... and `epoch`
incremented on every acquisition for fencing".

**Evidence.**

- Instant: "Permission checks will not run for queries and writes from our
  admin API" and "As an admin, you bypass permissions" (instantdb/instant
  `client/www/app/docs/backend/page.md` lines 43-44 and 147, read through
  `gh` on 2026-10-09). The worker writes System rows into persons' logs
  (plan 08 lines 507-509), which Scribe's `programMessage` rule admits only
  for the owner (R4-04), so the worker holds the admin token. If it takes
  the lease with that token the rule never runs: two workers that read an
  expired row both write, each can read back its own write before the other
  lands, and both carry the same `epoch` (by reasoning).
- Nothing says who may write `foldkitLeases` (lines 181-191). A rule that
  compares only `until` with `request.time` lets any signed-in person take
  a lapsed lease and stop every refresh and `ClosedDay` the worker serves.
- Supabase: `program_lease` (line 249) has no row level security (lines
  230-231 cover two other tables), so the anon key can read, take, or delete
  a lease, or raise `epoch` and fence out the real worker (R4-05's source).
- Plan 01a lines 174-177 fence the Projection by "a lease epoch the rows
  carry". Scribe's rows would need a new epoch field, a shared-schema change
  no plan lists, compared by a permission rule that the admin token also
  skips.

**Fix.** On Instant, take and renew the lease through `db.asUser(...)` as a
dedicated worker identity whose rule alone may write `foldkitLeases`, and
say so; on Supabase, enable row level security on `program_lease` with no
client policy, or move it to an unexposed schema; fence the Projection by
idempotent upsert keys, or name the identity that writes Scribe's rows and
how its writes are compared.

## R4-07 | Major | On Instant an offer is signed, not sealed, and anyone in the room can ask for one

**Claim.** Plan 06 lines 342-344: an offer "travels only on the
actor-private channel over TLS, never on the shared log, and never to a
`Guest` actor."

**Evidence.**

- On Instant the channel is a presence room, and "Instant permissions apply
  to namespaces, not rooms" (plan 06 lines 177-178). Instant's
  documentation: "Users in the same room will receive updates from every
  other user in that room", and a topic reaches "every other user in the
  room listening for that topic" (`client/www/app/docs/presence-and-topics/page.md`
  lines 20 and 30); its permissions page never mentions rooms. The offer is
  signed with an HMAC key (plan 06 lines 177-181), which proves who sent it
  and hides nothing.
- The request is not signed:
  `SnapshotRequested { app, programVersion, by: { host, instance } }`, and
  "The settled peer with the smallest `instance` answers" (lines 308-312).
  A peer cannot tell a requester's actor on an Instant room, so it cannot
  keep "never to a `Guest` actor".
- So anyone who learns a room's name can publish a request and receive the
  person's Domain Model, which "for finance" is "every balance" (line 342)
  and for Dictate every transcript (by reasoning). README decision 6 (lines
  81-93) presents offers on Instant as needing only "the signed-key
  namespace of plan 06".

**Fix.** Seal offers with a key derived from the actor's key in
`foldkitDeviceKeys`, and sign requests with it, so a peer answers only a
device of the same actor; or turn offers off on Instant, so every boot is a
cold fold, and say so in decision 6 (owner question 5).

## R4-08 | Major | The stamped label repeats on one device, `Rename` overwrites it, and a stamp can copy a device field onto the log

**Claim.** Plan 02 lines 193-196: the label is stamped "from the largest
label the sender has seen plus one, and never moves. It repeats only under
concurrent adds, never on one device (R3-10)." Plan 05 lines 96-99: the
README's promise "holds on one device". README decision 21 (lines 128-130):
"the label repeats only under concurrent adds".

**Evidence.**

- The stamp is `model => nextLabel(model.counters)` (plan 02 line 73; plan
  05 line 48), and `DeletedCounter` "removes the row on every device and
  nothing else" (plan 05 lines 78-79), so after a delete the largest label
  left can be lower than one already issued. Multiple Counters' own test
  adds Counter 2, deletes it, adds again, and expects 3
  (`examples/multiple-counters/core/src/app.test.ts` lines 89-99); this rule
  gives a second "Counter 2", and plan 05 lines 92-93 say `app.test.ts`
  "keeps every assertion it has today".
- `Rename` writes the stamped field: `writes: [path.counters.each.label]`
  (plan 02 line 110), with the arm `evo(row, { label: () => message.title })`
  (plan 07 lines 237-241). A row has no other display field (plan 05 line
  62), so after one rename `nextLabel` must read a number out of free text,
  and "never moves" (plan 02 line 195) holds only until someone renames.
- A stamp reads the whole sender Model (`StampedField<Model>`, plan 02 line
  301). Ownership limits what a Message writes and what a Domain arm reads
  (lines 251-266), not what a stamp copies into the payload, so nothing
  stops a stamp from putting a DeviceOwned value on the log, such as the
  link token plan 08 says "never reaches the log" (line 280).

**Fix.** Keep the number and the name apart (a `number` stamped at `Add`, a
`title` that `Rename` writes); stamp from a Domain high-water mark that
`DeletedCounter` does not lower; restate decision 21 and plan 02 decision 1;
limit a stamp's reads to Domain fields plus the device fields its
declaration names (owner question 6).

## R4-09 | Major | The address-scoped `Do` breaks the CLI's two-step delete, confirms unasked, and leaves its Commands and logging unsaid

**Claim.** Plan 01 lines 282-288: the daemon "builds a View whose navigation
is the stack `parse(at)` gives, running a presented child's pure `init`
when the address names one, judges availability there ..., applies the
invocation to that View, keeps the Domain and Local results, and drops the
Navigation result".

**Evidence.**

- Today the CLI deletes in two one-shot commands: `delete 1` prints "Delete
  Counter 1?", the next `confirm-delete` deletes, and `confirm-delete` with
  no question open is refused with "no delete is waiting for an answer"
  (`examples/multiple-counters/cli/src/cli.test.ts` lines 92-107). Under
  the rule above, `delete 1` is a Navigation Action whose only result is
  dropped, so no question is open for the next command; and
  `confirm-delete` at `/counters/delete/<id>` runs the question's `init`, is
  enabled, and deletes a counter that no screen asked about.
- Multiple Counters' README promises, as "checked in `core/src/app.test.ts`
  and `core/src/live.test.ts`", that while the question is open
  "`counters increment 2` is refused too"
  (`examples/multiple-counters/README.md` lines 214-217). From a second
  terminal it is now judged at `/counters/<id>` and applied, as plan 01's
  own case says for `add` (lines 415-417). Plan 05 rewrites that README list
  only "for minted ids and stamped labels" (lines 307-309), and README
  decision 19 (lines 123-125) names neither change.
- The question's `Confirm` is a Navigation Message whose `update` "returns
  a Command that produces `onConfirm(destination)`" (plan 05 lines 203-206).
  "Keeps the Domain and Local results" does not say whether that Command
  runs, whether `Confirm` is logged (under Mirror a logged `Confirm` reaches
  every peer), or whether a Local `leadsTo` is logged as `Followed`.
- A one-shot `open 1` drops its only result; today it prints "at
  /counters/1" (`cli.test.ts` line 88), and no plan says what it prints.
- "applies the invocation to that View" (plan 01 line 286; plan 02 line 378) against "`update` never receives a `View`" (plan 02 line 332; plan 07
  line 191).
- The view fills `at` from the argument (plan 01 lines 288-290), but "the
  CLI accepts a unique prefix, resolved against the Model" (plan 02 lines
  211-212) and the view holds no Model; a prefix fails `CounterIdSegment`
  and `parse` gives NotFound.
- The address View is not reconciled, so `rename <a deleted id>` is judged
  on a page `reconcile` would drop, passes, and logs a no-op.
- Plan 04 lines 167-168: while a host screen covers the Program, "keys, the
  menu, and agents stop acting on the Program"; through `Do.at` an agent
  acts at a named address with no screen moving (plan 02 lines 376-382).

**Fix.** Decide which Actions an address may enable (owner question 2):
either a presented child's Actions need the question open on the daemon,
which keeps today's tests and means a one-shot `delete` opens the question
there, or decision 19 says a command can confirm unasked and the README list
changes with it. Then run the invocation's Commands, log nothing
Navigation-owned from an address, print the moved View for a one-shot
Navigation Action, resolve prefixes in the daemon before `parse`, reconcile
the address View before judging it, and say whether a covered Program
refuses an agent's `Do`.

## R4-10 | Minor | The Link flow's end and chain rest on a field and a declaration kind that do not exist

**Claim.** Plan 08 lines 389-392: "`finishedLinkOf` is `Some` when `linking`
is `AtProvider` or `Exchanging` for a session that `institutions` now
carries". Plan 07 line 211: "Every Action and fact declares `writes`,
`produces`, `answeredBy`, and `leadsTo`".

**Evidence.**

- `Institution` is `{ institutionId, name, provider, connection }` (plan 08
  lines 200-205), and `LinkedInstitution` folds "into `institutions` and
  `accounts` and nothing else" (line 488). No Domain field holds a
  `linkSessionId`, so `finishedLinkOf` has nothing to match and the device
  never leaves the flow: R2-12's sentence, now routed through `reconcile`.
- `Fact.define(tag, { what, fields, writes, produces, leadsTo })` (plan 02
  line 219), plan 08's facts "each with `writes`, `produces`, and
  `leadsTo`" (line 462), and plan 07's `FactNode` (line 155) carry no
  `answeredBy`, against plan 07 line 211.
- `LinkedInstitution` comes from another writer: "the origin writes
  `LinkedInstitution({ linkSessionId, … })` as a Domain fact" (plan 08 line
  487). By plan 02's definitions that is `answeredBy`, "the facts another
  Processor writes in answer" (line 306), yet `ReceivedPublicToken` lists it
  under `produces` (plan 08 line 466) and plan 07 prints the chain without
  `answered: true` (line 119). The origin also writes `accounts`, which the
  worker writes too, against "Every vendor-fed input is ... written by one
  server-hosted worker" (plan 08 lines 145-147).

**Fix.** Store the session on the Domain side (`Institution.linkedBy`, or a
`linkSessions` field); add `answeredBy` to `Fact.define` or drop facts from
rule 2; declare `LinkedInstitution` as answered; name the origin as a writer
or move the exchange into the worker.

## R4-11 | Minor | Refusals the runtime raises have no input in `availabilityOf`, and three new carrier facts are declared once each

**Claim.** Plan 02 lines 364-370: availability is the first refusal that
holds on the View, then
`missingCapability(entry.needs, context.capabilities)`, then placement.

**Evidence.**

- Plan 04 lines 164-168: while a host screen covers the span, "every Action
  there is `Disabled({ because: 'a host screen is open' })`". Plan 01 lines
  143-145 and plan 06 lines 358-360: on a shared engine with no worker, the
  Actions whose `answeredBy` facts come from the worker refuse with "no
  worker is running for this log". Neither is a refusal on the View, a
  capability (`RefreshBalances` declares `needs: []`, plan 07 line 79), or
  placement, so `availabilityOf` cannot produce either, and the generated
  skill, which prints refusals as data (plan 02 lines 317-322), cannot print
  them. How a Processor sees a worker is not stated, and Kafka has no
  presence (plan 06 line 159).
- `CoveredByHost` and `LeftProgram` (plan 04 lines 165, 172) and `Followed`
  (plan 02 line 283) appear in no other plan: not in plan 05's derived
  categories (lines 86-88), plan 09's vectors (lines 185-194), or plan 01's
  "two carrier facts" (lines 292-294). If `CoveredByHost` is logged, one
  phone's host screen disables every Mirror peer; if `LeftProgram` is, every
  Mirror peer returns to the root when one device leaves.
- A `reconcile` move while covered (another device deletes the counter
  beneath a host screen) is a Program move; whether it dismisses the host
  screen, as the proposed rule does for a peer's move (plan 04 lines
  168-171), is not said.

**Fix.** Give `availabilityOf` a runtime input (`Covered | Uncovered`,
`WorkerSeen | WorkerMissing`) with fixed sentences the skill prints; say per
engine how a worker is seen; declare `CoveredByHost` as a Local fact and
`LeftProgram` and `Followed` as Navigation facts in plans 02, 05, and 09,
with vectors.

## R4-12 | Minor | The regrouped inventory names two Actions no Catalog has, and the answer to "what changes net worth" drops writers

**Claim.** Plan 08 lines 150-159, the inventory's "Fed by" column; line 123,
the skill's "Through a chain" sentence.

**Evidence.**

- "Fed by" names `EditAccount` (line 152) and `OverrideKind` (line 158),
  which appear in no Catalog (lines 442-460), no fact list (lines 462-478),
  and neither `whatWrites` answer (plan 07 lines 115-118; plan 08 line 122).
- Inputs the inventory counts have no writer: "a manual account's entered
  `balance`" (line 152), "a manual stock's `quantity`" (line 153, "Written
  by" the worker only), and a `Manual()` token source (line 235); no Action
  adds a manual account, position, or token.
- "Through a chain: LinkBank and Reconnect (...); RefreshBalances (...)"
  (line 123) omits `LinkBrokerage`, which produces the same chain (line
  445), and `Disconnect`, answered by `Disconnected`, which writes
  `accounts` and `positions` (lines 447, 470-471). This is the owner's own
  question, "what actions update my net worth".
- The illustrative skill still prints `/finance/assets/<id>` and
  `/finance/connect` (lines 96-97, 103) against the tabbed URIs (lines
  527-532), and R2-15's drifts in plan 07 remain (carry-over table).

**Fix.** Declare `EditAccount`, `OverrideKind`, and Actions for manual
accounts, positions, and tokens, or mark those inputs out of the first cut
(owner question 8); regenerate the illustrative skill and `actionsAt` from
the Catalog table.

## R4-13 | Minor | `timeZone` starts from a device, and the clock exception has no declaration field

**Claim.** Plan 08 lines 435-436: "`timeZone` is written by `SetTimeZone`, a
Choose on the Dashboard, and defaults to the first device's zone at `init`."
Plan 09 lines 106-108: "a System writer may stamp a fact whose declaration
says so with a time the fact carries".

**Evidence.**

- `timeZone` is Domain (plan 08 lines 307-309, 327-330), "folded
  identically everywhere" (plan 02 line 247). `init` runs on every device
  and none knows it is the first, so devices in two zones fold different
  Domain values until someone presses `SetTimeZone`, and the worker closes
  days in its own zone (plan 08 lines 423-424). A peer offer from another
  zone never matches the requester's own fold (plan 06 lines 320-326).
- No declaration field says a fact may be backdated: `Fact.define` carries
  `what, fields, writes, produces, leadsTo` (plan 02 line 219). Readers
  cannot tell an allowed backdated `ClosedDay` from a writer that ignored
  the clock rule, and on a public Supabase log a guest can write as
  `system` (R4-05).
- A backfilled day records the inputs the Model held at that close, and the
  worker wrote no prices while it was down, so a day in an outage still
  repeats the last prices before it; `DayClose` (plan 08 line 277) carries
  nothing that says so.

**Fix.** Start `timeZone` as a sum (`Unset | Zone`), with the worker closing
no day until it is set, or default it to UTC; add a declared field to
`Fact.define` naming the time a backdated fact carries, and accept such a
row only from a System actor; say in plan 08's History section what a
backfilled day records.

## R4-14 | Minor | `View` and `Derivations` each name two things, and a claim about when the View is built is contradicted

**Evidence.**

- The glossary defines **View** twice: "a short-lived client of the daemon"
  (line 195) and "the Model plus its derived fields" (line 241). Plan 01
  uses both in one bullet, "The daemon builds a View" and "The view fills
  `at`" (lines 282-289), beside `viewId`, `AttachedView`, and "The view
  path" (lines 139, 168, 218).
- `Derivations` is the library's type with a constructor,
  `derivations: Derivations<Model> // Derivations.none when nothing is derived`
  (plan 02 line 461), and also each App's const,
  `export const Derivations = Derive.declare(Model, …)` (plan 07 line 41;
  plan 08 line 333), which shadows it in that module: the collision R3-16
  removed from `Derived`.
- Plan 07 lines 191-194: "The View is built on paint, on an availability
  check, and on an accepted peer offer, not once per fold step, so a cold
  fold of a long log computes `netWorthOf` zero times." `reconcile` receives
  the View "after every apply" (plan 02 lines 268-270; plan 07 line 46), and
  `ClosedDay`'s arm "records `netWorthOf(domain)` at that point of the
  fold" (plan 08 line 425), once per closed day.
- Plan 04 still hands screen functions a Model:
  `title: (destination, model) =>` (line 121) and `leaving: model =>`
  (lines 131, 238), where plan 02 line 328 gives screens `View<Model>` and
  plan 05 line 54 writes `title: ({ counterId }, view) =>`.

**Fix.** Rename the daemon client in plan 01 and the glossary (for example
"attachment"); name the library type `DerivationsOf<Model>` with
`Derive.none`; say the View's derived fields are computed lazily and that
`netWorthOf` runs once per `ClosedDay` in a fold; pass a View to plan 04's
`title` and `leaving`.

## R4-15 | Minor | No example Model declares the `forms` field its Fill Actions need

**Claim.** Plan 02 lines 394-395: "A Fill's draft and validation live in one
DeviceOwned `forms` field keyed by the presenting Destination".

**Evidence.**

- Multiple Counters declares `counters` and `navigation`, "everything else
  is Domain" (plan 02 lines 58-62), beside the Fill `Rename` (lines
  102-115). Dictate's DeviceOwned list is `permission`, `recorder`, `live`,
  `copies`, `query` (plan 01a line 141), beside the Fills `Rename`,
  `RenameSpeaker`, `Share`, and `Search` (lines 54-59). Finance declares
  only `linking` (plan 08 line 328), beside `AddAsset`, `EditAsset`,
  `AddDebt`, and `EditDebt` (lines 452-456). Plan 02's own example lists
  `forms` beside `recorder`, `permission`, and `live` (line 242), a
  dictation Model that disagrees with plan 01a's.
- Plan 04's leave guard reads `model.form` as `Clean | Editing` (lines
  131-136), while plan 02's draft is
  `Editing({ draft, issues }) | Submitting({ fields })` inside `forms`
  (lines 395-396). Plan 04 also puts `Guard = Quiet | Asking` "in the
  screen's Model slice" (line 240) without an ownership; as Navigation
  state it would paint "Discard your changes?" on every Mirror peer over a
  form that is empty there.

**Fix.** Have `Ownership.declare` add `forms`, or have the combinators
derive it, and show it in each example Model; rewrite plan 04's guard over
`forms`; declare `Guard` DeviceOwned.

## R4-16 | Minor | `SchemaRepresentation` covers only the encoded side, and plan 09 refolds from an offer

**Claim.** Plan 09 lines 207-210: "The `schemaHash` in `Hello` is a hash of
Effect's `SchemaRepresentation` of the Message Schema, which covers the
whole AST, not of the JSON Schema document". Lines 121-123: a late row
"triggers a refold from the nearest in-memory checkpoint before it, or from
a verified offer (plan 06)".

**Evidence.**

- Effect builds a representation from each node's last encoding:
  `const last = SchemaAST.getLastEncoding(ast)` and
  `if (ast !== last) { return recur(last, identifier) }`
  (`repos/effect-smol/packages/effect/src/internal/schema/representation.ts`
  lines 54-58), where `getLastEncoding` follows `ast.encoding` to its end
  (`SchemaAST.ts` lines 3095-3097). `Schema.toRepresentation` is that
  function (`Schema.ts` lines 13317-13319), and `toJsonSchemaDocument`
  starts from it (line 13422). A change on the decoded side that encodes
  the same, such as a field going from `S.String` to `S.NumberFromString`,
  leaves the hash unchanged. The representation keeps checks and
  annotations the JSON Schema document drops; it does not cover "the whole
  AST". The `buildId` in `Hello` catches such a change between TypeScript
  builds, and across languages the encoded side is what a reader sees.
- Option (a) keeps an offer read-only "until this device's own fold
  agrees", and option (b) refolds "in the background and replaces the Model
  on a mismatch" (plan 06 lines 464-471); neither makes the offer a base to
  refold from.

**Fix.** Say that the hash covers the encoded form, which is the wire, and
that `buildId` covers the rest; drop "or from a verified offer", or tie it
to the option the owner picks.

## R4-17 | Minor | `Keyed.array` rejects a duplicate only at decode, so the duplicate `Add` no-op is still written by hand

**Claim.** Plan 02 lines 205-207: "`update` treats a second row with a known
id as a no-op, and `Keyed.array` refuses to decode a duplicate key, so the
no-op is a consequence of the Schema (R3-14)."

**Evidence.** `update` works on decoded values, and nothing decodes between
arms. Plan 07's `Add` arm appends unconditionally:
`evolve({ counters: Array.append(rowOf(message.counterId, message.label)) })`
(lines 228-230), and `Graph.check` asserts paths, not uniqueness (lines
252-257). If two rows ever carry one `counterId` (readers deduplicate by
envelope `id`, plan 09 line 128, not by `counterId`), the arm appends both,
and the duplicate surfaces only at the next decode, a restore or an offer,
which then rejects the whole Model instead of ignoring a row.

**Fix.** Give `evolve` on a `Keyed.array` path an insert that ignores a
known key, use it in `Add`, and drop "a consequence of the Schema".

## R4-18 | Minor | The server role is drawn three ways, and the build order uses host kinds before they exist

**Evidence.**

- Plan 10's matrix row "Headless worker" gives finance "vendors, webhooks,
  ClosedDay" and Dictate a "projection runner" (line 64), all `serverOnly`
  work, while "`Host.headless` (kind `Headless`) folds everything and starts
  none" (lines 129-131; plan 06 line 72). Plan 10 decision 1 lists "Books
  and Dictate as headless workers" as unplanned (lines 143-145), while the
  matrix marks Dictate's cell "yes".
- `DictateApp` declares `server: Server.none` (plan 06 line 44), yet its
  reverse feed "is a `serverOnly` Subscription" (plan 06 lines 401-402;
  plan 01a lines 185-186), and "An App with such work declares
  `server: Server.needed`" (plan 06 line 356).
- On Local "the daemon is the only Processor and takes the server role
  itself" (plan 06 lines 357-358; plan 01 lines 140-142), but webhooks,
  which "arrive the same way" (plan 08 lines 515-516), cannot reach an
  NDJSON file on a laptop, and the vault "on the server" (lines 503-506)
  serves a log it cannot see.
- `Host.server` and `HostKind` are defined in plan 10 (lines 116-131),
  built at step 7, and plan 06's single writers need them at step 3
  (README lines 45-47, 54). Plan 08b relies on plan 09's clock exception and
  its row does not list 09 (README line 34); plan 06 cites plans 10 and 01
  (lines 354, 360) and its row lists neither (line 32).

**Fix.** Rename the row "Server worker" and give it `Host.server`; declare
`Server.needed` for Dictate or move the reverse feed into the Projection;
say that a finance daemon on Local receives no webhooks and polls instead;
move the host kinds into plan 06 or reorder the build; add the dependency
edges.

## R4-19 | Minor | `reconcile` declares what it writes, not what it reads, so the graph prints a sentence nothing declares

**Claim.** Plan 07 line 17: "What does a Domain change do on this device? |
`reconcile`'s declared paths (plan 02), read as `Reconciles` edges".

**Evidence.** `Reconcile.declare(Model, [paths], (view, evolve) => …)` lists
the paths it writes (plan 02 lines 267-269; plan 07 line 46). Yet
`Graph.reconciles(graph, path.linking)` prints
`{ when: 'institutions gains this device's linkSessionId', … }` (plan 07
lines 130-131), a sentence no declaration carries, and no edge names the
Domain fields that trigger it, so "what does `DeletedCounter` do on this
device" has no static answer beyond "reconcile may write navigation".

**Fix.** Give `Reconcile.declare` a typed `reads` list and a `when`
sentence, as Actions carry refusal sentences, and draw `Reconciles` edges
from those reads.

## R4-20 | Minor | The glossary, a header, and two code spans still say the old thing

**Evidence.**

- Mint: "Tests use a sequence Layer (`t-1`, `t-2`)" (glossary lines
  216-217), against R3-13's valid UUIDv7s (plan 02 lines 186-189).
- Engine: "A host's choice, never core's" (glossary line 65), against the
  App entry ("its default engine ... Declared once in core", lines 179-181)
  and plan 06 line 43.
- Fact: "The older "Fact handle" entry below predates this split" (line
  205); that entry is above, at line 163.
- Plan 00's header says "Revised after adversarial rounds 1 and 2" (lines
  8-9), though R3-21 changed its line 33, and that line calls
  `counters-core-example`, which is `examples/counters/core`, one of "the
  hand-mapped bindings packages".
- Two inline code spans that round 3's response wrote break across lines:
  `selection: { counterId, format }` (plan 02 lines 173-174) and the
  `FormState<Fields>` sum (lines 395-396). The response says the
  inline-span check passes on `plans/` (`round-3-response.md` line 78).

**Fix.** Correct the three glossary lines and plan 00's header and line 33;
rejoin the two spans.

## Questions only the owner can answer

New; the README's 41 are not repeated.

1. Under Mirror, should other devices follow this device into a flow only
   this device can finish (a bank link, a recording), or do finance and
   Dictate run SharedDomain only? (R4-01)
2. May a one-shot command at an address confirm a delete that no screen is
   asking about, and press an Action that a dialog on an attached screen is
   blocking, or must a confirmation need the question open on the daemon,
   as Multiple Counters' README and CLI tests promise today? (R4-09)
3. Where is an example's engine named: in core's `App.define`, which puts
   the Instant adapter into every example's core, or in a file all of the
   example's hosts share, which the build copies into the terminal
   manifest? (R4-03)
4. Must Dictate sign in before it records, so transcripts are owned by the
   person on the shared engine, or does an App with no identity stay on the
   Local log? (R4-04)
5. On Instant, should peer offers be encrypted with the actor's device key,
   or turned off, so that every boot folds the log? (R4-07)
6. Is a counter's number kept apart from its name, so "Counter 3" keeps its
   number after a rename, or may a rename replace it? (R4-08)
7. Who may add a member to a shared room: its owner, any member, or anyone
   holding an invitation link? (R4-05)
8. Should the finance example's first cut let a person enter manual
   accounts, positions, and tokens, which the inventory counts and no
   Action can enter today? (R4-12)

## Scope and method

Read: `plans/README.md`, plans 00 to 10 with 01a and 05a, round 3 and its
response, both saved owner messages, the glossary's "Plans vocabulary
(proposed)" and the committed entries it amends,
`skills/foldkit-composition/SKILL.md`, the diff of
`skills/foldkit-composable-architecture/SKILL.md`, the rubric in
`examples/AGENTS.md`, principles 7 and 8 in `PRINCIPLES.md`, and
`scripts/score-examples.py`. Claims about code were checked on branch
`claude/platform-adapter-packages` at `ae05f4b7a` with the working tree's
uncommitted edits: `packages/foldkit/src/` (`cli/paths.ts`,
`program/sync.ts`, `program/compose.ts`, `processor/host.ts`,
`subscription/subscription.ts`), Multiple Counters' core, CLI, tests, and
README, Counter's CLI, Books' Subscriptions, and
`packages/react-native/src/reactNavigation/`. Effect claims were read in
`repos/effect-smol/packages/effect/src/` (`Schema.ts`, `SchemaAST.ts`,
`SchemaRepresentation.ts`, `internal/schema/representation.ts`). Instant's
backend, presence, and permissions pages and Supabase's row level security
page were read through `gh` on 2026-10-09; Scribe's `instant.perms.ts` was
read at `705b80f8` with `git show`, without a checkout.

Counts recomputed: 40 `package.json` files with a dependency line on the
three packages (`git ls-files`); 25 files in 9 examples importing the root
React API; 255 lines in Counter's 7 CLI source files; a 9-member host enum;
41 non-test files calling `Program.make` (40 by file name plus
`packages/react/src/test/routedCounter.ts`), 35 of them without a Catalog;
and 46 inputs across plan 08's eight groups. The writing rules round 3
checked still hold in the plans, apart from the two code spans in R4-20.
R4-01, the `seq` collision in R4-05, the double acquisition in R4-06, and
the reach of an offer in R4-07 rest on reasoning over the plans and the
vendors' documentation, not on a run. This file names no client and names
people only by role.
