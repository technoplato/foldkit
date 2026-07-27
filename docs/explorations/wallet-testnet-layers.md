# Wallet | Node test-network Layers

This exploration defines the Node-only test-network adapters in
`examples/wallet/testnet-node`. The package supplies the public
`wallet-core-example` `WalletClient`, `WalletSigner`, and `WalletCrypto`
services without placing runtime, framework, or platform checks in the Wallet
Program.

The package targets Ethereum Sepolia and Solana Devnet. It does not treat
Solana Testnet as an alias for Devnet.

## Network and asset configuration

| Network          | Native asset | Native decimals | Circle USDC address                            | USDC decimals |
| ---------------- | ------------ | --------------: | ---------------------------------------------- | ------------: |
| Ethereum Sepolia | ETH          |              18 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`   |             6 |
| Solana Devnet    | SOL          |               9 | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |             6 |

The USDC addresses come from Circle's authoritative
[USDC contract-address registry](https://developers.circle.com/stablecoins/usdc-contract-addresses).
Circle states that its test-network tokens have no financial value and are not
backed by real US dollars.

The Solana Foundation describes
[Devnet](https://solana.com/docs/references/clusters) as the cluster application
developers should target for public testing and development. Testnet is for
validator and release-feature stress testing and may be intermittently
unavailable. This adapter therefore implements `SolanaDevnet` and reports
`SolanaTestnet` as the typed `UnsupportedCapability` reason
`SolanaTestnetIsNotSolanaDevnet`.

All balances, transfer amounts, fees, and resulting balances cross the adapter
boundary as signed base-10 integer strings in exact atomic units. Every balance
and transaction record carries an `observedAt` Unix timestamp in milliseconds.
Network block time is used when it is available. A Solana notification whose
confirmed transaction has no block time uses the exact local receipt time of
that notification.

## SDK boundary

The adapter pins these current SDK versions:

- [`viem` 2.55.10](https://www.npmjs.com/package/viem)
- [`@solana/kit` 7.0.0](https://www.npmjs.com/package/@solana/kit)
- [`@solana-program/system` 0.13.0](https://www.npmjs.com/package/@solana-program/system)
- [`@solana-program/token` 0.15.0](https://www.npmjs.com/package/@solana-program/token)

The experimental Solana JavaScript SDK and generated program clients are only
imported inside this Node adapter package. Wallet core knows only the injected
Effect services and portable Schema values.

The package entrypoint exposes one set of wallet-core service contracts. It
does not expose a chain-specific public client or signer interface. A
`TransferDraft`, `PreparedTransaction`, `SignedTransaction`,
`SigningChallenge`, or `SignatureProof` carries the selected Network and its
typed data through `WalletClient`, `WalletSigner`, and `WalletCrypto`.

| Public Layer                 | Wallet-core services              | Key variables required |
| ---------------------------- | --------------------------------- | ---------------------- |
| `TestnetNodeNetworkLive`     | `WalletClient` and `WalletCrypto` | No                     |
| `TestnetNodeLocalSignerLive` | `WalletSigner`                    | Yes                    |
| `TestnetNodeWalletLive`      | All three services                | Yes                    |

The chain-specific transports, custody adapters, SDK clients, and
configuration services remain package-internal implementation dependencies.

`@solana-program/token` 0.15.0 requires Node 24 or newer. The adapter package
therefore declares `node >=24.0.0`, even though other Foldkit packages can use
the repository's broader Node engine range. Validation must use Node 24 when
building or running this package.

## Environment configuration

Provider URLs are loaded with `Config.redacted`. This matters because hosted
RPC URLs commonly contain credentials in their path or query. Private keys are
also loaded with `Config.redacted`. None of these values is placed in a Wallet
Model, Message, replay tape, error, log statement, fixture, or committed file.

Ethereum Sepolia transport variables:

| Variable                                  | Value                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ID`      | Stable public application account identifier                 |
| `WALLET_ETHEREUM_SEPOLIA_ACCOUNT_ADDRESS` | Checksummed or valid hexadecimal Sepolia address             |
| `WALLET_ETHEREUM_SEPOLIA_DISPLAY_NAME`    | Public display label                                         |
| `WALLET_ETHEREUM_SEPOLIA_HTTP_RPC_URL`    | Protected HTTPS Sepolia JSON-RPC URL                         |
| `WALLET_ETHEREUM_SEPOLIA_WS_RPC_URL`      | Protected WSS Sepolia JSON-RPC URL with subscription support |

