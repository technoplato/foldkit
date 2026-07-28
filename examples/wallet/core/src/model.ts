import { Array as Array_, Match as M, Option, Schema as S } from 'effect'

import {
  InvalidNetworkAddress,
  NetworkAddressFormat,
  ValidatedNetworkAddress,
  networkAddressFormat,
  validateNetworkAddress,
} from './address.js'
import {
  Currency,
  CurrencyValue,
  EthereumSepolia,
  EthereumSepoliaEthValue,
  EthereumSepoliaUsdc,
  EthereumSepoliaUsdcValue,
  Network,
  SolanaDevnet,
  SolanaDevnetSol,
  SolanaDevnetSolValue,
  SolanaDevnetUsdc,
  SolanaDevnetUsdcValue,
} from './currency.js'
import { BlockExplorerConfirmation } from './explorer.js'
import { NoWalletIntent, WalletIntentState } from './intent.js'

/** One public wallet account. */
export const WalletAccount = S.Struct({
  accountId: S.String,
  network: Network,
  address: S.String,
  displayName: S.String,
})
/** One public wallet account. */
export type WalletAccount = typeof WalletAccount.Type

/** One account's balance in one currency. */
export const AccountBalance = S.Struct({
  accountId: S.String,
  value: CurrencyValue,
})
/** One account's balance in one currency. */
export type AccountBalance = typeof AccountBalance.Type

/** A timestamped snapshot of currency-valued balances. */
export const BalanceSnapshot = S.Struct({
  observedAt: S.Number,
  balances: S.Array(AccountBalance),
})
/** A timestamped snapshot of currency-valued balances. */
export type BalanceSnapshot = typeof BalanceSnapshot.Type

/** Public instructions for receiving one currency into an account. */
export const ReceivingInstruction = S.Struct({
  accountId: S.String,
  network: Network,
  currency: Currency,
  destinationAddress: S.String,
  maybeMemo: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
  portableUri: S.String,
})
/** Public instructions for receiving one currency into an account. */
export type ReceivingInstruction = typeof ReceivingInstruction.Type

/** Public wallet data loaded from the selected networking Layer. */
export const PortfolioSnapshot = S.Struct({
  accounts: S.Array(WalletAccount),
  balanceSnapshot: BalanceSnapshot,
  receivingInstructions: S.Array(ReceivingInstruction),
})
/** Public wallet data loaded from the selected networking Layer. */
export type PortfolioSnapshot = typeof PortfolioSnapshot.Type

/** One public address-book entry. */
export const AddressBookEntry = S.Struct({
  entryId: S.String,
  network: Network,
  address: S.String,
  displayName: S.String,
})
/** One public address-book entry. */
export type AddressBookEntry = typeof AddressBookEntry.Type

/** The destination does not match a saved address-book entry. */
export const UnfamiliarAddress = S.TaggedStruct('UnfamiliarAddress', {})
/** The destination matches a saved address-book entry. */
export const FamiliarAddress = S.TaggedStruct('FamiliarAddress', {
  entry: AddressBookEntry,
})
/** Address-book familiarity for a transaction destination. */
export const AddressFamiliarity = S.Union([UnfamiliarAddress, FamiliarAddress])
/** Address-book familiarity for a transaction destination. */
export type AddressFamiliarity = typeof AddressFamiliarity.Type

/** No prior outgoing transaction was observed for this recipient. */
export const FirstTransactionWithRecipient = S.TaggedStruct(
  'FirstTransactionWithRecipient',
  {},
)
/** Public transaction history was observed for this recipient. */
export const PreviouslyTransactedWithRecipient = S.TaggedStruct(
  'PreviouslyTransactedWithRecipient',
  {
    transactionCount: S.Int,
    mostRecentObservedAt: S.Number,
  },
)
/** Prior-recipient history derived from public observed transactions. */
export const RecipientHistory = S.Union([
  FirstTransactionWithRecipient,
  PreviouslyTransactedWithRecipient,
])
/** Prior-recipient history derived from public observed transactions. */
export type RecipientHistory = typeof RecipientHistory.Type

const TransferDraftFields = {
  transferId: S.String,
  accountId: S.String,
  destinationAddress: S.String,
  maybeMessage: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
}

