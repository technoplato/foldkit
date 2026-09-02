# Counters | surface storyboards

One Program. Same Model, same Messages, same printed URI. React, the
non-captive terminal, and the TUI are paint adapters.

Sample rows: `c1=3`, `c2=0`, `c3=11` unless a beat changes a count.

`parse(print(d)) == d`. The URI is the destination, not an event log.

---

## Destination ADT

Two independent sums. Page is where you are. Overlay is the one global
sheet, dialog, or alert. You never leave the page to delete or show a fact.

```
Page
  CounterList
  CounterDetail(counterId)

Overlay                          at most one
  None
  DeleteConfirmation(counterId)
  CounterFact(counterId, Loading | Loaded(text) | Failed(cause))

ActionMenu                       sibling chrome, not a page
  Closed
  Open(query, highlightedAction)
```

`Overlay` is what the first draft called `maybeMode`. It is not a field of
detail. List and detail can both present delete or fact. Fact and delete
cannot be up at the same time. Action menu is a higher-order wrap
(`compose.actionMenu`): `{ product, actionMenu }`. Cmd-K / Ctrl-K / `:`
opens it. Choosing a row sends the same Message the on-screen control would.

Presentation / confirmation / request ids stay out of this artifact. They
are session occurrence keys in today's core. They are not product state
and they do not belong on the URI.

---

## Printed URIs

Page in the path. Overlay in the query, so the page does not change.

```
/counters
/counters?delete=c1
/counters?fact=c1
/counters/c1
/counters/c1?delete=c1
/counters/c1?fact=c1
```

Action menu is not printed (chrome). Question for Michael: should an open
menu be in the URI, for example `?actions=1`?

Foldkit Navigation owns this destination. Browser `history`, Expo Router,
React Navigation, and CLI argv are adapters that parse and print the same
relative URI. Native Back / gesture / stack pop is `OpenedNavigation` of
the previous destination, not a host-only side channel.

---

## Shared keys

Same Message catalog, same keys, every keyboard surface.

| Key | Message |
| --- | --- |
| `a` | `ClickedAddCounter({ counterId })` |
| `+` / `=` | `GotChild({ id, message: Increment })` on the focused row |
| `-` | `GotChild({ id, message: Decrement })` on the focused row |
| `Enter` | `SelectedCounter({ counterId })` on a list row |
| `f` | `ClickedShowCounterFact({ counterId })` list row or detail |
| `x` | `ClickedDeleteCounter({ counterId })` list row or detail |
| `r` | `GotChild({ id, message: Reset })` detail only |
| `Esc` | dismiss overlay, or `DismissedCounterDetail` if none |
| `Cmd-K` / `Ctrl-K` / `:` | open or close ActionMenu |
| `↑` `↓` | move list / menu highlight |

Debug / replay keys are **not** drawn until we confirm that menu is ported
onto this composed Program. Open question.

---

## Flow

```
ClickedAddCounter(c4)
  /counters  -->  /counters                 (one more row)

GotChild(c1, Increment | Decrement)
  /counters  -->  /counters                 (same dest, new count)

SelectedCounter(c1)
  /counters  -->  /counters/c1

DismissedCounterDetail(c1)
  or native Back from detail
  /counters/c1  -->  /counters

ClickedShowCounterFact(c1) from list
  /counters  -->  /counters?fact=c1         (Loading, then Loaded or Failed)
DismissedCounterFactAlert(c1)  [aborts the fetch]
  /counters?fact=c1  -->  /counters

ClickedShowCounterFact(c1) from detail
  /counters/c1  -->  /counters/c1?fact=c1
DismissedCounterFactAlert(c1)  [aborts the fetch]
  /counters/c1?fact=c1  -->  /counters/c1

ClickedDeleteCounter(c1) from list
  /counters  -->  /counters?delete=c1
CancelledDeleteCounter(c1)
  /counters?delete=c1  -->  /counters
ConfirmedDeleteCounter(c1)
  /counters?delete=c1  -->  /counters       (c1 gone)

ClickedDeleteCounter(c1) from detail
  /counters/c1  -->  /counters/c1?delete=c1
CancelledDeleteCounter(c1)
  /counters/c1?delete=c1  -->  /counters/c1
ConfirmedDeleteCounter(c1)
  /counters/c1?delete=c1  -->  /counters    (c1 gone, page falls to list)

OpenedActionMenu / ClosedActionMenu
  URI unchanged
```