Solana Devnet transport variables:

| Variable                               | Value                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| `WALLET_SOLANA_DEVNET_ACCOUNT_ID`      | Stable public application account identifier                |
| `WALLET_SOLANA_DEVNET_ACCOUNT_ADDRESS` | Base58 Devnet account address                               |
| `WALLET_SOLANA_DEVNET_DISPLAY_NAME`    | Public display label                                        |
| `WALLET_SOLANA_DEVNET_HTTP_RPC_URL`    | Protected HTTPS Devnet JSON-RPC URL                         |
| `WALLET_SOLANA_DEVNET_WS_RPC_URL`      | Protected WSS Devnet JSON-RPC URL with subscription support |

The complete optional local-custody Layer also requires:

| Variable                                  | Value                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `WALLET_ETHEREUM_SEPOLIA_PRIVATE_KEY_HEX` | Protected 32-byte Ethereum private key in hexadecimal, with or without `0x`     |
| `WALLET_SOLANA_DEVNET_SECRET_KEY_BASE64`  | Protected base64 encoding of the 64-byte Solana private-key and public-key pair |

A host can use `TestnetNodeNetworkLive` without either key variable and merge
it with its own `WalletSigner` Layer. That wallet-core service is the intended
boundary for hardware wallets, remote signers, or managed custody. The host
does not need a chain-specific public custody interface.

## Implemented paths

| Capability               | Ethereum Sepolia                                                        | Solana Devnet                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Native balance           | `eth_getBalance` through viem                                           | `getBalance` through Kit                                                                                      |
| Circle USDC balance      | ERC-20 `balanceOf`                                                      | `getTokenAccountsByOwner` for the Circle mint                                                                 |
| Native preview           | EIP-1559 gas and fee estimate                                           | Compiled message fee from `getFeeForMessage`                                                                  |
| USDC preview             | ERC-20 transfer gas estimate                                            | SPL transfer fee plus destination token-account rent when creation is required                                |
| Prepare                  | EIP-1559 unsigned transaction fields                                    | Versioned message with fresh blockhash and exact instructions                                                 |
| Sign                     | Injected custody or Redacted local private key                          | Injected custody or Redacted local key-pair bytes                                                             |
| Submit                   | Raw signed transaction                                                  | Base64 signed wire transaction                                                                                |
| Challenge                | Raw domain-separated digest signed and verified with viem               | Raw digest signed and verified with Ed25519 Kit primitives                                                    |
| Observe native transfers | WebSocket new-head subscription, followed by one block and receipt read | `logsSubscribe` for the wallet account, followed by one `getTransaction` read                                 |
| Observe USDC transfers   | WebSocket ERC-20 `Transfer` log subscriptions                           | `logsSubscribe` for the wallet and its USDC associated token account, followed by parsed SPL instruction data |

