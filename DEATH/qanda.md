# Q&A | DEATH

Status legend: `open` | `asking` | `decided` | `deferred`

Chat asks one `open` question at a time. This file holds the list.

Locked outside this file (2026-09-07 session): name is DEATH; this folder is a temporary house in Foldkit; a gambit has upside and downside; mailbox not PID poke.

---

## Q01 — Does the hospital map in overview 01 match what you meant?

- **Status:** `decided`
- **Answer:** **B.** Amend. From `examples/slides-qanda/answers/01.md`: pay $20 is Alice's attempt (instructions plus config). Agents yield. Alice does not speak. Dave tests and says `show`. Eve blogs, no program, scores 0. Bob-in-Swift is not a required player. Dave tests everything. The harness either figures out how to send a command to each running program, or that is a submitter requirement, or we publish our strategy for doing it.
- **Decided:** 2026-09-07
- **Question:** Accept `overviews/01-death-hospital.md` as the starting map? Human 07 said one run, not Run A then Run B. Yield, then poke. Fail poke = 0. Foldkit Counter is first. `bench/` is rehearsal only.

10-foot:

DEATH hospital rules + later runner
|
+-- Run A bundle spends prepaid budget until yield or 0
+-- Run B harness sends commands; program must answer
+-- score behavior first, else 0

Snippet is from rehearsal `bench/`, not DEATH:

      proofHost: https://counter.knophy.com
      incrementRaises: tap '+' when count is visible

Neighbors: `examples/counter` is the Program. `bench/` already drives a painted page from outside. DEATH Run B is that idea for any language, plus money and yield.

Options:

- **A.** Accept as-is.
- **B.** Accept, but name the amendments (example: no Run A in v1, or counter is not a patient).
- **C.** Reject. DEATH is only a local Foldkit scoring folder. Contest, prepaid budget, and yield wait.

What I think: **A.** grok.com human 1 through 7 already describe this shape. C fights "money must be a part of it" and "I will not waiver." B is fine if you want Run A paper-only for v1.

Trade-off: A commits the contest shape before rails exist. C is quieter this week and throws away the gambit.

---

## Q02 — What does the outside harness send to a submission?

- **Status:** `decided`
- **Answer:** **C.** From `examples/slides-qanda/answers/02.md`: one poke list, kept really simple. `show`, plus, minus, reset, offline. Each running program is poked the same way. Foldkit maps that list. Other stacks map however they want.
- **Decided:** 2026-09-07
- **Question:** When Run B probes a program, what is the command?

10-foot:

Program (core) owns Model, Message, update
|
+-- adapter paint / URI / FFI
+-- DEATH Run B sends commands from outside. No per-framework adapter written by the hospital.

Rehearsal today taps DOM (`tapOn: '+'`). grok.com said deep links and messages they need to process. Any language may play.

Options:

- **A.** Foldkit Messages only. A counter must accept `Increment`, `Decrement`, `Reset`.
- **B.** HTTP and deep links only. Any process that answers those URIs can play.
- **C.** A small language-agnostic command list (show, increment, decrement, reset, offline, sync) over URI. Foldkit maps those to Messages. Other stacks map however they want.

What I think: **C.** "We are not building adapters for their software. We are sending commands to their software." A makes Foldkit the protocol. B skips a typed list and becomes a mess of pages.

Trade-off: C is a protocol to design. A is faster for the first submit and locks everyone else out. B matches "any framework" and is harder to score fairly.

---

## Q03 — Is money a live gambit in version 1?

- **Status:** `decided`
- **Answer:** **B**, with a follow-up. From `examples/slides-qanda/answers/03.json`: money is live in version 1. Dave is an internal tester, not a literal person. He did not yet say whether "live" means a real bank (Stripe / wallet) or a scored ledger with no bank.
- **Decided:** 2026-09-07
- **Question:** Does the first running hospital take prepaid model budget and optional stake, or only write the rules while we grade Foldkit Counter for free?

10-foot:

grok.com: entry is the bundle plus money to run it on hosts we control.
Gambit: reward if just, penalty if not.
This folder: temporary house, no Stripe work until Qs lock.

Options:

- **A.** Version 1 is a free local harness. Money stays on paper.
- **B.** Version 1 charges a real prepaid budget and fail-to-zero, even for Foldkit's own first submit.
- **C.** Version 1 uses simulated money (visible budget, visible stake, no bank) with the same rules. Real rails later.

What I think: **C.** You asked to simulate submissions and payments before building more. B is the honest gambit and will stall on wallets. A drops the thing you said you will not waiver on.

Trade-off: C can look fake. B can swallow the week. A is easiest and trains people that DEATH is just another bench folder.

---

## Q04 — What is the first scored patient?

- **Status:** `decided`
- **Answer:** Amend. From `examples/slides-qanda/answers/04.json`: a team yields once per submit. They pass each level. Yield on N is evaluated through N-1. The A/B/C "what do they yield first" framing is the wrong question.
- **Decided:** 2026-09-07
- **Question:** What program is the first thing a team must yield?

10-foot:

grok.com: start with a number on screen, then buttons, then one count on every device, then offline.
eggbot: "it kind of is the product, actually. It is the first way to participate."
Also eggbot: do not confuse the instance (counter) with the architecture (distributed Elm messaging).
Wallet examples already exist in Foldkit and have been used on real chains.

Options:

