# Plans | Foldkit

Design documents for work the owner asked for and has not yet approved for
building. Each plan is design only until its status says otherwise. The
adversarial audits in `adversarial/` check every plan against the owner's
own words in `user-messages/`; each round's findings and the responses to
them are kept there.

## Status legend

- **Proposed**: designed, audited, waiting for the owner's go.
- **Accepted**: the owner said build it; an ADR under `docs/adr/` records the
  decision when it lands.
- **Superseded**: replaced; the header names the replacement.

## Reading order

Start with the audit, then the plan for the area you care about. Plans 02 and
06 are the foundation the others assume; plan 09 pins the wire they share.
New vocabulary is in `glossary.md` under "Plans vocabulary (proposed)".

| Plan                                                        | One line                                                                                                   | Depends on                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [00 Audit](00-audit-2026-10-09.md)                          | What the counter family and the adapters get right and wrong, with file pointers                           |                                        |
| [01 Terminal runtime](01-terminal-runtime.md)               | One `terminal()` call per app; a daemon kept alive by declared work; tail with changes                     | 02, 06, 08a                            |
| [01a Dictate from Scribe](01a-dictate-from-scribe.md)       | The dictation CLI that proves the daemon, grounded in Scribe's real pipeline                               | 01, 02, 06                             |
| [02 Action declarations](02-action-declarations.md)         | Press, Choose, Fill, Facts, ownership per field, minted ids, refusals as data                              |                                        |
| [03 React canonical](03-react-canonical.md)                 | One React API; bindings leave `examples/`; row scopes; Counter, Multiple Counters, Books canonical         | 02, 04, 05                             |
| [04 Navigation](04-navigation.md)                           | Inward mounting; tabs; a drawer container; a stack inside a sheet; shell; leave guards                     | 02                                     |
| [05 Composition](05-composition.md)                         | `forEach` lifts catalog, navigation, screen; `presents`; sender-minted ids; the dated rubric               | 02                                     |
| [05a Example scores](05a-example-scores.md)                 | The mechanical rubric pass over every example                                                              |                                        |
| [06 Sync engines](06-sync-engines.md)                       | A log interface for Instant, Supabase, Kafka, Local; owners; single writers; peer snapshots, nothing saved | 02, 09                                 |
| [07 Static graph](07-static-graph.md)                       | Where, what, and what changes what, compiled where types reach and checked where not                       | 02                                     |
| [08 Skills and finance](08-skills-and-finance.md)           | 08a: skills from today's Catalog, now. 08b: `examples/finance` with 46 declared inputs                     | 08a: none; 08b: 01, 02, 04, 06, 07, 09 |
| [09 Cross-language protocol](09-cross-language-protocol.md) | The envelope, order, handshake, and vectors; why the Swift and Rust readers failed                         | 06, 08                                 |
| [10 Hosts matrix](10-hosts-matrix.md)                       | Capabilities; Multiple Counters on Expo and Foldkit HTML; hosts as an open set                             | 01, 02, 03, 06                         |

## Build order, if every plan is accepted

1. **Plan 08a**: skills generated from today's Catalog for Counter and
   Multiple Counters, committed beside each example, with `--check` in CI.
   The owner said this is needed now, and it depends on nothing else.
2. Plan 02 (total declarations, ownership, minted ids) and plan 09's
   protocol document with vectors: everything else prints or checks these.
3. Plan 06 (`LogEngine`, owners, single writers, `App.define`, `Engine`) and
   plan 01 (`terminal()`): together they delete every hand-built daemon and
   tape switch.
4. Plan 05 (`forEach` complete, sender-minted ids) and the Multiple Counters
   rebuild: the proof that composition scores 3, and the fix for the id
   refold bug.
5. Plan 03 (one React API, row scopes) across the nine examples, deleting
   bindings.
6. Plan 07 (graph) and plan 08b (`examples/finance`).
7. Plan 04 (inward mounting, tabs, drawer, shell) and plan 10 (hosts).

ADR 0014 Decision 1 names `foldkit/cli` as the terminal runtime's home; plan
01 puts it in `foldkit/terminal` and amends the ADR when accepted. Instant
Cloud shuts down on 2027-08-31 (plan 06), which puts a date on the Supabase
and self-hosted Instant decisions below.

## Decisions for the owner

Collected from every plan's "Decisions for the owner" and from the
adversarial audits' questions, with the proposal in each case. Nothing is
built until these are answered; a plan proceeds on its proposal where the
owner says nothing.

1. **The client's name in public history.** `examples/personal-cfo` names
   the reviewed client in five tracked files already on the public fork.
   Proposal: retire `personal-cfo` with `examples/finance` and rewrite the
   fork's history as on 2026-10-03; add the name to the PII scanner's
   private patterns so a push fails closed.
