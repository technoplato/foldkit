import {
  Array as Array_,
  Effect,
  Match as M,
  Option,
  Schema as S,
} from 'effect'
import { Command } from 'foldkit'

import {
  ClipboardCopyRequest,
  CopiedToClipboard,
  CopyingToClipboard,
  FailedClipboardCopy,
  IdleClipboardCopy,
  WalletClipboard,
  isSameClipboardCopyRequest,
} from './clipboard.js'
import {
  AssetAmount,
  type AssetDescriptor,
  type NetworkId,
  assetForId,
  displayAmountFromAtomicUnits,
  networkForId,
} from './currency.js'
import {
  AppliedWalletIntent,
  NoWalletIntent,
  RejectedWalletIntent,
  type WalletIntent,
} from './intent.js'
import {
  FailedCopyToClipboard,
  FailedCreateWallet,
  FailedLoadTransactionHistory,
  FailedLoadWallet,
  FailedLoadWalletProfiles,
  FailedPreviewTransaction,
  FailedRefreshWalletBalances,
  FailedRequestTestFunding,
  FailedSignChallenge,
  FailedSubmitSignedTransaction,
  FailedValidateTransfer,
  type Message,
  SucceededCopyToClipboard,
  SucceededCreateWallet,
  SucceededLoadTransactionHistory,
  SucceededLoadWallet,
  SucceededLoadWalletProfiles,
  SucceededPreviewTransaction,
  SucceededRefreshWalletBalances,
  SucceededRequestTestFunding,
  SucceededSignChallenge,
  SucceededSubmitSignedTransaction,
  SucceededValidateTransfer,
} from './message.js'
import {
  type AddressBookEntry,
  AddressFamiliarity,
  CryptoFailure,
  EditingTransferRecipient,
  EmptyTransferAmount,
  EmptyTransferRecipient,
  FailedChallengeSignature,
  FailedPortfolio,
  FailedTestFunding,
  FailedTransactionHistory,
  FailedTransactionObservation,
  FailedTransactionPreview,
  FailedTransactionSubmission,
  FailedTransferValidation,
  IdleSignature,
  IdleTransaction,
  InvalidTransfer,
  InvalidTransferRecipient,
  LoadedPortfolio,
  LoadedTransactionHistory,
  LoadingPortfolio,
  LoadingTransactionHistory,
  type Model,
  NetworkFailure,
  NotLoadedTransactionHistory,
  ObservingTransactions,
  PortfolioSnapshot,
  PreviewedTransaction,
  PreviewingTransaction,
  ReadyToRequestTestFunding,
  ReceivedTestFunding,
  RecipientHistory,
  RequestingTestFunding,
  type SignatureProof,
  type SignatureState,
  SignedChallenge,
  SigningChallenge,
  SigningChallengeState,
  SigningFailure,
  SubmittedTransaction,
  SubmittingTransaction,
  TestFundingRequest,
  type TestFundingState,
  TransactionHistoryQuery,
  type TransactionHistoryState,
  TransactionPreview,
  TransactionRecord,
  type TransactionState,
  type TransactionSubmission,
  TransferRequest,
  UnavailableTestFunding,
  ValidTransferRecipient,
  ValidatedTransfer,
  ValidatingTransfer,
  WaitingForAccounts,
  WaitingForWalletProfiles,
  type WalletFailure,
  type WalletOperation,
  doesPortfolioIncludeWalletProfiles,
  familiarityForRecipient,
  isPortfolioSnapshotConsistent,
  isTransactionSubmissionConsistent,
  maximumTransactionHistoryPageSize,
  mergeTransactionRecords,
  recipientHistoryForTransfer,
  transactionPreviewFromQuote,
  transferAmountFromInput,
  transferRecipientFromInput,
  transferRecipientInput,
} from './model.js'
import {
  type SendNetworkSelection,
  resolveSendNetworkSelection,
  selectSendNetworkForMode,
} from './sendNetworkSelection.js'
import {
  WalletClient,
  WalletClientError,
  WalletCrypto,
  type WalletCryptoError,
  type WalletResources,
  WalletSigner,
  type WalletSignerError,
} from './walletClient.js'
import {
  CreatingWallet,
  FailedWalletCreation,
  FailedWalletProfileLoading,
  LoadedWalletProfiles,
  LoadingWalletProfiles,
  ReadyToCreateWallet,
  WalletCreationRequest,
  WalletProfile,
  nextWalletCreationRequest,
  upsertWalletProfile,
} from './walletProfile.js'
import { WalletVault } from './walletVault.js'

const toNetworkFailure = (
  operation: WalletOperation,
  error: WalletClientError,
): WalletFailure => NetworkFailure.make({ operation, code: error.code })

const toSigningFailure = (
  operation: WalletOperation,
  error: WalletSignerError,
): WalletFailure => SigningFailure.make({ operation, code: error.code })

const toCryptoFailure = (
  operation: WalletOperation,
  error: WalletCryptoError,
): WalletFailure => CryptoFailure.make({ operation, code: error.code })

/** Loads normalized public wallet data through the injected WalletClient. */
export const LoadWallet = Command.define(
  'LoadWallet',
  { requestId: S.String, wallets: S.Array(WalletProfile) },
  SucceededLoadWallet,
  FailedLoadWallet,
)(({ requestId, wallets }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.loadPortfolio(wallets)),
    Effect.flatMap(portfolio =>
      isPortfolioSnapshotConsistent(portfolio) &&
      doesPortfolioIncludeWalletProfiles(portfolio, wallets)
        ? Effect.succeed(portfolio)
        : Effect.fail(new WalletClientError({ code: 'InvalidResponse' })),
    ),
    Effect.map(portfolio => SucceededLoadWallet.make({ requestId, portfolio })),
    Effect.catch(error =>
      Effect.succeed(
        FailedLoadWallet.make({
          requestId,
          failure: toNetworkFailure('LoadPortfolio', error),
        }),
      ),
    ),
  ),
)

/** Refreshes public balances without resetting selection, history, or observation. */
export const RefreshWalletBalances = Command.define(
  'RefreshWalletBalances',
  { walletIds: S.Array(S.String), wallets: S.Array(WalletProfile) },
  SucceededRefreshWalletBalances,
  FailedRefreshWalletBalances,
)(({ walletIds, wallets }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.loadPortfolio(wallets)),
    Effect.flatMap(portfolio =>
      isPortfolioSnapshotConsistent(portfolio) &&
      doesPortfolioIncludeWalletProfiles(portfolio, wallets)
        ? Effect.succeed(portfolio.balanceSnapshot)
        : Effect.fail(new WalletClientError({ code: 'InvalidResponse' })),
    ),
    Effect.map(balanceSnapshot =>
      SucceededRefreshWalletBalances.make({ walletIds, balanceSnapshot }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedRefreshWalletBalances.make({
          walletIds,
          failure: toNetworkFailure('RefreshBalances', error),
        }),
      ),
    ),
  ),
)