- **A.** Counter ladder (visible number through offline shared count). Wallet and tickets come later as new patients.
- **B.** Wallet or money-transfer is first, because the contest should produce useful paid software immediately.
- **C.** No scored patient until sandbox and rails exist. Counter is documentation only.

What I think: **A.** Isolate the independent variables. Wallet is a later patient, and also a rail for the gambit, which is a different Q.

Trade-off: A looks small. B mixes patient domain with contest money. C is how Grok Bot stalled.

---

## Q05 — When does scoring start?

- **Status:** `decided`
- **Answer:** After yield. From `examples/slides-qanda/answers/05.json`: one score, computed only after yield, from tokens, time, LOC, platforms, build time, run time, sync time, storage, and binary size. Drop "unless we mix the bills."
- **Decided:** 2026-09-07
- **Question:** When do we measure tokens, wall clock, LOC, and platforms?

10-foot:

Run A spends budget while agents write.
Yield means they lock the program.
grok.com: scored after yield, and only if every claimed level still passes.
Fail behavior, score zero.

Options:

- **A.** Score only the yielded program on Run B. Run A cost is a separate dollar line, not mixed into LOC.
- **B.** One score from first token of Run A through last Run B command.
- **C.** Two scores published side by side: build cost (Run A) and program quality (Run B). Fail-to-zero still applies to behavior.

What I think: **C.** You want bookkeeping skill to matter (budget dies, you lose the entry) and you want program quality after yield. Mixing them into one number hides both.

Trade-off: C is more to explain. A ignores how wasteful the agents were except as dollars. B lets a huge agent trace drown a tiny correct program.

---

## Q05a — How do those measurements become one number?

- **Status:** `decided`
- **Answer:** **A** plus **C.** From `examples/slides-qanda/answers/05a.json`: publish one fixed formula with the public test list, and keep the raw measurement row. Weights are homework. Penalize heavy line churn. Reward more platforms. Reward less code. Rank impact first, then a positive curve on what we want most. From `examples/slides-qanda/answers/03d.json`: a larger submitted instruction set is also a score penalty.
- **Decided:** 2026-09-07
- **Parent:** Q05
- **Question:** After yield, how do tokens, clock time, lines of code, platforms, and binary size become one score?

---

## Q06 — What happens when the prepaid budget hits zero before a yield?

- **Status:** `decided`
- **Answer:** Amend **B**. From `examples/slides-qanda/answers/06.json`: gamify it. A trusted or subscribed player gets one double-or-nothing per round. He did not say what an untrusted first-time lose looks like.
- **Decided:** 2026-09-07
- **Question:** If Run A runs out of money before the team yields, what do they lose?

Options:

- **A.** They lose the leftover-nothing budget and the entry fee. Stake (if any) is forfeited into treasury / network fee / winner pot. Exact split later.
- **B.** They lose only unspent-nothing. Entry fee stays. They may double the entry once to continue, as grok.com human 1 floated.
- **C.** They can yield an incomplete program and take a partial score.

What I think: **A** plus a later Q for the one-time double. C breaks fail-to-zero. You said failed attempts that produced a program still feed the treasury, which is compatible with A if "produced a program" means it answered at least the first command. That nuance can amend A.

Trade-off: A is harsh and makes estimates matter. B is kinder and easier to game by always doubling. C invites fake yields.

---

## Q07 — Must every earlier level stay green when a later level is claimed?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/07.json`: the claimed prefix must all pass or the whole submit scores zero.
- **Decided:** 2026-09-07
- **Question:** If a team claims offline sync, do show-number and plus-raises still have to pass?

Options:

- **A.** Yes. Claimed prefix must all pass or the whole submit scores zero.
- **B.** Each level scores on its own. A later fail does not wipe an earlier pass.
- **C.** Earlier levels must pass, but a later fail zeros only the new level.

What I think: **A.** grok.com: only if every claimed level still passes. This is how shrinking growth is real. You do not get to break plus in order to add sync.

Trade-off: A is brutal on refactors. That is the point. B lets people rack points on a broken spine.

---

## Q08 — Do third-party dependencies count as code?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/08.json`: all code, including dependencies. Framework code is still code.
- **Decided:** 2026-09-07
- **Question:** When we count LOC and growth, what is "code"?

Options:

- **A.** All code, including dependencies, as grok.com human 2 said. Framework code is still code.
- **B.** Only the team's own files. Foldkit/Effect would then look free.
- **C.** Own files plus a priced list of allowed runtimes (browser, OS). Libraries count. Language stdlib does not.

What I think: **A** with a later rule for what "dependency" means on each platform (npm tree vs system libc). You wanted to punish a pile of third-party packages. B would make Foldkit look like a cheat.

Trade-off: A needs a honest tree per language. C is more work to keep fair.

---

## Q09 — Is Foldkit the contest protocol, or only the first submission?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/09.json`: Foldkit is the first submission, not the law. One league. Any stack that answers the commands is valid, including Rust that generates FFI for React.
- **Decided:** 2026-09-07
- **Question:** May a team yield a React app, a Swift app, or a raw HTTP server, if it answers the commands?

10-foot:

grok.com: any language, any framework. Drive from the outside.
Foldkit/Effect is a guess the benchmark should prove.
First submit: Foldkit Counter.

Options:

- **A.** Any stack that answers the command list. Foldkit is submit #1, not the law.
- **B.** Foldkit Programs only for v1. Other stacks wait.
- **C.** Two leagues: Foldkit league and open league.

What I think: **A.** B is a useful rehearsal and a bad contest. C splits the leaderboard before we have one.

