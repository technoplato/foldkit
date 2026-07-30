# Wallet | Normalized chain adapters

## Status

Accepted on July 28th, 2026. This decision supersedes the closed Network,
Currency, transfer-draft, transaction-preview, and signature-proof unions in
ADR 0004. ADR 0004 still governs portable Programs, secret isolation,
Commands, Subscriptions, and inert replay.

## Context

The first Wallet implementation proved one Program across React, React Native,
Foldkit, CLI, Effect Terminal, and OpenTUI. It also proved real Ethereum
Sepolia and Solana Devnet transfers through injected Effect Layers.

That implementation encoded each executable combination directly in Wallet
core. Examples included `EthereumSepoliaEthTransferDraft`,
`SolanaDevnetSolTransferDraft`, chain-specific transaction previews, and a
flat Network union containing Ethereum Sepolia, Solana Devnet, and Solana
Testnet. Core also imported `viem` and `@solana/addresses` so it could validate
recipient strings synchronously.

Those choices made invalid combinations difficult to construct, but they made
the shared Program a catalog of the first two adapters. Adding Bitcoin, Sui,
another Ethereum network, or another Solana cluster required editing core
Schemas, exhaustive Matches, Commands, tests, and presentations. A new chain
could not be added only by providing a Layer.

## Decision

### Core owns normalized public facts

Wallet core models business operations without enumerating chains, networks,
assets, address formats, signing algorithms, or transaction encodings.

The normalized public catalog contains:

- `ChainDescriptor`, identified by `chainId`;
- `NetworkDescriptor`, identified by `networkId` and referring to `chainId`;
- `AssetDescriptor`, identified by `assetId` and referring to `networkId`;
- `WalletAccount`, identified by `accountId` and referring to `networkId`;
- balances, receiving instructions, transfers, and transaction records that
  refer to those stable identifiers instead of repeating chain-specific data.

A persisted `WalletProfile` contains one `WalletProfileAccount` per configured
network. That account is the same public identity used by networking, signing,
history, observation, receiving, and secure storage. A transport must not
substitute a fixed demo account for a restored profile.

Descriptors carry portable display facts such as a name, symbol, decimal
precision, and network environment. They do not carry SDK clients, RPC
handles, private keys, ABI values, or chain-specific executable payloads.

Stable identifiers are opaque Schema strings to Wallet core. A chain adapter
owns their construction and validation. An adapter may use identifiers such as
`ethereum`, `ethereum:sepolia`, or `ethereum:sepolia:eth`, but core does not
parse those strings to recover business behavior.

### Chain and network structure belongs to adapters

Networks are not a flat core union. Each adapter owns its own nested and
exhaustive configuration domain. For example, the Ethereum adapter may model
an Ethereum network containing Mainnet or Sepolia, while the Solana adapter may
model a Solana cluster containing Mainnet Beta, Devnet, or Testnet. Bitcoin and
Sui adapters can model their own network concepts without widening a shared
core union.

Each configured adapter projects its chain-specific configuration into the
normalized public descriptors returned to the Wallet Program. The Program
uses stable identifiers and capability results. It never Matches on
`Ethereum`, `Solana`, `Bitcoin`, or `Sui`.

### One generic transfer workflow

Core has one transfer request and one transfer state machine.

A transfer request contains only the facts the business workflow needs:

- transfer ID;
- source account ID;
- asset ID;
- destination text;
- exact amount in atomic units;
- an optional public memo.

It does not repeat Network, Currency, token address, or decimal precision.
Those facts are resolved from the normalized catalog and checked by the
selected adapter.

The generic finite workflow is:

```text
TransferRequest
  -> validate recipient
  -> preview transfer
  -> build transfer payload
  -> sign transaction
  -> submit transaction
```

`BuildTransferPayload` returns a protected, opaque payload associated with an
account and network. No encoded transaction, signing bytes, provider request,
or SDK value enters Model, Message, replay, logs, or DevTools.

Preview results contain normalized fee and resulting-balance amounts. An
adapter rejects an account, asset, recipient, quote, or network mismatch before
returning a portable success fact.

### Adapter and Layer boundary

Wallet core consumes one host-provided service surface:

- load the normalized portfolio catalog for restored Wallet profiles;
- request test funding when an exact non-Mainnet network advertises it;
- validate a recipient for an account and asset;
- preview a transfer;
- build a protected transfer payload;
- submit a signed transaction;
- load a page of transaction history;
- observe live transaction changes;
- sign a transaction or public challenge;
- verify a public signature proof.

Ethereum, Solana, Bitcoin, Sui, simulated, hardware-wallet, remote-custody, and
managed-custody packages implement those operations through Effect Layers.
Hosts compose adapter instances into one Wallet service. Adding an adapter must
not require a new core Message, Model variant, update branch, or presenter
branch.

Transport and custody remain separate dependencies. A read-only host can
provide networking and history without signing authority. A remote signer can
provide custody without exposing a chain SDK or key material to the Program.

### Network modes and test funding

The Program has the closed presentation modes `Devnet`, `Testnet`, and `Live`.
They project open adapter-owned network environments as follows:

- `Devnet` includes Development and Local networks;
- `Testnet` includes Testnet networks;
- `Live` includes Mainnet networks.

This mode union controls presentation only. It does not enumerate chains or
network IDs. Adapters still own the catalog and capabilities.

