# Change Log

Newest entries appear first. Implementation commits and intent are recorded separately from ledger-only commits.

<!-- change-log:entries -->

## July 27th, 2026 at 9:05:41 p.m. EDT — `c2a65a7cafcc` refactor(wallet): make executable transfers algebraic

- **Implementation commit:** `c2a65a7cafcc396297d332002124460714cf377e`
- **Change:** Make executable Wallet transfer states algebraic and prove Sepolia delivery
- **Details:**
  - Separated portable transfer requests from exact executable intent, draft, and preview tagged unions.
  - Validated untrusted host drafts and provider quotes before they can enter the Model or a replay tape.
  - Ignored stale Command completion facts and carried the same validated transfer union through every Wallet client.
  - Proved real Sepolia signing, submission, and receiver-side WebSocket observation without polling.
- **Files:**
  - `docs/explorations/wallet-domain-invariants.md` — Record the algebraic and runtime invariant boundary.
  - `docs/explorations/wallet-testnet-layers.md` — Record live transaction evidence and no-polling observation semantics.
  - `examples/client-matrix/core/src/walletIntent.ts` — Describe valid requests separately from configured execution support.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Use the validated transfer boundary in Expo.
  - `examples/wallet/cli/src/host.ts` — Construct only validated CLI transfer drafts.
  - `examples/wallet/core/src/currency.ts` — Define exact Network, Currency, and precision combinations.
  - `examples/wallet/core/src/intent.test.ts` — Prove request routing and executable capability separation.
  - `examples/wallet/core/src/intent.ts` — Separate portable requests, executable intents, and unsupported capabilities.
  - `examples/wallet/core/src/model.test.ts` — Prove invalid asset and Network drafts are rejected.
  - `examples/wallet/core/src/model.ts` — Encode executable drafts and replayable previews as tagged unions.
  - `examples/wallet/core/src/program.test.ts` — Exercise exact algebraic cases through Program replay.
  - `examples/wallet/core/src/update.test.ts` — Prove stale Command facts do not mutate current state.
  - `examples/wallet/core/src/update.ts` — Validate provider quotes and reject stale completion facts.
  - `examples/wallet/foldkit/src/application.ts` — Expose the exact canonical Wallet Program to the Foldkit client.
  - `examples/wallet/foldkit/src/view.ts` — Construct only validated Foldkit transfer drafts.
  - `examples/wallet/react-bindings/src/wallet.test.tsx` — Prove stable React actions send exact transfer drafts.
  - `examples/wallet/react-bindings/src/wallet.tsx` — Expose renderer-neutral typed transfer actions.
  - `examples/wallet/react/src/App.tsx` — Construct only validated React transfer drafts.
  - `examples/wallet/simulated-client/src/simulatedWallet.test.ts` — Validate simulated provider quotes through the core boundary.
  - `examples/wallet/simulated-client/src/simulatedWallet.ts` — Return provider-shaped quotes for core validation.
  - `examples/wallet/terminal/src/host.ts` — Construct only validated Effect Terminal transfer drafts.
  - `examples/wallet/testnet-node/package.json` — Expose the opt-in live Sepolia transfer test.
  - `examples/wallet/testnet-node/src/ethereumSepolia.ts` — Remove unreachable Network branches from executable transfers.
  - `examples/wallet/testnet-node/src/live.transfer.test.ts` — Prove production Sepolia submission and WebSocket observation.
  - `examples/wallet/testnet-node/src/solanaDevnet.ts` — Remove unreachable Network branches from executable transfers.
  - `examples/wallet/testnet-node/src/walletServices.test.ts` — Prove Solana Testnet remains outside executable drafts.
  - `examples/wallet/testnet-node/src/walletServices.ts` — Route only executable Network cases.
  - `examples/wallet/tui/src/host.tsx` — Construct only validated OpenTUI transfer drafts.
  - `examples/wallet/tui/src/presentation.ts` — Expose the exact canonical Wallet Program to OpenTUI.
- **User context (verbatim):**
  > i want to make sure this domain is modeled with algebraic data types making impossible state impossible..
  > transaction completed
- **SpecStory:** unavailable — Codex desktop GUI task; no verified SpecStory capture or durable public URI is available.

## July 27th, 2026 at 7:50:47 p.m. EDT — `1a4f066dd9b9` feat: add portable wallet intent client matrix

