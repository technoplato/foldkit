# DEATH | Distributed Elm Architecture Teaching Hospital

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| **Status**       | In interview                                                       |
| **Date**         | 2026-09-07                                                         |
| **Name**         | DEATH. Not DEF. Not ShrinkBench.                                   |
| **House**        | Temporary folder in Foldkit. Later home is an open question (Q10). |
| **Parent issue** | TBD Instant after decisions lock                                   |

## One-line intent

A teaching hospital and a contest. You check in software that should get better as the work gets harder. The first patient is a counter. The score is behavior first. Size, time, tokens, platforms, and dollars count only after a pass and a yield.

A **gambit** is not a gamble. You wager money. There is a reward if you are just (you yield a program that still answers every claimed command). There is a penalty if you are not (budget hits zero, you fail a required command, you claimed a level you cannot keep).

## How to read this house

The question list lives in `qanda.md`. Chat asks **one question at a time**. New forks append at the end of that file.

| File                             | Role                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `findings.md`                    | What the grok.com thread and Grok Bot chats actually said. Pain points from Michael's user messages. |
| `overviews/01-death-hospital.md` | Ten-foot map of the hospital                                                                         |
| `qanda.md`                       | Every currently known open question                                                                  |
| `docs/stretch-goals.md`          | Ideas that are not version 1 law                                                                     |
| `mailbox/`                       | How Grok Build and Grok Bot talk without talking over Michael                                        |
| `sources/`                       | Downloaded threads                                                                                   |
| `AGENTS.md`                      | Rules for agents working in this folder                                                              |

`bench/` in this repo is a rehearsal harness against `https://counter.knophy.com`. It is not DEATH. Foldkit `examples/counter` is the first intended submission, not the hospital.

## Locked from this session (2026-09-07)

- The name is **DEATH**.
- This folder is a **temporary house** inside Foldkit.
- Money in the contest is a **gambit**: upside and downside.
- Do not call it ShrinkBench. That name is taken by a neural-pruning project.
- Do not ping Grok Bot PIDs. Use `mailbox/`.

## Threads ingested

| Host     | Id                                     | What it is                                                         |
| -------- | -------------------------------------- | ------------------------------------------------------------------ |
| grok.com | `7a16ea88-a95a-4a71-be65-0d01c8c3ca8d` | Design thread. Title: Code Evolution Benchmark. 13 human messages. |
| Grok Bot | `e329ba87-ae45-4dd5-9951-2b2afba26174` | dr eggbot. 55 user-role entries; many are bots talking to bots.    |
| Grok Bot | `089d8aee-6a43-4668-a35b-b9b0f6d27245` | Engineer. Gate bot. Same inter-bot flood.                          |

Share URL `https://grok.com/share/c2hhcmQtMg_d69d8191-7ce0-4cc4-9a68-08491742055c` returned HTTP 404 from the conversation REST. The owned grok.com thread above is the design source we have on disk.

## Non-goals until Qs lock

- Implementing Stripe, wallet rails, or a public leaderboard
- Standing up more Grok Bots
- Treating `bench/` as the contest
- Closing Instant leftovers #240–#245 from this folder