/** Requests non-production funds through the selected injected adapter. */
export const RequestTestFunding = Command.define(
  'RequestTestFunding',
  { request: TestFundingRequest },
  SucceededRequestTestFunding,
  FailedRequestTestFunding,
)(({ request }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.requestTestFunding(request)),
    Effect.flatMap(receipt =>
      receipt.requestId === request.requestId &&
      receipt.amount.assetId === request.assetId
        ? Effect.succeed(receipt)
        : Effect.fail(new WalletClientError({ code: 'InvalidResponse' })),
    ),
    Effect.map(receipt =>
      SucceededRequestTestFunding.make({ request, receipt }),
    ),
    Effect.catch(error =>
      Effect.succeed(
        FailedRequestTestFunding.make({
          request,
          failure: toNetworkFailure('RequestTestFunding', error),
        }),
      ),
    ),
  ),
)

/** Validates one generic transfer through its selected adapter. */
export const ValidateTransfer = Command.define(
  'ValidateTransfer',
  { request: TransferRequest },
  SucceededValidateTransfer,
  FailedValidateTransfer,
)(({ request }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.validateTransfer(request)),
    Effect.map(validation => SucceededValidateTransfer.make({ validation })),
    Effect.catch(error =>
      Effect.succeed(
        FailedValidateTransfer.make({
          request,
          failure: toNetworkFailure('ValidateTransfer', error),
        }),
      ),
    ),
  ),
)

/** Creates one multi-chain Wallet profile through the injected vault. */
export const CreateWallet = Command.define(
  'CreateWallet',
  { request: WalletCreationRequest },
  SucceededCreateWallet,
  FailedCreateWallet,
)(({ request }) =>
  WalletVault.pipe(
    Effect.flatMap(vault => vault.createWallet(request)),
    Effect.map(wallet => SucceededCreateWallet.make({ request, wallet })),
    Effect.catch(error =>
      Effect.succeed(FailedCreateWallet.make({ request, code: error.code })),
    ),
  ),
)

/** Restores public Wallet profiles whose custody remains in secure storage. */
export const LoadWalletProfiles = Command.define(
  'LoadWalletProfiles',
  SucceededLoadWalletProfiles,
  FailedLoadWalletProfiles,
)(
  WalletVault.pipe(
    Effect.flatMap(vault => vault.loadWallets),
    Effect.map(wallets => SucceededLoadWalletProfiles.make({ wallets })),
    Effect.catch(error =>
      Effect.succeed(FailedLoadWalletProfiles.make({ code: error.code })),
    ),
  ),
)

/** Writes one public value through the injected host clipboard. */
export const CopyToClipboard = Command.define(
  'CopyToClipboard',
  { request: ClipboardCopyRequest },
  SucceededCopyToClipboard,
  FailedCopyToClipboard,
)(({ request }) =>
  WalletClipboard.pipe(
    Effect.flatMap(clipboard => clipboard.writeText(request.value)),
    Effect.map(() => SucceededCopyToClipboard.make({ request })),
    Effect.catch(error =>
      Effect.succeed(FailedCopyToClipboard.make({ request, code: error.code })),
    ),
  ),
)

/** Builds a public transfer preview through the injected WalletClient. */
export const PreviewTransfer = Command.define(
  'PreviewTransfer',
  {
    portfolio: PortfolioSnapshot,
    transfer: ValidatedTransfer,
    recipientFamiliarity: AddressFamiliarity,
    recipientHistory: RecipientHistory,
  },
  SucceededPreviewTransaction,
  FailedPreviewTransaction,
)(({ portfolio, transfer, recipientFamiliarity, recipientHistory }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.previewTransfer(transfer)),
    Effect.flatMap(quote => {
      const maybePreview = transactionPreviewFromQuote(
        portfolio,
        transfer,
        quote,
        recipientFamiliarity,
        recipientHistory,
      )
      if (Option.isSome(maybePreview)) {
        return Effect.succeed(
          SucceededPreviewTransaction.make({ preview: maybePreview.value }),
        )
      } else {
        return Effect.fail(new WalletClientError({ code: 'InvalidResponse' }))
      }
    }),
    Effect.catch(error =>
      Effect.succeed(
        FailedPreviewTransaction.make({
          transfer,
          failure: toNetworkFailure('PreviewTransfer', error),
        }),
      ),
    ),
  ),
)

/** Builds, signs, and submits one public transfer preview. */
export const SignAndSubmitTransaction = Command.define(
  'SignAndSubmitTransaction',
  { preview: TransactionPreview },
  SucceededSubmitSignedTransaction,
  FailedSubmitSignedTransaction,
)(({ preview }) =>
  Effect.gen(function* () {
    const client = yield* WalletClient
    const signer = yield* WalletSigner
    const payload = yield* client
      .buildTransferPayload(preview)
      .pipe(
        Effect.mapError(error =>
          toNetworkFailure('BuildTransferPayload', error),
        ),
      )
    const signed = yield* signer
      .signTransaction(payload)
      .pipe(
        Effect.mapError(error => toSigningFailure('SignTransaction', error)),
      )
    const submission = yield* client
      .submitTransaction(signed)
      .pipe(
        Effect.mapError(error => toNetworkFailure('SubmitTransaction', error)),
      )
    if (!isTransactionSubmissionConsistent(preview, submission)) {
      return yield* Effect.fail(
        NetworkFailure.make({
          operation: 'SubmitTransaction',
          code: 'InvalidResponse',
        }),
      )
    }
    return SucceededSubmitSignedTransaction.make({ submission })
  }).pipe(
    Effect.catch(failure =>
      Effect.succeed(FailedSubmitSignedTransaction.make({ preview, failure })),
    ),
  ),
)

