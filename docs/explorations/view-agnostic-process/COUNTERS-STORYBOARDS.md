# Counters | surface storyboards

One Program. Same Model, same Messages, same printed URI. React, the
non-captive terminal, and the TUI are paint adapters.

Sample rows: `c1=3`, `c2=0`, `c3=11` unless a beat changes a count.

`parse(print(d)) == d`. The URI is the destination, not an event log.

Nothing is chrome-only. If it is on screen, it is Model, and it prints.

---

## Destination ADT

```
Page
  CounterList
  CounterDetail(counterId)
  NotFound({ lookedFor, missing })

Overlay                          at most one
  None
  DeleteConfirmation(counterId)
  CounterFact(counterId, Loading | Loaded(text) | Failed(cause))
  ActionMenu(query, highlightedAction)
```

`Overlay` is global. List and detail can both present delete, fact, or the
action menu. Only one overlay at a time.

`NotFound` is a page. Foldkit core owns a generic builder: given the URI
that was looked for and a typed missing resource, produce a human
description. Counters fills that with "Counter c9 does not exist." The
builder is not counters-specific.

`compose.actionMenu` still wraps `{ product, actionMenu }`. Opening the
menu is Overlay.ActionMenu and it prints.

---

## Via

Every catalog Message carries `via`. `update` does not branch on it. The
tape keeps how the fact arrived.

Decided in ADR 0011 Q115 / Q116:

```
Via
  Button     { label, uri }
  ActionMenu { query, uri, maybeHighlighted }
  Agent      { question, uri, maybeDurationMs }
```

Q122 is still open (Keyboard vs stamp Button; CLI case). We need the
arrival not to vanish, so this artifact stamps:

```
  Key        { key, uri }
  Cli        { argv, uri }
```

Examples:

```
GotChild({ id: c1, message: Increment, via: Button({ label: '+', uri: '/counters' }) })
GotChild({ id: c1, message: Increment, via: Key({ key: '+', uri: '/counters?delete=c1' }) })
GotChild({ id: c1, message: Increment, via: Cli({ argv: 'send increment --id c1', uri: '/counters?delete=c1' }) })
ClickedDeleteCounter({ counterId: c1, via: ActionMenu({ query: 'del', uri: '/counters?actions=1' }) })
```

TUI `x` and web click are different `via` values of the same Message.

---

## Printed URIs

```
/counters
/counters?actions=1
/counters?delete=c1
/counters?fact=c1
/counters/c1
/counters/c1?actions=1
/counters/c1?delete=c1
/counters/c1?fact=c1
/not-found?lookedFor=%2Fcounters%2Fc9
```

`?actions=1` is the open action menu. Filter text can join later
(`?actions=1&q=inc`) if we want shareable menu query.

---

## Navigation we already have

`packages/foldkit/src/navigation` already models stack and presentation,
not only a flat path:

- Styles: Push, Sheet, Dialog, Popover, Drawer, FullScreenCover
- Stack ops: `push`, `pop`, `replaceTop`, `setRoot`
- Present / dismiss of an overlay entry
- Host plugins: TanStack, React Router, React Navigation
- Effects today: `pushUrl`, `replaceUrl`, `back()` (`window.history.back()`),
  `forward()`, `load`, `openUrl`

Counters core today flattens delete onto detail and treats unknown ids as
the list. That is the assumption to replace.

Standard patterns for this Program:

| Pattern | When | Model change | Adapter |
| --- | --- | --- | --- |
| Push | open c1 | stack `[List, Detail(c1)]` | push `/counters/c1` |
| Pop / Back | leave detail | stack `[List]` | native pop / header back / gesture |
| Present | delete, fact, actions | overlay Some | present Dialog / Sheet / menu |
| Dismiss | Esc, Cancel, Dismiss | overlay None | dismiss native surface |
| Replace | confirm delete from detail | stack `[List]`, overlay None | replace `/counters` (cannot pop onto a missing c1) |
| Set root | deep link, NotFound | stack equals printed URI | set native stack |
| Forward | host history only | only if Model recorded it | `forward()` after a prior pop |

`RequestedBack` is a Message. It dismisses an overlay if one is up,
otherwise pops the stack. Browser `popstate`, Expo / RN header, and the
system back gesture all become `RequestedBack` or `OpenedNavigation` of
the URI the adapter just landed on. We do not call `history.back()` as
the source of truth. The Model is. The adapter reconciles.

Esc is `RequestedBack` when it dismisses overlay, on every keyboard
surface (web frameworks and TUI). React Native keeps the same Message
when a hardware keyboard is attached; touch still uses the visible
buttons.

---

## Focus and keys

The core screen tree owns focus. Tab, Shift-Tab, and arrows move among
the elements the Program declared. We have not landed the exact view
declaration yet. The storyboard assumes:

