# Multiple Counters | Foldkit

A list of counters you can count up, count down, reset, open, and delete, written once and shown in React, Svelte, OpenTUI, a live terminal UI, and a plain CLI. This page explains how it works as if you were ten.

## What it does

- The list shows every counter with its count and five buttons: `+`, `-`, `Reset`, `Open`, and `Delete`. Reset is greyed out while a count is 0, exactly like the single Counter.
- `Add counter` puts a new counter at the end of the list, starting at 0.
- `Open` shows one counter on its own page, `/counters/2`. There, `+` and `-` on the keyboard count that counter.
- `Delete` never deletes straight away. It asks "Delete Counter 2?" in a dialog, and you answer `Delete` or `Cancel`.
- Every window on every computer sees every change: count, add, or delete in one, and the others follow. They all talk to the same Instant project, the one the single Counter uses.

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
  DeleteQuestion, // /counters/delete/3, carries { counterId: 3 }
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
  maybeModal: Option<Modal<Destination>> // Some(DeleteQuestion(2) as a Dialog), or None
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
export const catalog = Catalog.make([
  Add, // add a counter at the end
  Increment, // { counterId: 3 }: Counter 3 goes up by one
  Decrement, // { counterId: 3 }: Counter 3 goes down by one
  Reset, // { counterId: 3 }: Counter 3 goes back to 0
  Open, // { counterId: 3 }: open Counter 3's page
  Delete, // { counterId: 3 }: ask "Delete Counter 3?"
  ConfirmDelete, // { counterId: 3 }: delete Counter 3
  CancelDelete, // close the question, keep the counter
])
```

Every move that touches one counter carries that counter's name tag. There is no "increment" that forgets which counter it means.

### Built from the single Counter: `Catalog.lift`

The single Counter already knows how to count. It has `Increment`, `Decrement`, and `Reset`, their words, their keys (`+`, `-`, `r`), and the rule that Reset is greyed out at 0. Multiple Counters does not write any of that again. It lifts the Counter's whole rulebook over the list:

```typescript
export const counterActions = Catalog.lift(counterCatalog, {
  field: 'counterId',
  Id: CounterId,
  token: CounterIdSegment, // how a counter prints in a tag, a command, or a URI: 3
  prompt: 'Which counter?',
  rowsOf: model =>
    model.counters.map(row => ({
      id: row.counterId,
      title: counterName(row.counterId), // 'Counter 3'
      detail: `count ${row.counter.count}`, // 'count 5'
      model: row.counter, // the single Counter's own Model, { count: 5 }
    })),
  preferredOf: shownOf, // on Counter 3's page, `-` means Counter 3
  enabled: unlessConfirming,
  nothingToChoose: 'there are no counters yet',
})

export const [Increment, Decrement, Reset] = counterActions.actions
```

Each lifted move keeps the Counter's tag and adds the counter it is for: `Decrement({ counterId: 2 })`. When it arrives, `counterActions.childOf` hands back `Decrement()` and Counter 2, and the single Counter's own `update` does the counting. Counter 2's page shows the single Counter's own screen, plus a Delete button.

### One move, then which counter: choosing Actions

Imagine a vending machine. You don't get a separate button for "cola from row 1", "cola from row 2", and so on. You press "cola", and then the machine asks which row. That keeps the front of the machine short.

Each lifted move works that way, and so do `Open` and `Delete`. Here is what one move gives every window:

| Where                                  | What you see                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Action menu                            | one row, `Decrement ›`; choose it and the menu asks "Which counter?", `/counters/menu?menu.choose=Decrement` |
| A counter's row in the list            | a `-` button that presses `Decrement:3`                                                                      |
| A counter's page                       | `-` on the keyboard, because that counter is the preferred choice                                            |
| The open menu, with ⌘ (Ctrl off a Mac) | `⌘K`, then `⌘3` picks the third row, Decrement, then `⌘2` picks Counter 2; `⌘-` stays the browser's zoom     |
| CLI                                    | `counters decrement 3`                                                                                       |

Leave the number off and the CLI shows you the whole command:

```text
$ counters decrement
decrement <counter-id> needs one of: 1, 2, 3. Try: counters decrement 1
```

Reset shows why this matters. `Reset counter` stays in the menu while any counter can be reset, and inside it Counter 1 is greyed out with "count is already 0", using the exact rule the single Counter uses.

Confirming a delete is a choosing move too, with one possible answer: the counter the open question names. No surface can confirm deleting a counter nobody was asked about.

### Which moves are allowed right now: entries

Every surface asks the same question: "What can I press right now, and if I can't, why not?" The answer is one list, `Catalog.entries(catalog, model)`:

```text
add                            a     Adds a counter at the end of the list,
                                     starting at 0
                                     $ counters add

increment <counter-id>               Increments the count by one
                                     Choose one of: 1, 2
                                     $ counters increment 1

