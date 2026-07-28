# Change Log

Newest entries appear first. Implementation commits and intent are recorded separately from ledger-only commits.

<!-- change-log:entries -->

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
