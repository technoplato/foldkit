# Wallet | Portable Program and client adapters

The Wallet example has one renderer- and platform-independent Program. Its
public Model, Messages, update function, finite Commands, persistent
transaction Subscription, restoration rules, and injected Effect services live
in `core`. Every client imports that exact `WalletProgram` object.

```text
wallet/
  core/              portable Model, Message, Program, and service contracts
  simulated-client/  deterministic complete Layer with no network or real funds
  testnet-node/       Sepolia and Solana Devnet networking and optional custody
  react-bindings/    domain-shaped React hooks with no DOM dependency
  react/             React web presenter
  foldkit/           ordinary Foldkit view presenter
  cli/               one-shot raw CLI
  terminal/          interactive Effect Terminal client
  tui/               interactive OpenTUI React client
```

## Run the simulated clients

From the repository root:

```sh
pnpm demo:wallet show
pnpm demo:wallet receive
pnpm demo:wallet preview --verbose
pnpm demo:wallet send --verbose
pnpm demo:wallet sign-challenge --verbose
pnpm demo:wallet:terminal
pnpm demo:wallet:tui
pnpm dev:example:wallet:react
pnpm dev:example:wallet:foldkit
pnpm dev:example:showcase:web
pnpm dev:example:showcase:ios
pnpm dev:example:showcase:android
```

The simulated Layer never contacts a network or controls real funds. It proves
the full Program flow, including previews, signing, submission, transaction
observation, state routes, replay routes, and historical inspection.

## Real test-network Layers

`testnet-node` implements the same `WalletClient`, `WalletSigner`, and
`WalletCrypto` contracts with Ethereum Sepolia and Solana Devnet adapters. ETH,
SOL, and Circle USDC values use exact atomic-unit strings. Provider URLs and
local keys are loaded as `Redacted` configuration.

The normal suite uses fake transports. The opt-in live smoke tests only load
public balances. They do not construct, sign, submit, observe, fund, mint, or
request an airdrop. See
[`docs/explorations/wallet-testnet-layers.md`](../../docs/explorations/wallet-testnet-layers.md)
for configuration and capability details.

## Portable signing boundary

Consumers use one `WalletSigner` contract for Ethereum and Solana. A public
challenge identifies the account and carries a domain-separated digest. The
injected signer returns the appropriate typed proof, and the injected crypto
Layer verifies it. Chain-specific transaction assembly, custody, cryptography,
and RPC clients remain behind the Effect service boundary.

The higher-order Staked Access Program consumes this same signing boundary. It
binds a signed claim to an exact tape, ordered Message IDs, derived state,
requested capabilities, stake terms, and an adjudication policy without placing
secret keys or runtime handles in the Model or replay tape.
