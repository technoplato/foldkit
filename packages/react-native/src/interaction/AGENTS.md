# The phone's painter

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

This folder turns the screen tree into React Native views for the phone
(`screen.tsx`, `transcript.tsx`, `list.tsx`, `seek.tsx`, `field.tsx`,
`menuSheet.tsx`, `actionMenuModal.tsx`). Books on a phone is drawn by it.

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

A rule that belongs in core, and is still here: `maximumJumps = 5` and
`retryAfterMs = 120` in `transcript.tsx`. "Try again up to 5 times, 120 ms
apart" is a rule with a count and a time in it, and only the phone has it.
It goes when `bringIntoView` answers whether it arrived (plan 14, slice 6).
Do not add another like it.

A mechanic that belongs here: asking the list to scroll to an offset,
measuring a word's line with `whereIs`, hearing a person's own scroll with
`scroll.onUserScroll`, and the `wait` port over `setTimeout`.

When the platform already holds a rule, report its outcome as one fact and
let core's rule stay out of it. React Native recognizes a long press itself,
so once the `longPress` block is built (plan 14, slice 4) the phone tells it
one fact, `HeldLong()`, and the 500 ms and 10 px are the platform's here. Layout numbers (`padding: 24`, a font size) are not rules: record them
as a fair rise.

The pattern to copy is `TranscriptFollow`
(`packages/foldkit/src/behavior/transcriptFollow.ts`): the rule for how a
Transcript's view follows the voice. The painter gives its runner six ports
(`now`, `wait`, `told`, `measure`, `bringToMiddle`, `pressLeave`) and tells it
facts such as `ScrolledByReader()`. When to follow, how long to wait and when
the reader has left are the rule's to say.

## The ratchet

`pnpm lint` runs `pnpm check:painter-ratchet`. It counts, in every file under `packages/react-native/src`, timers
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

Never edit the phone app's `package.json` scripts for a change here: the
app's update fingerprint hashes them.

The plan is `plans/14-ui-v1.md` ("The rule", "The contract", "Keeping it
true"). The words are in `glossary.md` under "Behavior and painters".
