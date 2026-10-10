# Adversarial audit | Round 1 | 2026-10-09

Scope: the owner's saved message, `plans/README.md`, plans 00 to 10 and 01a,
`skills/foldkit-composition/SKILL.md`, the uncommitted diff of
`skills/foldkit-composable-architecture/SKILL.md`, the new "Composition rubric"
in `examples/AGENTS.md`, and the uncommitted principles 7 and 8 in
`PRINCIPLES.md` that plan 08 cites. Every claim about today's code was checked
against branch `claude/platform-adapter-packages` at `ae05f4b7a` plus the
uncommitted edits as they stood at 17:32 on 2026-10-09 (plans 01a, 06, 07, 08
and the saved message changed during the audit; this report reads their latest
versions). The reviewed client app is called "the reviewed app" throughout and
none of its identifiers are reproduced here.

## Verdict

The plans cannot be accepted as written. Three problems block: the reviewed
app is still named in the saved transcript and in five tracked files of
`examples/personal-cfo` that are already on the public fork, and plan 08 and
`PRINCIPLES.md` still describe its internals, while the owner asked to push to
`main` and the PII check passes all of it; `forEach` promises ids that are
"never reused", but ids minted in `update` are reassigned whenever a late row
triggers a refold, so a logged `Increment({ counterId: 1 })` can count someone
else's counter; and the peer-snapshot design has a trust boundary no transport
enforces and a verification step that cannot verify. Beneath those, the plans'
central derivations are underspecified or contradict each other (no plan
defines a Fact's `writes`, yet the static graph, the Domain-or-Navigation
derivation, and "what changes net worth" all depend on it; `ModelPath` and the
change paths it is checked against are different languages; `presents` puts
Domain-relevant state in device-local navigation), several designs fail against
the code or the platforms (collapsing `@foldkit/react/react-router` into the
root breaks React Native bundles, `<FoldkitScreens />` throws inside a React
Navigation navigator, the proposed daemon socket paths overflow macOS's
104-byte limit, the Supabase keyset over `now()` loses rows, Kafka's default
retention deletes the log), the rubric now live in `examples/AGENTS.md`
requires APIs that do not exist and blocks merges to every example scored 1
(by plan 05's own table, Multiple Counters and Books), and the
build order defers the item the owner said is needed now. Most factual claims
about today's code do check out: 25 root-API files across 9 examples, the
nested `<Router>` invariant, structural `Equal.equals` in Effect v4, the Effect
JSON form of `Option`, the `asOf` disagreement, and the Rust reader findings at
`1fd1bb3`. The prose rules hold: no em dashes, no labels on the plans' own
writing, and Foldkit capitalized.

## Findings

| Id    | Severity | Plan                                                        | One line                                                                                                                |
| ----- | -------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R1-01 | Blocking | user-messages, 08, `PRINCIPLES.md`, `examples/personal-cfo` | The reviewed app is named and described in files that are, or are about to be, on a public fork                         |
| R1-02 | Blocking | 05 (and Multiple Counters today)                            | Ids minted in `update` from `nextId` are reassigned by refolds, so logged Messages hit the wrong row                    |
| R1-03 | Blocking | 06                                                          | Peer snapshot offers: no transport attests the sender, and "refolding a sample window" cannot verify a Model            |
| R1-04 | Major    | README                                                      | The build order puts plan 08 fifth; the owner said "number eight ... I need now"                                        |
| R1-05 | Major    | user-messages reading, 06                                   | "No snapshots saved anywhere" became "none saved as truth"; plan 06 keeps two saved snapshots                           |
| R1-06 | Major    | 08, `PRINCIPLES.md`                                         | Principle 7 is cited as the owner's philosophy; no saved owner message says it, and principle 8 codifies an unbuilt API |
| R1-07 | Major    | user-messages reading                                       | Four ambiguous instructions resolved silently; the owner's follow-up decisions saved only as a paraphrase               |
| R1-08 | Major    | `examples/AGENTS.md`, skills                                | The live rubric requires APIs that do not exist, blocks merges, and contradicts the `Got*` convention and NOTE bar      |
| R1-09 | Major    | 01, 02, 05, 07, 08                                          | No plan defines a Fact declaration or `produces`, yet the graph and category derivation depend on them                  |
| R1-10 | Major    | 07                                                          | The graph's truth is sampled by property tests, not compiled; the plan says "the type system keeps the data true"       |
| R1-11 | Major    | 01, 02, 07                                                  | `ModelPath` patterns and `modelChangeLines` paths are different languages; row deletions shift every index              |
| R1-12 | Major    | 05                                                          | `presents` keeps the child Model in device-local navigation; its Domain `Confirm` diverges across devices               |
| R1-13 | Major    | 05, 02                                                      | Placement hides buttons but does not stop dispatch from the CLI, keys, handles, agents, or peers                        |
| R1-14 | Major    | 05                                                          | `Catalog.lift` drops a child Action's own fields; Choose and Fill children cannot be lifted                             |
| R1-15 | Major    | 02                                                          | Fill forms have no Model home for drafts; `prefill: Option<Partial<Fields>>` makes every field possibly undefined       |
| R1-16 | Major    | 02                                                          | Open choices (`accepts`) are removed though Books, Read Aloud, and the transcript player use them                       |
| R1-17 | Major    | 00, 02                                                      | The smell inventory misreads the catalog and misses the optionals that remain (Program, synchronization, handles)       |
| R1-18 | Major    | 02                                                          | A total `Program` breaks 20 of 40 `Program.make` sites and cannot express a Program with no Actions                     |
| R1-19 | Major    | 03                                                          | Collapsing the subpaths makes every root import pull `react-router`, which React Native hosts do not install            |
| R1-20 | Major    | 03                                                          | `useFeature(Counters, …)` throws under the composed bound Program; no scoped hook; Choose handles re-render every row   |
| R1-21 | Major    | 04                                                          | `<FoldkitScreens />` inside a navigator throws in React Navigation 7 and adds a second navigation state machine         |
| R1-22 | Major    | 04                                                          | `Tabs` shares one Destination across tabs, mirrors `SelectedTab` while stacks stay local, and breaks parse/print        |
| R1-23 | Major    | 04                                                          | A stack inside a Sheet carries its own `maybeModal`, so a modal over a modal becomes representable                      |
| R1-24 | Major    | 04                                                          | Drawers and parity stay thin: no drawer navigator, no leave guards, no nesting                                          |
| R1-25 | Major    | 01                                                          | A one-call terminal host has no place for platform Layers, so Node-only code moves into core                            |
| R1-26 | Major    | 01                                                          | The proposed socket paths overflow macOS's 104-byte limit; Node binds a truncated path elsewhere                        |
| R1-27 | Major    | 01, 09                                                      | No build or version handshake; old daemons serve new views, and old readers skip new rows and keep writing              |
| R1-28 | Major    | 01                                                          | `Send({ message: S.Unknown })` lets any local client forge facts onto the shared log                                    |
| R1-29 | Major    | 01, 06                                                      | Data loss: a Local engine starts fresh, offline writes are memory-only, `daemon stop` skips the drain                   |
| R1-30 | Major    | 01, 01a                                                     | The recognizer acknowledgment is a side effect in a Subscription; microphone and speech permissions are unaddressed     |
| R1-31 | Major    | 06, 01a                                                     | Projections run effects outside Commands, unordered, from several places, into production Scribe tables                 |
| R1-32 | Major    | 01, 01a, 06, 09, 10                                         | Three different Instant targets; `programMessage` has no `seq` in either schema                                         |
| R1-33 | Major    | 06                                                          | The Supabase adapter loses rows: keyset over `now()`, and Realtime drops while connected                                |
| R1-34 | Major    | 06, 09                                                      | Kafka with key `app` and default retention or compaction deletes the log                                                |
| R1-35 | Major    | 06, 09, 08                                                  | The envelope has no `actor`; `actor uuid default auth.uid()` cannot express Guest or System writers                     |
| R1-36 | Major    | 09, 10                                                      | `from` packs host, instance, and room into a string; the open Host set needs a global registry                          |
| R1-37 | Major    | 08                                                          | "Supabase is the log store and nothing more" leaves no home for vendor tokens, webhook routing, erasure, or admin       |
| R1-38 | Major    | 08                                                          | The finance Model uses booleans for states and duplicate tags; it scores 1 on its own rubric                            |
| R1-39 | Major    | 08                                                          | The `dailyClose` Subscription has N writers, no time zone, and a Model field that does not exist                        |
| R1-40 | Major    | 10                                                          | The matrix promises Dictate and Books on hosts no plan designs; no capability model                                     |
| R1-41 | Major    | 05, 03                                                      | "Make sure things are getting threes": 4 of 74 example directories scored; legacy `counters` still cited as proof       |
| R1-42 | Major    | 01a, 08                                                     | New examples planned beside existing ones that do the same job (`examples/transcribe`, `examples/personal-cfo`)         |
| R1-43 | Minor    | 01, 01a                                                     | The dictation Model differs between the two plans                                                                       |
| R1-44 | Minor    | 07, 08                                                      | Names drift between plans 07 and 08; plan 07's example fails its own `ModelPath` rule; `GotLinkToken` misuses `Got*`    |
| R1-45 | Minor    | 07, 08                                                      | `enabledIs` needs a static refusal sentence that declarations do not carry                                              |
| R1-46 | Minor    | 09                                                          | `Schema.toJsonSchema` does not exist in Effect v4, and the wire form needs `toCodecJson` first                          |
| R1-47 | Minor    | 09                                                          | Contradicts itself on decode failures; envelope example is wrong; the readers were never run                            |
| R1-48 | Minor    | 06                                                          | `isLast: boolean`, two meanings of `Delivered`, invalid `Cursor` syntax, per-row cursors Instant cannot supply          |
| R1-49 | Minor    | 01                                                          | Stringly frames and boolean modes in protocol v2 and the Local engine                                                   |
| R1-50 | Minor    | 01                                                          | `dictate help` and `dictate login` need the App, which the view path refuses to import                                  |
| R1-51 | Minor    | 00, 02                                                      | `Device = Window \| Phone \| Terminal` drops three existing device kinds and keeps presentation in core                 |
| R1-52 | Minor    | 05                                                          | Rubric scores disagree with the rubric; `ForEachConfig` is loosely typed; `onDismiss` has one value                     |
| R1-53 | Minor    | 03                                                          | Bindings inventory is incomplete; canonical criteria contradict the escape hatch                                        |
| R1-54 | Minor    | 08                                                          | The skill generator sits in the wrong package, stamps a date that breaks `--check`, and keeps hand sections             |
| R1-55 | Minor    | 01, 04, 06, 07, 08, 10                                      | North Star code uses names no plan defines, and one call site returns `HTMLElement \| null`                             |
| R1-56 | Minor    | all                                                         | Decisions taken without "Decisions for the owner"; new terms skip the glossary and collide; README edges missing        |
| R1-57 | Minor    | skills, 00, 03, 06, 09                                      | A Prettier list-item glitch in the skill, broken inline-code wraps, lowercase "processor"                               |
| R1-58 | Minor    | 04, housekeeping                                            | The kept React Router trial is excluded from typecheck and knip, so it can rot unseen                                   |
| R1-59 | Minor    | 04                                                          | `mountedAt` repeats the route path, two sources of truth for one prefix                                                 |
| R1-60 | Minor    | 06                                                          | Supabase sign-in with an Access-minted OIDC token through `signInWithIdToken` is asserted, not shown                    |

## R1-01 | Blocking | The reviewed app is named and described in files headed to a public fork

**Claim.** The saved message says the reviewed app "is named nowhere in the
plans or in `examples/finance`" (user-messages lines 21 to 23), and plan 08 says
the example "references no outside product anywhere" (line 9).

**Evidence.**

- The transcript (user-messages line 12) still names the reviewed app twice and
  spells out its directory path. Lines 4 to 5 say only the owner's bundle id was
  redacted.
- Plan 08 lines 16 to 32 describe the reviewed app's internals: six copies of
  the formula, three of which disagreed, and how; a status column with nine
  spellings; a poll that ignored a value five server paths wrote. Its formula's category list
  (line 103) and its `NeedsReauth` connection state (line 147) also appear in
  the reviewed app's code (found by searching that tree; nothing copied here).
- `PRINCIPLES.md` lines 155 to 159 (uncommitted) say "The reviewed app this
  replaces computed the same number in six places, and three of them
  disagreed."
- `examples/personal-cfo/README.md` line 1 names the reviewed app, and so do
  four more tracked files (`core/src/domain.ts`, `core/src/product.ts`,
  `docs/s0-ask.md`, and a script under `cli/` whose file name contains the
  name). Commit `95004fbe5` is already on `technoplato/main`, and
  `gh repo view technoplato/foldkit` reports `"visibility":"PUBLIC"`.
- The owner asked for everything to be "committed and pushed to main". Run on
  this working tree, the PII push check reports 26 uncommitted or untracked
  files, 0 with personal data, and prints `PASS`, so nothing automated stops
  the name.

**Fix.** Before any commit: redact the reviewed app's name and path from the
transcript the way the bundle id was redacted (or keep `plans/user-messages/`
out of git); cut plan 08 lines 16 to 32 down to a generic sentence ("a hand-kept
skill drifts from the code it describes"); delete `PRINCIPLES.md` line 158 to
159's sentence; rename and scrub `examples/personal-cfo` (or retire it in favor
of `examples/finance`, see R1-42) and ask the owner whether its public history
needs the same scrub the fork had on 2026-10-03; derive the finance categories
from public vendor documentation (Plaid account types and subtypes) instead of
the reviewed app's list; add the name to the PII scanner's private patterns so
the next push fails closed.

## R1-02 | Blocking | `forEach` ids are reassigned by refolds

**Claim.** Plan 05 lines 92 to 93: "Rows are identified by the branded `Id`,
minted by `forEach` monotonically (`nextId`), never reused, which is the rule
Multiple Counters documents today."

**Evidence.** `examples/multiple-counters/core/src/update.ts` lines 30 to 40
mint `model.nextCounterId` inside the fold, and line 140 folds `Add` with no
payload. The fold order is `createdAtMs` first
(`packages/foldkit/src/runtime/syncEngine.ts` lines 300 to 355), and a row that
lands late with an earlier `createdAtMs` triggers a refold (ADR 0013 Decision 2
and 3; plan 09 lines 92 to 97). A trace with two devices:

1. Device A presses Add; its row is stamped `createdAtMs: 1000`. A folds it and
   gets Counter 1, opens `/counters/1`, and presses `+`, logging
   `Increment({ counterId: 1 })` at 1001.
2. Device B pressed Add before it had seen A's row; B's clock stamped 999.
3. B's row reaches A. A refolds: B's Add (999) now folds first and takes id 1;
   A's own Add takes id 2.
4. A's logged `Increment({ counterId: 1 })` now counts B's counter, and A's
   open page `/counters/1` shows B's counter.

Ids are not "never reused"; they are reassigned. The fact a Message records
changes meaning after the fact, which breaks "Messages as facts".

**Fix.** Mint identity outside the fold, so a refold cannot move it. Pressing
Add returns a `MintCounterId` Command (randomness is a side effect) whose fact
`AddedCounter({ counterId })` is the Domain row; `counterId` is a branded
UUIDv7, or the writer's `from` plus `seq`, printed short in URIs. `forEach`
takes `Id` and that `mint`, drops `nextId`, and treats a second
`AddedCounter` with a known id as a no-op. Add a property test that
permutes late rows and asserts every logged Message still names the row it
named when written.

## R1-03 | Blocking | Peer snapshot offers have no enforceable trust boundary or verification

**Claim.** Plan 06 lines 151 to 169: a settled peer "with the same `actor`"
answers `SnapshotOffered { to, model, watermark }`; the requester accepts when
"the watermark's position is at or after its own cursor", "verifies by refolding
a sample window", and "verification by refold catches a wrong offer".

**Evidence.**

- No frame carries the offerer's actor, and the plan names no transport that
  attests it. Instant's processor room is joined "without making its presence
  authoritative" (`packages/instant/src/processorRoom/processorRoom.ts` line
  50); Supabase Broadcast channels are public unless created as private
  channels with Realtime Authorization policies, which the plan does not
  mention; Kafka headers are set by whichever producer writes them.