- **Implementation commit:** `1a4f066dd9b93c4baef6ac3b0dbd0ae963cda63f`
- **Change:** Add a portable Wallet intent parser-printer and cross-client interaction matrix
- **Details:**
  - Separated Client identity from interaction surface, renderer, platform, host, and URI carrier so React, Foldkit, Expo, terminal, TUI, CLI, iOS, and Android are described without overloading medium.
  - Added canonical ETH, SOL, and USD intent paths for Devnet, Testnet, and Live, with explicit Layer support and no silent mainnet-to-testnet fallback.
  - Kept intent parsing side-effect free and labeled every host intake as pending until startup intent or Message semantics are implemented.
  - Added and validated a reusable generate-client-matrix skill with route laws, imagery requirements, and evidence boundaries.
- **Files:**
  - `examples/wallet/core/src/intent.ts` — Own the typed Wallet intent parser-printer and Layer capability mapping.
  - `examples/wallet/core/src/intent.test.ts` — Prove route round trips, canonicalization, rejection, and capability behavior.
  - `examples/client-matrix/core/src/model.ts` — Separate the Client taxonomy into surface, renderer, platform, host, and carrier.
  - `examples/client-matrix/core/src/walletIntent.ts` — Define all asset and mode examples plus exact host carrier templates.
  - `examples/client-matrix/foldkit/src/view.ts` — Render client taxonomy, canonical intent URIs, verified images, and explicit gaps.
  - `skills/generate-client-matrix/SKILL.md` — Ship the reusable Foldkit client-matrix workflow.
  - `pnpm-lock.yaml` — Link the matrix core to the canonical Wallet core workspace package.
- **User context (verbatim):**
  > what's a test address i can send faucet eth sepolia to?
  > also do the matrix for the full medium interaction. with imagery and deeplinks and also with intents embedded in deeplinks
  > also create a skill for this framework for generating these matrices
- **SpecStory:** unavailable — Codex desktop GUI task; no verified SpecStory capture or durable public URI is available.

## July 27th, 2026 at 7:27:48 p.m. EDT — `4dcab5b083f3` test(wallet): prove push-observed Devnet transfers

- **Implementation commit:** `4dcab5b083f38b03272194510316b6110cba7b3a`
- **Change:** Prove live push-observed Solana Devnet transfers
- **Details:**
  - Added an explicit opt-in integration test that uses the production Solana transport and custody Layers to preview, prepare, digest, sign, and submit a disposable Devnet SOL transfer.
  - Required the receiver to emit the matching incoming transaction through logsSubscribe, with no balance, signature-status, or transaction-history polling loop.
  - Recorded two successful live runs, the public transaction evidence, the safety gate, and the provider-specific boundary for future authenticated webhook Layers.
- **Files:**
  - `examples/wallet/testnet-node/src/live.transfer.test.ts` — Exercise the real sender and receiver Layers while keeping normal tests inert.
  - `examples/wallet/testnet-node/package.json` — Expose the explicitly named live transfer command.
  - `examples/wallet/README.md` — Distinguish simulated, read-only smoke, and transfer validation.
  - `docs/explorations/wallet-testnet-layers.md` — Document WebSocket evidence, secrets, and webhook responsibilities.
- **User context (verbatim):**
  > go work on validating that yourself
  > We want web hooks and web sockets for notifications when transactions arrive, please.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 27th, 2026 at 7:09:48 p.m. EDT — `7fedb5ecd319` fix: keep Wallet clients alive during demos

- **Implementation commit:** `7fedb5ecd3198537561a373a30fcad7fed3830af`
- **Change:** Keep concurrent Wallet demos from deleting shared build output
- **Details:**
  - Replaced clean-before-run Wallet demo chains with one launcher that compiles dependency artifacts in place, preserving files already watched by Metro and Vite.
  - Preserved direct argument forwarding and interactive stdin for the raw CLI, Effect Terminal, and OpenTUI clients.
  - Verified the CLI while Expo Web, iOS, Android, React, and Foldkit remained live, then verified interactive Terminal and TUI startup and clean q exits.
- **Files:**
  - `scripts/run-wallet-demo.ts` — prepare client dependency graphs without deleting shared dist trees and preserve interactive stdio
  - `package.json` — route all Wallet demo commands through the concurrency-safe launcher
- **User context (verbatim):**
  > the tui's don't accept any input
  > there's some kind of looping going on here
