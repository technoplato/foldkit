# @foldkit/instant

`@foldkit/instant` provides transport-neutral, Effect-native storage primitives
for synchronizing Foldkit Programs through InstantDB.

The package persists Message proposals, globally accepted Message occurrences,
append-only projection checkpoints, immutable effect requests, and append-only
effect placement generations. Model checkpoints are an optimization. Accepted
Message occurrences remain the source of truth.

InstantDB transaction results are reported as `Enqueued` or `Synced`. Neither
result means that an acceptance authority has accepted a proposal. An
acceptance authority advances the global sequence only after Instant reports
its strict-create write as `Synced`.

`makeSharedProgramProcessor` connects a Foldkit Program runtime to a
subject-and-session-scoped store. It restores the accepted tape and the
Client's durable pending proposals, applies each accepted Message exactly once,
keeps replay inspection inert, and preserves proposals while detached.

`makeAcceptanceAuthority` is an explicitly single-writer authority. It observes
the current Program session, stops admission after revocation or authority
rotation, validates effect-result assignment generations, and uses Instant
unique constraints plus strict-create transactions to prevent history from
being overwritten.

Processor rooms carry only transient capability, availability, liveness, and
activity hints. Durable effect requests and placement decisions remain in the
store. Instant streams are exposed only for large linked artifacts, never as a
replacement for the authoritative Message tape.

Applications still own authentication UI, subject membership, acceptance
authority deployment, Message codecs and migrations, placement policy, and
host-side Command executors. This package does not elect an authority or put
executable closures, authentication credentials, or media bytes in Messages.
