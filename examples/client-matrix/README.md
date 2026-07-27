# Client Matrix

The Client Matrix is a Foldkit Program with two complementary comparisons:

- Multiple Counters derives four screen modes from the shared Navigation union
  and route parser-printer. It compares those modes across eight real client
  surfaces. Every cell shows the client carrier and a checked-in capture of that
  client rendering the same canonical application state.
- Wallet audits the `wallet@1` Program identity, one exact state route, one exact
  settled replay route, and the carrier and evidence boundary for React,
  Foldkit, raw CLI, Effect Terminal, OpenTUI, Expo Web, Expo iOS, Expo Android,
  and a future server host.

The React and Foldkit captures open their public browser clients in an
interactive iframe inside the selected cell. The live client starts from that
cell's exact portable URI and can navigate independently until **Return to
capture** closes it. Expo Web captures link to its public browser carrier. Expo
iOS and Android captures link to the corresponding `foldkit://showcase` deep
link. Terminal, TUI, and raw CLI cells remain capture evidence with their
reproducible launch command.

The matrix is published at `https://matrixdemo.knophy.com`. Its browser carriers
use `https://countersdemo.knophy.com`, `https://foldkitdemo.knophy.com`, and
`https://expodemo.knophy.com`. Native custom-scheme links require an installed
development or production build. Expo Go does not register the Showcase's
`foldkit` scheme.

Those deployed browser origins and checked-in captures apply only to Multiple
Counters. The Wallet audit does not invent public Wallet URLs or screenshots.
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

The Wallet route strings are exact outputs of the shared `wallet@1` Program
router over a small public Model and a one-transition settled replay tape. The
carrier strings use `<portable-wallet-route>` and `<expo-web-origin>` as explicit
substitution points. They are not deployment claims. Source inspection and
focused-test evidence are labeled independently, and no physical iOS or Android
behavior is implied.

Run it with:

```sh
pnpm dev:example:client-matrix
```

The Multiple Counters orientation control switches between screen modes as rows
and clients as rows. Selecting a mode updates the live Navigation, application
Model, portable URI, and presentation destination inspector. Opening an
embedded client also selects its originating mode, which keeps the inspector
aligned with the iframe's initial deep link. The Wallet table is evidence-first
and does not alter the preserved Multiple Counters captures.
