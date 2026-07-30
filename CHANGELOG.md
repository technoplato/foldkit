# Change Log

Newest entries appear first. Implementation commits and intent are recorded separately from ledger-only commits.

<!-- change-log:entries -->

## July 30th, 2026 at 1:19:59 p.m. EDT — `4300cb903b89` feat(react-native-showcase): enable Wallet development builds

- **Implementation commit:** `4300cb903b898f0d62498a472a52701e08ea2945`
- **Change:** Enable Expo Wallet development builds and compatible browser resources
- **Details:**
  - Updated Expo and React Native to their expected patch releases, added expo-dev-client, and removed the unused native Picker dependency after Wallet selectors moved to buttons.
  - Linked the existing Wallet web-client package into the showcase preparation graph so Expo web can use IndexedDB, Web Crypto, and browser clipboard resources instead of Expo SecureStore.
  - Preserved the dependency supply-chain gate with exact temporary release-age exclusions and verified the final lock with a frozen install.
- **Files:**
  - `examples/react-native-showcase/package.json` — Declares the development client, compatible Expo runtime, browser Wallet package, and deterministic prerequisite build order.
  - `pnpm-lock.yaml` — Locks the updated Expo and React Native graph while preserving the unrelated Issues React Native importer.
  - `pnpm-workspace.yaml` — Allows the exact newly released Expo toolchain versions through the repository minimum-release-age policy.
- **User context (verbatim):**
  > Let's also build a, um, Build the expo development client and get that working as well.
  > Also update Ava fix to use whatever you’ve just built here https://expodemo.knophy.com/showcase/wallet
- **SpecStory:** unavailable — No SpecStory URI is available because this Codex desktop task was not captured by SpecStory.

## July 30th, 2026 at 1:17:23 p.m. EDT — `89e14e1c3005` feat(foldkit): add audio processing and event migrations

- **Implementation commit:** `89e14e1c30050d4c72f99999b933211285e519ce`
- **Change:** Add provider-neutral audio processing and Program-owned event migrations
- **Details:**
  - Defined seven finite audio, speech, music, lyrics, sound, translation, and acoustic capability contracts over content-addressed shared or local artifacts.
  - Kept raw media, provider credentials, URLs, host errors, and provider payloads outside portable Messages by exposing only scoped artifact references and sanitized failure codes.
  - Added immutable adjacent-version event registries that preserve original wire provenance and return typed construction, decoding, version, migration, and Program-scope failures.
- **Files:**
  - `packages/foldkit/src/processor/audio.ts` — Defines provider-neutral capability IDs, authenticated-session artifact references, finite processing arguments, outcomes, and sanitized failures.
  - `packages/foldkit/src/processor/audio.test.ts` — Verifies capability identity, artifact immutability and scoping, finite pipeline Schemas, and failure sanitization.
  - `packages/foldkit/src/processor/public.ts` — Publishes the Processor Audio namespace.
  - `packages/foldkit/src/program/versionedEvent.ts` — Implements immutable Program-owned adjacent event migration registries and typed decoding failures.
  - `packages/foldkit/src/program/versionedEvent.test.ts` — Verifies historical upgrades, chain validation, Program ownership, failure provenance, and current decoding.
  - `packages/foldkit/src/program/program.ts` — Lets a renderer-free Program own its versioned event registry.
  - `packages/foldkit/src/program/public.ts` — Publishes the versioned event construction, decoding, and error surface.
  - `.changeset/add-versioned-audio-processing.md` — Records the new Foldkit minor API surface for release.
- **User context (verbatim):**
  > We also want things like transcription processing capabilities.
  > we also need to start thinking about schema message schema type migrations as our message schema evolves, we need to be able to handle previous versions of messages and new versions of processors
- **SpecStory:** unavailable — No SpecStory URI is available because this Codex desktop task was not captured by SpecStory.

## July 30th, 2026 at 1:11:26 p.m. EDT — `2e46ee5f31ce` chore(instant-counter): scaffold authenticated demo

- **Implementation commit:** `2e46ee5f31ced1d5733ab19f0c503ebcc6253537`
- **Change:** Scaffold the authenticated Instant counter workspace
- **Details:**
  - Added a buildable browser shell and explicit headless entry point for the shared Program demo.
  - Locked InstantDB core and server-only admin dependencies at 1.0.53 so the acceptance authority can stay outside public Clients.
  - Kept credential values out of Git and reserved the root lockfile as a sequential shared-checkout dependency lane.
- **Files:**
  - `examples/instant-counter/package.json` — Defines the private browser and headless demo package and its pinned Instant dependencies.
  - `examples/instant-counter/index.html` — Provides the browser entry document for the authenticated counter.
  - `examples/instant-counter/src/entry.ts` — Provides the initial browser module boundary.
  - `examples/instant-counter/src/headless/entry.ts` — Provides the explicit headless authority process boundary.
  - `examples/instant-counter/src/styles.css` — Provides the initial host shell styling.
  - `examples/instant-counter/tsconfig.json` — Constrains the example TypeScript build.
  - `examples/instant-counter/vite.config.ts` — Enables the required Foldkit Vite transform.
  - `pnpm-lock.yaml` — Locks the Instant counter importer and admin SDK dependency graph.
- **User context (verbatim):**
  > Let's authenticate with Google and authenticate with email.
  > Please explicitly release only `examples/react-native-showcase/package.json` and `pnpm-lock.yaml` to Wallet for one sequential dependency commit while you continue package-local code.
- **SpecStory:** unavailable — No SpecStory URI is available because this Codex desktop task was not captured by SpecStory.

## July 30th, 2026 at 12:51:47 p.m. EDT — `27165028d390` fix(instant-tools): accept legacy source documents

- **Implementation commit:** `27165028d390ad9c364b6e1a3b624a875a1f0846`
- **Change:** Accept legacy source documents without a location
- **Details:**
  - Fresh public Chrome reached current Instant data but issue #054 omitted the optional sourceDocument.location key. The TypeScript decoder now defaults that missing key to None, matching Swift decodeIfPresent behavior, with a focused regression.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Make the optional source-document location key decode-compatible when absent.
  - `packages/instant-tools/src/issues/domain.test.ts` — Prove legacy source documents without location decode successfully.
- **User context (verbatim):**
  > can you diagnose and fix
- **SpecStory:** unavailable — Codex desktop task; no durable SpecStory URI is available.

## July 30th, 2026 at 12:47:37 p.m. EDT — `cfffc135a2b0` style(foldkit): format effect protocol contracts

- **Implementation commit:** `cfffc135a2b037eef8cefce08205c79c8ecf086f`
- **Change:** Applied the repository formatter to the portable effect protocol checkpoint.
- **Details:**
  - Normalized only the four late Foldkit formatter deltas; no protocol behavior or tests changed.
- **Files:**
  - `packages/foldkit/src/command/effectManifest.ts` — Apply canonical line wrapping to result-range validation.
  - `packages/foldkit/src/command/effectManifest.test.ts` — Apply canonical line wrapping to result-permission assertions.
  - `packages/foldkit/src/processor/processor.ts` — Apply canonical line wrapping to effect-support validation.
  - `packages/foldkit/src/processor/processor.test.ts` — Apply canonical line wrapping to effect-support assertions.
- **User context (verbatim):**
  > So let's expand that effect manifest, please.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 12:46:31 p.m. EDT — `c07f7e7e2504` feat(foldkit): version portable effect protocols

- **Implementation commit:** `c07f7e7e2504bb875ab51095ab725cc56a2e43f7`
- **Change:** Versioned portable effect protocols and Processor effect support for schema-safe cross-device execution.
- **Details:**
  - Retained the version-one effect manifest while adding version-two permitted result event ranges so executors cannot return undeclared facts.
  - Separated Processor effect implementation ranges from capability placement versions and admitted historical Program and Message version zero envelopes for migration compatibility.
  - Verified 12 focused Processor and effect-manifest tests plus the Foldkit package typecheck.
- **Files:**
  - `.changeset/evolve-processor-effect-protocols.md` — Declare the non-breaking Foldkit protocol feature for release.
  - `packages/foldkit/src/command/effectManifest.ts` — Version effect manifests and constrain the factual events a manifested Command may return.
  - `packages/foldkit/src/command/effectManifest.test.ts` — Prove v1 compatibility, v2 result constraints, and invalid-range rejection.
  - `packages/foldkit/src/command/public.ts` — Expose the versioned effect contract through the public Command API.
  - `packages/foldkit/src/processor/processor.ts` — Advertise effect support ranges separately and decode historical version-zero Messages.
  - `packages/foldkit/src/processor/processor.test.ts` — Cover effect support matching, historical envelopes, and invalid ranges.
  - `packages/foldkit/src/processor/public.ts` — Expose effect support through the public Processor API.
- **User context (verbatim):**
  > So let's expand that effect manifest, please.
  > we also need to start thinking about schema message schema type migrations
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 12:42:22 p.m. EDT — `a334bbab37f8` fix(instant-tools): preserve evolving evidence labels

- **Implementation commit:** `a334bbab37f82ed6a6af9b6e7080a77629723466`
- **Change:** Made Issue success-evidence decoding forward-compatible across live schema evolution.
- **Details:**
  - Reproduced the clean 849987d2 public deployment rejecting the newly introduced Snapshot label after earlier Research and CodeReview additions.
  - Kept a typed known-label schema for first-class client semantics while decoding every non-empty wire label losslessly, so a new evidence kind cannot take down the complete Issue list.
  - Verified 23 instant-tools tests, instant-tools typecheck, eight Issue core tests, seven Issue React tests, React typecheck, formatting, and the production build.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Separate known evidence semantics from the forward-compatible non-empty wire label.
  - `packages/instant-tools/src/issues/domain.test.ts` — Prove Snapshot and arbitrary future labels decode while empty labels remain invalid.
- **User context (verbatim):**
  > why are you still active what was going on?
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 12:31:50 p.m. EDT — `8b58ccd0ff43` feat: improve Wallet usability and live refresh

- **Implementation commit:** `8b58ccd0ff43f9092c61d6e19fb714c83e9b77f6`
- **Change:** Checkpointed shared Wallet usability, explicit transfer readiness, live balance refresh, and cross-client local-vault discovery across the current web, native, Terminal, and OpenTUI hosts.
- **Details:**
  - Asset adapters now declare atomic-unit names and safe small test-transfer amounts, including wei for Ethereum, sats for Bitcoin, lamports for Solana, and MIST for Sui.
  - Confirmed funding, sends, and observed transactions trigger a balance-only portfolio refresh without discarding history, observation, or selection state.
  - Persistent local vault services refresh shared storage before reads and signing so running Mac clients can discover Wallets created through another client.
  - React, Foldkit, React Native, Terminal, and OpenTUI show per-account balances, explicit transfer readiness, button-based send rails, and faucet address-copy behavior.
  - WIP checkpoint blocker: the OpenTUI source typecheck passes and its unit tests pass, but the process quit integration test timed out at five seconds. QR rendering, Expo native builds, portable credential sync, and the full network/client matrix remain unverified.
- **Files:**
  - `examples/react-native-showcase/.gitignore` — Keeps generated native development-client projects out of source control.
  - `examples/react-native-showcase/app.json` — Defines stable native application identifiers for a later clean Expo development-client build.
  - `examples/react-native-showcase/package.json` — Adds explicit Expo development-client and native run commands without adding deferred dependencies.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Applies balances, rail buttons, test amounts, readiness, faucet copy behavior, and receiving payloads to React Native.
  - `examples/wallet/core/src/currency.ts` — Models adapter-owned atomic-unit metadata and suggested test-transfer quantities.
  - `examples/wallet/core/src/message.ts` — Adds explicit success and failure facts for background balance refreshes.
  - `examples/wallet/core/src/model.ts` — Tracks balance-refresh work as a typed Wallet operation.
  - `examples/wallet/core/src/presentation.ts` — Centralizes balance labels, test amounts, and typed transfer-preview readiness for every host.
  - `examples/wallet/core/src/update.test.ts` — Covers post-funding and observation refreshes, balance merging, and duplicate suppression.
  - `examples/wallet/core/src/update.ts` — Refreshes balance snapshots after confirmed Wallet activity while preserving the rest of the portfolio.
  - `examples/wallet/foldkit/src/scene.test.ts` — Exercises balance, rail, test-amount, readiness, receiving-payload, and dynamic selection behavior.
  - `examples/wallet/foldkit/src/view.ts` — Applies the shared Wallet usability and transfer-readiness contract to the Foldkit host.
  - `examples/wallet/live-client/src/catalog.ts` — Declares real-chain atomic-unit names and safe suggested test-transfer quantities.
  - `examples/wallet/local-vault/src/localWalletVault.test.ts` — Proves running vault and signer refresh plus stale-record removal for shared storage.
  - `examples/wallet/local-vault/src/localWalletVault.ts` — Replaces permanently cached storage with serialized, atomic registry refreshes.
  - `examples/wallet/node-client/src/index.ts` — Implements sanitized macOS clipboard writes through pbcopy for public Wallet addresses.
  - `examples/wallet/react/src/App.tsx` — Applies shared balances, rail buttons, readiness, faucet copy behavior, and receiving payloads to React.
  - `examples/wallet/react/src/styles.css` — Removes embossed styling and styles the new controls and receiving payload surfaces.
  - `examples/wallet/simulated-client/src/simulatedWallet.ts` — Mirrors chain atomic-unit and test-transfer metadata in the deterministic client.
  - `examples/wallet/terminal/src/host.ts` — Shows balance, activity, funding, observation, clipboard, and explicit transfer readiness in Terminal.
  - `examples/wallet/tui/src/host.test.ts` — Covers the newly exposed OpenTUI interactions and status summaries.
  - `examples/wallet/tui/src/host.tsx` — Adds direct mode and rail selectors, transfer inputs, balances, activity, funding, observation, and faucet copy behavior.
  - `examples/wallet/tui/src/presentation.ts` — Exposes small-test-amount interaction and visible Wallet status summaries to OpenTUI.
  - `package.json` — Adds root commands for starting and running the deferred Expo development client.
- **User context (verbatim):**
  > show the balance next to the wallet
  > turn the drop down for sending into buttons
  > Have the open faucet button copy the wallet's address?
  > The preview send button is grayed out
- **SpecStory:** unavailable — This work ran in Codex desktop, and no verified SpecStory capture or durable public URI is available for this GUI task.

## July 30th, 2026 at 12:12:00 p.m. EDT — `47d207abe621` feat: add shared Program Processors

- **Implementation commit:** `47d207abe6217423f8e26dd14f2b1b5abfe80904`
- **Change:** Implemented the first shared Program Processor and InstantDB synchronization slice.
- **Details:**
  - Added versioned Processor identity, capability placement, Message envelopes, and effect manifests with One cardinality.
  - Intercepted manifested Commands without executing or locally admitting their result Messages, while preserving existing local Command behavior.
  - Added durable InstantDB proposals, accepted occurrences, projection checkpoints, effect requests, ordered gap buffering, and an in-memory store.
  - Added an initialized attachment endpoint so long-lived headless Processors survive zero connected Clients.
- **Files:**
  - `packages/foldkit/src/processor/processor.ts` — Define portable Processor identity, capability, provenance, and deterministic placement contracts.
  - `packages/foldkit/src/runtime/programRuntime.ts` — Intercept manifested Commands and preserve accepted Message envelopes through the live runtime.
  - `packages/foldkit/src/runtime/programProcessorEndpoint.ts` — Expose one long-lived Processor to attached Clients without transferring lifecycle ownership.
  - `packages/instant/src/instantProgramStore/instantProgramStore.ts` — Persist and observe the durable InstantDB protocol through an Effect-native adapter.
  - `packages/instant/src/acceptedOccurrenceCursor/acceptedOccurrenceCursor.ts` — Deduplicate, validate, buffer, and emit accepted occurrences in contiguous order.
  - `docs/explorations/instantdb-shared-program-processors.md` — Record what the first implementation settles and what authentication, pairing, claiming, and lifecycle work remains.
