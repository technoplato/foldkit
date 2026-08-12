# Findings — ADR 0008

## Problem

PIS / lab canvas paints phones with **hand-built strings** and **hand-counted hotspots**
(`liveAscii.ts`, static registry frames). DOM counters use a **different** React tree
(`view.tsx`). OpenTUI is a **third** tree. Product UI is defined three times.

## User direction (2026-08-07)

- Dual-target (or multi-surface) presentation: React and terminal/ASCII  
- **Atomic design** end-to-end: atoms → molecules → organisms → templates → screens  
- Keep primitives **simple**: vertical stack, horizontal stack, text, text input, standard controls  
- “Adams” = **atoms**  

## Prior art

| Path | Role |
| --- | --- |
| `examples/pis-canvas-lab/react/src/liveAscii.ts` | Hand Model→frame (replace first) |
| `examples/pis-canvas-lab/react/src/LiveAsciiPhone.tsx` | Paint `lines` + hotspot overlay |
| `examples/counters/react/src/view.tsx` | DOM product UI |
| `examples/counters/opentui/` | React reconciler + Yoga → tty |
| ADR 0001 | View-agnostic Program |
| ADR 0007 | PIS hosts Foldkit; god-Program exploration |

## Delete when surfaces land

- Hand hotspot `row`/`col` tables in product code  
- Duplicate empty-detail string sketches once `DetailPlaceholder` is a component  
- Parallel static multi-counter frames in brainstorming domain packs (later)

## Non-goals (draft)

- Putting JSX inside `counters-core` Program  
- Replacing OpenTUI InteractionGraph host on day one  
- Full CSS-in-ASCII or arbitrary HTML in the shared tree  

## Prototype landed (2026-08-07)

| Path | Role |
| --- | --- |
| `examples/pis-canvas-lab/react/src/ascii-ui/` | Atoms + layout + paint + counters product tree |
| `FoldkitCanvas.tsx` | Canvas uses `renderAscii(tree)` not hand `liveAscii` |
| `pnpm cli:dump` | Non-captive stdout dump of list + detail frames |

Note: hyperscript (`VStack(...)`) not React JSX transform yet — same tree shape.