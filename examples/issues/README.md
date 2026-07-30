# Issue Tracker | Foldkit Client Matrix

This example runs one renderer-independent `IssueTrackerProgram` across Foldkit,
React, React Native, terminal, OpenTUI, and one-shot CLI Clients.

The Program owns typed navigation, the filing draft, live Issue collection
state, first-class Application and Library filing domains, and independent
selected-Issue observation. Clients only render `Destination` values and send
canonical `Message` facts.

The live web Clients use one Instant app through `@foldkit/instant-tools`.
Offline and test Clients use the same service contracts with deterministic
resources.

## Security boundary

Cloudflare Access protects the deployed web origin. It does not protect direct
Instant SDK traffic from browser or native Clients. The first deployment is an
explicitly temporary CF-only boundary: the Instant app identifier is public to
Clients, and Instant permissions remain the actual database boundary. Add an
Instant-authenticated identity bridge and restrictive permissions before this
tracker contains sensitive or broadly shared data.