- The watermark (`packages/foldkit/src/runtime/localSnapshot.ts` lines 126 to 142) is a fold-order position, a row count, and an order-free fingerprint of
  row ids. It proves which rows were folded, not that `model` is their fold. A
  peer on a buggy build with the same `programVersion` passes it.
- "Refolding a sample window" needs the Model at the start of the window, which
  is exactly what is being verified.
- The comparison mixes orders: the watermark is in fold order
  (`createdAtMs, from, seq, id`), the cursor in receipt order (ADR 0013
  Decision 3; plan 09 lines 110 to 112). A newcomer "with no local cache" has no
  cursor at all, yet `SnapshotRequested` carries `asOf: cursor` (line 152).
- The offered `model` is the whole Model. For plan 08 that is every balance and
  holding, sent over a channel whose confidentiality is unspecified.
- Device-owned state (`keepOnRefold`, a `Listening` recorder) would ride along
  unless the offer is ADR 0013 Decision 6's "fold as a Processor that wrote none
  of the rows".

**Fix.** State the threat model (buggy peers, or hostile ones). Then: require a
transport-attested identity (Supabase private channels with `realtime.messages`
policies on `actor`; Instant room permissions on `auth.id`; Kafka ACLs per
actor); verify the row set by reading the receipt-ordered prefix's ids and
comparing count and fingerprint; treat the Model as a cache painted first and
replaced by the requester's own background refold, or require offers to be
signed by a key only the actor's devices hold; define the offer as the fold of
a Processor that wrote none of the rows, with device-owned fields at `init`.

## R1-04 | Major | The build order defers the item the owner needs now

