# @foldkit/instant

`@foldkit/instant` provides transport-neutral, Effect-native storage primitives
for synchronizing Foldkit Programs through InstantDB.

The package persists Message proposals, globally accepted Message occurrences,
append-only projection checkpoints, and effect requests. Model checkpoints are
an optimization. Accepted Message occurrences remain the source of truth.

InstantDB transaction results are reported as `Enqueued` or `Synced`. Neither
result means that an acceptance authority has accepted a proposal.

This initial package does not elect an acceptance authority, claim effect
requests, or execute Commands remotely. Applications own those policies.
