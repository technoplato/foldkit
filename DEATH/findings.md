# Findings | DEATH

Chat claims are not this file. This file is sourced from Michael's user messages in the downloaded threads.

## What DEATH is

From grok.com human 1 and eggbot dictations:

- Input is an **agentic bundle** (prompts, skills, scripts, notes) plus **payment** to run that bundle on hosts the hospital controls.
- Output is the program for that level, plus the **trace** of what happened while the bundle ran.
- The ladder starts tiny: show a number, add a button, add another button, one count on every device, real-time sync, offline, come-back-online without blowing up global state.
- Later rungs can grow into sharing, navigation, increment-by-value, lists of counters, even other domains (wallet, tickets, transcription). The point is useful software, not a toy quiz for LLMs.
- Score: when the next slice of work is added, how much new code, how many new builds, how long, how many tokens, how many platforms, how much money. Not a human elegance judge.
- **Fail the behavior, score zero.** Size and dollars count after a pass.
- **Yield-gated.** Agents run on hospital hardware until the budget hits zero or the bundle says ready. Then that same program is poked. Human 07 killed a separate Run A / Run B. One run. The program that wrote is the program that is scored. It does not keep running on the submitter's laptop after yield.
- The hospital does not build adapters for each framework. It **sends commands** (deep links, messages). Any language may play. Foldkit is the first submission, not the protocol.
- All code counts, including third-party dependencies. Foldkit/Effect is a guess the benchmark should prove, not a rule.
- Forking an existing submission should beat starting from scratch.
- Simplified Technical English. Active voice. Define jargon the first time.

From this session: a **gambit** has an upside and a downside. That is different from a gamble.

## What DEATH is not

- Not DEF.
- Not ShrinkBench (taken name).
- Not `bench/` in this repo (rehearsal against `counter.knophy.com`).
- Not "the counter is a toy, the real product is InstantTape." Michael rejected that framing. The counter is the **first way to participate**. It is also an instance of the architecture, not the whole architecture.
- Not "carriers." Messages go into a **sync engine as tape**, then replay onto programs and surfaces.

## Grok Bot pain (read Michael's user messages)

These are the failure modes this interview must not repeat.

1. **Jargon without the analogy.** "Paintbrush talk", "gate is open", "cleared for you", "did not sell as fact", "inherent parent", "operator pin board around X 2019". He asked for the full brushes line when the analogy is used: people talk about software factories without sharing the software, like an artist who only talks about brushes.
2. **Invented product paths sold as architecture.** InstantTape-as-the-path, epic-reset CRDTs, "counter is not the product people adapt." He said: do not recommend a path you made up. Cite GitHub or say you do not know.
3. **Bots talking to bots while he waits.** Packaging PASS races, md5 ping-pong, Engineer holding Michael, Eggbot creating Delve / DEATH Essay / Viable Bench and merging them after he already said they are one object.
4. **Not looking back at his messages before PASS.** He ordered an intake lookback: re-read the user messages in the requesting thread. Fail if the deliverable answers a toy or invents a path.
5. **Not asking questions.** Eggbot was told "don't do anything until you get a couple questions from me." Grok.com human 3 asked for clarifying questions with three options and the one he would resonate with. He said his style is scatterbrained and agents should state confidence and ask.
6. **Wrong computer, wrong tool.** Engineer hunted cloning and X auth instead of reading the grok.com thread. Later: use Grok Build on this Mac first. Computer use last. Do not invent a need for a connector when the files are on disk.
7. **Who is he talking to?** Last eggbot dictation: he does not know why he is still talking to Dr. Eggbot. Eggbot is supposed to create bots. DEATH work should have one named partner and a mailbox, not a swarm.
8. **Lowercase I, shorthand names, empty bots.** "Sync Reviewer" had to become Local-First Sync Architecture Reviewer. Discipline and Taste was empty and should have been deleted. Gossip taste changes to the bots that live in that idea space.

## PISS-POUR (as spoken)

Platonic Ideal Software Specified. He also uses PISS-POUR as Predictable, Observable, Universal (or ubiquitous), Replayable. Confirm wording in Qs if it becomes a scored rule. Do not treat the acronym as a second product.

## DEALF

Silly name he used for Distributed Elm Architecture Local First. Not the contest name. Do not stand up a specialist bot named Delve unless a Q revives it.

## Rehearsal already in Foldkit

```text
10-foot of what exists today (not DEATH):

  examples/counter     Program (Model, Message, update, screen)
  bench/               outside asserts against painted proof host
  proof host           https://counter.knophy.com

  bench/rungs/a.build-a-counter.yaml
      countVisible, incrementRaises, decrementLowers,
      instantSettlesLive, offlineWorks, actionMenuAbstraction,
      sameScreenMirrored, globalSync
```

Neighbors: `bench/` already pokes a painted Counter from outside. DEATH adds prepaid budget, yield, fail-to-zero, forking, and a command protocol that is not Foldkit-only. Human 07: one run on hospital hardware, then poke. Not two named runs.
