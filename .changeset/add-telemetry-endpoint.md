---
'@foldkit/instant': minor
---

Add `foldkitTelemetry()` to `@foldkit/instant/hosted-identity/vite`. It serves `POST /__foldkit/telemetry` in Vite dev and preview and appends each browser telemetry batch, `{ app, surface, role, events }`, to the file for its app and surface through Foldkit's file sink, such as `~/Library/Logs/foldkit/telemetry/books-web-react.ndjson`, keeping the surface the page declared. It refuses with 400 a surface outside Foldkit's vocabulary, such as `desktop`, and a batch with an event whose app, surface, or role is not the batch's. It answers only local development and visitors with a verified Access login, the same check `guardHostedRequest` makes for public routes; anyone else gets 404.