**Claim.** README lines 35 to 45 place plan 07 and plan 08 fifth, after plans
02, 09, 06, 01, 05, and 03.

**Evidence.** Transcript: "number eight was not started. That's something I
need now." Plan 08 depends on 02 and 07 (README), and in its body also on 04
(tabs, line 252), 06 (Supabase, lines 137 to 139), and 01 (CLI words). Plan 08
line 259 already allows a small first step on Counter.

**Fix.** Split plan 08: 08a generates `skills/counter/SKILL.md` and
`skills/multiple-counters/SKILL.md` from today's Catalog (`what`, `why`,
`meta.keys`, `Catalog.commandOf`, routes) plus a minimal `at`, with `--check`
in CI, and ships first; 08b is the finance example. Reorder the README.

## R1-05 | Major | "No snapshots saved anywhere" became "none saved as truth"

**Claim.** Reading item 10 (user-messages line 55): "Snapshots: none saved as
truth". Plan 06 lines 148 to 150 keep ADR 0013's per-device cache; lines 160 to
165 add a server-written `program_checkpoint`.

**Evidence.** The owner: "I can't think of a reason why we would need snapshots
anywhere saved, but if new actors come into the system ... maybe they can ask
for a snapshot". `PRINCIPLES.md` principle 7 (line 148 to 150) says nobody
writes "a cache". ADR 0013's Consequences give the cost of no cache: 900 ms of
Starting and 1.5 MB per reload, against 105 ms and 73 KB with it.

**Fix.** Put both saved snapshots under "Decisions for the owner" with those
numbers, and make plan 06 and principle 7 agree on whatever the owner picks.

## R1-06 | Major | Principle 7 is attributed to the owner without a saved source

**Claim.** Plan 08 lines 45 to 52: "Under the owner's sync-engine philosophy
(`PRINCIPLES.md`, principle 7)".

**Evidence.** `PRINCIPLES.md` line 5 says principles 7 and 8 were "added
2026-10-09", and `git status` shows the file modified, not committed. No file
in `plans/user-messages/` contains "no SQL function, no nightly job, no read
model". `CLAUDE.md` line 18 forbids presenting a Proposed claim as decided.
Principle 8's example (line 178) presents `Action.press(… at, writes)`, which
does not exist, as "the whole declaration", inside a document the owner did not
ask to change while also saying "Don't actually integrate anything just quite
yet".

**Fix.** If the owner said it, save that message verbatim in
`plans/user-messages/` and cite it. Otherwise mark principles 7 and 8
"Proposed", or move them into plan 06 and plan 02 until accepted.

## R1-07 | Major | Ambiguous instructions resolved without saying so

**Evidence and readings.**

- "Get counter counters and books to just be canonical" (transcript). Reading
  item 5 (line 42) reads "counters" as Multiple Counters; `examples/counters`
  is the legacy example by that name.
- "Counter has 10 hosts, multiple counters has five, and lacks expo. Get uh expo
  working in fold kit HTML". Reading item 7 (line 46) reads two new hosts; it
  can also mean Foldkit HTML running inside Expo (DOM components or a WebView).
- "a grading rubric of one, two, three, best to worst, and make sure things are
  getting threes". Taken literally, 1 is best; the reading (lines 53 to 54) and
  `examples/AGENTS.md` line 174 make 3 best without flagging the conflict.
- "I'd appreciate if you do a Superbase adapter". Reading item 3 (lines 36 to 37) turns "do" into "design". An adapter package with its conformance suite is
  not an integration into any app.
- The owner's follow-up decisions survive only as the assistant's paraphrase
  (lines 50 to 52), which says "no outside product" while Plaid and SnapTrade
  are named everywhere. The brief for this audit says "no outside client".

**Fix.** List each under "Decisions for the owner" (see the questions below)
and save the follow-up message verbatim.

## R1-08 | Major | The live rubric requires APIs that do not exist

**Claim.** `examples/AGENTS.md` lines 170 to 184 and the composition skill
(lines 37 to 46, 75 to 76): 3 is "the only passing score for a new example",
"an example at 1 does not merge", and 3 requires `Action.press`/`choose`/`fill`
with `at` and `writes`, `Catalog.entriesAt`, and `presents`, with "no
hand-written `Got*` union".

**Evidence.**

- `grep` for `entriesAt`, `Action.press`, and `presents` in
  `packages/foldkit/src` finds nothing. The skill marks only `presents` as
  planned (line 21).
- Plan 05 lines 157 to 162 score every scored example 1 or 2, so under the rule
  now in `examples/AGENTS.md` a bug fix to Books or Multiple Counters "does not
  merge".
- `CLAUDE.md` line 40 and `AGENTS.md` line 48 prescribe `Got*` "for child
  Submodel results only". The exemplar `packages/typing-game/client/src/init.ts`
  (lines 4, 26, 30) hand-writes `GotHomeMessage` and `GotRoomMessage`, so the
  rubric scores the repository's own exemplar 1. The composable-architecture
  skill (lines 27 to 34) then requires a `NOTE:` on every such constructor,
  which `CLAUDE.md` line 87 forbids for "normal patterns ... framework idioms".
  No combinator handles OutMessages, so every Submodel with one needs the NOTE.
- A normative file cites a Proposed plan as its design source.

**Fix.** Mark the rubric as applying once plans 02 and 05 land and give a
"3 today" column that current APIs can meet; scope the `Got*` rule to the
Program-level combinators and leave Submodels with OutMessages at 3; align the
NOTE wording with `CLAUDE.md`; settle the rubric's direction with the owner.

## R1-09 | Major | Facts and `produces` are undefined, but everything derives from them

**Claim.** Plan 07 lines 132 to 136: `produces` is something "plan 02 adds to
`Fill` and `Press` as a required list". Plan 07 lines 59 to 61:
`Graph.whatWrites(graph, 'netWorth')` returns `[LinkBank, UnlinkBank,
RefreshedBalances, …]`.

**Evidence.**

- Plan 02's total declaration (lines 117 to 129) has neither `produces` nor
  `leadsTo`. Plan 08's table (lines 213 to 222) gives `produces` to Choose
  Actions too.
- `LinkBank` declares `writes: ['linking']` (plan 07 line 41); `linking` is not
  an input of `netWorth`, and `Graph.edges` (line 83) has no Produces edge. By
  the plan's own rules `LinkBank` is not in the answer.
- Most of what moves net worth is facts (`RefreshedBalances`,
  `LinkedInstitution`), and plan 08 lines 224 to 228 say "each writes a
  declared path". Plan 01's only fact syntax, `Fact('HeardLevel', { level })`
  (line 342), has no `writes` and is defined nowhere.
- Plan 05 lines 63 to 64 derive Domain or Navigation "from `writes`", but
  `OpenedUri` and `NavigatedBack` are facts.

**Fix.** Add to plan 02:

```ts
export const RefreshedBalances = Fact.define('RefreshedBalances', {
  fields: { balances: S.Array(Balance) },
  writes: ['accounts[].balance'],
  category: Category.Domain(),
})
```

Give all three Action kinds `produces: ReadonlyArray<AnyFact>`, add
`Produces(action, fact)` edges, define `whatWrites` as the Actions and facts that
write an input, plus every Action that produces such a fact, and fix plan 07's
example.

## R1-10 | Major | The graph is checked by sampling, not by compilation

**Claim.** Plan 07 lines 94 to 111: "the type system keeps the data true in
three ways".

**Evidence.** Only two are type-level: path names exist, and every Action
declares `at` and `writes`. Whether `update` really writes only those paths is
a generated property test over sampled Models (lines 103 to 110). The owner
asked for "a static compilation question rather than some kind of abstract
syntax tree exploration".

**Fix.** Say plainly what is compiled and what is sampled, and offer the owner
a compile-time option: build each update arm through a helper whose type admits
only the declared paths, so `writes` cannot lie without a type error.

```ts
Add: Update.writes(['counters', 'nextCounterId'], model =>
  evo(model, { counters: Array.append(newRow), nextCounterId: next }),
)
// evo(model, { navigation: … }) here fails to compile: 'navigation' is not declared
```

## R1-11 | Major | `ModelPath` and change paths are different languages

**Claim.** Plan 02 lines 133 to 135 type `writes` as `ModelPath` patterns such
as `'counters[].counter.count'`; plan 07 lines 103 to 106 check them against
`modelChangeLines`; plan 01 lines 226 to 230 send `FieldChange.path` as
`S.String`.

**Evidence.** `packages/foldkit/src/program/changes.ts` lines 7 to 46 encode the
whole Model through `S.toCodecJson` and name positional leaves:
`counters[0].counter.count`, `maybeSession.value.title`, `recorder._tag`, with
`·` for absence. Deleting Counter 1 from Counters 1, 2, 3 reports
`counters[0].counterId 1 → 2`, `counters[1].counterId 2 → 3`, and
`counters[2] … → ·`, so `tail` prints a line for every shifted leaf after one
deletion. The encoded
JSON shape also differs from the Type shape for `Option`, tagged unions, and
any transforming Schema. `modelChangeLines` runs `findFirst` per path (lines 48
to 55, 82 to 96), quadratic in the leaf count, and plan 01 runs it for every
applied Message. Deriving string-literal paths from a recursive Model type (a
`NavigationStack` over a Destination union) risks TypeScript's instantiation
depth limit, untested against Books' Model.

