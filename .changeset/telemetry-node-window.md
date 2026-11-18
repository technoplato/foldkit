---
'foldkit': patch
---

Telemetry now records a terminal that syncs through Instant. `@foldkit/instant`'s Node client defines `window` as an empty object so `@instantdb/core` runs outside a browser, and `Telemetry.attach` took that `window` for a page, called its missing `addEventListener`, and recorded nothing for the whole session, such as the Books player behind `books pause`. It now watches for the page going away only where `window` takes listeners.
