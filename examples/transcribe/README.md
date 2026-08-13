# Knophy transcribe

One Foldkit Program publishes transcript jobs. Instant is the live catalog. Every client renders that same Program.

The hosted Foldkit preview also implements the GET contract:

- `GET /?url=<video-url>` — idempotent start-or-lookup, `302 Location: /jobs/:id` (or `200` JSON when `Accept: application/json`)
- `GET /jobs/:id` — status, transcript, frames, analysis, `words[]` (seconds, half-open), `mediaUrl` (`/media/:id.mp4`), `fallbackUrl` (YouTube provenance). HTML Accept falls through to the Foldkit follow-along player.
- `GET /healthz` — `{ "status": "ok" }`

The seed job is `https://youtu.be/B0FaK0sazXg` (`B0FaK0sazXg`). Artifacts in `/tmp/knophy-transcribe-B0FaK0sazXg` are ingested when present; YouTube VTT captions are enough for GET to show a transcript.

When Instant is missing or unreachable, clients show the seed jobs and say so.

## Clients

Foldkit, captive embed, React, Expo, CLI, TUI, book reader, and headless processor all share transcribe-core-example.
