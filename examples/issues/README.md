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
issues file --title "…" --product scribe --type feature --parent 2347   # filed under an epic
issues show 692 [--json]
issues recording 398 [--json]                                   # or its id: a recording's Issues and their agents
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
issues parent 2332 2347                              # put #2332 under the epic #2347; --clear takes it out
issues criterion 692 "<one observable outcome>" [--evidence FocusedTest,Log]
issues satisfy 692 1 issue-692-criterion-2 [--unsatisfied]
issues subtask add 804 "Red: the window census" "Green" "Merge for build 106"
issues subtask check 804 1 issue-804-subtask-2      # uncheck and remove take the same
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
  `-2`, and so on; `subtask check`, `uncheck` and `remove` take a position or
  an id. `remove` takes the subtask off the checklist and prints what is left;
  the others keep their ids. `show` prints the checklist as
  `Subtasks (1 of 3 done)`.
- Epics (Scribe #2348): `epic` is an issue type, and an Issue names the epic it
  sits under in `parentIssueId` (`'2347'`; none for Issues stored before it).
  `issues parent 2332 2347` sets it and `issues parent 2332 --clear` clears it;
  `issues file --parent 2347` files under one. A parent no Issue holds is
  refused with exit 3; a parent that is not an epic (the message names
  `issues edit <n> --type epic`), the Issue itself, and an epic that already
  sits under the Issue (a cycle) with exit 2. Each write reads the Issue back.
  `show` prints `Parent: #2347 <title> (<status>)` after the area and, for an
  epic or an Issue with children, `Children (3 of 14 done)` with each child as
  `#2332  InProgress  P1  <title>`, the open ones first, then the finished
  (Closed, Fixed, Resolved, Verified), each by number. The children are read
  from Scribe's rows, never by scanning the catalog: core's `issueChildrenQuery`
  (`core/src/issueFamily.ts`) asks `issues` where `parentNumber` is the epic's
  number, the field Scribe's tracker mirror copies from `parentIssueId`. When
  they cannot be read, such as before Scribe's schema has `parentNumber`,
  `show` prints `Children not shown: <reason>` and still succeeds. `--json`
  adds `parent` (`id`, `title`, `status`) and `children` (`progress` and
  `issues`) or `childrenNotShown`.
- Where an Issue is named (Scribe #2348): `show` prints a `Named in recordings`
  block (how many places in how many recordings, then each recording with its
  newest lines and thread posts: the deep link
  `https://og.pisspoursoftware.xyz/recording/<id>/section/<line>?t=<s>`, when,
  who, and the words verbatim; at most the newest 20, with `N more: issues show
  <n> --json`) and a `Sessions` block (each Claude Code session that names it,
  newest first: its agent and account, `worked` when it logged or claimed on the
  Issue, else `named`, when it first and last named it, its claude.ai link or
  `no claude.ai link was recorded`, its first words, and its sub-agents under
  it). Both come from one query on Scribe's `issueReferences` rows, by
  `issueNumber`, newest first (`issueReferencesQuery` in
  `core/src/issueReferences.ts`), then the recordings' titles by their ids.
  Rows match by the Issue's number only; matching by meaning is not built.
  `--json` gives `references` (`recordings`, each with `placeCount` and every
  place, and `sessions`) or `referencesNotShown`; until the rows can be read,
  `show` prints `Named in recordings and sessions not shown: <reason>`.
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
  the last six hours; `--sweep` adds every Issue, whatever its status (an
  agent claims Issues besides its run's, and one that left InProgress kept
  "running" for good while the sweep read only InProgress and Addressing).
  On each it saves the running agent (the claimant first) with its account,
  branch, worktree, and the files its branch touches against its nearest
  main line (`git diff --numstat` plus new files, counted at most every ten
  minutes, never in a worktree several running agents share); an agent no
  longer running as ended; the claim of a run that ended, released with a
  work-log entry, and the claim on a finished Issue (Closed, Fixed, Resolved,
  Verified) once no agent of that name runs, released the same way, as is the
  claim of an agent nothing shows running that wrote nothing on the Issue for
  seven days; any other claim nothing shows running that stayed quiet twelve
  hours, as stale (kept); and Merged or Shipped work, as VerificationNeeded,
  unless the Issue was claimed after the work was recorded (new work started).
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
- After Now working and Work in progress, `show` lists the agents started for
  the Issue (Scribe #2303), newest first, from Scribe's `agentRuns` (core's
  `issueAgentsQuery`, the query the Issue page reads): each with its state and
  times, harness and account, handle, its claude.ai link or why it has none,
  the app link that opens its chat (`scribe-shared://agent/<name>`), every
  session when it ran on more than one account, and its subagents with what
  they were asked to do. `--json` carries them under `agents`; when they cannot
  be read, `Agents not shown:` (`agentsNotShown`).
- `recording 398` (a number from the mirror's folder names, or a recording's
  id) lists the Issues his lines in that recording mention, in the order he
  said them, each with how many times and the agents started for it, from
  Scribe's `issueMentions` and `agentRuns`. It writes nothing. A number two
  folders share is refused with both ids (exit 2); one no folder has, exit 3.
- After that, `show` lists the Issue's newest 10
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
  unranked Issues oldest first. Closed, Fixed, Resolved, Verified,
  VerificationNeeded, and NeedsUserInput Issues stay out of the priority
  sections. `--limit 20` keeps the first 20; `--json` prints them in that
  order.
- The statuses are one list, `IssueStatus` in
  `@foldkit/instant-tools/issues`: `issues status`, `list --status`, the
  site's filter and its link, the board's columns, and the set-status menu
  read it, so a status is added there and nowhere else. Two statuses ask
  something of the tracker's owner. `NeedsUserInput`: the work cannot go
  further, or a choice is the owner's, until they answer. `FeedbackRequested`:
  something shipped and their reaction is wanted; nothing waits on it.
- A question for the owner is a work-log entry whose state is `question`,
  written with the status in one command, such as
  `issues log 2237 question "May the pricing page go public? …" --status NeedsUserInput`.
  One question per entry, with its options and the recommended one first; a
  second question is a second entry. `issues list --status NeedsUserInput`
  prints each such Issue with its open questions beneath it
  (`    ? May the pricing page go public?`), `list --json` gives them as
  `openQuestions` (each its `question`, `askedBy`, and `askedAtMs`), and
  `issues show` and the Issue's page lead with a Needs user input block:
  each question whole, who asked, and when. The owner's
  answer is an `answer` entry in their words, such as
  `issues log 2237 answer "He typed: not yet." --status InProgress`; the
  questions asked before it are no longer open.
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

`react` is the site behind Cloudflare Access at
[issues.pisspoursoftware.xyz](https://issues.pisspoursoftware.xyz/) (page loads
on issues.knophy.com redirect there). Every page shows where its code lives as
its first line,
[github.com/technoplato/foldkit/tree/main/examples/issues/react/src](https://github.com/technoplato/foldkit/tree/main/examples/issues/react/src).
`siteSourceHeader()` in `../site-source-header.ts` writes that line from git at
build time, so a build from another branch names that branch. It paints the same
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
  the reason when an Issue is not filed;
- every Issue, Recording, line, commit, build, agent and link in any text as a
  chip with its title and state, read from the text at read time, so stored text
  is never rewritten. `build 217` shows `Scribe 0.1`, `installed`, its tag and
  TestFlight number; a bare `f9ac958b0` is a commit;
- a page for each thing a chip names, with what points at it: `/recordings/<id>`
  names when it started and how long it ran and links his words, `/segments/<id>`
  shows the line's words, linked at their exact time, `/builds/217` names how to
  get the build, its cut commit, devices, What's New, and every Issue that shipped
  in it or was found in it, `/commits/<sha>` the Issues it implements and the
  builds it shipped in;
- on an Issue's page, at a glance: its app and features, who asked and in which
  words, where it landed, how to get that build (the TestFlight invite and the
  upload's page), the build he found it in, every commit, the ask's timeline with
  how long each step took, every run that worked on it with its account and
  model, the findings raised on it, and the decisions, questions and reminders
  around it;
- on an Issue's page, its parent epic, linked; for an epic, `Children: 3 of 14
  done` with a progress bar and each child with its status and priority; and the
  `Named in recordings` and `Sessions` sections, each place's deep link and each
  session's claude.ai link clickable. They read the same two core queries as
  `issues show` (`issueChildrenQuery`, `issueReferencesQuery`), live;
- `/asks`, how long asks take: each step's median, how many Issues reached it,
  and the slowest asks;
- `/agents/<id>`, every run a handle names: how it ran, when and for how long, what
  it was asked, how it ended, what it resumes, its worktree, branch, brief and log,
  its sessions, sub-agents, Issues, commits and findings; `/sessions/<id>`, one
  session with its transcript's path and its claude.ai link when it has one;
- `/findings`, what agents reported running into, every one, counted by kind,
  source and state, each count a link, `/findings?kind=mistake`; a finding files
  as an Issue through the same form as any other, and its row names that Issue;
- `/decisions`, what he decided, every one, counted by state, and
  `/decisions/<id>`, the sentence, its state, when and how long ago, his exact
  words each linked at their time, what it superseded and what superseded it, the
  Issues it names and the Issues that cite it. Agents cite the first 8 characters,
  `decision dbdbf773`, and a chip draws the sentence and state; a bare `dbdbf773`
  takes the same chip once a row holds that id;
- `/questions`, what he asked, counted by state and what he wants to learn, and
  `/questions/<id>`, with his words, each answer, who gave it, and how soon;
- `/reminders`, and `/reminders/<id>`, with where he said it. Nothing in Scribe's
  schema ties a reminder to an Issue: only its `url` can, when that is the Issue's
  page, or the Issue's own words citing it. Its notes stay words, because a
  `Receipt #1520` is not Issue 1520;
- `/features`, each line of the feature contract in his words, and
  `/features/<slug>`, the Issues that implement or touch it and the builds those
  landed in; a line goes by the name in bold, because numbers change;
- `/products`, the catalog, and `/products/<id>`, its kind, features, surfaces,
  modules, Issues by status, builds, and the agents that worked on it this week.

Where an Issue landed comes from Scribe's rows (`edges` by `issueNumber`, their
commits and builds), which Scribe's `scripts/schema/landings.ts` derives from git
and its release tags. The site opens Scribe's Instant app the first time a page
asks, signed in with the same Access login through a second mint on its origin
(`hostedIdentity({ session })` in `react/vite.config.ts`), so the list pays nothing
for it. Agents, findings, features and products come the same way, written by
Scribe's `scripts/schema/graph-sync.sh`, which starts when a file its syncs read
changes (the agents registry, a live session file, a headless run, origin/main's
ref); findings in work logs and the product catalog, which only Instant holds,
wait for its 5-minute run. An Issue's page also reads its moments, with their
kind, so a line that was another app's sound reads `Heard in`, never `Michael said
it`. A Recording's page reads its own row and its moments in two live queries, so
a live Recording's length, written once a minute, restates one row. Decisions are read once, 155 rows and
45 KB, for chips, the palette, `/decisions` and an Issue's page. No query can look
inside `issueNumbersJSON`, so an Issue's page reads the few questions that hold
one, 5 of 964, and the reminders that hold a link, 2 of 140; `/questions` and
`/reminders` read their tables only when open. Instant restates a query's whole
answer on any change, so each read keeps the rows that did not change
(`keptRowsOf` in `core/src/storedRows.ts`): one new question decodes one row, and a
page builds one row. Surfaces and modules are derived from code
and stored nowhere: `scripts/schema/products-map.mjs` prints them to
`~/Scribe/products-map.json`, and the site's own server answers that file at
`/__foldkit/products-map` (`react/productsMapRoute.ts`). A refused mint or unreadable row is a reason on the page, never rows that
look empty. `issues show` prints the same landing, from the same query, within 5
seconds or with one line saying why not.

Which recordings mention an Issue, and how many times, is one query on Scribe's
rows (Scribe #2248): each mention's row links the recording it came from
(`issueMentions.recording`), so `recordings` where
`issueMentions.issue.number` is the Issue's number come back each with that
Issue's mentions, and a recording's count is their number
(`issueRecordingsQuery` in `core/src/issueRecordings.ts`). `issues show` prints
it as its Recordings block above the mentions, with a deep link per mention and
one line when the tracker lists more mentions from recordings than the rows
reach; `--json` gives `recordings`, each with `mentionCount`, or
`recordingsNotShown`. `issues list --json` gives every Issue's `mentionCount`:
every mention once, two in one recording twice.

The catalog is read once. After that a live query holds only the rows changed
since the newest one seen, and a second holds the row ids, so a write costs a
reader the Issues it changed, not the whole catalog: on a throwaway app with 300
Issues and the real server, one write cost 4,730 KB before and 32 to 48 KB now,
and reached the reader in 70 to 230 ms instead of 250 to 490 ms. Every save marks
its row as changed now, so a change dated in the past still lands in the window.
The site also keeps the rows in IndexedDB: a reload shows them at once and reads
only what changed, with a full read when nothing was kept and once a day.

New Issues link to `https://issues.pisspoursoftware.xyz/issues/<number>`
(`issueViewerUrl`). A comment made on the site is stored under the email
Cloudflare Access signed in to Instant (`signedInAuthor`).

The list has views, each a URL: filters by status, priority, claimant, product
and landing, a sort, a grouping, and a board (`/issues?view=board`, by status or
by claimant) whose cards drag between columns. A view can be saved by name
(`Save view`, kept as an `issueViews` row in Scribe's app) and opened again with
`g v`. `/inbox` lists every status change, claim and mention, newest first, and
`/inbox?kind=status` one kind of it. Space peeks at the Issue under the cursor in
a panel beside the list, which shows its page, its landing and its graph.

### Keys

Like Linear, the keyboard reaches everything:

| Keys                                                 | What they do                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `j` `k`, arrows                                      | the next or previous row, card, or inbox Issue                                                                 |
| `Enter`                                              | open the Issue under the cursor                                                                                |
| `Space`                                              | peek at it beside the list                                                                                     |
| `x`, `Shift+j` `Shift+k`                             | select it, or extend the selection down or up                                                                  |
| `s` `p` `a` `m`                                      | its status, priority, claim, or product, for the selection when the cursor is in it                            |
| `h` `l`, `Shift+h` `Shift+l`                         | on the board, the column beside, or move the card there                                                        |
| `Shift+b`                                            | the board, and back to the list                                                                                |
| `/`                                                  | search; `Enter` opens an Issue the search names                                                                |
| `c`                                                  | file an Issue, with Title holding the keyboard                                                                 |
| `Enter` in Title, `Cmd+Enter` in Details             | file it                                                                                                        |
| `Cmd+Enter` in the comment box                       | comment                                                                                                        |
| `g` then `l` `b` `i` `t` `f` `d` `q` `r` `e` `p` `v` | the list, backlog, inbox, triage, findings, decisions, questions, reminders, features, products, saved views   |
| `Cmd+K`, `?`                                         | the command palette: every action and place, and Issues by title                                               |
| `Esc`                                                | close the layer, clear the selection or search, leave the row, or go back to the page an Issue was opened from |

A layer (a menu, the palette, a peek) takes the keyboard when it opens and gives
it back when it closes, and a key the page takes moves the keyboard off a button
just clicked, so `Enter` after `j` opens the row and never presses that button
again. A menu changes the Issues it named when it opened.

### Writes

The site writes through Instant's rules, signed in as his Access login; the
`issues` command writes as the same owner (`asUser`) when
`INSTANT_TOOLS_OWNER_EMAIL` names him in `~/.config/instant-tools/instant.env`,
so the same rules run for both. Every Issue write names the `updatedAtMs` it read
(`ruleParams`), and the tracker's rule refuses it once the row has moved; the
writer then reads the row again from the server and applies its change to what it
finds, up to 12 times. Instant judges a rule without a lock, so two transactions
that overlap can both pass it: a write waits 300 ms, reads again, and applies its
change again if an overlapping write took it away. `updatedAtMs` moves on every
write, and a change that changes nothing writes nothing. A write only queued while
offline fails, naming the Issue. On the throwaway app, 12 `issues log` at once on
one Issue store 12 of 12, where they stored 3 before. A write keeps any key the
schema does not model, inside each criterion, mention and entry too.

A save that returns after the page moved never moves it: only the filing opens its
new Issue, and only from the form. A comment or a link stays in its box until its
write lands.

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