- **User context (verbatim):**
  > Go ahead and build this out while I review the architecture, and I'll provide any feedback as I read through.
  > We wanna synchronize by sending messages, not by sharing snapshots of data
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 11:59:50 a.m. EDT — `d6584291baba` fix(instant-tools): decode code review evidence

- **Implementation commit:** `d6584291baba13a9819622d41d02cf771ceafd7b`
- **Change:** Decoded CodeReview success evidence in the shared Instant issue schema.
- **Details:**
  - Added CodeReview to the Effect Schema literal set after the clean deployed viewer exposed the exact live path successCriteria[5].requiredEvidence[1].
  - Added a focused regression test and verified instant-tools, Issue core, Issue React, typechecking, and the production build.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Keep the TypeScript wire decoder aligned with live Issue evidence.
  - `packages/instant-tools/src/issues/domain.test.ts` — Prove CodeReview round-trips through the typed Effect Schema.
- **User context (verbatim):**
  > can you diagnose and fix
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 11:42:26 a.m. EDT — `834642f9d1b8` fix(issues): recover stale viewer failures

- **Implementation commit:** `834642f9d1b883ad490bfcddd71b6e72ab7d8ad3`
- **Change:** Recovered out-of-date public Issue viewer tabs from live-schema decoder failures.
- **Details:**
  - Preserved the IssueTracker operation and underlying decoder cause instead of collapsing every failure to the opaque IssueTrackerError tag.
  - Added a browser-host Effect that performs one guarded automatic reload, refuses loops when session storage cannot record the attempt, and leaves an explicit latest-viewer reload action when the current deployment still fails.
  - Reproduced the supplied failure with the retained 21d1e171 deployment against current Instant data, while the c3982350 public deployment rendered the live list and #041 detail successfully.
- **Files:**
  - `examples/issues/core/src/program.test.ts` — Require collection and detail failures to preserve operation-specific decoder evidence.
  - `examples/issues/core/src/subscription.ts` — Format typed IssueTrackerError causes at the portable Program boundary.
  - `examples/issues/react/src/App.test.tsx` — Verify the diagnostic and manual reload remain visible.
  - `examples/issues/react/src/App.tsx` — Automatically recover one stale viewer attempt and render an actionable failure state.
  - `examples/issues/react/src/styles.css` — Present the failure and long decoder detail readably.
  - `examples/issues/react/src/viewerFailureRecovery.test.ts` — Prove reload, throttle, and storage-failure behavior.
  - `examples/issues/react/src/viewerFailureRecovery.ts` — Implement the guarded Effect-based browser recovery.
- **User context (verbatim):**
  > can you diagnose and fix
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 11:31:17 a.m. EDT — `76bffcc32c33` docs: clarify materialized projections

- **Implementation commit:** `76bffcc32c33b8bfebd2e160fae13f28bb4eff5c`
- **Change:** Keep materialized entity projections fast, offline, and disposable
- **Details:**
  - Defined projection versions, accepted Message positions, content digests, tail folding, explicit offline proposals, projector leases and fencing, rebuild rules, and the ban on direct domain writes to projection entities.
  - Updated the visual review surface so materialized checkpoints explicitly name their projection version and accepted Message position.
- **Files:**
  - `docs/explorations/instantdb-shared-program-processors.md` — Make shared materialized entities a performance projection over the Message journal rather than a second source of truth.
  - `.lavish/instantdb-program-processor-policies.html` — Expose the rebuildable projection checkpoint rule in the architecture review.
- **User context (verbatim):**
  > having snapshots of the different entities in our schema materialized would be nice and performant
- **SpecStory:** unavailable — This Codex desktop session has no verified SpecStory capture URI.

## July 30th, 2026 at 11:27:17 a.m. EDT — `c6fdb74d6b17` docs: define shared Program Processors

- **Implementation commit:** `c6fdb74d6b174f6d2938c222e175ba1d75d65bc6`
- **Change:** Define Client and Processor ownership for shared Programs
- **Details:**
  - Defined Client as the complete runnable adapter and Processor as one live Program occurrence across repository guidance, runtime skills, and Client Matrix contracts.
  - Recorded the InstantDB architecture exploration for Message-authoritative synchronization, disposable projection checkpoints, provenance envelopes, portable effect manifests, capability-driven placement, lifecycle leases, offline compatibility, authentication, pairing, and non-captive terminals.
  - Added a Foldkit-styled interactive review surface for the concrete placement policies and the first unresolved cardinality decision.
- **Files:**
  - `AGENTS.md` — Make Client and Processor first-class architecture terms for repository work.
  - `skills/foldkit-client-hosts/SKILL.md` — Define how Clients host or reach one or more Processors.
  - `skills/foldkit-program-runtimes/SKILL.md` — Name ProgramRuntime as the concrete API that realizes a Processor.
  - `skills/generate-client-matrix/SKILL.md` — Add Processor identity and capability to matrix generation.
  - `skills/generate-client-matrix/references/matrix-contract.md` — Extend the Client Matrix contract without collapsing renderer, host, platform, or Processor axes.
  - `examples/client-matrix/README.md` — Distinguish current captive one-shot Clients from proposed non-captive attachment.
  - `docs/explorations/instantdb-shared-program-processors.md` — Preserve the design vocabulary, Instant boundaries, policies, examples, migration rules, and next decisions.
  - `.lavish/instantdb-program-processor-policies.html` — Provide an interactive review surface for the architecture and cardinality decision.
- **User context (verbatim):**
  > one client can host multiple processes, a headless client can host processes without rendering a human interface.
  > We wanna synchronize by sending messages, not by sharing snapshots of data
- **SpecStory:** unavailable — This Codex desktop session has no verified SpecStory capture URI.

## July 30th, 2026 at 11:24:18 a.m. EDT — `b89625859e25` fix: use valid UUIDs for issue log links

- **Implementation commit:** `b89625859e25181bb68c3f721a3aa0c1ec405bb2`
- **Change:** Made Instant Issue-log link identities valid, deterministic RFC UUID-v5 values.
- **Details:**
  - Derived each link ID from the canonical instantToolsLogs/<logID>/issues/<issueID> name in the URL namespace so TypeScript and other clients can converge on one row.
  - Added two cross-client vectors, retry and distinct-pair assertions, and real Instant transaction schema validation.
  - Pinned the browser-exporting uuid package as a runtime dependency and verified all 21 package tests, typechecking, and the production build.
- **Files:**
  - `packages/instant-tools/src/instant/instant.ts` — Generate valid deterministic UUID-v5 entity IDs for Issue-log links.
  - `packages/instant-tools/src/instant/instant.test.ts` — Prove shared vectors, idempotency, pair distinction, and Instant transaction validation.
  - `packages/instant-tools/package.json` — Declare uuid as an intentional runtime dependency.
  - `pnpm-lock.yaml` — Lock uuid 14.0.1 for the instant-tools importer.
- **User context (verbatim):**
  > IDs must be valid UUIDs, deterministic/idempotent for same log+issue, distinct pairs, real transaction validation.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 11:06:50 a.m. EDT — `7bd2ebc5368a` fix: render live issue evidence in React

- **Implementation commit:** `7bd2ebc5368a2b15e84ffe88ae0e444af83b82f0`
- **Change:** Rendered live Issue evidence in the public React detail host from the shared typed Program state.
- **Details:**
  - Passed the shared IssueLogsState into the React detail destination without adding a host-owned fetch or transport rule.
  - Rendered issue references, ISO timestamps, log summaries, safe HTTPS viewer links, and contributing path relationship metadata.
  - Added accessible loading, failure, and empty states plus focused tests for #041-shaped evidence and unsafe viewer URLs.
  - Verified React tests, typecheck, production source build, shared core tests and typecheck, instant-tools tests and typecheck, and a credentialed 46-Issue live decode.
- **Files:**
  - `examples/issues/react/src/App.tsx` — Render shared live evidence/query state with safe links and accessible state handling.
  - `examples/issues/react/src/App.test.tsx` — Prove #041-shaped row metadata, empty-state rendering, and unsafe-link rejection.
  - `examples/issues/react/src/styles.css` — Present evidence queries and rows as readable, responsive detail content.
  - `examples/issues/react/package.json` — Add the focused Vitest test entrypoint for the React Issue host.
  - `pnpm-lock.yaml` — Lock the React Issue host Vitest development dependency.
- **User context (verbatim):**
  > the public React /issues/:id host must visibly render the live evidence/log rows already queried by the typed Issue Program, especially Issue #041.
  > Preserve the one-program/many-runtimes contract: render from the shared typed detail model/query result, do not create a React-only fetch/query or duplicate business logic.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 10:58:41 a.m. EDT — `339ae74e1f64` fix: decode live issue payloads

- **Implementation commit:** `339ae74e1f64f525efae7edb5bcc006205c99976`
- **Change:** Made Issue payload decoding match the live anonymous data contract so collection and detail subscriptions can render or report failures.
- **Details:**
  - Accepted the live Research success-evidence literal while retaining every existing typed value.
  - Defaulted omitted legacy optional attachment, Mention, and work-log metadata to None during decoding.
  - Added tests proving live compatibility and typed collection/detail failure delivery to visible program state.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Accept the live evidence vocabulary and decode omitted legacy optional metadata as None.
  - `packages/instant-tools/src/issues/domain.test.ts` — Lock the live Research value and nested legacy payload compatibility into focused Schema tests.
  - `examples/issues/core/src/program.test.ts` — Prove collection and detail observation failures reach visible Failure model states.
- **User context (verbatim):**
  > I strongly suspect `VerificationNeeded` remains unsupported even though `Planned` was added—verify, do not assume.
  > Add focused failing tests first for every live unsupported value and for collection/detail decode failure delivery; make the smallest source fix.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 10:31:39 a.m. EDT — `89b4350e26b5` chore(words): lock workspace dependencies

- **Implementation commit:** `89b4350e26b510aee13ee25e1a1600d6adefd866`
- **Change:** Record the Words workspace dependency resolutions
- **Details:**
  - Added only the examples/words importer with the exact runtime and development dependency specifiers from its committed package manifest.
  - Re-inspected the complete 28-line lockfile diff and confirmed it contains no package snapshot or unrelated workspace importer changes.
  - Validated all 120 workspace projects under Node v24.11.1 and pnpm 11.8.0 with a frozen lockfile-only no-scripts install; pnpm reported Already up to date.
- **Files:**
  - `pnpm-lock.yaml` — Make the Words example reproducible in frozen workspace installs without changing any existing dependency resolution.
- **User context (verbatim):**
  > Please take ownership of the remaining `pnpm-lock.yaml` diff as a necessary Words dependency-metadata follow-up.
- **SpecStory:** unavailable — This recovery follow-up was performed in Codex desktop; public SpecStory sharing was not authorized and no verified CLI capture URI is available. Source implementation session: /Users/laptop/.codex/sessions/2026/07/30/rollout-2026-07-30T07-30-25-019fb2ca-3b4c-70d2-97c1-4a28b6328c41.jsonl.

## July 30th, 2026 at 10:30:25 a.m. EDT — `6498f383167b` feat(words): add progressive transcript player

- **Implementation commit:** `6498f383167be4b6933094938f93e689c23f483a`
- **Change:** Add a typed progressive transcript and audio player example
- **Details:**
  - Added a renderer-independent Model, Message, and update core with typed loading and playback failures, canonical recording routes, stale-request rejection, seeking, jumps, scrubbing, and active-word projection.
  - Integrated same-origin version 1 data decoding, semantic validation, browser audio Commands and events, and scoped cleanup through Effect services and Foldkit Ports.
  - Exposed mountWordsExample as progressive enhancement that validates before replacing native fallback, preserves host metadata, copies a page CSP nonce, and bundles as dist/words.js.
  - Verified under Node v24.11.1 and pnpm 11.8.0 with Prettier, TypeScript, five test files and 22 tests, a Vite production build, a built-module export import, and diff integrity checks.
- **Files:**
  - `examples/words/package.json` — Define the private example package, pinned workspace dependencies, and verification scripts.
  - `examples/words/tsconfig.json` — Typecheck the Words source and build and test configuration against repository settings.
  - `examples/words/vite.config.ts` — Build the progressive-enhancement entry as dist/words.js with Foldkit branch identity.
  - `examples/words/vitest.config.ts` — Run focused tests in a browser-compatible happy-dom environment.
  - `examples/words/src/application.ts` — Construct the embedded Foldkit application with injected data and audio services.
  - `examples/words/src/audioPlayer.ts` — Model browser audio control and event observation behind typed Effect boundaries.
  - `examples/words/src/audioPlayer.test.ts` — Verify rejected playback and scoped event-listener cleanup.
  - `examples/words/src/dataClient.ts` — Decode and semantically validate route-local version 1 payloads.
  - `examples/words/src/dataClient.test.ts` — Verify valid, HTTP, invalid-schema, and route-mismatch data outcomes.
  - `examples/words/src/index.ts` — Expose the Words example modules through one barrel.
  - `examples/words/src/message.ts` — Define the complete typed Message and audio event vocabulary.
  - `examples/words/src/model.ts` — Define route, data, playback, failure, and transcript Model schemas.
  - `examples/words/src/program.ts` — Expose the portable Program and typed audio Port subscription.
  - `examples/words/src/public.ts` — Provide the validated progressive mount API with CSP nonce propagation and fallback preservation.
  - `examples/words/src/public.test.ts` — Verify valid mounting, nonce propagation, and strict invalid-payload fallback behavior.
  - `examples/words/src/route.ts` — Parse canonical recording and segment-range routes and build same-origin data paths.
  - `examples/words/src/route.test.ts` — Verify canonical route parsing, rejection, and data-path construction.
  - `examples/words/src/styles.ts` — Provide scoped accessible player and transcript presentation.
  - `examples/words/src/update.ts` — Implement pure loading and playback transitions plus typed Commands.
  - `examples/words/src/update.test.ts` — Verify loading, stale responses, playback, seeking, scrubbing, jumps, endings, and failures.
  - `examples/words/src/view.ts` — Render accessible controls, active words, statuses, and failures from the Model.
- **User context (verbatim):**
  > Independently rerun Words Prettier, typecheck, tests, build, import `examples/words/dist/words.js` and assert exported `mountWordsExample`
- **SpecStory:** unavailable — This recovery was performed in Codex desktop; public SpecStory sharing was not authorized and no verified CLI capture URI is available. Provenance session: /Users/laptop/.codex/sessions/2026/07/30/rollout-2026-07-30T07-30-25-019fb2ca-3b4c-70d2-97c1-4a28b6328c41.jsonl.

## July 30th, 2026 at 10:28:29 a.m. EDT — `18ef08300fa0` chore: pin repository Node version

- **Implementation commit:** `18ef08300fa0fa43d520688b5ccf4819fe2fbc2a`
- **Change:** Pin the repository Node selector to 22.14.0
- **Details:**
  - Added the FNM-compatible .node-version value that selects Node v22.14.0 and resolves the repository-pinned Corepack pnpm 11.8.0.
  - Re-verified the selected Node and pnpm versions independently before committing.
- **Files:**
  - `.node-version` — Select Node 22.14.0 when entering the repository so Corepack resolves pnpm 11.8.0.
- **User context (verbatim):**
  > Main already verified `.node-version` 22.14.0 -> Node v22.14.0/pnpm 11.8.0
