---
'foldkit': minor
'@foldkit/instant': minor
---

Expose pure Program Message projection on renderer-free runtimes. Projection
uses the Program update function without mutating the runtime, appending to its
journal, or executing Commands.

Project every Schema-valid unresolved Message for the originating Client over
the accepted Model, preserve offline proposals, and deterministically rebase
after acceptance or durable rejection without double application. Validate
accepted and rejected terminal records against the session-designated admission
sequencer, deduplicate effect-result aliases, and roll back when Instant removes
a rejected optimistic mutation.

Add durable proposal rejection records, the portable admission-sequencer
capability, and a renderer-neutral authenticated-subject lifecycle that closes
the old Program Scope before replacement or sign-out and fences stale
generation callbacks.
