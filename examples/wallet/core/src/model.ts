import { Array as Array_, Effect, Option, Order, Schema as S } from 'effect'

import { ClipboardCopyState, IdleClipboardCopy } from './clipboard.js'
import {
  AssetAmount,
  AssetDescriptor,
  AssetId,
  AtomicUnits,
  ChainDescriptor,
  ChainId,
  NetworkDescriptor,
  NetworkId,
  TestFundingEnvironment,
  assetForId,
  convertDisplayAmountToAtomicUnits,
  networkForId,
} from './currency.js'
import { BlockExplorerConfirmation } from './explorer.js'
import { NoWalletIntent, WalletIntentState } from './intent.js'
import { SendNetworkSelection } from './sendNetworkSelection.js'
import {
  LoadingWalletProfiles,
  ReadyToCreateWallet,
  WalletCreationState,
  WalletNetworkMode,
  WalletProfile,
  WalletProfileAccount,
  WalletProfileLoadingState,
} from './walletProfile.js'

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/** One public wallet account on one normalized network. */
export const WalletAccount = WalletProfileAccount
/** One public wallet account on one normalized network. */
export type WalletAccount = typeof WalletAccount.Type

/** One account's balance in one normalized asset. */
export const AccountBalance = S.Struct({
  accountId: S.String,
  amount: AssetAmount,
})
/** One account's balance in one normalized asset. */
export type AccountBalance = typeof AccountBalance.Type

const UnavailableBalanceAccountIds = S.Array(S.String).pipe(
  S.withDecodingDefaultKey(Effect.succeed([])),
  S.withConstructorDefault(Effect.succeed([])),
)

/** A timestamped snapshot of normalized asset balances. */
export const BalanceSnapshot = S.Struct({
  observedAt: S.Number,
  balances: S.Array(AccountBalance),
  unavailableAccountIds: UnavailableBalanceAccountIds,
})
/** A timestamped snapshot of normalized asset balances. */
export type BalanceSnapshot = typeof BalanceSnapshot.Type

/** Public instructions for receiving one asset into an account. */
export const ReceivingInstruction = S.Struct({
  accountId: S.String,
  assetId: AssetId,
  destinationAddress: S.String,
  maybeMemo: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
  portableUri: S.String,
})
/** Public instructions for receiving one asset into an account. */
export type ReceivingInstruction = typeof ReceivingInstruction.Type

/** The provenance of every balance and account in one portfolio snapshot. */
export const WalletDataSource = S.Literals(['Fixture', 'Testnet', 'Live'])
/** The provenance of every balance and account in one portfolio snapshot. */
export type WalletDataSource = typeof WalletDataSource.Type

/** Normalized public wallet data loaded from exactly one configured source. */
export const PortfolioSnapshot = S.Struct({
  dataSource: WalletDataSource,
  chains: S.Array(ChainDescriptor),
  networks: S.Array(NetworkDescriptor),
  assets: S.Array(AssetDescriptor),
  accounts: S.Array(WalletAccount),
  balanceSnapshot: BalanceSnapshot,
  receivingInstructions: S.Array(ReceivingInstruction),
})
/** Normalized public wallet data loaded from configured adapters. */
export type PortfolioSnapshot = typeof PortfolioSnapshot.Type