/** No transfer recipient has been entered for the selected network. */
export const EmptyTransferRecipient = S.TaggedStruct('EmptyTransferRecipient', {
  format: NetworkAddressFormat,
})
/** The entered recipient is not an address on the selected network. */
export const InvalidTransferRecipient = S.TaggedStruct(
  'InvalidTransferRecipient',
  {
    validation: InvalidNetworkAddress,
  },
)
/** The entered recipient is valid for its selected network. */
export const ValidTransferRecipient = S.TaggedStruct('ValidTransferRecipient', {
  address: ValidatedNetworkAddress,
})
/** The renderer-neutral state of the editable transfer recipient. */
export const TransferRecipientState = S.Union([
  EmptyTransferRecipient,
  InvalidTransferRecipient,
  ValidTransferRecipient,
])
/** The renderer-neutral state of the editable transfer recipient. */
export type TransferRecipientState = typeof TransferRecipientState.Type

/** Validates editable host input into the selected network's recipient state. */
export const transferRecipientFromInput = (
  network: Network,
  input: string,
): TransferRecipientState => {
  const trimmedInput = input.trim()
  if (trimmedInput === '') {
    return EmptyTransferRecipient.make({
      format: networkAddressFormat(network),
    })
  }
  const validation = validateNetworkAddress(network, trimmedInput)
  if (validation._tag === 'ValidNetworkAddress') {
    return ValidTransferRecipient.make({ address: validation.address })
  } else {
    return InvalidTransferRecipient.make({ validation })
  }
}

/** Returns the editable text represented by one recipient state. */
export const transferRecipientInput = (
  recipient: TransferRecipientState,
): string =>
  M.value(recipient).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      EmptyTransferRecipient: () => '',
      InvalidTransferRecipient: ({ validation }) => validation.input,
      ValidTransferRecipient: ({ address }) => address.value,
    }),
  )

/** Returns printable network address guidance for an editable recipient. */
export const transferRecipientFormat = (
  recipient: TransferRecipientState,
): NetworkAddressFormat =>
  M.value(recipient).pipe(
    M.withReturnType<NetworkAddressFormat>(),
    M.tagsExhaustive({
      EmptyTransferRecipient: ({ format }) => format,
      InvalidTransferRecipient: ({ validation }) => validation.format,
      ValidTransferRecipient: ({ address }) =>
        networkAddressFormat(address.network),
    }),
  )

/** An executable ETH transfer draft on Ethereum Sepolia. */
export const EthereumSepoliaEthTransferDraft = S.TaggedStruct(
  'EthereumSepoliaEthTransferDraft',
  {
    ...TransferDraftFields,
    network: EthereumSepolia,
    value: EthereumSepoliaEthValue,
  },
)
/** An executable ETH transfer draft on Ethereum Sepolia. */
export type EthereumSepoliaEthTransferDraft =
  typeof EthereumSepoliaEthTransferDraft.Type

/** An executable USDC transfer draft on Ethereum Sepolia. */
export const EthereumSepoliaUsdcTransferDraft = S.TaggedStruct(
  'EthereumSepoliaUsdcTransferDraft',
  {
    ...TransferDraftFields,
    network: EthereumSepolia,
    value: EthereumSepoliaUsdcValue,
  },
)
/** An executable USDC transfer draft on Ethereum Sepolia. */
export type EthereumSepoliaUsdcTransferDraft =
  typeof EthereumSepoliaUsdcTransferDraft.Type

/** An executable SOL transfer draft on Solana Devnet. */
export const SolanaDevnetSolTransferDraft = S.TaggedStruct(
  'SolanaDevnetSolTransferDraft',
  {
    ...TransferDraftFields,
    network: SolanaDevnet,
    value: SolanaDevnetSolValue,
  },
)
/** An executable SOL transfer draft on Solana Devnet. */
export type SolanaDevnetSolTransferDraft =
  typeof SolanaDevnetSolTransferDraft.Type

/** An executable USDC transfer draft on Solana Devnet. */
export const SolanaDevnetUsdcTransferDraft = S.TaggedStruct(
  'SolanaDevnetUsdcTransferDraft',
  {
    ...TransferDraftFields,
    network: SolanaDevnet,
    value: SolanaDevnetUsdcValue,
  },
)
/** An executable USDC transfer draft on Solana Devnet. */
export type SolanaDevnetUsdcTransferDraft =
  typeof SolanaDevnetUsdcTransferDraft.Type

