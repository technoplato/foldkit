# Issue Tracker | Foldkit Client Matrix

This example runs one renderer-independent `IssueTrackerProgram` across Foldkit,
React, React Native, OpenTUI, and one-shot CLI Clients.

The Program owns typed navigation, the filing draft, live Issue collection
state, first-class Application and Library filing domains, and independent
selected-Issue observation. Clients only render `Destination` values and send
canonical `Message` facts.

The triage inbox observes `TriageCandidate` drafts from the same Instant app.
Each draft retains a first-class Application or Library, an exact
`RecordingSegment`, transcript text, and a protected share URL into the longer
recording context. Promote is the only transition that creates an Issue;
Dismiss leaves the canonical Issue collection unchanged.

The live web Clients use one Instant app through `@foldkit/instant-tools`.
Offline and test Clients use the same service contracts with deterministic
resources.

## Mac listener

`listener` follows the guest-readable Scribe Instant projection with the
read-only active-transcript primitive. Tuple inspired the primitive boundary,
but Tuple is neither installed nor called by this program. Only new
`initial: false`, finalized segments containing explicit issue language create
review drafts. The intentionally conservative local analyzer is deterministic;
it is not presented as an authoritative classifier.

Build and test it with:

```sh
pnpm --filter issues-listener-example test
pnpm --filter issues-listener-example build
```

The LaunchAgent source is
`listener/support/com.knophy.foldkit-issues-listener.plist`. It reads the
existing machine-local Instant environment file, never an admin token, and
writes only `RecordingSegment` and `TriageCandidate` entities. Its stdout and
stderr go to `/tmp/knophy-issues-listener.log` and
`/tmp/knophy-issues-listener-error.log`.

## Security boundary

Cloudflare Access protects the deployed web origin. It does not protect direct
Instant SDK traffic from browser or native Clients. The first deployment is an
explicitly temporary CF-only boundary: the Instant app identifier is public to
Clients, and Instant permissions remain the actual database boundary. Add an
Instant-authenticated identity bridge and restrictive permissions before this
tracker contains sensitive or broadly shared data.

Additional first-release weaknesses:

- Cloudflare Access protects the page and segment links but not the Instant
  websocket/API used by the client.
- Candidate promotion saves the Issue and then marks the candidate Promoted;
  this is not yet one atomic server transaction.
- Segment sharing currently re-opens the protected triage page at an anchored
  excerpt. It does not mint a separately revocable recipient-scoped share.
- The listener's cue-based analysis can miss or over-suggest issues; review is
  mandatory by design.