2. **Rubric direction.** 3 is best (proposed, from "make sure things are
   getting threes") or 1 is best (from "one, two, three, best to worst").
3. **"Counter counters and books".** Multiple Counters (proposed) or the
   legacy `examples/counters`, which is proposed for retirement.
4. **"Get Expo working in Foldkit HTML".** Expo and Foldkit HTML hosts for
   Multiple Counters (proposed) or the Foldkit HTML renderer inside Expo.
5. **"Do a Supabase adapter".** Design only until "don't integrate anything
   yet" is lifted (proposed), or build `@foldkit/supabase` against
   `supabase start` now, given the Instant Cloud date.
6. **Saved snapshots and peer offers.** With nothing saved, the time to an
   app that accepts a press is a full fold on every boot (about 900 ms and
   1.5 MB per cold Counter boot; more for a finance log that grows by
   hundreds of rows a day), and a peer offer only paints sooner, read-only,
   until this device's own fold agrees. Options: (a) exactly that, your
   words (proposed); (b) a verified offer from the same actor and the same
   build is usable at once while the device refolds in the background and
   replaces the Model on a mismatch, which accepts a buggy peer's Model for
   one refold; (c) ADR 0013's per-device cache as a host opt-in (105 ms and
   73 KB) or a server checkpoint. In-memory checkpoints are kept in every
   case. On Instant an offer must be sealed, not only signed, because
   everyone in a room receives every topic: sealed offers and signed requests
   through the `foldkitDeviceKeys` namespace (proposed), or offers off on
   Instant, where every boot is then a cold fold (R4-07). Plan 06 and
   principle 7 follow the answer.
7. **Principles 7 and 8** are from your message 2; confirm they stay in
   `PRINCIPLES.md`.
8. **The Instant target for examples**: `bd40c50a` dev (proposed until the
   cut-over), `e7c49961` production, `5417c2e3`, or self-hosted Instant now.
   May a dictation example write Scribe's dev tables through a Projection?
   Instant's owner rules are written beside the Supabase SQL in plan 06 and
   enter Scribe's permissions before any example writes there (R4-04).
9. **Instant Cloud's shutdown on 2027-08-31**: move examples to self-hosted
   Instant, make Supabase the default engine, or both.
10. **"Sync: Instant only"** in `examples/AGENTS.md`, given Supabase for
    finance and a Local log for engine-less terminal tools. Proposal: "one
    engine per example, never a per-tab or per-process store pretending to
    sync".
11. **How static is static enough.** Compiled where the types reach plus
    generated checks (proposed), or `Update.writes`, which returns Commands
    too, on every arm so nothing is left to a test (R4-02).
12. **The Local log** for terminal tools with no engine: durable (proposed) or
    lost on exit.
13. **Finance deployment**: live vendors with production access, retention,
    and deletion (proposed, after the identity spike) or fixtures only; admin
    aggregates across people are out of scope.
14. **Finance market data**: written by the worker alone as Domain facts
    (proposed), or local to each device with `freshness`.
15. **Finance boot cost**: accept it with nothing saved, or allow the worker
    a daily checkpoint for this App only.
16. **Tabs**: inactive stacks neither sync nor survive a reload (proposed).
17. **Drawer**: both the modal style and the container (proposed).
18. **Daemon scope**: one daemon per `(App, engine, OS user)`, signed in as
    one actor at a time, with `login` as another actor handing it over
    (proposed); or a daemon per actor on its own socket, which needs the view
    to learn the actor before it connects.
19. **Terminal clients**: a one-shot Domain or Local command is judged and
    applied at its address and no attached screen moves; a one-shot
    Navigation command moves the daemon's screen; a presented child's Actions
    need the presentation open on the daemon, so `confirm-delete` keeps
    today's two-step tests (proposed); or every client keeps its own
    navigation; or a command may confirm unasked (R4-09).
20. **Liveness**: only Subscriptions and ManagedResources declared
    `holdsDaemon` keep a daemon alive (proposed), or any running stream.