/** A public transfer request that exactly matches an executable Layer. */
export const TransferDraft = S.Union([
  EthereumSepoliaEthTransferDraft,
  EthereumSepoliaUsdcTransferDraft,
  SolanaDevnetSolTransferDraft,
  SolanaDevnetUsdcTransferDraft,
])
/** A public transfer request that exactly matches an executable Layer. */
export type TransferDraft = typeof TransferDraft.Type

/** Host input used to validate and construct one executable transfer draft. */
export const TransferDraftInput = S.Struct({
  ...TransferDraftFields,
  network: Network,
  value: CurrencyValue,
})
/** Host input used to validate and construct one executable transfer draft. */
export type TransferDraftInput = typeof TransferDraftInput.Type

/** Validates host composition input into exactly one executable transfer case. */
export const transferDraftFromInput = (
  input: TransferDraftInput,
): Option.Option<TransferDraft> => {
  if (
    validateNetworkAddress(input.network, input.destinationAddress)._tag ===
    'InvalidNetworkAddress'
  ) {
    return Option.none()
  }
  return M.value(input.value.currency).pipe(
    M.withReturnType<Option.Option<TransferDraft>>(),
    M.tagsExhaustive({
      Eth: currency => {
        if (
          input.network._tag === 'EthereumSepolia' &&
          input.value.decimalPlaces === 18
        ) {
          return Option.some(
            EthereumSepoliaEthTransferDraft.make({
              ...input,
              network: currency.network,
              value: EthereumSepoliaEthValue.make({
                currency,
                atomicUnits: input.value.atomicUnits,
                decimalPlaces: 18,
                observedAt: input.value.observedAt,
              }),
            }),
          )
        } else {
          return Option.none()
        }
      },
      Sol: ({ network }) => {
        if (
          input.network._tag === 'SolanaDevnet' &&
          network._tag === 'SolanaDevnet' &&
          input.value.decimalPlaces === 9
        ) {
          return Option.some(
            SolanaDevnetSolTransferDraft.make({
              ...input,
              network,
              value: SolanaDevnetSolValue.make({
                currency: SolanaDevnetSol.make({ network }),
                atomicUnits: input.value.atomicUnits,
                decimalPlaces: 9,
                observedAt: input.value.observedAt,
              }),
            }),
          )
        } else {
          return Option.none()
        }
      },
      Usdc: ({ network, tokenAddress }) => {
        if (
          input.network._tag === 'EthereumSepolia' &&
          network._tag === 'EthereumSepolia' &&
          input.value.decimalPlaces === 6
        ) {
          return Option.some(
            EthereumSepoliaUsdcTransferDraft.make({
              ...input,
              network,
              value: EthereumSepoliaUsdcValue.make({
                currency: EthereumSepoliaUsdc.make({
                  network,
                  tokenAddress,
                }),
                atomicUnits: input.value.atomicUnits,
                decimalPlaces: 6,
                observedAt: input.value.observedAt,
              }),
            }),
          )
        } else if (
          input.network._tag === 'SolanaDevnet' &&
          network._tag === 'SolanaDevnet' &&
          input.value.decimalPlaces === 6
        ) {
          return Option.some(
            SolanaDevnetUsdcTransferDraft.make({
              ...input,
              network,
              value: SolanaDevnetUsdcValue.make({
                currency: SolanaDevnetUsdc.make({ network, tokenAddress }),
                atomicUnits: input.value.atomicUnits,
                decimalPlaces: 6,
                observedAt: input.value.observedAt,
              }),
            }),
          )
        } else {
          return Option.none()
        }
      },
      Fiat: () => Option.none(),
    }),
  )
}

/** A network-produced public quote for one transfer. */
export const TransactionQuote = S.Struct({
  quoteId: S.String,
  estimatedFee: CurrencyValue,
  resultingBalance: CurrencyValue,
  expiresAt: S.Number,
})
/** A network-produced public quote for one transfer. */
export type TransactionQuote = typeof TransactionQuote.Type

const TransactionPreviewFields = {
  previewId: S.String,
  expiresAt: S.Number,
  recipientFamiliarity: AddressFamiliarity,
  recipientHistory: RecipientHistory,
}

/** A replayable ETH transaction preview on Ethereum Sepolia. */
export const EthereumSepoliaEthTransactionPreview = S.TaggedStruct(
  'EthereumSepoliaEthTransactionPreview',
  {
    ...TransactionPreviewFields,
    draft: EthereumSepoliaEthTransferDraft,
    estimatedFee: EthereumSepoliaEthValue,
    resultingBalance: EthereumSepoliaEthValue,
  },
)

