# Client Matrix

The Client Matrix is a Foldkit Program with three complementary comparisons:

- Multiple Counters shows the synced Program in `examples/multiple-counters`,
  the one the `counters` command and `counters.pisspoursoftware.xyz` run. It
  compares three screens (the list `/counters`, Counter 1's page
  `/counters/1`, and the delete question `/counters/1/delete/1`) across the
  five clients that run that Program today: React, Svelte, OpenTUI, the
  terminal UI and the CLI.
- Wallet audits the current `WalletProgram` identity, one exact state route, one exact
  settled replay route, and the carrier and evidence boundary for React,
  Foldkit, raw CLI, Effect Terminal, OpenTUI, Expo Web, Expo iOS, Expo Android,
  and a future server host.
- Wallet intents cover BTC, ETH, SOL, and SUI over Devnet, Testnet, and Live modes.
  The Wallet core prints one global relative path for each intent. The matrix
  shows its exact carrier across the same clients and a future server.

The complete runnable adapter is called a **Client**. The matrix does not use
`medium` as an umbrella term. It records five independent axes for every
client:

- **Interaction surface:** graphical, terminal UI, or one-shot CLI.
- **Renderer:** React, Svelte, OpenTUI, or text.
- **Platform:** web, Node, or Bun.
- **Host:** Vite, OpenTUI, or the Foldkit terminal host.
- **URI carrier:** an HTTPS address, a command-line argument, or none yet.
  Svelte and OpenTUI start on the list and take no URI today.

Every cell starts from the Program's own `init`, Counter 1 at 0, and reaches
its screen by pressing the Program: `Open:1`, then `Delete`. No cell reads the
shared log, so a cell looks the same whatever the live counters hold.

- **CLI and terminal UI** cells are painted in the page, by the painters the
  `counters` command uses (`paintProgram` and `paintTerminal` from
  `foldkit/cli/program`). They cannot go stale: they are the Program, run.
- **OpenTUI** cells are the frames OpenTUI's test renderer painted, checked
  in as text under `foldkit/src/captures/open-tui/`. Write them again with
  `bun src/capture.ts ../../client-matrix/foldkit/src/captures/open-tui` in
  `examples/multiple-counters/opentui`.
- **React and Svelte** cells are screenshots under
  `foldkit/public/captures/`. `scripts/capture-web.mjs` takes them again.
- The **React** cell also opens the hosted app inside the cell, at the cell's
  URI with `?engine=memory`: `https://counters.pisspoursoftware.xyz/counters/1?engine=memory`.
  That ending keeps the counters in that window alone, so Counter 1 is always
  there. The page links the live Counters every device shares beside it.

The matrix is published at `https://matrix.pisspoursoftware.xyz`.

The earlier matrix compared an older Multiple Counters Program
(`examples/counters`) across eight clients, with its React client at
`countersdemo.pisspoursoftware.xyz`. That demo was retired on 2026-11-22 and
its captures left this folder; git history keeps them.

That hosted address and those captures apply only to Multiple Counters. The
Wallet audit does not invent public Wallet URLs or screenshots.
It distinguishes route implementation from Program reuse:

- Raw CLI, OpenTUI, and Expo accept both state and replay routes. The CLI
  inspects replay history inertly. OpenTUI and Expo use the shared inert replay
  controller.
- Effect Terminal accepts state routes. A replay route is validated at its
  selected settled frame and then branched into a live runtime. It is not inert
  replay playback.
- The standalone React application parses state and replay browser locations.
  Inline replay opens the shared inert controller. Saved replay still requires
  an injected ReplayTapeStore.
- The Foldkit renderer parses state routes and restores through the exact
  Wallet Program. It rejects replay routes because `makeFoldkitApplication`
  cannot mount an inert ReplayController. Starting from a replay branch would
  be different semantics and is not substituted silently.
- No future server host, endpoint, or ReplayTapeStore is claimed.

The Wallet route strings are exact outputs of the shared `WalletProgram`
router over a small public Model and a one-transition settled replay tape. The
carrier strings use `<portable-wallet-route>` and `<expo-web-origin>` as explicit
substitution points. They are not deployment claims. Source inspection and
focused-test evidence are labeled independently, and no physical iOS or Android
behavior is implied.

Wallet intent paths are exact outputs of
`examples/wallet/core/src/intent.ts`. The parser-printer covers all twelve native
asset and network-mode combinations for Bitcoin, Ethereum, Solana, and Sui.
Every example uses deterministic test money. No Mainnet rail silently falls
back to a Devnet or Testnet Layer.

Intent parsing and pending intent state are implemented in the shared core.
React Web, Foldkit View, Expo Web, Expo iOS, and Expo Android carriers are
labeled `Active`: opening one loads the wallet and produces a preview Command,
but never submits the transaction. CLI, Effect Terminal, and OpenTUI accept the
same portable intent route. The CLI can submit that preview and reads every
encoded property back after the observed simulated transaction settles.

Run it with:

```sh
pnpm dev:example:client-matrix
```

The Multiple Counters orientation control switches between screens as rows and
clients as rows. Selecting a screen updates the inspector: its URI, the stack
of screens, the Model, and the screen on top. Opening the React client inside
a cell also selects that cell's screen. The Wallet table is evidence-first and
is not changed by any of this.
