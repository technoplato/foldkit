# Personal CFO (CFO Silvia clone)

Read-only personal AI CFO / net-worth OS. One Foldkit Program owns the
rules. CLI and Expo only paint.

Not live Plaid or SnapTrade. No transfer or trade Messages exist.

## Layout

- `core/` — Program, Instant schema, Effect Ledger / Notifier
- `cli/` — `cfo` prove host
- `expo/` — thin native/web shell
- `docs/` — S0 ask, parking lot, THE BET

## CLI prove

```sh
cd /Users/laptop/Development/foldkit
pnpm --filter personal-cfo-core test
pnpm --filter personal-cfo-cli test
pnpm --filter personal-cfo-cli prove:memory
```

Live Instant (dedicated app, not the Foldkit counter demo):

```sh
node examples/personal-cfo/scripts/provision-instant.mjs
cd examples/personal-cfo
# from this directory so instant-cli sees instant.schema.ts
/Users/laptop/Sync/skills/foldkit-instant-demo/scripts/with-foldkit-instant-demo-credentials \
  true
# Prefer the dedicated env:
set -a && . ~/.config/personal-cfo/instant.env && set +a
npx instant-cli@latest push schema --yes
npx instant-cli@latest push perms --yes
cd ../..
pnpm --filter personal-cfo-cli prove
```

Useful commands after prove:

```sh
pnpm --filter personal-cfo-cli cfo -- login --email alice@fake.com
pnpm --filter personal-cfo-cli cfo -- session
pnpm --filter personal-cfo-cli cfo -- dashboard
pnpm --filter personal-cfo-cli cfo -- accounts add --name Cash --kind cash --balance-cents 10000
pnpm --filter personal-cfo-cli cfo -- radar arm --question "Did net worth move?"
pnpm --filter personal-cfo-cli cfo -- radar tick
pnpm --filter personal-cfo-cli cfo -- notify --title "Radar" --body "Local ping"
pnpm --filter personal-cfo-cli cfo -- chat send --text "What is my net worth?"
```

## Expo

```sh
pnpm --filter personal-cfo-core build
pnpm --filter personal-cfo-expo web
```

Then open the Expo web URL. Sign in as `alice@fake.com`. Dashboard, accounts,
chat, radar, vault, and More/Notify paint `Program.screen`.

Notify on web uses the Web Notification API (permission prompt) and Alert as
fallback. CLI notify uses macOS `osascript`. Remote APNs/FCM push is a Hands
blocker.

## Hands blockers

- Apple Push / FCM credentials for remote push
- Instant magic-code email for Expo (CLI uses admin `createToken`)
- Google / Apple OAuth
- Live read-only Plaid / SnapTrade (explicitly out of this slice)