/** A replayable USDC transaction preview on Ethereum Sepolia. */
export const EthereumSepoliaUsdcTransactionPreview = S.TaggedStruct(
  'EthereumSepoliaUsdcTransactionPreview',
  {
    ...TransactionPreviewFields,
    draft: EthereumSepoliaUsdcTransferDraft,
    estimatedFee: EthereumSepoliaEthValue,
    resultingBalance: EthereumSepoliaUsdcValue,
  },
)

/** A replayable SOL transaction preview on Solana Devnet. */
export const SolanaDevnetSolTransactionPreview = S.TaggedStruct(
  'SolanaDevnetSolTransactionPreview',
  {
    ...TransactionPreviewFields,
    draft: SolanaDevnetSolTransferDraft,
    estimatedFee: SolanaDevnetSolValue,
    resultingBalance: SolanaDevnetSolValue,
  },
)

/** A replayable USDC transaction preview on Solana Devnet. */
export const SolanaDevnetUsdcTransactionPreview = S.TaggedStruct(
  'SolanaDevnetUsdcTransactionPreview',
  {
    ...TransactionPreviewFields,
    draft: SolanaDevnetUsdcTransferDraft,
    estimatedFee: SolanaDevnetSolValue,
    resultingBalance: SolanaDevnetUsdcValue,
  },
)

/** A public transaction preview safe to render, journal, and replay. */
export const TransactionPreview = S.Union([
  EthereumSepoliaEthTransactionPreview,
  EthereumSepoliaUsdcTransactionPreview,
  SolanaDevnetSolTransactionPreview,
  SolanaDevnetUsdcTransactionPreview,
])
/** A public transaction preview safe to render, journal, and replay. */
export type TransactionPreview = typeof TransactionPreview.Type

/** Validates one network quote against the exact transfer draft case. */
export const transactionPreviewFromQuote = (
  draft: TransferDraft,
  quote: TransactionQuote,
  recipientFamiliarity: AddressFamiliarity,
  recipientHistory: RecipientHistory,
): Option.Option<TransactionPreview> => {
  const fields = {
    previewId: quote.quoteId,
    expiresAt: quote.expiresAt,
    recipientFamiliarity,
    recipientHistory,
  }
  return M.value(draft).pipe(
    M.withReturnType<Option.Option<TransactionPreview>>(),
    M.tagsExhaustive({
      EthereumSepoliaEthTransferDraft: executableDraft => {
        const maybeEstimatedFee = S.decodeUnknownOption(
          EthereumSepoliaEthValue,
        )(quote.estimatedFee)
        const maybeResultingBalance = S.decodeUnknownOption(
          EthereumSepoliaEthValue,
        )(quote.resultingBalance)
        if (
          Option.isSome(maybeEstimatedFee) &&
          Option.isSome(maybeResultingBalance)
        ) {
          return Option.some(
            EthereumSepoliaEthTransactionPreview.make({
              ...fields,
              draft: executableDraft,
              estimatedFee: maybeEstimatedFee.value,
              resultingBalance: maybeResultingBalance.value,
            }),
          )
        } else {
          return Option.none()
        }
      },
      EthereumSepoliaUsdcTransferDraft: executableDraft => {
        const maybeEstimatedFee = S.decodeUnknownOption(
          EthereumSepoliaEthValue,
        )(quote.estimatedFee)
        const maybeResultingBalance = S.decodeUnknownOption(
          EthereumSepoliaUsdcValue,
        )(quote.resultingBalance)
        if (
          Option.isSome(maybeEstimatedFee) &&
          Option.isSome(maybeResultingBalance)
        ) {
          return Option.some(
            EthereumSepoliaUsdcTransactionPreview.make({
              ...fields,
              draft: executableDraft,
              estimatedFee: maybeEstimatedFee.value,
              resultingBalance: maybeResultingBalance.value,
            }),
          )
        } else {
          return Option.none()
        }
      },
      SolanaDevnetSolTransferDraft: executableDraft => {
        const maybeEstimatedFee = S.decodeUnknownOption(SolanaDevnetSolValue)(
          quote.estimatedFee,
        )
        const maybeResultingBalance = S.decodeUnknownOption(
          SolanaDevnetSolValue,
        )(quote.resultingBalance)
        if (
          Option.isSome(maybeEstimatedFee) &&
          Option.isSome(maybeResultingBalance)
        ) {
          return Option.some(
            SolanaDevnetSolTransactionPreview.make({
              ...fields,
              draft: executableDraft,
              estimatedFee: maybeEstimatedFee.value,
              resultingBalance: maybeResultingBalance.value,
            }),
          )
        } else {
          return Option.none()
        }
      },
      SolanaDevnetUsdcTransferDraft: executableDraft => {
        const maybeEstimatedFee = S.decodeUnknownOption(SolanaDevnetSolValue)(
          quote.estimatedFee,
        )
        const maybeResultingBalance = S.decodeUnknownOption(
          SolanaDevnetUsdcValue,
        )(quote.resultingBalance)
        if (
          Option.isSome(maybeEstimatedFee) &&
          Option.isSome(maybeResultingBalance)
        ) {
          return Option.some(
            SolanaDevnetUsdcTransactionPreview.make({
              ...fields,
              draft: executableDraft,
              estimatedFee: maybeEstimatedFee.value,
              resultingBalance: maybeResultingBalance.value,
            }),
          )
        } else {
          return Option.none()
        }
      },
    }),
  )
}