- **SpecStory:** unavailable — No SpecStory URI is available because this implementation occurred in Codex desktop GUI, whose capture is not proven by SpecStory sync evidence.

## July 27th, 2026 at 6:58:45 p.m. EDT — `4e5d33c31a1d` feat(wallet): run portable Program across clients

- **Implementation commit:** `4e5d33c31a1d2af04111168696ffd743be8dd129`
- **Change:** Run one Wallet Program across every implemented client
- **Details:**
  - Added Sepolia and Solana Devnet Effect Layers behind unified wallet contracts, with exact atomic units, Redacted configuration, live transaction subscriptions, and read-only opt-in smoke tests.
  - Added React, Foldkit, raw CLI, Effect Terminal, OpenTUI, and Expo presenters that all consume the exact portable Wallet Program and its state and replay routes.
  - Extended the client matrix with typed evidence and documented which replay, resource injection, storage, diagnostics, and cross-language responsibilities belong in Foldkit rather than domain adapters.
- **Files:**
  - `examples/wallet/testnet-node/src/live.ts` — compose the real Sepolia and Solana Devnet wallet services
  - `examples/wallet/react-bindings/src/wallet.tsx` — expose domain-shaped React hooks over the exact Wallet Program
  - `examples/wallet/foldkit/src/application.ts` — run State starts through the canonical Foldkit renderer
  - `examples/wallet/cli/src/host.ts` — provide one-shot state and replay operations
  - `examples/wallet/terminal/src/host.ts` — provide an interactive Effect Terminal host
  - `examples/wallet/tui/src/host.tsx` — provide an interactive OpenTUI host
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — render the same Wallet presenter on Expo Web, iOS, and Android
  - `examples/client-matrix/core/src/wallet.ts` — record typed support and evidence for every medium
  - `docs/explorations/client-agnostic-runtime-audit.md` — separate engine, domain, host, and presenter ownership
  - `docs/explorations/wallet-testnet-layers.md` — document network capabilities, configuration, and safety limits
  - `package.json` — add direct demo and development commands
  - `pnpm-lock.yaml` — lock every private example workspace importer and SDK
  - `pnpm-workspace.yaml` — allow the pinned viem release through dependency-age policy
  - `knip.json` — include every new package in dead-code analysis
  - `.changeset/config.json` — keep private examples outside release accounting
- **User context (verbatim):**
  > those layers and everything are set up to work ubiquitously in a TUI, in a command line, in a web app for React, a fold kit, and expo for iOS and React Native.
- **SpecStory:** unavailable — No SpecStory URI is available because this implementation occurred in Codex desktop GUI, whose capture is not proven by SpecStory sync evidence.

## July 27th, 2026 at 6:31:59 p.m. EDT — `e298d836ef8c` feat(message-versioning): target historical Messages

- **Implementation commit:** `e298d836ef8c4e3f1a6c2773cd666314596b34a5`
- **Change:** Make historical Message targets explicit and audit native TCA processing
- **Details:**
  - Added deterministic v0 and v1 Message encoders that preserve the stable event identity and reject values whose meaning the requested historical grammar cannot represent.
  - Recorded the smallest native Program processor shared by TCA 1.25 and TCA26, including generated wire types, pure semantics, dependency-backed Commands, navigation ownership, and replay laws.
  - Separated old Message encoding, complete old Program export, and opaque transit so compatibility claims remain precise.
- **Files:**
  - `examples/message-versioning/src/message.ts` — define validated historical targets and typed unrepresentable failures
  - `examples/message-versioning/src/messageVersioning.test.ts` — prove exact target selection and rejection without fallback
  - `docs/explorations/native-tca-message-processor.md` — document the local TCA source audit and cross-runtime contract
- **User context (verbatim):**
  > We need a versioning system for our messages and a conversion layer.
- **SpecStory:** unavailable — No SpecStory URI is available because this implementation occurred in Codex desktop GUI, whose capture is not proven by SpecStory sync evidence.

## July 27th, 2026 at 6:23:12 p.m. EDT — `5567c92826e5` fix(wallet): restore represented finite work

- **Implementation commit:** `5567c92826e5f2128981b06f6d386e55768959c6`
- **Change:** Restore finite Wallet work from represented state
- **Details:**
  - Added the Wallet Program restore boundary so reconstructed Models restart portfolio loading, transaction preview or submission, and challenge signing without a host dispatching synthetic Messages.
  - Verified the wallet core build and all 27 focused tests, including exhaustive restoration and inert stable-state coverage.
