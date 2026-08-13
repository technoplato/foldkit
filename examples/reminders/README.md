# Knophy reminders

Personal reminders with a normalized trigger ADT. Instant entity `knophyReminders` (ideas-style). The laptop LaunchAgent plus `~/.local/share/knophy-reminders/reminders.json` is the v1 host; Foldkit UI and reminders.knophy.com are later.

When Instant is missing or unreachable, the JSON seed is the source of truth.

Trigger tags:

- `{ "_tag": "returnToLaptop" }` — laptop Aqua login / wake
- `{ "_tag": "atTime", iso }` — optional for later
- `{ "_tag": "manual" }`

Do not `instant-cli push` from this tree unless you intend to change the shared demo app perms. Reminders are personal; rules below expect an authenticated user. Schema push is skipped in v1 if CLI auth is unavailable.
