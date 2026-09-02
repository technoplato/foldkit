# Counters | surface storyboards (first take)

One Program. Same Model, same Messages, same URI projection. Three adapters paint
it. Sample rows stay `c1=3`, `c2=0`, `c3=11` unless a storyboard changes a count.

URI law (Swift Navigation / ADR 0003): `parse(print(d)) == d`. The URI is the
destination, not an event log. Fact and delete are mutually exclusive modes over
detail. Impossible combo: `/counters/c1/fact` and `/counters/c1/delete` at once.

```
Navigation
  CounterList
  CounterDetail(c1 | c2 | c3, maybeMode)

CounterDetailMode
  CounterFactAlert(Loading | Loaded | Failed)
  DeleteCounterConfirmation
```

Printed paths:

```
/counters
/counters/:id
/counters/:id/fact
/counters/:id/delete
```

Flow (Messages on edges, URIs on nodes):

```
                ClickedAddCounter(c4)
  /counters ──────────────────────────────────► /counters   (one more row)

                GotChild(c1, Increment|Decrement)
  /counters ──────────────────────────────────► /counters   (same dest, new count)

                SelectedCounter(c1)
  /counters ──────────────────────────────────► /counters/c1

                DismissedCounterDetail(c1)
  /counters/c1 ───────────────────────────────► /counters

                GotChild(c1, Increment|Decrement|Reset)
  /counters/c1 ───────────────────────────────► /counters/c1

                ClickedShowCounterFact(c1)
  /counters/c1 ───────────────────────────────► /counters/c1/fact   (Loading)
                SucceededLoadCounterFact | FailedLoadCounterFact
               ───────────────────────────────► /counters/c1/fact   (Loaded|Failed)
                DismissedCounterFactAlert(c1)
               ───────────────────────────────► /counters/c1

                ClickedDeleteCounter(c1)   from list row or detail
  /counters or /counters/c1 ──────────────────► /counters/c1/delete
                CancelledDeleteCounter(c1)
               ───────────────────────────────► /counters/c1   (or list if we later model that)
                ConfirmedDeleteCounter(c1)
               ───────────────────────────────► /counters
```

Deep-link rule: every node above is a shareable relative URI. A host adds origin
or argv. Opening `/counters/c1/delete` in a fresh Client is `OpenedNavigation`
with `DeleteCounterTarget({ counterId: c1 })`.

---

## S0 | empty list

uri: `/counters`
style: Push
from: (fresh Client) `OpenedNavigation(CounterListTarget)`
to: `/counters` via `ClickedAddCounter({ counterId })`

### React

```
┌──────────────────────────────────────────┐
│ Counters                              +  │
│                                          │
│         No counters yet.                 │
│                                          │
│         ┌──────────────────┐             │
│         │  + Add counter   │             │
│         └──────────────────┘             │
│                                          │
└──────────────────────────────────────────┘
```

### Non-captive terminal (one-shot `show`)

```
$ counters show
uri: /counters
destination: CounterList
rows: (none)
interactions:
  [add]  Add counter   Primary
```

### TUI

```
┌ Counters ────────────────────────────────┐
│ (empty)                                  │
│                                          │
│ > a  Add counter                         │
│                                          │
│ q quit                                   │
└──────────────────────────────────────────┘
```

---

## S1 | populated list

uri: `/counters`
style: Push
from: S0 `ClickedAddCounter` (three times, or Instant already has rows)
to:

- `/counters` `GotChild({ id: c1, message: Increment })` or `Decrement`
- `/counters/c1` `SelectedCounter({ counterId: c1, detailPresentationId })`
- `/counters/c1/delete` `ClickedDeleteCounter({ counterId: c1, confirmationId, detailPresentationId })`

Same URI as S0. Count lives on the Model, not the path.

### React

```
┌──────────────────────────────────────────┐
│ Counters                    Σ 14      +  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  c1                          3     │  │
│  │                         [−] [+] 🗑 │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  c2                          0     │  │
│  │                         [−] [+] 🗑 │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  c3                         11     │  │
│  │                         [−] [+] 🗑 │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

Row click / title: `SelectedCounter`. `[−]` / `[+]`: `GotChild`. Trash:
`ClickedDeleteCounter`. `+` in chrome: `ClickedAddCounter`.

### Non-captive terminal

```
$ counters show
uri: /counters
destination: CounterList
  c1  3
  c2  0
  c3  11