- **Files:**
  - `examples/wallet/core/src/program.ts` — attach the domain restore function to the exact Wallet Program
  - `examples/wallet/core/src/update.ts` — derive finite restoration Commands exclusively from represented Model states
  - `examples/wallet/core/src/update.test.ts` — prove each in-flight state restarts and stable states remain inert
- **User context (verbatim):**
  > we want to track that in the replayability tape
- **SpecStory:** unavailable — No SpecStory URI is available because this implementation occurred in Codex desktop GUI, whose capture is not proven by SpecStory sync evidence.

## July 27th, 2026 at 6:19:53 p.m. EDT — `5feb8028372d` feat(staked-access): model signed stake adjudication

- **Implementation commit:** `5feb8028372dfca72fd34275018ee687e3488aeb`
- **Change:** Model signed skin-in-the-game access as a portable Foldkit Program.
- **Details:**
  - Bound opaque identity, a deterministic UUID tape address, ordered Message ids, derived state, capabilities, nonce, expiry, and positive exact stake terms, then modeled escrow, adjudication, refund, and forfeiture as injected Effects with inert historical replay.
- **Files:**
  - `.changeset/config.json` — Keep the protocol example outside release accounting.
  - `docs/explorations/staked-access-protocol.md` — Record privacy, replay, escrow, and trust boundaries.
  - `examples/staked-access/core/src/claim.ts` — Define the complete public claim commitment.
  - `examples/staked-access/core/src/model.ts` — Make contradictory settlement states unrepresentable.
  - `examples/staked-access/core/src/update.ts` — Sequence signing, locking, verification, and settlement Commands.
  - `examples/staked-access/core/src/protocolClient.ts` — Inject canonicalization, escrow, and adjudication services.
  - `examples/staked-access/core/src/simulated.ts` — Provide deterministic grant and rejection Layers.
  - `examples/staked-access/core/src/program.test.ts` — Prove refund, forfeiture, inert replay, and secrecy.
  - `pnpm-lock.yaml` — Lock the staked-access workspace importer.
- **User context (verbatim):**
  > We want to make the stake very robust, but as simple as possible, too.
  > If we get that wrong, then we lose our stake, and the stake goes to the treasury of the open source.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this work was performed in Codex desktop, not a captured Codex CLI session.

## July 27th, 2026 at 6:16:39 p.m. EDT — `bcb42fc3016f` feat(wallet): add portable wallet Program

- **Implementation commit:** `bcb42fc3016f75555d0cfe6078cecab34bff7960`
- **Change:** Add one portable wallet Program and deterministic resources for every client.
- **Details:**
  - Modeled exact timestamped values, accounts, receiving URIs, previews, post-transaction balances, address history, signatures, submissions, and persistent transaction observation while confining keys and private payloads to Redacted Effect services.
- **Files:**
  - `.changeset/config.json` — Keep private wallet examples outside release accounting.
  - `docs/adr/0004-portable-wallet-and-staked-access.md` — Record wallet, replay, and staked-access boundaries.
  - `examples/wallet/core/src/program.ts` — Define the canonical renderer-independent Program.
  - `examples/wallet/core/src/model.ts` — Define public wallet state and workflows.
  - `examples/wallet/core/src/update.ts` — Confine finite work to injected Commands.
  - `examples/wallet/core/src/subscription.ts` — Observe live transactions without polling.
  - `examples/wallet/core/src/walletClient.ts` — Keep custody and signed payloads behind Redacted services.
  - `examples/wallet/core/src/program.test.ts` — Prove replay secrecy and Command boundaries.
  - `examples/wallet/simulated-client/src/simulatedWallet.ts` — Exercise the complete wallet contract without money or keys.
  - `pnpm-lock.yaml` — Lock wallet workspace importers.
- **User context (verbatim):**
  > We want an API for asking the wallet to sign.
  > When you break it down into layers, side effects, actions, messages, commands, etc., this is going to be a lot simpler to build than we think.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this work was performed in Codex desktop, not a captured Codex CLI session.

## July 27th, 2026 at 6:13:12 p.m. EDT — `ad3f9d30b910` feat(message-versioning): prototype portable Message upgrades