- **SpecStory:** unavailable — This recovery was performed in Codex desktop; public SpecStory sharing was not authorized and no verified CLI capture URI is available. Provenance session: /Users/laptop/.codex/sessions/2026/07/29/rollout-2026-07-29T13-37-39-019faef4-14ba-77a3-980d-b91765825bde.jsonl.

## July 30th, 2026 at 10:04:53 a.m. EDT — `88b2219b6906` feat: complete multichain Wallet workflows

- **Implementation commit:** `88b2219b69064a216e5ad6dc1967063b53c3fc2b`
- **Change:** Completed the multichain Wallet workflow matrix through the generic Foldkit contract.
- **Details:**
  - Implemented 12 profile-backed Bitcoin, Ethereum, Solana, and Sui rails across Devnet, Testnet, and Live with adapter-owned funding, cursor history, observation, and signed submission.
  - Added encrypted IndexedDB, Expo SecureStore, and native macOS Keychain custody behind one Wallet vault boundary.
  - Updated React, Foldkit, React Native, CLI, Terminal, and OpenTUI presenters for dynamic Wallet, cryptocurrency, mode, receive, fund, history, preview, and send workflows.
  - Captured two-browser Sepolia and Sui transaction evidence and documented unavailable provider and Mainnet lanes without placeholder success.
- **Files:**
  - `examples/wallet/core/src/program.ts` — portable generic Wallet Program and service contract
  - `examples/wallet/live-client/src/catalog.ts` — 12 executable chain and network rails
  - `examples/wallet/local-vault/src/localWalletVault.ts` — chain-specific signing behind portable custody
  - `examples/wallet/react/src/App.tsx` — dynamic browser Wallet controls and workflows
  - `examples/wallet/foldkit/src/view.ts` — dynamic Foldkit Wallet controls and workflows
  - `examples/wallet/cli/src/host.ts` — one-shot funding, history, preview, and send commands
  - `examples/wallet/terminal/src/host.ts` — interactive terminal Wallet workflows
  - `examples/wallet/tui/src/host.tsx` — interactive OpenTUI Wallet workflows
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — native Wallet and cryptocurrency selection
  - `examples/wallet/VERIFICATION_MATRIX.md` — rail, modality, transaction, and image evidence
  - `docs/adr/0005-normalized-wallet-chain-adapters.md` — durable chain-neutral architecture and capability decisions
  - `pnpm-lock.yaml` — reproducible Wallet client, keyring, and picker dependencies
- **User context (verbatim):**
  > Audit the wallets screens and make them fully work for each cryptocurrency we support.
  > No placeholder data.
  > Make sure sending works too across all chains and network modes and modalities please and use the matrix skill to document images
- **SpecStory:** unavailable — Unavailable: this Codex desktop task has no verified SpecStory CLI capture URI.

## July 30th, 2026 at 8:16:08 a.m. EDT — `dc11ef570681` fix: decode live issue states safely

- **Implementation commit:** `dc11ef5706814700983fe2cb26623a034b04de97`
- **Change:** Keep realtime Issue observation live across evolved workflow states
- **Details:**
  - Accept the Planned state already persisted by the typed Instant tracker so one valid feature does not terminate the collection subscription.
  - Convert collection and detail payload decode failures into IssueTrackerError values, allowing the Program to render an explicit failure instead of remaining on Observing Issues.
  - Verified sixteen Instant Tools tests, seven Issue Program tests, and the Instant Tools typecheck.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Align the portable workflow status vocabulary with the live typed tracker.
  - `packages/instant-tools/src/issues/domain.test.ts` — Lock Planned decoding into the Issue domain contract.
  - `packages/instant-tools/src/instant/instant.ts` — Move observed payload decoding onto the typed Effect failure channel.
  - `packages/instant-tools/src/instant/instant.test.ts` — Prove malformed collection and detail payloads fail explicitly rather than defecting.
- **User context (verbatim):**
  > Just hangs loading
- **SpecStory:** unavailable — This work was performed in Codex desktop and no verified SpecStory CLI capture URI exists.

## July 30th, 2026 at 7:45:20 a.m. EDT — `aa2417af07b6` test(skills): verify independent Program runtimes

- **Implementation commit:** `aa2417af07b6da5ec921cb3115b0569b2fc8e053`
- **Change:** Align Foldkit skills with current APIs and prove one Program supports isolated runtimes
- **Details:**
  - Corrected Disclosure from stateful Submodel to stateless controlled render helper and replaced the nonexistent Layer.scoped recommendation with Layer.effect plus Effect.acquireRelease.
  - Added a simultaneous-runtime regression that proves independent Models, Ports, journals, replay tapes, scoped resources, and shutdown behavior from one Program definition.
- **Files:**
  - `packages/foldkit/src/runtime/programRuntime.test.ts` — verifies two live instances remain isolated and independently release resources.
  - `skills/foldkit/SKILL.md` — corrects the current UI component classification.
  - `skills/foldkit-dependencies/SKILL.md` — documents the pinned Effect scoped-Layer idiom.
- **User context (verbatim):**
  > We should have a subagent creating skills for foldkit though and especially for how to think about foldkit as one program with as many runtimes as we’d like
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture URI is available.

## July 30th, 2026 at 7:25:15 a.m. EDT — `5108dd1453fa` feat(issues): link realtime log evidence

- **Implementation commit:** `5108dd1453fa99a446a3c9ef712b7528f6ec05db`
- **Change:** Link typed issues to realtime log evidence in the Foldkit viewer
- **Details:**
  - Expanded the portable issue and logging contracts with deterministic viewer URLs, embedded evidence queries, immediate issue-reference inference, denormalized Instant log links, and ergonomic suspected/contributing/ruled-out paths.
  - Made the single Issue Tracker Program subscribe to a selected issue and its newest 200 server-filtered evidence rows, then render those rows across the Foldkit web runtime without moving domain behavior into the view.
  - Verified 14 instant-tools tests, 7 issue-program tests, viewer typechecking, and a production Vite build.
- **Files:**
  - `packages/instant-tools/src/instant/instant.ts` — Align Instant adapters with the realtime tracker schema and server-filtered evidence links.
  - `examples/issues/core/src/subscription.ts` — Model selected-issue and issue-log observation once in the portable Program.
  - `examples/issues/foldkit/src/view.ts` — Render embedded Instant evidence queries, live log rows, and contributing-path relationships.
- **User context (verbatim):**
  > evidence log instant queries in issues
  > issues #s should be tagged in logs
  > Paths that we think may be contributing to an issue should be marked as such ergonomically in our logging api
- **SpecStory:** unavailable — Unavailable: this work ran in Codex desktop and no verified SpecStory URI was produced.

## July 30th, 2026 at 6:45:51 a.m. EDT — `5882e58a7cac` feat(skills): teach one Program many runtime instances

- **Implementation commit:** `5882e58a7cac3925e65e14ad374f1aa9b4572b82`
- **Change:** Make one portable Foldkit Program reusable across any number of independent runtimes.
- **Details:**
  - Distinguished Program protocol identity from host-owned runtime identity and documented each runtime's independent Model, journal, replay tape, Commands, Ports, Subscriptions, ManagedResources, Layer Scope, diagnostics, and shutdown.
  - Defined multiple-instance host boundaries, explicit cross-runtime sharing through services, persistence, transports, or Ports, replay branching, and isolation evidence.
  - Routed the new companion from the Foldkit umbrella and client-host skills and registered plugin version 0.10.31.
- **Files:**
  - `.claude-plugin/marketplace.json` — Describe independent Program runtimes in marketplace discovery.
  - `.claude-plugin/plugin.json` — Register the runtime skill and bump the plugin version.
  - `skills/foldkit-client-hosts/SKILL.md` — Route multi-instance Client work to the runtime companion.
  - `skills/foldkit-program-runtimes/SKILL.md` — Document one-Program-many-runtimes architecture, lifecycle, sharing, and verification.
  - `skills/foldkit-program-runtimes/agents/openai.yaml` — Expose the runtime skill in supporting interfaces.
  - `skills/foldkit/SKILL.md` — Route Foldkit tasks to the new runtime companion.
- **User context (verbatim):**
  > We should have a subagent creating skills for foldkit though
  > especially for how to think about foldkit as one program with as many runtimes as we’d like
- **SpecStory:** unavailable — No durable SpecStory URI was available for this delegated Codex desktop task; public sharing was not authorized.

## July 30th, 2026 at 6:13:09 a.m. EDT — `80c1969ade21` feat(skills): add source-backed Foldkit companions

- **Implementation commit:** `80c1969ade21ff69dc15fde3e43988f4c9f63ee1`
- **Change:** Add a Foldkit-native Point-Free-inspired skill family
- **Details:**
  - Established that ts-pfw targets a separate @tca runtime and may inform organization but not Foldkit API guidance.
  - Added eight concise companion skills grounded in current Foldkit source, tests, and examples, plus UI metadata and plugin packaging at version 0.10.30.
  - Validated all nine Foldkit skills, ran deterministic alignment checks, and forward-tested real persistence, navigation, testing, and multi-client guidance.
- **Files:**
  - `.claude-plugin/plugin.json` — Publish the complete Foldkit skill family and bump the plugin version.
  - `skills/foldkit/SKILL.md` — Route Foldkit tasks to the correct native companion instead of ts-pfw APIs.
  - `skills/foldkit/agents/openai.yaml` — Expose the umbrella skill in supporting interfaces.
  - `skills/foldkit-composable-architecture/SKILL.md` — Document Program, update, Command, Submodel, and lifecycle composition.
  - `skills/foldkit-composable-architecture/agents/openai.yaml` — Expose composable-architecture guidance in supporting interfaces.
  - `skills/foldkit-schema-modeling/SKILL.md` — Document Effect Schema domain and protocol modeling.
  - `skills/foldkit-schema-modeling/agents/openai.yaml` — Expose Schema modeling guidance in supporting interfaces.
  - `skills/foldkit-dependencies/SKILL.md` — Document Effect Context and Layer dependency injection.
  - `skills/foldkit-dependencies/agents/openai.yaml` — Expose dependency guidance in supporting interfaces.
  - `skills/foldkit-sharing/SKILL.md` — Document explicit persistence and synchronization through Foldkit seams.
  - `skills/foldkit-sharing/agents/openai.yaml` — Expose sharing guidance in supporting interfaces.
  - `skills/foldkit-navigation/SKILL.md` — Document typed routes, Program routers, carriers, and route laws.
  - `skills/foldkit-navigation/agents/openai.yaml` — Expose navigation guidance in supporting interfaces.
  - `skills/foldkit-testing/SKILL.md` — Document update, Story, Scene, Layer, route, and replay testing.
  - `skills/foldkit-testing/agents/openai.yaml` — Expose testing guidance in supporting interfaces.
  - `skills/foldkit-view/SKILL.md` — Document pure accessible views and lifecycle boundaries.
  - `skills/foldkit-view/agents/openai.yaml` — Expose view guidance in supporting interfaces.
  - `skills/foldkit-client-hosts/SKILL.md` — Document portable Program and multi-client host boundaries.
  - `skills/foldkit-client-hosts/agents/openai.yaml` — Expose client-host guidance in supporting interfaces.
- **User context (verbatim):**
  > Does foldkit have skills? It should based on our examples and source be mirrored off of pfw skills.
  > Fire off subagent 5.6 xhi to build those skills
- **SpecStory:** unavailable — No durable SpecStory URI was available for this delegated Codex task; public sharing was not authorized.

## July 30th, 2026 at 1:46:01 a.m. EDT — `a923bd37062a` feat(issues): log release build provenance

- **Implementation commit:** `a923bd37062a0bd6acd7601ee9febb80da3a2c15`
- **Change:** Log immutable build provenance when the Issue Tracker web app and Mac listener start.
- **Details:**
  - Release builders can embed the clean commit, branch, build time, host, source root, and artifact location through environment values. Development runs remain explicit when provenance is unavailable.
- **Files:**
  - `examples/issues/react/src/buildProvenance.ts` — Logs the Vite-embedded release identity at startup.
  - `examples/issues/react/src/main.tsx` — Emits provenance before mounting the React application.
  - `examples/issues/listener/src/entry.ts` — Emits listener provenance before observing Scribe.
- **User context (verbatim):**
  > Go ahead and do those steps
- **SpecStory:** unavailable — Unavailable: this task is running in Codex desktop and no verified SpecStory CLI capture URI was produced.

## July 30th, 2026 at 1:44:48 a.m. EDT — `79e59b6e8954` feat(issues): add transcript triage listener

- **Implementation commit:** `79e59b6e89540c9182fb31775cebe333e82222a3`
- **Change:** Observe Scribe transcript segments as review-only Issue candidates across every host.
- **Details:**
  - The Program now observes triage candidates, exposes Promote and Dismiss Messages, and creates a canonical Issue only after promotion. The Mac listener follows the read-only Scribe primitive, ignores initial snapshots and partials, applies a conservative cue analyzer, persists exact shareable segment bounds, and never invokes Tuple. All clients project the observed triage state.
- **Files:**
  - `examples/issues/core/src/update.ts` — Review command creates recording-linked Issues only after explicit promotion.
  - `examples/issues/core/src/subscription.ts` — Observes the shared Instant triage collection.
  - `examples/issues/core/src/program.test.ts` — Proves candidates remain drafts until review and exposes state-valid actions.
  - `examples/issues/listener/src/analysis.ts` — Conservative deterministic analysis with exact segment bounds and protected share links.
  - `examples/issues/listener/src/listener.ts` — Follows new finalized Scribe projection events and saves drafts.
  - `examples/issues/listener/support/com.knophy.foldkit-issues-listener.plist` — Machine listener service definition.
  - `examples/issues/README.md` — Documents architecture, operation, Tuple inspiration, and first-release security weaknesses.
  - `examples/issues/react/src/App.tsx` — Interactive live triage review and anchored segment links.
- **User context (verbatim):**
  > I refer to tuple for inspiration not usage
  > This will help add to triage
  > We also need to add sharing of segments from a longer recording
- **SpecStory:** unavailable — Unavailable: this task is running in Codex desktop and no verified SpecStory CLI capture URI was produced.

## July 30th, 2026 at 1:37:56 a.m. EDT — `9f6385cba98d` feat(instant-tools): persist transcript triage drafts

- **Implementation commit:** `9f6385cba98d1cbea44cb7337cfbe41bc348bb6b`
- **Change:** Persist first-class recording segments and transcript triage drafts in the shared Instant app.
- **Details:**
  - RecordingSegment carries exact bounds, transcript text, and an optional share URL. TriageCandidate snapshots its Application or Library domain and remains Draft, Dismissed, or Promoted. The Instant adapter observes and saves both through a dedicated TriageInbox service, with lossless envelope tests.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Defines shareable RecordingSegment and review-gated TriageCandidate values.
  - `packages/instant-tools/src/issues/triageInbox.ts` — Defines the injected observe and persistence capability.
  - `packages/instant-tools/src/instant/instant.ts` — Adds Instant entities, envelopes, live observation, persistence, and Layer composition.
  - `packages/instant-tools/src/instant/instant.test.ts` — Proves lossless candidate and segment persistence and observation.
- **User context (verbatim):**
  > We also need to add sharing of segments from a longer recording
  > Single instant app is fine for now
- **SpecStory:** unavailable — Unavailable: this task is running in Codex desktop and no verified SpecStory CLI capture URI was produced.

## July 30th, 2026 at 1:36:27 a.m. EDT — `886426c8f5c7` feat(issues): add CLI TUI native and Foldkit hosts

- **Implementation commit:** `886426c8f5c76caaef7bba0d878dbb862e735a12`
- **Change:** Add the Issue Tracker CLI, OpenTUI, Foldkit HTML, and React Native clients.
- **Details:**
  - All four hosts execute or project the same Issue Tracker Program. The CLI waits for subscription snapshots before resolving state-dependent tokens, OpenTUI exposes valid Messages and replay, Foldkit HTML observes the configured Instant app and reconciles URLs, and React Native reconciles typed Program navigation with a real native stack.