interactions:
  [add]           Add counter
  [open:c1]       Open c1
  [decrement:c1]  Decrement
  [increment:c1]  Increment
  [delete:c1]     Delete c1
  ...same tokens for c2, c3

$ counters send increment:c1
# then show again: c1 is 4, uri still /counters
```

### TUI

```
┌ Counters  Σ 14 ──────────────────────────┐
│  c1   3   [−] [+] [x]                    │
│> c2   0   [−] [+] [x]                    │
│  c3  11   [−] [+] [x]                    │
│                                          │
│ ↑↓ row   ←→ replay                       │
│ a add  +/− count  enter open  x delete   │
│ q quit                                   │
└──────────────────────────────────────────┘
```

---

## S1a | list after increment (storyboard beat)

uri: `/counters` (unchanged)
message in: `GotChild({ id: c1, message: Increment })`
c1 is now `4`. Visual same as S1 with `c1 4` and `Σ 15`. Sync law: any other
Client observing the same Instant account paints `4` on this row and on
`/counters/c1` if they are on detail.

---

## S2 | detail

uri: `/counters/c1`
style: Push
from: S1 `SelectedCounter({ counterId: c1, ... })` or deep link
`OpenedNavigation(CounterDetailTarget({ counterId: c1 }))`
to:

- `/counters` `DismissedCounterDetail`
- `/counters/c1` `GotChild(Increment|Decrement|Reset)`
- `/counters/c1/fact` `ClickedShowCounterFact`
- `/counters/c1/delete` `ClickedDeleteCounter`

### React

```
┌──────────────────────────────────────────┐
│ ← Counters                               │
│                                          │
│              counter c1                  │
│                                          │
│                  3                       │
│                                          │
│         [ − ]         [ + ]              │
│                                          │
│         [ Reset ]                        │
│         [ Show fact ]                    │
│         [ Delete counter ]               │
│                                          │
└──────────────────────────────────────────┘
```

### Non-captive terminal

```
$ counters show
uri: /counters/c1
destination: CounterDetail  c1=3  mode: none
interactions:
  [back]    Back to counters
  [decrement:c1]
  [increment:c1]
  [reset]
  [fact]
  [delete]

$ counters send increment:c1
# uri still /counters/c1, count 4
```

### TUI

```
┌ Counter c1 ──────────────────────────────┐
│                                          │
│                 3                        │
│                                          │
│> [+] increment                           │
│  [−] decrement                           │
│  [r] reset                               │
│  [f] show fact                           │
│  [x] delete                              │
│  Esc back                                │
└──────────────────────────────────────────┘
```

---

## S3 | fact loading

uri: `/counters/c1/fact`
style: Sheet over S2
from: S2 `ClickedShowCounterFact({ counterId: c1, requestId, detailPresentationId })`
Command: `LoadCounterFact` (name TBD; effect is the favorite-number fact)
to: same URI via `SucceededLoadCounterFact` or `FailedLoadCounterFact`

### React (sheet)

```
┌──────────────────────────────────────────┐
│ ← Counters                    (dimmed)   │
│              counter c1                  │
│                  3                       │
│         [ − ]         [ + ]              │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Fact about 3                       │  │
│  │                                    │  │
│  │  … loading                         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Non-captive terminal

```
uri: /counters/c1/fact
destination: CounterDetail  c1=3  mode: CounterFactAlert(Loading)
interactions:
  [dismiss]  Dismiss fact
```

### TUI

```
┌ Fact  3  (loading) ──────────────────────┐
│  …                                       │
│                                          │
│> Esc / enter  dismiss                    │
└──────────────────────────────────────────┘
```

---

## S4 | fact loaded

uri: `/counters/c1/fact`
style: Sheet
from: S3 `SucceededLoadCounterFact({ fact, ... })`
to: `/counters/c1` `DismissedCounterFactAlert`

