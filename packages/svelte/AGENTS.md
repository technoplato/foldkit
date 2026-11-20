# The Svelte painter

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

This painter is frozen for plan 14's v1. Only `examples/counter/svelte` uses
it. Its copies of rules are not migrated yet, and it may not grow.

It still holds one copy of the follow rule: `userScrollQuietMs = 4000` and
`lastUserScrollAtMs` in `src/interaction/TranscriptView.svelte`. The shared
rule is `TranscriptFollow` in `packages/foldkit/src/behavior/`, which the
HTML, React and phone painters run. Do not copy the Svelte one anywhere, and
do not add a rule here.

A rule is any number with a unit of time, distance or count, or any branch on
what the person meant. It goes in `packages/foldkit/src/behavior/`. A mechanic
is how this platform measures, scrolls, listens, waits and draws. It stays in
the painter.

`pnpm lint` runs `pnpm check:painter-ratchet`, which counts timers and clocks,
held state (`$state`, `let`), listeners and numbers other than 0 and 1 in
every file under `packages/svelte/src`, and fails when a count rises above
`scripts/painter-ratchet/painters.json`. Zero is where each file is headed.
To record a fair rise, edit only that file: raise the count and add a `rises`
entry that says why.

The plan is `plans/14-ui-v1.md`. Read `packages/foldkit/src/behavior/AGENTS.md`
before writing a behavior.
