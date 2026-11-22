# The terminal painters

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

This folder is the terminal Client adapter. Its painters are `surface.ts`,
`terminalScreen.ts`, `tui.ts`, `tail.ts` and `view.ts`: they turn the screen
tree and the declared commands into lines and columns. The rest of the folder
(`argv.ts`, `backgroundProcessor.ts`, `protocol.ts`, `host.ts`, `serve.ts`,
`liveness.ts`, `words.ts`) is the adapter's own work and is not counted. `AGENTS.md` at the repo root says what a CLI may do
and what belongs to the TUI.

## A terminal host is one call

`terminal()` in `host.ts` (`foldkit/cli/host`) is the whole of a Program's
terminal host. `examples/counter/cli/src/entry.ts` is one:

```ts
await terminal({
  name: 'counter',
  entry: import.meta.url,
  processor: async () => {
    const { SyncedCounter, startCounter, newProcessorInstance } =
      await import('counter-core-example')
    return {
      program: SyncedCounter,
      start: host => startCounter({ host, instance: newProcessorInstance() }),
    }
  },
})
```

- `host.ts` is the thin half. It imports no Effect and no Program, so a
  command starts fast. It owns argv, `stop`, `watch`, `tail`, `tui`, and
  replacing a Background Processor of another build.
- `serve.ts` is the Background Processor: it starts the Program, answers
  every command through the Program's own declarations, and stops.
- `liveness.ts` is the rule for when it stops, with no Effect and no socket:
  ten minutes with no work the host's `keepsAlive(model)` names, no view
  attached, and no command. The same words say when it makes way for
  another build: never while they name work. A host says "I am working"
  once, in `keepsAlive`, and both rules read it.
- `words.ts` holds the words the two halves say to each other that no
  Program declares (`stop`, `background-build`, `background-make-way`), and
  imports nothing.

Add to `terminal()` only what no declaration can say. A host that needs a
`daemon.ts`, an in-process runner, or a pid file is missing something here:
add it here, for every host, with a test in `host.test.ts`.

What is not built yet is in `plans/01-terminal-runtime.md` under "Built so
far": liveness declared on a Subscription, a second protocol version,
`status`, and a durable local log.

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

A rule that belongs in core: which paragraph a Transcript marks current and
which lines sit around it. It is in core already, as `transcriptExcerptOf`
in `foldkit/renderers`, so `books words` and a caption on a page print the
same words. A new rule of that kind goes beside it or in
`packages/foldkit/src/behavior/`, never in `view.ts`.

A mechanic that belongs here: how many columns the terminal has
(`fallbackColumns = 80` when it will not say), how a line is cut to fit,
which escape codes move the cursor, and how often a terminal can redraw.

Which row is highlighted is state, not a mechanic. Scribe #2592 moves it
into a synced Message in core, so do not grow a second copy of it here.

The pattern to copy is `TranscriptFollow`
(`packages/foldkit/src/behavior/transcriptFollow.ts`): the rule for how a
Transcript's view follows the voice. The painter gives its runner six ports
(`now`, `wait`, `told`, `measure`, `bringToMiddle`, `pressLeave`) and tells it
facts such as `ScrolledByReader()`. When to follow, how long to wait and when
the reader has left are the rule's to say.

## The ratchet

`pnpm lint` runs `pnpm check:painter-ratchet`. It counts, in `surface.ts`, `terminalScreen.ts`, `tui.ts`, `tail.ts` and `view.ts` here,
and the Books terminal in `examples/books/cli/src`, timers
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

Scribe #2591 (branch `books-tui-2591`) is changing these files now, and its
flicker fix adds a frame diff. The ledger carries a note beside each of them
saying so; that branch records its own rises when it rebases.

The plan is `plans/14-ui-v1.md` ("The rule", "The contract", "Keeping it
true"). The words are in `glossary.md` under "Behavior and painters".