/** A public result returned after a signed transaction was submitted. */
export const TransactionSubmission = S.Struct({
  previewId: S.String,
  transactionId: S.String,
  submittedAt: S.Number,
  maybeExplorerConfirmation: S.Option(BlockExplorerConfirmation),
})
/** A public result returned after a signed transaction was submitted. */
export type TransactionSubmission = typeof TransactionSubmission.Type

/** The direction of an observed transaction relative to one account. */
export const TransactionDirection = S.Literals(['Incoming', 'Outgoing'])
/** The direction of an observed transaction relative to one account. */
export type TransactionDirection = typeof TransactionDirection.Type

/** A public transaction status observed from a network. */
export const TransactionStatus = S.Literals(['Pending', 'Confirmed', 'Failed'])
/** A public transaction status observed from a network. */
export type TransactionStatus = typeof TransactionStatus.Type

/** One public transaction record emitted by live network observation. */
export const TransactionRecord = S.Struct({
  transactionId: S.String,
  accountId: S.String,
  network: Network,
  direction: TransactionDirection,
  status: TransactionStatus,
  value: CurrencyValue,
  counterpartyAddress: S.String,
  observedAt: S.Number,
})
/** One public transaction record emitted by live network observation. */
export type TransactionRecord = typeof TransactionRecord.Type

/** A hash algorithm used by a canonical domain-separated challenge digest. */
export const DigestAlgorithm = S.Literals(['Keccak256', 'Sha256'])
/** A hash algorithm used by a canonical domain-separated challenge digest. */
export type DigestAlgorithm = typeof DigestAlgorithm.Type

/** A canonical public digest scoped to one signing domain. */
export const DomainSeparatedDigest = S.Struct({
  algorithm: DigestAlgorithm,
  domain: S.String,
  digestHex: S.String,
})
/** A canonical public digest scoped to one signing domain. */
export type DomainSeparatedDigest = typeof DomainSeparatedDigest.Type

/** A public challenge that can be signed by one wallet account. */
export const SigningChallenge = S.Struct({
  challengeId: S.String,
  accountId: S.String,
  digest: DomainSeparatedDigest,
})
/** A public challenge that can be signed by one wallet account. */
export type SigningChallenge = typeof SigningChallenge.Type

/** A public Ethereum-compatible signature proof. */
export const EthereumSignatureProof = S.TaggedStruct('EthereumSignatureProof', {
  challengeId: S.String,
  accountId: S.String,
  address: S.String,
  signatureHex: S.String,
})
/** A public Solana Ed25519 signature proof. */
export const SolanaEd25519SignatureProof = S.TaggedStruct(
  'SolanaEd25519SignatureProof',
  {
    challengeId: S.String,
    accountId: S.String,
    publicKey: S.String,
    signatureBase58: S.String,
  },
)
/** A public proof that a wallet account signed one exact challenge. */
export const SignatureProof = S.Union([
  EthereumSignatureProof,
  SolanaEd25519SignatureProof,
])
/** A public proof that a wallet account signed one exact challenge. */
export type SignatureProof = typeof SignatureProof.Type