- A focused list row is the target of `+` `-` `f` `x` `Enter`
- Tab lands on Add, each row, then chrome
- Overlay takes focus while present; Tab stays inside it
- The same key table is valid on web. React Native shows the hints when
  a keyboard is present and still accepts them. Touch does not require
  them.

| Key | Message |
| --- | --- |
| `a` | `ClickedAddCounter({ counterId, via: Key(...) })` |
| `+` / `=` | `GotChild({ id, message: Increment, via: Key(...) })` |
| `-` | `GotChild({ id, message: Decrement, via: Key(...) })` |
| `Enter` | `SelectedCounter` on a focused row, or confirm in a dialog |
| `f` | `ClickedShowCounterFact` |
| `x` | `ClickedDeleteCounter` |
| `r` | `GotChild({ id, message: Reset })` on detail |
| `Esc` | `RequestedBack` (dismiss overlay, else pop detail) |
| `Cmd-K` / `Ctrl-K` / `:` | open ActionMenu → `?actions=1` |
| `Tab` / arrows | move focus (not a product Message until we land Focus) |

---

## Debug / replay plan

Looked: Multiple Counters has `useReplay` on the React and OpenTUI
**hosts**. It is not `Program.compose` on the core the way action menu
is on `examples/counter`. Single Counter owns `compose.actionMenu` in
core. ADR 0011 Q124 (devtools as a host-neutral Program) is still open.

Plan:

1. Port debug / replay utilities into the view-agnostic core paradigm
   (compose wrapper, screen tree, Messages, URI).
2. Enable debug mode separately from normal mode.
3. Then the same replay UI exists on React, CLI snapshot, and TUI
   when debug is on.

Until that lands, this storyboard is normal mode.

---

## Flow

```
ClickedAddCounter(c4)
  /counters  -->  /counters

GotChild(c1, Increment | Decrement)   any via, overlay may stay
  /counters                 -->  /counters
  /counters?delete=c1       -->  /counters?delete=c1    (c1 count changes)
  /counters?actions=1       -->  /counters?actions=1

SelectedCounter(c1)
  /counters  -->  /counters/c1                         (Push)

RequestedBack | DismissedCounterDetail(c1)
  /counters/c1  -->  /counters                         (Pop)

ClickedShowCounterFact(c1)
  /counters     -->  /counters?fact=c1                 (Present, abort on dismiss)
  /counters/c1  -->  /counters/c1?fact=c1

ClickedDeleteCounter(c1)
  /counters     -->  /counters?delete=c1               (Present)
  /counters/c1  -->  /counters/c1?delete=c1

CancelledDeleteCounter | RequestedBack
  /counters?delete=c1      -->  /counters              (Dismiss)
  /counters/c1?delete=c1   -->  /counters/c1

ConfirmedDeleteCounter(c1)
  /counters?delete=c1      -->  /counters              (Dismiss)
  /counters/c1?delete=c1   -->  /counters              (Replace)

ActionMenuCommandTriggered
  /counters     -->  /counters?actions=1
  /counters/c1  -->  /counters/c1?actions=1

ActionMenuDismissed | RequestedBack
  /counters?actions=1  -->  /counters
```

---

## S0 | empty list

uri: `/counters`

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
a add   Esc unused   Cmd-K / :  ?actions=1
```

CLI `show` snapshots the same tree as the TUI. Share one renderer (JSX
exploration already exists).

---

## S1 | populated list

uri: `/counters`

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
Enter     SelectedCounter(c1)          via Button|Key     -> /counters/c1
− / +     GotChild Increment|Decrement via Button|Key
🗑 / x    ClickedDeleteCounter(c1)     via Button|Key     -> /counters?delete=c1
f         ClickedShowCounterFact(c1)   via Key            -> /counters?fact=c1
a / +     ClickedAddCounter            via Button|Key
```

Web paints the same `− + x` / Esc hints as TUI. React Native paints the
buttons always and the key hints when a keyboard is attached.

---

## S1a | increment on the list

uri: `/counters`
`GotChild({ id: c1, message: Increment, via })`
c1 becomes 4. Every Client on the account paints 4.

---

## S2 | detail

uri: `/counters/c1`
Push from list. `RequestedBack` pops to `/counters`.

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
│ Esc back            │    │ Esc back            │    │ Esc back            │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

---

## S3 | fact from the list (Loading)

uri: `/counters?fact=c1`
Present. Dismiss / Esc aborts `FetchCounterFact`.

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
│  │ … loading     │  │    │  │ … loading     │  │    │ │                 │ │
│  │ Esc dismiss   │  │    │  │ Esc dismiss   │  │    │ │ Esc dismiss     │ │
│  └───────────────┘  │    │  └───────────────┘  │    │ └─────────────────┘ │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

---

## S4 | fact loaded (from list)

uri: `/counters?fact=c1`
`SucceededLoadCounterFact({ counterId: c1, fact })`

```
React / CLI snapshot / TUI

┌ Fact about 3 ────────────────────────────┐
│ 3 is the only number that is equal to    │
│ the sum of all numbers less than it      │
│ that are divisible by 2 or 3.            │
│                                          │
│         [ Dismiss ]   Esc dismiss        │
└──────────────────────────────────────────┘
```