- **Files:**
  - `examples/issues/cli/src/host.ts` — Renderer-free one-shot Program execution with explicit observation settlement.
  - `examples/issues/cli/src/host.test.ts` — Proves issue observation, route opening, and valid interaction tokens.
  - `examples/issues/opentui/src/host.tsx` — OpenTUI React terminal projection and replay controls.
  - `examples/issues/foldkit/src/view.ts` — Foldkit HTML list, detail, filing, and triage projection.
  - `examples/issues/foldkit/src/entry.ts` — Live Instant selection plus two-way URL reconciliation.
  - `examples/issues/react-native/src/App.tsx` — Expo surface with native stack reconciliation and functional filing controls.
  - `examples/issues/react-native/src/navigationReconciliation.test.ts` — Proves Program-to-native push and pop decisions.
  - `pnpm-lock.yaml` — Registers all new client workspaces reproducibly.
- **User context (verbatim):**
  > Build surfaces in react cli tui react native and foldkit just like every other example
  > Go ahead and do those steps
- **SpecStory:** unavailable — Unavailable: this task is running in Codex desktop and no verified SpecStory CLI capture URI was produced.

## July 30th, 2026 at 1:29:37 a.m. EDT — `a17359e73a29` feat(issues): add React host and history carrier

- **Implementation commit:** `a17359e73a296124b9b1caccf823fdfb38956a4c`
- **Change:** Add the reusable browser navigation carrier and live React Issue Tracker host.
- **Details:**
  - The shared React bindings now reconcile typed Program navigation with browser history in both directions, including replay-safe replacement. The Issue Tracker React client projects the same host-neutral destinations, observes Instant when configured, and renders list, detail, filing, and triage surfaces without host-owned business state.
- **Files:**
  - `examples/shared/react-bindings/src/programNavigationHistory.ts` — Reusable two-way typed Program to browser-history carrier.
  - `examples/shared/react-bindings/src/programNavigationHistory.test.tsx` — Proves push and replay-safe replace behavior.
  - `examples/issues/react-bindings/src/issues.ts` — Stable React actions and client factory over the shared Issue Tracker Program.
  - `examples/issues/react/src/App.tsx` — Browser surface for typed list, detail, filing, and triage destinations.
  - `examples/issues/react/src/client.ts` — Selects live Instant or deterministic resources.
  - `pnpm-lock.yaml` — Registers the new workspace packages and dependencies reproducibly.
- **User context (verbatim):**
  > Build surfaces in react cli tui react native and foldkit just like every other example
  > Go ahead and do those steps
- **SpecStory:** unavailable — Unavailable: this task is running in Codex desktop and no verified SpecStory CLI capture URI was produced.

## July 30th, 2026 at 1:25:07 a.m. EDT — `11d08d2962e1` feat(issues): model the live tracker program

- **Implementation commit:** `11d08d2962e1287bcc8b0556bb10d07f3264b929`
- **Change:** Model the live Issue Tracker as one renderer-independent Foldkit Program with typed navigation and first-class filing.
- **Details:**
  - Added mutually exclusive list, detail, filing, and triage destinations; live collection, catalog, and selected-Issue Subscriptions; controlled save identity; canonical routes; host-neutral destinations and interactions; deterministic resources; and focused tests.
- **Files:**
  - `examples/issues/core/src/model.ts` — Defines the typed navigation, remote observation, and filing state machines.
  - `examples/issues/core/src/subscription.ts` — Owns live Issue, Product, and individual-Issue streams.
  - `examples/issues/core/src/update.ts` — Applies filing and navigation Messages and emits the save Command.
  - `examples/issues/core/src/route.ts` — Defines canonical portable route parser-printers.
  - `examples/issues/core/src/presentation.ts` — Projects one host-neutral destination and interaction set.
  - `examples/issues/core/src/program.test.ts` — Proves route, navigation, observation, and filing behavior.
  - `examples/issues/README.md` — Documents the Client matrix and CF-only security limitation.
- **User context (verbatim):**
  > Your plan for our program and first class entities looks great
  > Go ahead and do those steps
- **SpecStory:** unavailable — SpecStory URI unavailable because this Codex desktop task was not captured by SpecStory.

## July 30th, 2026 at 1:20:54 a.m. EDT — `d1b3d9860553` feat(instant-tools): observe issues and filing domains

- **Implementation commit:** `d1b3d986055301e4c261748dd77bdd94f7a6e843`
- **Change:** Observe Issue collections and individual Issues while cataloging Applications and Libraries as first-class filing domains.
- **Details:**
  - Added scoped Instant subscribeQuery streams, a dedicated single-Issue query, the ProductCatalog Effect service, Instant product entities and envelopes, tests, and package guidance.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Defines catalog entries around the existing tagged Application and Library domain.
  - `packages/instant-tools/src/issues/issueTracker.ts` — Exposes collection and detail observation as transport-neutral Effect Streams.
  - `packages/instant-tools/src/issues/productCatalog.ts` — Defines the controlled ProductCatalog dependency.
  - `packages/instant-tools/src/instant/instant.ts` — Implements scoped Instant subscriptions and product persistence.
  - `packages/instant-tools/src/instant/instant.test.ts` — Proves live collection, detail, and product behavior.
  - `packages/instant-tools/README.md` — Documents the live APIs and filing catalog.
- **User context (verbatim):**
  > Single instant app is fine for now
  > make sure we have applications/libraries as domains to file against
- **SpecStory:** unavailable — SpecStory URI unavailable because this Codex desktop task was not captured by SpecStory.

## July 30th, 2026 at 12:01:38 a.m. EDT — `ab785b7a79f8` feat: add typed issue success criteria

- **Implementation commit:** `ab785b7a79f8f1e9423b5c44cdeb2074713c5b51`
- **Change:** Add portable issue success criteria to Foldkit Instant Tools
- **Details:**
  - Added stable criterion IDs, user-visible outcomes, and a shared evidence-kind vocabulary to the transport-neutral Effect Schema.
  - Defaulted missing encoded and constructed criteria to an empty array so older Instant payloads and existing callers remain compatible.
  - Verified the portable domain and Instant payload with nine tests plus the package typecheck.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Define the typed success-criterion schema and legacy-safe default.
  - `packages/instant-tools/src/issues/domain.test.ts` — Prove the encoded criterion shape and missing-field compatibility.
  - `packages/instant-tools/src/instant/instant.test.ts` — Prove criteria survive the lossless Instant payload adapter.
  - `packages/instant-tools/README.md` — Show one host-neutral issue with typed success criteria.
  - `.changeset/add-instant-tools.md` — Include typed criteria in the pending package release note.
- **User context (verbatim):**
  > make sure we add success criteria to the issues
  > Swift and TypeScript, tools share. Awesome.
- **SpecStory:** unavailable — Unavailable: this work ran in Codex desktop, and public SpecStory sharing was not authorized.

## July 29th, 2026 at 10:45:13 p.m. EDT — `364d81f08dbd` feat(instant-tools): add portable issue attachments

- **Implementation commit:** `364d81f08dbd7c94e7dda269b0a89b46d1bd267f`
- **Change:** Added cross-language issue attachments to Instant Tools
- **Details:**
  - Defined tagged attachment sources and media metadata in the portable Effect Schema, embedded attachments in issue payloads, added matching queryable Instant envelope fields, and verified round-trip persistence.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Added portable attachment kinds, tagged sources, and Issue attachments.
  - `packages/instant-tools/src/issues/domain.test.ts` — Verified screenshot attachment encoding and round-trip behavior.
  - `packages/instant-tools/src/instant/instant.ts` — Persisted attachment counts and IDs in the Instant issue envelope.
  - `packages/instant-tools/src/instant/instant.test.ts` — Verified lossless attachment persistence.
  - `packages/instant-tools/README.md` — Documented attachments and the shared machine credential boundary.
  - `.changeset/add-instant-tools.md` — Included attachments in the pending public package release note.
- **User context (verbatim):**
  > any screenshots attached relevant to the user’s complaints should be attached to the issue as well.
  > They should be the same schema.
- **SpecStory:** unavailable — SpecStory URI unavailable: this task ran in Codex desktop and no verified CLI capture exists.

## July 29th, 2026 at 8:08:05 p.m. EDT — `3cf2da44fcdc` feat: add portable Instant Tools package

- **Implementation commit:** `3cf2da44fcdcf2b3993e4271b74d9d5911fbbbbb`
- **Change:** Added portable Effect logging and issue tracking with a composable InstantDB adapter
- **Details:**
  - Created separate algebraic Issue and Log Event domains, injected Effect services, idempotent one-step repeat-mention escalation, exact recording evidence, composable InstantDB entity definitions, and host-owned credential boundaries.
- **Files:**
  - `packages/instant-tools/src/issues/domain.ts` — Modeled priorities, products, polymorphic evidence, mentions, work logs, and escalation
  - `packages/instant-tools/src/issues/issueTracker.ts` — Defined the injected portable Issue store capability
  - `packages/instant-tools/src/logging/domain.ts` — Modeled structured logs, levels, direct quotes, and source locations
  - `packages/instant-tools/src/logging/logger.ts` — Defined the injected portable Logger capability
  - `packages/instant-tools/src/instant/instant.ts` — Added composable InstantDB entities and service adapters
  - `packages/instant-tools/src/instant/instant.test.ts` — Verified persistence, filtering, logging, and host schema composition
  - `packages/instant-tools/README.md` — Documented host-owned initialization and portable use
  - `packages/instant-tools/package.json` — Declared the new public package
  - `pnpm-lock.yaml` — Pinned the InstantDB package graph
  - `.changeset/add-instant-tools.md` — Recorded the public package addition
- **User context (verbatim):**
  > We should work in Swift and TypeScript.
  > separate modules, which should be in the same library.
- **SpecStory:** unavailable — SpecStory URI unavailable: this task ran in Codex desktop and no verified CLI capture exists.

## July 28th, 2026 at 6:29:45 p.m. EDT — `a9a83ae981f0` fix(wallet): wrap native Wallet headings

- **Implementation commit:** `a9a83ae981f085951c6c1284f48cfcc0b0cbea9d`
- **Change:** Keep native Wallet heading actions inside narrow screens
- **Details:**
  - Allowed shared native Wallet heading rows to wrap after simulator verification found the Create wallet action clipped beyond the iPhone 17 Pro viewport.
- **Files:**
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Wrapped narrow heading rows so Wallet actions remain visible and tappable.
- **User context (verbatim):**
  > every time I refresh the page, it's just gonna go away
- **SpecStory:** unavailable — Codex desktop task; no durable SpecStory URI is available.

## July 28th, 2026 at 6:21:06 p.m. EDT — `3f5256b0c481` fix(wallet): access Vite source setting safely

- **Implementation commit:** `3f5256b0c481569754d7ab86c0b748f0904de901`
- **Change:** Keep production Wallet source selection compatible with strict Vite typing
- **Details:**
  - Changed both web hosts to indexed Vite environment access after the clean production build rejected property access through the environment index signature.
- **Files:**
  - `examples/wallet/react/src/App.tsx` — Read the configured Wallet data source through strict indexed environment access.
  - `examples/wallet/foldkit/src/entry.ts` — Applied the same strict environment access in the Foldkit host.
- **User context (verbatim):**
  > one source of truth for the screen
- **SpecStory:** unavailable — Codex desktop task; no durable SpecStory URI is available.

## July 28th, 2026 at 6:17:09 p.m. EDT — `9da38466ee5e` feat(wallet)!: persist local custody and separate data sources

- **Implementation commit:** `9da38466ee5eb9cb7efd0a75b8deec89aea55f8a`
- **Change:** Persist created wallets securely and make portfolio data provenance explicit
- **Details:**
  - Added chain-agnostic Wallet profile restoration state and commands so every host boots from persisted custody before enabling creation.
  - Added encrypted IndexedDB storage for browser Wallets and Expo SecureStore-backed storage for native Wallets, with restoration and failure tests.
  - Separated Fixture and Testnet resource graphs so each screen renders one PortfolioSnapshot source without mixing invented balances into created Wallets.
- **Files:**
  - `examples/wallet/core/src/walletVault.ts` — Extended the injected custody contract with profile restoration.
  - `examples/wallet/core/src/update.ts` — Modeled wallet restoration, retry, creation gating, and failures in the portable Program.
  - `examples/wallet/local-vault/src/localWalletVault.ts` — Persisted private key records and reconstructed public profiles from stored key material.
  - `examples/wallet/web-client/src/webWalletVault.ts` — Encrypted browser vault records with an origin-local non-extractable AES-GCM key.
  - `examples/wallet/web-client/src/webWalletResources.ts` — Selected one complete Fixture or Testnet resource graph for each screen.
  - `examples/react-native-showcase/src/wallet/walletVault.ts` — Adapted native custody persistence to Expo SecureStore.
  - `examples/wallet/react/src/App.tsx` — Rendered restoration state and explicit portfolio provenance in the React host.
  - `examples/wallet/foldkit/src/view.ts` — Rendered the same restoration state and portfolio provenance in the Foldkit host.
  - `examples/wallet/README.md` — Documented persistence guarantees, limitations, and source-of-truth semantics.
- **User context (verbatim):**
  > we don't persist the wallet yet
  > one source of truth for the screen
- **SpecStory:** unavailable — Codex desktop task; no durable SpecStory URI is available.

## July 28th, 2026 at 1:05:54 p.m. EDT — `51f6c41984bb` fix(wallet): log web build provenance

- **Implementation commit:** `51f6c41984bb0067fa23f668d8592fedc1557278`
- **Change:** Logged the exact clean-source identity embedded in the public React and Foldkit Wallet bundles.
- **Details:**
  - Both web hosts now print one build-provenance line before starting their Wallet Program.
  - Development builds explicitly report that provenance is unavailable instead of implying a reproducible artifact.
- **Files:**
  - `examples/wallet/react/src/buildProvenance.ts` — read and log the provenance embedded by the React production build
  - `examples/wallet/react/src/main.tsx` — log provenance before starting the React Wallet host
  - `examples/wallet/foldkit/src/buildProvenance.ts` — read and log the provenance embedded by the Foldkit production build
  - `examples/wallet/foldkit/src/entry.ts` — log provenance before starting the Foldkit Wallet host
- **User context (verbatim):**
  > And again, we want them on the WAN, not LAN.
- **SpecStory:** unavailable — No SpecStory URI is available because this work was performed in Codex desktop and no Codex CLI capture sync evidence exists.

## July 28th, 2026 at 12:59:57 p.m. EDT — `db033a763dd1` feat(wallet): add multichain send selection

- **Implementation commit:** `db033a763dd1e26f4fee1d45578b6c67299206dd`
- **Change:** Send from every simulated Wallet network rail and read deep-link properties back through the CLI.
- **Details:**
  - Mode changes now preserve the selected chain while switching all Wallet accounts between Devnet and Testnet.
  - Bitcoin, Ethereum, Solana, and Sui each expose deterministic native-asset validation, preview, submission, observation, balance, receive, and history behavior in both modes.
  - React, React Native, Foldkit, raw CLI, Terminal, OpenTUI, and the client matrix consume the same exact source selection and portable intent codec.
  - The visual hosts preserve their browser or Expo clipboard Layers while using the deterministic eight-rail Wallet resources.
  - Focused host tests execute all eight deep links, submit their transfers, observe the resulting transactions, and assert every source and destination property printed by the CLI.
