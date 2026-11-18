---
'@foldkit/instant': minor
---

Node Clients can now sign in and read Instant like a browser. `makeNodeInstantDatabase(appId, stateDirectory)` opens Instant core with no schema and a file-backed store, so a terminal keeps its session between runs. It also turns on Instant's client in Node: `@instantdb/core` starts only where `window` exists, and without it sign-in and queries throw. `ensureHostedInstantSession` now asks a mint on this machine over plain HTTP, such as `http://localhost:5200`, without an Access token. That mint gives the local development identity. Any other absolute origin still needs a token.
