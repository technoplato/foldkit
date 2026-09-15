# Instant Sync | Counter Examples Exploration

Read-only audit on Mac, 2026-09-11. Covers `examples/counter`, `examples/counters`, `examples/instant-counter`, and `bench/`.

## Two Instant apps on this Mac

| App | UUID | Env file | Used by |
|-----|------|----------|---------|
| **FoldkitCounterV01** | `5417c2e3-c6b9-476d-a962-2e11c83492aa` | `~/.config/foldkit-instant-demo/counter-v01.env` | `examples/counter/*` submission |
| **foldkit-instant-demo** | `63750881-805d-46d9-89d4-c7ad0b1bb713` | `~/.config/foldkit-instant-demo/instant.env` | `examples/instant-counter`, `examples/counters` (via skill wrapper + `VITE_INSTANT_APP_ID`) |

Both files exist on this Mac. Keys present (redacted): `INSTANT_APP_ID`, `VITE_INSTANT_APP_ID`, `EXPO_PUBLIC_INSTANT_APP_ID`, `INSTANT_APP_ADMIN_TOKEN`, `INSTANT_CLI_AUTH_TOKEN`.

---

## 1. `examples/counter` (submission under test)

### Top-level directory map

```
examples/counter/
├── .look/              # Grok verify artifacts, paint screenshots
├── cli/                # counter CLI + daemon Processor
├── core/               # Counter Program, SyncedCounter, startLive*
├── expo/               # React Native Expo Client
├── foldkit/            # Foldkit HTML host (proof-style)
├── headless/           # Instant tail printer + stress
├── opentui/            # OpenTUI terminal host
├── react/              # React composite + ?window=screen
├── react-bindings/     # useModel / useScreen hooks
├── react-native/       # empty (node_modules only)
├── scripts/
│   └── with-counter-v01-env
├── svelte/
└── tui/
```

### Surface maps (one level)