- **Implementation commit:** `ad3f9d30b9107c224293c08ed113ed0f95a7857d`
- **Change:** Prototype versioned portable Messages and a native Swift/TCA processor boundary.
- **Details:**
  - Defined deterministic adjacent upgrades, fallible exact downgrades, and replay migrations, then documented generated Swift wire types, pure native update parity, dependency mapping, and canonical JSON prerequisites.
- **Files:**
  - `.changeset/config.json` — Keep new example packages outside release accounting.
  - `docs/explorations/message-versioning.md` — Record versioning laws and the information-loss boundary.
  - `docs/explorations/native-tca-message-processor.md` — Record generated wire and native semantic seams.
  - `examples/message-versioning/package.json` — Register the executable proof package.
  - `examples/message-versioning/src/message.ts` — Define stable event identities and adjacent conversions.
  - `examples/message-versioning/src/messageVersioning.test.ts` — Prove upgrade, downgrade, and replay laws.
  - `examples/message-versioning/src/program.ts` — Demonstrate Program tape migrations.
  - `pnpm-lock.yaml` — Lock the workspace importer.
- **User context (verbatim):**
  > We need a versioning system for our messages and a conversion layer.
  > We need to plan for and design a native processor that can ubiquitously consume these messages.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this work was performed in Codex desktop, not a captured Codex CLI session.

## July 27th, 2026 at 5:49:51 p.m. EDT — `6a2e76364659` feat: exercise portable navigation across clients

- **Implementation commit:** `6a2e7636465991af6053aa91e3ecbde0059205b5`
- **Change:** Exercise portable navigation across clients
- **Details:**
  - Added a typed client matrix with canonical Multiple Counters state, portable URI carriers, live Foldkit and React cells, and checked-in evidence for eight client surfaces.
  - Added an Effect Terminal client and restored URI state consistently across CLI, OpenTUI, Foldkit, Expo, and terminal hosts.
  - Compared strict Program-first and optimistic native Back policies with attempt-scoped timing, duplicate suppression, rollback metrics, and container-level reconciliation verified on iOS and Android simulators.
- **Files:**
  - `.lavish/portable-program-bombshells.html` — Preserve the architectural compression model and measured native navigation result.
  - `docs/adr/0003-navigation-as-state.md` — Record the client matrix and framework boundary decisions.
  - `examples/client-matrix/core/src/program.ts` — Define the renderer-independent matrix Program.
  - `examples/client-matrix/foldkit/src/view.ts` — Render state, routes, captures, and live client cells.
  - `examples/client-matrix/foldkit/public/captures/list/expo-ios.webp` — Preserve representative native client evidence.
  - `examples/counters/core/src/route.ts` — Parse the same portable navigation path from relative and host carriers.
  - `examples/counters/terminal/src/host.ts` — Run the shared Program through an interactive Effect Terminal client.
  - `examples/react-native-showcase/src/nativeNavigationComparison/nativeNavigationComparison.tsx` — Run and measure strict and optimistic native Back policies.
  - `examples/react-native-showcase/src/nativeNavigationComparison/navigationReconciliation.ts` — Keep native stack state aligned with the portable Program Model.
  - `knip.json` — Register new executable and test entry points for dead-code analysis.
  - `package.json` — Expose the client matrix development command.
  - `pnpm-lock.yaml` — Lock the native navigation and Expo-compatible dependencies.
- **User context (verbatim):**
  > Prototype the interaction, not only the architecture.
- **SpecStory:** unavailable — Codex desktop task; no verified durable SpecStory capture URI is available.

## July 27th, 2026 at 2:46:07 p.m. EDT — `410b78fa7f7d` feat(react-native-showcase): expose counter detail deletion

- **Implementation commit:** `410b78fa7f7dffd20562ad73af84027b899e8523`
- **Change:** Expose canonical Multiple Counters navigation and deletion in Expo
- **Details:**
  - Render list, counter detail, counter fact, and delete-confirmation destinations from the shared Program projection without client-owned domain state.
  - Project canonical child paths through browser history and native Linking, including Expo Go carrier normalization.
  - Keep Showcase and Multiple Counters tapes portable and distinct while labeling each replay scope explicitly.
- **Files:**
  - `examples/react-native-showcase/src/App.tsx` — Render canonical child destinations, forward typed actions, and reconcile portable paths across web and Expo native carriers.
  - `examples/react-native-showcase/README.md` — Document child navigation, deletion, deep-link normalization, and replay scope behavior.
  - `docs/adr/0003-navigation-as-state.md` — Record the adapter omission, corrected navigation seam, and open linked-replay design question.