/** Reports whether every normalized portfolio reference resolves consistently. */
export const isPortfolioSnapshotConsistent = (
  portfolio: PortfolioSnapshot,
): boolean => {
  const hasUniqueCatalogIdentifiers =
    new Set(Array_.map(portfolio.chains, chain => chain.chainId)).size ===
      Array_.length(portfolio.chains) &&
    new Set(Array_.map(portfolio.networks, network => network.networkId))
      .size === Array_.length(portfolio.networks) &&
    new Set(Array_.map(portfolio.assets, asset => asset.assetId)).size ===
      Array_.length(portfolio.assets) &&
    new Set(Array_.map(portfolio.accounts, account => account.accountId))
      .size === Array_.length(portfolio.accounts)
  const hasUniqueCapabilities = Array_.every(
    portfolio.networks,
    network =>
      new Set(network.capabilities).size ===
      Array_.length(network.capabilities),
  )
  const hasSafeExternalTestFundingProviders = Array_.every(
    portfolio.networks,
    network => {
      if (network.testFundingMethod._tag !== 'ExternalTestFundingMethod') {
        return true
      }
      return (
        isHttpsUrl(network.testFundingMethod.providerUrl) &&
        network.testFundingMethod.providerName.trim() !== ''
      )
    },
  )
  const hasNetworks = Array_.every(portfolio.networks, network =>
    Array_.some(portfolio.chains, chain => chain.chainId === network.chainId),
  )
  const hasAssets = Array_.every(portfolio.assets, asset =>
    Array_.some(
      portfolio.networks,
      network => network.networkId === asset.networkId,
    ),
  )
  const hasAccounts = Array_.every(portfolio.accounts, account =>
    Array_.some(
      portfolio.networks,
      network =>
        network.networkId === account.networkId &&
        network.chainId === account.chainId,
    ),
  )
  const hasNoMainnetTestFunding = Array_.every(
    portfolio.networks,
    network =>
      network.environment !== 'Mainnet' ||
      (!Array_.contains(network.capabilities, 'TestFunding') &&
        !Array_.contains(network.capabilities, 'ExternalTestFunding') &&
        network.testFundingMethod._tag === 'UnavailableTestFundingMethod'),
  )
  const hasConsistentTestFundingMethods = Array_.every(
    portfolio.networks,
    network => {
      const hasAdapterCapability = Array_.contains(
        network.capabilities,
        'TestFunding',
      )
      const hasExternalCapability = Array_.contains(
        network.capabilities,
        'ExternalTestFunding',
      )
      if (network.testFundingMethod._tag === 'AdapterTestFundingMethod') {
        return hasAdapterCapability && !hasExternalCapability
      } else if (
        network.testFundingMethod._tag === 'ExternalTestFundingMethod'
      ) {
        return hasExternalCapability && !hasAdapterCapability
      } else {
        return !hasAdapterCapability && !hasExternalCapability
      }
    },
  )
  const hasBalances = Array_.every(
    portfolio.balanceSnapshot.balances,
    balance => {
      const maybeAccount = Array_.findFirst(
        portfolio.accounts,
        account => account.accountId === balance.accountId,
      )
      const maybeAsset = assetForId(portfolio.assets, balance.amount.assetId)
      return (
        Option.isSome(maybeAccount) &&
        Option.isSome(maybeAsset) &&
        maybeAccount.value.networkId === maybeAsset.value.networkId
      )
    },
  )
  const hasUniqueBalances =
    new Set(
      Array_.map(
        portfolio.balanceSnapshot.balances,
        balance => `${balance.accountId}\u0000${balance.amount.assetId}`,
      ),
    ).size === Array_.length(portfolio.balanceSnapshot.balances)
  const unavailableAccountIds = portfolio.balanceSnapshot.unavailableAccountIds
  const hasUnavailableBalanceAccounts =
    new Set(unavailableAccountIds).size ===
      Array_.length(unavailableAccountIds) &&
    Array_.every(
      unavailableAccountIds,
      accountId =>
        Array_.some(
          portfolio.accounts,
          account => account.accountId === accountId,
        ) &&
        !Array_.some(
          portfolio.balanceSnapshot.balances,
          balance => balance.accountId === accountId,
        ),
    )
  const hasReceivingInstructions = Array_.every(
    portfolio.receivingInstructions,
    instruction => {
      const maybeAccount = Array_.findFirst(
        portfolio.accounts,
        account => account.accountId === instruction.accountId,
      )
      const maybeAsset = assetForId(portfolio.assets, instruction.assetId)
      return (
        Option.isSome(maybeAccount) &&
        Option.isSome(maybeAsset) &&
        maybeAccount.value.networkId === maybeAsset.value.networkId
      )
    },
  )
  const hasUniqueReceivingInstructions =
    new Set(
      Array_.map(
        portfolio.receivingInstructions,
        instruction => `${instruction.accountId}\u0000${instruction.assetId}`,
      ),
    ).size === Array_.length(portfolio.receivingInstructions)
  return (
    hasUniqueCatalogIdentifiers &&
    hasUniqueCapabilities &&
    hasSafeExternalTestFundingProviders &&
    hasNetworks &&
    hasAssets &&
    hasAccounts &&
    hasNoMainnetTestFunding &&
    hasConsistentTestFundingMethods &&
    hasBalances &&
    hasUniqueBalances &&
    hasUnavailableBalanceAccounts &&
    hasReceivingInstructions &&
    hasUniqueReceivingInstructions
  )
}

