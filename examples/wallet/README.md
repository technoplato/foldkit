# Wallet | Portable Program and client adapters

The Wallet example has one renderer- and platform-independent Program. Its
public Model, Messages, update function, finite Commands, persistent
transaction Subscription, restoration rules, and injected Effect services live
in `core`. Every client imports that exact `WalletProgram` object.

Wallet creation and restoration are also portable. Startup emits
`LoadWalletProfiles`, and `RequestedWalletCreation` enters a finite creation
state and emits `CreateWallet`. The injected `WalletVault` owns private
material outside the Model. A creation succeeds only after the vault has
durably written its custody record. One created profile has one normalized
account for every configured Bitcoin, Ethereum, Solana, and Sui network. The
same chain key derives the public identity for that chain on Development,
Testnet, and Mainnet without putting key material in the Program.

Sending has one explicit `SendNetworkSelection` in the Model. It identifies the
global network mode plus the exact chain, network, account, and native asset.
Changing the global mode preserves the selected Wallet and chain when the
corresponding rail exists, then falls back to another rail in the same Wallet
before changing Wallet identity. React, React Native, Foldkit, the CLI, Effect
Terminal, and OpenTUI all select and render that same value.

The checked-in `local-vault` adapter derives standards-based public addresses,
signs adapter-protected payloads, verifies public challenge proofs, and
serializes one opaque custody record per Wallet. Browser hosts encrypt each
record with AES-GCM and store the ciphertext plus a non-extractable CryptoKey
in origin-local IndexedDB. Expo stores each record in iOS Keychain or Android
encrypted storage through `expo-secure-store`. macOS CLI, Terminal, and OpenTUI
hosts persist the same record through native Keychain entries. No private
key enters the Model, Message journal, route, replay tape, browser localStorage,
networking adapter, or screen.

This is durable example custody, not a complete production wallet. It has no
recovery phrase, export, cloud backup, user-authentication gate, or hardware
wallet integration. Same-origin script compromise can access a browser vault
while the page is running, and users can erase browser site data. Native secure
storage can also be lost or invalidated. Irreplaceable funds require an explicit
backup and recovery design.

The core also defines the renderer-neutral `walletIntentRouter`. Its canonical
send paths have this shape:

```text
/wallet/intent/send?mode=<Devnet|Testnet|Live>&chain=<chain-id>&network=<network-id>&account=<account-id>&asset=<asset-id>&amount=<atomic-units>&to=<address>
```

Every query property is required. `mode`, `chain`, `network`, `account`, and
`asset` identify one exact send rail. `amount` is expressed in atomic units.
Parsing is side-effect free. Every carrier decodes an intent into pending
Program state. Portfolio loading then starts adapter validation and preview
Commands through update. Opening an intent never submits a transaction.

Recipient validation results are portable Program data, but address rules and
SDKs belong to the selected adapter. The live Ethereum adapter uses viem,
Solana uses `@solana/kit`, Bitcoin uses `@scure/btc-signer`, and Sui uses the
Mysten SDK. Core knows only validated-recipient facts or safe rejection
guidance.

