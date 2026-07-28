import { Array as Array_, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import {
  AppliedWalletIntent,
  NoWalletIntent,
  RejectedWalletIntent,
  type WalletIntent,
} from './intent.js'
import {
  FailedCreateWallet,
  FailedLoadTransactionHistory,
  FailedLoadWallet,
  FailedPreviewTransaction,
  FailedSignChallenge,
  FailedSubmitSignedTransaction,
  FailedValidateTransfer,
  type Message,
  SucceededCreateWallet,
  SucceededLoadTransactionHistory,
  SucceededLoadWallet,
  SucceededPreviewTransaction,
  SucceededSignChallenge,
  SucceededSubmitSignedTransaction,
  SucceededValidateTransfer,
} from './message.js'
import {
  type AddressBookEntry,
  AddressFamiliarity,
  CryptoFailure,
  EditingTransferRecipient,
  FailedChallengeSignature,
  FailedPortfolio,
  FailedTransactionHistory,
  FailedTransactionObservation,
  FailedTransactionPreview,
  FailedTransactionSubmission,
  FailedTransferValidation,
  IdleTransaction,
  InvalidTransfer,
  InvalidTransferRecipient,
  LoadedPortfolio,
  LoadedTransactionHistory,
  LoadingPortfolio,
  LoadingTransactionHistory,
  type Model,
  NetworkFailure,
  ObservingTransactions,
  PortfolioSnapshot,
  PreviewedTransaction,
  PreviewingTransaction,
  RecipientHistory,
  type SignatureProof,
  SignedChallenge,
  SigningChallenge,
  SigningChallengeState,
  SigningFailure,
  SubmittedTransaction,
  SubmittingTransaction,
  TransactionHistoryQuery,
  TransactionPreview,
  TransferRequest,
  ValidTransferRecipient,
  ValidatedTransfer,
  ValidatingTransfer,
  WaitingForAccounts,
  type WalletFailure,
  type WalletOperation,
  familiarityForRecipient,
  isPortfolioSnapshotConsistent,
  mergeTransactionRecords,
  recipientHistoryForTransfer,
  transactionPreviewFromQuote,
  transferRecipientFromInput,
  transferRecipientInput,
} from './model.js'
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
  ReadyToCreateWallet,
  WalletCreationRequest,
  nextWalletCreationRequest,
  upsertWalletProfile,
} from './walletProfile.js'
import { WalletVault } from './walletVault.js'

const transactionHistoryPageSize = 50

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

/** Atomic amount used by the public normalized transfer demonstration. */
export const walletDemoTransferAtomicUnits = '10000000000000'