21. **Minted ids on screen**: full id in URIs; a `number` stamped at `Add`
    from a Domain high-water mark a delete never lowers, beside a `title` that
    `Rename` writes (proposed; the number repeats only when two devices add
    before either sees the other's row), or a per-list display number
    recomputed from the rows, which repeats after any delete (R4-08).
22. **Placement** as a hard gate for keys, the menu, the CLI, and agents
    (proposed), or only a rule for what a screen paints.
23. **A newer `programVersion` on the log**: keep writing while rows decode,
    read-only only on an undecodable row or a `RetiredVersion` fact
    (proposed), or read-only on sight.
24. **Plaid's web OAuth redirect**: a popup or hosted flow only (proposed), or
    the host keeps the link token in session storage across the redirect.
25. **Finance history after a worker outage**: a backfilled day is right only
    if the worker may date the row at that day's close, a declared exception
    to the clock rule every reader refolds for (proposed), or keep gaps.
26. **Erasure of System rows**: erase by owner, which reaches the rows the
    worker wrote into a person's log (proposed).
27. **Where generated skills live**: beside each example (proposed), never in
    `skills/`, which the plugin publishes.
28. **`examples/dictate`** is new beside `examples/transcribe` (proposed);
    `examples/finance` replaces `examples/personal-cfo` (proposed).
29. **`examples/react-native-showcase`**: move to `@foldkit/react-native` or
    retire.
30. **`nonNegativeDebts` and the crypto dust filter**: keep the floor, drop the
    filter (proposed).
31. **Idle grace** for a daemon with no live work and no views: ten minutes
    (proposed, Books' value).
32. **`Fill` forms**: a generic form on every host (proposed), or only on the
    CLI and the menu until a form painter exists.
33. **`@foldkit/react/replay`**: keep the replay client as a package, or
    leave replay inspection to devtools only.
34. **Existing examples below the rubric gate**: only new examples are gated
    (proposed), or an example below the gate blocks its own feature work
    until it migrates.
35. **Supabase identity**: run the Cloudflare Access sign-in spike before
    accepting the adapter, or use Supabase Auth's own providers for finance.
36. **Unplanned host cells**: Books on Expo Router, Dictate on Expo, Books and
    Dictate as headless workers; which should exist.
37. **A browser Dictate**: a Web Audio plus Web Speech Layer, which turns three
    "paint-only" cells into "yes".
38. **Where an example names its engine, and which**: one engine descriptor
    per example, a subpath of its core package that the Program's own modules
    never import, naming the same Instant app its web page uses, which the
    build copies into the terminal manifest (proposed, which
    `examples/AGENTS.md` requires today); or the Local log for terminal
    commands; or a package of its own (R4-03).
39. **Device consequences of a Domain change**: when another device deletes
    the counter this device shows, or the server finishes this device's bank
    link, this device leaves the page and ends the flow by itself through
    `reconcile` (proposed, what Multiple Counters does today), or shows
    "deleted" or "linked" until the person moves on. Under Mirror, peers
    follow a device-only flow (a bank link) into its screen and paint it from
    the Domain row as "linking on another device" (proposed), or Programs
    with such flows run SharedDomain only (R4-01).
40. **Scoring apps built without `Program.make`**: Foldkit DOM apps such as
    `auth` and `todo` and the legacy `counters` are scored by the composition
    rubric and expected to reach 3 (proposed), or are outside it.
41. **A Program move under a covering host screen** in React Navigation:
    dismiss the covering host screens and show the page (proposed), or hold
    the move until the person returns.
42. **Who may add a member to a shared room** on Supabase and Instant: the
    room's owner, or anyone holding an invitation token the owner issued
    (proposed); or any member (R4-05).
43. **Dictate's identity**: sign in through an interactive flow so transcripts
    are a person's rows on the shared engine (proposed), or keep an App with
    no identity on the Local log (R4-04).
44. **Manual finance inputs in the first cut**: Actions for manual accounts,
    positions, and tokens, which the inventory counts (proposed), or out of
    the first cut (R4-12).

45. **The words-synced playback primitive**: design it as the next plan, built
    on plan 02's declarations and plan 10's capabilities (an `AudioPlayer` and
    a `Words` capability) before anything else is built (proposed), or build it
    first inside `examples/words` on today's APIs and lift it later.

## Asks relayed through Scribe on 2026-10-10

Spoken into Scribe while this work ran, held undelivered at this session, and
read from the mirror afterwards (`user-messages/2026-10-10-relayed-through-scribe.md`):

- **Offline first** (Recording 208 #2812 to #2819): a requirement on every
  plan, recorded in plan 06 under "Offline first", with the hole it names in
  today's in-memory outbox and the conformance cases that close it.
- **A words-synced playback primitive** (#1114 to #1123): play, seek by word,
  search, and scrub with the words shown, as a library primitive reused by
  Books, the transcription apps, and video, introduced through
  `examples/words`. `examples/words` and `examples/transcript-player` are the
  seeds. Not designed yet; decision 45.
- **Books "library cannot be read"** (#1412 to #1418): fixed by another agent
  the same day.
- **Derivable Programs** (#2769 to #2772): plans 02 and 05 and principle 8.

## Conventions

Plans quote North Star syntax as it should read when built, and label a
sketch as an outline where it is not yet code. They state what exists today
with a file path, so a reader can check. Decisions the owner has not made are
listed under "Decisions for the owner" in the plan and collected above;
decisions made are recorded inline with the date and the saved message they
come from.