**Fix.** One ADT for both sides,
`ModelPath = Field({ name, then }) | Each({ then }) | Variant({ tag, then }) | Present({ then }) | Here()`,
computed on the Type side from the Schema AST, keyed by row id rather than
index; `FieldChange { path: ModelPath, before: Option<Json>, after: Option<Json> }`;
print to a string only at the edge. Measure the type depth on Books before
committing to literal paths.

## R1-12 | Major | `presents` puts Domain-relevant state in device-local navigation

**Claim.** Plan 05 lines 110 to 118: the child's `init` runs on present; "its
Model lives in the modal entry"; the parent folds the child's `Confirmed`
OutMessage into row removal. Lines 61 to 62: the child's `Confirm` is Domain.

**Evidence.** Under SharedDomain, navigation is per device (`PRINCIPLES.md`
principle 6), and ADR 0013 Decision 6 keeps it out of snapshots. Device B folds
A's Domain `Confirm` with no modal open, so B has no child Model, no OutMessage,
and keeps the counter; the snapshot ADR 0013 saves, the fold of a Processor
that wrote none of the rows, keeps it too. Today
`ConfirmDelete({ counterId })` is self-contained
(`examples/multiple-counters/core/src/message.ts` lines 105 to 131), so the plan
regresses it. A deep link to `/counters/delete/3` would also have to run the
child's `init`, with its Commands, inside `parse`.

**Fix.** The child produces a self-contained Domain fact the parent folds
without the child (`DeletedCounter({ counterId })`); the child's own Model stays
navigation-local and nothing Domain depends on it; `parse` stays pure, and the
carrier's `OpenedUri` fold runs the child's `init`.

## R1-13 | Major | Placement is not availability

**Claim.** Plan 05 lines 113 to 116: "nothing beneath the dialog can be pressed"
becomes "a consequence of placement, not a hand-written `unlessConfirming`".

**Evidence.** Placement only filters what a screen paints through
`Catalog.entriesAt`. `Catalog.messageFor`
(`packages/foldkit/src/catalog/catalog.ts` lines 593 onward) checks only
`enabled(model)`, as plan 02's `enabled: (model) => Availability` (line 128)
keeps doing. With the dialog open, `counters add` on the CLI, the `a` key, a
`useFeature` handle, an MCP tool, and a peer's row all still send `Add`.

**Fix.** Define `availabilityOf(entry, model) = enabled(model)` combined with
`placementAllows(at, currentDestination(model))` in the Catalog, use it in
`messageFor`, the daemon's `Do`, handles, and agent tools, and keep `update`
total for remote rows.

## R1-14 | Major | `Catalog.lift` cannot lift Choose or Fill children

**Claim.** Plan 05 lines 49 to 51: `forEach` lifts "the child's Actions" with
`Catalog.lift` (exists).

**Evidence.** `liftOne` replaces the child's fields with the id field alone
(`catalog.ts` lines 840 to 842), and `childOf` recognizes only payload-free
child Actions (line 870). A Counter with `SetCount({ count })` (a Fill) or a
Choose would lose its payload when lifted.

**Fix.** Specify lifting per kind with North Star syntax: a Press becomes a
Choose over rows; a Choose becomes a two-step choice (row, then value) or a
Fill `{ counterId, value }`; a Fill becomes a Fill with the id added.

## R1-15 | Major | Fill has no Model home for its form, and `prefill` is partial

**Claim.** Plan 02 lines 109 to 113 render Fill "as a form"; lines 188 to 193:
`prefill: Option.Option<Partial<Fields>>`.

**Evidence.** A form has drafts and per-field validation. The plan never says
where they live; in React local state they would be the second state machine
`PRINCIPLES.md` principle 5 forbids. `Partial<Fields>` makes every field
possibly undefined, the smell the owner named.

**Fix.** A `FormState<Fields>` sum (`Editing({ draft, issues }) | Submitting({ fields })`)
in the Model for a presented Fill, lifted by the combinator that presents it;
`prefill` returns `{ [K in keyof Fields]: Option<Fields[K]> }`.

## R1-16 | Major | Open choices are removed though three examples use them

**Claim.** Plan 02 line 242: `Choose.accepts?` becomes "`Choose` for closed
choices; `Fill` for open input".

**Evidence.** `accepts` serves listed choices plus any decodable value, with a
preferred bare press (`catalog.ts` doc lines 84 to 104).
`examples/books/core/src/audible/message.ts` line 87,
`examples/read-aloud/core/src/message.ts` line 115 (any page), and
`examples/transcript-player/core/src/message.ts` line 102 (any position) use
it. A Fill has no choices and no preferred value.

**Fix.** `Choose({ openness: Closed() | Open({ accepts }) })`, or a fourth kind,
plus migration notes for the three examples.

## R1-17 | Major | The smell inventory misreads the catalog and misses what remains

**Claim.** Plan 02 lines 27 to 29 and audit section 12: `ActionMeta.title?`,
`Choice.detail?`, `Choice.availability?`, `Choose.preferredOf?`,
`Choose.accepts?`, and `ActionConfig.enabled?` are "optional in values every
surface reads".

**Evidence.** All but `ActionMeta.title?` are constructor config the
declaration already totals: `ActionDeclaration.enabled` is required
(`catalog.ts` line 136 onward), `EntryChoice` has `maybeDetail: Option` and a
required `availability` (line 116 onward), and `ChooseDeclaration.preferredOf`
is total. The smells that remain are uncatalogued:
`ChooseDeclaration.isOpen: boolean` and `valueOf: (token: string) =>
Option<unknown>` (lines 130 to 131), `Entry.isPayloadFree` (line 369), choice
tags as `'Tag:token'` strings (`choiceTagOf`, line 648), `ActionHandle.isEnabled`
beside `maybeBecause` (`packages/react/src/interaction/interaction.tsx` lines
140 to 141), `Program.restore?`, `subscriptions?`, `managedResources?`, `ports?`,
`migrations?`, `versionedEvents?` (`program.ts` lines 147 to 173), and
`ProgramSynchronization`'s `sessionPolicyOf?`, `keepsOwnNavigation?`,
`keepOnRefold?`, and `isLocalOnly?` (lines 71 to 105). `isLocalOnly` is a boolean
predicate for a category that `messageCategory` also answers.

**Fix.** Rebuild the table from the code, and make synchronization one total
classifier:
`categoryOf: (message) => Domain() | Navigation() | LocalOnly() | DeviceOwned()`.

## R1-18 | Major | A total `Program` breaks half the existing Programs

**Claim.** Plan 02 lines 214 to 232: "`Program.make` requires all four"
(catalog, screen, navigation, synchronization).

**Evidence.** Of 40 non-test files that call `Program.make`, 20 contain no
`catalog` key (among them `examples/settings`, `puzzle`, `casino`, `wallet`,
`world`, `words`, `orbit`, `payments`, `archiver`). A Catalog is
`NonEmptyReadonlyArray` (`catalog.ts` line 285), so a Program with no Actions,
such as a viewer, cannot be written at all. The migration (lines 253 to 263)
lists neither.

**Fix.** Inventory the 20 sites; model the difference as a sum
(`Program.interactive({ catalog, … })` beside `Program.viewer({ … })`) or allow
`Catalog.empty`; schedule the migration per example.

## R1-19 | Major | Collapsing the subpaths breaks React Native bundles

**Claim.** Plan 03 lines 76 to 77: the `/interaction`, `/navigation`, and
`/react-router` subpaths "remain as aliases for one release, then go"; the root
exports `FoldkitRouter` and `FoldkitOutlet` (line 88).

**Evidence.** `packages/react/package.json` marks `react-router` an optional
peer. Native code imports `@foldkit/react/interaction` in nine files, and
`examples/puzzle/expo/src/App.tsx` imports the root. Metro resolves every static
import, so a root that re-exports router components fails to bundle where
`react-router` is not installed.

**Fix.** Keep `@foldkit/react/react-router` (or a separate
`@foldkit/react-router` package) permanently; collapse only the router-free
subpaths into the root.

## R1-20 | Major | The escape hatch cannot bind a child Program and re-renders every row

**Claim.** Plan 03 lines 45 to 61: `useFeature(Counters, model => countOf(model,
counterId))` inside `CounterRow`, with typed `actions.increment.choose(counterId)`.

**Evidence.** `useBoundTo` throws when the bound Program's id differs from the
argument's (`interaction.tsx` lines 240 to 247). Multiple Counters binds
`SyncedCounters`, whose id is `sync:actionMenu:session:multiple-counters`
(`program/sync.ts` line 574, `session/session.ts` line 852,
`actionMenu/actionMenu.ts` line 1381), so passing `CountersProgram` throws and
the plan never says which Program to pass. There is no scoped hook (TCA's
`store.scope`), so a reusable Counter row cannot bind to one row's slice.
`useActions` memoizes on every entry (line 307), and each choice's detail
carries every counter's count (`message.ts` lines 62 to 68), so with Choose
handles every `CounterRow` re-renders whenever any counter changes.