Trade-off: A forces Q02 to be language-agnostic. B ships sooner on this repo.

---

## Q10 — Where does DEATH live after this temporary Foldkit folder?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/10.json`: stay in Foldkit until the counter is runnable, then extract. Creating a standalone repo now was considered and dropped.
- **Decided:** 2026-09-07
- **Question:** When this house moves, where does it go?

eggbot: one repository named DEATH. Foldkit stays the submission repo (your fork for view-agnosticism, then a submit).
This session: put it in Foldkit/DEATH for now.

Options:

- **A.** Stay in Foldkit until the counter ward runs. Then extract to `technoplato/death` (or similar).
- **B.** Create the standalone repo now and keep this folder as a pointer.
- **C.** DEATH stays a folder in Foldkit forever. The contest is part of the framework.

What I think: **A.** Matches both instructions. C makes Foldkit look like the protocol (Q09). B splits the working set while we are still asking Qs.

Trade-off: A risks the folder rotting in tree. B is extra ceremony this afternoon.

---

## Q10a — What do we call that extracted repository?

- **Status:** `decided`
- **Answer:** **C.** From `examples/slides-qanda/answers/10a.json`: `pisspoor-software-industries/death`. The GitHub organization does not exist yet.
- **Decided:** 2026-09-07
- **Parent:** Q10
- **Question:** After the counter can be scored, what is the extracted repository name?

---

## Q11 — How do Grok Build and Grok Bot talk without talking over you?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/11.json`: `DEATH/mailbox/` files. Do not poke Grok Bot PIDs. Michael is not the wire.
- **Decided:** 2026-09-07
- **Question:** What is the standing channel?

Options:

- **A.** `DEATH/mailbox/` files on this Mac (already opened). Grok Bot acks in `from-grokbot/`.
- **B.** Instant issues.knophy.com only. Chat is never a handoff.
- **C.** Grok Bot SendToAgent, with you in the room.

What I think: **A** for DEATH design. Instant stays the execution SoT for leftover product issues. C is the swarm that burned you yesterday.

Trade-off: A is easy to ignore if Grok Bot never reads the folder. We may need a tiny routine that polls the mailbox. That is a follow-up, not a third option.

---

## Q12 — What is a functional change versus a meta change on the counter ladder?

- **Status:** `withdrawn`
- **Answer:** Trash. From `examples/slides-qanda/answers/12.json`: this question does not make sense. Do not speak this way again. Later interview questions must be readable by someone who only has this one slide and does not already know the domain.
- **Decided:** 2026-09-07
- **Question:** grok.com human 13 asked for a one-page rules list of counter levels labeled functional and meta. Which split do we lock?

Options:

- **A.** Functional = user-visible fact (number, plus, minus, shared count). Meta = same facts plus a new ability (offline, second surface, sync) without rewriting how state is saved.
- **B.** Every new ward is functional. Meta is only "did you rewrite old lines."
- **C.** Do not label. Publish an ordered list of commands only.

What I think: **A.** That is the shrinking-growth idea: adding sync should not require touching the save path. C is implementable and throws away the lesson.

Trade-off: A needs a metric for "rewrote old lines" or it becomes taste. That metric is a child Q after A.

---

## Q13 — Does message sync wrap a Program as a higher-order update?

- **Status:** `decided`
- **Answer:** **C.** From `examples/slides-qanda/answers/13.json`: out of this interview. How sync wraps a Program is an implementation detail, not a benchmark design question. Alice submits a bundle. Agents write the program. Her architectural preferences live in that bundle.
- **Decided:** 2026-09-07
- **Question:** Should distributed sync be a higher-order update (or higher-order Program) that wraps a patient Program, rather than something the app author weaves into each feature?

10-foot:

Program.update : (Model, Message) -> [Model, Commands]
Higher-order wrap would take that update and return a new one that records Messages on a tape and replays peer Messages through the same update.

You told Eggbot: research how that should be structured as the higher-order update that wraps a program. It should not be concerned with the consumer of the library.
DEALF wording: Messages -> sync engine as tape -> replay onto programs and surfaces.

Options:

- **A.** Yes. Sync is a wrap around a Program. The counter author does not write sync.
- **B.** Sync is a service the Program calls from Commands. The wrap is optional sugar.
- **C.** Defer until a specialist panel (not Delve-as-was) reports. Do not pick a shape in this interview.

What I think: **A** as the target law, with C's research happening _inside_ A (how, not whether). You were explicit. B sneaks sync back into app code, which is what the hospital is trying to make look stupid.

Trade-off: A is a library design in Foldkit, not only a contest rule. It may belong in ADR 0011 as well. If so we cross-link, we do not fork a third sync story.

---

## Q14 — Must a human-in-the-loop be declared when the team registers?

- **Status:** `decided`
- **Answer:** **C** for version 1. From `examples/slides-qanda/answers/14.json`: no human interaction in the first iteration. A later version may allow it, strongly penalized.
- **Decided:** 2026-09-07
- **Question:** If a person may touch the program during Run A, when do they have to say so?

Options:

- **A.** At registration. Undeclared human edits fail the submit.
- **B.** Anytime, marked on the row, no fail.
- **C.** No humans in Run A. Bundle only.

What I think: **A.** grok.com human 7. Honest rows. C is cleaner and less like how you will actually work on Foldkit.

Trade-off: A needs an audit story (otherwise it is honor). C pushes all of your own work into the bundle, which may be right.

---

