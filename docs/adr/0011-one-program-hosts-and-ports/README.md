# ADR 0011 — One Program owns navigation, logic, and sync; adapters paint

| Field            | Value                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | In interview                                                                                                                                                                      |
| **Date**         | 2026-08-26                                                                                                                                                                        |
| **Repos**        | foldkit (`ml/exploring-view-agnosticism` @ `077afe4a3`), tca-rust-port (`main` @ `1fd1bb3`), counter-swift (`f5cb1a6`), rust-navigation, TCA26 (private, do not push pointfreeco) |
| **Related**      | ADR 0003 navigation-as-state, ADR 0009 portable navigation adapters, ADR 0010 Program navigation seam (accepted in part)                                                          |
| **Parent issue** | TBD after interview locks. Instant leftovers **#240–#245 stay Open/Blocked** — do not close them from this ADR.                                                                   |

## One-line intent

**Gospel this week:** `examples/counter`. One Program owns business logic, the screen tree, a Message catalog, and navigation as a **sibling** slice (action menu today). **Adapters** paint and translate to a framework's own router. **Sync** is event sourcing: local `update` is immediate and offline; peer Messages fold through the same `update`; catch-up when a device was off is still open (Q86).

## How to read this interview

The question list lives in `qanda.md`. Chat asks **one question at a time**. New forks append at the end of that file. Evolving ideas that are not yet Qs live in `intentions.md` — that is the encapsulation home.

Walk order after 2026-08-26 dictation: decided spine (Q00, Q01, Q02, Q60) → **Q86 catch-up** → remaining open Qs. Multiple Counters Qs are deferred until Counter sync is robust.

## Landed checkouts (not up for re-landing this interview)

| Repo           | Remote / branch                                       | SHA                                  |
| -------------- | ----------------------------------------------------- | ------------------------------------ |
| Foldkit fork   | `technoplato/foldkit` `ml/exploring-view-agnosticism` | `077afe4a3`                          |
| Foldkit origin | `foldkit/foldkit`                                     | not writable from this work          |
| Rust port      | `technoplato/tca-rust-port` `main`                    | `1fd1bb3` (rewritten over `c3a0fa3`) |
| counter-swift  | `technoplato/counter-swift` public                    | `f5cb1a6`                            |
| TCA1 fork      | `technoplato/swift-composable-architecture`           | `63f3c7abf8`                         |
| TCA26          | `technoplato/TCA26` **private**                       | `b7890db`                            |

## Files

- `intentions.md` — evolving architecture (home for ideas)
- `findings.md` — what code actually does vs what was asked
- `qanda.md` — every currently known question
- `smells.md` — what we saw, what to do instead
- `AGENTS.md` — no shortcuts for this ADR. Does not replace the repo `AGENTS.md`.
- `overviews/01-one-program-hosts-and-ports.md` — ten-foot architecture
- `overviews/q108-proposer.md`, `q108-debater.md`, `q108-resolver.md` — Q108 quorum 2 (still `asking`)
- `plan.md` — after decisions lock (Phase B). Not this interview.

## Non-goals (until Q65/Q76 lock otherwise)

- Closing Instant leftovers #240 Puzzle, #241 Songbook, #242 Gate, #243 Casino, #244/#245
- Pushing to `pointfreeco/*`
- Force-checking hobby primaries (blackjack, merge-tiles, dir-counter) onto the Counter gospel path
- Dumping secrets, `.lavish/`, Instant admin tokens
- Implementing the remainder P0s before answers land in `qanda.md`
