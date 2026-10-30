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
issues list --working                                           # the Issues an agent runs on now
issues working sync --agents progress.json [--registry agents-registry.json] [--sweep] [--dry-run]
issues list --backlog [--product scribe] [--limit 20] [--json]  # the next build, then P0 to P4 in rank order
issues rank 971 --before 930 | --after 930 | --top | --clear    # order an Issue within its priority
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
  or `$SCRIBE_AGENT` when it names an agent (`claude-code/issue-wip-1374`),
  else the Issue's claimant. Recording InProgress or Addressing work as
  Merged or Shipped moves the Issue to VerificationNeeded, once per
  recording, with a work-log entry.
- `working sync` records on each Issue the agent working on it now. It reads
  `tools/agent-progress-check --json --no-ledger` (`--agents`) for the agents
  running and `~/Scribe/agents-registry.json` (`--registry`) for the runs
  that ended. It reads the Issues of running agents and of runs that ended in
  the last six hours; `--sweep` adds every InProgress and Addressing Issue.
  On each it saves the running agent (the claimant first) with its account,
  branch, worktree, and the files its branch touches against its nearest
  main line (`git diff --numstat` plus new files, counted at most every ten
  minutes, never in a worktree several running agents share); an agent no
  longer running as ended; the claim of a run that ended, released with a
  work-log entry; a claim nothing shows running that stayed quiet twelve
  hours, as stale (kept); and Merged or Shipped work, as VerificationNeeded.
  It prints one line per change and a summary, such as
  `Checked 34 Issues against 19 running agents: 3 changed.`
  `--dry-run` saves nothing. The LaunchAgent
  `com.knophy.issues-working-sync` runs it every two minutes, with `--sweep`
  once an hour.
- `show` leads with a Now working block: the agent and its account, such as
  `Agent: claude-code/issue-wip-1374@max (account max)`; whether
  it runs (`Running: yes, seen since …`, no with how its run ended, or
  unknown when stale); the branch and repository; the worktree; the files
  touched with their line counts; and the last step with its time.
  `list --working` lists the Issues an agent runs on now with the agent, the
  branch, and the file count.
- After Now working and Work in progress, `show` lists the Issue's newest 10
  build jobs from Scribe's `buildJobs` (a row for every job Scribe's build
  script runs; Scribe ADR 0104), newest first, one line each: when it was
  queued in local time, its state, the machine and slot (warm or cold), its
  label, its exit code, how long it ran and waited, and its agent, such as
  `10-30 12:06  passed   mini slot 1 warm  measure-1412-cold  exit 0  ran 4 min, waited 6 min  build-sh-1412`.
  A running job whose heartbeat is older than 3 minutes adds
  `last heartbeat 10 min ago`: its machine stopped writing. `--json` carries
  the rows under `builds`. The jobs are read from Scribe's main Instant app,
  bounded at 5 seconds and alongside the Issue; when they cannot be read,
  `show` prints `Builds not shown:` with the reason (`buildsNotShown` in
  `--json`) and still succeeds.
- `list --landing` lists the work close to landing: Green or Pushed, not
  abandoned. Stuck work stays in that list with its reason. `--wip` lists
  every Issue with work recorded, `--stuck` the stuck ones, and
  `--target-build 106` the work meant for build 106. Each line ends with where
  the work is and its branch, such as
  `Green for build 106  agent/claude/timeline-804`.
- `list --backlog` prints the backlog: a lane per upcoming build, the next
  build first (`Build 111, the next build: 34 Issues`), then a section per
  priority (`P0: 12 Issues`). The next build is the lowest target build above
  every build that shipped work; work for an older build that never shipped
  stays in its priority with its headline, such as `Exploring for build 107`.
  Within a lane Issues run P0 first; within a priority, in rank order, and
  unranked Issues oldest first. Closed, Fixed, Resolved, Verified, and
  VerificationNeeded Issues stay out of the priority sections. `--limit 20`
  keeps the first 20; `--json` prints them in that order.
- `rank` orders an Issue within its priority: `--before 930` or `--after 930`
  (the same priority only; otherwise it names the `issues edit --priority`
  that would allow it), `--top`, or `--clear` for age order. The rank is a
  place on the filing-time axis kept in the Issue's stored JSON
  (`backlogRank`), so ranking one Issue changes no other. It prints the new
  place, such as `Ranked #907 before #905: 2nd of 3 in P0.`
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
  (`INSTANT_TOOLS_ENV_FILE` overrides it) and are never printed. Build jobs
  are read with Scribe's own `SCRIBE_MAIN_INSTANT_APP_ID` and
  `SCRIBE_MAIN_INSTANT_ADMIN_TOKEN`, from the environment, else
  `~/.config/instant-tools/scribe-main.env`.

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
- a Now working block on an Issue's page, the same as `issues show` prints,
  and beside each Issue in the list the agent running on it, such as
  `running claude-code/issue-wip-1374@max`, with a Working now choice
  that lists only those Issues; both follow `issues working sync` live;
- a Backlog page at `/issues/backlog`, the same order as
  `issues list --backlog`: each upcoming build's lane, the next build first,
  then P0 to P4 in rank order, with the product filter;
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