/** A public wallet operation that can fail. */
export const WalletOperation = S.Literals([
  'LoadPortfolio',
  'PreviewTransaction',
  'PrepareTransaction',
  'DigestTransaction',
  'SignTransaction',
  'SubmitTransaction',
  'ObserveTransactions',
  'SignChallenge',
  'VerifyChallenge',
])
/** A public wallet operation that can fail. */
export type WalletOperation = typeof WalletOperation.Type

/** A networking failure safe to persist in the Wallet Model. */
export const NetworkFailure = S.TaggedStruct('NetworkFailure', {
  operation: WalletOperation,
  code: S.Literals(['Unavailable', 'Rejected', 'InvalidResponse']),
})
/** A signing failure safe to persist in the Wallet Model. */
export const SigningFailure = S.TaggedStruct('SigningFailure', {
  operation: WalletOperation,
  code: S.Literals(['Unavailable', 'Denied', 'UnsupportedAccount']),
})
/** A cryptographic failure safe to persist in the Wallet Model. */
export const CryptoFailure = S.TaggedStruct('CryptoFailure', {
  operation: WalletOperation,
  code: S.Literals(['Unavailable', 'InvalidPayload', 'VerificationFailed']),
})
/** A public Wallet failure containing no host error or secret material. */
export const WalletFailure = S.Union([
  NetworkFailure,
  SigningFailure,
  CryptoFailure,
])
/** A public Wallet failure containing no host error or secret material. */
export type WalletFailure = typeof WalletFailure.Type

/** The Wallet is loading its public portfolio. */
export const LoadingPortfolio = S.TaggedStruct('LoadingPortfolio', {})
/** The Wallet loaded its public portfolio. */
export const LoadedPortfolio = S.TaggedStruct('LoadedPortfolio', {
  snapshot: PortfolioSnapshot,
})
/** The Wallet failed to load its public portfolio. */
export const FailedPortfolio = S.TaggedStruct('FailedPortfolio', {
  failure: WalletFailure,
})
/** The Wallet's portfolio loading state. */
export const PortfolioState = S.Union([
  LoadingPortfolio,
  LoadedPortfolio,
  FailedPortfolio,
])
/** The Wallet's portfolio loading state. */
export type PortfolioState = typeof PortfolioState.Type

/** No transfer is being prepared. */
export const IdleTransaction = S.TaggedStruct('IdleTransaction', {})
/** One transfer is waiting for its network preview. */
export const PreviewingTransaction = S.TaggedStruct('PreviewingTransaction', {
  draft: TransferDraft,
  recipientFamiliarity: AddressFamiliarity,
  recipientHistory: RecipientHistory,
})
/** One transfer has a public network preview. */
export const PreviewedTransaction = S.TaggedStruct('PreviewedTransaction', {
  preview: TransactionPreview,
})
/** One preview is being signed and submitted. */
export const SubmittingTransaction = S.TaggedStruct('SubmittingTransaction', {
  preview: TransactionPreview,
})
/** One signed transaction was submitted. */
export const SubmittedTransaction = S.TaggedStruct('SubmittedTransaction', {
  preview: TransactionPreview,
  submission: TransactionSubmission,
})
/** One transaction preview failed. */
export const FailedTransactionPreview = S.TaggedStruct(
  'FailedTransactionPreview',
  { draft: TransferDraft, failure: WalletFailure },
)
/** One signed-transaction submission failed. */
export const FailedTransactionSubmission = S.TaggedStruct(
  'FailedTransactionSubmission',
  { preview: TransactionPreview, failure: WalletFailure },
)
/** The Wallet's current transaction workflow. */
export const TransactionState = S.Union([
  IdleTransaction,
  PreviewingTransaction,
  PreviewedTransaction,
  SubmittingTransaction,
  SubmittedTransaction,
  FailedTransactionPreview,
  FailedTransactionSubmission,
])
/** The Wallet's current transaction workflow. */
export type TransactionState = typeof TransactionState.Type

/** No arbitrary challenge is being signed. */
export const IdleSignature = S.TaggedStruct('IdleSignature', {})
/** One public challenge is being signed. */
export const SigningChallengeState = S.TaggedStruct('SigningChallengeState', {
  challenge: SigningChallenge,
})
/** One public challenge has a verified signature proof. */
export const SignedChallenge = S.TaggedStruct('SignedChallenge', {
  challenge: SigningChallenge,
  proof: SignatureProof,
})
/** Signing or verifying one challenge failed. */
export const FailedChallengeSignature = S.TaggedStruct(
  'FailedChallengeSignature',
  { challenge: SigningChallenge, failure: WalletFailure },
)
/** The Wallet's arbitrary challenge-signing state. */
export const SignatureState = S.Union([
  IdleSignature,
  SigningChallengeState,
  SignedChallenge,
  FailedChallengeSignature,
])
/** The Wallet's arbitrary challenge-signing state. */
export type SignatureState = typeof SignatureState.Type