- **Files:**
  - `examples/wallet/core/src/sendNetworkSelection.ts` — define the exact mode, chain, network, account, and asset send source
  - `examples/wallet/core/src/update.ts` — apply global mode changes, source selection, and portable send intents
  - `examples/wallet/simulated-client/src/simulatedWallet.ts` — provide deterministic resources for four chains across eight rails with host-selected vault and clipboard Layers
  - `examples/wallet/react/src/App.tsx` — render Cardboard network selection in the React host
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — render the same shared selection in React Native
  - `examples/wallet/foldkit/src/view.ts` — render the same selection in the Foldkit host
  - `examples/wallet/cli/src/host.ts` — execute deep-link sends and print every settled property
  - `examples/wallet/terminal/src/host.ts` — accept intents and cycle network rails in the terminal client
  - `examples/wallet/tui/src/host.tsx` — accept intents and cycle network rails in OpenTUI
  - `examples/client-matrix/core/src/walletIntent.ts` — document all eight implemented host-neutral send intents
  - `pnpm-lock.yaml` — synchronize visual host dependencies with simulated Wallet resources
- **User context (verbatim):**
  > I want it to sending SUI, Bitcoin, etc.
  > And in the full test, I want you to read the stuff back from the CLI after performing the operation with the deep link on the, on each property.
- **SpecStory:** unavailable — No SpecStory URI is available because this work was performed in Codex desktop and no Codex CLI capture sync evidence exists.

## July 28th, 2026 at 12:36:34 p.m. EDT — `d43ed2b4bcc9` fix(wallet): copy displayed preview addresses

- **Implementation commit:** `d43ed2b4bcc9dc661e962b8d671518f906c7b23a`
- **Change:** Made transfer-preview copy controls write the exact canonical address displayed to the user.
- **Details:**
  - WAN interaction captured the preview clipboard argument and showed that the valid adapter-normalized lowercase Ethereum address differed from the checksummed display address.
  - React, Foldkit, and React Native now copy displayAddress from the same preview field they render, while validation and transaction execution continue to use normalizedAddress internally.
- **Files:**
  - `examples/wallet/react/src/App.tsx` — Copies the full displayed recipient value from the React transfer preview.
  - `examples/wallet/foldkit/src/view.ts` — Copies the same displayed recipient value from the Foldkit transfer preview.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Keeps the native preview copy value identical to its visible address.
- **User context (verbatim):**
  > copy behavior for the addresses and handle all the copy flows
  > as well as in the React and FoldKit.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 12:29:35 p.m. EDT — `1869bebf9949` feat(wallet)!: add portable address copy flows

- **Implementation commit:** `1869bebf99496d2b794725a22cc31060d037df3b`
- **Change:** Added portable, failure-aware address copying across every visual Wallet client.
- **Details:**
  - Modeled clipboard requests, in-flight work, success, denial, unavailability, failure, stale completion, and restore behavior in the renderer-neutral Wallet Program.
  - Provided an Effect browser Clipboard adapter and an Expo clipboard adapter without adding chain-specific logic or permission preflight to core.
  - Added accessible copy controls and selectable manual fallbacks for created wallet accounts, the primary account, transfer previews, account details, and receiving addresses in React, Foldkit, and React Native.
  - Advanced the shared Program and client matrix to wallet@7 and verified every Wallet package plus browser failure normalization, shared React actions, Expo typechecking, lint, dead-code checks, and repository formatting.
- **Files:**
  - `examples/wallet/core/src/clipboard.ts` — Defines chain-neutral clipboard request, state, error, service, and unavailable host Layer.
  - `examples/wallet/core/src/update.ts` — Runs CopyToClipboard and applies matching success or sanitized failure Messages without replaying user-activation work on restore.
  - `examples/wallet/web-client/src/webClipboard.ts` — Adapts the Effect browser Clipboard service and normalizes denied, unavailable, and failed writes.
  - `examples/react-native-showcase/src/wallet/walletClipboard.ts` — Adapts expo-clipboard for native Wallet hosts.
  - `examples/wallet/react/src/App.tsx` — Adds address copy controls and feedback to every React Wallet address surface.
  - `examples/wallet/foldkit/src/view.ts` — Adds the same Program-driven copy controls through ordinary Foldkit HTML.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Adds native address copy controls, status, retry feedback, and selectable fallbacks.
  - `examples/client-matrix/core/src/wallet.ts` — Advances exact Wallet route examples to the version 7 Program contract.
- **User context (verbatim):**
  > Add copy button for add, copy behavior for the addresses and handle all the copy flows
  > both permissions if they exist, maybe even on native
  > as well as in the React and FoldKit.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 12:05:18 p.m. EDT — `fafce2244108` fix(wallet): fit balances to Cardboard panels

- **Implementation commit:** `fafce2244108e3802c8d480c9cc6305a1442675b`
- **Change:** Kept long testnet balances legible inside the shared Cardboard wallet panels.
- **Details:**
  - Computer Use exposed overlapping balance lines in the narrow React and Foldkit WAN clients after the functional wallet flows passed.
  - The balance now scales from its containing panel with a viewport fallback and remains on one line.
- **Files:**
  - `examples/wallet/react/src/styles.css` — Provides the shared responsive balance typography consumed by React and Foldkit.
- **User context (verbatim):**
  > Test those a little bit more comprehensively and use them, uh, with computer use. They aren't working at all.
  > And again, we want them on the WAN, not LAN.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 11:58:05 a.m. EDT — `18298959af0b` feat(wallet): create portable multichain wallets

- **Implementation commit:** `18298959af0be9dea8d6d893f64113841044fede`
- **Change:** Created and integrated portable Bitcoin, Ethereum, Solana, and Sui wallets for the normalized Wallet Program and every supported client.
- **Details:**
  - Modeled wallet creation as finite Schema state with stale-completion protection and one Devnet/Testnet selection projected across every created wallet and chain.
  - Generated real standard public addresses behind a session-only local vault while keeping private key material out of the Model, Messages, routes, and replay frames.
  - Advanced the canonical Program to wallet@6, normalized intent examples and Expo presentation, and preserved transaction history, recipient validation, and explorer-confirmation behavior.
  - Verified the public Cloudflare failure with Computer Use and identified stale browser and server processes as the WAN schema-skew cause before deployment.
- **Files:**
  - `examples/wallet/core/src/walletProfile.ts` — Defines four-chain wallet profiles, Bitcoin address variants, creation state, and global network projection.
  - `examples/wallet/core/src/update.ts` — Runs finite wallet creation alongside normalized transfer and transaction-history Commands.
  - `examples/wallet/local-vault/src/localWalletVault.ts` — Generates and retains Bitcoin, Ethereum, Solana, and Sui key material behind WalletVault.
  - `examples/wallet/react/src/App.tsx` — Renders the Cardboard wallet home, creation control, and global network selector in React.
  - `examples/wallet/foldkit/src/view.ts` — Renders the same canonical wallet state through Foldkit HTML.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Adapts normalized wallet creation, transfers, validation, confirmations, and history to Expo and React Native.
  - `examples/wallet/cli/src/host.ts` — Adds scripted wallet creation and network selection to the raw CLI.
  - `examples/wallet/terminal/src/host.ts` — Adds interactive creation and global network switching to Effect Terminal.
  - `examples/wallet/tui/src/host.tsx` — Adds the same interactions and wallet summaries to OpenTUI.
  - `examples/client-matrix/core/src/walletIntent.ts` — Updates exact matrix examples to the normalized account and asset intent route.
- **User context (verbatim):**
  > We'll just do creating a wallet for now
  > use cardboard for design
  > Test those a little bit more comprehensively and use them, uh, with computer use. They aren't working at all.
  > And again, we want them on the WAN, not LAN.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 11:48:09 a.m. EDT — `da044320bed4` build(testnet-server): embed server provenance

- **Implementation commit:** `da044320bed4d3d54dc3c9fcc6c07868f42b5646`
- **Change:** Made the wallet testnet server produce and log an embedded clean-source build identity before public deployment.
- **Details:**
  - The release build now generates provenance directly into the ignored server artifact directory before TypeScript compilation.
  - Server startup reads the packaged provenance resource and logs it through Effect before opening the public listener.
- **Files:**
  - `examples/wallet/testnet-server/scripts/build-with-provenance.mjs` — Generates clean Git metadata and compiles the deployable Node server artifact.
  - `examples/wallet/testnet-server/src/buildProvenance.ts` — Loads and logs the provenance resource packaged beside the compiled server entry point.
  - `examples/wallet/testnet-server/src/entry.ts` — Requires the provenance log to complete before launching the wallet server Layer.
  - `examples/wallet/testnet-server/package.json` — Routes release builds through the provenance-aware build script.
- **User context (verbatim):**
  > Okay, so we better do that.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 11:39:28 a.m. EDT — `b089275911ea` refactor(wallet)!: normalize chain adapters

- **Implementation commit:** `b089275911ea800e378e485761d9123cb860f82c`
- **Change:** Normalized the Wallet domain and transaction workflow so new chains plug in through adapters without widening core unions.
- **Details:**
  - Replaced chain-specific network, asset, address, transfer, preview, payload, history, and signature variants with normalized Schema descriptors and stable identifiers.
  - Moved viem and Solana SDK address validation, nested network configuration, transaction construction, signing, and submission into their respective adapters.
  - Added cursor-based normalized transaction history to the core workflow, with simulated and Solana implementations and an explicit Ethereum RPC capability limitation.
  - Recorded contract and program reading and writing as future generic intent contracts instead of prematurely exposing chain-specific calls.
- **Files:**
  - `docs/adr/0005-normalized-wallet-chain-adapters.md` — Defines the accepted normalized core, adapter ownership, transaction pipeline, history boundary, and contract operation TODOs.
  - `examples/wallet/core/src/currency.ts` — Defines normalized chain, network, asset, capability, and amount Schemas without SDK imports.
  - `examples/wallet/core/src/model.ts` — Defines generic accounts, transfers, transaction history, submissions, and signature proof state.
  - `examples/wallet/core/src/walletClient.ts` — Defines the generic client, signer, crypto, opaque payload, history, and observation service contracts.
  - `examples/wallet/testnet-node/src/ethereumSepolia.ts` — Keeps Ethereum configuration, validation, building, signing, submission, and RPC limitations inside the Ethereum adapter.
  - `examples/wallet/testnet-node/src/solanaDevnet.ts` — Keeps Solana configuration and SDK behavior inside the Solana adapter and implements owner-address transaction history.
  - `examples/wallet/testnet-node/src/walletServices.ts` — Routes generic operations by stable identifiers and advertised adapter capabilities.
  - `examples/wallet/remote/src/walletRpc.ts` — Carries the normalized workflow across the remote boundary using generic RPC Schemas and opaque handles.
  - `examples/wallet/README.md` — Explains how hosts consume the chain-neutral Program and how adapters provide chain behavior.
- **User context (verbatim):**
  > model the business logic for the cryptocurrency wallet operations completely agnostic of any chain
  > We want build transfer payload or whatever
  > Let's mark contract reading as a to-do, contract reading and writing.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 10:58:40 a.m. EDT — `a507f2439786` feat(wallet): validate recipients and link submissions

- **Implementation commit:** `a507f24397868fb8d655cff9ad774406b67c8539`
- **Change:** Added network-specific recipient validation and real-submission explorer confirmations to the portable Wallet Program and every client surface.
- **Details:**
  - Modeled address formats as Schema data containing a network name, valid example, and tagged printable rules.
  - Rejected malformed composed transfers before Commands and attached explorer links only inside real Sepolia and Solana transport results.
  - Bumped wallet to version 4 and made the client matrix print its representative routes from WalletProgram instead of copied URI blobs.
- **Files:**
  - `examples/wallet/core/src/address.ts` — Defines the typed cross-network validator and printable guidance.
  - `examples/wallet/core/src/explorer.ts` — Defines canonical Etherscan and Solana Explorer confirmations.
  - `examples/wallet/core/src/model.ts` — Carries validated recipient state and optional transport-proven explorer confirmation data.
  - `examples/wallet/core/src/update.ts` — Prevents invalid transfer composition from producing Commands.
  - `examples/wallet/testnet-node/src/ethereumSepolia.ts` — Attaches an Etherscan link after successful raw transaction submission.
  - `examples/wallet/testnet-node/src/solanaDevnet.ts` — Attaches a cluster-specific Solana Explorer link after successful submission.
  - `examples/wallet/react/src/App.tsx` — Prints shared validation guidance and submitted transaction links in React.
  - `examples/wallet/foldkit/src/view.ts` — Prints the same shared structures through the canonical Foldkit view.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Prints and opens the same explorer data in Expo and React Native.
  - `examples/wallet/cli/src/host.ts` — Prints structured address failures and real explorer links in the raw CLI.
  - `examples/client-matrix/core/src/wallet.ts` — Derives representative wallet routes from the canonical versioned Program.
- **User context (verbatim):**
  > We want to show the, block explorer confirmation for a transaction once a, once we create the transaction successfully, sign and submit it.
  > That is not a valid address for network name. Valid addresses for network name look like this, and follow the following rules.
- **SpecStory:** unavailable — No durable SpecStory URI is available because this Codex desktop session is not captured by SpecStory.

## July 28th, 2026 at 10:04:45 a.m. EDT — `c539ddd59ff7` feat(wallet): enable recipient-addressed testnet sends

- **Implementation commit:** `c539ddd59ff799e7c1620c032f0300e0ae5cfea9`
- **Change:** Added recipient-addressed Sepolia preview and submission across shared Wallet clients.
- **Details:**
  - The canonical Wallet Model now distinguishes empty, invalid, and valid Ethereum recipients and invalidates stale previews whenever recipient input changes.
  - Foldkit, React, and Expo render the same recipient state and request previews through shared Messages instead of constructing drafts in each client.
  - The unauthenticated disposable Sepolia bridge accepts bounded ETH transfers to valid Ethereum recipients while retaining the amount cap and explicit confirmation flow.
- **Files:**
  - `examples/wallet/core/src/model.ts` — Define the typed editable recipient state.
  - `examples/wallet/core/src/update.ts` — Construct previews from shared Model state and invalidate stale previews.
  - `examples/wallet/react/src/App.tsx` — Render recipient entry through shared Wallet actions.
  - `examples/wallet/foldkit/src/view.ts` — Render the same recipient state through Foldkit HTML.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Render the same recipient state through React Native and Expo.
  - `examples/wallet/testnet-server/src/server.ts` — Permit bounded transfers to valid Sepolia recipients.
  - `examples/wallet/testnet-server/src/server.test.ts` — Reject 32-byte values that are not Ethereum addresses.
  - `examples/client-matrix/core/src/wallet.ts` — Advance exact Wallet state and replay fixtures to wallet@3.
- **User context (verbatim):**
  > Let me put in who to transfer to
  > I want to perform real sends (and we’ll start on testnet)
- **SpecStory:** unavailable — This work was performed in Codex desktop, whose session is not available to SpecStory CLI sync.

## July 28th, 2026 at 9:05:57 a.m. EDT — `a2b71015b09d` feat(wallet): preview portable send intents across clients

- **Implementation commit:** `a2b71015b09db265bbab11f661ba5a774819ac78`
- **Change:** Preview portable wallet send intents across React, Foldkit, and Expo
- **Details:**
  - Decoded the global wallet intent path into pending Wallet Program state so the existing LoadWallet result deterministically produces the preview Command without submitting a transaction.
  - Centralized a valid 32-byte Keccak signing challenge and preserved compatible typed RPC error codes instead of collapsing every remote failure to Unavailable.
  - Updated the client matrix to mark visual intent carriers active, bumped wallet replay identity to wallet@2, and added core, React binding, and Foldkit route coverage.
