# Wallet | Algebraic domain invariants

The Wallet domain separates values that describe a request from values the
configured Effect Layers can execute. A URI may request an unsupported route.
An unsupported request cannot become a `TransferDraft`, `TransactionPreview`,
or submitted transaction state.

## Request and execution boundary

| Boundary              | Algebraic data type                                                                                                                                              | Meaning                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Portable request      | `SendEthIntent`<br>`SendSolIntent`<br>`SendUsdIntent`                                                                                                            | What a URI or host asked for, including unsupported deployment modes                  |
| Capability resolution | `ImplementedWalletIntentCapability`<br>`UnsupportedWalletIntentCapability`                                                                                       | Whether the configured Layers can execute the request                                 |
| Executable intent     | `SepoliaEthTransferIntent`<br>`SepoliaUsdcTransferIntent`<br>`SolanaDevnetSolTransferIntent`<br>`SolanaDevnetUsdcTransferIntent`                                 | The complete set of currently executable asset and Network combinations               |
| Executable draft      | `EthereumSepoliaEthTransferDraft`<br>`EthereumSepoliaUsdcTransferDraft`<br>`SolanaDevnetSolTransferDraft`<br>`SolanaDevnetUsdcTransferDraft`                     | A transfer with one exact Network, Currency, precision, amount, and destination       |
| Replayable preview    | `EthereumSepoliaEthTransactionPreview`<br>`EthereumSepoliaUsdcTransactionPreview`<br>`SolanaDevnetSolTransactionPreview`<br>`SolanaDevnetUsdcTransactionPreview` | A draft paired only with the fee and resulting-balance currencies valid for that case |

An implemented capability must contain an `ExecutableWalletIntent`. An
unsupported capability must contain the original `WalletIntent` request. The
two results cannot be confused by changing a boolean or string field.

`TransferDraftInput` is intentionally less constrained because it represents
untrusted host input. `transferDraftFromInput` validates it and returns an
`Option<TransferDraft>`. React actions, Foldkit Messages, the CLI, Effect
Terminal, OpenTUI, Expo, simulated services, and Node test-network services
only receive the validated `TransferDraft` union.

`transactionPreviewFromQuote` performs the same boundary check for provider
quotes. A bad quote becomes the typed `InvalidResponse` failure Message. It
never enters the Model or a replay tape.

## Impossible executable states

The public Schemas reject these combinations:

- ETH on a Solana Network.
- SOL on Ethereum Sepolia.
- USDC whose Network differs from the draft Network.
- ETH with a decimal precision other than 18.
- SOL with a decimal precision other than 9.
- USDC with a decimal precision other than 6.
- An Ethereum USDC preview whose fee is denominated in SOL.
- A Solana USDC preview whose resulting balance is denominated in ETH.
- An `Implemented` capability that contains only an unvalidated request.
- A submitted result carrying a second Network that contradicts its preview.

## Workflow states

The existing transaction workflow remains a tagged union:

```text
IdleTransaction
  | PreviewingTransaction
  | PreviewedTransaction
  | SubmittingTransaction
  | SubmittedTransaction
  | FailedTransactionPreview
  | FailedTransactionSubmission
```

The reducer accepts finite Command results only when they match the current
workflow identity. Stale preview, submission, and challenge-signing results do
not change the Model. Hosts cannot directly invoke those result Messages
through the public React action surface.

## Runtime invariants

Some invariants depend on external facts and cannot be proven only from a
closed algebraic data type:

- An `accountId` must refer to an account in the loaded portfolio.
- A destination string must decode as a valid address for its chain.
- A quote must still be unexpired when submission begins.
- A public signature must cryptographically verify for the requested account.
- A transaction hash must be accepted and confirmed by the selected network.

These checks remain typed Effect boundaries. Failures become Messages and side
effects remain in Commands, Subscriptions, and injected Layers. They are not
encoded as contradictory Model fields.

## Test evidence

The focused suite proves request and URI round trips, capability resolution,
draft rejection, preview rejection, stale result handling, Program replay,
every current client binding, and both network adapters. The optional live
tests additionally exercise real signing, submission, and WebSocket
observation on Ethereum Sepolia and Solana Devnet.
