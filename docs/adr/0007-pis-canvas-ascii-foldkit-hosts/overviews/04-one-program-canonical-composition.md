# Overview 04 — One Program: chrome hosts exemplary children

**Status:** Locked by ADR 0007 Q5 / Q5b (2026-08-11).  
**Intent:** Everything is one Foldkit Program. Exemplary Programs run **inside** chrome. Composition is canonical parent/child, not dual stores.

## Picture

```text
┌─ PisShellProgram  (ONE Program · ONE Model · ONE tape) ─────────────────┐
│                                                                           │
│  Model                                                                    │
│  ├── chrome                                                               │
│  │     canvas { x, y, scale }                                             │
│  │     focusSlot                                                          │
│  │     visible demos / panels                                             │
│  │     HUD flags (optional)                                               │
│  ├── single:   Counter.Model      ← exemplary child                       │
│  ├── multi:    Counters.Model     ← exemplary child                       │
│  └── …future:  Calculator.Model   ← same pattern                          │
│                                                                           │
│  Message (closed sum at parent)                                           │
│  ├── chrome only: CanvasChanged | FocusedSlotChanged | …                  │
│  ├── GotSingleCounterMessage({ message: Counter.Message })                │
│  ├── GotMultiCountersMessage({ message: Counters.Message })               │
│  └── GotFutureDemoMessage({ message: … })                                 │
│                                                                           │
│  update                                                                   │
│  ├── chrome msg  → evo chrome only                                        │
│  └── GotX msg    → Child.update(model.x, msg)                             │
│                      + Command.mapMessages → GotX again                   │
│                                                                           │
│  tape: Chrome… · GotMulti(inc) · GotMulti(open) · Focus… · GotSingle…     │
└───────────────────────────────────────────────────────────────────────────┘
         │
         │  Model snapshot (paint) · tape (HUD) · enqueue only from views
         ▼
┌─ Chrome views (React / ASCII / later TUI) ────────────────────────────────┐
│  Map: pan/zoom/focus ring                                                 │
│  Phones: atomic tree from child Model slices                              │
│  Hotspots → parent.enqueue(GotMulti… / chrome msgs)                       │
│  No second product store                                                  │
└───────────────────────────────────────────────────────────────────────────┘
```

## Canonical composition (do this)

```text
Child module (portable):
  Counter.Model · Counter.Message · Counter.update · Counter.init

Parent:
  model.single: Counter.Model
  GotSingleCounterMessage({ message })

  GotSingleCounterMessage: ({ message }) => {
    const [next, cmds] = Counter.update(model.single, message)
    return [
      evo(model, { single: () => next }),
      Command.mapMessages(cmds, m => GotSingleCounterMessage({ message: m })),
    ]
  }
```

Same pattern as:

- `examples/personal-blog` / `examples/auth` (`Got*` wrappers)
- `examples/counters` (parent + `GotCounterMessage` per row)
- `examples/pis-canvas-lab/core` (chrome + single + multi)

## Map chrome inside the same Program

```text
                    ┌──────────────── chrome Model ────────────────┐
                    │  layout · focus · which phones · pan/zoom    │
                    └──────────────────────┬───────────────────────┘
                                           │
     ┌─────────────────────────────────────┼─────────────────────────────┐
     │                                     ▼                             │
     │  ┌─ phone: multi list ──┐   ┌─ phone: multi detail ──┐            │
     │  │ from model.multi     │   │ from model.multi       │            │
     │  │ + chrome focus ring  │   │ + chrome focus ring    │            │
     │  └──────────────────────┘   └────────────────────────┘            │
     │  ┌─ phone: single ──────┐                                         │
     │  │ from model.single    │   all inside one canvas                 │
     │  └──────────────────────┘                                         │
     └───────────────────────────────────────────────────────────────────┘
```

Exemplars are **not** separate browser apps for the lab story. They are **nodes on the map** driven by nested Models.

## Observation posture (Obs-A inside one Program)

```text
Views / HUD  ──read──►  parent Model + parent tape
Views        ──write──► enqueue parent Message only
update       ──only──►  parent update (delegates to children)
```

No second copy of counts. No external runtime registry as the primary design.

## Catalog (Q6 locked: P1 + P0)

```text
New monorepo demo package
  → one-line register in ProgramCatalog
  → shell rebuilds typed Model slice + Got* + foldChild
  → recompile shell (closed world — intentional)
```

Do not flatten Messages. Do not use multi-runtime as the default catalog path.
Hand field + Match arm without a registry is the interim lab shape until P1 lands.

## Rejected for this shell

```text
✗ Primary multi-runtime slot registry (style 2)
✗ Primary multi-window demos (style 3)
✗ Flat parent Message = every child tag mixed
✗ Chrome-owned product state parallel to child Model
✗ Hand liveAscii product tables as source of truth
```

## Surfaces (ADR 0008)

Same nested Models feed atomic trees → Dom / Ascii / Tui. Programs stay free of JSX.