```text
wallet/
  core/              portable Model, Message, Program, and service contracts
  live-client/       Bitcoin, Ethereum, Solana, and Sui network adapters
  local-vault/       portable persistent custody, signing, and verification
  node-client/       live networking plus macOS Keychain custody
  simulated-client/  deterministic complete Layer with no network or real funds
  testnet-node/       legacy fixed-account Sepolia and Solana Devnet adapters
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
pnpm demo:wallet create --network live
pnpm demo:wallet create --network testnet
pnpm demo:wallet create --network devnet --verbose
pnpm demo:wallet receive
pnpm demo:wallet history
pnpm demo:wallet history-next
pnpm demo:wallet preview --verbose
pnpm demo:wallet send --verbose
pnpm demo:wallet fund --mode devnet --chain ethereum --network ethereum:anvil --account <account-id> --asset ethereum:anvil:eth --display-amount 1
pnpm demo:wallet fund --mode testnet --chain ethereum --network ethereum:sepolia --account <account-id> --asset ethereum:sepolia:eth
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
by the screen. React and Foldkit select one complete resource graph at startup.
Browser clients default to `Live`, which combines the real multi-chain client
with origin-local encrypted custody. Set `VITE_WALLET_DATA_SOURCE=Fixture` only
for explicit deterministic testing, or `Testnet` only for the legacy remote
bridge. An unknown setting remains `Live`. A host never mixes a fixture
portfolio with live clients or signers.

The simulated Layer exposes Bitcoin, Ethereum, Solana, and Sui in both Devnet
and Testnet modes. It never contacts a network or controls real funds. It proves
the full Program flow, including multichain creation, global network switching,
per-chain selection, previews, signing, submission, finite transaction history,
transaction observation, state routes, replay routes, and historical
inspection. The screen labels this source `Fixture data`.

The adapter-backed Portfolio is built only from restored local Wallet profiles.
Creating a Wallet durably creates its keys first, then reloads those exact
public accounts through live chain adapters. Balance failures mark the affected
account unavailable instead of inventing zero or fixture money. The selected
screen tells the user to refresh while the other accounts remain usable.
Sending always signs with the private key registered for the selected account
and network. Runtime restoration hydrates that account registry before it
resumes an in-flight funding, validation, preview, submission, signature, or
history Command. A hydration failure moves the corresponding finite states to
typed failures instead of leaving a loading indicator active.

The raw CLI accepts the same deep link as the visual clients. `send --uri`
submits the preview, waits for an actual `ObservedTransaction` Subscription
Message after submission, and prints the canonical link plus every encoded
property. Effect Terminal and OpenTUI can also edit amount and recipient,
preview through the selected adapter, and submit without requiring a prepared
route.

A real network Layer attaches a typed block-explorer confirmation only when the
selected network has a real explorer. Anvil and simulated submissions carry no
explorer confirmation, so a fabricated URL can never be presented as chain
evidence.

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
twelve-rail showcase. Anyone who can reach it can consume test ETH and request
signatures from its disposable public identity. The account must never hold
Mainnet assets or represent a trusted identity. The operation-handle store is
process-local and is intentionally lost when the server restarts.

The public demos are available at:

- `https://wallet.knophy.com/` for React
- `https://wallet-foldkit.knophy.com/` for Foldkit
- `https://wallet-testnet.knophy.com/health` for the server health check

## Live network Layers

`live-client` implements one complete normalized `WalletClient` over native BTC,
ETH, SOL, and SUI. It never owns private keys. `local-vault` implements the
matching `WalletVault`, `WalletSigner`, and `WalletCrypto` services and rejects
payloads whose account, network, source address, or script does not match its
custody registry.

| Cryptocurrency | Devnet | Testnet  | Live         | Test funding                        | History and observation                                        |
| -------------- | ------ | -------- | ------------ | ----------------------------------- | -------------------------------------------------------------- |
| Bitcoin        | Signet | Testnet4 | Mainnet      | Real external faucet handoff        | Esplora cursor history and mempool websocket                   |
| Ethereum       | Anvil  | Sepolia  | Mainnet      | Anvil RPC; external Sepolia handoff | Anvil block cursors, Blockscout cursors, and websocket blocks  |
| Solana         | Devnet | Testnet  | Mainnet Beta | Devnet and Testnet RPC airdrops     | Signature cursor history and `logsSubscribe`                   |
| Sui            | Devnet | Testnet  | Mainnet      | Official Devnet and Testnet faucets | GraphQL cursor history and deduplicated near-real-time polling |

Test funding is a nested network method, not a promise attached to every
non-Mainnet network. Adapter-backed requests are enabled only after the user
enters a valid positive amount, and the receipt records the amount accepted by
the network faucet. Bitcoin Signet, Bitcoin Testnet4, and Ethereum Sepolia
instead expose the selected Wallet receiving address plus a real provider-owned
faucet URL. Browser and native screens open that URL; CLI, Terminal, and OpenTUI
print it for an authenticated Safari or CAPTCHA step. The app never represents
that external handoff as an automatic success. Mainnet has no test-funding
method or capability.

History is adapter-native and cursor based. Sepolia and Mainnet use Blockscout.
Anvil scans its developer-owned JSON-RPC blocks with a block-and-transaction
cursor. Every adapter enforces the portable 1-to-50 record page bound. Solana
also bounds transaction-detail fan-out while composing a page. The Program
merges those finite pages with live observations by stable record identity.

Physical Expo clients can point Anvil at a developer Mac or another reachable
host instead of device loopback:

```text
EXPO_PUBLIC_WALLET_ETHEREUM_ANVIL_HTTP_RPC_URL=http://<host>:8545
EXPO_PUBLIC_WALLET_ETHEREUM_ANVIL_WS_RPC_URL=ws://<host>:8545
```

See [`VERIFICATION_MATRIX.md`](./VERIFICATION_MATRIX.md) for the exact rail and
client evidence matrix. Mainnet broadcast cells stay explicitly unexecuted
unless a human authorizes real funds.

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

Consumers use one `WalletSigner` contract for Bitcoin, Ethereum, Solana, and
Sui. A public
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