/** Reports whether every restored profile account is present in a portfolio. */
export const doesPortfolioIncludeWalletProfiles = (
  portfolio: PortfolioSnapshot,
  wallets: ReadonlyArray<WalletProfile>,
): boolean =>
  Array_.every(wallets, wallet =>
    Array_.every(wallet.accounts, profileAccount =>
      Array_.some(
        portfolio.accounts,
        account =>
          account.accountId === profileAccount.accountId &&
          account.chainId === profileAccount.chainId &&
          account.networkId === profileAccount.networkId &&
          account.address === profileAccount.address,
      ),
    ),
  )

/** One public address-book entry with an adapter-normalized address. */
export const AddressBookEntry = S.Struct({
  entryId: S.String,
  networkId: NetworkId,
  address: S.String,
  normalizedAddress: S.String,
  displayName: S.String,
})
/** One public address-book entry with an adapter-normalized address. */
export type AddressBookEntry = typeof AddressBookEntry.Type

/** The destination does not match a saved address-book entry. */
export const UnfamiliarAddress = S.TaggedStruct('UnfamiliarAddress', {})
/** The destination matches a saved address-book entry. */
export const FamiliarAddress = S.TaggedStruct('FamiliarAddress', {
  entry: AddressBookEntry,
})
/** Address-book familiarity for a validated recipient. */
export const AddressFamiliarity = S.Union([UnfamiliarAddress, FamiliarAddress])
/** Address-book familiarity for a validated recipient. */
export type AddressFamiliarity = typeof AddressFamiliarity.Type

/** No prior outgoing transaction was loaded for this recipient. */
export const FirstTransactionWithRecipient = S.TaggedStruct(
  'FirstTransactionWithRecipient',
  {},
)
/** Public transaction history was loaded for this recipient. */
export const PreviouslyTransactedWithRecipient = S.TaggedStruct(
  'PreviouslyTransactedWithRecipient',
  {
    transactionCount: S.Int,
    mostRecentObservedAt: S.Number,
  },
)
/** Prior-recipient history derived from normalized transaction records. */
export const RecipientHistory = S.Union([
  FirstTransactionWithRecipient,
  PreviouslyTransactedWithRecipient,
])
/** Prior-recipient history derived from normalized transaction records. */
export type RecipientHistory = typeof RecipientHistory.Type

/** Safe adapter-provided guidance for an invalid transfer request. */
export const TransferGuidance = S.Struct({
  summary: S.String,
  details: S.Array(S.String),
})
/** Safe adapter-provided guidance for an invalid transfer request. */
export type TransferGuidance = typeof TransferGuidance.Type

/** A chain adapter validated and normalized one recipient. */
export const ValidatedRecipient = S.Struct({
  networkId: NetworkId,
  address: S.String,
  normalizedAddress: S.String,
  displayAddress: S.String,
})
/** A chain adapter validated and normalized one recipient. */
export type ValidatedRecipient = typeof ValidatedRecipient.Type

/** No transfer recipient has been entered. */
export const EmptyTransferRecipient = S.TaggedStruct(
  'EmptyTransferRecipient',
  {},
)
/** Unvalidated transfer recipient text is being edited. */
export const EditingTransferRecipient = S.TaggedStruct(
  'EditingTransferRecipient',
  { value: S.String },
)
/** The selected adapter rejected the transfer recipient. */
export const InvalidTransferRecipient = S.TaggedStruct(
  'InvalidTransferRecipient',
  {
    value: S.String,
    guidance: TransferGuidance,
  },
)
/** The selected adapter validated the transfer recipient. */
export const ValidTransferRecipient = S.TaggedStruct('ValidTransferRecipient', {
  recipient: ValidatedRecipient,
})
/** Renderer-neutral state of the editable transfer recipient. */
export const TransferRecipientState = S.Union([
  EmptyTransferRecipient,
  EditingTransferRecipient,
  InvalidTransferRecipient,
  ValidTransferRecipient,
])
/** Renderer-neutral state of the editable transfer recipient. */
export type TransferRecipientState = typeof TransferRecipientState.Type

/** Converts editable recipient text into chain-agnostic local state. */
export const transferRecipientFromInput = (
  input: string,
): TransferRecipientState => {
  const value = input.trim()
  if (value === '') {
    return EmptyTransferRecipient.make({})
  } else {
    return EditingTransferRecipient.make({ value })
  }
}