/** Loads one finite page of normalized public transaction history. */
export const LoadTransactionHistory = Command.define(
  'LoadTransactionHistory',
  { query: TransactionHistoryQuery },
  SucceededLoadTransactionHistory,
  FailedLoadTransactionHistory,
)(({ query }) =>
  Effect.gen(function* () {
    if (query.limit <= 0 || query.limit > maximumTransactionHistoryPageSize) {
      return yield* Effect.fail(
        new WalletClientError({ code: 'InvalidResponse' }),
      )
    }
    const client = yield* WalletClient
    const page = yield* client.loadTransactionHistory(query)
    if (
      !Array_.every(
        page.records,
        record =>
          record.accountId === query.accountId &&
          record.networkId === query.networkId,
      )
    ) {
      return yield* Effect.fail(
        new WalletClientError({ code: 'InvalidResponse' }),
      )
    }
    return page
  }).pipe(
    Effect.map(page => SucceededLoadTransactionHistory.make({ query, page })),
    Effect.catch(error =>
      Effect.succeed(
        FailedLoadTransactionHistory.make({
          query,
          failure: toNetworkFailure('LoadTransactionHistory', error),
        }),
      ),
    ),
  ),
)

/** Signs and verifies one public domain-separated challenge. */
export const SignChallenge = Command.define(
  'SignChallenge',
  { challenge: SigningChallenge },
  SucceededSignChallenge,
  FailedSignChallenge,
)(({ challenge }) =>
  Effect.gen(function* () {
    const signer = yield* WalletSigner
    const crypto = yield* WalletCrypto
    const proof: SignatureProof = yield* signer
      .signChallenge(challenge)
      .pipe(Effect.mapError(error => toSigningFailure('SignChallenge', error)))
    const isVerified = yield* crypto
      .verifySignatureProof(challenge, proof)
      .pipe(Effect.mapError(error => toCryptoFailure('VerifyChallenge', error)))
    if (isVerified) {
      return SucceededSignChallenge.make({ challenge, proof })
    } else {
      return yield* Effect.fail(
        CryptoFailure.make({
          operation: 'VerifyChallenge',
          code: 'VerificationFailed',
        }),
      )
    }
  }).pipe(
    Effect.catch(failure =>
      Effect.succeed(FailedSignChallenge.make({ challenge, failure })),
    ),
  ),
)

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
]

const historyQuery = (
  accountId: string,
  networkId: NetworkId,
  maybeCursor: Option.Option<string>,
): TransactionHistoryQuery => ({
  accountId,
  networkId,
  maybeCursor,
  limit: maximumTransactionHistoryPageSize,
})

const accountIdsForSelection = (
  maybeSelection: Option.Option<SendNetworkSelection>,
): ReadonlyArray<string> =>
  Option.match(maybeSelection, {
    onNone: () => [],
    onSome: selection => [selection.accountId],
  })

const transactionObservationForSelection = (
  maybeSelection: Option.Option<SendNetworkSelection>,
) =>
  Array_.match(accountIdsForSelection(maybeSelection), {
    onEmpty: () => WaitingForAccounts.make({}),
    onNonEmpty: accountIds => ObservingTransactions.make({ accountIds }),
  })

const accountIdsFromModel = (model: Model): ReadonlyArray<string> =>
  model.portfolio._tag === 'LoadedPortfolio'
    ? accountIdsForSelection(model.maybeSendNetworkSelection)
    : []

const beginPortfolioLoad = (
  model: Model,
  wallets: ReadonlyArray<WalletProfile>,
): UpdateReturn => {
  const requestId = `portfolio-${model.nextPortfolioRequestNumber.toString()}`
  return [
    {
      ...model,
      portfolio: LoadingPortfolio.make({ requestId }),
      nextPortfolioRequestNumber: model.nextPortfolioRequestNumber + 1,
    },
    [LoadWallet({ requestId, wallets })],
  ]
}

const walletIds = (
  wallets: ReadonlyArray<WalletProfile>,
): ReadonlyArray<string> => Array_.map(wallets, wallet => wallet.walletId)

const isSameWalletIds = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean => Array_.join(left, '\u0000') === Array_.join(right, '\u0000')

const refreshWalletBalanceCommands = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.portfolio._tag === 'LoadedPortfolio' &&
  Array_.isReadonlyArrayNonEmpty(model.wallets)
    ? [
        RefreshWalletBalances({
          walletIds: walletIds(model.wallets),
          wallets: model.wallets,
        }),
      ]
    : []

const portfolioCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.portfolio._tag === 'LoadingPortfolio' &&
  model.walletProfileLoading._tag === 'LoadedWalletProfiles'
    ? [
        LoadWallet({
          requestId: model.portfolio.requestId,
          wallets: model.wallets,
        }),
      ]
    : []

const testFundingCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.testFunding._tag === 'RequestingTestFunding'
    ? [RequestTestFunding({ request: model.testFunding.request })]
    : []

const transactionCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> => {
  if (model.transaction._tag === 'ValidatingTransfer') {
    return [ValidateTransfer({ request: model.transaction.request })]
  } else if (
    model.transaction._tag === 'PreviewingTransaction' &&
    model.portfolio._tag === 'LoadedPortfolio'
  ) {
    return [
      PreviewTransfer({
        portfolio: model.portfolio.snapshot,
        transfer: model.transaction.transfer,
        recipientFamiliarity: model.transaction.recipientFamiliarity,
        recipientHistory: model.transaction.recipientHistory,
      }),
    ]
  } else if (model.transaction._tag === 'SubmittingTransaction') {
    return [SignAndSubmitTransaction({ preview: model.transaction.preview })]
  } else {
    return []
  }
}

const walletCreationCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> => {
  if (model.walletCreation._tag === 'CreatingWallet') {
    return [CreateWallet({ request: model.walletCreation.request })]
  } else {
    return []
  }
}

const walletProfileCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.walletProfileLoading._tag === 'LoadingWalletProfiles'
    ? [LoadWalletProfiles()]
    : []

const signatureCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.signature._tag === 'SigningChallengeState'
    ? [SignChallenge({ challenge: model.signature.challenge })]
    : []

const historyCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.transactionHistory._tag === 'LoadingTransactionHistory'
    ? [LoadTransactionHistory({ query: model.transactionHistory.query })]
    : []

const commandsAfterPortfolioHydration = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> => [
  ...testFundingCommandsForRestore(model),
  ...transactionCommandsForRestore(model),
  ...signatureCommandsForRestore(model),
  ...historyCommandsForRestore(model),
]

const modelForClipboardRestore = (model: Model): Model =>
  model.clipboardCopy._tag === 'CopyingToClipboard'
    ? {
        ...model,
        clipboardCopy: FailedClipboardCopy.make({
          request: model.clipboardCopy.request,
          code: 'Unavailable',
        }),
      }
    : model

