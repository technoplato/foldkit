# Archiver

One renderer-free `ArchiverProgram` across Foldkit, React, TUI, and CLI clients. React Native is a stub App over the same Program.

Paste an Instagram, TikTok, or YouTube URL. The Program records a queued archive. Instant ingest and the existing words/books player (same word/segment shape) are the reuse path; this example does not clone a second transcript player.

Clients:

- Foldkit (`examples/archiver/foldkit`) — URL form and archive list
- React (`examples/archiver/react`) — same Program via react-bindings
- CLI (`foldkit-archiver`) — `list`, `archive <url>`, and `open <id>`
- TUI (`foldkit-archiver-tui`) — URL input and numbered list
- React Native (`examples/archiver/react-native`) — stub App; not a runnable Expo client

Host: `archive.knophy.com` (planned). Do not collide with `ideas.knophy.com`.
