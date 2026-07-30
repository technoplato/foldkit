# InstantDB Shared Program Processors | Architecture Exploration

## Status

This is a Talk-layer exploration. It records current terminology, desired
behavior, candidate policies, and unresolved decisions. It does not authorize
an implementation or claim that the described InstantDB adapter exists.

## Goal

Run one portable Foldkit Program across any number of authenticated or
guest-paired devices and processes. Every participating Processor consumes the
same accepted Message occurrences and derives the same logical Model. Each
Client renders that Model through its own interaction surface and renderer.
Commands execute through Processors that advertise the required capabilities.

The synchronization contract is the Message history. A synchronized Model
snapshot is not the source of truth. Each Processor may keep a local,
disposable projection checkpoint so startup can apply only the Message tail.

The current `ProgramRuntime` executes every Command returned by update. It does
not yet implement distributed placement. Shared Program mode therefore requires
a new runtime scheduler boundary. Every Processor applies each accepted Message
and derives the same next Model. Only the Processor selected for a manifest
executes its local Command Effect; the other Processors keep that Command inert
and wait for its factual result Message. An opaque Command closure cannot be
serialized or reverse-engineered into a durable request. The proposed
Schema-defined effect manifest supplies the portable data from which the
scheduler creates that request.

## Terms

| Term               | Meaning                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Program            | The portable Model, Message, update, Commands, lifecycle definitions, routes, version, and migrations.                                                        |
| Client             | One complete runnable adapter. It owns interaction, rendering, platform Layers, URI carrier, and launch behavior.                                             |
| Host               | The composition and lifecycle owner of one Client.                                                                                                            |
| Processor          | One running Program occurrence, realized by one `ProgramRuntime`, that consumes Messages and advertises capabilities. One Client may host several Processors. |
| Capability         | A plain declarative description of work a Processor can perform, such as `Camera.Capture`, `Bluetooth.Pair`, or `Banking.SWIFT.Write`.                        |
| Message occurrence | One immutable fact plus its versioned wire identity and transport provenance.                                                                                 |
| Command            | A finite request for side-effecting work returned by update. The current executable Command closure is not a wire format.                                     |
| Effect manifest    | Proposed Schema-defined public metadata alongside a local Command Effect: effect ID and version, public arguments, placement, and result contract.            |
| Effect request     | A durable, versioned, idempotent description produced from an effect manifest when work may move between Processors or survive their lifetimes.               |

Processor is an architectural role. `ProgramRuntime` remains the concrete
Foldkit runtime API used to realize that role.

## Operating modes

These modes describe current behavior and may change during one session. They
are not separate copies of the Program.

### Replay inspection

A Processor applies recorded Messages with Commands inert. It may inspect any
settled frame and may branch into a new live history only from a settled point.

### Shared Program

Every participating Processor applies the same accepted Message occurrences in
the same order. Any participant may originate a Message. Clients may render
different responsive presentations while preserving the same logical Model and
available Program actions.

### Assisted control

An authenticated helper, a guest support specialist, or an agent joins a
revocable session and sends ordinary Program Messages. The helper controls only
the application. System permission dialogs and physical actions remain on the
person's device. A helper Client can render modeled system guidance without
pretending it can press an operating-system control.

### Scoped handoff

A Client delegates one narrow capability to a temporary Processor. For example,
a banking website displays a QR code that opens a short-lived check-capture
Program on a phone. The phone receives only the minimum session state, captures
the image, returns a content address or private destination receipt, and loses
access when the session ends.

## InstantDB boundaries

Use durable Instant entities for immutable Message occurrences, session
membership, effect requests, results, and revocation. A live query subscription
is adapted into an Effect Stream, but the adapter must deduplicate occurrences
because query subscriptions return current results rather than a durable broker
delta.

Use rooms and presence for temporary coordination:

- connected Processor identity;
- advertised capabilities and protocol ranges;
- current role and last applied Message position;
- transient cursors or liveness.

Presence is not durable authority. Room topics are fire-and-forget and must not
carry the only copy of a Program Message or effect request.

Transient presence may help the scheduler choose an executor. If capability
availability, role, or action availability is visible to a person or changes
product behavior, an accepted Message must project that fact into the Model. A
Client must never render product state directly from presence beside the
Program Model.

Use Instant Streams for large resumable byte payloads such as captured media or
generated artifacts. Link the stream from a durable Message or effect result.
Do not treat a byte stream as the structured multi-writer Message journal.

