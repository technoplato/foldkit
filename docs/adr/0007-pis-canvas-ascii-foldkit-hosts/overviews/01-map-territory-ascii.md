# Overview 01 — Map, territory, ASCII view (amended 2026-08-07)

## Framing (accepted with amendments)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  PIS CANVAS — map + chrome                                              │
│  · infinite layout of domain nodes                                      │
│  · host slots (one live Foldkit Program runtime per slot)               │
│  · observer plugin (sees Messages + Model changes; does not own update) │
│  · multi-device chrome around the ASCII view                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ hosts
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FOLDKIT PROGRAM — territory                                            │
│  Model (immutable) · Message union · update · Commands · interactions   │
│  Source of truth. Never duplicated as hand-drawn product screens.       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                │  renderAscii(opts)   // ONE options object
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ASCII ADAPTER — pure view                                              │
│  out: { lines, hotspots, keyMap, legend, a11y }                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Handcrafted DomainAsTree frames = **sketches only**, not live product UI.

---

## Vocabulary (required precision)

### `model`
Current immutable Program state. Example counter: `{ count: 5 }`.

### `interactions`
What the Program says is valid **now** (buttons, rows, confirms) — projected from model, not invented by the view.

### `device` (form factor / chrome + layout recipe)
**What shell and density** the view is drawn for. Orthogonal to “can I click?”.

| device   | Meaning                                      |
| -------- | -------------------------------------------- |
| phone    | ~28-col phone chrome, touch-first density    |
| watch    | tiny face                                    |
| tablet   | wider phone-like                             |
| desktop  | wide panel                                   |
| tv       | large, sparse                                |
| terminal | fixed monospace panel, no phone bezel        |
| tui      | same family as terminal; app-as-TUI framing  |

Device changes **layout width, chrome, truncation** — not whether input is pointer vs print-only.

### `target` (interaction mode of this render)
**How the consumer will use the frame.** Not “web”.

| target              | Meaning |
| ------------------- | ------- |
| `interactive`       | Live host: pointer hotspots **and/or** keys dispatch real Messages |
| `noncaptive-print`  | Display-only dump for agents/humans: full `lines` + `legend` + `keyMap`; no assumption of a focused window |

User amendment: prefer **interactive device** language over “interactive web”.  
Web / TUI / Expo are **hosts** that choose `target: interactive` (and a `device`).  
A CI agent dumping the screen chooses `target: noncaptive-print`.

```text
// same model, different opts
renderAscii({ model, interactions, device: "phone",    target: "interactive" })
renderAscii({ model, interactions, device: "terminal", target: "interactive" })
renderAscii({ model, interactions, device: "terminal", target: "noncaptive-print" })
```

### Output fields

| Field      | Meaning |
| ---------- | ------- |
| `lines`    | Full screen as `string[]` (or one string with `\n`) — pure text |
| `hotspots` | Regions for pointer hosts: `{ id, row, col, width, height?, message \| action }` |
| `keyMap`   | Key → action/message for keyboard (shared idea across web + TUI) |
| `legend`   | Bottom help strip: `+ inc  − dec  r reset  / focus` (Grok-build style) |
| `a11y`     | Blind / no-arms (or equivalent) one-liners |

### Atomic design layers

| Layer        | Examples |
| ------------ | -------- |
| **atoms**    | glyph button `[ + ]`, label, keycap `r`, text field `_…_`, separator |
| **molecules**| toolbar row, list row, modal body, legend bar |
| **templates**| `counter-page`, `list-index`, `detail`, `confirm`, `cta-page` |

Templates compose atoms/molecules; **values and enabled actions come from model + interactions**.

---

## Concrete example — counter Model `{ count: 5 }`

### A. `device: phone`, `target: interactive`

```text
┌────────────────────────────┐
│  ·  ·  ·          9:41  ⚡ │
│         Counter            │
│            5               │
│      [ − ]     [ + ]       │  ← hotspots → clickedDecrement / clickedIncrement
│         [ Reset ]          │  ← hotspot  → clickedReset
│                            │
│  − dec   + inc   r reset   │  ← legend (keys also in keyMap)
└────────────────────────────┘
```

### B. `device: terminal`, `target: interactive` (TUI host)

```text
╭─ counter  count=5 ─────────────────╮
│                                    │
│              5                     │
│                                    │
│   [−] dec    [+] inc    [r] reset  │
│                                    │
│  −/+ / r  ·  also mouse if host    │
╰────────────────────────────────────╯
```

### C. `device: terminal`, `target: noncaptive-print` (agent)

Same `lines` as B, plus machine-readable:

```text
keyMap: { "-": "clickedDecrement", "+": "clickedIncrement", "r": "clickedReset" }
legend: "− dec  + inc  r reset"
hotspots: []   // or still present but unused by print consumer
```

Agent reads lines, chooses a key, host enqueues Message — **no second UI definition**.

---

## createActions (preview — full Q later)

**Manual (today, counter):**

```ts
createActions: enqueue => ({
  clickedIncrement: () => enqueue(ClickedIncrement()),
  clickedDecrement: () => enqueue(ClickedDecrement()),
  clickedReset: () => enqueue(ClickedReset()),
})
```

**Desired:** derive once from Message constructors / Program surface — **builder**, not hand-maintained twin of the Message union. Adding a Message must not require a second edit in `createActions` unless the Message needs a custom payload binder.
