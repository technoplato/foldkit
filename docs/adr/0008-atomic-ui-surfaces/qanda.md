# Q&A — ADR 0008

Status: `open` | `asking` | `decided` | `deferred`

---

## Q0 — Accept Overview 01 (atomic best-shot)?

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-11
- **Question:** Accept `overviews/01-atomic-best-shot.md` as the architecture baseline: atomic layers (atoms→screens), primitives VStack/HStack/Text/TextInput/Button, three surfaces (Dom / Ascii / Tui), Program free of JSX, replace `liveAscii` first?
- **Recommended:** **Accept as-is.**
- **Answer:** **Accept as-is.** User: "q0 approve".
  - Baseline: host-neutral atomic tree → DomSurface / AsciiSurface / TuiSurface.
  - Atoms → molecules → organisms → templates → screens as in Overview 01.
  - Primitives: VStack, HStack, Text, TextInput, Button (host-neutral props only).
  - Programs stay free of JSX.
  - First delete target: hand `liveAscii.ts` product tables once AsciiSurface parity works.
  - Lab `ascii-ui/` is the prototype of this path. Treat it as architecture, not a side experiment.
  - Out of first cut stays as Overview 01: no full CSS parity, no animations, no deep ASCII scroll.
