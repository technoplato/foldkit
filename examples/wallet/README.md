# Wallet | Portable Program and client adapters

The Wallet example has one renderer- and platform-independent Program. Its
public Model, Messages, update function, finite Commands, persistent
transaction Subscription, restoration rules, and injected Effect services live
in `core`. Every client imports that exact `WalletProgram` object.

Wallet creation and restoration are also portable. Startup emits
`LoadWalletProfiles`, and `RequestedWalletCreation` enters a finite creation
state and emits `CreateWallet`. The injected `WalletVault` owns private
material outside the Model. A creation succeeds only after the vault has
durably written its custody record. One created profile always has Bitcoin,
Ethereum, Solana, and Sui accounts. The public Model stores both Native Segwit
and Taproot Bitcoin addresses, defaults to Native Segwit, and exposes one
global `Devnet | Testnet` choice that projects every chain together.

Sending has one explicit `SendNetworkSelection` in the Model. It identifies the
global network mode plus the exact chain, network, account, and native asset.
Changing the global mode preserves the selected chain when the corresponding
rail exists. React, React Native, Foldkit, the CLI, Effect Terminal, and OpenTUI
all select and render that same value.

The checked-in `local-vault` adapter derives standards-based public addresses
and serializes one opaque custody record per Wallet. Browser hosts encrypt each
record with AES-GCM and store the ciphertext plus a non-extractable CryptoKey in
origin-local IndexedDB. Expo stores each record in iOS Keychain or Android
encrypted storage through `expo-secure-store`. CLI and other ephemeral hosts
can still inject process-local record storage. No private key enters the Model,
Message journal, route, replay tape, browser localStorage, or screen.

This is durable example custody, not a complete production wallet. It has no
recovery phrase, export, cloud backup, user-authentication gate, or hardware
wallet integration. Same-origin script compromise can access a browser vault
while the page is running, and users can erase browser site data. Native secure
storage can also be lost or invalidated. Irreplaceable funds require an explicit
backup and recovery design.

The core also defines the renderer-neutral `walletIntentRouter`. Its canonical
send paths have this shape:

```text
/wallet/intent/send?mode=<Devnet|Testnet>&chain=<chain-id>&network=<network-id>&account=<account-id>&asset=<asset-id>&amount=<atomic-units>&to=<address>
```

Every query property is required. `mode`, `chain`, `network`, `account`, and
`asset` identify one exact send rail. `amount` is expressed in atomic units.
Parsing is side-effect free. Every carrier decodes an intent into pending
Program state. Portfolio loading then starts adapter validation and preview
Commands through update. Opening an intent never submits a transaction.

Recipient validation results are portable Program data, but address rules and
SDKs belong to the selected adapter. Ethereum uses viem and Solana uses
`@solana/kit` inside `testnet-node`. Core knows only validated-recipient facts
or safe rejection guidance.

```text
wallet/
  core/              portable Model, Message, Program, and service contracts
  local-vault/       portable persistent Bitcoin, Ethereum, Solana, and Sui vault
  simulated-client/  deterministic complete Layer with no network or real funds
  testnet-node/       Sepolia and Solana Devnet networking and optional custody
  remote/             Fetch-backed typed RPC Layer for remotely held custody
  web-client/         encrypted browser vault, clipboard, and source selection
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
pnpm demo:wallet send --uri 'foldkit://showcase/wallet/intent/send?mode=Testnet&chain=sui&network=sui%3Atestnet&account=simulated-sui-testnet-account&asset=sui%3Atestnet%3Asui&amount=1000000&to=0x2222222222222222222222222222222222222222222222222222222222222222'
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

`PortfolioSnapshot.dataSource` is the authoritative provenance for every
account, balance, receiving instruction, history request, and observation shown
by the screen. It is exactly `Fixture` or `Testnet`. React and Foldkit select one
complete resource graph at startup. Development defaults to `Fixture` so an
unknown setting never contacts a network. The checked-in production settings
select `Testnet` for the WAN demos, which use the public remote testnet bridge.
Set `VITE_WALLET_DATA_SOURCE=Testnet` or `Fixture` explicitly to override the
selected Vite mode. A host never mixes a fixture portfolio with live clients or
signers.

The simulated Layer exposes Bitcoin, Ethereum, Solana, and Sui in both Devnet
and Testnet modes. It never contacts a network or controls real funds. It proves
the full Program flow, including multichain creation, global network switching,
per-chain selection, previews, signing, submission, finite transaction history,
transaction observation, state routes, replay routes, and historical
inspection. The screen labels this source `Fixture data`.

The adapter-backed Portfolio and the locally created Wallet list are distinct.
Creating a local Wallet does not invent a balance or splice its accounts into a
fixture or server-owned testnet Portfolio. Connecting those generated accounts
to chain transports and balance readers is future adapter work. The screen says
so directly instead of presenting test money as if it belonged to the newly
created Wallet.

The raw CLI accepts the same deep link as the visual clients. `send --uri`
submits the preview, waits until the transaction Subscription observes it, and
prints the canonical link plus every encoded property. The focused suite runs
that round trip for all eight chain and network-mode combinations.

A real network Layer attaches a typed block-explorer confirmation to the
successful submission result. Sepolia submissions link to Etherscan, and Solana
Devnet submissions link to the matching Solana Explorer cluster.
Simulated submissions deliberately carry no explorer confirmation, so a fake
transaction identifier can never be presented as chain evidence.

Address copying follows the same portable architecture. The shared Program
records `RequestedClipboardCopy`, runs `CopyToClipboard` through an injected
`WalletClipboard`, and stores copied, denied, unavailable, or failed state for
every presenter. React and Foldkit provide the browser Layer. Expo provides a
native Layer backed by `expo-clipboard`. CLI and terminal hosts provide an
explicit unavailable Layer because they do not render copy controls.

Browser writes happen only from the copy button interaction. The clients do
not preflight the Permissions API because clipboard permission behavior differs
across browsers. They instead surface a denied or unavailable result and keep
the address selectable for manual copying. Browser demos require a secure
context. Native iOS and Android writes use `setStringAsync` and do not read the
clipboard, so the flow does not trigger the privacy prompts associated with
clipboard reads.

The separate temporary server policy still accepts positive, native Sepolia ETH
transfers to syntactically valid Ethereum recipients, up to 0.00001 ETH. It
rejects other networks, assets, malformed recipients, and larger amounts. It is
an opt-in real test-network example and is not the resource Layer behind the
eight-rail showcase. Anyone who can reach it can consume test ETH and request
signatures from its disposable public identity. The account must never hold
Mainnet assets or represent a trusted identity. The operation-handle store is
process-local and is intentionally lost when the server restarts.

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

Bitcoin and Sui networking are simulated in this increment. The repository
does not claim a Bitcoin node, Bitcoin indexer, or Sui RPC broadcast adapter.

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