**foldkit/** — `index.html`, `mobile.html`, `src/{entry,instantHost,view,mobile*}.ts`, `scripts/with-public-instant-env`, port **5215** dev.

**svelte/** — `src/{App,PaintScreen,processor,instantHost,main}.ts`, port **5218**.

**react/** — `src/{App,ScreenApp,main,instantHost}.tsx`; composite default, `?window=screen` for ScreenApp; port **5216**.

**expo/** — `src/{App,expoLive,instantHost,paintScreen}.tsx`, `ExpoLive` Layer; port **8089**.

**cli/** — `src/{host,session,daemon,entry,...}.ts`, `scripts/run.sh`; bin `counter`, `counter-screen`.

**headless/** — `instant.schema.ts`, `instant.perms.ts`, `src/{print,liveStress,stress,entry}.ts`.

**core/** — `src/{synced,wire,startLive*,instantEngine,app,program}.ts`.

**tui/** — `src/{client,entry,paintTui}.ts`.

**opentui/** — `src/{client,entry,paintOpenTui}.ts`.

**No `plain-html/` or `2e/` surface** in this tree. Plain HTML lives under `examples/counters/plain-html` only.

### Instant configuration

| Concern | Location |
|---------|----------|
| App id constant | `packages/instant/src/sync/fromTransport.ts` → `FoldkitCounterV01.id` |
| Env injection | `examples/counter/scripts/with-counter-v01-env` → loads `counter-v01.env` |
| Public scrub | Each surface `scripts/with-public-instant-env` → `unset INSTANT_CLI_AUTH_TOKEN` |
| Schema | `InstantSnapshotLogSchema`: entities `count` (value, asOf, at) + `message` (tag, from, createdAtMs) |
| Permissions | Open read/create/update on count + message (`headless/instant.perms.ts` re-exports) |
| Count row id | `c0a7c001-0000-4000-8000-000000000001` |

### Wiring chain (count sync)

1. `SyncedCounter = Program.compose.sync({ of: App, snapshot: CountProjection, message: MessageWire })`
2. `startLiveCounter(BrowserLive|NodeLive|ExpoLive)` → `InstantEngine` Layer → `Instant({ app: FoldkitCounterV01, processor, instance? })`
3. `@foldkit/instant` `fromTransport` reads/writes snapshot + message log via InstantDB
4. `Runtime.start` subscribes; applies `RemoteMessageReceived` for rows where `from !== engine.processor`; skips own echo rows

### Cross-surface sync (designed behavior)

All surfaces on **live Instant** (not `COUNTER_TAPE=memory`) share one count on app `5417c2e3…`. Each Processor gets distinct `from` via `Processor.Host.print()` + optional `instance` UUID suffix (8 chars) so two tabs on same host do not drop each other's rows.

**Mac live probe (2026-09-11):** After `pnpm build` in cli, `with-counter-v01-env COUNTER_TAPE=instant node dist/entry.js show` reported `count 3`; `do increment` → `count 4`, `link delivered`. Persistence across daemon restarts confirmed on second `show`.

**Not verified live this session:** foldkit ↔ react ↔ svelte browser cross-tab (would need dev servers + two browsers). Architecture and `bench` `globalSync` assert on `counter.knophy.com` are the evidence for web cross-context.

### Probe / start commands

| Command | Purpose |
|---------|---------|
| `pnpm --dir examples/counter/cli count` | show (Instant via daemon) |
| `pnpm --dir examples/counter/cli increment` | do increment |
| `pnpm --dir examples/counter/cli counter:instant` | open CLI with Instant tape |
| `pnpm --dir examples/counter/foldkit dev` | Foldkit host :5215 |
| `pnpm --dir examples/counter/react dev` | React :5216 (`?window=screen` for screen) |
| `pnpm --dir examples/counter/svelte dev` | Svelte :5218 |
| `pnpm --dir examples/counter/expo start` | Expo :8089 |
| `pnpm --filter counter-tui-example counter-tui:instant` | TUI Instant |
| `pnpm --filter counter-opentui-example counter-opentui:instant` | OpenTUI Instant |
| `pnpm --filter counter-headless-example counter-headless:instant` | tail Instant log |
| `pnpm --filter counter-headless-example counter-headless:live-stress` | multi-host live stress |

Isolation toggles: `COUNTER_TAPE=memory`, `COUNTER_TAPE_PATH=/path/to/file.json`.

CLI note: `pnpm count` failed before `pnpm build` (`CLI daemon did not start`); works after build.

### Surfaces on 2026-08-21 (commit `66b065cb4`)

```
cli, core, expo, foldkit, headless, opentui, react-bindings, react, scripts, svelte, tui
```

Maps to user list:

| User name | Present Aug 21 | Instant wired |
|-----------|----------------|---------------|
| FoldKit (foldkit/) | yes | yes |
| 2e / plain-html | **no** (counters only, no Instant there) | n/a |
| Svelte | yes | yes |
| React screen | yes (`ScreenApp`, `?window=screen`) | yes |
| React composite | yes (`App`, default) | yes |
| Expo | yes | yes |
| CLI | yes | yes (daemon) |
| TUI | yes | yes (script) |
| OpenTUI | yes | yes (script) |
| Headless | yes | yes (tail, not painted UI) |

### Gaps (counter submission)

- `react-native/` is not a Client (empty dir).
- No plain-html surface.
- `COUNTER_TAPE=memory` / missing env → isolated Memory, no cross-surface sync.
- Browser boot uses fail-closed `readyCounter(0)` after 8s if Instant never returns snapshot (`startSynced.ts`).
- CLI Instant requires built `dist/` + daemon; unbuilt tree fails opaque.
- `observeRemoteSnapshotLog` is library-only; counter relies on `Runtime.start` subscribe path, not a separate host hook.

---

## 2. `examples/counters` (view-agnosticism)

Separate **Multiple Counters** Program with navigation. Instant via `counters-instant-host` + **Program tape** (`InstantProgramSchema`), not snapshot-log.

### Instant surfaces (when `VITE_INSTANT_APP_ID` set via demo skill)

foldkit root, react (+ router demos), svelte, solid, vue, sveltekit, three, expo, cli, headless, opentui, terminal, datastar — processor ids in `instant-host/src/identity.ts`.

### Does NOT sync on Instant

- **`plain-html/`** — local `Runtime.makeProgramRuntime` only, no `@foldkit/instant`.
- Any host started without demo credentials / missing `VITE_INSTANT_APP_ID`.
- `COUNTERS_TAPE=memory` (headless tests).

Uses app **`63750881-…`** (instant.env), **not** FoldkitCounterV01. Does not sync with `examples/counter` submission.

---

## 3. `examples/instant-counter`

Coordinator demo over full Program tape + headless admission sequencer. Schema in `instant.schema.ts` (Program entities + v3 + session claims). Same demo app as `instant.env`.

Surfaces: browser (`dev`), react (`dev:react` :5174), cli, tui, expo, headless authority. Requires `with-foldkit-instant-demo-credentials` skill wrapper (documented in README).

**Not** the counter submission sync model; different schema, auth, and acceptance pipeline.

---

## 4. `bench/` (rehearsal, not DEATH)

- Proof host: `https://counter.knophy.com`
- Mirror: `https://counter-mobile.knophy.com`
- Run: `pnpm bench` from repo root
- Asserts: `countVisible`, `incrementRaises`, `decrementLowers`, `instantSettlesLive`, `offlineWorks`, `actionMenuAbstraction`, `sameScreenMirrored`, `globalSync`
- Does not edit `examples/counter`; grades live deployed page via Playwright

---

## yield / submit-bundle scripts

**None found** in `examples/counter`, `examples/instant-counter`, `bench/`, or `scripts/`. DEATH `qanda.md` discusses yield/submit as contest protocol only; no executable `submit-bundle` or `yield.sh` in repo.

---

## Key excerpts (Instant wiring)

### App id (`packages/instant/src/sync/fromTransport.ts`)

```typescript
export const FoldkitCounterV01: InstantApp = {
  id: '5417c2e3-c6b9-476d-a962-2e11c83492aa',
}
```

### Env wrapper (`examples/counter/scripts/with-counter-v01-env`)

```sh
ENV_FILE="${FOLDKIT_INSTANT_DEMO_ENV_FILE:-$HOME/.config/foldkit-instant-demo/counter-v01.env}"
# ... source and exec
```

### Sync compose (`examples/counter/core/src/synced.ts`)

```typescript
export const SyncedCounter = Program.compose.sync({
  of: App,
  snapshot: CountProjection,
  message: MessageWire,
})
```

### Foldkit host start (`examples/counter/foldkit/src/instantHost.ts`)

```typescript
const handle = startLiveCounter(
  BrowserLive(Processor.Host.Foldkit(), {
    instance: globalThis.crypto.randomUUID().slice(0, instanceLength),
  }),
)
```

### Remote apply (`packages/foldkit/src/runtime/start.ts`)

```typescript
if (Option.isSome(from) && from.value === engine.processor) {
  rememberRow(event.row)
  return
}
// ...
runtime.send({ _tag: 'RemoteMessageReceived', message: decoded.value })
```