### React

```
┌──────────────────────────────────────────┐
│ ← Counters                    (dimmed)   │
│              counter c1                  │
│                  3                       │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Fact about 3                       │  │
│  │                                    │  │
│  │  3 is the only number that is      │  │
│  │  equal to the sum of all numbers   │  │
│  │  less than it that are divisible   │  │
│  │  by 2 or 3.                        │  │
│  │                                    │  │
│  │           [ Dismiss ]              │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Non-captive terminal

```
uri: /counters/c1/fact
mode: CounterFactAlert(Loaded, "3 is the only number…")
  [dismiss]
```

### TUI

```
┌ Fact  3 ─────────────────────────────────┐
│ 3 is the only number that is equal to    │
│ the sum of all numbers less than it      │
│ that are divisible by 2 or 3.            │
│                                          │
│> [enter] dismiss                         │
└──────────────────────────────────────────┘
```

---

## S5 | fact failed

uri: `/counters/c1/fact`
style: Sheet
from: S3 `FailedLoadCounterFact({ cause, ... })`
to: `/counters/c1` `DismissedCounterFactAlert`

### React

```
  ┌────────────────────────────────────┐
  │ Fact about 3                       │
  │                                    │
  │  Could not load fact.              │
  │                                    │
  │           [ Dismiss ]              │
  └────────────────────────────────────┘
```

Same dimmed detail underneath as S3/S4. Terminal and TUI swap the body text for
the failure cause. URI does not change.

---

## S6 | delete confirmation (opened from list trash)

uri: `/counters/c1/delete`
style: Dialog over the list-shaped world, but navigation is still
`CounterDetail(c1, DeleteCounterConfirmation)`. That is the Point-Free move:
the confirm sheet is a destination, not a boolean on the list.

from: S1 `ClickedDeleteCounter({ counterId: c1, confirmationId, detailPresentationId })`
to:

- `/counters/c1` `CancelledDeleteCounter` (today: cancel lands on detail)
- `/counters` `ConfirmedDeleteCounter` then the row is gone

Comment magnet: should cancel from a list-originated delete return to
`/counters` instead of `/counters/c1`? First take follows current core.

### React

```
┌──────────────────────────────────────────┐
│ Counters                    Σ 14      +  │
│  c1  3   [−] [+] 🗑     (inert)          │
│  c2  0   [−] [+] 🗑                      │
│  c3 11   [−] [+] 🗑                      │
│                                          │
│        ┌──────────────────────────┐      │
│        │ Delete c1?               │      │
│        │ This cannot be undone.   │      │
│        │                          │      │
│        │  [ Cancel ]  [ Delete ]  │      │
│        └──────────────────────────┘      │
└──────────────────────────────────────────┘
```

React-B would use a native `<dialog>`. React-A uses the same custom modal as fact.
The Model does not care.

### Non-captive terminal

```
uri: /counters/c1/delete
destination: CounterDetail  c1=3  mode: DeleteCounterConfirmation
interactions:
  [cancel]          Cancel
  [confirm-delete]  Delete counter   Destructive

$ counters send confirm-delete
# next show: uri /counters, rows c2, c3
```

### TUI

```
┌ Delete c1? ──────────────────────────────┐
│ This cannot be undone.                   │
│                                          │
│  [c] cancel                              │
│> [x] delete                              │
└──────────────────────────────────────────┘
```

---

## S7 | delete confirmation (opened from detail)

uri: `/counters/c1/delete` (same destination as S6)
from: S2 `ClickedDeleteCounter` with the existing `detailPresentationId`
visual: dialog over the detail chrome instead of the list chrome.

### React

```
┌──────────────────────────────────────────┐
│ ← Counters                    (inert)    │
│              counter c1                  │
│                  3                       │
│                                          │
│        ┌──────────────────────────┐      │
│        │ Delete c1?               │      │
│        │ This cannot be undone.   │      │
│        │                          │      │
│        │  [ Cancel ]  [ Delete ]  │      │
│        └──────────────────────────┘      │
└──────────────────────────────────────────┘
```

---

## S8 | after confirmed delete

uri: `/counters`
from: S6 or S7 `ConfirmedDeleteCounter({ counterId: c1, ... })`
rows: `c2=0`, `c3=11`, `Σ 11`. Deep link `/counters/c1` after this is an unknown
id. Core falls back to the list destination.

---

## S9 | after cancelled delete

uri: `/counters/c1`
from: S6 or S7 `CancelledDeleteCounter`
visual: S2 again. List-origin cancel still showing detail is the thing to argue
about in comments.

---

## Storyboard | increment stays in sync

Two Clients, one Instant account.

```
t0  React          uri /counters          c1=3
    TUI            uri /counters/c1       c1=3
    CLI show       uri /counters          c1=3

