# Overview 01 | DEATH hospital map

Accept or amend in Q01.

```text
  Michael
    |
    +-- Grok Build (this checkout)   interview, files, first Foldkit submit
    +-- Grok Bot (Engineer, Eggbot)  mailbox only. Do not poke PIDs.

  DEATH hospital (rules + later runner)
    input : agent package + prepaid model budget + optional stake
    Run A : agents write until yield or budget 0
    Run B : outside harness sends commands. Program must answer.
    score : behavior at every claimed level, else 0
            then tokens, wall clock, LOC (all code), platforms, dollars

  Foldkit
    examples/counter   first patient / first submit
    bench/             rehearsal only (counter.knophy.com)
    DEATH/             this temporary house
```

## Words

- **Patient.** The program under care. First patient: a counter you can see and press.
- **Ward.** One level of the ladder. Show a number. Then a plus. Then a minus. Then one count on every device. Then offline. Then come back online without clobbering peers.
- **Bundle.** What you submit: prompts, skills, scripts, architecture notes, and the cache so the hospital can rerun your agents.
- **Yield.** You say Run A is done. Scoring starts. You cannot keep spending after yield.
- **Gambit.** Prepaid budget plus optional stake. Reward if the yielded program still answers every claimed command. Penalty if the budget dies first or a claimed command fails.
- **Command.** Something the harness sends from outside. Not an adapter we write for your framework. Deep link, URI, or Message-shaped token. Exact shape is Q02.
- **Tape.** Messages recorded by a sync engine, then replayed onto programs and surfaces. Not "carriers."

## Functional vs meta (draft, Q12)

- **Functional ward.** The user-visible fact changes: the number is on screen, plus raises it, two devices share it.
- **Meta ward.** The same user-visible facts, plus a new ability of the program: it still works offline, it still works on a second surface, you did not have to rewrite how the component saves state to add sync.

The hospital should punish rewriting old lines to add meta ability. Exact metric is later.

## Honest bar

People talk about software factories without sharing the software, like an artist who only talks about brushes.

A pass is a program that answers commands, plus a public-enough package and trace. Not a blog post about the factory.

## What this overview does not lock

Money splits, score weights, OSS license, security levels, long-term repo, vector clocks, higher-order update shape. Those are later Qs.