Instant Auth supplies application-local user and guest identity. Foldkit still
owns device identity, Processor identity, pairing invitations, scoped
membership, revocation, and cross-application subject mapping.

These boundaries follow Instant's documented
[live-query](https://www.instantdb.com/docs/instaql),
[presence and topic](https://www.instantdb.com/docs/presence-and-topics),
[stream](https://www.instantdb.com/docs/streams), and
[authentication](https://www.instantdb.com/docs/auth) semantics.

## Message and execution data

Keep four data boundaries distinct.

### Domain Message

The payload contains only facts that update needs:

- the factual Message tag and data;
- stable domain, entity, session, and request identities;
- sanitized success or failure;
- semantic origin only when origin changes domain behavior.

For example, `SelectedRevealPage` may include `RemoteControl({ controllerId })`
because the Program records who currently controls the deck. It does not need
an IP address, retry count, or WebSocket identity.

### Message envelope

The transport envelope carries occurrence and delivery provenance:

- envelope version and Message occurrence ID;
- Program ID and Program version;
- event ID and event version;
- authenticated user or guest identity;
- originating actor, Client, device installation, ingress Processor, and
  session IDs;
- origin sequence and accepted actor sequence;
- causation and correlation IDs;
- created, accepted, and observed times;
- content digest, signature, and authentication evidence when required.

Processors use the envelope for admission, ordering, deduplication,
compatibility, audit, and Command placement. Duplicate occurrence IDs are
rejected before acceptance into the shared journal. Once a Message occurrence
is accepted, every compatible Processor applies it in the same order. update
does not silently depend on transport-only data.

### Durable effect request

When a Command must survive or move, persist:

- request format version;
- stable effect ID and effect version;
- request ID and idempotency key;
- causative Message occurrence ID;
- required capability and minimum capability version;
- placement policy;
- immutable public arguments or content addresses;
- semantic deadline and cancellation generation;
- permitted result Message IDs and versions.

The Client's Host supplies platform Layers when it constructs a Processor. The
Processor consumes those services and advertises only a sanitized capability
description. Private keys, refresh tokens, camera handles, file bookmarks, and
provider credentials remain inside the executing Processor's Layer. The
request carries only an opaque handle or grant reference when necessary.

### Result Message

The executing Processor sends a factual result such as
`SucceededCaptureCheck` or `FailedCaptureCheck`. The result repeats the request
ID. The authority-side idempotency boundary prevents the same semantic result
from being accepted twice. If conflicting or stale result facts are accepted,
every Processor still applies them, and update deterministically leaves the
Model unchanged. Executor telemetry remains in the envelope unless it changes
product behavior.

## Capability-driven placement

Authorization and placement answer different questions.

Authentication and session membership decide whether an incoming Message is
accepted into the shared Program. After acceptance, Processor selection is
capability-driven. Do not encode a list of device brands that are "allowed" to
run a Command.

A candidate placement description has four independent parts:

| Part        | Candidate values                                                                  | Question                                                      |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Cardinality | `One`, `Every`                                                                    | How many matching Processors perform this occurrence?         |
| Capability  | A nested capability ID plus minimum version                                       | What must a Processor be able to do?                          |
| Affinity    | `OriginClient`, `IngressProcessor`, `Processor(id)`, `Previous(requestId)`, `Any` | Which capable Processor is preferred or required?             |
| Unavailable | `Wait`, `UseAnyCapable`, `Fail`, `Ignore`                                         | What happens when the affinity cannot currently be satisfied? |

`OriginClient` selects a capable Processor hosted by the Client where the
person or caller triggered the Message. A one-shot Client may host no Processor,
so its unavailable policy still applies. `IngressProcessor` identifies the
Processor that admitted the Message and is not a substitute for the originating
Client. Neither affinity means phone, tablet, or any other platform.

## Concrete policy examples

### Check capture started on a banking website

1. The browser Processor sends `ClickedScanCheck`.
2. Every Processor applies that Message and update requests `CaptureCheck`.
3. The effect request requires `Camera.Capture`, cardinality `One`, affinity
   `OriginClient`, and unavailable behavior `UseAnyCapable`.
4. The browser lacks the capability. A paired phone advertises it and receives
   the request.
5. The phone returns `SucceededCaptureCheck({ requestId, imageStreamId })`.
6. Every Processor applies the result and shows the captured check.

### Hearing-aid pairing with a support specialist

1. The support Processor sends `ClickedStartPairing` into the user's authorized
   assisted-control session.
2. Navigation changes everywhere because it is Model state.
3. `PairHearingAid` requires `Bluetooth.LowEnergy.Pair`, cardinality `One`,
   affinity `Processor(patientPhone)`, and unavailable behavior `Wait`.
4. The support browser renders the modeled pairing state but cannot claim that
   it pressed the iOS Bluetooth permission button.
5. The patient's phone sends permission, discovery, connection, success, and
   failure Messages as those facts occur.

### Haptic feedback

`PulseHaptic` requires `Haptics.Pulse`, cardinality `One`, affinity
`OriginClient`, and unavailable behavior `Ignore`. A keyboard action
originating on a Mac does not make an unrelated phone vibrate. A touch action
originating on a capable phone may.

### Clipboard

`CopyReceipt` requires `Clipboard.Write`, cardinality `One`, and affinity
`OriginClient`. If the user explicitly chooses "Copy on Mac," use
`Processor(selectedMac)` instead. Clipboard identity changes the meaning, so an
arbitrary capable fallback would be surprising.

### Bank transfer

`SubmitBankTransfer` requires `Banking.SWIFT.Write`, cardinality `One`, affinity
`Any`, and unavailable behavior `Wait` or `Fail` according to product policy.
Only trusted banking Processors advertise that capability. Dispatch is
at-least-once, so the authority must enforce the stable idempotency key. Every
Client observes the resulting `SucceededSubmitBankTransfer` or
`FailedSubmitBankTransfer` Message.

### Background microphone or timer

These are not never-ending Commands. A model-gated Subscription requires
`Microphone.Capture` or `Clock.Timer` from the Processor's Layer and continues
to send Messages while active. A ManagedResource owns a stateful handle when
Commands also need it.

Shared Program mode also needs lifecycle placement. Otherwise every Processor
whose Model enables the same Subscription or ManagedResource can emit duplicate
Messages or acquire the same physical resource. The lifecycle policy needs its
own capability, cardinality, affinity, durable lease or fencing token, takeover
rule, release rule, and reconnect behavior. Acquisition remains derived from
Model state. A scheduler assignment gates whether a particular Processor
acquires locally, while accepted acquisition, loss, and product-visible
availability facts return through Messages.

## Non-captive terminal

A one-shot terminal Client should be able to address a Processor owned by a
longer-lived headless Client and Host:

```text
one-shot CLI Client
  -> send Message or request snapshot
  -> headless Client and Host keep the Processor Scope alive
  -> Subscriptions and ManagedResources continue
  -> CLI prints the current Model snapshot and exits
```

Timers, microphone capture, and other ongoing sources continue between CLI
invocations. That one-shot CLI remains snapshot-based. A separately attached
non-captive terminal may use `observeModel` or a stream transport for live
redraws. A separate issue tracks this runtime and host seam.

## Versioning

Keep these versions independent:

- Program version;
- event ID and event version;
- envelope version;
- effect ID and effect version;
- effect-request format version;
- Processor protocol range;
- capability version;
- local projection version.

Decode an old event with its exact Schema, then migrate through adjacent
versions. Never silently reinterpret an unknown Message or drop it and continue
with a divergent Model. A Processor that cannot understand an accepted Message
must enter an explicit incompatible state.

Deploy readers that understand old and new versions before writers emit the new
version. A strict shared-control session requires an overlapping protocol and
Program range. Historical Commands remain inert. Pending durable effect
requests retain their original effect version until an explicit migration or
terminal result replaces them.

## Next design sequence

1. Settle the placement algebra: cardinality, capability, affinity, and
   unavailable behavior.
2. Define the Message envelope and distinguish semantic provenance from
   transport provenance.
3. Define Processor presence, capability versioning, and compatibility
   negotiation.
4. Define accepted Message ordering and offline proposal behavior.
5. Define effect-manifest encoding and how the runtime keeps unselected
   Commands inert.
6. Define effect-request idempotency, claiming, retry, cancellation, and
   terminal result rules.
7. Define lifecycle placement, leases, fencing, takeover, and release.
8. Define authenticated, guest, and QR pairing with expiry and revocation.
9. Extend the Client Matrix with operating mode, Processor identity,
   capability, and evidence axes.
10. Prove one narrow flow as an observable core before adding InstantDB
    adapters.

The first unresolved decision is whether the four-part placement description is
the right public vocabulary, especially whether `Every` is a legitimate
Command cardinality or whether every shared presentation effect should stay a
Client concern.
