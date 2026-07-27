import { Array as Array_, Match as M, Option, Schema as S } from 'effect'

import { Currency, CurrencyValue, Network } from './currency.js'

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

/** A public transfer request before network preview. */
export const TransferDraft = S.Struct({
  transferId: S.String,
  accountId: S.String,
  network: Network,
  destinationAddress: S.String,
  value: CurrencyValue,
  maybeMessage: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
})
/** A public transfer request before network preview. */
export type TransferDraft = typeof TransferDraft.Type

/** A network-produced public quote for one transfer. */
export const TransactionQuote = S.Struct({
  quoteId: S.String,
  estimatedFee: CurrencyValue,
  resultingBalance: CurrencyValue,
  expiresAt: S.Number,
})
/** A network-produced public quote for one transfer. */
export type TransactionQuote = typeof TransactionQuote.Type

/** A public transaction preview safe to render, journal, and replay. */
export const TransactionPreview = S.Struct({
  previewId: S.String,
  draft: TransferDraft,
  estimatedFee: CurrencyValue,
  resultingBalance: CurrencyValue,
  expiresAt: S.Number,
  recipientFamiliarity: AddressFamiliarity,
  recipientHistory: RecipientHistory,
})
/** A public transaction preview safe to render, journal, and replay. */
export type TransactionPreview = typeof TransactionPreview.Type

/** A public result returned after a signed transaction was submitted. */
export const TransactionSubmission = S.Struct({
  previewId: S.String,
  transactionId: S.String,
  network: Network,
  submittedAt: S.Number,
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
