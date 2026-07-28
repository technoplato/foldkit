import { Array as Array_, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import {
  FailedLoadWallet,
  FailedPreviewTransaction,
  FailedSignChallenge,
  FailedSubmitSignedTransaction,
  type Message,
  ObservedTransaction,
  SucceededLoadWallet,
  SucceededPreviewTransaction,
  SucceededSignChallenge,
  SucceededSubmitSignedTransaction,
} from './message.js'
import {
  type AddressBookEntry,
  AddressFamiliarity,
  CryptoFailure,
  FailedChallengeSignature,
  FailedPortfolio,
  FailedTransactionObservation,
  FailedTransactionPreview,
  FailedTransactionSubmission,
  LoadedPortfolio,
  LoadingPortfolio,
  type Model,
  NetworkFailure,
  ObservingTransactions,
  PreviewedTransaction,
  PreviewingTransaction,
  RecipientHistory,
  SignedChallenge,
  SigningChallenge,
  SigningChallengeState,
  SigningFailure,
  SubmittedTransaction,
  SubmittingTransaction,
  TransactionPreview,
  TransferDraft,
  WaitingForAccounts,
  type WalletFailure,
  type WalletOperation,
  familiarityForAddress,
  recipientHistoryForDraft,
  transactionPreviewFromQuote,
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

/** Loads public wallet data through the injected WalletClient. */
export const LoadWallet = Command.define(
  'LoadWallet',
  SucceededLoadWallet,
  FailedLoadWallet,
)(
  WalletClient.pipe(
    Effect.flatMap(client => client.loadPortfolio),
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

/** Builds a public transaction preview through the injected WalletClient. */
export const PreviewTransaction = Command.define(
  'PreviewTransaction',
  {
    draft: TransferDraft,
    recipientFamiliarity: AddressFamiliarity,
    recipientHistory: RecipientHistory,
  },
  SucceededPreviewTransaction,
  FailedPreviewTransaction,
)(({ draft, recipientFamiliarity, recipientHistory }) =>
  WalletClient.pipe(
    Effect.flatMap(client => client.previewTransaction(draft)),
    Effect.flatMap(quote => {
      const maybePreview = transactionPreviewFromQuote(
        draft,
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
          draft,
          failure: toNetworkFailure('PreviewTransaction', error),
        }),
      ),
    ),
  ),
)

/** Prepares, signs, and submits one public transaction preview. */
export const SignAndSubmitTransaction = Command.define(
  'SignAndSubmitTransaction',
  { preview: TransactionPreview },
  SucceededSubmitSignedTransaction,
  FailedSubmitSignedTransaction,
)(({ preview }) =>
  Effect.gen(function* () {
    const client = yield* WalletClient
    const crypto = yield* WalletCrypto
    const signer = yield* WalletSigner
    const prepared = yield* client
      .prepareTransaction(preview)
      .pipe(
        Effect.mapError(error => toNetworkFailure('PrepareTransaction', error)),
      )
    const digest = yield* crypto
      .digestTransaction(prepared)
      .pipe(
        Effect.mapError(error => toCryptoFailure('DigestTransaction', error)),
      )
    const signed = yield* signer
      .signTransaction(prepared, digest)
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
    const proof = yield* signer
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

const portfolioCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> => {
  if (model.portfolio._tag === 'LoadingPortfolio') {
    return [LoadWallet()]
  } else {
    return []
  }
}

const transactionCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  M.value(model.transaction).pipe(
    M.withReturnType<
      ReadonlyArray<Command.Command<Message, never, WalletResources>>
    >(),
    M.tagsExhaustive({
      IdleTransaction: () => [],
      PreviewingTransaction: ({
        draft,
        recipientFamiliarity,
        recipientHistory,
      }) => [
        PreviewTransaction({
          draft,
          recipientFamiliarity,
          recipientHistory,
        }),
      ],
      PreviewedTransaction: () => [],
      SubmittingTransaction: ({ preview }) => [
        SignAndSubmitTransaction({ preview }),
      ],
      SubmittedTransaction: () => [],
      FailedTransactionPreview: () => [],
      FailedTransactionSubmission: () => [],
    }),
  )

const signatureCommandsForRestore = (
  model: Model,
): ReadonlyArray<Command.Command<Message, never, WalletResources>> =>
  M.value(model.signature).pipe(
    M.withReturnType<
      ReadonlyArray<Command.Command<Message, never, WalletResources>>
    >(),
    M.tagsExhaustive({
      IdleSignature: () => [],
      SigningChallengeState: ({ challenge }) => [SignChallenge({ challenge })],
      SignedChallenge: () => [],
      FailedChallengeSignature: () => [],
    }),
  )

/** Restarts finite work represented by a restored Wallet Model. */
export const restore = (model: Model): UpdateReturn => [
  model,
  [
    ...portfolioCommandsForRestore(model),
    ...transactionCommandsForRestore(model),
    ...signatureCommandsForRestore(model),
  ],
]

const replaceAddressBookEntry = (
  model: Model,
  message: Readonly<{ entry: AddressBookEntry }>,
): Model => ({
  ...model,
  addressBookEntries: [
    ...Array_.filter(
      model.addressBookEntries,
      entry => entry.entryId !== message.entry.entryId,
    ),
    message.entry,
  ],
})

const upsertObservedTransaction = (
  model: Model,
  message: typeof ObservedTransaction.Type,
): Model => ({
  ...model,
  observedTransactions: [
    ...Array_.filter(
      model.observedTransactions,
      transaction =>
        transaction.transactionId !== message.transaction.transactionId,
    ),
    message.transaction,
  ],
})

const accountIdsFromModel = (model: Model): ReadonlyArray<string> => {
  if (model.portfolio._tag === 'LoadedPortfolio') {
    return Array_.map(
      model.portfolio.snapshot.accounts,
      account => account.accountId,
    )
  } else {
    return []
  }
}

/** Applies one Wallet Message and returns its finite Commands. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      RequestedWalletRefresh: () => [
        {
          ...model,
          portfolio: LoadingPortfolio.make({}),
          transactionObservation: WaitingForAccounts.make({}),
        },
        [LoadWallet()],
      ],
      SucceededLoadWallet: ({ portfolio }) => [
        {
          ...model,
          portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
          transactionObservation: ObservingTransactions.make({
            accountIds: Array_.map(
              portfolio.accounts,
              account => account.accountId,
            ),
          }),
        },
        [],
      ],
      FailedLoadWallet: ({ failure }) => [
        {
          ...model,
          portfolio: FailedPortfolio.make({ failure }),
          transactionObservation: WaitingForAccounts.make({}),
        },
        [],
      ],
      ImportedAddressBookEntries: ({ entries }) => [
        { ...model, addressBookEntries: entries },
        [],
      ],
      AddedAddressBookEntry: message => [
        replaceAddressBookEntry(model, message),
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
      ComposedTransfer: ({ draft }) => {
        const recipientFamiliarity = familiarityForAddress(
          model.addressBookEntries,
          draft.network,
          draft.destinationAddress,
        )
        const recipientHistory = recipientHistoryForDraft(
          model.observedTransactions,
          draft,
        )
        return [
          {
            ...model,
            transaction: PreviewingTransaction.make({
              draft,
              recipientFamiliarity,
              recipientHistory,
            }),
          },
          [
            PreviewTransaction({
              draft,
              recipientFamiliarity,
              recipientHistory,
            }),
          ],
        ]
      },
      SucceededPreviewTransaction: ({ preview }) => {
        if (
          model.transaction._tag === 'PreviewingTransaction' &&
          model.transaction.draft.transferId === preview.draft.transferId
        ) {
          return [
            {
              ...model,
              transaction: PreviewedTransaction.make({ preview }),
            },
            [],
          ]
        } else {
          return [model, []]
        }
      },
      FailedPreviewTransaction: ({ draft, failure }) => {
        if (
          model.transaction._tag === 'PreviewingTransaction' &&
          model.transaction.draft.transferId === draft.transferId
        ) {
          return [
            {
              ...model,
              transaction: FailedTransactionPreview.make({ draft, failure }),
            },
            [],
          ]
        } else {
          return [model, []]
        }
      },
      RequestedSignedTransactionSubmission: ({ previewId }) => {
        if (
          model.transaction._tag === 'PreviewedTransaction' &&
          model.transaction.preview.previewId === previewId
        ) {
          const preview = model.transaction.preview
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
      FailedSubmitSignedTransaction: ({ preview, failure }) => {
        if (
          model.transaction._tag === 'SubmittingTransaction' &&
          model.transaction.preview.previewId === preview.previewId
        ) {
          return [
            {
              ...model,
              transaction: FailedTransactionSubmission.make({
                preview,
                failure,
              }),
            },
            [],
          ]
        } else {
          return [model, []]
        }
      },
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
      FailedSignChallenge: ({ challenge, failure }) => {
        if (
          model.signature._tag === 'SigningChallengeState' &&
          model.signature.challenge.challengeId === challenge.challengeId
        ) {
          return [
            {
              ...model,
              signature: FailedChallengeSignature.make({
                challenge,
                failure,
              }),
            },
            [],
          ]
        } else {
          return [model, []]
        }
      },
      ObservedTransaction: message => [
        upsertObservedTransaction(model, message),
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