- **Files:**
  - `examples/wallet/core/src/update.ts` — Apply pending portable intents when the public portfolio loads and produce only the preview Command.
  - `examples/wallet/core/src/route.ts` — Own the global Wallet Program route intake shared by every visual client.
  - `examples/wallet/core/src/signingChallenge.ts` — Provide one deterministic 32-byte Keccak test challenge for every host.
  - `examples/wallet/react-bindings/src/walletRoute.ts` — Route React and Expo carriers through the core Wallet URI intake.
  - `examples/wallet/foldkit/src/route.ts` — Route the canonical Foldkit presenter through the same core Wallet URI intake.
  - `examples/react-native-showcase/src/App.tsx` — Open Wallet intent deep links through the shared React binding on Expo hosts.
  - `examples/wallet/remote/src/remoteWallet.ts` — Preserve compatible typed RPC failure codes at the remote Layer boundary.
  - `examples/client-matrix/core/src/walletIntent.ts` — Mark visual Wallet intent carriers active while keeping CLI intake limitations explicit.
- **User context (verbatim):**
  > Looks like the actual interactivity isn't quite working yet. For Foldkit, check React and Expo as well.
  > And actually invoke the deep link to preview a send, and make sure that sends back the right JSON response or something from the page.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture is available.

## July 28th, 2026 at 8:19:11 a.m. EDT — `612a26c37f99` feat(wallet): expose the Sepolia test wallet remotely

- **Implementation commit:** `612a26c37f99d3fa942cf3309e2f1eea77f23057`
- **Change:** Exposed the funded Sepolia test wallet through the same portable Wallet Program in React, Foldkit, and Expo.
- **Details:**
  - Added a typed Fetch/RPC Layer whose public Schemas and opaque handles keep protected transaction material outside clients.
  - Added a deliberately unauthenticated Node bridge that loads the disposable key from a protected local file and restricts transactions to small Sepolia ETH self-transfers.
  - Made React bindings and the Foldkit application accept host-selected Wallet resources while retaining simulated resources for the TUI.
  - Verified a real on-chain transfer, matching balances across clients, production builds, Expo Web export, tests, typechecks, lint, dead-code analysis, and formatting.
- **Files:**
  - `examples/wallet/remote/src/remoteWallet.ts` — Implements portable Wallet services over the typed remote protocol.
  - `examples/wallet/testnet-server/src/server.ts` — Owns disposable custody and enforces the temporary public testnet policy.
  - `examples/wallet/react-bindings/src/wallet.tsx` — Builds domain-shaped React hooks from host-selected Wallet resources.
  - `examples/wallet/foldkit/src/application.ts` — Accepts the selected Wallet Layer without changing the canonical Program.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Runs the same remote Wallet resources in the Expo showcase.
  - `docs/explorations/wallet-testnet-layers.md` — Records the boundary, limitations, reusable pattern, and live transfer evidence.
- **User context (verbatim):**
  > I want to be able to use the test wallet from this unauthenticated place.
- **SpecStory:** unavailable — Codex desktop task; no verified Codex CLI capture or durable SpecStory URI is available.

## July 28th, 2026 at 8:01:37 a.m. EDT — `311f6238647a` feat(constructive-data-modeling): render authored slides as text

- **Implementation commit:** `311f6238647a509ce9e988262da9e4279e3b3343`
- **Change:** Rendered every authored reveal as selectable slide text and moved mobile navigation above the page.
- **Details:**
  - Added typed text for all 158 official reveal pages, including exact code examples and explicit textual equivalents for image-only pages.
  - Made the authored page the primary responsive surface, with the synchronized YouTube recording and timestamp deep link as a secondary companion.
  - Pinned Previous, Goto Page, and Next controls at the top; contained mobile overflow; and used touch-action manipulation to suppress double-tap zoom while preserving pinch zoom.
- **Files:**
  - `examples/constructive-data-modeling/core/src/authoredPages.ts` — Defines the selectable official reveal text for all 158 authored pages.
  - `examples/constructive-data-modeling/core/src/authoredPages.test.ts` — Verifies page coverage, representative code, and image-only textual equivalents.
  - `examples/constructive-data-modeling/core/src/index.ts` — Exports authored page text to all presentation hosts.
  - `examples/constructive-data-modeling/foldkit/index.html` — Enables safe-area-aware mobile layout without disabling accessible pinch zoom.
  - `examples/constructive-data-modeling/foldkit/src/styles.css` — Makes the authored page primary, fixes top navigation and mobile overflow, and disables double-tap zoom.
  - `examples/constructive-data-modeling/foldkit/src/view.ts` — Renders official page text and code while retaining synchronized video timing and deep links.
- **User context (verbatim):**
  > The next previous button should be at the very top, because I can't see the page.
  > I don't want rapid double taps or rapid taps in succession to zoom the page.
  > I want the code representation actually, like the slide actually represented in text on our thing.
- **SpecStory:** unavailable — Codex desktop task; no verified Codex CLI capture or durable SpecStory URI is available.

## July 28th, 2026 at 8:00:26 a.m. EDT — `b85a71f19a78` fix: keep the Program Log reachable during replay

- **Implementation commit:** `b85a71f19a786fdfb5a6ec87c13777d209c36f39`
- **Change:** Kept the Foldkit Program Log crash-free and reachable while time travel is paused.
- **Details:**
  - Validated historical Models on the decoded Schema type side so transformed values such as Cardboard's bigint sequence value are not decoded twice.
  - Made the in-page Program Log control a true toggle and routed its click through the pause interaction blocker without enabling product interactions.
  - Added a regression test that inspects a historical Model containing BigIntFromString and renders its decoded bigint value.
- **Files:**
  - `packages/foldkit/src/runtime/runtime.ts` — Validates already-decoded historical Models before inspection rendering.
  - `packages/foldkit/src/runtime/foldkitApplication.test.ts` — Covers DevTools inspection of transformed Model values.
  - `packages/devtools/src/programLogButton.ts` — Toggles the log and reroutes blocked clicks while replay is paused.
  - `packages/devtools/src/overlay.ts` — Identifies the protected time-travel interaction blocker for the log control.
- **User context (verbatim):**
  > if I open log once and then click anything in the list of events, uh, and then try and click log again, it does not work.
- **SpecStory:** unavailable — Codex desktop GUI task; SpecStory does not document desktop GUI capture and no durable SpecStory URI was available.

## July 28th, 2026 at 7:48:12 a.m. EDT — `c4010cd5096d` feat(devtools): expose an in-app Program Log button

- **Implementation commit:** `c4010cd5096d4a3beab7f3058a29e94d24204b4f`
- **Change:** Added a real in-app Program Log button to the Foldkit Cardboard presentation.
- **Details:**
  - Exported a reusable light-DOM ProgramLogButton CustomElement that opens the mounted DevTools overlay through its own control.
  - Rendered [L] Log beside [E] Extra without moving DevTools state or effects into the portable Cardboard Program.
- **Files:**
  - `packages/devtools/src/programLogButton.ts` — Defines and registers the reusable in-app Program Log control.
  - `packages/devtools/src/index.ts` — Exports the Program Log CustomElement and browser registration helper.
  - `packages/devtools/src/overlay.ts` — Gives the authoritative overlay control a stable internal target.
  - `examples/cardboard/foldkit/src/entry.ts` — Registers the Program Log CustomElement in the Foldkit browser host.
  - `examples/cardboard/foldkit/src/view.ts` — Renders [L] Log beside the existing Cardboard commands.
- **User context (verbatim):**
  > FoldKit still doesn't have a log button. Can you add that, please?
- **SpecStory:** unavailable — Codex desktop GUI task; SpecStory does not document desktop GUI capture and no durable SpecStory URI was available.

## July 28th, 2026 at 7:45:18 a.m. EDT — `642d27e57749` fix(devtools): label the Program Log control

- **Implementation commit:** `642d27e5774926bafbe5e0c1c39cb9402d3e1538`
- **Change:** Made the Foldkit Program Log control explicit and accessible.
- **Details:**
  - Replaced the ambiguous vertical DEV badge with a visible LOG label.
  - Added state-specific accessible names for opening and closing the authoritative Program Log overlay.
- **Files:**
  - `packages/devtools/src/overlay.ts` — Names and renders the Foldkit Program Log launcher.
- **User context (verbatim):**
  > but FoldKit still doesn't have a log button. Can you add that, please?
- **SpecStory:** unavailable — Codex desktop GUI task; SpecStory does not document desktop GUI capture and no durable SpecStory URI was available.

## July 28th, 2026 at 4:38:26 a.m. EDT — `29bfb7c4cff4` feat(cardboard): generate route-specific social previews

- **Implementation commit:** `29bfb7c4cff4935670c96385e0925d338bc043b7`
- **Change:** Added route-specific social link previews for Cardboard.
- **Details:**
  - Resolved public routes through CardboardRouter and projected exact content and portable paths from the authoritative Model.
  - Generated 1200 by 630 PNG cards through Satori SVG and Resvg, wrapping large numeric content and carrier text without numeric coercion.
  - Injected canonical, Open Graph, and Twitter metadata and served versioned cacheable images from both React and Foldkit Vite hosts.
- **Files:**
  - `examples/cardboard/core/src/preview.ts` — Defines presentation-neutral preview content derived from the canonical Cardboard Model.
  - `examples/cardboard/core/src/route.ts` — Exposes the canonical public portable route for a Cardboard Model.
  - `examples/cardboard/web/src/preview.ts` — Resolves canonical web and native carriers for each public route.
  - `examples/cardboard/web/src/meta.ts` — Renders complete canonical, Open Graph, and Twitter metadata.
  - `examples/cardboard/web/src/ogImage.ts` — Renders exact wrapped content and carriers through SVG into a 1200 by 630 PNG.
  - `examples/cardboard/web/src/vitePlugin.ts` — Serves dynamic HTML metadata and versioned cacheable PNG responses.
  - `examples/cardboard/web/src/preview.test.ts` — Verifies carriers, metadata, exact wrapping, and PNG dimensions.
  - `examples/cardboard/react/vite.config.ts` — Installs route-specific previews in the React web host.
  - `examples/cardboard/foldkit/vite.config.ts` — Installs route-specific previews in the Foldkit web host.
  - `pnpm-lock.yaml` — Locks the web preview workspace and its deterministic font dependency.
  - `knip.json` — Documents the font resource dependency resolved dynamically for rasterization.
- **User context (verbatim):**
  > Let's have it create an SVG to PNG that shows the contents of the page, the URL of the page, and the deep link of the page.
  > Make sure the number is formatted correctly. Yeah, make sure it wraps.
  > provide it ubiquitously in all the OG headers and stuff
- **SpecStory:** unavailable — Codex desktop GUI task; SpecStory does not document desktop GUI capture and no durable SpecStory URI was available.

## July 28th, 2026 at 4:29:59 a.m. EDT — `b2c4b0671fd7` feat: simplify wallet and expose Cardboard replay

- **Implementation commit:** `b2c4b0671fd7aa8ca46b0c68e1afa9cfa4fc7d08`
- **Change:** Simplify the Wallet Clients and expose Cardboard replay in Foldkit
- **Details:**
  - Reduced the default Wallet presentation to balance, one test send, and recent activity while keeping account, receiving, signing, and replay tools available as secondary details.
  - Moved exact currency formatting and primary account selection into Wallet core so React, Foldkit, and Expo share presentation facts without sharing rendering code.
  - Extracted common Cardboard visual tokens and made the canonical Foldkit Client production journal visible in TimeTravel mode, preserving the runtime as the single replay authority.
- **Files:**
  - `examples/cardboard/common/cardboard.css` — Share Cardboard colors, surfaces, embossing, and controls across visual Clients.
  - `examples/cardboard/foldkit/src/application.ts` — Expose the authoritative Program journal and time-travel controls in the Foldkit showcase.
  - `examples/cardboard/react/src/styles.css` — Consume the shared Cardboard presentation tokens.
  - `examples/react-native-showcase/src/wallet/wallet.tsx` — Present the Wallet as a calm balance, send, and activity flow on Expo platforms.
  - `examples/wallet/core/src/index.ts` — Export shared Wallet presentation facts.
  - `examples/wallet/core/src/presentation.test.ts` — Verify exact currency formatting and primary balance selection.
  - `examples/wallet/core/src/presentation.ts` — Define renderer-independent Wallet labels and selectors.
  - `examples/wallet/foldkit/src/scene.test.ts` — Verify the simplified Foldkit flow and retained advanced tools.
  - `examples/wallet/foldkit/src/styles.css` — Reuse the same Cardboard Wallet presentation stylesheet.
  - `examples/wallet/foldkit/src/view.ts` — Render the simplified Wallet hierarchy through Foldkit HTML.
  - `examples/wallet/react/src/App.tsx` — Render the simplified Wallet hierarchy through React.
  - `examples/wallet/react/src/styles.css` — Apply Cardboard surfaces, readable hierarchy, and responsive advanced details.
- **User context (verbatim):**
  > the wallet is way too confusing looking
  > make it a lot simpler, please, and take some inspiration from Cardboard
  > the fold kit showcase for Cardboard does not have undo, replay, etc.
- **SpecStory:** unavailable — Codex desktop task; no verified Codex CLI capture or durable SpecStory URI is available.

## July 28th, 2026 at 4:18:40 a.m. EDT — `3e19fad9da32` feat(constructive-data-modeling): add exact page navigation

- **Implementation commit:** `3e19fad9da32dfce36c4ff6902f41d542bd82b65`
- **Change:** Added exact authored-page navigation and deployment-ready provenance for the constructive modeling slideshow.
- **Details:**
  - Modeled all 158 reveal pages as typed locations with exact start/end times and YouTube deep links, while keeping the camera-only Q&A tail as a separate location case.
  - Added the authored six-landmark Goto Page chooser plus All Pages mode to the shared Program, with browser modal, CLI page command, TUI chooser, playback sync, and remote-origin support.
  - Prepared a static Cloudflare Worker custom domain with workers.dev and preview URLs disabled, and made clean production builds embed and log immutable Git provenance.
- **Files:**
  - `examples/constructive-data-modeling/core/src/model.ts` — Typed exact page, recording-only location, and page chooser state unions.
  - `examples/constructive-data-modeling/core/src/deck.ts` — All 158 exact reveal intervals, authored landmarks, deep links, and total navigation helpers.
  - `examples/constructive-data-modeling/core/src/update.ts` — Shared browser, CLI, TUI, playback, and remote page operations.
  - `examples/constructive-data-modeling/core/src/program.test.ts` — Boundary, reveal, chooser, remote, and source-chain verification.
  - `examples/constructive-data-modeling/foldkit/src/view.ts` — Accessible Goto Page modal and exact authored-page controls.
  - `examples/constructive-data-modeling/foldkit/src/application.ts` — Loop-free exact page URL and video seeking.
  - `examples/constructive-data-modeling/foldkit/scripts/build-with-provenance.mjs` — Clean production build with embedded immutable provenance.
  - `examples/constructive-data-modeling/foldkit/wrangler.jsonc` — Protected custom-domain Worker route without public preview endpoints.
  - `examples/constructive-data-modeling/cli/src/host.ts` — Validated direct page-number operation.
  - `examples/constructive-data-modeling/tui/src/host.ts` — Terminal Goto Page and All Pages controls.
- **User context (verbatim):**
  > We want to be able to do that in any medium and quickly page through all the slides.
  > I want video to slideshow, and then the slideshow is a fold kit.
- **SpecStory:** unavailable — Codex desktop session; no durable SpecStory capture URI is available.

## July 28th, 2026 at 4:13:06 a.m. EDT — `52ec38ab960e` build(cardboard): embed React build provenance

- **Implementation commit:** `52ec38ab960e1dcc881b7d4f04e74881cb38ef6b`
- **Change:** Embed reproducible build provenance in the Cardboard React Client
- **Details:**
  - Read Vite-injected provenance once and log the committed source and artifact identity when the React Client starts.
  - Keep development builds explicit by logging that provenance is unavailable when the build pipeline did not inject it.
