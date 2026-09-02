# Smells — ADR 0011

What we saw. What to do instead. Not a decision until the matching Q lands.

## Law (2026-08-26)

**Higher-order composable functionality belongs in the Foldkit core library.**
Examples compose it. They do not own the combinator, the key map, or a second
menu Program.

**No shortcuts.** Build the optimal abstraction. "This week" is not a reason
to pick a worse design. Hard work is allowed. No exceptions. See `AGENTS.md`
in this folder. Do not wipe the repo `AGENTS.md`.

## Already corrected (this interview)

| Smell                                                            | Instead                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Multiple Counters as this week’s gospel                          | `examples/counter` (Q00, Q60)                                |
| `hidden` / `hiddenBecause` / `TapHandle.Hidden` as product words | valid / enabled / supported in this Model (Q87)              |
| Bare `from` (`cli`, `counter-swift-ios`)                         | host + per-run instance (Q107)                               |
| Instant `localId` as `from`                                      | device id, shared across tabs, not Processor (Q107)          |
| Clock (`createdAtMs` / `snapshot.at`) as the boot bookmark       | Message ids already in the cache (Q108 E, still asking)      |
| Fold the whole log on every launch                               | debug / harness only (Q108 D rejected)                       |
| Catalog field `combines`                                         | fold the log in order (Q88 B)                                |
| Instant `ReadyWindow.selectedId` + host `useState` URI           | one Program Model (Q02)                                      |
| LLM abstracts ahead of the next real destination                 | Q102 (no unused types). Not a license to refuse a Focus ADT. |
| “This week” as a reason to pick a worse ADT                      | Optimal abstraction. See this folder’s `AGENTS.md`.          |

## Open (record, then fix in plan)

| Smell                                                   | Instead                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `examples/counter/core/src/actionMenuKeys.ts`           | Key routing lives on `Program.compose.actionMenu` in `packages/foldkit`. Counter only supplies the catalog. |
| Open menu Model is only `{ focus, maybeQuery }`         | Focus ADT + query + highlighted row (Q110 C)                                                                |
| `ActionMenuFocusMoved` is only Up / Down                | Also j / k, J / K, Cmd-Up / Cmd-Down (Q91 D)                                                                |
| Swift / Rust hosts do not use the same menu             | Audit. Same core combinator. No second menu.                                                                |
| Instant message log grows forever                       | Archive to a flat file, then delete old rows (Q109)                                                         |
| `AgentRequestedIncrement` / one Increment per trigger   | One Increment fact. How it arrived is `via` (Q115)                                                          |
| Stamp `via: Remote`                                     | Remote is `from` / ingress. Keep the sender’s Button / Menu / Agent                                         |
| Host `clickedIncrement` → `enqueueMessage(Increment())` | Adapter `incrementButtonTapped` + `IncrementButton` (Q118)                                                  |
| Handwritten `factHandles.ts` in Counter and Puzzle      | Derive `${token}ButtonTapped` in `packages/foldkit` from `actions` (Q118)                                   |
| Gospel `fillWriteTime` sets `asOf: processor`           | `asOf` is a Message id. Proof is `included` (Q108 E)                                                        |
