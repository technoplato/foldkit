# Behavior: where a UI rule is written, once

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

This folder (`foldkit/behavior`) is where everything else a part does lives.
A behavior is what a part does over time when a person uses it: a menu
opens, the down arrow moves the highlight, Escape closes it. It is written
here once, as a pure function with no framework in it, and every Client's
painter runs it.

## What goes here

- **A rule**: any number with a unit of time, distance or count (500 ms,
  10 px, 5 tries), or any branch on what the person meant (a hold is not a
  press). Example: `LEAVING_QUIET_MS = 1000` in `transcriptFollow.ts`, how
  long the words are left alone after the reader scrolls.
- **Not a mechanic**: how one platform measures, scrolls, listens, waits and
  draws stays in that painter. Example: `sightOf` in
  `../renderers/htmlEdge.ts` measures a word with `getBoundingClientRect`,
  and the phone's painter measures the same word a different way. Both
  answer `MeasureWord` with a `Sight`.

If you find a rule in a painter, or you are about to write one there, it
belongs here. Say so and move it with its tests, smallest step first.

## The shape of a block

One small behavior is a block: Schemas for `State`, `Fact` and `Instruction`,
an `initial` state, and

```ts
step: (state: State, context: Context, fact: Fact) =>
  Readonly<{ state: State; instructions: ReadonlyArray<Instruction> }>
```

- `step` never waits, never reads a clock, never touches a platform. Time
  arrives in `context.nowMs`.
- A timer is an instruction out and a fact back in:
  `WaitForLeaveCheck({ afterMs: 250 })`, then `ElapsedLeaveWait()`.
- State holds no sentinel. A time that has not happened is `Option.none()`,
  so the State can be written as JSON.
- Items are data. A menu's order comes from its `items`, never from asking
  the page which element is next.

Two blocks are here, one for each place a block's state can live:

- `transcriptFollow.ts` (`TranscriptFollow`): how a Transcript's view
  follows the voice. Nothing painted depends on its state, so its runner
  holds it (painter home). `start(ports)` is the one runner the HTML edge,
  the React painter and the phone's painter share. A painter fills six
  ports (`now`, `wait`, `told`, `measure`, `bringToMiddle`, `pressLeave`).
- `reader.ts` (`Reader`): following or detached, the way back, a named
  place. The screen is drawn from its state, so the State is a field of the
  Model and `step` runs in update (device home).

Ask in this order where a new block's state lives. Does anything painted, or
anything an agent reads, depend on it? If no, painter home. Should another
device or the log see it? If yes, logged home, in the Model with an ordinary
Message. Otherwise device home, in the Model and never logged.

## What may not be here

`pnpm lint` fails on any of these in this folder (`.oxlintrc.json`, the
override for `packages/foldkit/src/behavior/**`):

- `document`, `window`, `navigator`, `globalThis`, `self`;
- a timer: `setTimeout`, `setInterval`, `setImmediate`,
  `requestAnimationFrame`, `requestIdleCallback`, their `clear` and `cancel`
  partners, and `performance`;
- a clock read or a sleep: `Date.now`, `Effect.sleep`, `Effect.delay`;
- an import of `foldkit/html`, `foldkit/dom`, `foldkit/mount`,
  `foldkit/render`, `foldkit/file`, by any path, or of `Html`, `Mount`,
  `Dom`, `Render`, `File` from the `foldkit` root;
- an import of React, React Native, Svelte, `@foldkit/react`,
  `@foldkit/react-native`, `@foldkit/ui`, or `@floating-ui`.

When a block needs the platform, declare a port and let each painter fill
it. Example: the runner needed to wait, so `Ports` has
`wait: (afterMs, elapsed) => () => void`, and a test fills it with a wait it
ends by hand.

## Tests

Test `step` with no page: a state, a context, a fact, and what comes back.
`transcriptFollow.test.ts` drives the runner to the end with a hand-driven
`wait` and no timer.

## Then the painters

Each painter's folder has its own `AGENTS.md`, and `pnpm lint` runs the
painter ratchet (`pnpm check:painter-ratchet`), which fails when a painter
file gains a timer, held state, a listener or a number. Zero is where each
painter file is headed.

The plan is `plans/14-ui-v1.md` ("The rule", "The contract", "Keeping it
true"). The words are in `glossary.md` under "Behavior and painters".