/** Returns the editable text represented by one recipient state. */
export const transferRecipientInput = (
  recipient: TransferRecipientState,
): string => {
  if (recipient._tag === 'EmptyTransferRecipient') {
    return ''
  } else if (recipient._tag === 'ValidTransferRecipient') {
    return recipient.recipient.displayAddress
  } else {
    return recipient.value
  }
}

/** No transfer amount has been entered. */
export const EmptyTransferAmount = S.TaggedStruct('EmptyTransferAmount', {})
/** A transfer amount cannot be represented by the selected asset. */
export const InvalidTransferAmount = S.TaggedStruct('InvalidTransferAmount', {
  value: S.String,
  code: S.Literals([
    'AssetUnavailable',
    'InvalidFormat',
    'TooManyDecimalPlaces',
    'MustBePositive',
  ]),
})
/** A transfer amount exactly represents positive atomic units. */
export const ValidTransferAmount = S.TaggedStruct('ValidTransferAmount', {
  value: S.String,
  atomicUnits: AtomicUnits,
})
/** Renderer-neutral state of the user-entered transfer amount. */
export const TransferAmountState = S.Union([
  EmptyTransferAmount,
  InvalidTransferAmount,
  ValidTransferAmount,
])
/** Renderer-neutral state of the user-entered transfer amount. */
export type TransferAmountState = typeof TransferAmountState.Type

/** Returns the editable text represented by one transfer amount state. */
export const transferAmountInput = (amount: TransferAmountState): string =>
  amount._tag === 'EmptyTransferAmount' ? '' : amount.value

/** Converts editable amount text through one exact asset descriptor. */
export const transferAmountFromInput = (
  value: string,
  maybeAsset: Option.Option<AssetDescriptor>,
): TransferAmountState => {
  if (value.trim() === '') {
    return EmptyTransferAmount.make({})
  }
  if (Option.isNone(maybeAsset)) {
    return InvalidTransferAmount.make({ value, code: 'AssetUnavailable' })
  }
  const conversion = convertDisplayAmountToAtomicUnits(
    value,
    maybeAsset.value.decimalPlaces,
  )
  if (conversion._tag === 'InvalidAssetDisplayAmount') {
    return InvalidTransferAmount.make({ value, code: conversion.code })
  } else {
    return ValidTransferAmount.make({
      value,
      atomicUnits: conversion.atomicUnits,
    })
  }
}

/** One chain-agnostic request to transfer an exact asset amount. */
export const TransferRequest = S.Struct({
  transferId: S.String,
  accountId: S.String,
  assetId: AssetId,
  destinationAddress: S.String,
  atomicUnits: AtomicUnits,
  maybeMessage: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
})
/** One chain-agnostic request to transfer an exact asset amount. */
export type TransferRequest = typeof TransferRequest.Type

/** An adapter-validated transfer ready for previewing. */
export const ValidatedTransfer = S.TaggedStruct('ValidatedTransfer', {
  request: TransferRequest,
  recipient: ValidatedRecipient,
})
/** An adapter-validated transfer ready for previewing. */
export type ValidatedTransfer = typeof ValidatedTransfer.Type

/** An adapter rejected a transfer before it could be previewed. */
export const RejectedTransfer = S.TaggedStruct('RejectedTransfer', {
  request: TransferRequest,
  guidance: TransferGuidance,
})
/** Result of validating one generic transfer through its selected adapter. */
export const TransferValidation = S.Union([ValidatedTransfer, RejectedTransfer])
/** Result of validating one generic transfer through its selected adapter. */
export type TransferValidation = typeof TransferValidation.Type

/** A network-produced public quote for one validated transfer. */
export const TransactionQuote = S.Struct({
  quoteId: S.String,
  estimatedFee: AssetAmount,
  resultingBalance: AssetAmount,
  expiresAt: S.Number,
})
/** A network-produced public quote for one validated transfer. */
export type TransactionQuote = typeof TransactionQuote.Type

/** A replayable preview of one validated transfer. */
export const TransactionPreview = S.Struct({
  previewId: S.String,
  transfer: ValidatedTransfer,
  estimatedFee: AssetAmount,
  resultingBalance: AssetAmount,
  expiresAt: S.Number,
  recipientFamiliarity: AddressFamiliarity,
  recipientHistory: RecipientHistory,
})
/** A replayable preview of one validated transfer. */
export type TransactionPreview = typeof TransactionPreview.Type

