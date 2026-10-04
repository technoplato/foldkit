---
'@foldkit/instant': minor
---

Add `foldkitTelemetry()` to `@foldkit/instant/hosted-identity/vite`. It serves `POST /__foldkit/telemetry` in Vite dev and preview and appends each browser telemetry batch to the file for its app and host through Foldkit's file sink, such as `~/Library/Logs/foldkit/telemetry/books-react.ndjson`. It answers only local development and visitors with a verified Access login, the same check `guardHostedRequest` makes for public routes; anyone else gets 404.
