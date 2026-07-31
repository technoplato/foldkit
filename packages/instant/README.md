# @foldkit/instant

`@foldkit/instant` provides transport-neutral, Effect-native storage primitives
for synchronizing Foldkit Programs through InstantDB.

The package persists Message proposals, durable proposal rejection resolutions,
globally accepted Message occurrences, append-only projection checkpoints,
immutable effect requests, and append-only effect placement generations. Model
checkpoints are an optimization. Accepted Message occurrences remain the source
of truth.

InstantDB transaction results are reported as `Enqueued` or `Synced`. Neither
result means that an admission sequencer has accepted a proposal. An admission
sequencer advances the global sequence only after Instant reports its
strict-create write as `Synced`.

`makeSharedProgramProcessor` connects a Foldkit Program runtime to a
subject-and-session-scoped store. It restores the accepted tape and the
Client's durable pending proposals, projects Schema-decoded local Messages by
calling the same Program update function without executing Commands, rebases
that projection after every accepted or rejected terminal outcome, applies each
accepted Message exactly once, and keeps replay inspection inert.

There is no per-Message optimism allowlist. A Message participates when it is
part of the Program's Message Schema, its versioned codec validates the wire
record, and the Program update function handles it. Malformed payloads and
inconsistent provenance never reach update.

The admission sequencer is an explicitly single-writer ordering and
protocol-validation role. It is not the owner of Program execution. Any
eligible Processor can host it when that Processor has the trusted writer
capability and is designated by the Program session. The compatibility export
`makeAcceptanceAuthority` observes the current session, stops admission after
revocation or sequencer rotation, validates effect-result assignment
generations, and uses Instant unique constraints plus strict-create
transactions to prevent history from being overwritten.

Processor rooms carry only transient capability, availability, liveness, and
activity hints. Durable effect requests and placement decisions remain in the
store. Instant streams are exposed only for large linked artifacts, never as a
replacement for the authoritative Message tape.

`makeSubjectScopedProgram` owns the renderer-neutral authentication lifecycle.
It clears the old public Program state, closes every resource in the old
subject's Scope, and only then allocates the replacement subject. Generation
fences suppress stale snapshots and allocation completions. Its `signOut`
operation closes the active Scope before invoking the host authentication
adapter. Browser and native Clients translate provider observations and render
the resulting state, but do not implement subject replacement themselves.

Applications still own authentication UI, subject membership, sequencer
deployment, Message codecs and migrations, placement policy, and host-side
Command executors. This package does not elect a sequencer or put executable
closures, authentication credentials, or media bytes in Messages.