t1  React sends GotChild({ id: c1, message: Increment })

t2  React          uri /counters          c1=4
    TUI            uri /counters/c1       c1=4   (still on detail)
    CLI show       uri /counters          c1=4
```

URI did not have to change for the count to move. Navigation is the destination.
The count is row state.

---

## Storyboard | list trash to confirm to gone

```
 /counters
   React: trash on c1
   Message: ClickedDeleteCounter({ counterId: c1, confirmationId, detailPresentationId })

 /counters/c1/delete
   React: dialog  [Cancel] [Delete]
   TUI: focused confirm
   CLI: counters send confirm-delete
   Message: ConfirmedDeleteCounter({ counterId: c1, ... })

 /counters
   c1 absent everywhere
```

---

## Completeness pass | cases the first sketch skipped

These are still the same Program. They are the ones event/state storming
usually forgets, then a host invents a special screen for.

### S10 | last remaining counter deleted

uri after: `/counters` (S0 empty again)
from: S7 with only `c1` in `rows`, `ConfirmedDeleteCounter({ counterId: c1 })`

Worth drawing because "populated list minus one" is not the same as "back to
first-run empty". Same URI. Same Add interaction. Different history in
`retiredCounterIds` (c1 cannot be added again).

```
┌──────────────────────────────────────────┐
│ Counters                              +  │
│                                          │
│         No counters yet.                 │
│                                          │
│         ┌──────────────────┐             │
│         │  + Add counter   │             │
│         └──────────────────┘             │
│                                          │
└──────────────────────────────────────────┘
```

Non-captive: `rows: (none)` plus a retired set is an implementation detail.
Do not put retired ids in the URI.

### S11 | unknown or already-deleted id

carrier in: `/counters/ghost` or `/counters/c1` after S8
message: `OpenedNavigation(CounterDetailOpening({ target: c1|ghost }))`
canonical dest: `/counters` via `normalizeNavigation`

No NotFound chrome in current core. The unknown address is not a fourth
Navigation case. Host may flash the typed path for one frame. The Model
lands on the list.

```
React / TUI / CLI after normalize
  uri printed: /counters
  rows: whatever still exists
```

Same for `/counters/ghost/fact` and `/counters/ghost/delete`. Fact opening
does not fire `FetchCounterFact` if the row is gone.

Comment magnet: do we want a real NotFound destination (`/not-found?from=...`)
so a typed typo is explainable? First take: no. List is the sink.

### S12 | list is full (100 rows)

uri: `/counters`
`ClickedAddCounter` is a no-op. `Add counter` should disappear from
`interactionsForModel` once we treat "valid interactions" as complete.
Today core still offers add and update ignores it. That is a hole.

Proposed visual (not current code):

```
┌──────────────────────────────────────────┐
│ Counters                   Σ …     (full)│
│  c1 …                                    │
│  …                                       │
│  (no + in chrome)                        │
└──────────────────────────────────────────┘
```

CLI: no `[add]` token. TUI: no `a add`. Silent ignore is the wrong product
shape once we are storming for completeness.

### S13 | overlay is the only live surface

uri: `/counters/c1/delete` or `/counters/c1/fact`

While `maybeMode` is Some, `interactionsForModel` is only dismiss / cancel /
confirm. List `[−][+]🗑`, detail Reset, and Add are not in the set. React
must make the backdrop inert. TUI replaces the whole chrome with the overlay
actions. CLI `send increment:c1` is an illegal token.

```
$ counters send increment:c1
error: token increment:c1 is not valid at /counters/c1/delete
uri unchanged
```

That is a first-class storyboard: the failed send. Not a new destination.

### S14 | stranger deletes the row you have open

t0 You: `/counters/c1` or `/counters/c1/delete`
Them: `ConfirmedDeleteCounter({ counterId: c1 })` on another Processor

t1 Your Model normalizes to `/counters`. Dialog vanishes because the
destination no longer exists. No local "they deleted it" Message required
if Instant folds their Message into your tape. If we want a toast, that
is a new fact (`NoticedCounterRetired`) and a new optional chrome, not a
URI.

### S15 | stale Command result

t0 `/counters/c1/fact` Loading, requestId `r1`
t1 `DismissedCounterFactAlert` → `/counters/c1`
t2 late `SucceededLoadCounterFact({ requestId: r1 })` → Model unchanged

Same if you confirmed delete while a fact was in flight, or if a second
`ClickedShowCounterFact` is attempted while a mode is already open (update
returns `[model, []]`). Draw this as a no-transition arrow, not a new screen.

```
/counters/c1/fact (Loading r1)
    DismissedCounterFactAlert
