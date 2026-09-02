# ADR 0011 — Agent notes

This file is for work on this ADR only. It does **not** replace the repo
`AGENTS.md` at `/Users/laptop/Development/foldkit/AGENTS.md`. That file is the
Foldkit convention bible (naming, Effect, commits, Elm). Do not wipe it.

Read `qanda.md`, `smells.md`, `findings.md`, and `intentions.md` before
proposing a shortcut.

## No shortcuts

Build the optimal abstraction. Do not pick a worse design because it is faster
this week, this slice, or this interview. Hard work is allowed. It can take
longer. No exceptions.

"This week" is not a reason to:

- refuse a Focus ADT
- leave a combinator in an example
- fold the whole Message log on every boot
- keep a clock as a bookmark
- defer Multiple Counters `Program.screen` only to save time

## Still refuse

Do not invent a type that has no field yet. That is Q102. The Focus ADT has a
field: what is focused. The action menu is the first client.

Do not close Instant leftovers #240–#245. Do not push pointfreeco.

## How to write a question

Michael asked to keep the Q89 shape. Do this every time:

- Full sentences. Teach what Counter does today before the fork.
- Show the file and the small snippet. Then say what it does not do.
- Name the catalog and the Model in words, not only in a box.
- Options a reader can pick without opening another file.
- No shorthand walls (“URI carrier”, “paint the Program”) until you have
  already defined them in the same question.

## Core

Higher-order compose lives in `packages/foldkit`. Examples compose it. They do
not own key maps or a second menu Program.
