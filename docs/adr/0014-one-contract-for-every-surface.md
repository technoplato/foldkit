# ADR 0014 | One contract for every surface

Date: 2026-10-05

Status: Accepted. Decision 3 is implemented (`d8858c683`, `e3e20e439`, `e21b4d469`, `87649e3aa`). Decision 4 lists the fixes made on 2026-10-04. Decisions 1 and 2 are in progress.

## Context

Books worked on the web and broke in the terminal. Michael, on 2026-10-05: "they shouldn't have broken in the first place if they worked on web is supposed to be the point of this abstraction". The core Program was the same everywhere; every failure was in what surrounds it.

- `books listen a-new-earth` played for a moment and stopped. The next `books play` said "nothing is in the player", and the words stayed on "Loading the words…".
- In the TUI, keys seemed dead: 17 of 22 keys changed nothing visible, and Escape never went back.
- The terminal followed Safari's screen and once landed on `/books/contents` with "No title is open", a Contents Sheet with no title under it.
- Terminal telemetry recorded nothing.
- On the web, the player page jumped every second while a word was highlighted.

## Five whys

### Playback stopped when a CLI command returned

1. The audio stopped because the process exited after printing.
2. The process exited because Books' CLI entry ran the Program in a one-shot process with `runProgramCommand`.
3. Books chose a one-shot process because Foldkit ships the terminal surface as parts: `runProgramCommand`, `listenCliDaemon`, `ensureCliDaemon`, `askCliDaemon`, `runProgramTui`, `runProgramWatch`, `runProgramTail`. Each example assembles its own host from them. `examples/multiple-counters/cli` is one-shot, `examples/puzzle/cli` uses the daemon, and Books copied the one-shot shape.
4. The parts let a Program with live work run in a host that kills it, because no terminal host consults what the Program needs to stay alive: its Subscriptions (the clock, the transcript window), its ManagedResources (the audio), its unsettled Commands. A browser tab keeps living, so the web never needed to ask.
5. The terminal host is a kit because the web host is one provided runtime (`ProgramProvider`, `NavigationFrame`, browser history, key bindings), while terminal surfaces grew one example at a time and were never consolidated.

### TUI keys seemed dead

1. Keys seemed dead because the highlight moved where no one could see it, and Escape did nothing.
2. The highlight was out of sight because frames were up to 325 lines tall in a 40-row terminal, which shows only the bottom. Escape did nothing because Node's readline reports the Escape key with Meta held, and `terminalKeyInput` passed that on as a chord no Action takes.
3. Frames were that tall because the terminal painter laid out the whole UiNode tree with no viewport. The web scrolls overflow natively; the terminal had nothing in its place.
4. Nothing caught it because the terminal painters were exercised with Counter-sized screens, and their tests checked layout, not "the focused row is visible" or "Escape goes back".
5. There was no such test because painters were added surface by surface, each tested alone, with no shared statement of what every painter must guarantee.

### Safari took over the terminal

1. The terminal landed on `/books/contents` because it folded Safari's mirrored stack (title, player, Contents) in a process whose player held nothing. Books drops a player page whose title isn't loaded, so the Sheet was left over the library.
2. A stack could become invalid because Session applied mirrored navigation without checking the result against the navigation's own rules.
3. Books' navigation depended on state that is not shared: the player is per device, while the stack was mirrored.
4. The terminal mirrored at all because Session's mode applied to every Processor, whatever its surface.
5. Session had no notion of surfaces with different navigation needs, and no invariant that every folded stack satisfies the declaration.

### Terminal telemetry recorded nothing

1. It recorded nothing because its observer threw `window.addEventListener is not a function`.
2. It called `window.addEventListener` because it decided it was in a browser by checking `typeof window !== 'undefined'`.
3. `window` existed in Node because `@foldkit/instant`'s Node client defines an empty `window`, so `@instantdb/core` starts its client in a terminal.
4. That stand-in broke telemetry because Foldkit decided "browser" by the existence of a global, not by the capability it needed. The same raw check sat in React's navigation, key bindings, and router, and in Svelte's links and dock.
5. Each package wrote its own check, because Foldkit had no single answer to "is this a page?".

### The web page jumped every second

1. The page jumped because React tore down and rebuilt the player every second.
2. React rebuilt it because the frame keyed each screen by its address, and the player's address follows the second being heard: `/books/a-new-earth/listen/1h41m05s`, then `/1h41m06s`.
3. Screens were keyed by address because Foldkit gave painters nothing else to key by: a carrier entry had a `key` (its path) and no identity.
4. Terminal focus had the same bug, fixed separately, because each painter derived "which screen is this" on its own.
5. That is the same root as the TUI viewport: cross-cutting behavior reimplemented per painter, with no shared contract.

## Root cause

Foldkit promises that a Program written once runs on every surface. Only the web held that promise, because only the web host is a complete runtime and the browser supplies behavior the others had to build: scrolling, a long-lived process, a real `window`. The terminal surface is a kit each app assembles, each painter reimplements identity, focus, scrolling, and keys on its own, and nothing checks that they agree.

## Decision

1. **One terminal host runtime (in progress).** A single entry in `foldkit/cli` owns the terminal surface for a Program, the way `ProgramProvider` and `NavigationFrame` own the web. It is daemon first: the Program lives in one daemon, a command such as `books pause` is a client of it, `books tui` is a live view of it, and the daemon stops when the Program has no live work left. It owns short help, sign-in hooks, telemetry with the right surface, and installing the command. A one-shot run of a Program with live Subscriptions fails loudly in development. Every terminal example moves to it, and their hand-built daemons and entries go away.
2. **A conformance suite every surface passes (in progress).** Scenario Programs (a 200-row list, a player whose address moves, a Sheet over it, a Dock, a Dialog) and one set of assertions, run against the terminal painter and TUI, HTML, React, Svelte, OpenTUI, and React Native:
   - the focused row is always visible
   - docks stay visible
   - a screen whose identity is unchanged is never remounted
   - Escape goes back
   - every enabled Action is reachable by its key
   - a Sheet opens on its current row
   - the current row looks current
   - nothing overflows the surface

   A new painter joins by passing it. A surface that cannot pass an assertion carries a visible, documented exception, never a silent skip.

3. **One way to ask "is this a page?" (done).** `Environment.maybePage()` returns the window and document only for a real page: a `window` that takes listeners, a `document`, and not React Native. `Environment.isPage()` is its boolean. Foldkit's telemetry and renderer, React, and Svelte use it. The lint rule `foldkit/no-raw-page-check` reports `typeof window` and `typeof document` anywhere in package source except `environment/environment.ts`, so the raw check cannot return.
4. **Fixed in core on 2026-10-04.**
   - Screens have an identity (`identityOf`), and painters key by it.
   - `terminalKeyInput` reads Escape as plain Escape.
   - The terminal paints a viewport that follows the highlight.
   - Session trims any folded stack to what the navigation allows.
   - Terminals keep their own navigation under Mirror (`ownNavigationHosts`).
   - The CLI daemon keeps answering after a client checks it.

## Consequences

- A Program that works in one surface is held to the same behavior in every other by tests, not by each host's author remembering what the browser did for free.
- Terminal apps lose their bespoke daemon and entry code; a new terminal app is one call.
- Hosts and painters cost more to add, because each must pass the suite. That cost is the point.
- `@foldkit/instant`'s Node client still defines a global `window`. Every package check now asks for the capability, so the stand-in is harmless; narrowing the stand-in itself stays open.