- **User context (verbatim):**
  > I want to be able to navigate the choose a shared program, and then I want to be able to click into a counter and then delete that counter.
  > Also, why is replay navigation replay different?
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 2:00:49 p.m. EDT — `ad0e785a2316` feat(react-native-showcase): model scene navigation

- **Implementation commit:** `ad0e785a231638535dae9a03179e4d619ad2f3cf`
- **Change:** Model showcase scene navigation as a portable replayable Program.
- **Details:**
  - Added a Schema-backed navigation Model and factual tap and opened-path Messages shared by every renderer.
  - Added React and React Native bindings that expose domain-shaped Model, action, and replay hooks without renderer or Effect vocabulary in consuming screens.
  - Projected canonical relative scene, state, and replay paths through Expo Web history and native Linking while preserving independent child Program tapes.
  - Verified the landing-to-Counter transition, browser history, portable state and replay deep links, an iOS simulator interaction, and Web, iOS, and Android production exports.
- **Files:**
  - `examples/showcase/core/src/model.ts` — Own the renderer-neutral scene union.
  - `examples/showcase/core/src/message.ts` — Define factual scene and opened-path Messages.
  - `examples/showcase/core/src/route.ts` — Parse and print canonical relative scene paths.
  - `examples/showcase/react-bindings/src/showcase.tsx` — Expose renderer-neutral React bindings and replay controls.
  - `examples/react-native-showcase/src/App.tsx` — Adapt browser history and native Linking to the shared navigation Program.
  - `docs/adr/0003-navigation-as-state.md` — Record the Expo proof and remaining navigation-carrier seam.
- **User context (verbatim):**
  > we need to model that in our domain as uh counter button tapped and then navigate
  > that's a scene we need to figure out in our adapters
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 1:13:46 p.m. EDT — `608679bbe8b0` feat: integrate replayable universal clients

- **Implementation commit:** `608679bbe8b0e6beaa126e0d2fe6a5ebdfcd8be7`
- **Change:** Expose canonical replay paths across React clients and add one cross-platform Expo showcase.
- **Details:**
  - React consumers now receive stable inspection, seeking, stepping, branching, runtime-event, and canonical relative path capabilities from one domain-shaped replay hook.
  - Counter, Multiple Counters, Calculator, and Fact reuse their canonical Programs and React bindings in ordinary React applications and one Expo Web, iOS, and Android showcase.
  - Successful dependency selections are recorded at replay frames and restored before Effect Layers are acquired for a live branch.
  - The Expo build preserves Effect runtime getters through a spec-compliant object-spread transform; the ADR assigns that compatibility requirement to future Foldkit Expo integration.
- **Files:**
  - `packages/foldkit/src/runtime/replayController.ts` — Expose the engine-owned Program parser-printer from each replay controller.
  - `examples/shared/react-bindings/src/replayableReactProgram.tsx` — Expose domain-shaped replay hooks and canonical relative path promises.
  - `examples/react-native-showcase/src/App.tsx` — Run Counter, Multiple Counters, Calculator, and Fact through one Expo host.
  - `examples/react-native-showcase/src/platform.ts` — Compose two typed switchable dependency choices for Fact.
  - `examples/react-native-showcase/babel.config.js` — Preserve Effect runtime getters under Metro.
  - `docs/adr/0002-universal-program-replay.md` — Record React, dependency, and Expo integration decisions.
- **User context (verbatim):**
  > The React Native app is gonna be a showcase, because we're not gonna have one app for example.
  > And let's show it working with Expo Web and Expo on iOS and Android.
  > Let's add multiple switchable dependencies per client.
  > Making sure you're committing all these things as well.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 12:37:14 p.m. EDT — `e7c0dc63062a` feat: canonicalize replayable Program clients

- **Implementation commit:** `e7c0dc63062a478acc23b661624f0775ab51faf5`
- **Change:** Canonicalize replay inspection, branching, and typed React dependency selection.
- **Details:**
  - Scoped each live replay branch independently so inert inspection releases resources and a later branch acquires a fresh Layer.
  - Exposed an asynchronous React replay interface with typed routes, frame navigation, runtime events, and automatic branching from settled historical frames.
  - Added arbitrary typed dependency sets whose selections are recorded as frame-anchored runtime events and restored before replay branches acquire services.