The Ethereum transport uses viem's
[WebSocket transport](https://viem.sh/docs/clients/transports/websocket).
ERC-20 observation sets `poll: false`, which viem documents as using
`eth_subscribe` for logs rather than filters or `getLogs` polling in
[`watchEvent`](https://viem.sh/docs/actions/public/watchEvent). Native transfer
observation uses the WebSocket client's new-head subscription and performs a
single block read only after the provider emits a head.

Solana observation uses the official
[`logsSubscribe`](https://solana.com/docs/rpc/websocket/logssubscribe) `mentions`
filter separately for the wallet address and its USDC associated token account.
Each notification triggers one
[`getTransaction`](https://solana.com/docs/rpc/http/gettransaction) read for
exact instruction amounts, direction, status, counterparty, and block time.
There is no interval, signature-history loop, status loop, or other polling
path.

## Explicitly blocked or limited paths

- Solana Testnet is not implemented. `capabilityForNetwork` returns a typed
  unsupported result, and `WalletClient` rejects attempts to route Testnet
  work through the Devnet adapter.
- Providers without the required WebSocket subscription methods are not
  silently downgraded to polling. The observation Stream fails with a
  sanitized `WalletClientError`.
- Ethereum observation emits mined transactions. It does not claim mempool or
  pre-confirmation visibility.
- Solana transaction observation relies on the provider's parsed System and SPL
  Token instruction support. An unrecognized instruction is ignored instead
  of being guessed.
- This package does not request airdrops, fund accounts, or mint tokens during
  setup or the normal suite. Its separately named live transfer test sends only
  when `WALLET_SOLANA_DEVNET_LIVE_TRANSFER=1` is explicit.
- `TestnetNodeLocalSignerLive` and `TestnetNodeWalletLive` read keys at Layer
  construction. Use `TestnetNodeNetworkLive` for read-only hosts, or merge it
  with a host-owned `WalletSigner` Layer.

## Validation and live smoke tests

The normal unit suite uses finite fake transports and fake custody. It verifies
exact atomic-unit preservation, timestamp preservation, network routing,
subscription merging, public cryptography routing, and the typed Testnet
capability result. It performs no network calls.

Two read-only live smoke tests exist and are skipped unless separately enabled:

| Variable                             | Action when set to `1`                            |
| ------------------------------------ | ------------------------------------------------- |
| `WALLET_ETHEREUM_SEPOLIA_LIVE_SMOKE` | Load the configured Sepolia ETH and USDC balances |
| `WALLET_SOLANA_DEVNET_LIVE_SMOKE`    | Load the configured Devnet SOL and USDC balances  |

The smoke tests do not construct, sign, submit, fund, airdrop, or observe a
transaction. They require only the matching transport variables, not a private
key.

One separate live transfer test exercises the real Solana Devnet transport and
local custody Layers. It starts the receiver's `logsSubscribe` Stream, previews
and prepares a transfer, signs through `SolanaDevnetCustody`, submits through
`SolanaDevnetTransport`, and waits for the matching incoming transaction record.
It performs no balance loop, signature-status loop, or transaction-history
loop.

```sh
WALLET_SOLANA_DEVNET_ACCOUNT_ID=... \
WALLET_SOLANA_DEVNET_ACCOUNT_ADDRESS=... \
WALLET_SOLANA_DEVNET_DISPLAY_NAME=... \
WALLET_SOLANA_DEVNET_HTTP_RPC_URL=... \
WALLET_SOLANA_DEVNET_WS_RPC_URL=... \
WALLET_SOLANA_DEVNET_SECRET_KEY_BASE64=... \
WALLET_SOLANA_DEVNET_LIVE_RECEIVER_ADDRESS=... \
pnpm --filter wallet-testnet-node-example test:live:solana-transfer
```

The sender and receiver must be disposable Devnet accounts. The sender must be
funded before the test starts. Secret key bytes remain Redacted and must never be
written to the Model, a Message, a tape, test output, or Git.

On July 27, 2026, the test submitted 0.001 Devnet SOL as transaction
[`32sEXa6aTCKszyXnUgfi6DrE5szmFrd35gqnZpawR32XEVYaBtBdg8YSaksr4jcsD92D5UnHmret1hM2TpvqS2KA`](https://explorer.solana.com/tx/32sEXa6aTCKszyXnUgfi6DrE5szmFrd35gqnZpawR32XEVYaBtBdg8YSaksr4jcsD92D5UnHmret1hM2TpvqS2KA?cluster=devnet).
The receiver Stream emitted the matching `:0` System instruction. A separate
single balance read then reported 0.001 SOL at the receiver. That read was
corroboration after the push event, not the observation mechanism.

## Webhook adapters

`WalletClient.observeTransactions` exposes a transport-neutral Effect Stream.
A server host may therefore provide transaction records from authenticated
provider webhooks without changing the Wallet Program, Model, Messages, or
Subscription. A production webhook Layer still needs an explicit provider,
public callback deployment, signature verification algorithm, retry and
deduplication policy, and secret configuration. This local Node package proves
provider WebSocket delivery. It does not claim a webhook integration without
those provider-specific inputs.