reset <counter-id>                   Sets the count to 0
                                     Choose one of: 2
                                     Unavailable for 1: count is already 0
                                     $ counters reset 2
```

The React buttons, the Svelte buttons, the OpenTUI boxes, the CLI commands, the keyboard keys, and the action menu rows are all drawn from that one list. That is why Reset is greyed out with the same sentence everywhere.

## Things that cannot happen

Some mistakes are impossible because the types do not allow them to be written. Others are impossible because one rule, tested once, runs in every window. Both kinds are listed here with where the proof lives.

### Ruled out by the types

Each line below is in `core/src/impossible.test.ts` with `@ts-expect-error`. If any of them ever compiled, the typecheck would fail.

| You try to write                 | Why it does not compile                     |
| -------------------------------- | ------------------------------------------- |
| `Increment({ counterId: 5 })`    | `5` is a number, not a `CounterId` name tag |
| `Increment()`                    | counting must name the counter it counts    |
| `DeleteQuestion()`               | the question must name its counter          |
| `ConfirmDelete()`                | deleting must name the counter it deletes   |
| `CounterRow.make({ counterId })` | a counter in the list always has a count    |
| two modals in `maybeModal`       | it holds one modal or none, never a list    |
| a pushed page as the modal       | `Push` is not a modal style                 |
| a page named `CounterEditor`     | it is not one of the four Destinations      |

### Ruled out by one rule every window shares

These are checked in `core/src/app.test.ts` and `core/src/live.test.ts`:

- **Nothing behind the dialog can be pressed.** While "Delete Counter 1?" is open, every other Action says `answer the delete question first`. Clicking is blocked by the dialog, and the CLI and keyboard are blocked by the same entries, so `counters increment 2` is refused too.
- **The question can only delete the counter it names.** You press `Delete` with no number. Its only choice is the counter in the open question, `DeleteQuestion(1)`, so it sends `ConfirmDelete({ counterId: 1 })`. With no question open, `counters confirm-delete` is refused: `confirm-delete is disabled: no delete is waiting for an answer.`
- **The action menu cannot open over the dialog.** It is a modal too, and the pile holds one.
- **The menu stays short.** Each move is one row however many counters there are; the counters appear only after you pick the move.
- **A counter's page never sits on another counter's page.** Opening Counter 2 from Counter 1's page swaps the page.
- **A deleted counter leaves nothing behind.** Deleting Counter 2 removes its page and its question from the pile, on every device that hears about it. If another device deletes it while your page is open, your page closes.
- **A page for a counter that is gone says so.** Typing `/counters/9` shows "Counter 9 is not in the list" instead of breaking.

## Where each kind of change goes

Counting, adding, and deleting are **Domain** moves: every device applies them. Opening a page, going Back, and asking the question are **Navigation** moves. Every page above the list has a Back button, and Escape presses it, so the terminals can go back too. Session settings decide what Navigation does:

- **Mirror navigation**: every device moves together. Open Counter 2 on your laptop and your phone shows it too.
- **Keep navigation local**: each device keeps its own screen, while counts still sync. Your phone can sit on the list while your laptop has Counter 2 open; delete Counter 2 on the phone and the laptop's page closes.

## Run it

Every app reads and writes the same Instant project, so start as many as you like, on as many computers as you like, and they stay in step. The terminal apps read the Instant admin token from `~/.config/foldkit-instant-demo/counter-v01.env` (or the file `FOLDKIT_INSTANT_DEMO_ENV_FILE` names). The web apps need no token.

React, at <http://127.0.0.1:5217/counters>:

```sh
pnpm --filter multiple-counters-react-example start
```

Svelte, at <http://localhost:5219/counters>:

```sh
pnpm --filter multiple-counters-svelte-example start
```

The CLI, one command at a time:

```sh
pnpm --filter multiple-counters-cli-example start   # build, then paint the list and every Action
cd examples/multiple-counters/cli
pnpm counters add
pnpm counters increment 2
pnpm counters open 2
pnpm counters delete 2           # asks "Delete Counter 2?"
pnpm counters confirm-delete 2   # deletes Counter 2
pnpm counters back               # go back to the list
pnpm counters watch              # repaint the list as it changes, from every device
pnpm counters tail               # print every move as it lands
```

The live terminal UI, where `a` adds, `?` opens the menu, `d` asks, `y` and `n` answer, Escape goes back, and `q` quits:

```sh
pnpm --filter multiple-counters-cli-example tui
```

OpenTUI, with mouse clicks:

```sh
pnpm --filter multiple-counters-opentui-example start
```

The Session settings Sheet lists these same commands with a copy button, so you can start another app from any window.

## What is not here yet

- **Expo and Foldkit HTML windows.** The React Native and Foldkit HTML adapters already paint any Program, the dialog included, but this example has no Expo or Foldkit HTML package yet.
