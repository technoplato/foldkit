# Versioned Messages | Exploration

Status: prototype only. This document does not establish a Foldkit package API.

## Goal

Foldkit Programs already define a current Message Schema and a Program version. Replay
tapes preserve encoded Messages and run Program migrations before decoding them with the
current Schema. This exploration asks whether an event can also expose a stable, canonical
v0 wire representation and support conversion in both directions.

The answer is qualified:

- Upgrading a valid old representation to the current Message can be total,
  deterministic, and testable.
- Downgrading a current Message can be total and lossless only when the old representation
  can express every distinction made by the current Message.
- Once a current Message contains information absent from v0, Foldkit must either reject
  that downgrade, preserve the information in an explicitly designed extension field, or
  label the conversion as lossy. Silently dropping it is not a valid bidirectional codec.

The prototype chooses an explicit, typed downgrade failure.

## Canonical public v0 wire representation

The example uses one stable event identifier that is independent of the current TypeScript
constructor name:

```json
{
  "eventId": "Foldkit.Example.CounterAdjusted",
  "version": 0,
  "payload": { "delta": 3 }
}
```

The identifier names the enduring event. The version selects the payload grammar. It must
not contain a button label, host gesture, screen name, or current implementation type. A
graphical click, terminal command, agent request, or imported replay can all produce the same
domain event after their host-specific input has been interpreted.

The prototype treats this object as canonical. Object keys, integer validation, event id,
and version are enforced by an Effect Schema. Canonical JSON byte ordering is a separate
serialization concern and is required only where bytes are hashed or signed.

## Upgrade chain

The example has three semantic representations:

| Representation | Versioned payload             | Meaning                         |
| -------------- | ----------------------------- | ------------------------------- |
| v0             | `eventId`, `delta`            | Canonical public representation |
| v1             | `eventId`, `amount`           | Lossless field rename           |
| current v2     | `eventId`, `amount`, `origin` | Domain Message with provenance  |

The upgrade functions are adjacent and deterministic:

```text
v0 --upgradeV0ToV1--> v1 --upgradeV1ToCurrent--> current v2
```

Upgrading v0 supplies `Legacy` as the one documented provenance value. The conversion does
not inspect time, randomness, storage, a host, or an Effect Layer. The same accepted input
therefore always produces the same current Message.

Adjacent migrations are preferable to every-old-version-to-current functions. Each schema
change has one local transformation and the chain remains auditable. A migration must be
total for every value accepted by its source Schema. Invalid source values fail Schema
decoding rather than entering the migration.

## Bidirectional conversion and the downgrade limit

Effect's `SchemaTransformation.transformOrFail` represents the correct contract. Decoding
upgrades v0 into the current Message. Encoding attempts to downgrade the current Message
and can fail with a Schema issue.

The following subset round trips exactly:

```text
v0 -> current(origin: Legacy) -> v0
```

The following current values do not have a v0 inverse:

```text
current(origin: User)
current(origin: Automation)
```

Both would collapse to the same v0 value if `origin` were discarded. Decoding that v0 value
could not know which original value to restore. No implementation technique can make that
mapping lossless. It is an information-capacity problem, not a TypeScript limitation.

A future API should therefore distinguish these operations:

- `upgrade`: total for values accepted by the historical Schema.
- `downgrade`: fallible when the target version cannot represent a current value.
- `projectLossy`: optional and conspicuously named when a product intentionally accepts
  information loss.

Foldkit should not claim that every Message can always be downgraded to v0. A total lossless
downgrade is possible only if v0 was designed as a permanent superset, includes a preserved
opaque extension payload, or the current Message never adds a new semantic distinction.
Each option has costs. A permanent superset weakens validation, opaque extensions complicate
canonicalization, and freezing semantics prevents useful evolution.

## Schema transforms

The prototype uses ordinary Effect facilities rather than a second decoder system:

- `Schema.Struct` defines each accepted wire version.
- Pure adjacent upgrades construct values through their target Schemas.
- `SchemaTransformation.transformOrFail` combines v0 decoding with a fallible encoding
  direction.
- `MessageDowngradeError` explains why a current Message cannot be represented by v0.

This keeps wire validation, conversion, and TypeScript inference aligned. It also makes the
partial nature of downgrade visible in Effect error channels and Schema encoding tests.

## Replay tape compatibility

Replay tape migration remains a Program concern. The tape header contains the Program id and
version. Foldkit reads that header, executes the Program's adjacent migrations on encoded
JSON, and only then decodes the Model and Messages through the current Schemas.

The prototype supplies two migrations:

```text
tape v0 messages -> tape v1 messages -> tape v2 current Messages
```

Each migration first decodes the complete source envelope and exact versioned Message shape
with a Schema. It then updates the header and every transition Message while preserving the
remaining JSON fields. A v0 tape is finally replayed with the current update function and
reconstructs the same count.

Important consequences:

- Historical Commands remain inert. Version migration changes encoded data, not replay
  execution rules.
- The stable event identifier survives historical wire versions even if an internal
  Message constructor is renamed.
- A migration must preserve transition order, source, operation identity, settlement,
  Command records, and timestamps unless the Program version explicitly changes their
  semantics.
- A content-addressed id authenticates the original stored bytes. Migrating a loaded tape in
  memory must not pretend those migrated bytes have the same content address. Exporting the
  migrated current tape produces a new address.
- Current Foldkit migrations are synchronous `Schema.Json -> Schema.Json` functions. Schema
  decode failures thrown inside them are reported by replay import as migration failures.
  This prototype does not propose changing that package API.

## Stable event identifiers

The stable identifier and the internal Message `_tag` serve different purposes:

- `eventId` is the durable public identity used across versions and clients.
- `_tag` is the current domain discriminator used by update and Effect Match.

They may initially share similar wording, but migrations must not depend on that coincidence.
Renaming a TypeScript constructor or changing a host's action label must not create a new
event identity. A genuinely different fact, with different domain meaning, should receive a
new identifier instead of overloading an old payload version.

Identifiers should be centrally owned by the Program or domain package, globally unambiguous
within the application's tape ecosystem, and immutable after publication.

## Laws to require

For every supported historical version `n`:

1. Upgrade determinism: `upgradeN(value)` always produces the same current Message.
2. Source completeness: every value accepted by the vN Schema upgrades successfully.
3. Current validity: every upgraded value is accepted by the current Message Schema.
4. Historical round trip: when downgrade succeeds,
   `downgradeN(upgradeN(value)) = value`.
5. Current subset round trip: for every current value representable by vN,
   `upgradeN(downgradeN(value)) = value`.
6. Replay equivalence: migrating and replaying an old tape reconstructs the documented
   current Model without executing historical Commands.
7. Stable identity: adjacent migrations preserve `eventId` unless the migration explicitly
   maps one retired event into a different current fact.

The prototype tests upgrade determinism, both successful round-trip directions for the
representable subset, rejection of a lossy downgrade, and v0 replay migration through the
current update function.

## Possible framework shape

No Foldkit package change is justified yet. The smallest useful future abstraction would
collect Schemas and adjacent transforms for one stable event while keeping current domain
Messages and Program migrations explicit. It should derive upgrade chains and law tests, not
introduce a mutable registry or a second source of truth.

Before promoting an API, the exploration needs at least one multi-variant Program and one
real evolution that splits or combines events. Those cases determine whether versioning is
best attached to each stable event, to the complete Message union, or only to Program tape
migrations.

## Prototype

The executable proof lives in `examples/message-versioning`. It is intentionally isolated
from Foldkit packages. Its tests demonstrate the current Effect Schema mechanics and replay
compatibility without committing the framework to an API.