const modelForPortfolioRestore = (model: Model): Model => {
  if (model.walletProfileLoading._tag !== 'LoadedWalletProfiles') {
    return model
  }
  if (model.portfolio._tag === 'LoadingPortfolio') {
    return {
      ...model,
      transactionObservation: WaitingForAccounts.make({}),
    }
  }
  return {
    ...model,
    portfolio: LoadingPortfolio.make({
      requestId: `portfolio-${model.nextPortfolioRequestNumber.toString()}`,
    }),
    nextPortfolioRequestNumber: model.nextPortfolioRequestNumber + 1,
    transactionObservation: WaitingForAccounts.make({}),
  }
}

const testFundingAfterPortfolioFailure = (
  testFunding: TestFundingState,
  failure: WalletFailure,
): TestFundingState => {
  if (testFunding._tag === 'RequestingTestFunding') {
    return FailedTestFunding.make({ request: testFunding.request, failure })
  } else {
    return testFunding
  }
}

const transactionAfterPortfolioFailure = (
  transaction: TransactionState,
  failure: WalletFailure,
): TransactionState => {
  if (transaction._tag === 'ValidatingTransfer') {
    return FailedTransferValidation.make({
      request: transaction.request,
      failure,
    })
  } else if (transaction._tag === 'PreviewingTransaction') {
    return FailedTransactionPreview.make({
      transfer: transaction.transfer,
      failure,
    })
  } else if (transaction._tag === 'SubmittingTransaction') {
    return FailedTransactionSubmission.make({
      preview: transaction.preview,
      failure,
    })
  } else {
    return transaction
  }
}

const signatureAfterPortfolioFailure = (
  signature: SignatureState,
  failure: WalletFailure,
): SignatureState => {
  if (signature._tag === 'SigningChallengeState') {
    return FailedChallengeSignature.make({
      challenge: signature.challenge,
      failure,
    })
  } else {
    return signature
  }
}

const historyAfterPortfolioFailure = (
  transactionHistory: TransactionHistoryState,
  failure: WalletFailure,
): TransactionHistoryState => {
  if (transactionHistory._tag === 'LoadingTransactionHistory') {
    return FailedTransactionHistory.make({
      query: transactionHistory.query,
      failure,
    })
  } else {
    return transactionHistory
  }
}

/** Restarts finite work represented by a restored Wallet Model. */
export const restore = (model: Model): UpdateReturn => {
  const restoredModel = modelForPortfolioRestore(
    modelForClipboardRestore(model),
  )
  return [
    restoredModel,
    [
      ...walletProfileCommandsForRestore(restoredModel),
      ...walletCreationCommandsForRestore(restoredModel),
      ...portfolioCommandsForRestore(restoredModel),
    ],
  ]
}

const replaceAddressBookEntry = (
  model: Model,
  entry: AddressBookEntry,
): Model => ({
  ...model,
  addressBookEntries: [
    ...Array_.filter(
      model.addressBookEntries,
      current => current.entryId !== entry.entryId,
    ),
    entry,
  ],
})

const transferRequestForIntent = (
  portfolio: PortfolioSnapshot,
  intent: WalletIntent,
  transferId: string,
): Option.Option<TransferRequest> => {
  const maybeSelection = resolveSendNetworkSelection(portfolio, intent.source)
  if (Option.isNone(maybeSelection)) {
    return Option.none()
  }
  const maybeAccount = Array_.findFirst(
    portfolio.accounts,
    account => account.accountId === intent.source.accountId,
  )
  const maybeAsset = Array_.findFirst(
    portfolio.assets,
    asset => asset.assetId === intent.source.assetId,
  )
  if (
    Option.isNone(maybeAccount) ||
    Option.isNone(maybeAsset) ||
    maybeAccount.value.networkId !== maybeAsset.value.networkId
  ) {
    return Option.none()
  } else {
    return Option.some(
      TransferRequest.make({
        transferId,
        accountId: intent.source.accountId,
        assetId: intent.source.assetId,
        destinationAddress: intent.destinationAddress,
        atomicUnits: intent.atomicUnits,
        maybeMessage: Option.none(),
      }),
    )
  }
}

const transferRequestForRecipient = (
  model: Model,
): Option.Option<TransferRequest> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
  }
  if (Option.isNone(model.maybeSendNetworkSelection)) {
    return Option.none()
  }
  if (model.transferAmount._tag !== 'ValidTransferAmount') {
    return Option.none()
  }
  const destinationAddress = transferRecipientInput(model.transferRecipient)
  if (destinationAddress === '') {
    return Option.none()
  }
  const portfolio = model.portfolio.snapshot
  const selection = model.maybeSendNetworkSelection.value
  const maybeAccount = Array_.findFirst(
    portfolio.accounts,
    account => account.accountId === selection.accountId,
  )
  if (Option.isNone(maybeAccount)) {
    return Option.none()
  }
  return Option.some(
    TransferRequest.make({
      transferId: `transfer-${model.nextTransferRequestNumber.toString()}`,
      accountId: selection.accountId,
      assetId: selection.assetId,
      destinationAddress,
      atomicUnits: model.transferAmount.atomicUnits,
      maybeMessage: Option.none(),
    }),
  )
}

const validateTransfer = (
  model: Model,
  request: TransferRequest,
): UpdateReturn => [
  {
    ...model,
    transferRecipient: transferRecipientFromInput(request.destinationAddress),
    transaction: ValidatingTransfer.make({ request }),
  },
  [ValidateTransfer({ request })],
]

const previewTransfer = (
  model: Model,
  transfer: ValidatedTransfer,
): UpdateReturn => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return [model, []]
  }
  const recipientFamiliarity = familiarityForRecipient(
    model.addressBookEntries,
    transfer.recipient,
  )
  const recipientHistory = recipientHistoryForTransfer(
    model.transactions,
    transfer,
  )
  return [
    {
      ...model,
      transferRecipient: ValidTransferRecipient.make({
        recipient: transfer.recipient,
      }),
      transaction: PreviewingTransaction.make({
        transfer,
        recipientFamiliarity,
        recipientHistory,
      }),
    },
    [
      PreviewTransfer({
        portfolio: model.portfolio.snapshot,
        transfer,
        recipientFamiliarity,
        recipientHistory,
      }),
    ],
  ]
}

const isSameHistoryQuery = (
  left: TransactionHistoryQuery,
  right: TransactionHistoryQuery,
): boolean =>
  Option.getOrUndefined(left.maybeCursor) ===
    Option.getOrUndefined(right.maybeCursor) &&
  left.limit === right.limit &&
  left.accountId === right.accountId &&
  left.networkId === right.networkId