**Fix.** Add a composition-aware `useScoped(program, path)` that checks the
child Program against the bound Program's composition, not by id; memoize
handles per entry and offer `actions.increment.for(counterId)`, which reads one
choice's availability.

## R1-21 | Major | `<FoldkitScreens />` throws and doubles the navigation state

**Claim.** Plan 04 lines 105 to 108: "`FoldkitScreens` registers the Program's
entries as a screen group inside a host navigator (`<Stack.Group>`)".

**Evidence.** React Navigation 7.21.11, `@react-navigation/core`
`lib/module/useNavigationBuilder.js` line 95: "A navigator can only contain
'Screen', 'Group' or 'React.Fragment' as its direct children". A component named
`FoldkitScreens` is none of those. Even as a function, the host navigator would
hold the Program's pages beside the Model's `NavigationStack`: two navigation
state machines, which `PRINCIPLES.md` principle 5 forbids.

**Fix.** `{foldkitScreens(Stack, bound)}` returning a `<Stack.Group>` element;
a keyed carrier driver that writes only the Program's suffix of the host stack
and reports host pops as `NavigatedBack`; a stated ownership rule (host owns
below the mount, the Model owns from the mount up).

## R1-22 | Major | `Tabs` admits impossible stacks and breaks the URI law

**Claim.** Plan 04 lines 118 to 138: `Tabs<Tab, Destination> = { active, stacks:
Record<Tab, NavigationStack<Destination>> }`; inactive stacks are device state;
`SelectedTab` mirrors.

**Evidence.** The North Star (lines 70 to 81) gives each tab its own navigation
(`Dashboard.navigation`, `Accounts.navigation`), but the type uses one
Destination for every stack, so an `AccountDetail` can sit in the dashboard's
stack. Mirroring `SelectedTab` while stacks stay local switches a peer to a tab
whose stack it never had. `AGENTS.md` line 76 requires
`parse(print(destination))` to equal the destination; printing drops inactive
stacks.

**Fix.** `Tabs<Stacks extends Record<string, NavigationStack<any>>> = { active:
keyof Stacks, stacks: Stacks }`, one typed stack per tab; restate the law as
"equal up to inactive stacks reset to their roots" and test that; let the owner
decide whether inactive stacks sync.

## R1-23 | Major | A stack inside a Sheet makes two modals representable

**Claim.** Plan 04 lines 140 to 147: `Modal` becomes
`Presented<NavigationStack<Destination>>`, and "two modals at once ... remain
unrepresentable".

**Evidence.** `NavigationStack` contains `maybeModal`
(`packages/foldkit/src/navigation/structure.ts` lines 122 to 136), so the inner
stack can present a modal over the Sheet. The North Star (lines 86 to 90) gives
the inner stack `AccountEditor.navigation`, a different Destination type from
the outer.

**Fix.** An inner `PageStack<Inner> = { root: Inner, pages: ReadonlyArray<Inner> }`
with no `maybeModal`, and a separate type parameter for the inner Destination.

## R1-24 | Major | Drawers and parity stay thin

**Claim.** Plan 04's parity table (lines 155 to 166).

**Evidence.** The owner asked to be "more thorough ... with navigation stack,
with drawers" and to "look at React router and look at React navigation". Line
161 maps React Navigation's drawer navigator, a container of screens that is
persistent on wide layouts, to a modal style. The table omits leave guards
(React Router's `useBlocker`, React Navigation's `beforeRemove`), nested
navigators (a drawer holding tabs holding stacks), and layout routes that share
data.

**Fix.** Add `Navigation.drawer({ items, chrome })` as a container beside
`Navigation.tabs`, a declared leave guard as Model state
(`leaving: (model) => Allowed() | Ask({ question })`), and a nesting example.

## R1-25 | Major | A one-call terminal host has no place for platform Layers

**Claim.** Plan 01 lines 52 to 61: the whole terminal host is
`terminal({ name, app })`. Lines 90 to 101: the App in core carries
`resources: dictateResources` and `identity`. Lines 291 to 294 and 389: Books'
"player Layer in core".

**Evidence.** Books' player spawns `ffplay` (`examples/books/cli/src/daemon.ts`),
and Dictate's Microphone and Recognizer are Node or Swift
processes. A core module that browser hosts import cannot contain them
(`PRINCIPLES.md` principle 2, lines 35 to 53). Identity flows such as
`cloudflared access login` are host behavior too, and so is
`terminal: { idleGrace }`.

**Fix.** The App declares service tags (`Microphone`, `Recognizer`,
`AudioPlayer`) and nothing platform-bound; the terminal host adds one argument:

```ts
await terminal({
  name: 'dictate',
  app: () => import('dictate-core-example').then(core => core.DictateApp),
  layers: () => import('./layers.js').then(module => module.terminalLayers),
})
```

Update the rubric's "one file, one call" accordingly.

## R1-26 | Major | Daemon socket paths overflow macOS's limit

**Claim.** Plan 01 lines 118 to 121: socket, pid, lock, and log live under
`~/Library/Application Support/foldkit/<appId>/<engineKey>/`.

**Evidence.** macOS limits a Unix socket path to 104 bytes. For the user on
this machine the plan's layout gives 94 bytes for Dictate on
`instant-5417c2e3-dictate`, 107 for a finance app on
`supabase-<20-character ref>-finance`, and 114 for Multiple Counters on
`instant-e7c49961-multiple-counters`. Listening with Node on a 187-byte path
here created the socket at the path's first 104 bytes, in a different
directory, with no error. Today's helper already avoids this:
`packages/foldkit/src/cli/paths.ts` lines 14 to 26 use
`/tmp/fkc-<digest>.sock`, and a named pipe on Windows, which plan 01 does not
mention.

**Fix.** Keep hashed short socket paths keyed by app, engine key, protocol, and
build; keep pid, lock, and log in the state directory.

## R1-27 | Major | No build handshake, and old readers keep writing

**Claim.** Plan 01 line 182: `Hello({ protocol: S.Literal(2), client, viewId })`;
line 380: another protocol version gets `Failed`. Plan 09 lines 168 to 171 say
`Hello` carries a schema hash.

**Evidence.** Plan 01's `Hello` has no hash, App version, or build id. After an
upgrade, a daemon holding a recording is never idle, so it serves new views
with old code indefinitely. ADR 0013 Decision 7 and plan 09 lines 93 to 95 skip
rows of a newer version that do not decode, so an old device folds a different
Model and goes on writing Actions chosen from it.

