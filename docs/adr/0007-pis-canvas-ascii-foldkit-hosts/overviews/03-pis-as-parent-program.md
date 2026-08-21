# Overview 03 — PIS canvas as a Foldkit Program that mounts child Programs?

Exploration only (2026-08-07). Not decided.

## Sketch

```text
┌─ PisShellProgram (parent Foldkit Program) ──────────────────────────────┐
│  Model:                                                                 │
│    visibleDomains, devices, canvas{x,y,scale}, panels[], selectedUri    │
│    slots: IdentifiedArray<SlotId, ChildSlot>                            │
│                                                                         │
│  ChildSlot:                                                             │
│    id, domainId, uri label                                              │
│    child: opaque handle? OR embedded child Model? OR runtime id?        │
│                                                                         │
│  Messages:                                                              │
│    CanvasPanned, DomainToggled, DeviceToggled, SlotFocused              │
│    ChildMessage({ slotId, message: opaque })  ← ⚠️ typing hole           │
│                                                                         │
│  ┌ slot counter ──┐  ┌ slot counters ──┐  ┌ slot tea (sketch) ──┐      │
│  │ CounterProgram │  │ CountersProgram │  │ no Program / stub   │      │
│  │ count=5        │  │ list…           │  │                     │      │
│  └────────────────┘  └─────────────────┘  └─────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

Parent `update` owns **map chrome**. Each slot owns **territory** (its Program).

## Three mounting styles

### 1. True nested Programs (one big Model tree)

```text
PisModel {
  chrome: { … },
  counter: CounterModel,      // inlined
  counters: CountersModel,
}
Message =
  | ChromeMsg(…)
  | CounterMsg(Counter.Message)
  | CountersMsg(Counters.Message)
```

**Looks like TCA parent+child.** Works when every child is known at compile time and Message is a closed sum.

**Breaks when:** PIS is a **catalog** of many examples (calculator, tea sketch, future apps) — parent Message union becomes a god enum; loading a new example requires recompiling the shell.

### 2. Parent chrome Program + external runtimes (host slots)

```text
PisShellProgram          // only chrome Model/Messages
        │
        │ observes / routes pointer
        ▼
Runtime registry (not inside Model)
  slot-1 → Counter runtime
  slot-2 → Counters runtime
```

Parent Model stores **slot ids + layout**, not child Models.  
Observer (Obs-A) attaches to each runtime.  
ASCII view calls `childRuntime.getModel()` at render time.

**This is “PIS hosts Foldkit instances”** — shell may still be a small Foldkit Program for chrome only.

### 3. Multi-runtime window manager (not one Program)

```text
OS / browser windows
  window A: Counter app
  window B: Counters app
  window C: PIS map (deep links only)
```

No mounting. PIS is pure map. Weakest coordination; strongest isolation.

## What “works”

| Goal                               | Nested Programs (1)           | Chrome Program + slots (2)         | Separate windows (3) |
| ---------------------------------- | ----------------------------- | ---------------------------------- | -------------------- |
| Real child update/replay per slot  | Yes if child in tree          | Yes — each runtime full Program    | Yes per window       |
| Dynamic catalog of examples        | Painful                       | Natural                            | Natural              |
| One tape for whole canvas          | Yes (huge/mixed)              | Chrome tape + child tapes          | Separate tapes       |
| Type-safe child Messages in parent | Yes if closed sum             | Need existential / per-slot client | N/A                  |
| Observer HUD                       | Parent sees children in Model | Explicit subscribe                 | Cross-window hard    |
| ⌘-click open real host             | Awkward (already inside)      | Natural                            | Natural              |

## Why “full PIS as one Program mounting all children” usually fails

1. **Open world of examples** — PIS is a lab bench, not one product with fixed features.
2. **Existential Message problem** — `ChildMessage({ slotId, message: unknown })` loses type safety unless you only support a fixed set of programs.
3. **Replay semantics** — one tape mixing pan/zoom with counter increments is rarely what you want; you want **per-product tapes** plus optional chrome tape.
4. **Sketch domains** (hand DomainAsTree tea) are not Programs — slots must allow non-Program placeholders.
5. **Performance** — inlining every example Model in one parent store fights “only visible domains.”

## What _does_ work (recommended direction if we want Foldkit-shaped chrome)

```text
┌─ optional: PisChromeProgram ─────────────────────┐
│  Model: canvas, devices, visibleDomains, panels  │
│  Messages: pan, toggle domain, focus slot, …     │
│  NO product counts, NO label fields of apps      │
└──────────────────────┬───────────────────────────┘
                       │ layout + which slots exist
                       ▼
              Host slot registry
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Counter RT   Counters RT   (sketch ASCII only)
          │            │
          └──── observer ──► HUD / map highlight
```

So: **not** “one Program that is the whole canvas and all apps.”  
**Yes** “chrome can be a small Foldkit Program; each app is its own Program runtime in a slot.”

That’s compatible with Obs-A and with ⌘-click opening the same Program in a full host.

## Brief verdict

| Idea                                                    | Verdict                                                 |
| ------------------------------------------------------- | ------------------------------------------------------- |
| Entire PIS + all products as one nested Program         | **Usually no** — catalog + typing + tapes fight you     |
| PIS chrome as Foldkit Program + child runtimes in slots | **Worth doing** — clean boundary                        |
| No Foldkit for chrome (React/zustand map only)          | **Also fine** for v1; chrome Program is optional polish |

User later chose to **try god-Program (A)** in `examples/pis-canvas-lab/core` with Counter + Multiple Counters. Message merge = wrappers, not flat tag soup. See package README and update tests.
