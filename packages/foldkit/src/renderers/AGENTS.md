# The HTML painter and its edge

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

This folder holds the screen tree every painter reads (`types.ts`,
`elements.ts`, pure readings such as `readAlong.ts`) and the HTML painter:
`html.ts` draws the tree with `foldkit/html`, and `htmlEdge.ts` is its edge,
the small effects that run on the page beside the painted elements. The
page's hint and key listeners are next door in
`../interaction/documentHints.ts` and `documentKeys.ts`.

## The rule

UI behavior is written once, framework-free, in Foldkit core
(`packages/foldkit/src/behavior/`). A painter draws what it is told and
reports what happened. It holds no rule.

- **A rule** is any number with a unit of time, distance or count (500 ms,
  10 px, 5 tries), or any branch on what the person meant (a hold is not a
  press). Rules go in core.
- **A mechanic** is how this platform measures, scrolls, listens, waits and
  draws. Mechanics stay here.

Before you add a timer, a `let`, a `useState` or `useRef`, a listener, or a
number to a file here, ask which it is. If it is a rule, write it in
`packages/foldkit/src/behavior/` as a pure `step(state, context, fact)` that
answers instructions, and give the painter only a port to fill. Read
`packages/foldkit/src/behavior/AGENTS.md` first.

## In this folder

A rule that belongs in core, and is still here: `LONG_PRESS_MS = 500` and
`LONG_PRESS_SLACK_PX = 10` in `htmlEdge.ts`. How long a hold is, and how far a
finger may drift, is the same on every Client that has no recognizer of its
own. It moves to a `longPress` block in plan 14's slice 4. Do not add another
like it.

A mechanic that belongs here: `sightOf(transcript, word)` in `htmlEdge.ts`,
which measures a word against the window with `getBoundingClientRect`, and
the `wait` port, which says a page waits with `setTimeout`. Only a page
measures and waits that way.

The pattern to copy is `TranscriptFollow`
(`packages/foldkit/src/behavior/transcriptFollow.ts`): the rule for how a
Transcript's view follows the voice. The painter gives its runner six ports
(`now`, `wait`, `told`, `measure`, `bringToMiddle`, `pressLeave`) and tells it
facts such as `ScrolledByReader()`. When to follow, how long to wait and when
the reader has left are the rule's to say.

## The ratchet

`pnpm lint` runs `pnpm check:painter-ratchet`. It counts, in every `html*.ts` file here and `../interaction/document*.ts`, timers
and clocks, held state, listeners, and numbers other than 0 and 1, and fails
when a count rises above `scripts/painter-ratchet/painters.json`. A file that
ledger does not list starts at zero, so a new file here cannot hold a rule.

The counts are not a budget to stay under. Zero is where each file is headed,
and every count above zero is a rule still to move into core.

- You moved a rule to core: run `pnpm check:painter-ratchet --write` to record
  the lower counts.
- A rise is fair (a layout number such as `padding: 24`, or a file split in
  two): edit only `scripts/painter-ratchet/painters.json`. Raise the count and
  add beside it
  `"rises": [{ "kind": "numbers", "from": 14, "to": 15, "why": "padding: 24 on the sheet, a layout number" }]`.

The plan is `plans/14-ui-v1.md` ("The rule", "The contract", "Keeping it
true"). The words are in `glossary.md` under "Behavior and painters".
