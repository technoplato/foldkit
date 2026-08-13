# Deposit

View-agnostic FoldKit example. The Foldkit client is a deposit page.

Keep the deposit rail as a tagged ADT. Follow `foldkit/attention`,
`foldkit/asyncData`, and `ts` for exclusive phases. Do not flatten fiat
or crypto into booleans.

SOL Devnet first. Other crypto tags exist in the Deposit ADT and refuse
as UnsupportedRail. Fiat exists in the ADT. Stripe is unconfigured.
RequestedFiatDeposit always returns refuse why stripe-unconfigured.
There is no live Stripe charge variant.

Settled SOL Devnet deposits unlock capabilities: catalog-publish,
leaderboard-submit, clip-claim, ideas-note, books-listen,
transcribe-session. Those capabilities are not money movement.

Default rail: chainId=solana, networkId=solana:devnet,
assetId=solana:devnet:sol, walletNetworkMode=Devnet.

Hosted preview: https://deposit.knophy.com
Full wallet UI: https://wallet.knophy.com and https://wallet-foldkit.knophy.com

This page is not the orbit/play sim.

## Run

From the FoldKit repo root, test and build the core package named
deposit-core-example, then run deposit-foldkit-example in dev or preview.

Foldkit hosted preview uses VITE_WALLET_DATA_SOURCE=Live (origin-local vault).

Headless (deposit-headless-example) prints the public SOL receive address
as JSON, requests a tiny Devnet airdrop when Live vault can run, watches
Incoming, and writes examples/deposit/receipt.json.

If Live vault cannot run headless, headless falls back to
wallet-simulated-client-example. The Foldkit host at deposit.knophy.com
is the real SOL Live path.

Do not send mainnet funds. No Stripe keys in this repo.
