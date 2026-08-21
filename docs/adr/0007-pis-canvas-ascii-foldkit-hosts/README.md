# ADR 0007 — PIS canvas hosts Foldkit; ASCII as derived interactive view

| Field            | Value                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| **Status**       | In interview                                                                                               |
| **Date**         | 2026-08-07                                                                                                 |
| **Repos**        | foldkit (primary), brainstorming/PIS explorer (consumer map chrome)                                        |
| **Related**      | ADR 0001 view-agnostic runtime, ADR 0002 replay, ADR 0003 navigation-as-state, ADR 0006 message provenance |
| **Parent issue** | TBD (Instant) after interview locks                                                                        |

## One-line intent

**One Foldkit Program** owns map chrome **and** nested exemplary product Models. Demos run **inside** chrome on the map. Composition is canonical: `Got*` wrappers, delegate `update`, `Command.mapMessages`, one tape. **ASCII (and other surfaces) are pure views** of Model + interactions + device/target — not hand-authored product screens.

## Non-goals (draft)

- Renaming PIS to “latrine”
- Expanding handcrafted DomainAsTree ASCII trees for real Foldkit products
- Full Instant tape snapshot deep links in the first slice (design only until Q&A locks)

## Files

- `findings.md` — inventory and prior art
- `qanda.md` — decisions
- `overviews/` — ASCII architecture (see `04-one-program-canonical-composition.md`)
- `plan.md` — after decisions locked