## Q15 — Can a later check burn more model calls than the prepaid cap?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/15.json`: the scored tests are the published open-source list. No surprise extra model checks billed to Alice. If the hospital runs something else, the trace shows it, and that is a hospital bug. Dave is not a person. Amend from `examples/slides-qanda/answers/04e.json`: do not publicize every level of every domain. Publicize simpler levels. Harder domain results stay visible. Counter is the introduction.
- **Decided:** 2026-09-07
- **Question:** After a team prepays, may the hospital add extra LLM checks that bill against that cap?

Options:

- **A.** No. Public tasks only. Extra checks must not add billable calls past the cap. grok.com human 6.
- **B.** Yes, the hospital may add billed checks.
- **C.** Extra checks run, but the hospital pays them.

What I think: **A** for billed work, **C** for the hospital's own distrust of Grok Build output (you asked Eggbot to be distrustful of results). Those are two payers.

Trade-off: A+C means we must publish the task list before teams set a budget. That is homework, not a surprise.

---

## Q16 — What must a yielded package publish?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/16.json`: program, starting bundle, trace, and a named OSS license. Alice does not say yield. The submitted agents and scripts do. After yield, show, increment, decrement, and reset must work. If show, increment, increment, show is not first-show plus two, the submit fails and she loses her stake. Amend from `examples/slides-qanda/answers/16b.json`: the hospital records the trace. Yield does not publish a license. They agree the most permissive license at submit. Amend from `examples/slides-qanda/answers/16c.json`: those commands are scored only when their rungs are locked (echo of Q07 and Q04d).
- **Decided:** 2026-09-07
- **Question:** What is the minimum public artifact at yield?

Options:

- **A.** Program that answers commands, plus bundle, plus trace, plus an OSS license named at yield. Weights still unset.
- **B.** Binary and a leaderboard row only. Bundle stays private.
- **C.** Everything public, including unused secrets-free notes.

What I think: **A.** Brushes bar: a provable program plus a public-enough package and trace. B is factory talk. C is A plus more files; we can tighten later.

Trade-off: License and security levels are still unset, as the combined draft said. Child Q after A.

---

## Q03a — What does live money mean in version 1?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/03a.json`: real Stripe, or a cryptocurrency wallet, or tokens bought from a real thing.
- **Decided:** 2026-09-07
- **Parent:** Q03
- **Question:** Money is live. Is that a real bank, or a scored ledger with no bank?

Options:

- **A.** Real Stripe or wallet. Fail to zero hits a bank.
- **B.** Scored ledger. Same rules. No bank yet.
- **C.** Paper only. Take back "live."

What I think: **B.** You said simulate submissions and payments before building rails. A will stall the week.

Trade-off: B can look fake. A is the honest gambit and needs wallets.

---

## Q06a — What does she lose with no double left?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/06a.json`: budget, entry, and stake. Dave never pokes.
- **Decided:** 2026-09-07
- **Parent:** Q06
- **Question:** Alice already used her one double, or she is not a trusted player. Budget is gone. No yield. What does she lose?

Options:

- **A.** Budget, entry, and stake. Dave never pokes.
- **B.** Only the spent budget. Entry stays.
- **C.** She may still yield incomplete.

What I think: **A.** The double is the mercy. After that, fail-to-zero has to mean something.

Trade-off: A is harsh. B lets people treat the double as extra runway with no last loss.

---

## Q06b — Who may use that one extra prepaid budget?

- **Status:** `decided`
- **Answer:** **C** for version 1. From `examples/slides-qanda/answers/06b.json`: no extra prepaid budget in the first version. A later version may add a monthly subscription that marks a player trusted. The monthly price is unset.
- **Decided:** 2026-09-07
- **Parent:** Q06
- **Question:** Who may use the one extra prepaid budget if the first budget hits zero before the submitted agents say they are done?

---

## Q01a — May she pay a new entry after a fail-to-zero?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/01a.json`: she may make as many entries as she wants. A new payment is a new attempt.
- **Decided:** 2026-09-07
- **Parent:** Q01
- **Question:** After a failed poke loses the stake, may Alice pay a new entry the same day?

---

## Q02a — How does the hospital find the running program?

- **Status:** `decided`
- **Answer:** From `examples/slides-qanda/answers/02a.json`: the hospital sends one standard command. The yielded package must already be running and ready. It fans that command out to every surface it submitted (React, terminal, TUI).
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Question:** The same poke list hits every stack. What address does it hit?

---

## Q03b — Whose account do the agents spend?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/03b.json`: Alice sends money to the hospital. The hospital spends that pot on token costs for the run.
- **Decided:** 2026-09-08
- **Parent:** Q03
- **Question:** Live money drains someone. Hospital account Alice tops up, or Alice's own wallet?

---

## Q04a — What is the first scored ladder?

- **Status:** `decided`
- **Answer:** Amend **A.** Reject **C.** From `examples/slides-qanda/answers/04a.json`: show the number; plus; same count on any number of devices; plus while offline then sync back (0, plus three times is 3, offline plus twice is 5, online still 3, reconnect both 5); then reset to zero and minus. Reset is the trap: not commutative, naive replay clobbers state. Action menu and nav-state sync can come after. In-app LLM increment is out of the scored tests. The submitter does not name their own rungs.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** Yield claims level N and is scored through N-1. What are the rungs in version 1?

---

## Q16a — Which licenses may a yield name?

