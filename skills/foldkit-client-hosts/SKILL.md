---
name: foldkit-client-hosts
description: Adapt one renderer-free Foldkit Program to browser, React, React Native, terminal, TUI, CLI, server, or embedded clients. Use for portable Programs, host boundaries, runtime adapters, typed Ports, URI carriers, replay controllers, multi-client parity, or evidence matrices.
---

# Foldkit Client Hosts

Keep one canonical Program and make each runnable adapter a Client. A Client
owns presentation, input translation, platform Layers, URI carrier, and launch
behavior. It does not own a second copy of domain truth.

Call each running Program occurrence inside or reached through a Client a
Processor. A Processor consumes Messages, is realized by one live or replay
`ProgramRuntime`, and advertises the capabilities its Layers can perform. One
Client may host several Processors. A headless Client may host Processors without
rendering a human interface, and a one-shot Client may attach to a longer-lived
Processor.

Use `$foldkit-program-runtimes` when a Client launches multiple instances or the
task depends on runtime identity, isolation, replay ownership, or shutdown.

## Workflow

1. Extract or identify the Program's Model, Message, init, update, restore,
   Subscriptions, ManagedResources, Ports, version, and migrations.
2. Keep the Program free of renderer and platform imports. Define required
   capabilities as Effect services.
3. In each Client, provide the complete Layer, render the current Model, and
   translate input into canonical Messages.
4. Use `Runtime.makeFoldkitApplication` for a Foldkit DOM Client. Use the
   Program runtime surface for non-Foldkit renderers and process hosts. Follow
   an existing client in `examples/` instead of inventing a second store. Give
   every Processor a host-owned identity and an explicit capability set.
5. Use typed Ports for embedding and host communication. Keep the port protocol
   Schema-defined and dispose the embedded runtime with its host lifecycle.
6. Wrap portable relative state, replay, or intent routes in client-owned
   carriers. Do not teach Program about web origins, native schemes, or argv.
7. Apply recorded Messages with inert side-effect Layers. Resume live Commands
   only after branching from the selected settled frame.
8. Test shared Program behavior once, then test each adapter's mapping, Layer,
   carrier, lifecycle, and rendering seam. Capture evidence separately for each
   claimed Client.

## Background work and following from a CLI

Decide the layer first; `AGENTS.md` ("Which layer?") has the checklist and a
worked table.

- Background work, and anything that stays in sync, runs in the Background
  Processor: `listenBackgroundProcessor` (first spelled `listenCliDaemon`)
  with `programCliSurface`. A command
  is a slim view from `foldkit/cli/view` that asks it (`runCliView`), follows
  it (`writeCliFollow`), or stops it. Do not start another kind of background
  process, and do not put Effect, the sync engine, or the Program in the slim
  view.
- A CLI command is one-shot and scriptable. Nothing waits on a keypress and
  nothing takes over the terminal. Interactive work belongs to the TUI Client
  (`runCliTuiView`).
- To let a command hear something as it changes, give the Background
  Processor a topic.
  Every Program has `screen` from `programFollowings(bound)`. Add your own
  beside it with `Interaction.follow(bound, read, isSame)`, where `read` is a
  pure reading the domain core exports, and serve them with `followTopicOf`.
  `counter follow` and `books follow words --json` are the same code path.
- Keep the fact in a core. `examples/books/cli` prints the words being read
  and owns no rule about them: `spokenWordsOf` in `examples/books/core` and
  `transcriptExcerptOf` in `foldkit/renderers` do.

## Help, usage, and refusals are derived

Type no usage line, help table, hint, or command example in a Client. Each
is read from a declaration; `AGENTS.md` ("Declare once; derive everything")
has the rule, the derivation path, and four worked pairs.

- A Program's Actions reach a Client as `Catalog.declarationsOf(catalog)`,
  with no Model. What a host does itself (follow, devices, sign in, stop)
  is declared in the host with `Declaration.declare(name, { what, why,
fields, subject })`, its parameters as Effect Schema fields.
- A terminal spells and reads them with `foldkit/cli/view`: `usageOf`,
  `exampleOf`, `helpLines`, `commandHelpOf`, `toggleFlagsOf` for the argv
  reader, and `askedOf`, which answers what was asked or one sentence with
  the nearest name and the usage. Give each command the host answers a
  handler typed from its declaration, as `examples/books/cli/src/entry.ts`
  does, so a command without a handler does not compile.
- Keep the slim view free of Effect: read the host's declarations as plain
  data through `cachedDerivation`, which derives them again when the code
  changes.
- Add the test that fails on a hand-typed command, as
  `examples/books/cli/src/declared.test.ts` does, and run every example
  through the real launcher.

## Evidence discipline

- Do not reuse one renderer's screenshot as proof of another.
- Do not call source inspection, build success, simulator output, and physical
  device behavior equivalent evidence.
- Record the exact Program state or replay frame and portable URI used for each
  capture.
- Use `$generate-client-matrix` when the requested output is a complete typed
  capability and evidence matrix.

## Source anchors

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/programRuntime/public.ts`
- `packages/foldkit/src/port/runtime.ts`
- `examples/counter/core/src/program.ts`
- `examples/counter/foldkit/src/entry.ts`
- `examples/fact/react/src/factReactClient.ts`
- `examples/embedding/src/`
- `examples/client-matrix/`
- `examples/world/` (one World Program; Three.js, Foldkit HTML, React, OpenTUI, headless)
