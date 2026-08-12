# Q&A — ADR 0007

Status legend: `open` | `asking` | `decided` | `deferred`

---

## Q0 — Overview 01 (map / territory / ASCII)

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-07
- **Question:** Accept overview 01 framing?
- **Recommended:** Accept as-is.
- **Answer (amended accept):**
  - Accept PIS canvas = map + chrome + host slots + observer; Foldkit Program = territory (real Model/Messages); `renderAscii` from model + interactions + device + target.
  - **Define terms** in the overview (device, target, lines, hotspots, keyMap, legend, atoms, molecules, templates) with concrete ASCII examples — not jargon-only questions.
  - Rename mental model: **not** “interactive web” → **interactive** (device/host-agnostic). Hosts are web/TUI/Expo/etc.; target is interactive vs noncaptive-print.
  - Handcrafted DomainAsTree frames = sketches only, not live product UI.
  - Do not assume the next question is “where does the package live.”
  - **createActions must be derived/generic** (builder from Message/Program surface), not hand-maintained twice when adding actions.
- **Follow-up:** Overview 01 rewritten with vocabulary + counter examples; createActions derivation queued as its own Q.

---

## Q1 — `device` vs `target` and `renderAscii` options object

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-07
- **Question:** Lock the options object shape and the device/target split?
- **Recommended:** Accept the split and the options object as specified.
- **Answer:** **Accept.**
  - `renderAscii({ model, interactions, device, target })` → `{ lines, hotspots, keyMap, legend, a11y }`
  - `device` = form factor / chrome / density
  - `target` = `interactive` | `noncaptive-print` (not web)
  - Hosts (web React, TUI, Expo) choose both; not the target enum
  - hotspots for interactive + pointer hosts; keyMap `Record<string, ActionId>`; legend string

---

## Q2 — Derive `createActions` / typed action map (no double definition)

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-07
- **Question:** How do we derive the host action surface from the Message union?
- **Recommended:** Option A — zero-arg auto-map; payload binder once.
- **Answer:** **Accept A.** Reject B. C not needed (and not understood as valuable now).
  - One derivation: Message surface → actions builder → `useActions` / keyMap / legend share ActionIds.
  - Zero-arg: tag → `clickedIncrement()` → enqueue ctor.
  - Payload: declare fields once next to Message (e.g. `ClickedAddLength` needs `{ text: string }`) → `clickedAddLength(text: string)`.
  - **Host API hygiene:** React hook (and later Svelte runes / other view libs) should expose **model + actions** in that host’s idioms — Foldkit jargon must not leak into app-facing bindings.
  - “Why A would hurt”: only if payload binders become a huge parallel registry; keep binders co-located with Message so it stays one place. Not a reason to pick B/C now.
  - Open follow-up: binding drafts for payload fields (input not already in Model).

---

## Q3 — Where typed field state lives (user override)

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-07
- **Question:** Host-local draft (H1) vs Model field (M1) for text the user is typing?
- **Recommended (agent):** H1 host-local draft.
- **Answer:** **M1 — Model owns field state. User overrides H1.**
  - Agent had no stronger reason to force H1: M1 is simpler one mental model, matches “UI is a function of Model,” multiplayer/replay come free, bind API is clear.
  - Cost of M1 (keystroke Messages / larger tape) accepted for clarity.
  - **React (and hosts):** expose **bind helpers** (e.g. spread props onto `<input {...bind.textField()} />`) that read Model value and send `TextChanged`-style Messages — not a parallel host draft map.
  - Payload actions like `clickedAddLength` then read **from Model** (or take no arg and update uses `model.text`).
  - ASCII/TUI: focused field edits Model via same Messages; legend key focuses field id that maps to Model path.
  - Reframe: prior “draft not in model” was the wrong default question for this product.

---

