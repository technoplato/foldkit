# Casino Instant 243 leftover

## Files changed

This pass (sandbox present in the existing preview env; no second secret path):

- `examples/casino/core/src/program.test.ts`: presence probe maps onto Configured without printing the secret, and without asserting the test runner has no key
- `examples/casino/LEFTOVERS.md`, `.look/GROK-REPORT.md`, `.look/dom.html`, `.look/casino.png`, `.look/casino-5215-live.png`, `.look/chrome.err`

One `casinoScreen`. Clients (foldkit, react, svelte, expo, cli, tui, opentui, headless) still only paint that tree. No per-client deposit or proof chrome.

## Live

- Host: `127.0.0.1:5215` serves Casino after `launchctl kickstart -k gui/$(id -u)/com.knophy.foldkit.casino-demo`. Leftover ports 5209 / 5210 / 5212 were not bounced.
- Loopback look: Host `casino.knophy.com` to `127.0.0.1:5215`. Chrome headless dump after JS (`ProbeStripe`) paints `stripe-configured`. `stripe-unconfigured` is gone. Deposit `None`. Credits `Empty`. Player `Unproven`. Answer `Locked`. Proof origins `not-connected`. Wallet origin `not-connected`. No SOL address painted.
- Public access: `https://casino.knophy.com` is Cloudflare Access 302 to `https://chimaeramedia.cloudflareaccess.com/cdn-cgi/access/login/casino.knophy.com`. Access unchanged.
- Stripe: sandbox present in `/Users/laptop/.config/foldkit-instant-demo/instant.env` (`sk_test`, length 107, not live). `VITE_STRIPE_SECRET_PRESENT` is true in the built bundle. The secret is not in the bundle. This is not a live charge. `DepositStripe` is not inhabited.

## Fail-closed

- Sandbox present is not live pay. Painted `stripe-configured` means a secret exists. It does not inhabit `DepositStripe` or `DepositSettled`. Credits stay `Empty`.
- Wallet: painted `not-connected` on this page. Incoming SOL is still Hands. `DepositSettled` is not inhabited. No mainnet.
- ZK identity, humanity, fund-cycling agent: no live verifier. Painted `not-connected`. Player stays `Unproven`. Answer stays `Locked`. Default `makeProofVerifier` never returns `Verified`.

## Leftover

Still blocked on incoming SOL (Hands; no address painted) and proofs not-connected. Issue 243 stays open.