---

## S5 | fact failed (from list)

uri: `/counters?fact=c1`
`FailedLoadCounterFact({ counterId: c1, cause })`

```
┌ Fact about 3 ────────────────────────────┐
│ Could not load fact.                     │
│                                          │
│         [ Dismiss ]   Esc dismiss        │
└──────────────────────────────────────────┘
```

---

## S4d | fact from detail

uri: `/counters/c1?fact=c1`
Same sheet over S2. Esc / Dismiss → `/counters/c1`.

---

## S6 | delete from the list

uri: `/counters?delete=c1`

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
│  │ Cannot undo.  │  │    │  │ Cannot undo.  │  │    │ │                 │ │
│  │ [c Cancel]    │  │    │  │ [c Cancel]    │  │    │ │ [c] cancel      │ │
│  │ [x Delete]    │  │    │  │ [x Delete]    │  │    │ │>[x] delete      │ │
│  │ Esc cancel    │  │    │  │ Esc cancel    │  │    │ │ Esc cancel      │ │
│  └───────────────┘  │    │  └───────────────┘  │    │ └─────────────────┘ │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

`c` / Esc / Cancel → `/counters`. `x` / Enter on Delete → `/counters`,
c1 gone.

Increment, decrement, add, and action-menu picks still run if they
arrive while this dialog is up. Example:

```
$ counters send increment --id c1
via: Cli({ argv: 'send increment --id c1', uri: '/counters?delete=c1' })
uri stays /counters?delete=c1
c1 is now 4 under the same dialog
```

Unknown counter:

```
$ counters send delete --id c9
-> /not-found?lookedFor=%2Fcounters%2Fc9
Counter c9 does not exist.
Looked for /counters/c9.
```

---

## S7 | delete from detail

uri: `/counters/c1?delete=c1`

Same dialog over S2, same `c` `x` Esc on every keyboard surface.
Cancel → `/counters/c1`. Confirm → `/counters` (Replace).

---

## S8 | after confirmed delete

uri: `/counters`
rows c2, c3.

---

## S9 | after cancelled delete from the list

uri: `/counters`

---

## S-AM | action menu over the list

uri: `/counters?actions=1`
`ActionMenuCommandTriggered` (Cmd-K / Ctrl-K / `:`)

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
│  │  Decrement c1 │  │    │  │  Decrement c1 │  │    │ │  Decrement c1   │ │
│  │  Fact c1      │  │    │  │  Fact c1      │  │    │ │  Fact c1        │ │
│  │  Delete c1    │  │    │  │  Delete c1    │  │    │ │  Delete c1      │ │
│  │  Open c1      │  │    │  │  Open c1      │  │    │ │  Open c1        │ │
│  │ Esc close     │  │    │  │ Esc close     │  │    │ │ Esc close       │ │
│  └───────────────┘  │    │  └───────────────┘  │    │ └─────────────────┘ │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

Enter sends the highlighted action with `via: ActionMenu`. Esc →
`/counters`.

---

## S-NF | not found

uri: `/not-found?lookedFor=%2Fcounters%2Fc9`

```
React                      CLI snapshot                 TUI
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Not found           │    │ Not found           │    │ Not found           │
│                     │    │                     │    │                     │
│ Counter c9 does not │    │ Counter c9 does not │    │ Counter c9 does not │
│ exist.              │    │ exist.              │    │ exist.              │
│                     │    │                     │    │                     │
│ Looked for          │    │ Looked for          │    │ Looked for          │
│ /counters/c9        │    │ /counters/c9        │    │ /counters/c9        │
│                     │    │                     │    │                     │
│ [ Back to counters ]│    │ [ Back to counters ]│    │> Esc  /counters     │
│ Esc back            │    │ Esc back            │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

Core builder, counters-specific fill-in for the missing Counter id.

---

## Sync | increment

```
t0  React /counters          c1=3
    TUI   /counters/c1       c1=3
    CLI   /counters          c1=3

t1  React: GotChild({ id: c1, message: Increment, via: Button(...) })

t2  all three paint c1=4. URIs unchanged.
```

---

## Sync | list trash

```
t0  both on /counters
t1  React: ClickedDeleteCounter({ counterId: c1, via: Button(...) })
t2  both paint /counters?delete=c1
t3  React: ConfirmedDeleteCounter({ counterId: c1, via: Button(...) })
t4  both paint /counters, c1 absent
```

---

## Completeness

### Last row deleted

Confirm on the only remaining counter → S0 at `/counters`.

### Stale fact Command

Dismiss / Esc aborts `FetchCounterFact`. A late success does not reopen
the sheet.

### Deep-link fact

`/counters?fact=c1` loads against the current count.

### Debug mode

After the port: a debug flag composes replay onto the same Program.
Normal mode URIs above stay free of tape.
