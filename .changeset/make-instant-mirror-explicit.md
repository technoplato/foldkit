---
'@foldkit/instant': minor
---

Require shared Program Processors to select a framework synchronization policy
and provide their Program-owned Message classifier. Expose the selected policy
in portable snapshots and support `Mirror` explicitly across accepted and
optimistic Message projection.

Reject `SharedDomain` and `Follow` with a typed construction error until the
next persisted protocol records immutable accepted audiences and policy
generations.
