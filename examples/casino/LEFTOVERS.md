# Casino leftovers

- Stripe: sandbox secret present in the existing preview env (`sk_test`, not live). `VITE_STRIPE_SECRET_PRESENT` is true in the built bundle. Origin probe paints `stripe-configured`. Deposit stays `None`. Credits stay `Empty`. `DepositStripe` is not inhabited. There is no live Stripe charge on this page. Sandbox present is not live pay.
- Wallet: Live vault is wired through `wallet-core-example` / `wallet-web-client-example` (origin-local vault, Solana Devnet, https://wallet.knophy.com). Click starts `LoadCasinoWallet`. This painted page is `wallet-origin` `not-connected`. No SOL address is painted. Incoming SOL is still Hands. Credits stay `Empty` until a confirmed Incoming SOL Devnet observation. `DepositSettled` is not inhabited. No mainnet.
- ZK identity, humanity, and fund-cycling agent: no live verifier on this machine or in this repo. Origin probes paint `not-connected`. Player stays `Unproven`. Answer stays `Locked`. `ZkIdentity`, `Humanity`, and `FundCyclingAgent` are not inhabited.
- Clicks paint origin phase on `casinoScreen` (`connected` / `not-connected` / `probing` / `stripe-configured` / `stripe-unconfigured`). Notices are command errors only, not the deposit or proof path.
- Expo is a paint-only client (no workspace package.json), same as ingest and songbook.
- Caddy publishes only `casino.knophy.com`. No nested casino hosts.
- Look: Host `casino.knophy.com` to `127.0.0.1:5215`. Chrome headless dump after `ProbeStripe` paints `stripe-configured` (`.look/dom.html`, `.look/casino.png`). Public `https://casino.knophy.com` is Cloudflare Access 302. Access unchanged.