const historyStateAndCommands = (
  portfolio: PortfolioSnapshot,
  maybeSelection: Option.Option<SendNetworkSelection>,
  maybeCursor: Option.Option<string>,
): readonly [
  TransactionHistoryState,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => {
  if (Option.isNone(maybeSelection)) {
    return [NotLoadedTransactionHistory.make({}), []]
  }
  const selection = maybeSelection.value
  const query = historyQuery(
    selection.accountId,
    selection.networkId,
    maybeCursor,
  )
  const maybeNetwork = networkForId(portfolio.networks, selection.networkId)
  if (
    Option.isNone(maybeNetwork) ||
    !Array_.contains(maybeNetwork.value.capabilities, 'TransactionHistory')
  ) {
    return [
      FailedTransactionHistory.make({
        query,
        failure: NetworkFailure.make({
          operation: 'LoadTransactionHistory',
          code: 'UnsupportedCapability',
        }),
      }),
      [],
    ]
  }
  return [
    LoadingTransactionHistory.make({ query }),
    [LoadTransactionHistory({ query })],
  ]
}

const selectedAsset = (model: Model): Option.Option<AssetDescriptor> => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection)
  ) {
    return Option.none()
  }
  return assetForId(
    model.portfolio.snapshot.assets,
    model.maybeSendNetworkSelection.value.assetId,
  )
}

const testFundingRequestForModel = (
  model: Model,
): Option.Option<TestFundingRequest> => {
  if (
    model.portfolio._tag !== 'LoadedPortfolio' ||
    Option.isNone(model.maybeSendNetworkSelection) ||
    model.transferAmount._tag !== 'ValidTransferAmount'
  ) {
    return Option.none()
  }
  const selection = model.maybeSendNetworkSelection.value
  const maybeNetwork = networkForId(
    model.portfolio.snapshot.networks,
    selection.networkId,
  )
  if (
    Option.isNone(maybeNetwork) ||
    maybeNetwork.value.environment === 'Mainnet' ||
    !Array_.contains(maybeNetwork.value.capabilities, 'TestFunding')
  ) {
    return Option.none()
  }
  return Option.some(
    TestFundingRequest.make({
      requestId: `test-funding-${model.nextTestFundingRequestNumber.toString()}`,
      accountId: selection.accountId,
      chainId: selection.chainId,
      networkId: selection.networkId,
      environment: maybeNetwork.value.environment,
      assetId: selection.assetId,
      atomicUnits: model.transferAmount.atomicUnits,
    }),
  )
}

const pendingTransactionRecord = (
  preview: TransactionPreview,
  submission: TransactionSubmission,
): TransactionRecord => {
  const request = preview.transfer.request
  const recipient = preview.transfer.recipient
  return TransactionRecord.make({
    recordId: `${request.accountId}:${submission.transactionId}:outgoing`,
    transactionId: submission.transactionId,
    accountId: request.accountId,
    networkId: recipient.networkId,
    direction: 'Outgoing',
    status: 'Pending',
    amount: AssetAmount.make({
      assetId: request.assetId,
      atomicUnits: request.atomicUnits,
      observedAt: submission.submittedAt,
    }),
    counterpartyAddress: recipient.address,
    normalizedCounterpartyAddress: recipient.normalizedAddress,
    observedAt: submission.submittedAt,
  })
}

const isTransactionInSelectedScope = (
  model: Model,
  transaction: TransactionRecord,
): boolean =>
  Option.isSome(model.maybeSendNetworkSelection) &&
  model.maybeSendNetworkSelection.value.accountId === transaction.accountId &&
  model.maybeSendNetworkSelection.value.networkId === transaction.networkId

const hasExactTransactionRecord = (
  transactions: ReadonlyArray<TransactionRecord>,
  transaction: TransactionRecord,
): boolean =>
  Array_.some(
    transactions,
    candidate =>
      candidate.recordId === transaction.recordId &&
      candidate.status === transaction.status &&
      candidate.observedAt === transaction.observedAt &&
      candidate.amount.atomicUnits === transaction.amount.atomicUnits,
  )