## Q4 — Field bind API + Message shape for text-in-Model

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-07
- **Question:** How do Model fields show up on actions (React bind + ASCII focus same system)?
- **Recommended:** Bind-A.
- **Answer:** **Accept Bind-A** with amendments:
  - **Per-field change Messages** (strong types). Reject single generic `FieldChanged` as the default (weaker types).
  - **Focus is Model state** — e.g. `focusedField: "label" | null`; focusing is setting state (Message), not a host-only concern. Enables disabled/etc. as Model properties too.
  - **Abstract bind shape is host-agnostic** — describe as field projection: `{ value, setValue | change, focus, disabled?, … }` mapped by adapters. **Do not define the Foldkit contract in React/DOM terms** (`onChange`, etc.); React adapter spreads onto `<input>`, ASCII adapter drives keystrokes.
  - Naming: avoid example field name `text` (looks like a type). Prefer domain names e.g. `label`, `query`, `note`.
  - **Command actions zero-arg when they only need Model** — e.g. `clickedAddLength()` → update reads `model.label`.
  - **Call-site payloads still exist sometimes** — when data is not a bound Model field (e.g. list row id from a click). Separate from bind fields; do not force everything through bind. (Rules refined in later Q if needed.)
  - `actions.bind.label()` — `label` is the field name; returns bind projection for that field.

---

## Q5 — One Program: chrome hosts exemplary children + observation posture

- **Status:** `decided`
- **Asked:** 2026-08-07
- **Answered:** 2026-08-11
- **Question:** What must the map chrome see and emit so it stays honest without owning product `update`?
- **Recommended:** Obs-A (read-only Model + Message stream; no second product store).
- **Answer (user, 2026-08-11):** **One Program only.** Exemplary Programs run **inside chrome**. God Program is accepted. Composition must be **correct and canonical**.
  - **Lock style A** as the lab shell direction (not temporary).
  - **Chrome is Model** (canvas, focus, panels, which demos show).
  - **Each exemplar is a nested child Model** from a portable core module (`counter-core`, `counters-core`, …).
  - **Canonical composition (locked):**
    1. Parent Message wraps children: `GotXMessage({ message })` — not a flat union of every child tag.
    2. Parent `update` delegates to `Child.update`, then `Command.mapMessages` back into `GotXMessage`.
    3. Same pattern as `examples/auth`, `personal-blog`, `counters`, and `pis-canvas-lab/core`.
    4. One tape: chrome Messages and all `Got*` Messages share one history.
    5. Views observe parent Model + tape (Obs-A posture). No second product store. No chrome re-implementation of child `update`.
    6. Hotspots and host UI only **enqueue** parent Messages.
  - **Reject for this shell:** multi-runtime slots as primary; multi-window demos as primary; parallel product state on the map.
  - **Catalog pain** was open; **resolved by Q6** (P1 one-line monorepo register + P0 foldChild).
  - Overview: `overviews/04-one-program-canonical-composition.md`

---

## Q6 — Catalog openness: what “arbitrary Program” means for v1

- **Status:** `decided`
- **Asked:** 2026-08-11
- **Answered:** 2026-08-11
- **Question:** For the PIS catalog, what does embedding an arbitrary Foldkit Program mean?
- **Recommended:** **1 — P1 + P0** (monorepo one-line register + `Update.foldChild`).
- **Answer:** **Accept 1.** User: "Any package in this monorepo after a one-line register (P1 + P0)".
  - **P0:** Nested composition uses canonical `Update.foldChild` (and `Got*` wrappers). Align lab with foldkit `main` when the tree is clean enough to merge.
  - **P1:** Catalog is a **compile-time monorepo registry**. Add a demo with one register line (mapped types and/or small codegen). Shell stays **one Program**, **one tape**, **strong types**.
  - **Reject for v1 primary path:** P2 opaque `GotDemoMessage` as default; P3 multi-runtime catalog as default for showcase demos.
  - **P3/P4 later only** if a heavy app or DomainAsTree sketch cannot live as a nested child (not the default for counter-class exemplars).
  - **Not** downloadable plugins or untyped runtime loaders in v1.
  - Research: `overviews/05-catalog-composition-research.md`

---

## Q5b — Digression: PIS as parent Foldkit Program mounting children?

- **Status:** `decided` (promoted by Q5 on 2026-08-11)
- **Asked:** 2026-08-07
- **Answered:** 2026-08-07; **confirmed 2026-08-11**
- **Answer:** **Style A — god Program.** Chrome + inlined exemplary product Models. User wants one Program; demos shown **within** chrome; composition must be canonical.
- **Implementation (lab):** `examples/pis-canvas-lab/core` — `GotSingleCounterMessage` / `GotMultiCountersMessage` + `Command.mapMessages`; tests pass.
- **Message merge ergonomics:** NOT flat-union of every child tag. TCA-style **wrappers** + parent `Match` cases (same as personal-blog / auth).
- **2026-08-11:** User no longer treats A as a temporary digression. Exemplars run inside chrome under one Program.
