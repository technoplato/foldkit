# Parking lot (not this slice)

Pulled from the share file. Do not invent chrome for unobserved pixels.

## P1

- Dedicated asset-class routes (`/public-investments`, `/crypto-holdings`, …)
- Transaction recategorize + transfer dedupe
- Research → PDF artifact in vault
- Plan meters (Free / Pro / Max)
- Drag-and-drop dashboard widgets

## P2

- Live Plaid / SnapTrade / Coinbase (read-only only, still no money movement)
- IBKR Query ID + Token and E\*TRADE third-party sharing special cases
- Optional TOTP/SMS 2FA
- Delete-account
- Remote push + biometrics
- Model routing / video artifacts

## Confirmed 404s — do not clone as routes

`/documents` `/billing` `/notifications` `/artifacts` `/scenarios` `/help`

Vault is document management. Scenarios live in `/research`. Billing lives in
`/settings`.

## Not observed live — do not guess

Widget default order, vault folder UI, composer layout, onboarding screens,
Wrapped slides, exact Free numeric caps, whether Apple OAuth is wired today.

## Invariants that stay types, not comments

1. Connections are `access: "read_only"` only. No transfer/trade Messages.
2. Memory notes cannot override live balances (notes are not in this slice).
3. A Radar finding carries citations (account ids).
4. Vault files are per-user (`ownerId`).
5. Chat outputs are not professional advice (disclaimer is part of the reply).
