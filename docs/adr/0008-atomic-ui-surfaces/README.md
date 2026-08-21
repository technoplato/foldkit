# ADR 0008 — Host-neutral atomic UI (JSX → DOM / ASCII / TUI)

| Field            | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| **Status**       | In interview (Q0 locked 2026-08-11: Overview 01 accepted) |
| **Date**         | 2026-08-07                                                |
| **Repos**        | foldkit (presentation Clients); related: ADR 0001, 0007   |
| **Parent issue** | TBD Instant after decisions lock                          |

## One-line intent

**One product presentation tree** built from **atomic design** primitives (`VStack`, `HStack`, `Text`, `TextInput`, `Button`, …). Surfaces paint that tree to **DOM**, **ASCII** (`lines[]` + `hotspots[]`), or **terminal (OpenTUI)**. Foldkit **Programs stay free of JSX**. Delete hand `liveAscii` hotspot arithmetic once the surface works.

## Related

- ADR 0007 — PIS canvas hosts Foldkit; live Model on the map
- DomainAsTree / PIS skill — mode trees as ADTs; marketing is nothing
- Prior art: `examples/counters/opentui`, `pis-canvas-lab/.../liveAscii.ts` (to replace)

## Files

- `findings.md`
- `qanda.md`
- `overviews/01-atomic-best-shot.md` — recommended architecture (this interview’s baseline)
