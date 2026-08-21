# Foldkit Instant Counter

This example is one renderer-free Foldkit coordinator running on multiple authenticated Processors. The coordinator embeds the exact `CounterProgram` exported by `counter-core-example`. Its nested Counter Model, Messages, init, restore, update, and Commands are the same source used by the plain Foldkit, React, CLI, and TUI Counter Clients. The coordinator adds only the user-visible lifecycle of portable capability requests.

Authentication, Instant entities, accepted ordering, presence, provenance, pending proposal state, Processor identity, connection state, and replay controls stay in framework and transport adapters. They are not Counter Model fields or Counter Messages.

Every Processor rebuilds the same coordinator Model from the same globally ordered accepted Message occurrences. The originating Client also projects every locally authored, Schema-decoded unresolved Message over that accepted Model. Projection calls the same Program update function but discards Commands. When acceptance or rejection arrives, the framework rebases the remaining outbox from the accepted Model, so acceptance cannot apply one action twice. Replay remains accepted-history-only and inert.

`ClickedIncrement`, `ClickedDecrement`, and `ClickedReset` do not opt in individually. They project for the same reason any future ordinary Message will project: the Message belongs to the canonical Program Schema, the codec validates its versioned payload and provenance, and the Program update function consumes it. Effect-result proposals use the same projection path but retain their additional request, placement-generation, executor, and idempotency validation.

InstantDB synchronizes the tape, pending proposal state, durable rejection resolutions, and Processor presence. The schema reserves disposable projection checkpoints for a later startup optimization, but this demo does not write or restore them. Accepted Messages remain authoritative. Optimistic projection is explicitly provisional and local to the originating Client.

The event registry decodes current families and the explicitly supported v0 one-step increment, decrement, and reset family before reduction. A historical payload outside that declared v0 contract is rejected instead of being silently approximated by multiple canonical Counter Messages.

The browser Client supports Instant email magic codes and Google OAuth. Signing in as the same Instant user on two Clients selects the same private Program session without putting the subject or session identifier in the URL.

## Security boundary

The browser receives only the public `VITE_INSTANT_APP_ID`. `scripts/with-public-instant-env` removes `INSTANT_CLI_AUTH_TOKEN` before Vite starts. `INSTANT_APP_ADMIN_TOKEN` stays in the Vite process so `/__foldkit/hosted-identity/session` can mint Instant sessions from Cloudflare Access. Vite never exposes non-`VITE_` variables to the browser. Instant owns its refresh token internally. Foldkit Models, Messages, envelopes, replay tape, presence, and effect arguments never retain an Instant refresh token, admin token, email magic code, OAuth authorization code, private key, or executable closure.

During a Google callback, Instant Core temporarily receives the OAuth authorization code in the browser query string and scrubs it during initialization. This example does not copy that code into Foldkit state. It does not claim that unrelated browser, proxy, or server logs redact the callback URL.

`INSTANT_APP_ADMIN_TOKEN` is trusted-process configuration for the headless admission sequencer and automated acceptance orchestrator. `INSTANT_CLI_AUTH_TOKEN` is for trusted Instant CLI commands. Never expose either through a Vite environment variable. The live-acceptance runner gives Vite only the public app identifier and gives the scoped headless child only the app identifier, admin token, disposable state path, and synthetic-subject allowlist. It does not forward the CLI token to either child.

The included Instant permissions are default-deny. Authenticated subjects can create, read, and refresh only their own session claim, propose Messages, and read their own materialized Program session. The claim is uniquely keyed by `subjectId`; an owned refresh updates only `claimedAtMs`, and the owner cannot reassign its `subjectId`. Browser Clients cannot create Program sessions, accepted occurrences, rejection resolutions, checkpoints, placements, or effect-request rows. The trusted admission sequencer derives and materializes the Program session, including a random high-entropy room identifier, then writes accepted or rejected terminal records.

Client, device, and Processor identifiers are subject-authenticated and caller-asserted provenance. The acceptance codec proves internal consistency and the permissions prove the authenticated subject. This demo does not claim hardware-backed device attestation. The random room identifier is a transient bearer boundary for routing hints, not durable admission authority.

Setting a Program session's `isRevoked` field fences new acceptance and stops its headless admission sequencer. This increment does not yet claim full data-plane revocation. An already running same-subject browser can retain its cached history and room bearer, and can enqueue proposals that will not be accepted, until that Client signs out or reloads.

## Configure the persistent demo app

The canonical `foldkit-instant-demo` skill provisions and reuses one development Instant app. Its wrapper injects credentials into only the child process.

