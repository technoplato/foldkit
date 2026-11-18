# Plan 10 | Every example on every surface

Status: Proposed. Design only. Revised after adversarial rounds 1 to 4
(R2-26, R2-32, R2-35, R3-05, R4-18). Closes audit item 6 (Multiple Counters lacks Expo and
Foldkit HTML) and the Foldkit HTML adapter gap behind audit item 1.

## Capabilities first

A host that cannot do something says so through a declared capability
(`PRINCIPLES.md`, principle 2). Today nothing declares one, so `Start` would
be offered in a browser with no microphone Layer.

```ts
export const Capability = S.Union([
  Microphone(),
  Recognizer(),
  AudioPlayer(),
  FileSystem(),
  Clipboard(),
  Camera(),
  Notifications(),
])
```

- An App's `services` (plan 06) name the service tags its Program needs; each
  service tag names the Capability it stands for.
- A host's Layers provide capabilities; `startApp` records the set the host
  provided and passes it to `availabilityOf` as `context.capabilities` (plan
  02). A host that lacks a service provides its `Unavailable` Layer, so
  Effect's requirement is met and a Command that reaches it fails with a
  named error instead of a missing-service crash.
- An Action declares `needs: [Capability.Microphone()]`; `availabilityOf`
  refuses it where the host lacks the capability, with the sentence "this
  surface has no microphone", so the Action is painted disabled with a
  reason, never offered as if it worked.
- A matrix cell below names the Layer it needs; a cell marked paint-only
  paints the Program and offers only the Actions its capabilities allow.

## The matrix today

| Host                    | Counter | Multiple Counters | Books | Lines of host code (Counter)    |
| ----------------------- | ------- | ----------------- | ----- | ------------------------------- |
| React                   | yes     | yes               | yes   | 37                              |
| Svelte                  | yes     | yes               |       | 25 plus 24                      |
| Foldkit HTML            | yes     | no                |       | 99 (`view.ts`) plus 58          |
| Foldkit HTML, phone     | yes     | no                |       | shared                          |
| Expo (React Navigation) | yes     | no                |       | 32 plus 80 (`startExpoCounter`) |
| Expo Router             | yes     | no                |       | 30                              |
| TUI                     | yes     | yes               | yes   | 29                              |
| OpenTUI                 | yes     | yes               |       | 51                              |
| CLI                     | yes     | yes (one-shot)    | yes   | 255 over 7 files                |
| Headless                | yes     | no                |       | 407 (printer)                   |

## The matrix after plans 01, 03, 10

| Host                          | Counter | Multiple Counters | Books                        | Dictate                                           | Finance                            | Lines of host code   |
| ----------------------------- | ------- | ----------------- | ---------------------------- | ------------------------------------------------- | ---------------------------------- | -------------------- |
| React                         | yes     | yes               | yes (AudioPlayer: web audio) | paint-only (no Microphone Layer in a browser yet) | yes (FinanceGateway: origin)       | about 35             |
| Svelte                        | yes     | yes               | yes (AudioPlayer: web audio) | paint-only                                        | yes                                | about 35             |
| Foldkit HTML                  | yes     | yes               | yes (AudioPlayer: web audio) | paint-only                                        | yes                                | about 15             |
| Expo (React Navigation)       | yes     | yes               | yes (AudioPlayer: expo-av)   | not planned                                       | yes                                | about 30             |
| Expo Router                   | yes     | yes               | not planned                  | not planned                                       | yes                                | about 30             |
| TUI, OpenTUI, CLI             | yes     | yes               | yes (AudioPlayer: ffplay)    | yes (Microphone, Recognizer: the signed helper)   | yes                                | 6 plus a Layers file |
| Server worker (`Host.server`) | yes     | yes               | not planned                  | yes (projection runner, reverse feed)             | yes (vendors, webhooks, ClosedDay) | 6                    |

A cell is "yes" only once its host passes ADR 0014 Decision 2's conformance
suite and plan 01's daemon assertions, with the Layer named. "Paint-only" is
a host that paints and syncs but lacks a capability; "not planned" is a host
nobody has designed, which is a decision for the owner, not a promise.

## Foldkit HTML adapter

`examples/counter/foldkit/src/view.ts` is 99 lines because `foldkit/renderers/html`
offers parts (`paintFrameHtml`, `paintStatusHtml`, `paintMenuHtml`) and no
window. Add the window:

```ts
// examples/multiple-counters/foldkit/src/entry.ts, whole host
import { runFoldkitWindow } from 'foldkit/html/window'
import { CountersApp } from 'multiple-counters-core-example'

runFoldkitWindow(CountersApp, {
  host: Host.foldkit,
  engine: Engine.instant.browser({ app: InstantApps.dev }),
  layers: browserLayers,
  container: Container.selector('#root'), // fails with ContainerNotFound('#root'), never a null at the call site
  device: Device.Computer,
})
```

`runFoldkitWindow` does what `App.tsx` does in React: status while Starting,
the navigation frame, the menu opener, document keys, browser history, the
title. The phone variant passes `Device.Phone`. `Container`, not `Mount`:
Mount is the element lifecycle primitive, and the name stays its own.

## Expo for Multiple Counters

Two packages mirroring Counter's: `examples/multiple-counters/expo`
(`FoldkitStack`, `ActionMenuButton`, `useDeepLinks`) and
`examples/multiple-counters/expo-router` (`FoldkitRouterStack`). The 80-line
`startExpoCounter.ts` (Instant native database, AsyncStorage snapshot, Fast
Refresh guard) becomes `Engine.instant.native(...)` in
`@foldkit/react-native`, so the Expo entry is `startApp(CountersApp, { host, engine, layers })` like every other host. The Dialog (`Delete Counter 3?`)
and the Choose rows are what this host proves: React Native's painter must
present a Dialog over a pushed page and offer choices.

## Hosts as an open set

`Processor.Host` is a closed 9-member enum in core. A new TUI framework must
not edit the library, and there is no registry to join: a Host is a value an
adapter exports, built with a callable constructor, carrying its own name and
kind; the envelope stores `host` and `instance` as fields, so nothing parses
a name out of a string.

```ts
export const Host = S.Struct({
  name: HostName,
  label: S.String,
  kind: HostKind,
}) // HostKind = Browser | Native | Terminal | Server | Headless
export const ink = Host.make({
  name: HostName.make('ink'),
  label: 'Ink',
  kind: 'Terminal',
}) // in @foldkit/ink, not in foldkit
```

Foldkit's own hosts are exported the same way (`Host.react`, `Host.cli`,
`Host.foldkit`, …). `Host.server` (kind `Server`) is the one host that starts
`serverOnly` work; `Host.headless` (kind `Headless`) folds everything and
starts none, which is what tests and read-only workers want (R3-05). Both,
with `HostKind`, are defined in plan 06 and land at build step 3; this plan
extends the set (R4-18). The glossary keeps "Host" for the embedding surface and
"Processor Host" for this value; the code's name predates the glossary and
stays.

## Acceptance

Every host of every example passes ADR 0014 Decision 2's conformance suite and
plan 01's daemon assertions. A host is listed as "yes" only when it does, with
the Layer that gives it its capabilities named.

## Decisions for the owner

1. Which "not planned" cells should exist: Books on Expo Router, Dictate on
   Expo (a microphone Layer on React Native is plausible), Books as a server
   worker (Dictate's is planned: the Scribe Projection and the reverse feed).
2. Whether a browser Dictate should get a Web Audio plus Web Speech Layer
   (then "paint-only" becomes "yes" in three cells).