/** Loads normalized public wallet data through the injected WalletClient. */
export const LoadWallet = Command.define(
  'LoadWallet',
  SucceededLoadWallet,
  FailedLoadWallet,
)(
  WalletClient.pipe(
    Effect.flatMap(client => client.loadPortfolio),
    Effect.flatMap(portfolio =>
      isPortfolioSnapshotConsistent(portfolio)
        ? Effect.succeed(portfolio)
        : Effect.fail(new WalletClientError({ code: 'InvalidResponse' })),
    ),
    Effect.map(portfolio => SucceededLoadWallet.make({ portfolio })),
    Effect.catch(error =>
      Effect.succeed(
        FailedLoadWallet.make({
          failure: toNetworkFailure('LoadPortfolio', error),
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
  WalletClient.pipe(
    Effect.flatMap(client => client.loadTransactionHistory(query)),
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
  accountIds: ReadonlyArray<string>,
  maybeCursor: Option.Option<string>,
): TransactionHistoryQuery => ({
  accountIds,
  maybeCursor,
  limit: transactionHistoryPageSize,
})

const accountIdsFromPortfolio = (
  portfolio: PortfolioSnapshot,
): ReadonlyArray<string> =>
  Array_.map(portfolio.accounts, account => account.accountId)

const accountIdsFromModel = (model: Model): ReadonlyArray<string> =>
  model.portfolio._tag === 'LoadedPortfolio'
    ? accountIdsFromPortfolio(model.portfolio.snapshot)
    : []

const portfolioCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  model.portfolio._tag === 'LoadingPortfolio' ? [LoadWallet()] : []

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

/** Restarts finite work represented by a restored Wallet Model. */
export const restore = (model: Model): UpdateReturn => [
  model,
  [
    ...walletCreationCommandsForRestore(model),
    ...portfolioCommandsForRestore(model),
    ...transactionCommandsForRestore(model),
    ...signatureCommandsForRestore(model),
    ...historyCommandsForRestore(model),
  ],
]

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
): Option.Option<TransferRequest> => {
  const maybeAccount = Array_.findFirst(
    portfolio.accounts,
    account => account.accountId === intent.accountId,
  )
  const maybeAsset = Array_.findFirst(
    portfolio.assets,
    asset => asset.assetId === intent.assetId,
  )
  if (
    Option.isNone(maybeAccount) ||
    Option.isNone(maybeAsset) ||
    maybeAccount.value.networkId !== maybeAsset.value.networkId
  ) {
    return Option.none()
  } else {
    return Option.some({
      transferId: 'wallet-intent-transfer',
      accountId: intent.accountId,
      assetId: intent.assetId,
      destinationAddress: intent.destinationAddress,
      atomicUnits: intent.atomicUnits,
      maybeMessage: Option.none(),
    })
  }
}

const transferRequestForRecipient = (
  model: Model,
): Option.Option<TransferRequest> => {
  if (model.portfolio._tag !== 'LoadedPortfolio') {
    return Option.none()
  }
  const destinationAddress = transferRecipientInput(model.transferRecipient)
  if (destinationAddress === '') {
    return Option.none()
  }
  const portfolio = model.portfolio.snapshot
  const maybeAccount = Array_.head(portfolio.accounts)
  if (Option.isNone(maybeAccount)) {
    return Option.none()
  }
  const maybeBalance = Array_.findFirst(
    portfolio.balanceSnapshot.balances,
    balance => balance.accountId === maybeAccount.value.accountId,
  )
  if (Option.isNone(maybeBalance)) {
    return Option.none()
  }
  return Option.some({
    transferId: 'wallet-demo-transfer',
    accountId: maybeAccount.value.accountId,
    assetId: maybeBalance.value.amount.assetId,
    destinationAddress,
    atomicUnits: walletDemoTransferAtomicUnits,
    maybeMessage: Option.some('Shared Wallet testnet transfer'),
  })
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
  Array_.join(left.accountIds, '|') === Array_.join(right.accountIds, '|')

/** Applies one Wallet Message and returns its finite Commands. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      SelectedWalletNetworkMode: ({ networkMode }) => [
        { ...model, walletNetworkMode: networkMode },
        [],
      ],
      RequestedWalletCreation: () => {
        if (model.walletCreation._tag === 'CreatingWallet') {
          return [model, []]
        }
        const request = nextWalletCreationRequest(model.wallets)
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
        return [
          {
            ...model,
            wallets: upsertWalletProfile(model.wallets, wallet),
            walletCreation: ReadyToCreateWallet.make({}),
          },
          [],
        ]
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
      RequestedWalletRefresh: () => [
        {
          ...model,
          portfolio: LoadingPortfolio.make({}),
          transactionObservation: WaitingForAccounts.make({}),
        },
        [LoadWallet()],
      ],
      SucceededLoadWallet: ({ portfolio }) => {
        const accountIds = accountIdsFromPortfolio(portfolio)
        const query = historyQuery(accountIds, Option.none())
        const nextModel: Model = {
          ...model,
          portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
          transactionObservation: ObservingTransactions.make({ accountIds }),
          transactionHistory: LoadingTransactionHistory.make({ query }),
        }
        const historyCommand = LoadTransactionHistory({ query })
        if (model.walletIntent._tag !== 'PendingWalletIntent') {
          return [nextModel, [historyCommand]]
        }
        const intent = model.walletIntent.intent
        const maybeRequest = transferRequestForIntent(portfolio, intent)
        if (Option.isNone(maybeRequest)) {
          return [
            {
              ...nextModel,
              walletIntent: RejectedWalletIntent.make({
                intent,
                reason:
                  'The loaded portfolio does not contain the requested account and asset.',
              }),
              transferRecipient: transferRecipientFromInput(
                intent.destinationAddress,
              ),
            },
            [historyCommand],
          ]
        }
        const request = maybeRequest.value
        return [
          {
            ...nextModel,
            walletIntent: AppliedWalletIntent.make({ intent }),
            transferRecipient: EditingTransferRecipient.make({
              value: request.destinationAddress,
            }),
            transaction: ValidatingTransfer.make({ request }),
          },
          [historyCommand, ValidateTransfer({ request })],
        ]
      },
      FailedLoadWallet: ({ failure }) => [
        {
          ...model,
          portfolio: FailedPortfolio.make({ failure }),
          transactionObservation: WaitingForAccounts.make({}),
        },
        [],
      ],
      ChangedTransferRecipient: ({ value }) => [
        {
          ...model,
          walletIntent: NoWalletIntent.make({}),
          transferRecipient: transferRecipientFromInput(value),
          transaction: IdleTransaction.make({}),
        },
        [],
      ],
      RequestedTransferPreview: () => {
        const maybeRequest = transferRequestForRecipient(model)
        return Option.isSome(maybeRequest)
          ? validateTransfer(model, maybeRequest.value)
          : [model, []]
      },
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
          return [
            {
              ...model,
              transaction: SubmittedTransaction.make({
                preview: model.transaction.preview,
                submission,
              }),
            },
            [],
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
      RequestedNextTransactionHistoryPage: () => {
        if (
          model.portfolio._tag !== 'LoadedPortfolio' ||
          model.transactionHistory._tag !== 'LoadedTransactionHistory' ||
          Option.isNone(model.transactionHistory.maybeNextCursor)
        ) {
          return [model, []]
        }
        const query = historyQuery(
          accountIdsFromPortfolio(model.portfolio.snapshot),
          model.transactionHistory.maybeNextCursor,
        )
        return [
          {
            ...model,
            transactionHistory: LoadingTransactionHistory.make({ query }),
          },
          [LoadTransactionHistory({ query })],
        ]
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
      ObservedTransaction: ({ transaction }) => [
        {
          ...model,
          transactions: mergeTransactionRecords(model.transactions, [
            transaction,
          ]),
        },
        [],
      ],
      FailedObserveTransactions: ({ failure }) => [
        {
          ...model,
          transactionObservation: FailedTransactionObservation.make({
            failure,
          }),
        },
        [],
      ],
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
