# Wallet | Portable Program and client adapters

The Wallet example has one renderer- and platform-independent Program. Its
public Model, Messages, update function, finite Commands, persistent
transaction Subscription, restoration rules, and injected Effect services live
in `core`. Every client imports that exact `WalletProgram` object.

Wallet creation is also portable. `RequestedWalletCreation` enters a finite
creation state and emits `CreateWallet`, while the injected `WalletVault`
generates private material outside the Model. One created profile always has
Bitcoin, Ethereum, Solana, and Sui accounts. The public Model stores both Native
Segwit and Taproot Bitcoin addresses, defaults to Native Segwit, and exposes
one global `Devnet | Testnet` choice that projects every chain together.

The checked-in `local-vault` adapter uses standards-derived public addresses
and process-local, redacted custody. It does not persist or export recovery
material. Closing the host loses the private keys, so this example must not be
treated as production custody. Public Wallet profiles remain safe to inspect in
state routes and replay tapes.

The core also defines the renderer-neutral `walletIntentRouter`. Its canonical
send paths have this shape:

```text
/wallet/intent/send?account=<account-id>&asset=<asset-id>&amount=<atomic-units>&to=<address>
```

`account` and `asset` are stable identifiers from the normalized portfolio.
`amount` is expressed in atomic units. Parsing is side-effect free. React,
Foldkit, and Expo carriers decode an intent into pending Program state.
Portfolio loading then starts adapter validation and preview Commands through
update. Opening an intent never submits a transaction.

Recipient validation results are portable Program data, but address rules and
SDKs belong to the selected adapter. Ethereum uses viem and Solana uses
`@solana/kit` inside `testnet-node`. Core knows only validated-recipient facts
or safe rejection guidance.

```text
wallet/
  core/              portable Model, Message, Program, and service contracts
  local-vault/       in-memory Bitcoin, Ethereum, Solana, and Sui key custody
  simulated-client/  deterministic complete Layer with no network or real funds
  testnet-node/       Sepolia and Solana Devnet networking and optional custody
  remote/             Fetch-backed typed RPC Layer for remotely held custody
  testnet-server/     deliberately unauthenticated disposable Sepolia bridge
  react-bindings/    domain-shaped React hooks with no DOM dependency
  react/             React web presenter
  foldkit/           ordinary Foldkit view presenter
  cli/               one-shot raw CLI
  terminal/          interactive Effect Terminal client
  tui/               interactive OpenTUI React client
```

## Run the clients

From the repository root:

```sh
pnpm demo:wallet show
pnpm demo:wallet create --network testnet
pnpm demo:wallet create --network devnet --verbose
pnpm demo:wallet receive
pnpm demo:wallet preview --verbose
pnpm demo:wallet send --verbose
pnpm demo:wallet sign-challenge --verbose
pnpm demo:wallet:terminal
pnpm demo:wallet:tui
pnpm dev:example:wallet:testnet-server
pnpm dev:example:wallet:react
pnpm dev:example:wallet:foldkit
pnpm dev:example:showcase:web
pnpm dev:example:showcase:ios
pnpm dev:example:showcase:android
```

The CLI, Effect Terminal, and TUI use the simulated network Layer plus the same
local Wallet vault. The simulated Layer never contacts a network or controls
real funds. It proves the full Program flow, including multi-chain creation,
global network switching, previews, signing, submission, finite transaction
history, live transaction observation, state routes, replay routes, and
historical inspection.

The React, Foldkit, and Expo clients use the typed `remote` network Layer plus a
platform entropy source for local Wallet creation. The public demo endpoint is
deliberately unauthenticated and controls one disposable, shared Sepolia test
wallet. The private key remains in the Node server. Clients receive only public
portfolio values and opaque handles for protected transaction material.

A real network Layer attaches a typed block-explorer confirmation to the
successful submission result. Sepolia submissions link to Etherscan, and Solana
Devnet submissions link to the matching Solana Explorer cluster.
Simulated submissions deliberately carry no explorer confirmation, so a fake
transaction identifier can never be presented as chain evidence.

The temporary server policy accepts positive, native Sepolia ETH transfers to
syntactically valid Ethereum recipients, up to 0.00001 ETH. It rejects other
networks, assets, malformed recipients, and larger amounts. Each visual
client keeps recipient editing in the shared Model, previews through a Command,
and requires a separate confirmation before signing and submission. Anyone who
can reach the endpoint can still inspect the wallet, consume test ETH through
permitted transfers and fees, and request signatures from this public test
identity. The account must never hold mainnet assets or represent a trusted
identity. The operation-handle store is process-local and is intentionally lost
when the server restarts.

The public demos are available at:

- `https://wallet.knophy.com/` for React
- `https://wallet-foldkit.knophy.com/` for Foldkit
- `https://wallet-testnet.knophy.com/health` for the server health check

## Real test-network Layers

`testnet-node` implements the same `WalletClient`, `WalletSigner`, and
`WalletCrypto` contracts with Ethereum Sepolia and Solana Devnet adapters.
Each adapter projects its nested chain configuration into normalized chain,
network, asset, account, balance, and transaction facts. ETH, SOL, and Circle
USDC values use exact atomic-unit strings. Provider URLs and local keys are
loaded as `Redacted` configuration.

Solana implements finite cursor-based history with
`getSignaturesForAddress`, followed by normalized transaction reads. Ethereum
does not advertise `TransactionHistory` because standard Ethereum JSON-RPC
does not provide complete account history. A production Ethereum adapter must
inject an indexer, provider history API, or local indexed database.

The normal suite uses fake transports. Read-only live smoke tests load public
balances. A separately named opt-in Solana transfer test previews, signs,
submits, and observes a small Devnet SOL transfer between explicitly configured
test accounts. It receives the transaction through `logsSubscribe`; it does not
poll balances or signature status. No test requests an airdrop or mints tokens.
See
[`docs/explorations/wallet-testnet-layers.md`](../../docs/explorations/wallet-testnet-layers.md)
for configuration and capability details.

`makeWalletReactClient(resources)` and `makeWalletApplication(container,
resources, start)` keep React and Foldkit independent of the selected wallet
implementation. A client can receive simulated, local-custody, hardware,
managed-custody, or remote resources without changing the Wallet Program.

## Portable signing boundary

Consumers use one `WalletSigner` contract for Ethereum and Solana. A public
challenge identifies the account and carries a domain-separated digest. The
injected signer returns one normalized proof containing algorithm, public
identity, signature, and encoding strings. The injected crypto Layer verifies
it. Chain-specific transaction assembly, custody, cryptography, and RPC
clients remain behind the Effect service boundary.

Contract or program reading and writing are explicit TODO capabilities. They
will use chain-neutral read and write intents plus adapter-owned executable
payloads. Ethereum ABIs and Solana program instructions will not be added to
Wallet core.

The higher-order Staked Access Program consumes this same signing boundary. It
binds a signed claim to an exact tape, ordered Message IDs, derived state,
requested capabilities, stake terms, and an adjudication policy without placing
secret keys or runtime handles in the Model or replay tape.
