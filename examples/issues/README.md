# Issue Tracker | Foldkit Client Matrix

This example runs one renderer-independent `IssueTrackerProgram` across Foldkit,
React, React Native, OpenTUI, and one-shot CLI Clients.

The Program owns typed navigation, the filing draft, live Issue collection
state, first-class Application and Library filing domains, and independent
selected-Issue observation. Clients only render `Destination` values and send
canonical `Message` facts.

The triage inbox observes `TriageCandidate` drafts from the same Instant app.
Each draft retains a first-class Application or Library, an exact
`RecordingSegment`, transcript text, and a protected share URL into the longer
recording context. Promote is the only transition that creates an Issue;
Dismiss leaves the canonical Issue collection unchanged.

The live web Clients use one Instant app through `@foldkit/instant-tools`.
Offline and test Clients use the same service contracts with deterministic
resources.

## The `issues` command: the one way to file and change Issues

`cli` builds `issues`, installed as `~/.local/bin/issues`. It is the only
writer agents use for the tracker at issues.pisspoursoftware.xyz: every
subcommand runs the `IssueTrackerProgram`, and every write goes through the
tracker's checked operations in `@foldkit/instant-tools`.

```sh
issues file --title "…" --details "…" --product scribe --priority P1 --type defect \
  --area "Recording / images" --related 502,691 --criterion "…" --evidence FocusedTest \
  --said 208:1884-1888 --typed "…" --typed-session <id> --typed-message <id> --typed-at <iso> \
  --log "Filed from Recording 208." --claim claude-code/<agent>   # or --from-json draft.json
issues show 692 [--json]
issues list [--status Open,InProgress] [--product scribe] [--recording 208] [--claimant …] [--search …] [--json]
issues list --landing | --wip | --stuck | --target-build 106   # work in progress, one line each
issues log 692 progress "what happened; next step" [--agent …] [--claim …] [--status …] [--commit …] [--json]
issues claim 692 claude-code/<agent> ["what the claim is for"]
issues status 692 VerificationNeeded
issues link 692 502 691
issues edit 692 [--title …] [--details …] [--priority P1] [--type …] [--area …] [--product …]
issues criterion 692 "<one observable outcome>" [--evidence FocusedTest,Log]
issues satisfy 692 1 issue-692-criterion-2 [--unsatisfied]
issues subtask add 804 "Red: the window census" "Green" "Merge for build 106"
issues subtask check 804 1 issue-804-subtask-2      # uncheck takes the same
issues wip 804 --branch agent/claude/timeline-804 --repo realtime-voice \
  --worktree ~/Sync/worktrees/scribe-timeline-804 --commit 8b89b2f1b \
  --target-build 106 --state green --step "Green: 37 focused tests"
issues wip 804 --stuck "Waits on the 106 cutter"     # or --abandoned "…", --active
issues wip 804                                       # print it; --clear removes it
issues mention 692 --said 208:1884-1888 [--typed "…" --typed-session <id> --typed-at <iso>]
issues attach 662 screenshot.png [--kind Screenshot]
issues download issues/662/<id>-screenshot.png [directory]
issues delete 693 --yes "<Michael's typed words>"
issues products [--json]
issues products add --id acaga --name ACAGA --kind Application [--json]
```

- `file` takes the next free number. It never writes over a stored Issue:
  when another writer takes the number first, it takes the next one. When the
  Issue is created but cannot be read back, the message names the number it
  was created under, so check it before filing again.
- `--said 208:1884-1888` reads those lines from the Scribe mirror (`$SCRIBE_ROOT`,
  default `~/Scribe`) word for word and writes the recording, its time span,
  and a words deep link per line into the Mention.
- `log`, `claim`, `status`, `link`, `edit`, `criterion`, `satisfy`, `mention`,
  and `attach` change one thing, read the Issue back, and fail when the change
  did not land. `satisfy` takes a criterion's position or id.
- `link` and `file --related` refuse a number no Issue holds (exit 3) and
  write nothing.
- `subtask add` adds each title once, unchecked, as `issue-804-subtask-1`,
  `-2`, and so on; `subtask check` and `uncheck` take a position or an id.
  `show` prints the checklist as `Subtasks (1 of 3 done)`.
- `wip` records where an Issue's work is. Only the flags given change, so
  `issues wip 804 --state pushed` keeps the branch and worktree. The landing
  states run Exploring (no test yet), Red (failing tests committed), Green
  (they pass), Pushed (on the remote), Merged (on main), and Shipped (in an
  installed build). `--stuck "why"` and `--abandoned "why"` say what holds
  the work, `--active` says it moves again. The agent recorded is `--agent`,
  or `$SCRIBE_AGENT`.
