# S0 — Ask (captured 2026-09-10)

Source: `/Users/laptop/Development/poteto-dispatches/expo-clone-share-2026-09-10.md`
Share: https://grok.com/share/c2hhcmQtMg_543dbb05-adc4-4468-8230-2fa78afd2342

## Product

CFO Silvia-shaped **personal AI CFO / net-worth OS**. Not a budget app.
**Read-only** is a hard invariant: no transfer, trade, or account change.

Today the live product is a mobile-first PWA. Careers copy says the native
client is React Native / Expo.

## P0 vertical slice (this folder)

Email session, manual ledger, `/dashboard` net-worth summary, `/accounts`
list, `/chat` grounded in that ledger, `/vault` stub, one `/radar` standing
job, notifications from CLI and Expo.

Do **not** implement all 221 sitemap URLs.

## Architecture

1. Renderer-free Foldkit Program + Effect services (the SDK).
2. InstantDB for auth + durable rows.
3. CLI consumes the Program first. Prove with exit codes.
4. Expo paints the same `Program.screen` after CLI is green.
5. Notifications: at least one real local path on CLI and on Expo.
   Remote push needs Apple/Google credentials (Hands).
