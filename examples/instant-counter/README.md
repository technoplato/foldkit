# Foldkit Instant Counter

This example is one renderer-free Foldkit coordinator running on multiple authenticated Processors. The coordinator embeds the exact `CounterProgram` exported by `counter-core-example`. Its nested Counter Model, Messages, init, restore, update, and Commands are the same source used by the plain Foldkit, React, CLI, and TUI Counter Clients. The coordinator adds only the user-visible lifecycle of portable capability requests.

Authentication, Instant entities, accepted ordering, presence, provenance, pending proposal state, Processor identity, connection state, and replay controls stay in host and transport adapters. They are not Counter Model fields or Counter Messages.

Every Processor rebuilds the same coordinator Model from the same globally ordered accepted Message occurrences. InstantDB synchronizes the tape, pending proposal state, and Processor presence. The schema reserves disposable projection checkpoints for a later startup optimization, but this demo does not write or restore them. Accepted Messages remain the only authority.

The event registry decodes current families and the explicitly supported v0 one-step increment, decrement, and reset family before reduction. A historical payload outside that declared v0 contract is rejected instead of being silently approximated by multiple canonical Counter Messages.

The browser Client supports Instant email magic codes and Google OAuth. Signing in as the same Instant user on two devices selects the same private Program session without putting the subject or session identifier in the URL.

## Security boundary

The browser receives only `VITE_INSTANT_APP_ID`. Instant owns its refresh token internally. Foldkit Models, Messages, envelopes, replay tape, presence, and effect arguments never retain an Instant refresh token, admin token, email magic code, OAuth authorization code, private key, or executable closure.

During a Google callback, Instant Core temporarily receives the OAuth authorization code in the browser query string and scrubs it during initialization. This example does not copy that code into Foldkit state. It does not claim that unrelated browser, proxy, or server logs redact the callback URL.

`INSTANT_APP_ADMIN_TOKEN` is only available to the headless authority process. Never expose it through a Vite environment variable.

The included Instant permissions are default-deny. Authenticated subjects can create and read only their own session claim, propose Messages, and read their own materialized Program session. Browser Clients cannot create Program sessions, accepted occurrences, checkpoints, placements, or effect-request rows. The trusted authority derives and materializes the Program session, including a random high-entropy room identifier, then writes accepted records.

Client, device, and Processor identifiers are subject-authenticated and caller-asserted provenance. The acceptance codec proves internal consistency and the permissions prove the authenticated subject. This demo does not claim hardware-backed device attestation. The random room identifier is a transient bearer boundary for routing hints, not durable acceptance authority.

Setting a Program session's `isRevoked` field fences new acceptance and stops its headless authority. This increment does not yet claim full data-plane revocation. An already running same-subject browser can retain its cached history and room bearer, and can enqueue proposals that will not be accepted, until that Client signs out or reloads.

## Configure the persistent demo app

The canonical `foldkit-instant-demo` skill provisions and reuses one development Instant app. Its wrapper injects credentials into only the child process.

From the repository root:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter instant:schema

/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  pnpm --dir examples/instant-counter instant:perms
```

The persistent demo app is configured with the Google client name `foldkit-google-web` and the localhost website origin used by Vite. Email magic codes need no provider secret.

## Run the localhost acceptance experiment

Start the headless acceptance authority:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  examples/instant-counter/node_modules/.bin/tsx \
  examples/instant-counter/src/headless/entry.ts
```

Set `FOLDKIT_INSTANT_COUNTER_HEADLESS_STATE_PATH` inside the wrapper child when an acceptance run needs a disposable non-secret actor-sequence and effect-attempt file. Put it in a dedicated directory created with `mktemp -d`, not directly under a shared directory such as `/tmp`. If it is absent, the process uses `~/.config/foldkit-instant-counter/headless-state.json`.

In another terminal, start the browser Client. The public-environment scrubber runs before `pnpm`, so neither `pnpm`, Vite, nor browser code receives the admin or CLI token:

```sh
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  examples/instant-counter/scripts/with-public-instant-env \
  pnpm --dir examples/instant-counter dev
```

Open the Vite URL in two isolated browser contexts on the development laptop and sign in as the exact same Instant user. Each browser context is a distinct Client with its own Processor, and the headless authority is a third Processor. Use the same authentication method unless those Google and email identities have already been linked in Instant. A Google identity and an email identity with the same displayed address must not be assumed to be the same authenticated subject.

The persistent demo app currently registers the Google OAuth origin for `localhost:5173`. That does not establish physical-phone acceptance because a phone cannot use the laptop's localhost origin. A physical two-device run needs a reachable HTTPS development origin registered with Instant and the Google OAuth client. Email magic-code authentication can then use that same reachable origin. Until that origin is configured and tested, this walkthrough claims localhost multi-Client acceptance only.

## Acceptance walkthrough

1. Press increment on either Client. The originating proposal appears as local, enqueued, or synced until the authority accepts it. Both Clients then show the same accepted count once, with no duplicate reduction.
2. Disconnect one Client. Continue changing the counter from the other. Reconnect the first Client and confirm it catches up from the accepted Message tape.
3. Inspect an earlier replay frame. The historical Model is inert and does not execute Commands. Return live to see the current accepted Model.
4. Request vibration, camera capture, or a device timer. If the current Client cannot perform it, the UI names a compatible live Processor or reports that it is waiting. Waiting may become Assigned when a capable Processor joins. Once Assigned, that request remains sticky to the selected Processor and is never automatically reassigned. The selected host makes one durable local claim before attempting the effect and returns success or failure as another factual Message through the normal acceptance path.
5. Request the background timer. Browser Processors deliberately do not advertise that capability, so the headless Processor receives the sticky assignment. Close both visible Clients while leaving the headless Processor running. Reopen a Client and reconstruct the accepted result.
6. Build and run the production preview once while online. Its service worker caches the application shell and same-origin assets without caching query-string callback URLs. After installation, reload with the network disabled and confirm the cached Client shell, accepted tape, and pending outbox remain available. A first-ever visit still requires the application shell to have been installed.

Audio transcription, speaker diarization, music identification, lyrics resolution, ambient sound recognition, Apple speech and sound recognition, translation, and acoustic analysis are represented by portable capability manifests. A Processor advertises only capabilities backed by its host. Until a matching adapter joins the room, the accepted request remains visibly waiting rather than pretending the current Client performed it.

Sticky assignment prevents two different selected Processors from physically performing the same request during automatic failover. It does not claim exactly-once physical completion because a host can disappear after touching the device but before publishing its factual result. If an assigned Processor disappears, the user must make a new request explicitly.

Run exactly one headless authority process for this development deployment. Distributed leader election and a globally fenced physical-effect attempt are not implemented. A crash after the selected host records its local attempt but before it publishes the result can leave the request unresolved. Cancellation generations are reserved protocol fields and are not yet an active cancellation workflow.

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