- **Status:** `decided`
- **Answer:** Opt in before submit. From `examples/slides-qanda/answers/16a.json`: the yielded code is open source under the most permissive license (MIT / 0BSD class). You do not pick a license at yield.
- **Decided:** 2026-09-07
- **Parent:** Q16
- **Question:** Yield must name an open-source license. Which set is allowed?

---

## Q02b — Where does the hospital send the standard command?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/02b.json`: the hospital posts the standard command to a queue. A listener must observe that queue. The built bundle does not configure this inbound wire. The package can see a dry run of the commands before yield. Scored pokes happen after yield, once the package is running. Then the package fans the command out to every submitted surface.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Question:** The yielded package fans out one command. Where does that command first arrive?

---

## Q02c — Who starts the yielded program before the tests poke?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/02c.json`: the hospital starts the package on hospital machines, then pokes. Start is a synchronous command. It returns only when every submitted client is ready. The bundle must ship a script that starts the observers, the queue, and the other housekeeping. A skill can teach that setup. Amend from `examples/slides-qanda/answers/02i.json`: the start timeout is about three minutes, not about ten seconds.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Question:** Who boots the running package on hospital time?

---

## Q03c — What is the stake she loses when the tests fail?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/03c.json`: stake is a second pot she posted. It goes to the treasury. Token spend is a different pot. Later, treasury payouts can reward placement on a level in a domain.
- **Decided:** 2026-09-08
- **Parent:** Q03
- **Question:** Stake versus the token pot. Same money, or a second pot?

---

## Q04b — How does the yielded package name the highest level it claims?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/04b.json`: the bundle names levels by locking them in order with hospital scripts or messages. Example: lock in level 1, lock in level 2, then yield at level 3 incomplete. It must not yield in the middle of a level it treats as complete. The last started level may be unfinished at yield. The public level list still needs a simple enumerated write-up.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** One yield. Tests run through the claimed level. How is that level named?

---

## Q04c — What is offline in the scored test?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/04c.json`: the hospital cuts the network (for example, to a Docker container). Then it sends plus. Then it restores the network. There is no go-offline command. The running program may know it is offline. It must not be told to pretend.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** Does the hospital cut the network, or send an offline command?

---

## Q08a — What source tree counts as code?

- **Status:** `decided`
- **Answer:** See Q08b. First stamp wanted source, not a vague install tree. Locked with 08b: user-space source is the line tree. OS libc is out. Build tools are a weight, not that tree.
- **Decided:** 2026-09-08
- **Parent:** Q08
- **Question:** All dependencies count. What tree do we measure on each platform?

---

## Q09a — Does a fork of a prior yield get a scoring edge?

- **Status:** `decided`
- **Answer:** Yes. From `examples/slides-qanda/answers/09a.json`: a fork should be cheaper. Starting from scratch costs about double. That encourages reuse. Strong yields get forked more and stay easier for humans to read. Whether double is the entry pot or a score weight is not locked.
- **Decided:** 2026-09-08
- **Parent:** Q09
- **Question:** grok.com said a fork should beat a scratch start. Is that a scored rule?

---

## Q04d — What does the hospital score when they yield mid-level?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/04d.json`: yield mid-level is allowed. The hospital scores only the locked complete levels. The unfinished level does not count. If they run out of budget mid-level without yielding, they lose.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** Lock 1, lock 2, start 3, yield incomplete. What is claimed?

---

## Q08b — When we count lines, what is in the tree?

- **Status:** `decided`
- **Answer:** **A** for the line tree, plus a weight for generate-the-program tools. From `examples/slides-qanda/answers/08b.json`: user-space source the program ships or downloads. Not the compiler as source. Not OS libc. Build tools, and anything else that generates the running program, also get a weight. How that weight works is not locked.
- **Decided:** 2026-09-08
- **Parent:** Q08
- **Question:** User-space source versus build tools versus OS libc.

---

## Q08c — How do build tools enter the score?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/08c.json`: not the same line pot as source. Build tools are a separate published weight, one metric among others next to the line count.
- **Decided:** 2026-09-08
- **Parent:** Q08
- **Question:** Same line pot, a published weight, or homework for after v1?

---

## Q09b — What costs about double for a scratch start?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/09b.json`: a submit is a static bundle of scripts, markdown, and opinions, plus an LLM token budget, plus a submission budget that should stay cheap next to the agent budget. Which pot is about double for a scratch start is not locked.
- **Decided:** 2026-09-08
- **Parent:** Q09
- **Question:** Prepaid pot, score weight, or homework?

---

## Q09c — Which pot is about double for a scratch start?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/09c.json`: the submit fee is about double for a scratch start. The LLM token budget is not the doubled pot.
- **Decided:** 2026-09-08
- **Parent:** Q09
- **Question:** LLM budget, submit fee, or both?

---

## Q14a — May submit 1 be a human-written program?

- **Status:** `decided`
- **Answer:** **A**, with an amend. From `examples/slides-qanda/answers/14a.json`: submit 1 may be this repo's counter plus a start script. Dry-run is always allowed. Later entries stay a bundle, but the bundle may say read a public URL. Private code cannot run on hospital machines. If a tiny instruction pack points at a public golfed repo and the tests pass, that is allowed. Whether that pack also clears later domains is unset.
- **Decided:** 2026-09-08
- **Parent:** Q14
- **Question:** This repo's counter plus a start script, or a no-human agent run only?

---

## Q02d — What queue does the listener observe?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/02d.json`: stdio. The hospital writes lines. The listener reads them. Version 1 does not need a named Instant room.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Question:** Instant room, stdio, or named later in the public test list?