Deep link: a fresh Client that opens `/counters?delete=c1` is
`OpenedNavigation` of `Page: List, Overlay: DeleteConfirmation(c1)`.

---

## S0 | empty list

uri: `/counters`
from: `OpenedNavigation` of CounterList
to: `/counters` via `ClickedAddCounter({ counterId })`

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Counters          + │    │ Counters          + │    │ Counters          + │
│                     │    │                     │    │                     │
│  No counters yet.   │    │  No counters yet.   │    │  No counters yet.   │
│                     │    │                     │    │                     │
│  ┌───────────────┐  │    │  ┌───────────────┐  │    │> a  Add counter     │
│  │ + Add counter │  │    │  │ + Add counter │  │    │  :  Actions         │
│  └───────────────┘  │    │  └───────────────┘  │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
a add   Cmd-K actions
```

CLI `show` is a snapshot of the same tree the TUI paints. Note: share one
rendering engine (JSX-to-ASCII exploration already exists). Do not print
raw destination JSON as the human surface.

---

## S1 | populated list

uri: `/counters`
from: S0 after three adds (or Instant already has the rows)

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Counters     Σ 14 + │    │ Counters     Σ 14 + │    │ Counters     Σ 14 + │
│                     │    │                     │    │                     │
│ c1          3 − + 🗑│    │ c1          3 − + x │    │> c1   3  − + f x    │
│ c2          0 − + 🗑│    │ c2          0 − + x │    │  c2   0  − + f x    │
│ c3         11 − + 🗑│    │ c3         11 − + x │    │  c3  11  − + f x    │
│                     │    │                     │    │                     │
│                     │    │                     │    │ a add  : actions    │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
row title / Enter -> SelectedCounter(c1)        -> /counters/c1
− / +               -> GotChild Increment|Decrement
🗑 / x              -> ClickedDeleteCounter(c1) -> /counters?delete=c1
f                   -> ClickedShowCounterFact(c1) -> /counters?fact=c1
+ in chrome / a     -> ClickedAddCounter
```

---

## S1a | increment on the list

uri: `/counters` (unchanged)
message: `GotChild({ id: c1, message: Increment })`
c1 becomes 4. Σ 15. Every Client on this Instant account paints 4, including
a Client sitting on `/counters/c1`.

---

## S2 | detail

uri: `/counters/c1`
from: `SelectedCounter({ counterId: c1 })` or
`OpenedNavigation` of CounterDetail(c1)
native Back / leading chevron / stack pop: `OpenedNavigation` of CounterList
in-app back control: `DismissedCounterDetail({ counterId: c1 })`

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ ← Counters          │    │ ← Counters          │    │ ← Counters          │
│                     │    │                     │    │                     │
│     counter c1      │    │     counter c1      │    │     counter c1      │
│         3           │    │         3           │    │         3           │
│                     │    │                     │    │                     │
│      [ − ] [ + ]    │    │      [ − ] [ + ]    │    │> + increment        │
│      [ Reset ]      │    │      [ Reset ]      │    │  − decrement        │
│      [ Fact ]       │    │      [ Fact ]       │    │  r reset            │
│      [ Delete ]     │    │      [ Delete ]     │    │  f fact             │
│                     │    │                     │    │  x delete           │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

---

## S3 | fact from the list (Loading)