From the repository root:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter instant:schema

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter instant:perms
```

These commands push the local Schema and permissions to the persistent app selected by the credential wrapper. They are idempotent: rerunning them against matching remote definitions is expected to succeed without changing fixture data or creating another app. Push the corresponding remote definition after a local change, and run both before acceptance when either may have drifted. The remote permissions must include owner-only session-claim updates so an authenticated Client can refresh its unique claim without granting another subject access. `acceptance:live` exercises the deployed shape and rules, but does not push or independently diff them.

The persistent demo app is configured with the Google client name `foldkit-google-web` and the localhost website origin used by Vite. That configuration is managed and checked separately from `acceptance:live`; the command neither inspects it nor exercises the Google redirect. Email magic codes need no provider secret.

## Run live acceptance

Run the automated authenticated acceptance from the repository root. It requires the Google Chrome channel installed on the Mac. Do not start another headless admission sequencer or a server on `localhost:5173` while it runs because the acceptance process owns both:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter acceptance:live
```

The successful JSON report proves all of the following against the persistent remote app:

1. Two isolated headless Mac Chrome contexts authenticate as the same Instant subject with ephemeral email magic codes. They converge on the same private accepted Message tape, which finishes with exactly six accepted occurrences at contiguous sequences 1 through 6.
2. One Client detaches its Processor through the UI while the other advances the Program. The detached Client remains on its prior Model, then catches up from the accepted tape after reconnecting. This is not a physical network-loss test.
3. A proposal reaches the raw inbox while the admission sequencer is stopped. The originating Client projects it immediately while its peer stays on accepted state. Restarting the sequencer accepts that proposal exactly once and both Clients converge without a second visible increment.
4. An authenticated public Client can place a deliberately malformed proposal in its own raw inbox, but it never reaches Program update. The sequencer writes a sanitized durable rejection resolution and does not accept it. The same sequencer process survives, then accepts a later valid proposal.
5. A Client can remain on an inert historical replay frame while another accepted Message advances the live Program, then return to the current accepted Model.
6. The authenticated browser can refresh only its own claim's `claimedAtMs`. An attempted `subjectId` reassignment is rejected, the original claim remains unchanged apart from the permitted refresh time, and no forbidden-subject claim appears.
7. A separately authenticated subject can read neither the first subject's Program session nor its accepted tape. Its attempted foreign-subject proposal is rejected specifically by the deployed permissions and creates neither a raw proposal nor an accepted occurrence.

This automated run reports `physicalDevices: 0`. Its two accepted Clients are isolated Chrome contexts on the Mac, not physical devices. Google coverage is outside this command: the persistent app is configured separately with a Google development client and localhost origin, while `acceptance:live` neither verifies that configuration nor exercises the Google redirect flow. The runner uses email magic-code authentication. The Instant Admin API generates the ephemeral codes, so real inbox delivery and manual code entry are also outside this run.

The runner creates two unique synthetic Instant users before starting a headless admission sequencer restricted to those subject identifiers. It also creates a random nonexistent subject identifier for the hostile claim-reassignment probe and a dedicated temporary headless-state directory. Its `finally` teardown attempts every cleanup tier even if another cleanup fails: all browser contexts, Vite and the headless sequencer, both synthetic users and all eight subject-owned entity families, the forbidden-subject probe data, and the temporary directory. The report emits `testFixturesRemoved: true` only after every cleanup resolves. It does not perform a second post-cleanup absence query, and the acceptance-only subject allowlist prevents its headless process from materializing or accepting unrelated shared-app data.

## Run the localhost demo manually

Start the headless admission sequencer Processor:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter headless
```

Set `FOLDKIT_INSTANT_COUNTER_HEADLESS_STATE_PATH` inside the wrapper child when an acceptance run needs a disposable non-secret actor-sequence and effect-attempt file. Put it in a dedicated directory created with `mktemp -d`, not directly under a shared directory such as `/tmp`. If it is absent, the process uses `~/.config/foldkit-instant-counter/headless-state.json`.

In another terminal, start the browser Client. The public-environment scrubber runs before `pnpm`, so neither `pnpm`, Vite, nor browser code receives the admin or CLI token:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  examples/instant-counter/scripts/with-public-instant-env \
  pnpm --dir examples/instant-counter dev
```

Open the Vite URL in two isolated browser contexts on the development laptop. In local Vite, the signed-out page includes **Debug login** buttons for `alice@fake.com` and `bob@fake.com`. Those buttons ask the headless process to mint Instant magic codes on loopback. They never receive the admin token. Use Alice in both tabs to get two Processors of one subject, or Alice in one tab and Bob in the other to exercise cross-subject permissions. Set `FOLDKIT_INSTANT_DEBUG_LOGIN=0` on the headless process to disable minting. Production builds omit the buttons.

Signed-in Clients share one session policy. Independent keeps navigation Processor-specific while domain Messages stay shared, so one Processor can stay on the list while another is on a counter detail, fact, or delete confirmation. Mirror copies domain and navigation to every Processor. Follow aligns a follower on the leader's next accepted Navigation Message, either as Observe or Remote control. Observe followers keep domain actions such as increment, decrement, reset, and add. They cannot open, leave, or change destinations themselves. The Foldkit browser, React, CLI, and TUI Clients all request that policy through the same controller. Mode is not a Program Model field.