---

## Q02e — How does show answer?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/02e.json`: the hospital reads a painted page or terminal. Version 1 starts with screenshot tests and naive page content dumps, the way typical computer-use checks do. Show is not a number-only reply on the queue.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Question:** A number on the queue, a painted surface, or both must match?

---

## Q03d — Must submit 1 pay real money?

- **Status:** `decided`
- **Answer:** Amend. From `examples/slides-qanda/answers/03d.json`: the scored law is still live money. The hospital's own first submit may dry-run and must still simulate the cost. Other people may dry-run too. A larger submitted instruction set is a score penalty. Hosting a fine-tuned model is a stretch goal. He started another amend and lost the thread.
- **Decided:** 2026-09-08
- **Parent:** Q03
- **Question:** Real fee and token pot, free rehearsal, or fee only?

---

## Q04e — What ids does the lock-in script use in version 1?

- **Status:** `decided`
- **Answer:** From `examples/slides-qanda/answers/04e.json`: lock-in ids are `counter:level:<rung>`, not numbers, because rungs may reorder. Named so far: `counter:level:show`, then plus and share in the same shape. Do not publicize every level of every domain. Publicize simpler levels. Harder domain results stay visible. Counter is the introduction to the benchmark.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** Named rungs now, only show and plus, or publish the list with the tests?

---

## Q04f — Who starts the second client?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/04f.json`: the hospital and the bundle share a public contract. The bundle ships scripts such as start, listen for commands, and start another device. The contract must name the surface, such as Expo on iOS or a non-captive CLI. Exact script names are not locked.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** Start script, hospital after ready, or one client in version 1?

---

## Q16b — What must the trace contain?

- **Status:** `decided`
- **Answer:** From `examples/slides-qanda/answers/16b.json`: the hospital records the trace. Yield does not publish it. The trace is like SpecStory: every code change, every agent message, every tool call, plus the commands given and what the bundle produced. They do not publish a license at yield. They agree at submit that the code is open source under the most permissive license.
- **Decided:** 2026-09-08
- **Parent:** Q16
- **Question:** Command and show log, agent tokens only, or any file named trace?

---

## Q05b — Do submitted instructions count against the score?

- **Status:** `decided`
- **Answer:** Yes. From `examples/slides-qanda/answers/03d.json`: a larger submitted instruction set is a score penalty. You want the instructions small. Hosting a fine-tuned model is a stretch goal in `docs/stretch-goals.md`.
- **Decided:** 2026-09-08
- **Parent:** Q05
- **Question:** Does instruction-pack size mix into the published score?

---

## Q17 — How public is every domain level?

- **Status:** `decided`
- **Answer:** From `examples/slides-qanda/answers/04e.json`: do not publicize every level of every domain. Publicize simpler levels. You can still look at results on more complicated domains. Counter is the introduction to the benchmark. The idea should be obvious once you understand that.
- **Decided:** 2026-09-08
- **Question:** Must every level of every domain be in the public test list?

---

## Q04g — What does the public contract call those scripts?

- **Status:** `decided`
- **Answer:** From `examples/slides-qanda/answers/04g.json`: start takes a string and always starts a new device, even if one is already running. The string names a surface, such as Expo on iOS, native Swift on iOS, or a non-captive TypeScript CLI. The terse device/framework/language vocabulary is not locked. Listen is optional. The hospital may instead tell the bundle where commands will be sent. Tests may name their own commands. Not every test must be public.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** start / listen / start-device, one script with flags, or named in the test list?

---

## Q14b — May the bundle be a public URL?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/14b.json`: a public URL is a legal bundle. The repo may hold a golfed counter, guidelines, scripts, and markdown. Private code cannot run on hospital machines. That is the defense.
- **Decided:** 2026-09-08
- **Parent:** Q14
- **Question:** Public URL posted with the row, uploaded tree only, or dry-run only?

---

## Q04h — What does the start string name?

- **Status:** `decided`
- **Answer:** From `examples/slides-qanda/answers/04h.json` (explore stamp 2026-09-08T13:42:54-04:00; card paste at 13:43:17 points at that stamp). Start names a surface. `death start ios/expo/ts` opens a new iOS Expo TypeScript device. `death start ios/expo/js` is Expo JavaScript. `death start ios/native/swift` is native Swift on iOS. `death start ios/react-native/ts` is React Native on iOS. Native Swift also covers `macos/native/swift`, `tvos/native/swift`, and `ipados/native/swift`. CLI names a framework or custom: `cli/custom/ts`, or `cli/<framework>/ts`. `cli/noncaptive/ts` is not a start string. Non-captive is a CLI property, not a framework slot. Nest device, then only the frameworks that device allows, as an ADT. A free `{ device, framework, language }` struct is illegal because it would allow `macos/expo/ts`. The hospital declares the surfaces it supports. Start always opens a new device. Two `death start ios/expo/ts` lines are copy 1 and copy 2. Lock-in confirms a scored rung: `death lock-in counter:level:show`. Do not pass a lock-in id to start. Exact Schema constructors and that start does not name domain or level are locked on Q04i.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Question:** device/framework/language, a published short list, or bundle-named strings?

---