- **Files:**
  - `examples/cardboard/react/src/buildProvenance.ts` — Log injected provenance through one startup helper.
  - `examples/cardboard/react/src/environment.d.ts` — Type the Vite provenance environment value.
  - `examples/cardboard/react/src/main.tsx` — Log build identity before mounting the React Client.
- **User context (verbatim):**
  > it should be able to open the web URL in another window for the given event log
- **SpecStory:** unavailable — Codex desktop task; no verified Codex CLI capture or durable SpecStory URI is available.

## July 28th, 2026 at 4:12:18 a.m. EDT — `08b2f9c1b0ac` feat(cardboard): add replay Client matrix

- **Implementation commit:** `08b2f9c1b0ace86b553fc368891dc1662bb0fecc`
- **Change:** Add exact replay carriers and Client previews to the Program Log
- **Details:**
  - Wrap one selected portable replay path as React Web, Expo Web, Expo Mobile, and Effect TUI carriers without moving host concerns into the Program.
  - Preview the exact selected Model in each presentation Client and provide explicit open, copy, or share actions.
  - Suppress long-press callouts, strengthen the embossed Cardboard treatment, and keep the unavailable Foldkit replay-mount seam visible.
  - Prove absolute-carrier TUI restoration and the shared presentation-Client registry with focused tests.
- **Files:**
  - `docs/adr/0002-universal-program-replay.md` — Record the portable-path and host-carrier boundary.
  - `examples/cardboard/react-bindings/package.json` — Run focused tests for the shared Client registry.
  - `examples/cardboard/react-bindings/src/index.ts` — Export the shared presentation-Client API.
  - `examples/cardboard/react-bindings/src/presentationClients.test.ts` — Prove one path produces the expected mobile and terminal carriers.
  - `examples/cardboard/react-bindings/src/presentationClients.ts` — Define the Schema-backed presentation-Client registry.
  - `examples/cardboard/react/src/App.tsx` — Render and operate the selected-frame Client matrix in React.
  - `examples/cardboard/react/src/styles.css` — Add embossed previews, responsive cards, and long-press suppression.
  - `examples/cardboard/tui/package.json` — Run focused terminal carrier tests.
  - `examples/cardboard/tui/src/entry.ts` — Accept an optional portable or absolute carrier argument.
  - `examples/cardboard/tui/src/host.test.ts` — Prove exact selected-frame restoration from an HTTPS carrier.
  - `examples/cardboard/tui/src/host.ts` — Parse carriers and start the TUI at the requested Program route.
  - `examples/react-native-showcase/src/cardboardProgramLog.tsx` — Render the same Client matrix and actions in Expo.
  - `pnpm-lock.yaml` — Lock the focused Vitest test dependencies.
- **User context (verbatim):**
  > Let's show the URL for the mobile client and the terminal
  > it should be able to open the web URL in another window for the given event log
  > this log should be kind of like the matrix of things
  > not allow long clicking
  > fonts and numbers and text to appear more embossed
- **SpecStory:** unavailable — Codex desktop task; no verified Codex CLI capture or durable SpecStory URI is available.

## July 28th, 2026 at 3:57:03 a.m. EDT — `9853ed087828` feat(constructive-data-modeling): sync the exact talk

- **Implementation commit:** `9853ed08782838225a9a5070b84263877d05b4be`
- **Change:** Synchronize the constructive modeling deck with the exact talk
- **Details:**
  - Replace the ten-slide conceptual outline with 40 time-indexed authored visual states plus the recording-only Q&A tail, including every condensed-page and reveal-range locator.
  - Preserve the intentional UserContact revisit after Ior, contiguous cue boundaries from 0:00 through 42:25, and a YouTube deep link for every state.
  - Embed the actual YouTube recording and connect it bidirectionally through a typed playback port: cue selection seeks without forced autoplay, while playback advances cues without seek loops.
  - Verify nine core tests, every host typecheck and build, CLI output, responsive browser layout, zero console errors, 100 accessibility, exact 13:06 seeking, and playback-driven transition at 13:10.
- **Files:**
  - `examples/constructive-data-modeling/core/src/model.ts` — model exact authored and Q&A states, timing, sources, and video control origin
  - `examples/constructive-data-modeling/core/src/deck.ts` — encode the verified 41-cue recording timeline and deep links
  - `examples/constructive-data-modeling/core/src/message.ts` — accept typed playback observations in the shared Message union
  - `examples/constructive-data-modeling/core/src/update.ts` — select the cue containing observed playback time without feedback effects
  - `examples/constructive-data-modeling/core/src/presentation.ts` — project exact timing and reveal metadata across hosts
  - `examples/constructive-data-modeling/core/src/program.ts` — version the expanded portable Program schema
  - `examples/constructive-data-modeling/core/src/program.test.ts` — prove timing coverage, repeated authored state, boundaries, and control origins
  - `examples/constructive-data-modeling/foldkit/src/application.ts` — adapt browser playback through a typed inbound port and seek callback
  - `examples/constructive-data-modeling/foldkit/src/player.ts` — own YouTube API polling and state-preserving seeks
  - `examples/constructive-data-modeling/foldkit/src/entry.ts` — embed the runtime and connect its playback port to YouTube
  - `examples/constructive-data-modeling/foldkit/src/view.ts` — render the exact video beside its synchronized semantic cue
  - `examples/constructive-data-modeling/foldkit/src/styles.css` — provide responsive video, cue, timeline, and control layouts
  - `examples/constructive-data-modeling/foldkit/src/route.ts` — restore stable time-indexed cue identities from deep links
  - `examples/constructive-data-modeling/foldkit/index.html` — describe and brand the synchronized viewer
  - `examples/constructive-data-modeling/foldkit/public/llms.txt` — publish the exact synchronization and source contract for agents
  - `examples/constructive-data-modeling/cli/src/entry.ts` — expose useful exact-talk cue commands
  - `examples/constructive-data-modeling/cli/src/host.ts` — route CLI commands to stable timeline identities
  - `examples/constructive-data-modeling/tui/src/host.ts` — navigate the exact timeline through the terminal host
- **User context (verbatim):**
  > I want the talk exactly, with also timestamps to go to the deep link of the actual talk.
  > And we can watch the talk and sync the talk to slides in this viewer.
- **SpecStory:** unavailable — Codex desktop GUI session; no verified durable SpecStory URI was available.

## July 28th, 2026 at 3:49:03 a.m. EDT — `36ad0b9adf65` feat: add interactive Program log controls

- **Implementation commit:** `36ad0b9adf653e00bbdfba456ef33bd739ef1a63`
- **Change:** Add one interactive Program log across presentation Clients
- **Details:**
  - ReplayController.resume branches from a selected settled frame and returns to live execution without inventing a domain Message or rerunning historical Commands.
  - React, Expo, and TUI pin the inspected Model above the action and runtime-event history, support undo and redo, and keep supplementary material behind the separate [E] Extra boundary.
  - The Foldkit Client continues to expose the authoritative journal through DevTools; its missing in-app runtime-control seam is documented rather than duplicated in the domain Model.
- **Files:**
  - `.changeset/add-replay-controller-resume.md` — Declare the public replay-controller capability change.
  - `docs/adr/0002-universal-program-replay.md` — Record the engine-owned Program log semantics and remaining Foldkit control seam.
  - `docs/explorations/project-cardboard.md` — Document Log and Extra as separate Client affordances.
  - `examples/cardboard/cli/src/entry.ts` — Rename the supplementary CLI command to Extra.
  - `examples/cardboard/cli/src/host.ts` — Route the renamed Extra command through the Cardboard Program.
  - `examples/cardboard/core/src/component.ts` — Project the shared Extra command without conflating it with Program history.
  - `examples/cardboard/core/src/ledger.ts` — Rename supplementary presentation wording to Extra.
  - `examples/cardboard/core/src/presentation.ts` — Render Extra through the renderer-neutral projection.
  - `examples/cardboard/core/src/program.test.ts` — Prove Extra route compatibility and canonicalization.
  - `examples/cardboard/core/src/route.ts` — Canonicalize supplementary material at /0/extra while accepting the legacy alias.
  - `examples/cardboard/foldkit/src/application.ts` — Point the Foldkit supplementary carrier at the canonical Extra route.
  - `examples/cardboard/foldkit/src/view.ts` — Render the shared Extra command in the canonical Foldkit Client.
  - `examples/cardboard/react-bindings/src/cardboard.tsx` — Expose the typed Extra action to React Clients.
  - `examples/cardboard/react/src/App.tsx` — Present the pinned Program state, history controls, and transition log.
  - `examples/cardboard/react/src/styles.css` — Style the sticky Program log and de-emphasized future transitions.
  - `examples/cardboard/tui/src/host.ts` — Run the Cardboard TUI through ReplayController with Log, undo, redo, Done, and Extra controls.
  - `examples/react-native-showcase/src/App.tsx` — Integrate the shared Program log into the Expo Cardboard scene.
  - `examples/react-native-showcase/src/cardboardProgramLog.tsx` — Render the native pinned state and action and event history.
  - `examples/shared/react-bindings/src/replayableReactProgram.test.tsx` — Verify transitions, resume, and typed unsettled-frame failure in React bindings.
  - `examples/shared/react-bindings/src/replayableReactProgram.tsx` — Expose transitions and resume through the framework-agnostic React replay contract.
  - `knip.json` — Register nested Cardboard workspaces for dead-code analysis.
  - `packages/foldkit/src/runtime/replayController.test.ts` — Verify resource lifetime and live resumption from inert inspection.
  - `packages/foldkit/src/runtime/replayController.ts` — Add the engine operation that resumes a settled inspected frame.
- **User context (verbatim):**
  > pressing the log should show them the log of actions and events
  > the current state of the program is pinned to the top
  > allow them to control and undo and redo
  > just a letter E for extra
- **SpecStory:** unavailable — Codex desktop task; no verified Codex CLI capture or durable SpecStory URI is available.

## July 28th, 2026 at 3:40:43 a.m. EDT — `91bba4328f1f` feat(constructive-data-modeling): add portable study deck

- **Implementation commit:** `91bba4328f1f3118d37a341cbbb361c2d4e21b1e`
- **Change:** Add a ubiquitous constructive data modeling study deck
- **Details:**
  - Added a transformative ten-slide deck backed by the recording, event, authored slide repository commit, speaker site, and related primary essay.
  - Modeled a non-empty Deck, stable SlideId and SourceId values, a closed SlideContent sum, total navigation, and one Message algebra shared by browser, CLI, TUI, and future remote inputs.
  - Built and exercised every implemented host, verified desktop and mobile layouts, and recorded 100 Lighthouse scores for accessibility, best practices, SEO, and agentic browsing.
  - Kept InstantDB as a typed RemoteControl origin only; room, identity, authority, ordering, reconnect, and conflict semantics remain deliberately undefined.
- **Files:**
  - `examples/constructive-data-modeling/core/src/model.ts` — make valid deck content and control origins explicit
  - `examples/constructive-data-modeling/core/src/deck.ts` — encode the source-backed study deck and total slide navigation
  - `examples/constructive-data-modeling/core/src/message.ts` — share one semantic navigation vocabulary across hosts
  - `examples/constructive-data-modeling/core/src/update.ts` — apply every navigation case through an exhaustive update
  - `examples/constructive-data-modeling/core/src/presentation.ts` — derive renderer-neutral browser and terminal presentations
  - `examples/constructive-data-modeling/core/src/program.test.ts` — verify boundaries, stable identities, sources, and remote origin preservation
  - `examples/constructive-data-modeling/foldkit/src/view.ts` — render exhaustive slide kinds with pointer and keyboard controls
  - `examples/constructive-data-modeling/foldkit/src/styles.css` — provide responsive presentation layout and high-contrast controls
  - `examples/constructive-data-modeling/foldkit/src/route.ts` — restore stable slide identity from the query string
  - `examples/constructive-data-modeling/foldkit/public/llms.txt` — describe controls and primary sources for agentic clients
  - `examples/constructive-data-modeling/cli/src/host.ts` — expose one-shot source and concept views
  - `examples/constructive-data-modeling/tui/src/host.ts` — provide an interactive terminal presentation
  - `package.json` — add browser, CLI, and TUI run commands
  - `knip.json` — register the four example workspaces
  - `pnpm-lock.yaml` — lock the new workspace importers
- **User context (verbatim):**
  > put together a representation in our FoldKit repository with the pattern of ubiquity
  > they have great controls, and you can remote control them
  > The remote control is, I haven't quite defined that yet. But it will use InstantDB.
- **SpecStory:** unavailable — Codex desktop GUI session; no verified durable SpecStory URI was available.

## July 28th, 2026 at 1:08:33 a.m. EDT — `a3c0b7a2a40d` fix: restore Cardboard navigation carriers

- **Implementation commit:** `a3c0b7a2a40d5857098e3c5fa6f484b13dc2e2aa`
- **Change:** Restored explicit Cardboard navigation across Clients and added Expo Go carriers.
- **Details:**
  - The renderer-neutral Cardboard projection now exposes a typed Log command; React, Foldkit, Expo, and TUI render it, while the Expo showcase adds its host-owned Showcase command.
  - Cardboard occupies the Expo scene without the comparison panel, tabs, or native stack header, and its flexible layout no longer clips behind fixed mobile heights.
  - Expo Go links are created with expo-linking and normalized from exp://host/--/<portable-path> before Program routing. The obsolete /0/0 ledger alias was removed in favor of /0/log.
  - A replay-tape regression test proves the sequence 4, 5, ledger, 4 and guards the explicit field-replacement transformer.
- **Files:**
  - `examples/cardboard/core/src/component.ts` — Defined the shared semantic command projection.
  - `examples/cardboard/core/src/message.ts` — Added the factual return-to-sequence Message.
  - `examples/cardboard/core/src/update.ts` — Implemented explicit sequence-page replacement.
  - `examples/cardboard/core/src/route.ts` — Removed the obsolete /0/0 alias.
  - `examples/cardboard/core/src/program.test.ts` — Proved routes, semantic commands, and replay frames.
  - `examples/cardboard/react-bindings/src/cardboard.tsx` — Exposed typed domain-shaped React actions.
  - `examples/cardboard/react/src/App.tsx` — Rendered the shared Cardboard command bar.
  - `examples/cardboard/react/src/styles.css` — Kept the command bar legible below full-screen content.
  - `examples/cardboard/foldkit/src/view.ts` — Rendered the same semantic commands through Foldkit.
  - `examples/cardboard/tui/src/host.ts` — Exposed Log and root commands in the terminal.
  - `examples/react-native-showcase/src/App.tsx` — Restored explicit Log and Showcase commands in Expo.
  - `examples/react-native-showcase/src/nativeNavigationComparison/nativeNavigationComparison.tsx` — Removed native stack chrome from Cardboard scenes.
  - `examples/react-native-showcase/src/carrier.ts` — Centralized Expo Go and portable-path normalization.
  - `examples/react-native-showcase/src/carrier.test.ts` — Tested native, Expo Go, and query carriers.
  - `examples/react-native-showcase/src/replayControls.tsx` — Generated environment-correct shared deep links.
  - `examples/react-native-showcase/package.json` — Added Expo Go scripts and expo-linking.
  - `examples/react-native-showcase/README.md` — Documented Expo Go launch carriers.
  - `package.json` — Added repository-level Expo Go demo scripts.
  - `pnpm-lock.yaml` — Locked expo-linking.
- **User context (verbatim):**
  > there needs to be a bracket and a letter followed by a command
  > can you set up deep links for Expo Go?
  > Can you proof that message tape?
