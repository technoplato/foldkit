# Multiple Counters | Foldkit

A list of counters you can count up, count down, reset, open, and delete, written once and shown in React, Svelte, OpenTUI, a live terminal UI, and a plain CLI. This page explains how it works as if you were ten.

## What it does

- The list shows every counter with its count and five buttons: `+`, `-`, `Reset`, `Open`, and `Delete`. Reset is greyed out while a count is 0, exactly like the single Counter.
- `Add counter` puts a new counter at the end of the list, starting at 0.
- `Open` shows one counter on its own page, `/counters/2`. There, `+` and `-` on the keyboard count that counter.
- `Delete` never deletes straight away. It asks "Delete Counter 2?" in a dialog, and you answer `Delete` or `Cancel`.
- Every window that reads the same tape sees every change: count, add, or delete in one, and the others follow.

## The big idea: one rulebook, many windows

Think of a board game. The rulebook says what a move is, which moves are allowed right now, and what the board looks like after each move. The rulebook does not care whether you play on a wooden board, on a phone, or by shouting moves across a room.

The Multiple Counters Program in `core/` is the rulebook. Each host (React, Svelte, OpenTUI, the TUI, the CLI) is just a board. A host shows what the rulebook says is on the board and passes along the moves people make. It never decides anything.

Here is the whole React window, `react/src/App.tsx`:

```tsx
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <section className="w-full max-w-xl text-center space-y-6">
        <WhenReady>
          <NavigationFrame />
          <ActionMenuButton />
        </WhenReady>
      </section>
    </main>
  )
}
```

It is the same file as the single Counter's React window. It does not say "counter", "delete", or `/counters` anywhere. The words, the buttons, the dialog, the tab title `Counter 2 | React`, and the look of every button come from the rulebook and from Foldkit.

## The pieces of the rulebook

### A counter's name tag: `CounterId`

```typescript
export const CounterId = S.Int.check(S.isGreaterThanOrEqualTo(1)).pipe(
  S.brand('CounterId'),
)
```

Every counter wears a name tag with a number, `3` for Counter 3. The tag is "branded", which means a plain number is not allowed to pretend to be a name tag. A count of 5 and Counter 5 are different kinds of thing, and the computer refuses to mix them up.

Numbers are never handed out twice. Delete Counter 2, add another, and you get Counter 3. So a leftover question about Counter 2 can never land on a new counter that happens to reuse its number.

### The list: `Model`

```typescript
export const Model = S.Struct({
  counters: S.Array(CounterRow), // [{ counterId: 1, counter: { count: 0 } }, ...]
  nextCounterId: CounterId, // 2
  navigation: Navigation.NavigationStack(Destination),
})
```

Each row holds the single Counter Program's own Model, `{ count: 0 }`. The list does not invent its own idea of counting. It borrows the Counter's.

### Where you can be: `Destination`

```typescript
export const Destination = S.Union([
  CounterList, // /counters
  CounterDetail, // /counters/3, carries { counterId: 3 }
  ConfirmDelete, // /counters/delete/3, carries { counterId: 3 }
  Navigation.NotFound, // any other path
])
```

This is the full list of places the app can show. There is no fifth place. If a screen is not in this list, the app cannot be on it.

### The pile of screens: `NavigationStack`

Screens stack like plates. The list is always the bottom plate. Pages go on top of it, and at most one modal (a dialog, a sheet, the action menu) sits on the very top:

```typescript
type NavigationStack<Destination> = {
  root: Destination // the list
  pages: ReadonlyArray<Destination> // [CounterDetail(2)]
  maybeModal: Option<Modal<Destination>> // Some(ConfirmDelete(2) as a Dialog), or None
}
```

`maybeModal` holds one modal or none. There is no way to write two, because there is no list to put them in. And a modal's style can be a Dialog, a Sheet, a Drawer, and so on, but never a plain page push, so a page can never sit on top of a dialog.

Every pile prints as one address you can share:

| Pile                                        | Address                     |
| ------------------------------------------- | --------------------------- |
| list                                        | `/counters`                 |
| list, Counter 2's page                      | `/counters/2`               |
| list, "Delete Counter 2?"                   | `/counters/delete/2`        |
| list, Counter 2's page, "Delete Counter 2?" | `/counters/2/delete/2`      |
| list, the action menu typed `inc`           | `/counters/menu?menu.q=inc` |

### The moves: `Message`

```typescript
export const Message = S.Union([
  AddCounter, // add a counter at the end
  ConfirmDeleteCounter, // { counterId: 3 }: delete Counter 3
  CancelDeleteCounter, // close the question, keep the counter
  GotCounterMessage, // { counterId: 3, message: Increment() }
  Navigation.OpenedUri, // the address bar or a link moved
  Navigation.NavigatedBack, // Back was pressed
])
```

`GotCounterMessage` wraps the single Counter's own moves (`Increment`, `Decrement`, `Reset`) plus `OpenCounter` and `DeleteCounter`, and says which counter they are for.