## Q04i — Are these the start-string constructors?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/04i.json` (stamp 2026-09-08T13:57:23-04:00). The proposed Surface constructors on `explore/04i/01-proposed-constructors.md` are the law. Nest device, then only valid frameworks: Ios is Expo (`Ts` or `Js`), Native (`Swift`), or ReactNative (`Ts`). Ipados, Macos, and Tvos are Native Swift only. Cli is Custom `Ts` or a named framework with `Ts`. Start prints only the surface (`ios/expo/ts`). Domain and level stay on lock-in (`counter:level:show`). `macos/expo/ts` and `cli/noncaptive/ts` stay unrepresentable. Web and the extra device constructors are locked on Q04n.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04i`
- **Question:** Are these the start-string constructors?

---

## Q04j — Are these start prints the public examples?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/04j.json` (card stamp 2026-09-08T14:16:11-04:00). The `death start` prints on `explore/04j` are the public examples. Start names a surface, not a lock-in. Lock-in stays `counter:level:show`. Nest device, then only frameworks that device allows, then language. Start always opens a new device. `macos/expo/ts` stays unrepresentable. `cli/noncaptive/ts` stays illegal.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04j`
- **Explore:** `examples/slides-qanda/public/explore/04j/`
- **Question:** Are these start prints the public examples?

---

## Q02f — After start returns ready, is stdin still the queue?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/02f.json` (stamp 2026-09-08T16:26:01-04:00). After `death start ios/expo/ts` returns ready, stdin stays the command queue. Listen still reads those lines.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Card:** `examples/slides-qanda/public/deck.json` id `02f`
- **Question:** After `death start ios/expo/ts` returns ready, is stdin still the command queue, or may listen be skipped?

---

## Q04k — Which CLI languages may start?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/04k.json` (stamp 2026-09-08T16:25:16-04:00). CLI start strings may use `rs`, `zig`, `ex`, and `py`. Example: `death start cli/custom/rs`. The nest stays: device, then framework, then language. `cli/custom/ts` stays legal.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04k`
- **Question:** Is CLI language only `ts` (`cli/custom/ts`), or are `cli/custom/rs`, `cli/custom/zig`, `cli/custom/ex`, and `cli/custom/py` legal start strings?

---

## Q16c — Must minus and reset work on every yield?

- **Status:** `decided`
- **Answer:** Echo **B.** From `examples/slides-qanda/answers/16c.json` (stamp 2026-09-08T16:38:59-04:00). Only locked rungs are scored. Minus and reset wait until those lock-ins exist. Every prior level must pass when a new level is added. This restates Q07 and Q04d. It does not rewrite them. Reject A (show, plus, minus, and reset on every yield) and C (show and plus always).
- **Decided:** 2026-09-08
- **Parent:** Q16
- **Card:** `examples/slides-qanda/public/deck.json` id `16c`
- **Question:** After yield, must show, plus, minus, and reset all work, or does the hospital score only locked rungs such as `counter:level:show`?

---

## Q15a — Must every scored test be public?

- **Status:** `decided`
- **Answer:** Amend **A.** From `examples/slides-qanda/answers/15a.json` (stamp 2026-09-08T16:38:36-04:00). Every scored test is public. She pays when she submits the bundle. If she has not paid, she is not running a submission. Public tests are the bar so good architecture proliferates. Reject B (a scored test may stay unpublished) and C (unpublished checks if the hospital pays). The card's before-she-pays clock is wrong. This does not rewrite Q17: unpublished domain levels may exist; they are not scored against her prepaid run.
- **Decided:** 2026-09-08
- **Parent:** Q15
- **Card:** `examples/slides-qanda/public/deck.json` id `15a`
- **Question:** Are all scored tests public before Alice pays, or may some stay unpublished?

---

## Q09d — How does start name the web Foldkit counter?

- **Status:** `decided`
- **Answer:** Amend **B.** From `examples/slides-qanda/answers/09d.json` (stamp 2026-09-08T16:36:11-04:00). Start names a web surface as `web/<framework>/<language>`. The Foldkit web counter is `death start web/foldkit/ts`. The framework slot depends on the stack. Reject A (web is not started that way) and C (`cli/custom/ts` paints that page). The opening plus lock-in lines echo Q04m (`counter:level:increment`); they do not rewrite it.
- **Decided:** 2026-09-08
- **Parent:** Q09
- **Card:** `examples/slides-qanda/public/deck.json` id `09d`
- **Question:** How does start name the web Foldkit counter at `/counters/counter/c1`? Need a legal surface string, or web is not started that way.

---

## Q02g — What word raises the count on stdin?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/02g.json` (stamp 2026-09-08T16:26:12-04:00). The stdin word that raises the count is `increment`.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Card:** `examples/slides-qanda/public/deck.json` id `02g`
- **Question:** On stdio, is the raise poke `plus` or `increment`?

---

## Q04l — How does one plus reach copy 1 and copy 2?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/04l.json` (stamp 2026-09-08T16:35:08-04:00). The hospital tells the package what commands it must answer and how, either before start or once it is running. How one plus reaches copy 1 and copy 2 is the implementer's fan-out. After sync is on, a naive increment would raise every open device.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04l`
- **Question:** After two `death start ios/expo/ts` lines (copy 1 and copy 2), how does one plus reach both devices?

---

## Q02h — What painted dump proves show?

- **Status:** `decided`
- **Answer:** **A.** From `examples/slides-qanda/answers/02h.json` (stamp 2026-09-08T16:26:59-04:00). The dump that proves show on `/counters/counter/c1` must include the visible count on that page.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Card:** `examples/slides-qanda/public/deck.json` id `02h`
- **Question:** What painted dump proves show on `/counters/counter/c1`?

---

## Q04m — What lock-in id means plus?