/** Applies one Wallet Message and returns its finite Commands. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      RequestedWalletProfilesReload: () => [
        {
          ...model,
          walletProfileLoading: LoadingWalletProfiles.make({}),
          portfolio: WaitingForWalletProfiles.make({}),
          transactionObservation: WaitingForAccounts.make({}),
          transactionHistory: NotLoadedTransactionHistory.make({}),
        },
        [LoadWalletProfiles()],
      ],
      SucceededLoadWalletProfiles: ({ wallets }) => {
        if (model.walletProfileLoading._tag !== 'LoadingWalletProfiles') {
          return [model, []]
        }
        return beginPortfolioLoad(
          {
            ...model,
            wallets,
            walletProfileLoading: LoadedWalletProfiles.make({}),
          },
          wallets,
        )
      },
      FailedLoadWalletProfiles: ({ code }) => {
        if (model.walletProfileLoading._tag !== 'LoadingWalletProfiles') {
          return [model, []]
        }
        return [
          {
            ...model,
            walletProfileLoading: FailedWalletProfileLoading.make({ code }),
            portfolio: WaitingForWalletProfiles.make({}),
          },
          [],
        ]
      },
      SelectedWalletNetworkMode: ({ networkMode }) => {
        const maybeSendNetworkSelection =
          model.portfolio._tag === 'LoadedPortfolio'
            ? selectSendNetworkForMode(
                model.portfolio.snapshot,
                model.wallets,
                model.maybeSendNetworkSelection,
                networkMode,
              )
            : Option.none()
        const [transactionHistory, historyCommands] =
          model.portfolio._tag === 'LoadedPortfolio'
            ? historyStateAndCommands(
                model.portfolio.snapshot,
                maybeSendNetworkSelection,
                Option.none(),
              )
            : [NotLoadedTransactionHistory.make({}), []]
        return [
          {
            ...model,
            walletNetworkMode: networkMode,
            maybeSendNetworkSelection,
            clipboardCopy: IdleClipboardCopy.make({}),
            transactionObservation: transactionObservationForSelection(
              maybeSendNetworkSelection,
            ),
            walletIntent: NoWalletIntent.make({}),
            transferRecipient: EmptyTransferRecipient.make({}),
            transferAmount: EmptyTransferAmount.make({}),
            testFunding: ReadyToRequestTestFunding.make({}),
            transaction: IdleTransaction.make({}),
            signature: IdleSignature.make({}),
            transactionHistory,
            transactions: [],
          },
          historyCommands,
        ]
      },
      SelectedSendNetwork: ({ selection }) => {
        if (model.portfolio._tag !== 'LoadedPortfolio') {
          return [model, []]
        }
        const maybeSelection = resolveSendNetworkSelection(
          model.portfolio.snapshot,
          selection,
        )
        if (Option.isNone(maybeSelection)) {
          return [model, []]
        }
        const [transactionHistory, historyCommands] = historyStateAndCommands(
          model.portfolio.snapshot,
          maybeSelection,
          Option.none(),
        )
        return [
          {
            ...model,
            walletNetworkMode: selection.networkMode,
            maybeSendNetworkSelection: maybeSelection,
            clipboardCopy: IdleClipboardCopy.make({}),
            transactionObservation:
              transactionObservationForSelection(maybeSelection),
            walletIntent: NoWalletIntent.make({}),
            transferRecipient: EmptyTransferRecipient.make({}),
            transferAmount: EmptyTransferAmount.make({}),
            testFunding: ReadyToRequestTestFunding.make({}),
            transaction: IdleTransaction.make({}),
            signature: IdleSignature.make({}),
            transactionHistory,
            transactions: [],
          },
          historyCommands,
        ]
      },
      RequestedWalletCreation: () => {
        if (
          model.walletProfileLoading._tag !== 'LoadedWalletProfiles' ||
          model.portfolio._tag !== 'LoadedPortfolio' ||
          model.walletCreation._tag === 'CreatingWallet'
        ) {
          return [model, []]
        }
        const request = nextWalletCreationRequest(
          model.wallets,
          model.portfolio.snapshot.networks,
        )
        return [
          {
            ...model,
            walletCreation: CreatingWallet.make({ request }),
          },
          [CreateWallet({ request })],
        ]
      },
      SucceededCreateWallet: ({ request, wallet }) => {
        if (
          model.walletCreation._tag !== 'CreatingWallet' ||
          model.walletCreation.request.requestId !== request.requestId
        ) {
          return [model, []]
        }
        const wallets = upsertWalletProfile(model.wallets, wallet)
        return beginPortfolioLoad(
          {
            ...model,
            wallets,
            walletCreation: ReadyToCreateWallet.make({}),
            transactionObservation: WaitingForAccounts.make({}),
            transactionHistory: NotLoadedTransactionHistory.make({}),
          },
          wallets,
        )
      },
      FailedCreateWallet: ({ request, code }) => {
        if (
          model.walletCreation._tag !== 'CreatingWallet' ||
          model.walletCreation.request.requestId !== request.requestId
        ) {
          return [model, []]
        }
        return [
          {
            ...model,
            walletCreation: FailedWalletCreation.make({ request, code }),
          },
          [],
        ]
      },
      RequestedClipboardCopy: ({ request }) => [
        {
          ...model,
          clipboardCopy: CopyingToClipboard.make({ request }),
        },
        [CopyToClipboard({ request })],
      ],
      SucceededCopyToClipboard: ({ request }) =>
        model.clipboardCopy._tag === 'CopyingToClipboard' &&
        isSameClipboardCopyRequest(model.clipboardCopy.request, request)
          ? [
              {
                ...model,
                clipboardCopy: CopiedToClipboard.make({ request }),
              },
              [],
            ]
          : [model, []],
      FailedCopyToClipboard: ({ request, code }) =>
        model.clipboardCopy._tag === 'CopyingToClipboard' &&
        isSameClipboardCopyRequest(model.clipboardCopy.request, request)
          ? [
              {
                ...model,
                clipboardCopy: FailedClipboardCopy.make({ request, code }),
              },
              [],
            ]
          : [model, []],
      RequestedWalletRefresh: () => {
        if (
          model.walletProfileLoading._tag !== 'LoadedWalletProfiles' ||
          model.portfolio._tag === 'LoadingPortfolio'
        ) {
          return [model, []]
        }
        return beginPortfolioLoad(
          {
            ...model,
            transactionObservation: WaitingForAccounts.make({}),
            transactionHistory: NotLoadedTransactionHistory.make({}),
          },
          model.wallets,
        )
      },
      SucceededLoadWallet: ({ requestId, portfolio }) => {
        if (
          model.portfolio._tag !== 'LoadingPortfolio' ||
          model.portfolio.requestId !== requestId
        ) {
          return [model, []]
        }
        const maybeDefaultSelection = selectSendNetworkForMode(
          portfolio,
          model.wallets,
          model.maybeSendNetworkSelection,
          model.walletNetworkMode,
        )
        if (model.walletIntent._tag !== 'PendingWalletIntent') {
          const hydratedModel = {
            ...model,
            portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
            maybeSendNetworkSelection: maybeDefaultSelection,
            transactionObservation: transactionObservationForSelection(
              maybeDefaultSelection,
            ),
          }
          const resumedCommands = commandsAfterPortfolioHydration(hydratedModel)
          if (Array_.isReadonlyArrayNonEmpty(resumedCommands)) {
            return [hydratedModel, resumedCommands]
          }
          const [transactionHistory, historyCommands] = historyStateAndCommands(
            portfolio,
            maybeDefaultSelection,
            Option.none(),
          )
          return [
            {
              ...hydratedModel,
              transactionHistory,
              transactions: [],
            },
            historyCommands,
          ]
        }
        const intent = model.walletIntent.intent
        const maybeIntentSelection = resolveSendNetworkSelection(
          portfolio,
          intent.source,
        )
        const maybeAsset = assetForId(portfolio.assets, intent.source.assetId)
        const transferAmount = Option.match(maybeAsset, {
          onNone: () => EmptyTransferAmount.make({}),
          onSome: asset =>
            transferAmountFromInput(
              displayAmountFromAtomicUnits(
                intent.atomicUnits,
                asset.decimalPlaces,
              ),
              maybeAsset,
            ),
        })
        const maybeRequest = transferRequestForIntent(
          portfolio,
          intent,
          `transfer-${model.nextTransferRequestNumber.toString()}`,
        )
        if (
          Option.isNone(maybeIntentSelection) ||
          Option.isNone(maybeRequest) ||
          transferAmount._tag !== 'ValidTransferAmount'
        ) {
          const [transactionHistory, historyCommands] = historyStateAndCommands(
            portfolio,
            maybeDefaultSelection,
            Option.none(),
          )
          return [
            {
              ...model,
              portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
              maybeSendNetworkSelection: maybeDefaultSelection,
              transactionObservation: transactionObservationForSelection(
                maybeDefaultSelection,
              ),
              transactionHistory,
              transactions: [],
              walletIntent: RejectedWalletIntent.make({
                intent,
                reason:
                  'The loaded portfolio does not contain the requested network, account, and asset.',
              }),
              transferRecipient: transferRecipientFromInput(
                intent.destinationAddress,
              ),
              transferAmount,
            },
            historyCommands,
          ]
        }
        const request = maybeRequest.value
        const [transactionHistory, historyCommands] = historyStateAndCommands(
          portfolio,
          maybeIntentSelection,
          Option.none(),
        )
        return [
          {
            ...model,
            portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
            walletNetworkMode: intent.source.networkMode,
            maybeSendNetworkSelection: maybeIntentSelection,
            transactionObservation:
              transactionObservationForSelection(maybeIntentSelection),
            transactionHistory,
            transactions: [],
            walletIntent: AppliedWalletIntent.make({ intent }),
            transferRecipient: EditingTransferRecipient.make({
              value: request.destinationAddress,
            }),
            transferAmount,
            nextTransferRequestNumber: model.nextTransferRequestNumber + 1,
            transaction: ValidatingTransfer.make({ request }),
          },
          [...historyCommands, ValidateTransfer({ request })],
        ]
      },
      FailedLoadWallet: ({ requestId, failure }) => {
        if (
          model.portfolio._tag !== 'LoadingPortfolio' ||
          model.portfolio.requestId !== requestId
        ) {
          return [model, []]
        }
        return [
          {
            ...model,
            portfolio: FailedPortfolio.make({ failure }),
            transactionObservation: WaitingForAccounts.make({}),
            testFunding: testFundingAfterPortfolioFailure(
              model.testFunding,
              failure,
            ),
            transaction: transactionAfterPortfolioFailure(
              model.transaction,
              failure,
            ),
            signature: signatureAfterPortfolioFailure(model.signature, failure),
            transactionHistory: historyAfterPortfolioFailure(
              model.transactionHistory,
              failure,
            ),
          },
          [],
        ]
      },
      SucceededRefreshWalletBalances: ({
        walletIds: refreshedWalletIds,
        balanceSnapshot,
      }) => {
        if (
          model.portfolio._tag !== 'LoadedPortfolio' ||
          !isSameWalletIds(walletIds(model.wallets), refreshedWalletIds) ||
          balanceSnapshot.observedAt <
            model.portfolio.snapshot.balanceSnapshot.observedAt
        ) {
          return [model, []]
        }
        return [
          {
            ...model,
            portfolio: LoadedPortfolio.make({
              snapshot: PortfolioSnapshot.make({
                ...model.portfolio.snapshot,
                balanceSnapshot,
              }),
            }),
          },
          [],
        ]
      },
      FailedRefreshWalletBalances: () => [model, []],
      ChangedTransferRecipient: ({ value }) => [
        {
          ...model,
          walletIntent: NoWalletIntent.make({}),
          transferRecipient: transferRecipientFromInput(value),
          transaction: IdleTransaction.make({}),
        },
        [],
      ],
      ChangedTransferAmount: ({ value }) => [
        {
          ...model,
          walletIntent: NoWalletIntent.make({}),
          transferAmount: transferAmountFromInput(value, selectedAsset(model)),
          testFunding: ReadyToRequestTestFunding.make({}),
          transaction: IdleTransaction.make({}),
        },
        [],
      ],
      RequestedTransferPreview: () => {
        const maybeRequest = transferRequestForRecipient(model)
        if (Option.isNone(maybeRequest)) {
          return [model, []]
        }
        return validateTransfer(
          {
            ...model,
            nextTransferRequestNumber: model.nextTransferRequestNumber + 1,
          },
          maybeRequest.value,
        )
      },
      RequestedTestFunding: () => {
        if (model.transferAmount._tag !== 'ValidTransferAmount') {
          return [model, []]
        }
        const maybeRequest = testFundingRequestForModel(model)
        if (Option.isNone(maybeRequest)) {
          return [
            {
              ...model,
              testFunding: UnavailableTestFunding.make({
                failure: NetworkFailure.make({
                  operation: 'RequestTestFunding',
                  code: 'UnsupportedCapability',
                }),
              }),
            },
            [],
          ]
        }
        const request = maybeRequest.value
        return [
          {
            ...model,
            testFunding: RequestingTestFunding.make({ request }),
            nextTestFundingRequestNumber:
              model.nextTestFundingRequestNumber + 1,
          },
          [RequestTestFunding({ request })],
        ]
      },
      SucceededRequestTestFunding: ({ request, receipt }) =>
        model.testFunding._tag === 'RequestingTestFunding' &&
        model.testFunding.request.requestId === request.requestId &&
        receipt.requestId === request.requestId
          ? [
              {
                ...model,
                testFunding: ReceivedTestFunding.make({ request, receipt }),
              },
              refreshWalletBalanceCommands(model),
            ]
          : [model, []],
      FailedRequestTestFunding: ({ request, failure }) =>
        model.testFunding._tag === 'RequestingTestFunding' &&
        model.testFunding.request.requestId === request.requestId
          ? [
              {
                ...model,
                testFunding: FailedTestFunding.make({ request, failure }),
              },
              [],
            ]
          : [model, []],
      ImportedAddressBookEntries: ({ entries }) => [
        { ...model, addressBookEntries: entries },
        [],
      ],
      AddedAddressBookEntry: ({ entry }) => [
        replaceAddressBookEntry(model, entry),
        [],
      ],
      RemovedAddressBookEntry: ({ entryId }) => [
        {
          ...model,
          addressBookEntries: Array_.filter(
            model.addressBookEntries,
            entry => entry.entryId !== entryId,
          ),
        },
        [],
      ],
      ComposedTransfer: ({ request }) => validateTransfer(model, request),
      SucceededValidateTransfer: ({ validation }) => {
        const request = validation.request
        if (
          model.transaction._tag !== 'ValidatingTransfer' ||
          model.transaction.request.transferId !== request.transferId
        ) {
          return [model, []]
        }
        if (validation._tag === 'RejectedTransfer') {
          return [
            {
              ...model,
              transferRecipient: InvalidTransferRecipient.make({
                value: request.destinationAddress,
                guidance: validation.guidance,
              }),
              transaction: InvalidTransfer.make({
                request,
                guidance: validation.guidance,
              }),
            },
            [],
          ]
        } else {
          return previewTransfer(model, validation)
        }
      },
      FailedValidateTransfer: ({ request, failure }) =>
        model.transaction._tag === 'ValidatingTransfer' &&
        model.transaction.request.transferId === request.transferId
          ? [
              {
                ...model,
                transaction: FailedTransferValidation.make({
                  request,
                  failure,
                }),
              },
              [],
            ]
          : [model, []],
      SucceededPreviewTransaction: ({ preview }) =>
        model.transaction._tag === 'PreviewingTransaction' &&
        model.transaction.transfer.request.transferId ===
          preview.transfer.request.transferId
          ? [
              {
                ...model,
                transaction: PreviewedTransaction.make({ preview }),
              },
              [],
            ]
          : [model, []],
      FailedPreviewTransaction: ({ transfer, failure }) =>
        model.transaction._tag === 'PreviewingTransaction' &&
        model.transaction.transfer.request.transferId ===
          transfer.request.transferId
          ? [
              {
                ...model,
                transaction: FailedTransactionPreview.make({
                  transfer,
                  failure,
                }),
              },
              [],
            ]
          : [model, []],
      RequestedSignedTransactionSubmission: ({ previewId }) => {
        if (
          model.transaction._tag === 'PreviewedTransaction' &&
          model.transaction.preview.previewId === previewId
        ) {
          const preview: TransactionPreview = model.transaction.preview
          return [
            {
              ...model,
              transaction: SubmittingTransaction.make({ preview }),
            },
            [SignAndSubmitTransaction({ preview })],
          ]
        } else {
          return [model, []]
        }
      },
      SucceededSubmitSignedTransaction: ({ submission }) => {
        if (
          model.transaction._tag === 'SubmittingTransaction' &&
          model.transaction.preview.previewId === submission.previewId
        ) {
          const transaction = pendingTransactionRecord(
            model.transaction.preview,
            submission,
          )
          return [
            {
              ...model,
              transaction: SubmittedTransaction.make({
                preview: model.transaction.preview,
                submission,
              }),
              transactions: mergeTransactionRecords(model.transactions, [
                transaction,
              ]),
            },
            refreshWalletBalanceCommands(model),
          ]
        } else {
          return [model, []]
        }
      },
      FailedSubmitSignedTransaction: ({ preview, failure }) =>
        model.transaction._tag === 'SubmittingTransaction' &&
        model.transaction.preview.previewId === preview.previewId
          ? [
              {
                ...model,
                transaction: FailedTransactionSubmission.make({
                  preview,
                  failure,
                }),
              },
              [],
            ]
          : [model, []],
      RequestedChallengeSignature: ({ challenge }) => [
        {
          ...model,
          signature: SigningChallengeState.make({ challenge }),
        },
        [SignChallenge({ challenge })],
      ],
      SucceededSignChallenge: ({ challenge, proof }) => {
        if (
          model.signature._tag === 'SigningChallengeState' &&
          model.signature.challenge.challengeId === challenge.challengeId &&
          proof.challengeId === challenge.challengeId &&
          proof.accountId === challenge.accountId
        ) {
          return [
            {
              ...model,
              signature: SignedChallenge.make({ challenge, proof }),
            },
            [],
          ]
        } else {
          return [model, []]
        }
      },
      FailedSignChallenge: ({ challenge, failure }) =>
        model.signature._tag === 'SigningChallengeState' &&
        model.signature.challenge.challengeId === challenge.challengeId
          ? [
              {
                ...model,
                signature: FailedChallengeSignature.make({
                  challenge,
                  failure,
                }),
              },
              [],
            ]
          : [model, []],
      RequestedTransactionHistoryReload: () => {
        if (model.portfolio._tag !== 'LoadedPortfolio') {
          return [model, []]
        }
        const [transactionHistory, commands] = historyStateAndCommands(
          model.portfolio.snapshot,
          model.maybeSendNetworkSelection,
          Option.none(),
        )
        return [{ ...model, transactionHistory }, commands]
      },
      RequestedNextTransactionHistoryPage: () => {
        if (
          model.portfolio._tag !== 'LoadedPortfolio' ||
          model.transactionHistory._tag !== 'LoadedTransactionHistory' ||
          Option.isNone(model.transactionHistory.maybeNextCursor)
        ) {
          return [model, []]
        }
        const [transactionHistory, commands] = historyStateAndCommands(
          model.portfolio.snapshot,
          model.maybeSendNetworkSelection,
          model.transactionHistory.maybeNextCursor,
        )
        return [{ ...model, transactionHistory }, commands]
      },
      SucceededLoadTransactionHistory: ({ query, page }) =>
        model.transactionHistory._tag === 'LoadingTransactionHistory' &&
        isSameHistoryQuery(model.transactionHistory.query, query)
          ? [
              {
                ...model,
                transactionHistory: LoadedTransactionHistory.make({
                  maybeNextCursor: page.maybeNextCursor,
                }),
                transactions: mergeTransactionRecords(
                  model.transactions,
                  page.records,
                ),
              },
              [],
            ]
          : [model, []],
      FailedLoadTransactionHistory: ({ query, failure }) =>
        model.transactionHistory._tag === 'LoadingTransactionHistory' &&
        isSameHistoryQuery(model.transactionHistory.query, query)
          ? [
              {
                ...model,
                transactionHistory: FailedTransactionHistory.make({
                  query,
                  failure,
                }),
              },
              [],
            ]
          : [model, []],
      ObservedTransaction: ({ transaction }) => {
        if (!isTransactionInSelectedScope(model, transaction)) {
          return [model, []]
        }
        const isNewObservation = !hasExactTransactionRecord(
          model.transactions,
          transaction,
        )
        return [
          {
            ...model,
            transactions: mergeTransactionRecords(model.transactions, [
              transaction,
            ]),
          },
          isNewObservation && transaction.status !== 'Pending'
            ? refreshWalletBalanceCommands(model)
            : [],
        ]
      },
      FailedObserveTransactions: ({ accountIds, failure }) =>
        model.transactionObservation._tag === 'ObservingTransactions' &&
        Array_.join(model.transactionObservation.accountIds, '\u0000') ===
          Array_.join(accountIds, '\u0000')
          ? [
              {
                ...model,
                transactionObservation: FailedTransactionObservation.make({
                  failure,
                }),
              },
              [],
            ]
          : [model, []],
      ResumedTransactionObservation: () => {
        const accountIds = accountIdsFromModel(model)
        return Array_.match(accountIds, {
          onEmpty: () => [model, []],
          onNonEmpty: observedAccountIds => [
            {
              ...model,
              transactionObservation: ObservingTransactions.make({
                accountIds: observedAccountIds,
              }),
            },
            [],
          ],
        })
      },
    }),
  )