- **SpecStory:** unavailable — No durable SpecStory URI is available because this work was performed in Codex desktop, whose GUI capture is not documented by SpecStory.

## July 28th, 2026 at 12:58:46 a.m. EDT — `38045a18632c` docs(client-matrix): add Expo Web sequence evidence

- **Implementation commit:** `38045a18632c063a2bb37e823f6d3e7127220d68`
- **Change:** Add Expo Web Cardboard sequence evidence
- **Details:**
  - Verified the clean production Expo Web export through the public Cloudflare carrier at /0 and /0/5.
  - Recorded current Four and Five captures and promoted Expo Web matrix cells from source-only evidence to WAN browser interaction.
- **Files:**
  - `examples/client-matrix/core/src/cardboard.ts` — Records verified Expo Web carrier evidence for the Cardboard sequence matrix.
  - `examples/client-matrix/foldkit/public/captures/cardboard/five/expo-web.webp` — Records verified Expo Web carrier evidence for the Cardboard sequence matrix.
  - `examples/client-matrix/foldkit/public/captures/cardboard/four/expo-web.webp` — Records verified Expo Web carrier evidence for the Cardboard sequence matrix.
- **User context (verbatim):**
  > They can be rendered just by text.
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture was available.

## July 28th, 2026 at 12:56:27 a.m. EDT — `af798b625901` feat: model Cardboard as an unbounded sequence

- **Implementation commit:** `af798b625901350705bb867ae5d64cd9a24fedf4`
- **Change:** Model Cardboard as a shared unbounded sequence
- **Details:**
  - Made /0 display four, advance through AdvancedCardboardSequence, and print canonical /0/<value> routes from a finite BigInt-backed Model.
  - Projected one semantic Cardboard button into React, Foldkit, Expo, CLI, and TUI, with live route synchronization and refreshed Four/Five matrix captures.
  - Retained the earlier black-button and decision-ledger work as a noncanonical study at /0/log, and documented the corrected boundary.
- **Files:**
  - `docs/adr/0001-view-agnostic-runtime-prototype.md` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `docs/explorations/project-cardboard.md` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/cli/src/entry.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/cli/src/host.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/component.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/index.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/init.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/ledger.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/message.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/model.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/presentation.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/program.test.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/program.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/route.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/core/src/update.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/foldkit/src/application.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/foldkit/src/view.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/react-bindings/src/cardboard.tsx` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/react/src/App.tsx` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/react/src/styles.css` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/cardboard/tui/src/host.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/core/src/cardboard.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/core/src/matrix.test.ts` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/conversation-ledger/cli.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/conversation-ledger/expo-ios.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/conversation-ledger/foldkit.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/conversation-ledger/react.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/five/foldkit.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/five/react.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/four/foldkit.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/four/react.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/rule-zero/cli.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/rule-zero/expo-ios.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/rule-zero/foldkit.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/client-matrix/foldkit/public/captures/cardboard/rule-zero/react.webp` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
  - `examples/react-native-showcase/src/App.tsx` — Part of the verified Cardboard sequence implementation, client rendering, documentation, or evidence.
- **User context (verbatim):**
  > make slash zero equal to four
  > it’s gonna take you to slash zero slash five
  > cardboard was supposed to be a set of shared components
- **SpecStory:** unavailable — Codex desktop task; no verified SpecStory CLI capture was available.

## July 28th, 2026 at 12:47:39 a.m. EDT — `f8b727597e35` feat(react-native-showcase): log embedded build provenance

- **Implementation commit:** `f8b727597e3573d3c155abef72b4e63dc3cdcff6`
- **Change:** Made Expo Showcase builds report their embedded source and build identity at startup.
- **Details:**
  - Reads the Expo public build provenance payload exactly once and reports when development builds have no embedded payload.
- **Files:**
  - `examples/react-native-showcase/src/buildProvenance.ts` — Logs the build-time provenance payload at application startup.
  - `examples/react-native-showcase/src/environment.d.ts` — Types the Expo public provenance environment variable without adding Node runtime APIs.
  - `examples/react-native-showcase/src/App.tsx` — Runs provenance logging when the Showcase starts.
- **User context (verbatim):**
  > we need to ship
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 28th, 2026 at 12:46:21 a.m. EDT — `4436ca70e62c` feat(client-matrix): add Cardboard cross-client evidence

- **Implementation commit:** `4436ca70e62c4305c1913cdab1d6af9c701e3b4d`
- **Change:** Added an evidence-backed Project Cardboard matrix across portable Client carriers.
- **Details:**
  - Defined Cardboard Program identity, portable states, Client carriers, support levels, evidence levels, limitations, and capture paths as Schema data.
  - Made the existing row and column orientation control drive the Cardboard matrix.
  - Recorded real React, Foldkit, CLI, and final iOS Simulator captures without claiming unverified Android, native touch, or physical-device behavior.
- **Files:**
  - `examples/client-matrix/core/src/cardboard.ts` — Defines the typed Cardboard matrix contract and exact Client carriers.
  - `examples/client-matrix/core/src/matrix.test.ts` — Proves every Client covers both portable Cardboard routes.
  - `examples/client-matrix/foldkit/src/view.ts` — Renders the configurable Cardboard evidence matrix.
  - `examples/client-matrix/foldkit/public/captures/cardboard/rule-zero/expo-ios.webp` — Records final iOS Simulator rendering for Rule Zero.
  - `examples/client-matrix/foldkit/public/captures/cardboard/conversation-ledger/react.webp` — Records the WAN React ledger rendering used by the matrix.
  - `examples/cardboard/core/src/route.ts` — Exports the canonical portable routes instead of duplicating them in the matrix.
- **User context (verbatim):**
  > Also, use generate the matrix of this application.
  > we need to ship, we need to stop thinking
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 28th, 2026 at 12:38:40 a.m. EDT — `a6376cdeb035` feat(cardboard): add the Rule Zero decision ledger

- **Implementation commit:** `a6376cdeb0355629ecdf54b5f03cd526a2089cb3`
- **Change:** Added Cardboard's portable Rule Zero decision ledger and large-format client presentation.
- **Details:**
  - Modeled /0 and /0/0 as typed Program states with factual Message transitions and parser-printer round trips.
  - Rendered the same ledger through React, Foldkit, Expo, CLI, and TUI while preserving the native Expo stack.
  - Increased reading scale and added pill-shaped controls for the initial Cardboard experience.
- **Files:**
  - `examples/cardboard/core/src/ledger.ts` — Defines the append-only conversation scale and decision ledger.
  - `examples/cardboard/core/src/route.ts` — Makes /0 and /0/0 canonical portable routes.
  - `examples/cardboard/react/src/App.tsx` — Renders the readable React Rule Zero and ledger states.
  - `examples/cardboard/foldkit/src/view.ts` — Renders the same states through Foldkit's canonical view path.
  - `examples/react-native-showcase/src/App.tsx` — Presents Cardboard full-screen inside the native Expo stack.
  - `examples/cardboard/tui/src/host.ts` — Adds terminal colors and direct ledger navigation.
- **User context (verbatim):**
  > we need to ship, we need to stop thinking
  > slash zero slash zero explain when slash zero is four
  > it's an append-only log for this conversation
  > the text is not legible enough
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 28th, 2026 at 12:25:04 a.m. EDT — `0ca43aeb34d3` feat(cardboard): publish Rule Zero provenance

- **Implementation commit:** `0ca43aeb34d3f6bd139615492259ac8d2476ce29`
- **Change:** Published Rule Zero provenance across the public Cardboard clients.
- **Details:**
  - Added one Schema-validated authorship record with verified SHA-256 addresses, rendered it in React, Foldkit, and Expo, connected the review lab to WAN carriers, and documented the portable event-symbol and bounded-signing boundaries.
- **Files:**
  - `.lavish/cardboard-readability-lab.html` — Points visual review links at the public WAN clients.
  - `docs/explorations/project-cardboard.md` — Records portable input, bounded signing, and voluntary continuity decisions.
  - `examples/cardboard/core/src/authorship.ts` — Defines the shared content-addressed provenance record.
  - `examples/cardboard/core/src/index.ts` — Exports provenance from the canonical core.
  - `examples/cardboard/core/src/program.test.ts` — Verifies both authorship SHA-256 addresses.
  - `examples/cardboard/foldkit/src/view.ts` — Renders provenance through the Foldkit view.
  - `examples/cardboard/foldkit/vite.config.ts` — Allows the named Foldkit WAN carrier.
  - `examples/cardboard/react/src/App.tsx` — Renders provenance through React.
  - `examples/cardboard/react/src/styles.css` — Styles the accessible provenance disclosure.
  - `examples/cardboard/react/vite.config.ts` — Allows the named React WAN carrier.
  - `examples/react-native-showcase/src/App.tsx` — Renders provenance through Expo and React Native.
- **User context (verbatim):**
  > Get it live then.
  > give me links from only over WAN
  > Original author, Blueberry Chopsticks, Tuesday, July 28, 2026.
  > Zero-handed timers or callbacks in React.
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 28th, 2026 at 12:05:09 a.m. EDT — `af5fd725ba0a` feat(cardboard): add readability review lab

- **Implementation commit:** `af5fd725ba0a17ebe56eac72489fe47035623891`
- **Change:** Add a Cardboard readability review lab
- **Details:**
  - Added live comparison controls for Atkinson Hyperlegible, Lexend, and OpenDyslexic with three large text scales.
  - Kept all six Cardboard surfaces and RGB inversion available while showing the same portable Program language.
  - Queues one exact typography profile and free-form visual feedback through Lavish before changing every client.
- **Files:**
  - `.lavish/cardboard-readability-lab.html` — Provides the interactive, mobile-readable Cardboard typography and theme review surface.
- **User context (verbatim):**
  > all text is, should be the size of triple the normal hero
  > Allow me to choose different fonts
  > can you give me something to click on and I can give you concrete feedback
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 27th, 2026 at 11:59:49 p.m. EDT — `358066475407` feat(cardboard): run Rule Zero across portable clients

- **Implementation commit:** `358066475407c149304a70d4bf7be2ed3ac984a8`
- **Change:** Run Rule Zero across portable clients
- **Details:**
  - Added Foldkit, React, Expo, CLI, and TUI presentations over one canonical Cardboard Program.
  - Modeled the controller and mirror riddle as typed states and Messages, including explicit invalid, answered, and skipped outcomes.
  - Kept interactive terminal input non-blocking while Program Subscriptions drive lifecycle progress.
- **Files:**
  - `examples/cardboard/core/src/model.ts` — Defines the portable controller riddle and legal resolution states.
  - `examples/cardboard/foldkit/src/view.ts` — Renders Rule Zero through the normal Foldkit view path.
  - `examples/cardboard/react-bindings/src/cardboard.tsx` — Exposes shared React and React Native model, actions, and replay hooks.
  - `examples/cardboard/react/src/App.tsx` — Presents the React Rule Zero client.
  - `examples/cardboard/cli/src/host.ts` — Presents deterministic one-shot commands.
  - `examples/cardboard/tui/src/host.ts` — Processes real interactive terminal input without blocking persistent Subscriptions.
  - `examples/react-native-showcase/src/App.tsx` — Presents Cardboard in Expo Web, iOS, and Android.
  - `examples/showcase/core/src/route.ts` — Adds the portable /0 showcase destination.
  - `docs/explorations/project-cardboard.md` — Records the client contract, riddle state graph, and constitutional play rule.
  - `package.json` — Adds runnable Cardboard demo commands.
  - `pnpm-lock.yaml` — Records the nested example dependency graph.
- **User context (verbatim):**
  > Let's implement all programs.
  > Let's also add a game controller
  > What would you do if you had to prioritize speed?
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 27th, 2026 at 11:43:21 p.m. EDT — `d92eef7c3e87` feat(cardboard): define the portable Rule Zero program

- **Implementation commit:** `d92eef7c3e873c0c519757f13f39928ffa921273`
- **Change:** Defined Cardboard Rule Zero as one portable Foldkit Program
- **Details:**
  - Modeled onboarding with a typed Foldkit Machine while retaining Program ownership of subscriptions, replay, and portable routes.
  - Added deterministic keyboard grammar, accessible and terminal projections, route round trips, and graph-integrity tests.
  - Expanded the Constitution with bounded screen-context provenance and voluntary family-flourishing measures.
- **Files:**
  - `examples/cardboard/core/src/program.ts` — Defines the canonical renderer-neutral Program.
  - `examples/cardboard/core/src/machine.ts` — Defines legal Rule Zero states and transitions.
  - `examples/cardboard/core/src/program.test.ts` — Proves behavior, graph integrity, and portable route round trips.
  - `docs/explorations/project-cardboard.md` — Records constitutional and architectural decisions.
  - `pnpm-lock.yaml` — Registers the new workspace package.
- **User context (verbatim):**
  > Let's implement all programs.
  > You can expand the constitution on every answer.
- **SpecStory:** unavailable — Codex desktop GUI session is not available to SpecStory capture.

## July 27th, 2026 at 11:36:22 p.m. EDT — `039e2e8c5163` feat: extend Project Cardboard Rule Zero

- **Implementation commit:** `039e2e8c516301d7e3dd3f2c81679e83a13fffd2`
- **Change:** Extend Project Cardboard Rule Zero as a public hosted game root
- **Details:**
  - Reframed /0 as the portable Constitution and game root that any verified host may serve through its own carrier.
  - Modeled press, hold, opening, configuration, completion, skip, and reset as one immutable transition loop projected into visual, accessibility, console, and terminal presentations.
  - Added Arrow and Vim navigation, triple-Space skip, completion controls, six presentation profiles, and a literal RGB negative preview.
  - Recorded the installed Effect Machine audit, state-driven navigation boundary, hermetic hosting direction, and typed non-executable Message boundary.
- **Files:**
  - `.lavish/project-cardboard-zero.html` — Provide the interactive hosted Rule Zero game, cross-medium state readout, keyboard controls, and negative-theme review surface.
  - `docs/explorations/project-cardboard.md` — Record the public hosting model, game semantics, Effect comparison, navigation fit, accessibility behavior, and execution boundary.
- **User context (verbatim):**
  > Slash zero is constitution
  > Also for the CLI, we need to note that the button is being held.
  > You just do host, and then enter somebody's host address slash zero
- **SpecStory:** unavailable — Codex desktop GUI task; no verified SpecStory CLI capture or durable public URI is available.

## July 27th, 2026 at 11:25:35 p.m. EDT — `74cc5a7bbcb4` feat: prototype Project Cardboard Rule Zero

- **Implementation commit:** `74cc5a7bbcb464a29d75249009894da39845ffa3`
- **Change:** Prototype Project Cardboard Rule Zero and its civic foundation
- **Details:**
  - Built an interactive black-square onboarding prototype with press, hold, keyboard, live-readout, reduced-motion, and selectable accessibility profiles.
  - Defined /0 as a public portable home route while separating private state into explicit revocable capability URIs.
  - Drafted Rule Omega, a declaration, constitution, Bill of Rights, rule lifecycle, and typed claim-stake boundary.
  - Scoped security evidence to reproducible builds, declared capabilities, bounded resources, sandboxing, and observed behavior instead of claiming universal malware absence.
- **Files:**
  - `.lavish/project-cardboard-zero.html` — Provide the interactive Rule Zero and accessibility-profile review surface.
  - `docs/explorations/project-cardboard.md` — Record Cardboard principles, state-machine semantics, rights, evidence limits, and governance process.
- **User context (verbatim):**
  > It's called Cardboard.
  > Let's design first the black button.
  > slash zero is peace. slash zero is home.
  > start drafting a constitution and a declaration for me, a Bill of Rights
- **SpecStory:** unavailable — Codex desktop GUI task; no verified SpecStory capture or durable public URI is available.

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
