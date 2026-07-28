# Wallet | Portable Program and client adapters

The Wallet example has one renderer- and platform-independent Program. Its
public Model, Messages, update function, finite Commands, persistent
transaction Subscription, restoration rules, and injected Effect services live
in `core`. Every client imports that exact `WalletProgram` object.

The core also defines the renderer-neutral `walletIntentRouter`. Its canonical
send paths have this shape:

```text
/wallet/intent/send/eth?mode=testnet&amount=1000000000000000&to=0x...
/wallet/intent/send/sol?mode=devnet&amount=1000000&to=...
/wallet/intent/send/usd?mode=testnet&amount=1000000&to=0x...&rail=ethereum
```

`amount` is expressed in atomic units. `usd` means USDC settlement, not a fiat
bank transfer. Parsing is side-effect free. Clients must feed an intent into
the Program as startup input or a factual Message so update remains the only
place that produces preview or submission Commands. Live routes remain typed
unsupported until a mainnet Layer is configured.

```text
wallet/
  core/              portable Model, Message, Program, and service contracts
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

The CLI, Effect Terminal, and TUI use the simulated Layer. It never contacts a
network or controls real funds. It proves the full Program flow, including
previews, signing, submission, transaction observation, state routes, replay
routes, and historical inspection.

The React, Foldkit, and Expo clients use the typed `remote` Layer. The public
demo endpoint is deliberately unauthenticated and controls one disposable,
shared Sepolia test wallet. The private key remains in the Node server. Clients
receive only public portfolio values and opaque handles for protected
transaction material.

The temporary server policy accepts only positive, native Sepolia ETH
self-transfers of at most 0.00001 ETH. It rejects other networks, currencies,
destinations, and amounts. Anyone who can reach the endpoint can still inspect
the wallet, consume test ETH through permitted fees, and request signatures
from this public test identity. The account must never hold mainnet assets or
represent a trusted identity. The operation-handle store is process-local and
is intentionally lost when the server restarts.

The public demos are available at:

- `https://wallet.knophy.com/` for React
- `https://wallet-foldkit.knophy.com/` for Foldkit
- `https://wallet-testnet.knophy.com/health` for the server health check

## Real test-network Layers

`testnet-node` implements the same `WalletClient`, `WalletSigner`, and
`WalletCrypto` contracts with Ethereum Sepolia and Solana Devnet adapters. ETH,
SOL, and Circle USDC values use exact atomic-unit strings. Provider URLs and
local keys are loaded as `Redacted` configuration.

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
injected signer returns the appropriate typed proof, and the injected crypto
Layer verifies it. Chain-specific transaction assembly, custody, cryptography,
and RPC clients remain behind the Effect service boundary.

The higher-order Staked Access Program consumes this same signing boundary. It
binds a signed claim to an exact tape, ordered Message IDs, derived state,
requested capabilities, stake terms, and an adjudication policy without placing
secret keys or runtime handles in the Model or replay tape.