- `list --landing` lists the work close to landing: Green or Pushed, not
  abandoned. Stuck work stays in that list with its reason. `--wip` lists
  every Issue with work recorded, `--stuck` the stuck ones, and
  `--target-build 106` the work meant for build 106. Each line ends with where
  the work is and its branch, such as
  `Green for build 106  agent/claude/timeline-804`.
- `list` fails (exit 1) when a stored Issue cannot be read, naming it.
- `delete` needs Michael's typed yes and first writes the stored record to
  `$ISSUES_BACKUP_DIR` (default `~/Sync/audit/issues-deleted`).
- `products add` saves a product under its own Instant row and reads it back,
  so `issues edit 790 --product acaga` can file under it at once. It refuses
  (exit 2) an id that is not lowercase words joined by hyphens, a blank name,
  and an id or name another product holds; adding the same product again
  changes nothing.
- Exit codes: 0 done, 1 the tracker failed (the message names the operation
  and the real cause), 2 a usage error (the message lists the valid values),
  3 the Issue does not exist.
- Credentials come from `~/.config/instant-tools/instant.env`
  (`INSTANT_TOOLS_ENV_FILE` overrides it) and are never printed.

## The site: issues.pisspoursoftware.xyz

`react` is the site behind Cloudflare Access at issues.pisspoursoftware.xyz
(page loads on issues.knophy.com redirect there). It paints the same
`issuesScreen` as `issues run`:

- the list, newest first, each Issue with its stored status, such as
  `692  P2  VerificationNeeded`;
- an Issue's page: its type, area, claimant, dates, and details; where its
  work in progress is and its subtasks; Mentioned in, every recording and line
  that mentioned it, the recording with the newest line first, each line range
  such as `#2735-2737` linked to its words page (a Mention found only by the
  recording clock says `no line link`); every Mention with its words, where
  they came from, and its deep links; the work log; the logs tagged with it;
  linked Issues; success criteria; and attachments;
- beside each Issue in the list, where its work is, such as
  `Green for build 106` or `Red, stuck`, and a Close to landing choice that
  lists only the Green or Pushed work not abandoned;
- a File form with Title and Details fields, product and priority choices, and
  the reason when an Issue is not filed.

New Issues link to `https://issues.pisspoursoftware.xyz/issues/<number>`
(`issueViewerUrl`). A comment made on the site is stored under the email
Cloudflare Access signed in to Instant (`signedInAuthor`).

The site writes through Instant's permission rules. On the live tracker those
rules allow no create or update of `instantToolsIssues` today, so the site
reads and the `issues` command writes: a File, Comment, Link, or status from
the site shows Instant's reason, such as
`Not filed: File: CreateIssue: Permission denied: not perms-pass?`.

## Mac listener

`listener` follows the guest-readable Scribe Instant projection with the
read-only active-transcript primitive. Tuple inspired the primitive boundary,
but Tuple is neither installed nor called by this program. Only new
`initial: false`, finalized segments containing explicit issue language create
review drafts. The intentionally conservative local analyzer is deterministic;
it is not presented as an authoritative classifier.

Build and test it with:

```sh
pnpm --filter issues-listener-example test
pnpm --filter issues-listener-example build
```

The LaunchAgent source is
`listener/support/com.knophy.foldkit-issues-listener.plist`. It reads the
existing machine-local Instant environment file, never an admin token, and
writes only `RecordingSegment` and `TriageCandidate` entities. Its stdout and
stderr go to `/tmp/knophy-issues-listener.log` and
`/tmp/knophy-issues-listener-error.log`.

## Security boundary

Cloudflare Access protects the deployed web origin. It does not protect direct
Instant SDK traffic from browser or native Clients. The first deployment is an
explicitly temporary CF-only boundary: the Instant app identifier is public to
Clients, and Instant permissions remain the actual database boundary. Add an
Instant-authenticated identity bridge and restrictive permissions before this
tracker contains sensitive or broadly shared data.

Additional first-release weaknesses:

- Cloudflare Access protects the page and segment links but not the Instant
  websocket/API used by the client.
- Candidate promotion saves the Issue and then marks the candidate Promoted;
  this is not yet one atomic server transaction.
- Segment sharing currently re-opens the protected triage page at an anchored
  excerpt. It does not mint a separately revocable recipient-scoped share.
- The listener's cue-based analysis can miss or over-suggest issues; review is
  mandatory by design.
