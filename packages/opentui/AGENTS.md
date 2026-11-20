# The OpenTUI painter

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

`src/interaction/paintOpenTui.ts` turns the screen tree into OpenTUI
renderables, and `runOpenTui.ts` runs a Program in a full-screen terminal.

A rule is any number with a unit of time, distance or count, or any branch on
what the person meant. It goes in `packages/foldkit/src/behavior/`, written
once for every Client. A mechanic is how this platform measures, scrolls,
listens, waits and draws. It stays here. Example: which row a list marks
current is core's to say and arrives on the screen tree; how wide a column is
drawn in cells is this painter's.

`pnpm lint` runs `pnpm check:painter-ratchet`, which counts timers and clocks,
held state, listeners and numbers other than 0 and 1 in every file under
`packages/opentui/src`, and fails when a count rises above
`scripts/painter-ratchet/painters.json`. Zero is where each file is headed; a
count is not a budget. To record a fair rise, edit only that file: raise the
count and add a `rises` entry that says why.

The plan is `plans/14-ui-v1.md`. Read `packages/foldkit/src/behavior/AGENTS.md`
before writing a behavior.
