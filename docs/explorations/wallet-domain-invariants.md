# Wallet | Algebraic domain invariants

The Wallet domain separates normalized public facts from adapter-owned chain
behavior. Core models one transfer workflow and one transaction history,
observation, and signing vocabulary. It does not enumerate executable chain,
network, or asset combinations.

## Catalog and execution boundary

| Boundary            | Schema                                       | Meaning                                                                          |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Chain catalog       | `ChainDescriptor`                            | One blockchain family identified by an opaque `chainId`                          |
| Network catalog     | `NetworkDescriptor`                          | One configured network referring to a chain and advertising generic capabilities |
| Asset catalog       | `AssetDescriptor`                            | One native or issued asset referring to a network                                |
| Account catalog     | `WalletAccount`                              | One public account referring to a network                                        |
| Transfer request    | `TransferRequest`                            | Account, asset, destination text, exact atomic amount, and optional memo         |
| Adapter validation  | `ValidatedTransfer` or `RejectedTransfer`    | An adapter accepted and normalized the recipient, or returned safe guidance      |
| Replayable preview  | `TransactionPreview`                         | A validated transfer with normalized fee and resulting-balance facts             |
| Protected execution | `TransactionPayload` and `SignedTransaction` | Opaque Redacted material excluded from public Program data                       |

Stable identifiers are opaque strings in core. Adapters own their construction,
nested network configuration, address decoding, SDK types, transaction bytes,
and signature algorithms.

`isPortfolioSnapshotConsistent` validates catalog references before a loaded
portfolio enters Model. `transactionPreviewFromQuote` performs the same
referential check for provider quotes. A bad snapshot or quote becomes a typed
`InvalidResponse` failure Message.

## Cross-record invariants

The public Schemas and boundary checks enforce these relationships:

- every Network refers to a loaded Chain;
- every Asset and Account refers to a loaded Network;
- every balance and receiving instruction refers to a compatible Account and
  Asset;
- a transfer Account and Asset share a Network;
- a validated recipient belongs to that Network;
- a quote fee asset belongs to the transfer Network;
- a resulting balance uses the transferred Asset;
- a transaction record refers to one normalized account, network, and asset;
- a payload and signed transaction retain the selected account and network;
- a signature proof retains the requested challenge and account identity.

The domain intentionally does not parse identifiers to infer these facts.
Relationships are resolved from the loaded catalog and checked again by the
selected adapter.

## Workflow states

The transaction workflow remains a tagged union:

```text
IdleTransaction
  | ValidatingTransfer
  | InvalidTransfer
  | PreviewingTransaction
  | PreviewedTransaction
  | SubmittingTransaction
  | SubmittedTransaction
  | FailedTransferValidation
  | FailedTransactionPreview
  | FailedTransactionSubmission
```

The reducer accepts finite Command results only when they match the current
transfer identity. Stale validation, preview, submission, history, and
challenge-signing results do not change Model. Hosts can send request facts,
but cannot directly invoke result Messages through the public action surface.

Transaction history is a finite cursor-based Command. Live observation is a
persistent Subscription. Both return `TransactionRecord`, and core merges them
by stable `recordId` so a confirmation can replace a pending fact without
creating a duplicate.

## Adapter invariants

Some invariants depend on external facts and cannot be proven only by a closed
core union:

- an address must decode under the selected adapter's rules;
- an account must be controlled by the configured transport or custody Layer;
- an issued asset reference must identify the expected contract, mint, or
  equivalent chain object;
- a quote must still be usable when payload construction begins;
- a public signature must cryptographically verify for the requested account;
- a transaction identifier must be accepted and confirmed by the selected
  network.

These checks remain typed Effect boundaries. Failures become Messages and side
effects remain in Commands, Subscriptions, and injected Layers. No adapter
maintains a second visible Wallet state.

## Extensibility invariant

Adding Bitcoin, Sui, another Ethereum network, or another Solana cluster must
not require a new core Message, Model variant, transaction state, signature
proof variant, or presenter branch. The adapter projects its public catalog,
implements the generic service operations, and advertises its capabilities.

Contract and program reads and writes remain explicit TODOs. Their future core
surface must describe chain-neutral intent and public results. ABI values,
Solana instructions, Move calls, Bitcoin scripts, and SDK objects remain
adapter-owned executable details.

## Test evidence

The focused suite proves catalog consistency, generic intent round trips,
adapter validation, preview checks, history merging, stale-result handling,
Program replay, remote opaque handles, every current client binding, and both
network adapters. Optional live tests additionally exercise real signing,
submission, and WebSocket observation on Ethereum Sepolia and Solana Devnet.