- **Status:** `decided`
- **Answer:** **B.** From `examples/slides-qanda/answers/04m.json` (stamp 2026-09-08T16:35:22-04:00). The plus lock-in id is `counter:level:increment`.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04m`
- **Question:** Is the plus lock-in id `counter:level:plus`, or another id?

---

## Q02i — What stdout means ready?

- **Status:** `decided`
- **Answer:** Amend **A.** From `examples/slides-qanda/answers/02i.json` (stamp 2026-09-08T16:33:51-04:00). After `death start ios/expo/ts`, stdout must print the ready response only when the application is booted and can receive commands. A spawn-time `started device=ios ...` line is not enough. The start timeout is about three minutes, not about ten seconds. The exact stdout token is locked on Q02j.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Card:** `examples/slides-qanda/public/deck.json` id `02i`
- **Question:** After `death start ios/expo/ts`, what stdout means ready versus `started device=ios ...` (about 10 seconds)?

---

## Q02j — What exact stdout token is ready?

- **Status:** `decided`
- **Answer:** **C**, named as the simple A parse. From `examples/slides-qanda/answers/02j.json` (stamp 2026-09-08T16:47:38-04:00). After `death start ios/expo/ts`, the hospital parses one stdout line that is exactly `ready`. Nothing else on that line. A later `started device=ios framework=expo language=ts` line is not that token. This names the token Q02i left open. It does not rewrite the three-minute start timeout or that ready means the app can receive commands.
- **Decided:** 2026-09-08
- **Parent:** Q02
- **Card:** `examples/slides-qanda/public/deck.json` id `02j`
- **Question:** What exact stdout token means ready after `death start ios/expo/ts`?

---

## Q04n — Does the Surface ADT include Web?

- **Status:** `decided`
- **Answer:** Amend **A.** From `examples/slides-qanda/answers/04n.json` (stamp 2026-09-08T16:48:13-04:00). The Surface ADT includes Web. Start prints `web/foldkit/ts`. Nest is Web, then Foldkit, then Ts. Other web frameworks may join that nest. Also add every other reasonable device: desktop web, Windows, Linux, and Apple Watch, next to the locked Mac, iOS, iPadOS, Apple TV, and CLI constructors. The list is large. Reject B (no Web on the ADT). This makes the Q09d start print representable. It does not rewrite that print. The start-name token rule is locked on Q04o. Amend from `examples/slides-qanda/answers/04p.json`: there is no desktop web device. Apple Watch prints `watchos/native/swift`. Windows and Linux start prints are not locked.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04n`
- **Question:** Does the Surface ADT add a web constructor?

---

## Q04o — What prints name the new devices?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/04o.json` (stamp 2026-09-08T16:53:47-04:00). A start name is a slash-separated string of single, non-composite words. Those words name device, framework, language, and any later slot. A compound token such as `desktop-web` is not a slot, so A's `desktop-web/foldkit/ts` print is illegal. This does not rewrite Q04n's device list or `web/foldkit/ts`. The paste ended mid-sentence. Amend from `examples/slides-qanda/answers/04p.json`: there is no desktop web device. Apple Watch prints `watchos/native/swift`. Windows and Linux start prints are not locked.
- **Decided:** 2026-09-08
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04o`
- **Question:** What start strings name desktop web, Windows, Linux, and Apple Watch?

---

## Q04p — Which legal prints name those devices?

- **Status:** `decided`
- **Answer:** Amend **B.** From `examples/slides-qanda/answers/04p.json` (stamp 2026-09-09T13:20:31-04:00). Desktop web is a web framework on an OS. There is no desktop web device. Named print: `death start watchos/native/swift`. `death start web/foldkit/ts` stays the Foldkit web page. Echo of Q04o: a start name is slash-separated single words; `death start desktop-web/foldkit/ts` is illegal. It does not rewrite that hyphen rule. Reject C (`death start desktop/foldkit/ts` would invent a desktop device). Full B is not locked on this stamp: he did not name `macos/web/ts`, `windows/web/ts`, or `linux/web/ts`. Reject locking A's `windows/native/ts` and `linux/native/ts`; he asked what those even are. Windows and Linux native start prints stay unnamed. Amend from `examples/slides-qanda/answers/04q.json`: those per-OS web and browser prints are rejected. One browser surface works on every OS.
- **Decided:** 2026-09-09
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04p`
- **Question:** What legal start strings name desktop web, Windows, Linux, and Apple Watch?

---

## Q04q — What prints name web on an OS?

- **Status:** `decided`
- **Answer:** Not A, B, or C as written. From `examples/slides-qanda/answers/04q.json` (stamp 2026-09-09T13:36:51-04:00). A desktop browser is not named per OS. Reject `death start macos/web/ts`, `death start windows/web/ts`, `death start linux/web/ts`, `death start macos/browser/ts`, `death start windows/browser/ts`, and `death start linux/browser`. The platform is browser. If it works in the browser, it works on every operating system. Echo of Q04p and Q09d: `death start web/foldkit/ts` stays the Foldkit web page. Echo of Q04p: `death start watchos/native/swift` stays Apple Watch. Echo of Q04o: each slot is one word; desktop is not a device. The running package responds to an outside `death start` command plus that string. It does not print `death start`. Windows and Linux native start prints stay unnamed.
- **Decided:** 2026-09-09
- **Parent:** Q04
- **Card:** `examples/slides-qanda/public/deck.json` id `04q`
- **Question:** What legal start strings name a desktop browser on macOS, Windows, and Linux?