**Fix.** `Hello` carries protocol, App id, `programVersion`, schema hash, and
build id; a mismatch answers `Refusing` with the fix ("stop the recording, then
`dictate daemon restart`"); a Processor that sees a newer `programVersion`
becomes read-only and refuses Actions until upgraded.

## R1-28 | Major | `Send` lets any local client forge facts

**Claim.** Plan 01 line 185: `Send({ message: S.Unknown })`, "the App's Message,
decoded by the daemon"; lines 237 to 239: TCP loopback as a transport.

**Evidence.** Any process that can reach the socket can send `HeardFinal` with
any text or a Domain fact, which lands on the shared log, bypassing `enabled`.
Loopback TCP has no file permissions at all.

**Fix.** Accept only Catalog Actions, checked by availability, plus the carrier
facts a Program declares (`OpenedUri`, `NavigatedBack`); resource facts come
only from Subscriptions and Commands; loopback requires a token from a `0600`
file.

## R1-29 | Major | Three paths to lost data

**Claim.** Plan 01 decision 3 (lines 400 to 402): `Engine.Local()` starts fresh;
plan 06 line 106: Local has no rows; plan 01 lines 372 to 374: `daemon stop`
releases every ManagedResource.

**Evidence.** A dictation session without a sync engine, which the owner wants
to work ("an optional sync engine"), loses every transcript when the daemon
idles out after ten minutes. With an engine, ADR 0013 Decision 6 keeps
unconfirmed writes out of the local snapshot, so a daemon killed while offline
loses them unless the engine persists an outbox, and no plan says whether it
does. `daemon stop` during `Listening` drops the finals still in the
recognizer.

**Fix.** A durable local log and outbox for terminal hosts (this needs the
owner to amend `AGENTS.md` line 62's ban on file tapes); `daemon stop` sends the
Program's stop Action and waits for `Idle` before releasing.

## R1-30 | Major | Dictation: an effect in a Subscription, and permissions nobody checked

**Claim.** Plan 01a line 19: "the Subscription acknowledges a final after
`HeardFinal` is applied". Line 18: an `AppleSpeech` Swift helper process and a
Deepgram WebSocket.

**Evidence.** A Subscription cannot know that `update` applied a Message;
acknowledging is a side effect caused by a Message, which is a Command
(`AGENTS.md` Lifecycle Primitives). macOS attributes microphone permission to
the responsible process, and Apple's speech APIs require usage descriptions in
an Info.plist; a detached Node daemon spawning a helper satisfies neither unless
the helper embeds that plist and asks for itself, and a process without
permission can read silent buffers instead of failing. How Node captures audio
for Deepgram is not stated.

**Fix.** `update` on `HeardFinal` returns `AcknowledgeFinal({ segmentId })`, a
Command using the Recognizer ManagedResource; name the capture helper (a signed
`.app` with `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`,
launched so it is its own responsible process); add `MicrophonePermission`
states to the Model; prove both with a spike before accepting plan 01a.

## R1-31 | Major | Projections are effects outside Commands, aimed at production

**Claim.** Plan 06 lines 171 to 191: a Projection "runs where the owner says
(the daemon, a browser tab, a server worker), is idempotent by Message id ...
It never feeds back into `update`". Plan 01a lines 20 and 110 to 119: it writes
Scribe's `recordings`, `transcriptions`, `transcriptionSegments`.

**Evidence.** Several runners applying `Update('recordings', sessionId,
{ title })` by arrival order produce last-writer-wins by arrival, not by log
order; idempotence by id does not order them. Table names are strings.
`AGENTS.md` line 64 names production `e7c49961` and dev `bd40c50a`; plan 01a
targets production from an example.

**Fix.** Make a Projection a headless Program whose `update` folds facts in log
order and returns typed `Upsert` Commands (visible in `tail`, testable), with a
single runner holding a lease; examples default to the dev app; table handles
typed from Scribe's schema.

## R1-32 | Major | Three Instant targets, and `programMessage` has no `seq`

**Claim.** Plan 01 line 121 and plan 06 line 56: `instant-5417c2e3-dictate`.
Plan 01a lines 8 to 10: `e7c49961`, "the one every Foldkit app shares". Plan 06
line 37 and plan 10 line 46: `InstantApps.scribe`. Plan 09 line 118: Instant's
`programMessage` has "one column per envelope field".

**Evidence.** `packages/instant/src/sync/fromTransport.ts` lines 20 to 28:
`FoldkitCounterV01` (`5417c2e3`) is "the one Instant project every example syncs
through". `AGENTS.md` line 64 says production `e7c49961` and dev `bd40c50a`;
`examples/AGENTS.md` line 100 says "Each product has its own Instant app".
`ProgramMessageRow` has no `seq` (`packages/instant/src/programLog/programLog.ts`
lines 31 to 42), and neither does Scribe's `programMessage` on
`origin/agent/claude-opus-5.5/books` (`instant.schema.ts` lines 997 to 1005),
which adds `ownerUserID`.

**Fix.** One recorded decision on the Instant target (owner), one `InstantApps`
table, and a migration step that adds `seq` and names `ownerUserID` as the
envelope's actor through Scribe's shared-schema process (`AGENTS.md` line 64).

## R1-33 | Major | The Supabase adapter loses rows two ways

**Claim.** Plan 06 line 121: `server_created_at timestamptz not null default
now()`; line 130: `readSince` pages by `(server_created_at, id) > cursor`; line
131: re-read "whenever `live` reconnects".

**Evidence.** Postgres `now()` is the transaction's start time. A transaction
that starts first and commits last lands behind a cursor a reader has already
passed, so `readSince` never returns it, breaking the guarantee in
`syncEngine.ts` lines 25 to 34 ("never behind a cursor that was read before it
arrived"). The plan concedes Realtime drops events under load; a drop without a
disconnect is never re-read.

**Fix.** A commit-ordered position (an insert trigger that takes an advisory
lock and draws from one sequence, or the WAL LSN through logical replication),
or a re-read overlap window deduplicated by id; periodic `readSince` while live,
plus gap detection per `(from, seq)`; a concurrent-insert case in the
conformance suite.

## R1-34 | Major | Kafka as configured deletes the truth

**Claim.** Plan 06 line 104 and plan 09 line 120: "topic per App, key `app`".

**Evidence.** Every record has the same key. With `cleanup.policy=compact`
Kafka keeps the newest record per key, one row for the whole App; with the
default `delete` policy it removes records older than seven days. Either way
"the log is the only truth" is gone. Browsers cannot speak Kafka, which the
plan does not say.

**Fix.** Require `cleanup.policy=delete` with `retention.ms=-1` (or tiered
storage), key by `from` or `id`, state the partition and cursor rule, and limit
Kafka to server hosts with a gateway for browsers.

## R1-35 | Major | The envelope has no actor

**Claim.** Plan 09 lines 59 to 70 define the envelope without an actor; plan
06 line 120: `actor uuid not null default auth.uid()`.

**Evidence.** `glossary.md` lines 43 to 50: the Envelope says who (`actor`),
and `Actor = Authenticated | Guest | System`. A Supabase `uuid` from
`auth.uid()` cannot be Guest or System, and plan 08's webhook worker (lines 236
to 238) has no `auth.uid()`, so its inserts fail the not-null and the
`append_own` policy (line 126) unless it runs as the service role.

**Fix.** `actor: Actor` in the envelope as a sum; Supabase columns
`actor_kind` and `actor_id` with one policy per kind; the worker's System
identity documented, with its key's custody.

## R1-36 | Major | `from` is a stringly structure, and Hosts need a registry

**Claim.** Plan 09 lines 80 to 84: `from` is `<host>-<instance>`, with `-mine-`
and `-share-` reserved. Plan 10 lines 69 to 89: `Host.register({ name: 'ink',
… })`, and the protocol's host list is "the registry's contents, published
with each release".

**Evidence.** `fromTransport.ts` lines 47 to 68 find rooms with
`from.includes('-mine-')`; `processor/host.ts` lines 133 to 140 parse the host by
longest known prefix, which an open set cannot do without a global registry,
the kind of module state plan 03 deletes (lines 91 to 94). A third-party
adapter cannot join a list published with Foldkit's releases, and Swift and Rust
must reimplement the string parsing.

**Fix.** Envelope fields `host: HostName` (grammar `[a-z][a-z0-9]*(-[a-z0-9]+)*`),
`instance: Instance`, `room: Public() | Mine() | Share({ name })`; `from` becomes
a display string; a Host is a value an adapter exports, with no registry.

## R1-37 | Major | The finance backend has no home for what vendors require

**Claim.** Plan 08 lines 137 to 139: "Supabase is the log store there and
nothing more: no table holds a computed value and no function restates a rule";
lines 245 to 248: "an admin screen is another host of the same Program".

**Evidence.** Plaid and SnapTrade need per-item access tokens and user secrets
held server-side, and a webhook carries an item id the worker must route to one
person's log; neither belongs in the log. An admin leaderboard across people
reads many logs, which a host of one person's Program cannot do. An append-only
log with no erasure path conflicts with deleting a person's financial data. The
Model's `Linking.AtProvider({ token })` (line 183) puts a Link token on the
shared log, and one device's abandoned flow leaves every device "a link is
already in progress" with no timeout.

**Fix.** A `VendorVault` service (server-side table or secret store) for tokens
and item routing; `linking` device-local with a `LinkTimedOut` fact; an erasure
design (per-person log deletion or crypto-shredding); admin aggregates as a
separate Program over many logs, or out of scope; reconcile principle 7.

## R1-38 | Major | The finance Model fails its own rubric

**Claim.** Plan 08 lines 158 to 172: `Account { isHidden: S.Boolean, isActive:
S.Boolean }`, `Holding { isCashLike: S.Boolean }`; lines 145 and 185: two
`Linked` variants.

**Evidence.** Plan 05 line 143 scores "Booleans for states" 1, and the owner's
rule is a sum per state. Two `Linked` tagged structs cannot share a module, and
a union over both is ambiguous in `M.tagsExhaustive`.

**Fix.** `Visibility = Shown() | Hidden()`, `Lifecycle = Open() | Closed({ since })`,
`HoldingKind = CashLike() | Security({ symbol })`, and `Linking.Done({ institutionId })`.

## R1-39 | Major | The `dailyClose` history

**Claim.** Plan 08 lines 245 to 248: "one `{ day, netWorth }` entry appended by a
`dailyClose` Subscription, so every device folds the same series from the log".

**Evidence.** A Subscription runs on every device, so each emits a fact: N rows
per day, or none on a day nobody is online, and the day boundary depends on
each device's time zone. If the fact stays local, devices diverge. The Model
(lines 189 to 204) has no `netWorthHistory` field.

**Fix.** One writer (the headless worker) emits `ClosedDay({ day, zone })` as a
Domain fact; `update` appends once per day; add the field to the Model.

## R1-40 | Major | The hosts matrix promises rows nobody designed

**Claim.** Plan 10 lines 21 to 31: Dictate on React, Svelte, and Foldkit HTML;
Books on Svelte, Foldkit HTML, and Expo.

**Evidence.** Plan 01a's Recognizer Layers are a Swift helper and a Deepgram
socket whose key cannot ship to a browser; no plan says how a browser captures
or recognizes speech, or how Books plays audio on Expo and Svelte.
`PRINCIPLES.md` line 40 to 41: "A host that cannot do something says so through
a declared capability", and no plan declares capabilities, so `Start` would be
offered where no Microphone Layer exists.

**Fix.** `Capability.Microphone()` and friends, provided by host Layers and read
by availability; list the Layer each matrix cell needs; mark paint-only cells
"viewer".

## R1-41 | Major | "Make sure things are getting threes" covers four examples

**Claim.** Plan 05 lines 155 to 166 score Counter, Multiple Counters, Books, and
legacy `counters`; line 176 files "one issue per example below 3".

**Evidence.** `examples/` has 74 directories. The owner: "make sure the examples
follow this ... make sure things are getting threes". Legacy `examples/counters`
scores 1 here yet is cited as a navigation proof in `AGENTS.md` line 80 and as
the list example in `PRINCIPLES.md` lines 11 to 13.

**Fix.** A scored inventory of every example, a retirement or migration
decision for legacy `counters`, and matching edits to `AGENTS.md` and
`PRINCIPLES.md`.

## R1-42 | Major | New examples beside existing ones that do the same job

**Claim.** Plan 01a proposes `examples/dictate`; plan 08 proposes
`examples/finance`.

**Evidence.** `examples/transcribe` (143 tracked files) already has a transcript
Program with Foldkit, React, Expo, CLI, TUI, and headless hosts, and its core
references Scribe (`core/src/init.ts`, `core/src/program.ts`);
`examples/transcript-player` exists too. `examples/personal-cfo` (62 tracked
files, public) is a net-worth Program with CLI and Expo hosts and no live Plaid
or SnapTrade. Neither plan mentions them.

**Fix.** For each new example, say whether it replaces or extends the old one,
and retire what it replaces (for `personal-cfo`, see R1-01).

## R1-43 | Minor | The dictation Model differs between plans 01 and 01a

**Evidence.** Plan 01 lines 305 to 329: `Segment` holds `text`, `Final` holds
`confidence`, `Listening` has no gap, and the Model is `recorder`,
`maybeSession`, `segments`, `navigation`. Plan 01a lines 57 to 92: `words` and
`speaker`, no `confidence`, `maybeGap` (but line 21 says `gap`); its writes
(lines 38 to 48) name `sessions[].title`, `copies`, `shares`, and `query`,
which plan 01's Model lacks. Plan 01 line 358 makes `Renamed`, `Started`, and
`Stopped` Domain beside Actions `Rename`, `Start`, and `Stop`, without saying
which of the pair the log holds.

**Fix.** One Model in plan 01a, quoted by plan 01; one sentence on Action
Messages versus the facts their Commands produce.

## R1-44 | Minor | Names drift between plans 07 and 08

**Evidence.** Plan 07 uses `UnlinkBank`, `AddedManualAsset`, `EditedDebt`,
`HidAccount`, `ConnectAccount`, `FailedLink`, `LinkedBank`, `FailedLinkBank`;
plan 08 uses `Disconnect`, `AddAsset`, `EditDebt`, `HideAccount`, `Connect`,
`LinkedInstitution`. Plan 08 line 87 takes `<account-id>` for `Reconnect`,
whose table row (line 217) chooses an institution. Plan 07's Model (lines 24 to 34) has no `linking`, so `writes: ['linking']` (line 41) fails its own
`ModelPath` check. `GotLinkToken` uses `Got*`, which `CLAUDE.md` line 40
reserves for child Submodel results.

**Fix.** One Catalog table in plan 08 that plan 07 quotes;
`SucceededCreateLinkToken` and `FailedCreateLinkToken`.

## R1-45 | Minor | `enabledIs` needs a sentence declarations do not have

**Evidence.** Plan 07 lines 123 to 128 print "the sentence the declaration gives
for the common refusal"; plan 08 line 84 prints "Unavailable when". Plan 02's
`enabled` (line 128) is a function whose sentence exists only at run time, and
an Action can refuse for several reasons (`Open` says "answer the delete
question first" or "it is already open").

**Fix.** Declare refusals as data:
`refusals: [Refusal({ when: isConfirming, because: 'answer the delete question first' })]`,
derive `enabled` from them, and print the list.

## R1-46 | Minor | The JSON Schema export names a function that does not exist

**Evidence.** Plan 09 line 167 cites `Schema.toJsonSchema`. Effect v4 exports
`Schema.toJsonSchemaDocument` (draft 2020-12, documented as best-effort,
`repos/effect-smol/packages/effect/src/Schema.ts` lines 13399 to 13428), and it
describes a Schema's encoded side, so the wire form needs
`Schema.toJsonSchemaDocument(Schema.toCodecJson(App.Message))`.

**Fix.** Name both calls, and add a vector that round-trips the generated
Schema through `typify` and the Swift generator.

## R1-47 | Minor | Plan 09 contradicts itself, and the readers were never run

**Evidence.** Lines 25 to 26 say TypeScript "fails closed" on unknown tags;
lines 93 to 95 and ADR 0013 Decision 7 say the fold skips them. The envelope
example (lines 59 to 70) is `app: "counter"` with `Decrement({ counterId: 2 })`,
but the Counter's `Decrement` has no payload and the Counter writes the legacy
table. Line 11: "Neither was run", though the owner's complaint is that the
readers "didn't really work". (The Rust claims do check out at `1fd1bb3`: three
`#[ignore]` live tests in `examples/counter-synced/tests`, an unreferenced
`sync_log.rs`, and `TABLE_NAME = "counter_rows"` in `counters-nav/src/sync.rs`.)
Lines 29 and 46 write "processor id" in lowercase.

**Fix.** Pick one decode-failure rule; use a Multiple Counters row in the
example; run both readers against the current log or the vectors and record
what fails.

## R1-48 | Minor | Plan 06's type shapes

**Evidence.** Line 64: `Page { isLast: boolean }`. Lines 63 to 65: `Delivered`
is both a link status and a delivered row. Line 60 `presence: Option` sits
beside line 71's rule that a missing capability fails at construction. Line 53,
`export type Cursor = S.brand('Cursor')(S.String)`, puts a value in a type
alias. Line 59 promises "the cursor after each" live row, but Instant's cursor
is a receipt count (ADR 0013 Decision 3) that a windowed subscription cannot
supply.

**Fix.** `Page = More({ rows, cursor }) | Last({ rows, cursor })`;
`Link = Delivered() | Queued({ because })`; `Received({ row })` on `live`, with
cursors coming from `readSince`; one capability model.

## R1-49 | Minor | Stringly frames and boolean modes in plan 01

**Evidence.** Line 184 `Do({ token: S.String })`; line 141
`CommandInFlight({ name: S.String })`; line 169 `Engine.Local({ inProcess: true })`;
lines 265 to 269 `Identity` as an `S.Union` over flows that run effects.

**Fix.** `ActionToken = Press({ tag }) | Choose({ tag, token }) | Fill({ tag, fields })`;
`RunIn = Daemon() | InProcess()`; Identity as a plain ADT, not a Schema.

## R1-50 | Minor | `help` and `login` need the App

**Evidence.** Plan 01 lines 76 to 77 derive `help` from the Catalog and run
`login` from the App's flow, while lines 124 to 129 keep the view path free of
core. The view must spawn a daemon, which refuses without identity (lines 272
to 276), so `dictate help` before `dictate login` prints a refusal.

**Fix.** Emit a static manifest at build time (commands, usage, identity flow
kind) from plan 08's `SkillDocument`, read by the view without importing core.

## R1-51 | Minor | `Device` drops existing kinds

**Evidence.** `ActionContext.device` today is
`'watch' | 'phone' | 'tablet' | 'computer' | 'tv'`
(`packages/foldkit/src/schema/index.ts` lines 22 to 24), not `'phone'` as the
audit says (lines 51 and 219). Plan 02 line 244's
`Window | Phone | Terminal` drops three and keeps presentation in core screens.

**Fix.** Decide whether core screens take a device; if they do, keep the five
kinds plus `Terminal`, as a capitalized sum.

## R1-52 | Minor | Plan 05's internals

**Evidence.** Line 159 scores Counter's hosts 2, but its CLI has `daemon.ts`,
`settings.ts`, and `inProcess.ts`, which the rubric's row 1 (line 143) scores 1.
`ForEachConfig` (lines 76 to 89) types `rows: string`, `slug: string`,
`Id: S.Top`, and `detail` as `string` where plan 02's Choice detail is an
`Option`; it has no `mint`, though today's rows use `id: string`
(`program/compose.ts` lines 314 to 317). Line 106: `onDismiss: 'Drop'` has one
value.

**Fix.** Rescore; type `rows` as a literal key of the Model; constrain `Id` to a
branded Schema with a `mint`; delete `onDismiss` or name its alternative.

## R1-53 | Minor | Plan 03's inventory and criteria

**Evidence.** Lines 14 to 17 list 20 bindings; `examples/*/react-bindings` has
24 directories: `world` (a tracked package) is missing, `books` holds only stale
build output, and `ingest` and `songbook` hold orphan tsconfigs. Some bindings
carry app painters that "delete the binding" would lose
(`read-aloud/react-bindings/src/googleBooksPreview.tsx`,
`pis-canvas-lab/react-bindings/src/labCounters.tsx`). Criteria 1 and 2 (lines
112 to 113: "imports only from `@foldkit/react`", "names no Action") contradict
the escape hatch (lines 45 to 61), which imports `Counters` and names
`increment`. `<ActionButton … for={counterId} />` cannot be destructured as `for`
and becomes an optional prop for Press handles.

**Fix.** Complete the inventory with a destination per painter; scope the
criteria to the window file; use `choice={counterId}` on a Choose-only button.

## R1-54 | Minor | The skill generator

**Evidence.** `@foldkit/markdown` turns markdown into Foldkit views
(`packages/markdown/package.json` description), the opposite direction from
plan 08 line 111. The frontmatter (line 68) stamps "on 2026-10-09", so
`--check`'s byte comparison (lines 126 to 127) fails the next day. Hand-written
sections between markers (lines 128 to 130) contradict "never edited" (line 44)
and the owner's "We don't want hand rolling anything". Line 124 says the
rubric requires a description on every field; the rubric does not.

**Fix.** A `foldkit/skills` module; stamp the Program version, not the date;
drop hand sections or justify them; add field descriptions to the rubric if
wanted.

## R1-55 | Minor | Undefined names in North Star code

**Evidence.** `Projection.define`, `Upsert`, `Update`, and the elided `...`
(plan 06 lines 178 to 186); `dictateResources` and `IdentityFlow` (plan 01 lines
98 to 99, 266 to 268); `Dock({ items })` (plan 04 line 152); `Derived.of`, and
`export const Model = S.Struct(…).pipe(Model.derive(…))` (plan 07 lines 24 to
34, plan 08 lines 189 to 204), which reads `Model` inside its own initializer
and fails at load; `Host.Foldkit()` (plan 10 line 45) beside `Host.register`
(line 81). Plan 10 line 47 passes `document.getElementById('root')`, an
`HTMLElement | null`, at the call site the owner's rule targets.

**Fix.** Define each name where it is introduced, import the derive helper
under another name, and have `runFoldkitWindow` take a selector and fail with a
named error when nothing matches.

## R1-56 | Minor | Governance and vocabulary

**Evidence.** README lines 49 to 52 promise "Decisions for the owner"; plans 03
to 10 take decisions inline without that section (Supabase identity, tabs sync,
deleting the root React API, the Host registry). `AGENTS.md` says to define new
terms in `glossary.md` first; none of App, Daemon, View, Liveness, LogEngine,
Cursor, Projection, Placement, ModelPath, Tabs, or Fact is there, and four
collide: `Placement` already exists in
`packages/foldkit/src/navigation/declaration.ts` line 31 (`Root | Entry |
Fallback`), "Chrome" means the action menu and focus (glossary line 150),
"Host" means the embedding surface (line 57), and "Token" is deprecated (line 157) yet reused (plan 02 line 58, plan 05 line 81). "Mount" gains a third
meaning in `mountedAt`. The README's dependency column misses 01 on 02, 01a on
06, 03 on 04, 08 on 01, 04, and 06, and 10 on 02 and 06. ADR 0014 Decision 1
puts the runtime in `foldkit/cli`; plan 01 line 287 adds `foldkit/terminal`
without amending it. Plan 01 line 283 cites `scripts/install-books-command`; it
lives at `examples/books/scripts/install-books-command`.

**Fix.** Add the sections, the glossary entries (renaming the collisions), the
dependency edges, an ADR 0014 amendment note, and the corrected path.

## R1-57 | Minor | Writing

**Evidence.** In `skills/foldkit-composable-architecture/SKILL.md` lines 33 to
34, Prettier turned "`GotVendingMessage` + `Command.mapMessages`" into a nested
list item. Inline code broken across lines leaves stray indentation in plan 00
lines 84 to 85, plan 03 lines 9 to 10, plan 06 lines 161 to 162, and plan 09
lines 32 to 33, 39 to 40, and 154 to 155. Plan 09 lines 29 and 46 write
"processor" in lowercase. Everything else in the writing rules holds: no em
dashes, no labels on the plans' own writing, and Foldkit capitalized in prose.

**Fix.** Write "and" instead of "+", reflow the inline code, capitalize
Processor.

## R1-58 | Minor | The kept trial can rot unseen

**Evidence.** `examples/counter/react/tsconfig.json` includes only `src`, and
the uncommitted `knip.json` ignores `trial/**`, so `trial/main.tsx` is neither
typechecked nor dead-code checked until plan 04's migration step 1.

**Fix.** Do step 1 now (it is mechanical), or add `trial` to a typechecked
project.

## R1-59 | Minor | `mountedAt` repeats the route path

**Evidence.** Plan 04 lines 42 to 47 write the prefix twice:
`path="/legacy/counter/*"` and `mountedAt="/legacy/counter"`. They can drift.

**Fix.** Derive the prefix inside `FoldkitOutlet` from the matched route
(`useResolvedPath('.')`) and drop the prop.

## R1-60 | Minor | Supabase sign-in is asserted, not shown

**Evidence.** Plan 06 line 133: "Access-minted OIDC through `signInWithIdToken`".
`signInWithIdToken` accepts tokens from configured providers, and Cloudflare
Access is not shown to be one.

**Fix.** A spike that signs in with an Access token, or the third-party auth
configuration that makes it work, before plan 06 is accepted.

## What the owner asked that no plan covers

- Books as a canonical example "with North Star syntax": plan 03 gives Books one
  table row (line 123) and no syntax.
- "Number eight ... I need now": no near-term slice (R1-04).
- "More thorough ... with drawers", React Router and React Navigation parity
  (R1-24).
- "Do a Supabase adapter": only designed (R1-07).
- "Make sure the examples follow this ... getting threes": four of 74 example
  directories scored (R1-41).
- The Swift and Rust readers "didn't really work": audited by reading only;
  neither was run (R1-47).
- "Save my message": the follow-up decisions are paraphrased, not saved, and the
  saved transcript still names the reviewed app (R1-01, R1-07).
- "Committed and pushed to main": no plan or note says how to push without
  publishing the reviewed app's name, given that the PII check does not know it
  (R1-01).
- "Audit the way we're doing the models ... very clean algebraic data types":
  the Program and synchronization optionals are not audited (R1-17).
- "The CLI to function with an optional sync engine": without an engine the
  transcripts vanish when the daemon idles out (R1-29).
- "The schemas that the actions require are well-defined at the declaration
  site": plan 02 shows Fill fields but never how Action and Fact declarations
  assemble the Program's Message union (R1-09).
- "React bindings ... should be in packages": the app painters inside bindings
  have no destination (R1-53).

## Questions only the owner can answer

1. Redact the reviewed app's name from the saved transcript, or keep
   `plans/user-messages/` out of git? Scrub or retire `examples/personal-cfo`,
   which already names it on the public fork, and does its history need a
   rewrite?
2. The rubric: "one, two, three, best to worst" says 1 is best; "make sure
   things are getting threes" says 3 is the target. Which?
3. "Counter counters and books": Multiple Counters, or the legacy
   `examples/counters`? Should legacy `counters` be retired?
4. "Get Expo working in Foldkit HTML": Expo and Foldkit HTML hosts for Multiple
   Counters, or the Foldkit HTML renderer running inside Expo?
5. "Do a Supabase adapter": design only, or build `@foldkit/supabase` now
   against `supabase start` without wiring it into any example?
6. Snapshots: keep ADR 0013's per-device cache, and allow server checkpoints,
   or save none at all and accept the boot cost?
7. Are principles 7 ("sync engine, not database") and 8 yours? Should they stay
   in `PRINCIPLES.md`?
8. Which Instant project do examples write to: `5417c2e3`, `e7c49961` and
   `bd40c50a`, or one per product? May a dictation example write Scribe's
   production rows?
9. Does `AGENTS.md`'s "Sync: Instant only" still hold, given a finance example
   on Supabase and terminal tools with no engine?
10. Is "declared, then checked by generated tests" static enough for the graph,
    or should `writes` be enforced by the type checker through a typed update
    helper?
11. Should skill generation from today's Catalog ship before plans 02 and 06?
12. Without an engine, should a terminal tool keep a local log file (which
    `AGENTS.md` bans for examples), or is loss on daemon exit acceptable?
13. Finance: a hosted deployment with live Plaid and SnapTrade (production
    access, retention, deletion), or recorded fixtures only? Is a leaderboard
    across people in scope?
14. Tabs: do inactive stacks sync across devices and survive a reload?
15. A drawer: a modal style, a container navigator, or both?
16. Daemon scope is per OS user; what happens when the person signs in as
    someone else?
17. Does `examples/dictate` replace or extend `examples/transcribe`, and does
    `examples/finance` replace `examples/personal-cfo`?