- **Files:**
  - `packages/foldkit/src/runtime/replayController.ts` — Own branch lifecycle, inspection, and replay timeline semantics.
  - `examples/shared/react-bindings/src/replayableReactProgram.tsx` — Expose the canonical renderer-neutral React replay hook surface.
  - `examples/shared/react-bindings/src/dependencyChoice.ts` — Compose typed switchable dependency Layers and record causal selection events.
  - `docs/adr/0002-universal-program-replay.md` — Record the replay and dependency-selection decisions.
  - `.changeset/add-view-agnostic-runtime-prototype.md` — Describe the published Foldkit API changes.
- **User context (verbatim):**
  > We need to think about the semantics for how you actually engage in a replay, what it should look like, what the most ergonomic solution would be.
  > Let's add multiple switchable dependencies per client.
  > I think we want to track that in the replayability tape.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 12:04:03 p.m. EDT — `b4f1fdf67246` feat(foldkit): record replay runtime events

- **Implementation commit:** `b4f1fdf6724660bfa7fdf8ad455d6f8799c5b36d`
- **Change:** Add an engine-owned runtime-event timeline for replayable host facts that are not domain Messages.
- **Details:**
  - Runtime events are anchored to frames, encoded in portable tapes, surfaced by replay controllers, and observed without changing the Model.
  - Historical inspection remains inert, and branching retains only events that had occurred at the selected settled frame.
  - Dependency adapters can now record environment selections without adding platform concerns to update.
- **Files:**
  - `packages/foldkit/src/runtime/programRuntime.ts` — Expose the live runtime-event timeline and include its events in replay tapes.
  - `packages/foldkit/src/runtime/replayTape.ts` — Encode, decode, and branch frame-anchored runtime events with backward-compatible defaults.
  - `packages/foldkit/src/runtime/replayController.ts` — Publish runtime events in both live and inspecting controller snapshots.
  - `packages/foldkit/src/runtime/programRuntime.test.ts` — Prove runtime events do not become transitions and make asynchronous failure assertions deterministic.
  - `packages/foldkit/src/runtime/replayTape.test.ts` — Prove branch truncation keeps only events that occurred by the selected frame.
  - `docs/adr/0002-universal-program-replay.md` — Record why dependency selection is a runtime event rather than a Message.
- **User context (verbatim):**
  > but I think we want to track that in the replayability tape.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.

## July 27th, 2026 at 11:53:07 a.m. EDT — `f2b7fd5719dc` feat: harden universal Program clients

- **Implementation commit:** `f2b7fd5719dcaf46ffe13d8879206a2f161b391d`
- **Change:** Harden the renderer-independent Program runtime and prove scoped React ownership with a switchable Fact dependency.
- **Details:**
  - Program Resources now acquire during cancellable startup and preserve typed failures through the client lifecycle.
  - Replay validation and settled branching are shared by runtime entry points, while the TUI derives native shortcuts from the active Program action presentation.
  - React owns one scoped runtime through Strict Mode, server rendering stays inert, and the Fact client demonstrates host-selected Mock and Live Layers.
- **Files:**
  - `packages/foldkit/src/runtime/programRuntime.ts` — Acquire Resources eagerly inside the runtime scope and preserve typed startup failures.
  - `packages/foldkit/src/programRuntime/public.ts` — Expose renderer-independent runtime and replay APIs without browser dependencies.
  - `examples/shared/react-bindings/src/reactProgram.tsx` — Own asynchronous React startup, observation, cancellation, and ordered teardown.
  - `examples/shared/react-bindings/src/dependencyChoice.ts` — Prove one typed, scoped, host-switchable Effect dependency.
  - `examples/fact/react/src/App.tsx` — Exercise the canonical Fact Program through the React dependency choice.
  - `examples/replayability/tui/src/host.ts` — Derive TUI actions from shared Program presentation and handle terminal lifecycle cleanly.
  - `docs/adr/0002-universal-program-replay.md` — Record the client boundary and lifecycle decisions plus remaining promotion work.
  - `scripts/change-log/record_change.py` — Install deterministic intent-ledger recording for future increments.
- **User context (verbatim):**
  > Making sure you're committing all these things as well.
- **SpecStory:** unavailable — This task ran in the Codex desktop app, for which SpecStory does not document session capture.