/counters/c1
    SucceededLoadCounterFact(r1)
/counters/c1     (still, no sheet)
```

### S16 | deep-link straight into fact

Fresh Client opens `/counters/c1/fact`.

message: `OpenedNavigation(CounterFactOpening)`
effect: `FetchCounterFact` using the **current** count, not a count in the URI

You land on S3 (Loading), then S4 or S5. The printed URI never includes the
number. Share the path, not "fact about 3". If c1 is 4 by the time the
Command runs, the fact is about 4.

### S17 | browser Back / argv step-out

History stack is a host concern. The Program only accepts
`OpenedNavigation` for the previous printed path.

```
/counters/c1/delete   Back
  → OpenedNavigation(CounterDetailTarget c1)   uri /counters/c1
/counters/c1          Back
  → OpenedNavigation(CounterListTarget)        uri /counters
```

Do not encode Back as `CancelledDeleteCounter` unless the host maps Escape
inside the dialog that way. Escape on the dialog is Cancel (identity check
on confirmationId). Browser chrome Back is a new opening.

### S18 | illegal CLI token / dead TUI binding

Not a destination. A host error line. Keep it in the storm so we do not
invent `NoOp`.

```
$ counters send delete:c9
error: token delete:c9 is not valid at /counters
```

### S19 | increment floor and ceiling

`GotChild(Increment|Decrement)` stays at `/counters` or `/counters/c1`.
If the child Counter clamps at 0 or a max, the URI does not change and the
button should leave the interaction set or disable. Same completeness hole
as S12: a no-op Message is worse than an absent control.

Sketch at 0 on the list:

```
│  c2                          0     │
│                         [ ] [+] 🗑 │
```

`[−]` gone or inert. Token `decrement:c2` absent.

---

## Host cheat sheet

| Surface              | How a human sends a Message                                          |
| -------------------- | -------------------------------------------------------------------- |
| React                | click / tap → adapter → `useActions` / enqueue                       |
| Non-captive terminal | `show` prints dest + tokens; `send <token>` is one Message then exit |
| TUI                  | focus a valid interaction, Enter (or `+` `−` `x` `a`)                |

Hosts never invent a token. `interactionsForModel` is the only legal set.

---

## Comment magnets (leave notes in this file)

- Trash on the list item: yes in this take.
- Increment / decrement on the list item: yes, same `GotChild` as detail.
- Reset and fact: detail only, for now.
- Cancel-from-list-trash landing: `/counters/c1` today.
- Empty vs full list: same URI.
- Fact loading / loaded / failed: same URI, status on the mode.
- Presentation ids stay off the URI (session, not address).
- NotFound vs list-as-sink for unknown ids (S11).
- Hide Add at 100 and hide Decrement at 0, instead of silent no-ops (S12, S19).
- Escape-in-dialog is Cancel. Browser Back is `OpenedNavigation` (S17).
- No toast URI when a stranger deletes your open row (S14).