Test funding is a nested method on a network descriptor. An
`AdapterTestFundingMethod` advertises the `TestFunding` capability. One generic
request names the account, chain, network, environment, asset, exact atomic
amount, and idempotency ID, and the adapter returns a public receipt or typed
failure. An `ExternalTestFundingMethod` instead advertises
`ExternalTestFunding` plus a provider name and URL. Presenters expose the exact
selected receiving address for the provider-owned authentication or CAPTCHA
flow without claiming that funds were accepted. Mainnet cannot advertise
either capability or method. A screen never invents faucet success, balance
data, or a transaction identifier.

### Custody follows normalized accounts

`WalletVault`, `WalletSigner`, and `WalletCrypto` share one host-owned custody
registry outside Model. Wallet creation generates one key per chain and derives
one account per requested network. Each protected transaction payload carries
only its account ID, network ID, and redacted adapter encoding.

Before signing, custody validates the registered account, selected network,
source identity, and adapter-specific payload facts. Bitcoin additionally
validates every PSBT input script. Ethereum validates the EIP-1559 chain and
source account. Solana validates the fee payer and source. Sui validates the
transaction sender. This preserves one generic Program without weakening the
boundary between networking and private keys.

Browser custody stores encrypted records and a non-extractable WebCrypto key in
origin-local IndexedDB. React Native uses Expo SecureStore. macOS hosts use a
native Keychain binding rather than placing records in process arguments. Each
host implements the same `WalletVaultStorage` boundary, so persistence choices
never enter the Program.

### Address validation

`viem` and `@solana/addresses` were previously imported by Wallet core to
validate recipient text and produce human guidance before a preview. Validation
is chain behavior, so those libraries move to the Ethereum and Solana adapter
packages.

Core represents the portable validation lifecycle and result. The selected
adapter returns either a validated recipient fact or an invalid-recipient fact
with safe display guidance. Core does not know whether validation used hex,
Base58, Bech32, a checksum, an RPC lookup, or another chain rule.

### Transaction history and observation

Historical loading and live observation are distinct operations:

- `LoadTransactionHistory` is a finite Command that requests a cursor-based
  page of 1 to 50 records for normalized account IDs;
- `ObserveTransactions` is a persistent Subscription that emits new or changed
  transaction facts.

Both produce the same normalized `TransactionRecord`. Core merges records by a
stable record ID, so history and observation cannot create duplicate entries.
Loaded pages and live observations remain replayable public facts.

An adapter may use an indexer, RPC history method, authenticated provider, or
local database. That implementation choice does not change the Program.

### Signatures

Core stores a normalized public signature proof containing its challenge ID,
account ID, algorithm identifier, public identity, signature text, and
encoding. Chain adapters own canonical bytes, hashing, signing, recovery, and
verification. Adding another signature algorithm does not widen a core union.

### Contract and program operations

The following capabilities are explicit TODOs and are not part of this
migration:

- **TODO: contract or program reading.** Define a chain-neutral read intent,
  protected adapter request, typed public result, replay behavior, and
  capability discovery without placing ABI or SDK objects in core.
- **TODO: contract or program writing.** Define a chain-neutral write intent
  that reuses preview, payload building, signing, submission, observation, and
  policy approval without treating an arbitrary write as a simple transfer.

Ethereum contract calls and Solana program instructions remain internal
adapter implementation details until those portable intent contracts are
designed.

## Elm Architecture constraints

Normalization does not move business behavior into services.

- Model remains the single source of visible Wallet truth.
- Messages remain replayable facts.
- update remains deterministic and contains the generic state machines.
- finite side effects remain Commands.
- live transaction changes remain Subscriptions.
- Layers perform chain, provider, custody, and cryptographic effects.

Finite portfolio loads carry a request identity in the loading state, Command,
and completion Message. update ignores a completion that does not match the
active request, so profile restoration and refresh cannot apply stale network
data after a newer load begins.

Runtime restoration first rehydrates live account resources through that
portfolio load. Only its matching success resumes in-flight funding,
validation, preview, submission, signature, and history Commands represented by
the Model. A load failure converts those finite states to typed failures. It
does not leave them spinning or start account-dependent work against an empty
adapter registry.

Adapters return facts to the Program. They do not mutate Model, dispatch hidden
Messages, or retain a second visible Wallet state.

## Migration

1. Introduce normalized chain, network, asset, account, amount, transfer,
   signature, and transaction Schemas in Wallet core.
2. Replace chain-specific transfer drafts and previews with one generic request
   and preview.
3. Move Ethereum and Solana address validation and SDK dependencies out of
   Wallet core.
4. Replace fixed Ethereum/Solana routing with adapter registration and
   normalized identifier lookup.
5. Add cursor-based transaction-history loading and merge it with live
   observation.
6. Update simulated, remote, Node test-network, React, React Native, Foldkit,
   CLI, Effect Terminal, and OpenTUI consumers.
7. Build Bitcoin and Sui adapters against this boundary without widening core.
8. Persist the same normalized accounts in browser, Expo secure storage, and
   macOS Keychain custody.
9. Add generic test funding, live observation, and cursor history controls to
   every presenter.

This migration is complete for the Wallet example. Compatibility aliases must
not preserve the old closed-union architecture. The older fixed-account
`testnet-node` and remote bridge remain restricted compatibility examples and
must reject restored profiles they do not actually own.

## Consequences

Adding a chain becomes adapter work instead of a core rewrite. Wallet core no
longer depends on Ethereum or Solana SDKs. Transaction history becomes a first
class finite capability. Presenters render normalized descriptors and do not
branch on a chain.

The tradeoff is that impossible cross-record combinations can no longer be
proven only by one closed TypeScript union. Adapters must validate identifier
relationships before returning facts, and core must reject references missing
from the loaded catalog. Tests therefore cover both Schema validity and
cross-record referential integrity.
