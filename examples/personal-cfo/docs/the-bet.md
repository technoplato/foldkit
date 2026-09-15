# S1–S2 — Gate versus THE BET

## THE BET

One renderer-free Program owns the product rules. CLI and Expo are thin
adapters: they translate argv / touches into Messages, provide Effect Layers,
and paint `Program.screen`. They do not compute net worth, arm Radar, or
invent a second ledger.

This is the same bet as Foldkit Counter / Payments / Calculator: Model,
Message, init, update, valid, and screen live in `personal-cfo-core`.

## Quorum / gate

`gate.grok.me` and leftover Instant issues `240`–`243` are a different
program. This clone does not sample that origin, bounce those ports, or
close those issues.

## What would fail the gate

- Expo or CLI computing net worth, Radar hashes, or chat answers locally
- A transfer / trade / Plaid-link Message
- Instant rows whose `access` is anything other than `read_only`
- Admin tokens in the Expo bundle
- Claiming push notifications without APNs / FCM credentials

## Adapter duties

| Client | Owns                                                        | Does not own  |
| ------ | ----------------------------------------------------------- | ------------- |
| CLI    | argv, Instant admin Layer, macOS local notify, session file | product rules |
| Expo   | React Native paint, local / web notify, in-process runtime  | product rules |