uri: `/counters?fact=c1`
from: S1 `ClickedShowCounterFact({ counterId: c1 })`
Command: `FetchCounterFact` for the current count (3). Dismiss **aborts**
that Command.

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Counters     Σ 14 + │    │ Counters     Σ 14 + │    │ Counters     Σ 14 + │
│ c1  3  − + 🗑       │    │ c1  3  − + x        │    │  c1   3             │
│ c2  0  − + 🗑       │    │ c2  0  − + x        │    │  c2   0             │
│ c3 11  − + 🗑       │    │ c3 11  − + x        │    │  c3  11             │
│                     │    │                     │    │                     │
│  ┌───────────────┐  │    │  ┌───────────────┐  │    │ ┌ Fact about 3 ───┐ │
│  │ Fact about 3  │  │    │  │ Fact about 3  │  │    │ │ … loading       │ │
│  │ … loading     │  │    │  │ … loading     │  │    │ │ Esc dismiss     │ │
│  └───────────────┘  │    │  └───────────────┘  │    │ └─────────────────┘ │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

---

## S4 | fact loaded (from list)

uri: `/counters?fact=c1`
from: S3 `SucceededLoadCounterFact({ counterId: c1, fact })`
`fact` is the number-specific text. No omitted fields.

```
React / CLI snapshot / TUI share this sheet over the list:

┌ Fact about 3 ────────────────────────────┐
│ 3 is the only number that is equal to    │
│ the sum of all numbers less than it      │
│ that are divisible by 2 or 3.            │
│                                          │
│              [ Dismiss ]                 │
└──────────────────────────────────────────┘
```

`DismissedCounterFactAlert({ counterId: c1 })` → `/counters`

---

## S5 | fact failed (from list)

uri: `/counters?fact=c1`
from: S3 `FailedLoadCounterFact({ counterId: c1, cause })`

```
┌ Fact about 3 ────────────────────────────┐
│ Could not load fact.                     │
│                                          │
│              [ Dismiss ]                 │
└──────────────────────────────────────────┘
```

Same URI. Same dismiss. Same abort if you dismiss during Loading.

---

## S4d | fact from detail

uri: `/counters/c1?fact=c1`
Same sheet, painted over S2 instead of S1. Dismiss → `/counters/c1`.

---

## S6 | delete from the list

uri: `/counters?delete=c1`
page stays CounterList. Overlay is DeleteConfirmation(c1).

from: S1 `ClickedDeleteCounter({ counterId: c1 })`

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Counters     Σ 14 + │    │ Counters     Σ 14 + │    │ Counters     Σ 14 + │
│ c1  3  − + 🗑       │    │ c1  3  − + x        │    │  c1   3             │
│ c2  0  − + 🗑       │    │ c2  0  − + x        │    │  c2   0             │
│ c3 11  − + 🗑       │    │ c3 11  − + x        │    │  c3  11             │
│                     │    │                     │    │                     │
│  ┌───────────────┐  │    │  ┌───────────────┐  │    │ ┌ Delete c1? ─────┐ │
│  │ Delete c1?    │  │    │  │ Delete c1?    │  │    │ │ Cannot undo.    │ │
│  │ Cannot undo.  │  │    │  │ Cannot undo.  │  │    │ │ [c] cancel      │ │
│  │ [Cancel][Del] │  │    │  │ [Cancel][Del] │  │    │ │>[x] delete      │ │
│  └───────────────┘  │    │  └───────────────┘  │    │ └─────────────────┘ │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

Cancel → `/counters`. Confirm → `/counters` with c1 gone.

One React surface. Delete uses the platform dialog. Fact uses a sheet.
That is paint, not two Programs.

### CLI while the dialog is up

The overlay does not move you to detail. `show` still snapshots list +
dialog.

If you ignore the dialog and send a product Message:

```
$ counters send increment --id c1
# GotChild({ id: c1, message: Increment })
# uri stays /counters?delete=c1
# c1 is now 4 under the same dialog
```

Keyboard focus on React/TUI stays on Cancel/Delete. CLI and ActionMenu can
still send catalog Messages that are valid for the rows. Overlay stays put
unless the Message was Cancel or Confirm.

If the token names a counter that is not in the list:

```
$ counters send delete --id c9
counter c9 not found. available: c1, c2, c3
```

