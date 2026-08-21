---
'@foldkit/instant': minor
---

Add Node-only Instant demo env loading and SyncEngine resolve so Clients can
open the shared live Instant tape without shipping fs into the browser entry.
The package root uses browser and react-native export conditions so Vite and
Expo resolve the browser Instant, not the Node admin Instant.