/** Validates one adapter quote against the normalized public portfolio. */
export const transactionPreviewFromQuote = (
  portfolio: PortfolioSnapshot,
  transfer: ValidatedTransfer,
  quote: TransactionQuote,
  recipientFamiliarity: AddressFamiliarity,
  recipientHistory: RecipientHistory,
): Option.Option<TransactionPreview> => {
  const request = transfer.request
  const maybeAccount = Array_.findFirst(
    portfolio.accounts,
    account => account.accountId === request.accountId,
  )
  const maybeAsset = assetForId(portfolio.assets, request.assetId)
  const maybeFeeAsset = assetForId(portfolio.assets, quote.estimatedFee.assetId)
  const maybeResultingAsset = assetForId(
    portfolio.assets,
    quote.resultingBalance.assetId,
  )
  if (
    Option.isNone(maybeAccount) ||
    Option.isNone(maybeAsset) ||
    Option.isNone(maybeFeeAsset) ||
    Option.isNone(maybeResultingAsset) ||
    maybeAccount.value.networkId !== maybeAsset.value.networkId ||
    maybeAsset.value.networkId !== transfer.recipient.networkId ||
    maybeFeeAsset.value.networkId !== maybeAsset.value.networkId ||
    quote.resultingBalance.assetId !== request.assetId
  ) {
    return Option.none()
  } else {
    return Option.some(
      TransactionPreview.make({
        previewId: quote.quoteId,
        transfer,
        estimatedFee: quote.estimatedFee,
        resultingBalance: quote.resultingBalance,
        expiresAt: quote.expiresAt,
        recipientFamiliarity,
        recipientHistory,
      }),
    )
  }
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

/** Checks that a submission belongs to its preview and exposes only a safe explorer link. */
export const isTransactionSubmissionConsistent = (
  preview: TransactionPreview,
  submission: TransactionSubmission,
): boolean => {
  if (
    submission.previewId !== preview.previewId ||
    submission.transactionId.trim() === '' ||
    submission.submittedAt < 0
  ) {
    return false
  }
  if (Option.isNone(submission.maybeExplorerConfirmation)) {
    return true
  }
  const confirmation = submission.maybeExplorerConfirmation.value
  return (
    confirmation.label.trim() !== '' &&
    confirmation.transactionId === submission.transactionId &&
    isHttpsUrl(confirmation.url)
  )
}

/** The direction of an observed transaction relative to one account. */
export const TransactionDirection = S.Literals(['Incoming', 'Outgoing'])
/** The direction of an observed transaction relative to one account. */
export type TransactionDirection = typeof TransactionDirection.Type

/** A public transaction status observed from a network. */
export const TransactionStatus = S.Literals(['Pending', 'Confirmed', 'Failed'])
/** A public transaction status observed from a network. */
export type TransactionStatus = typeof TransactionStatus.Type

/** One normalized public transaction record from history or observation. */
export const TransactionRecord = S.Struct({
  recordId: S.String,
  transactionId: S.String,
  accountId: S.String,
  networkId: NetworkId,
  direction: TransactionDirection,
  status: TransactionStatus,
  amount: AssetAmount,
  counterpartyAddress: S.String,
  normalizedCounterpartyAddress: S.String,
  observedAt: S.Number,
})
/** One normalized public transaction record from history or observation. */
export type TransactionRecord = typeof TransactionRecord.Type

/** One idempotent request for non-production funds on an exact network. */
export const TestFundingRequest = S.Struct({
  requestId: S.String,
  accountId: S.String,
  chainId: ChainId,
  networkId: NetworkId,
  environment: TestFundingEnvironment,
  assetId: AssetId,
  atomicUnits: AtomicUnits,
})
/** One idempotent request for non-production funds on an exact network. */
export type TestFundingRequest = typeof TestFundingRequest.Type

/** A public receipt proving that a test-funding request was accepted. */
export const TestFundingReceipt = S.Struct({
  requestId: S.String,
  fundingId: S.String,
  acceptedAt: S.Number,
  amount: AssetAmount,
  maybeTransactionId: S.OptionFromNullishOr(S.String, {
    onNoneEncoding: null,
  }),
})
/** A public receipt proving that a test-funding request was accepted. */
export type TestFundingReceipt = typeof TestFundingReceipt.Type

/** The largest portable transaction-history page supported by every adapter. */
export const maximumTransactionHistoryPageSize = 50

/** A cursor-based request for public transaction history. */
export const TransactionHistoryQuery = S.Struct({
  accountId: S.String,
  networkId: NetworkId,
  maybeCursor: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
  limit: S.Int.check(
    S.isBetween({ minimum: 1, maximum: maximumTransactionHistoryPageSize }),
  ),
})
/** A cursor-based request for public transaction history. */
export type TransactionHistoryQuery = typeof TransactionHistoryQuery.Type

/** One adapter-composed page of normalized transaction history. */
export const TransactionHistoryPage = S.Struct({
  records: S.Array(TransactionRecord),
  maybeNextCursor: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
})
/** One adapter-composed page of normalized transaction history. */
export type TransactionHistoryPage = typeof TransactionHistoryPage.Type

/** A canonical public digest scoped to one signing domain. */
export const DomainSeparatedDigest = S.Struct({
  algorithm: S.String,
  domain: S.String,
  digest: S.String,
  encoding: S.String,
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

/** A normalized public proof that one wallet account signed a challenge. */
export const SignatureProof = S.Struct({
  challengeId: S.String,
  accountId: S.String,
  algorithm: S.String,
  publicIdentity: S.String,
  signature: S.String,
  encoding: S.String,
})
/** A normalized public proof that one wallet account signed a challenge. */
export type SignatureProof = typeof SignatureProof.Type

/** A public wallet operation that can fail. */
export const WalletOperation = S.Literals([
  'LoadPortfolio',
  'RequestTestFunding',
  'ValidateTransfer',
  'PreviewTransfer',
  'BuildTransferPayload',
  'SignTransaction',
  'SubmitTransaction',
  'LoadTransactionHistory',
  'ObserveTransactions',
  'SignChallenge',
  'VerifyChallenge',
])
/** A public wallet operation that can fail. */
export type WalletOperation = typeof WalletOperation.Type

/** A networking failure safe to persist in the Wallet Model. */
export const NetworkFailure = S.TaggedStruct('NetworkFailure', {
  operation: WalletOperation,
  code: S.Literals([
    'Unavailable',
    'Rejected',
    'InvalidResponse',
    'UnsupportedCapability',
  ]),
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

/** Test funding is ready to be requested for the current selection. */
export const ReadyToRequestTestFunding = S.TaggedStruct(
  'ReadyToRequestTestFunding',
  {},
)
/** The selected adapter is requesting non-production funds. */
export const RequestingTestFunding = S.TaggedStruct('RequestingTestFunding', {
  request: TestFundingRequest,
})
/** One non-production funding request was accepted. */
export const ReceivedTestFunding = S.TaggedStruct('ReceivedTestFunding', {
  request: TestFundingRequest,
  receipt: TestFundingReceipt,
})
/** Test funding is unavailable for the current network or asset. */
export const UnavailableTestFunding = S.TaggedStruct('UnavailableTestFunding', {
  failure: WalletFailure,
})
/** One non-production funding request failed safely. */
export const FailedTestFunding = S.TaggedStruct('FailedTestFunding', {
  request: TestFundingRequest,
  failure: WalletFailure,
})
/** The finite lifecycle of generic non-production funding. */
export const TestFundingState = S.Union([
  ReadyToRequestTestFunding,
  RequestingTestFunding,
  ReceivedTestFunding,
  UnavailableTestFunding,
  FailedTestFunding,
])
/** The finite lifecycle of generic non-production funding. */
export type TestFundingState = typeof TestFundingState.Type

/** The Wallet is waiting for restored profiles before loading its portfolio. */
export const WaitingForWalletProfiles = S.TaggedStruct(
  'WaitingForWalletProfiles',
  {},
)
/** The Wallet is loading its public portfolio for one exact request. */
export const LoadingPortfolio = S.TaggedStruct('LoadingPortfolio', {
  requestId: S.String,
})
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
  WaitingForWalletProfiles,
  LoadingPortfolio,
  LoadedPortfolio,
  FailedPortfolio,
])
/** The Wallet's portfolio loading state. */
export type PortfolioState = typeof PortfolioState.Type

/** No transfer is being prepared. */
export const IdleTransaction = S.TaggedStruct('IdleTransaction', {})
/** One generic transfer is being validated by its selected adapter. */
export const ValidatingTransfer = S.TaggedStruct('ValidatingTransfer', {
  request: TransferRequest,
})
/** The selected adapter rejected one generic transfer. */
export const InvalidTransfer = S.TaggedStruct('InvalidTransfer', {
  request: TransferRequest,
  guidance: TransferGuidance,
})
/** One validated transfer is waiting for its network preview. */
export const PreviewingTransaction = S.TaggedStruct('PreviewingTransaction', {
  transfer: ValidatedTransfer,
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
/** One transaction validation failed because its adapter was unavailable. */
export const FailedTransferValidation = S.TaggedStruct(
  'FailedTransferValidation',
  { request: TransferRequest, failure: WalletFailure },
)
/** One transaction preview failed. */
export const FailedTransactionPreview = S.TaggedStruct(
  'FailedTransactionPreview',
  { transfer: ValidatedTransfer, failure: WalletFailure },
)
/** One signed-transaction submission failed. */
export const FailedTransactionSubmission = S.TaggedStruct(
  'FailedTransactionSubmission',
  { preview: TransactionPreview, failure: WalletFailure },
)
/** The Wallet's current generic transfer workflow. */
export const TransactionState = S.Union([
  IdleTransaction,
  ValidatingTransfer,
  InvalidTransfer,
  PreviewingTransaction,
  PreviewedTransaction,
  SubmittingTransaction,
  SubmittedTransaction,
  FailedTransferValidation,
  FailedTransactionPreview,
  FailedTransactionSubmission,
])
/** The Wallet's current generic transfer workflow. */
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

/** Transaction history has not yet been requested. */
export const NotLoadedTransactionHistory = S.TaggedStruct(
  'NotLoadedTransactionHistory',
  {},
)
/** One page of transaction history is loading. */
export const LoadingTransactionHistory = S.TaggedStruct(
  'LoadingTransactionHistory',
  { query: TransactionHistoryQuery },
)
/** Transaction history loaded and may have another page. */
export const LoadedTransactionHistory = S.TaggedStruct(
  'LoadedTransactionHistory',
  {
    maybeNextCursor: S.OptionFromNullishOr(S.String, {
      onNoneEncoding: null,
    }),
  },
)
/** Loading transaction history failed. */
export const FailedTransactionHistory = S.TaggedStruct(
  'FailedTransactionHistory',
  { query: TransactionHistoryQuery, failure: WalletFailure },
)
/** The Wallet's finite transaction-history loading state. */
export const TransactionHistoryState = S.Union([
  NotLoadedTransactionHistory,
  LoadingTransactionHistory,
  LoadedTransactionHistory,
  FailedTransactionHistory,
])
/** The Wallet's finite transaction-history loading state. */
export type TransactionHistoryState = typeof TransactionHistoryState.Type

/** The complete renderer-, platform-, and chain-agnostic Wallet Model. */
export const Model = S.Struct({
  wallets: S.Array(WalletProfile),
  walletProfileLoading: WalletProfileLoadingState,
  walletNetworkMode: WalletNetworkMode,
  maybeSendNetworkSelection: S.Option(SendNetworkSelection),
  walletCreation: WalletCreationState,
  clipboardCopy: ClipboardCopyState,
  portfolio: PortfolioState,
  walletIntent: WalletIntentState,
  transferRecipient: TransferRecipientState,
  transferAmount: TransferAmountState,
  nextPortfolioRequestNumber: S.Int,
  nextTransferRequestNumber: S.Int,
  testFunding: TestFundingState,
  nextTestFundingRequestNumber: S.Int,
  addressBookEntries: S.Array(AddressBookEntry),
  transaction: TransactionState,
  signature: SignatureState,
  transactionObservation: TransactionObservationState,
  transactionHistory: TransactionHistoryState,
  transactions: S.Array(TransactionRecord),
})
/** The complete renderer-, platform-, and chain-agnostic Wallet Model. */
export type Model = typeof Model.Type

/** The initial Wallet Model before public portfolio loading completes. */
export const initialModel: Model = {
  wallets: [],
  walletProfileLoading: LoadingWalletProfiles.make({}),
  walletNetworkMode: 'Testnet',
  maybeSendNetworkSelection: Option.none(),
  walletCreation: ReadyToCreateWallet.make({}),
  clipboardCopy: IdleClipboardCopy.make({}),
  portfolio: WaitingForWalletProfiles.make({}),
  walletIntent: NoWalletIntent.make({}),
  transferRecipient: EmptyTransferRecipient.make({}),
  transferAmount: EmptyTransferAmount.make({}),
  nextPortfolioRequestNumber: 1,
  nextTransferRequestNumber: 1,
  testFunding: ReadyToRequestTestFunding.make({}),
  nextTestFundingRequestNumber: 1,
  addressBookEntries: [],
  transaction: IdleTransaction.make({}),
  signature: IdleSignature.make({}),
  transactionObservation: WaitingForAccounts.make({}),
  transactionHistory: NotLoadedTransactionHistory.make({}),
  transactions: [],
}

/** Derives address-book familiarity from one adapter-normalized recipient. */
export const familiarityForRecipient = (
  entries: ReadonlyArray<AddressBookEntry>,
  recipient: ValidatedRecipient,
): AddressFamiliarity => {
  const maybeEntry = Array_.findFirst(
    entries,
    entry =>
      entry.networkId === recipient.networkId &&
      entry.normalizedAddress === recipient.normalizedAddress,
  )
  if (Option.isSome(maybeEntry)) {
    return FamiliarAddress.make({ entry: maybeEntry.value })
  } else {
    return UnfamiliarAddress.make({})
  }
}

/** Derives prior-recipient history from normalized transaction records. */
export const recipientHistoryForTransfer = (
  transactions: ReadonlyArray<TransactionRecord>,
  transfer: ValidatedTransfer,
): RecipientHistory => {
  const matchingTransactions = Array_.filter(
    transactions,
    transaction =>
      transaction.accountId === transfer.request.accountId &&
      transaction.networkId === transfer.recipient.networkId &&
      transaction.direction === 'Outgoing' &&
      transaction.normalizedCounterpartyAddress ===
        transfer.recipient.normalizedAddress,
  )
  return Array_.match(matchingTransactions, {
    onEmpty: () => FirstTransactionWithRecipient.make({}),
    onNonEmpty: records => {
      const mostRecentObservedAt = Array_.reduce(
        records,
        Number.NEGATIVE_INFINITY,
        (latest, transaction) => Math.max(latest, transaction.observedAt),
      )
      return PreviouslyTransactedWithRecipient.make({
        transactionCount: Array_.length(records),
        mostRecentObservedAt,
      })
    },
  })
}

const isSameSubmittedTransfer = (
  left: TransactionRecord,
  right: TransactionRecord,
): boolean =>
  left.accountId === right.accountId &&
  left.networkId === right.networkId &&
  left.transactionId === right.transactionId &&
  left.direction === right.direction &&
  left.amount.assetId === right.amount.assetId &&
  left.amount.atomicUnits === right.amount.atomicUnits &&
  left.normalizedCounterpartyAddress === right.normalizedCounterpartyAddress

/** Merges history and live records while reconciling an exact optimistic send. */
export const mergeTransactionRecords = (
  current: ReadonlyArray<TransactionRecord>,
  incoming: ReadonlyArray<TransactionRecord>,
): ReadonlyArray<TransactionRecord> => {
  const records = Array_.reduce(incoming, current, (merged, transaction) => {
    const hasSettledTransfer = Array_.some(
      merged,
      record =>
        record.status !== 'Pending' &&
        transaction.status === 'Pending' &&
        isSameSubmittedTransfer(record, transaction),
    )
    if (hasSettledTransfer) {
      return merged
    }
    return [
      ...Array_.filter(
        merged,
        record =>
          record.recordId !== transaction.recordId &&
          !(
            record.status === 'Pending' &&
            transaction.status !== 'Pending' &&
            isSameSubmittedTransfer(record, transaction)
          ),
      ),
      transaction,
    ]
  })
  return Array_.sortWith(
    records,
    transaction => transaction.observedAt,
    Order.flip(Order.Number),
  )
}

/** Finds the normalized network used by one account. */
export const networkForAccount = (
  portfolio: PortfolioSnapshot,
  account: WalletAccount,
): Option.Option<NetworkDescriptor> =>
  networkForId(portfolio.networks, account.networkId)