---

## S7 | delete from detail

uri: `/counters/c1?delete=c1`
page stays CounterDetail(c1).

```
React / CLI / TUI: S2 chrome, same Delete c1? dialog on top.
Cancel -> /counters/c1
Confirm -> /counters   (c1 gone, cannot stay on a missing detail)
```

---

## S8 | after confirmed delete

uri: `/counters`
rows c2, c3. Deep link `/counters/c1` or `/counters?delete=c1` with no c1
normalizes to `/counters`.

---

## S9 | after cancelled delete from the list

uri: `/counters`
You never visited detail.

---

## S-AM | action menu over the list

uri: `/counters` (unchanged in this take)
from: `Cmd-K`

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Counters     Σ 14 + │    │ Counters     Σ 14 + │    │ Counters     Σ 14 + │
│ c1  3               │    │ c1  3               │    │  c1   3             │
│                     │    │                     │    │                     │
│  ┌ Actions ──────┐  │    │  ┌ Actions ──────┐  │    │ ┌ Actions ────────┐ │
│  │ Filter_       │  │    │  │ Filter_       │  │    │ │ Filter_         │ │
│  │> Add counter  │  │    │  │> Add counter  │  │    │ │> Add counter    │ │
│  │  Increment c1 │  │    │  │  Increment c1 │  │    │ │  Increment c1   │ │
│  │  Decrement c1 │  │    │  │  Decrement c1 │  │    │ │  Fact c1        │ │
│  │  Fact c1      │  │    │  │  Fact c1      │  │    │ │  Delete c1      │ │
│  │  Delete c1    │  │    │  │  Delete c1    │  │    │ │  Open c1        │ │
│  │  Open c1      │  │    │  │  Open c1      │  │    │ └─────────────────┘ │
│  └───────────────┘  │    │  └───────────────┘  │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

Rows are `actions valid in this Model`. Enter sends that Message. Esc
closes the menu.

---

## Sync | increment

```
t0  React /counters          c1=3
    TUI   /counters/c1       c1=3
    CLI   /counters          c1=3

t1  React: GotChild({ id: c1, message: Increment })

t2  all three paint c1=4. URIs unchanged.
```

---

## Sync | list trash

When navigation is shared across authenticated Clients, the other Client
sees the delete overlay before confirm.

```
t0  both on /counters
t1  React: ClickedDeleteCounter({ counterId: c1 })
t2  both paint /counters?delete=c1   (dialog visible)
t3  React: ConfirmedDeleteCounter({ counterId: c1 })
t4  both paint /counters, c1 absent
```

---

## Completeness (only gaps from the storm)

### Last row deleted

Confirm on the only remaining counter → S0 at `/counters`.

### Unknown id

`/counters/ghost` or `/counters?delete=ghost` → list. No NotFound page
unless you want one. Question: list-as-sink is enough?

### Stale fact Command

Dismiss (or leave `?fact=`) **aborts** `FetchCounterFact`. A late
`SucceededLoadCounterFact` does not reopen the sheet.

### Native Back

Core previous destination, adapter pops the stack.

```
/counters/c1?delete=c1  Back  ->  /counters/c1
/counters?delete=c1     Back  ->  /counters
/counters/c1            Back  ->  /counters
```

Escape on the dialog is `CancelledDeleteCounter`. Browser / Expo / RN Back
is `OpenedNavigation` of the printed parent. Same destination either way
from list-delete (both land on `/counters`).

### Deep-link fact

Open `/counters?fact=c1` on a fresh Client. Loading, then fetch against
the **current** count. The number is not in the URI.

---

## Questions

1. Print the action menu on the URI (`?actions=1`) or keep it chrome-only?
2. Is increment-under-an-open-delete-dialog the CLI/ActionMenu behavior you
   want, or should those Messages be rejected while an overlay is Some?
3. Has the debug / replay menu been composed onto this Program yet, or do
   we leave it off the storyboard?
4. List-as-sink for unknown ids, or a real NotFound destination?
