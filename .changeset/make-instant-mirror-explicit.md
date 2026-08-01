---
'@foldkit/instant': minor
---

Require shared Program Processors to select a framework synchronization policy
and provide their Program-owned Message classifier. Expose the selected policy
in portable snapshots. Persist every accepted occurrence's immutable audience,
Message category, policy generation, and complete policy. Apply `Mirror`,
`SharedDomain`, and `Follow` explicitly across accepted and optimistic Message
projection, including Observe and RemoteControl follower behavior.