### Which moves are allowed right now: entries

Every surface asks the same question: "What can I press right now, and if I can't, why not?" The answer is one list, `entriesOf(model)`:

```text
add-counter               a     Adds a counter at the end of the list
increment 1                     Increments the count by one
reset 1                         Sets the count to 0
                                Unavailable: count is already 0
delete-counter 1                Asks before deleting the counter
```

The React buttons, the Svelte buttons, the OpenTUI boxes, the CLI commands, the keyboard keys, and the action menu rows are all drawn from that one list. That is why Reset is greyed out with the same sentence everywhere.

## Things that cannot happen

Some mistakes are impossible because the types do not allow them to be written. Others are impossible because one rule, tested once, runs in every window. Both kinds are listed here with where the proof lives.

### Ruled out by the types

Each line below is in `core/src/impossible.test.ts` with `@ts-expect-error`. If any of them ever compiled, the typecheck would fail.

| You try to write                                                 | Why it does not compile                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `GotCounterMessage({ counterId: 5, ... })`                       | `5` is a number, not a `CounterId` name tag |
| `GotCounterMessage({ counterId, message: { _tag: 'Explode' } })` | a counter has no Explode move               |
| `ConfirmDelete()`                                                | the question must name its counter          |
| `ConfirmDeleteCounter()`                                         | deleting must name the counter it deletes   |
| `CounterRow.make({ counterId })`                                 | a counter in the list always has a count    |
| two modals in `maybeModal`                                       | it holds one modal or none, never a list    |
| a pushed page as the modal                                       | `Push` is not a modal style                 |
| a page named `CounterEditor`                                     | it is not one of the four Destinations      |

### Ruled out by one rule every window shares

These are checked in `core/src/app.test.ts` and `core/src/live.test.ts`:

- **Nothing behind the dialog can be pressed.** While "Delete Counter 1?" is open, every other Action says `answer the delete question first`. Clicking is blocked by the dialog, and the CLI and keyboard are blocked by the same entries, so `counters increment 2` is refused too.
- **The question can only delete the counter it names.** You press `Delete` with no number. The rulebook reads the number from the open question, `ConfirmDelete(1)`, and sends `ConfirmDeleteCounter({ counterId: 1 })`. With no question open, `confirm-delete-counter` is refused: `no delete is waiting for an answer`.
- **The action menu cannot open over the dialog.** It is a modal too, and the pile holds one.
- **A counter's page never sits on another counter's page.** Opening Counter 2 from Counter 1's page swaps the page.
- **A deleted counter leaves nothing behind.** Deleting Counter 2 removes its page and its question from the pile, on every device that hears about it. If another device deletes it while your page is open, your page closes.
- **A page for a counter that is gone says so.** Typing `/counters/9` shows "Counter 9 is not in the list" instead of breaking.

## Where each kind of change goes

Counting, adding, and deleting are **Domain** moves: every device applies them. Opening a page and asking the question are **Navigation** moves. Session settings decide what Navigation does:

- **Mirror navigation**: every device moves together. Open Counter 2 on your laptop and your phone shows it too.
- **Keep navigation local**: each device keeps its own screen, while counts still sync. Your phone can sit on the list while your laptop has Counter 2 open; delete Counter 2 on the phone and the laptop's page closes.

## Run it

React, at <http://127.0.0.1:5217/counters>:

```sh
pnpm --filter multiple-counters-react-example dev
```

Svelte, at <http://127.0.0.1:5219/counters>:

```sh
pnpm --filter multiple-counters-svelte-example dev
```

The CLI, one command at a time. The counters live in a file every terminal on this machine shares, so they are still there next time:

```sh
cd examples/multiple-counters/cli && pnpm build
node dist/entry.js                         # paint the list and every Action
node dist/entry.js add-counter
node dist/entry.js increment 2
node dist/entry.js open-counter 2
node dist/entry.js delete-counter 2        # asks "Delete Counter 2?"
node dist/entry.js confirm-delete-counter  # deletes Counter 2
node dist/entry.js tail                    # print every move as it lands
```

The live terminal UI, where `a` adds, `?` opens the menu, `d` asks, `y` and `n` answer, Escape goes back, and `q` quits:

```sh
node dist/tui.js
```

OpenTUI, with mouse clicks:

```sh
cd examples/multiple-counters/opentui && bun src/entry.ts
```

`COUNTERS_TAPE_PATH=/tmp/mine.json` picks the file, and `COUNTERS_TAPE=memory` keeps one run to itself.

## What is not here yet

- **Sharing between computers.** The web windows keep their counters in the tab, and the terminals share one file on one machine. The file is read when a terminal starts, so a running TUI does not see a CLI change until it restarts. Sharing live across devices needs an Instant app for Multiple Counters, which is a schema change to decide on first.
- **Expo and Foldkit HTML windows.** The React Native and Foldkit HTML adapters already paint any Program, the dialog included, but this example has no Expo or Foldkit HTML package yet.