In additional terminals, after the headless authority is running:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  examples/instant-counter/scripts/with-public-instant-env \
  pnpm --dir examples/instant-counter dev:react
```

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli login alice

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli show

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli run open:counter-1

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli run fact

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli run increment:counter-1 decrement:counter-1

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli mode independent

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli mode mirror

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter cli follow --leader <processor-id> --control observe
```

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter tui
```

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --filter instant-counter-expo-example dev-client
```

The CLI and TUI keep separate Processor identities under `~/.config/foldkit-instant-counter/clients/`. Copy a Processor id from one surface's chrome into another surface's Follow form or `cli follow` to Observe or Remote-control it. React listens on `http://localhost:5174`. The Expo Dev Client is a fifth Processor with its own AsyncStorage identity. Physical devices need `FOLDKIT_INSTANT_DEBUG_LOGIN_HOST=0.0.0.0` on the headless process so Alice and Bob codes can be minted over the LAN.

Otherwise sign in as the exact same Instant user with email magic codes or Google. Each browser context is a distinct Client with its own Processor, and the headless admission sequencer is a third Processor. All three run the same Program. The headless Processor additionally has trusted admission-writer and background-timer capabilities. Use the same authentication method unless those Google and email identities have already been linked in Instant. A Google identity and an email identity with the same displayed address must not be assumed to be the same authenticated subject.

The persistent demo app currently registers the Google OAuth origin for `localhost:5173`. That does not establish physical-phone acceptance because a phone cannot use the laptop's localhost origin. A physical two-device run needs a reachable HTTPS development origin registered with Instant and the Google OAuth client. Email magic-code authentication can then use that same reachable origin. Until that origin is configured and tested, this walkthrough claims localhost multi-Client acceptance only.

## Manual acceptance walkthrough

1. Press increment on either Client. The originating Client updates immediately while accepted sequence stays fixed and the proposal appears as local, enqueued, or synced. Its peer updates after acceptance. The originating Client rebases to that accepted occurrence without incrementing a second time.
2. Disconnect one Client. Continue changing the counter from the other. Reconnect the first Client and confirm it catches up from the accepted Message tape.
3. Inspect an earlier replay frame. The historical Model is inert and does not execute Commands. Propose another Message while inspecting, then return live to see the current accepted Model plus any unresolved local projection.
4. Request vibration, camera capture, or a device timer. If the current Client cannot perform it, the UI names a compatible live Processor or reports that it is waiting. Waiting may become Assigned when a capable Processor joins. Once Assigned, that request remains sticky to the selected Processor and is never automatically reassigned. The selected host makes one durable local claim before attempting the effect and returns success or failure as another factual Message through the normal acceptance path.
5. Request the background timer. Browser Processors deliberately do not advertise that capability, so the headless Processor receives the sticky assignment. Close both visible Clients while leaving the headless Processor running. Reopen a Client and reconstruct the accepted result.
6. Build and run the production preview once while online. Its service worker caches the application shell and same-origin assets without caching query-string callback URLs. After installation, reload with the network disabled and confirm the cached Client shell, accepted tape, and pending outbox remain available. A first-ever visit still requires the application shell to have been installed.

Audio transcription, speaker diarization, music identification, lyrics resolution, ambient sound recognition, Apple speech and sound recognition, translation, and acoustic analysis are represented by portable capability manifests. A Processor advertises only capabilities backed by its host. Until a matching adapter joins the room, the accepted request remains visibly waiting rather than pretending the current Client performed it.

Sticky assignment prevents two different selected Processors from physically performing the same request during automatic failover. It does not claim exactly-once physical completion because a host can disappear after touching the device but before publishing its factual result. If an assigned Processor disappears, the user must make a new request explicitly.

Run exactly one headless admission-sequencer process for this development deployment. The sequencer is a portable ordering and protocol-admission role, not the owner of Program execution. This first milestone places its trusted writer capability on the Mac headless Processor. Distributed lease election and a globally fenced physical-effect attempt are not implemented. A crash after the selected host records its local attempt but before it publishes the result can leave the request unresolved. Cancellation generations are reserved protocol fields and are not yet an active cancellation workflow.

The Program session designates the sequencer Processor ID. Accepted occurrences and rejection resolutions from any other Processor are rejected by Clients. That designation is routing and provenance, not authorization by itself. Instant's default-deny permissions and the trusted Admin credential determine who can write terminal records. The sequencer may reject malformed Schema/envelope data, scope or identity conflicts, invalid proposal-kind fields, and invalid effect-result correlation. It does not veto an ordinary schema-valid business Message. The Program update function remains the authority for what that fact means.

## Local verification

```sh
pnpm --dir examples/instant-counter typecheck
pnpm --dir examples/instant-counter test

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  examples/instant-counter/scripts/with-public-instant-env \
  pnpm --dir examples/instant-counter build

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  examples/instant-counter/scripts/with-public-instant-env \
  pnpm --dir examples/instant-counter preview
```
