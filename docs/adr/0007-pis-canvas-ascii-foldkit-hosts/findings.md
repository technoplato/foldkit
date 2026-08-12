# Findings — ADR 0007

## Problem statement (user, 2026-08-07)

1. Hardcoded phone/terminal frames in brainstorming `domain-as-tree-pis` for counter are the wrong direction.
2. UI must be **derived** from Foldkit domain (Model + Messages + projected interactions), like any UI framework.
3. **Atomic design**: atoms → molecules → page templates (list, detail, confirm, CTA page).
4. `renderAscii` takes **one options object**, not a long positional arg list: model, interactions, device archetype, target (interactive web vs non-captive CLI).
5. Two targets: **interactive** (pointer + keys) vs **non-captive display** (print screen + key legend so agents/humans can act).
6. Keyboard bindings should ideally be **program-level or adapter-level shared** so React/web can use the same shortcuts as TUI.
7. Messages with **inputs** (e.g. type a string, press +, add string length to count) need a clear model for where input lives and how it binds to the next Message.
8. PIS canvas **hosts** real Foldkit instances and needs a **higher-order observer plugin** for messages sent / model changes (not fake CLI theater).
9. `useActions` should expose a **type-safe action surface** — revisit and fix; counter example is closer to right than a raw untyped send.
10. First host: **counter**, then **counters**. Delete or ignore hardcoded counter frames for that path.

## Prior art (Foldkit tree)

| Path | Note |
| --- | --- |
| `examples/counter/react-bindings/src/counter.tsx` | `CounterActions` typed object; `createActions: enqueue => ({ clickedIncrement: () => enqueue(ClickedIncrement()) })`; `useCounterModel` / `useCounterActions` |
| `examples/counters/react-bindings` | Heavier; `sentMessage` / interaction graph projection — multi-counter list+detail+delete modes |
| ADR 0001 | View-agnostic runtime prototype |
| ADR 0002 | Universal program replay |
| ADR 0003 | Navigation as state |
| ADR 0006 | Semantic message invocation provenance |
| Brainstorming `ideas/domain-as-tree-pis` | PIS map chrome (canvas, devices, CLI); **not** product UI source for Foldkit examples |

## useActions status (snapshot)

**Counter (direction right, maintenance wrong):**

```ts
export type CounterActions = Readonly<{
  clickedDecrement: () => void
  clickedIncrement: () => void
  clickedReset: () => void
}>
// createActions: enqueueMessage => ({
//   clickedIncrement: () => enqueueMessage(ClickedIncrement()),
//   ...
// })
```

Hand-written `createActions` **duplicates** the Message surface. User requirement (2026-08-07): **derive** via a TypeScript builder/generic so adding a Message does not require a second parallel edit. Zero-arg Messages map 1:1; payload Messages need an explicit binder or draft/focus protocol (separate Q).

**Counters:** often `sentMessage` — too generic for named typed hosts; should converge on derived action maps + interaction graph.

**Gap for inputs:** zero-arg actions are easy. Payload actions need draft/focus protocol (Q3).

**Host bindings (user 2026-08-07):** React `useModel` / `useActions` (and future Svelte runes, etc.) should feel like **model + actions** only — no Foldkit-internal names leaking into consumer view code. Faithful to each UI kit’s idioms.

**createActions derivation (Q2 decided A):** builder from Message surface; no hand twin.

## Delete / ignore inventory

| Item | Action when plan executes |
| --- | --- |
| `brainstorming/.../domains/counter.ts` hand ASCII frames as product UI | Delete or mark `sketch-only`; live path ignores |
| Registry frames for counter as source of truth | Ignore for live Foldkit path |
| PIS `run('send …')` as app runtime for counter | Replace with real Program dispatch |

## Open technical challenges (for Q&A)

1. Where does ASCII adapter package live (`packages/…` vs example-only)?
2. Input binding model for Messages with payloads.
3. Observer plugin shape on PIS canvas (subscribe model + message tape).
4. Keybinding ownership: core Program vs host adapter.
5. Page templates enumeration vs free-form layout engine.
6. Deep-link snapshots (Instant signed tapes) — phase 2 vs in-scope.
