# Overview 01 — One Program, hosts, and ports

**Status:** accepted with amendments (Q00, 2026-08-26 dictation).  
**Intent:** `examples/counter` is the gospel. One Program owns logic, screen, Message catalog, and sibling navigation. Hosts paint. Instant transports Messages. Nav libraries are adapters. Do not climb Multiple Counters until Counter sync is robust.

```text
                         ONE PROGRAM
            Model · Message · update · valid? · screen?
            navigation as Model   ·   sync classification
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          v              v              v
     paint hosts    URI carriers    Instant transport
     HTML/React     history         snapshot-log  (Counter V01)
     SwiftUI/ANSI   expo-router     count + message
     TUI/CLI        react-nav       ─────────────────
     Compose        Swift Nav       tape.ts         (collection later)
                    foldkit-nav     proposals + occurrences
                    rust-navigation (alerts/bindings, not URIs)
```

```text
GOSPEL CANDIDATE A — single Counter (FoldkitCounterV01)
  Path: /counter
  Messages: Increment | Decrement | Reset
  Instant: one count row + message log
  Painters: Foldkit screen, counter-swift PaintedScreen, (Rust not on V01)

GOSPEL CANDIDATE B — Multiple Counters (later or now)
  Paths: /counters | /:id | /:id/fact | /:id/delete
  Messages: GotChild + field-owner add/select/fact/delete
  Instant: not the V01 snapshot-log shape
  Painters: Destination or Program.screen (missing today)
```

```text
TODAY (drift)

  Foldkit counters Instant window
    ReadyWindow { selectedId?, count?, counters[] }   ← second Model
    React useState(uri)                               ← third Model
    fact/delete in Program + URI, absent from window

  Rust UniFFI
    CountersController + FfiNavigator                 ← generated
    ShowcaseApp @main = TranscriptionStressView       ← not Counters
    Android NavHost = Counter | Speech | Location     ← not CountersScreen
    counters-nav --instant writes counter_rows        ← into V01 app

  counter-swift
    CounterFeature paints counterScreen               ← right shape
    iPad processorID in bootstrap only                ← from still ios
    CountersFeature + InstantTape                     ← compiled, unlaunched
```

Q60 locked **A**: single Counter. Collection (B) waits.

Sibling navigation today:

```text
App = Program.compose.actionMenu({ of: CounterProgram })
Model = { product: Counter.Model, actionMenu: Closed | Open }
```

URI today is a parser-printer for `/counter` (`path.ts`). A full route table that names observed entities is Q89 / Q99 — not this week's Counter.

Sync today is snapshot-log (`count` + `message`) plus local `update`. Desired law is event sourcing (Q86–Q88): local first, peer fold, catch-up still open.