/** Transaction observation is waiting for public accounts. */
export const WaitingForAccounts = S.TaggedStruct('WaitingForAccounts', {})
/** Transactions are being observed for the listed public accounts. */
export const ObservingTransactions = S.TaggedStruct('ObservingTransactions', {
  accountIds: S.Array(S.String),
})
/** Live transaction observation failed. */
export const FailedTransactionObservation = S.TaggedStruct(
  'FailedTransactionObservation',
  { failure: WalletFailure },
)
/** The Wallet's behaviorally meaningful observation state. */
export const TransactionObservationState = S.Union([
  WaitingForAccounts,
  ObservingTransactions,
  FailedTransactionObservation,
])
/** The Wallet's behaviorally meaningful observation state. */
export type TransactionObservationState =
  typeof TransactionObservationState.Type

/** The complete renderer- and platform-agnostic Wallet Model. */
export const Model = S.Struct({
  portfolio: PortfolioState,
  walletIntent: WalletIntentState,
  transferRecipient: TransferRecipientState,
  addressBookEntries: S.Array(AddressBookEntry),
  transaction: TransactionState,
  signature: SignatureState,
  transactionObservation: TransactionObservationState,
  observedTransactions: S.Array(TransactionRecord),
})
/** The complete renderer- and platform-agnostic Wallet Model. */
export type Model = typeof Model.Type

/** The initial Wallet Model before public portfolio loading completes. */
export const initialModel: Model = {
  portfolio: LoadingPortfolio.make({}),
  walletIntent: NoWalletIntent.make({}),
  transferRecipient: EmptyTransferRecipient.make({
    format: networkAddressFormat(EthereumSepolia.make({})),
  }),
  addressBookEntries: [],
  transaction: IdleTransaction.make({}),
  signature: IdleSignature.make({}),
  transactionObservation: WaitingForAccounts.make({}),
  observedTransactions: [],
}

const addressesMatch = (
  network: Network,
  leftAddress: string,
  rightAddress: string,
): boolean =>
  M.value(network).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      EthereumSepolia: () =>
        leftAddress.toLowerCase() === rightAddress.toLowerCase(),
      SolanaDevnet: () => leftAddress === rightAddress,
      SolanaTestnet: () => leftAddress === rightAddress,
    }),
  )

/** Derives address-book familiarity without consulting a host service. */
export const familiarityForAddress = (
  entries: ReadonlyArray<AddressBookEntry>,
  network: Network,
  address: string,
): AddressFamiliarity => {
  const maybeEntry = Array_.findFirst(
    entries,
    entry =>
      entry.network._tag === network._tag &&
      addressesMatch(network, entry.address, address),
  )
  if (Option.isSome(maybeEntry)) {
    return FamiliarAddress.make({ entry: maybeEntry.value })
  } else {
    return UnfamiliarAddress.make({})
  }
}

/** Derives public prior-recipient history from observed transactions. */
export const recipientHistoryForDraft = (
  transactions: ReadonlyArray<TransactionRecord>,
  draft: TransferDraft,
): RecipientHistory => {
  const matchingTransactions = Array_.filter(
    transactions,
    transaction =>
      transaction.accountId === draft.accountId &&
      transaction.network._tag === draft.network._tag &&
      transaction.direction === 'Outgoing' &&
      addressesMatch(
        draft.network,
        transaction.counterpartyAddress,
        draft.destinationAddress,
      ),
  )
  return Array_.match(matchingTransactions, {
    onEmpty: () => FirstTransactionWithRecipient.make({}),
    onNonEmpty: transactions => {
      const mostRecentObservedAt = Array_.reduce(
        transactions,
        Number.NEGATIVE_INFINITY,
        (latest, transaction) => Math.max(latest, transaction.observedAt),
      )
      return PreviouslyTransactedWithRecipient.make({
        transactionCount: transactions.length,
        mostRecentObservedAt,
      })
    },
  })
}
