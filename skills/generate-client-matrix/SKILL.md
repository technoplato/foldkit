---
name: generate-client-matrix
description: Build or audit a Foldkit application that compares one portable Program across React, Foldkit view, Expo Web, Expo iOS, Expo Android, Effect Terminal, OpenTUI, raw CLI, and server clients. Use when a task asks for a client, host, platform, renderer, URI, deep-link, state, replay, intent, screenshot, or interaction matrix.
---

# Generate Client Matrix

Build the matrix as a Foldkit Program backed by typed definitions and verified
evidence. Do not make a hand-authored chart that can drift from the clients it
describes.

Read [references/matrix-contract.md](references/matrix-contract.md) before
editing a matrix.

## Workflow

1. Identify the exact shared Program and its exported Model, Message, init,
   update, restore, and Subscription definitions. Every compared client must
   consume those definitions rather than reimplementing the domain.
2. Inventory each runnable Client. Record its interaction surface, renderer,
   platform, host, and URI carrier separately.
3. Derive state and replay paths from the Program router. Derive domain intent
   paths from a domain-owned parser-printer. Never hand-build a path in the
   matrix when a canonical printer exists.
4. Model every row, column, capability, limitation, and evidence level with
   Effect Schema. Render the typed data through the matrix Program.
5. Wrap each portable relative URI in a client-owned carrier. Origins, custom
   schemes, command-line arguments, and launch behavior belong to clients, not
   the Program.
6. Capture real output from every claimed client. Keep screenshots checked in,
   identify their exact source state and URI, and make interactive cells launch
   that same state when practical.
7. Prove parser-printer round trips, complete row and column coverage, carrier
   construction, and rendered links with focused tests.
8. Label unsupported and unverified cells. A build, export, or source review is
   not physical iOS or Android behavior evidence.

## Architecture boundaries

- Call the complete runnable adapter a **Client**.
- A Message is a fact. URL parsing may create startup input or a Message, but
  it must never execute a side effect directly.
- update owns Model transitions and produces Commands. Replays use inert Layers
  so historical Commands cannot repeat side effects.
- The portable URI is global. A platform only adds its scheme, authority, and
  launch behavior.
- Do not put Effect fibers, subscriptions, process handles, DOM nodes, or native
  navigation handles in the Model.
- Do not expose private keys, access tokens, PII, or secret-bearing state in a
  URI, screenshot, tape, or matrix cell.

## Evidence requirements

For each cell, show the exact portable URI, exact client carrier or reproducible
command, image when visual output exists, evidence level, and any limitation.
Link or embed a live client only when the target is actually running and accepts
that route. Otherwise keep the capture static and explain the missing seam.

Finish by reporting focused tests, typechecks, builds, visual inspection, and
the highest device validation level reached.
