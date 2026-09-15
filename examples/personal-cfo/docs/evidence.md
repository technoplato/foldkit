# Evidence (2026-09-10, laptop.local)

## CLI exit codes

Memory Program runtime (no Instant app required):

```
cd /Users/laptop/Development/foldkit
pnpm --filter personal-cfo-core test     # 7 passed
pnpm --filter personal-cfo-cli test      # 4 passed, including `cfo prove` exit 0
pnpm --filter personal-cfo-cli prove:memory
```

`cfo prove` walks login, session, dashboard, accounts add/list, vault add/list,
radar arm/list/tick (quiet on same hash), notify, grounded chat. Unknown
`cfo transfer` exits 1.

## Expo painted screens

Expo web on `http://127.0.0.1:8091/` (phone viewport 390×844):

- `docs/evidence/01-sign-in.png`
- `docs/evidence/02-dashboard.png` — net worth −$113,500.00, access read_only
- `docs/evidence/03-accounts.png` — three demo accounts, all `read_only`
- `docs/evidence/04-chat.png` — grounded reply + “Not professional advice.”
- `docs/evidence/05-radar.png`
- `docs/evidence/06-vault.png`
- `docs/evidence/07-more.png`
- `docs/evidence/08-notify.png` — queued local notification row

## Notifications

- CLI: macOS `osascript display notification` (`PERSONAL_CFO_NOTIFY=0` prints
  instead, used in tests).
- Expo: Web Notification API when permitted; otherwise React Native `Alert`.
  Headless Playwright recorded the in-app queued row.
- Remote APNs / FCM push: Hands. No Apple/Google push credentials on this
  machine.

## Instant live

Dedicated app provisioner
`examples/personal-cfo/scripts/provision-instant.mjs` failed:
`Record not found: instant-user`. Instant CLI auth token in
`~/.config/foldkit-instant-demo/instant.env` is stale. Schema and perms are
ready to `instant-cli push` after `npx instant-cli@latest login`.
Do not push this schema onto the Foldkit counter demo app.
