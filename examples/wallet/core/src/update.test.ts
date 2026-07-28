import { Array as Array_, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CurrencyValue,
  Eth,
  EthereumSepolia,
  EthereumSepoliaEthValue,
} from './currency.js'
import {
  AddedAddressBookEntry,
  ChangedTransferRecipient,
  ComposedTransfer,
  FailedLoadWallet,
  FailedObserveTransactions,
  FailedPreviewTransaction,
  FailedSignChallenge,
  FailedSubmitSignedTransaction,
  ImportedAddressBookEntries,
  ObservedTransaction,
  RemovedAddressBookEntry,
  RequestedChallengeSignature,
  RequestedSignedTransactionSubmission,
  RequestedTransferPreview,
  RequestedWalletRefresh,
  ResumedTransactionObservation,
  SucceededLoadWallet,
  SucceededPreviewTransaction,
  SucceededSignChallenge,
  SucceededSubmitSignedTransaction,
} from './message.js'
import {
  AccountBalance,
  AddressBookEntry,
  BalanceSnapshot,
  EthereumSepoliaEthTransactionPreview,
  EthereumSepoliaEthTransferDraft,
  EthereumSignatureProof,
  FailedPortfolio,
  FailedTransactionObservation,
  FailedTransactionPreview,
  FailedTransactionSubmission,
  FamiliarAddress,
  InvalidTransferRecipient,
  LoadedPortfolio,
  LoadingPortfolio,
  type Model,
  NetworkFailure,
  ObservingTransactions,
  PortfolioSnapshot,
  PreviewedTransaction,
  PreviewingTransaction,
  PreviouslyTransactedWithRecipient,
  ReceivingInstruction,
  SignedChallenge,
  SigningChallenge,
  SigningChallengeState,
  SubmittedTransaction,
  SubmittingTransaction,
  TransactionRecord,
  TransactionSubmission,
  ValidTransferRecipient,
  WaitingForAccounts,
  WalletAccount,
  initialModel,
} from './model.js'
import { restore, update, walletDemoTransferAtomicUnits } from './update.js'

const observedAt = 1_722_000_000_000
const ethereum = EthereumSepolia.make({})
const eth = Eth.make({ network: ethereum })
const currentBalance = CurrencyValue.make({
  currency: eth,
  atomicUnits: '1000000000000000000',
  decimalPlaces: 18,
  observedAt,
})
const fee = EthereumSepoliaEthValue.make({
  currency: eth,
  atomicUnits: '1000',
  decimalPlaces: 18,
  observedAt,
})
const resultingBalance = EthereumSepoliaEthValue.make({
  currency: eth,
  atomicUnits: '899999999999999000',
  decimalPlaces: 18,
  observedAt: observedAt + 1,
})
const account = WalletAccount.make({
  accountId: 'account-1',
  network: ethereum,
  address: '0xAccount',
  displayName: 'Sepolia Account',
})
const portfolio = PortfolioSnapshot.make({
  accounts: [account],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt,
    balances: [
      AccountBalance.make({
        accountId: account.accountId,
        value: currentBalance,
      }),
    ],
  }),
  receivingInstructions: [
    ReceivingInstruction.make({
      accountId: account.accountId,
      network: ethereum,
      currency: eth,
      destinationAddress: account.address,
      maybeMemo: Option.none(),
      portableUri: `ethereum:${account.address}@sepolia`,
    }),
  ],
})
const addressBookEntry = AddressBookEntry.make({
  entryId: 'entry-1',
  network: ethereum,
  address: '0xRecipient',
  displayName: 'Recipient',
})
const draft = EthereumSepoliaEthTransferDraft.make({
  transferId: 'transfer-1',
  accountId: account.accountId,
  network: ethereum,
  destinationAddress: addressBookEntry.address,
  value: EthereumSepoliaEthValue.make({
    currency: eth,
    atomicUnits: '100000000000000000',
    decimalPlaces: 18,
    observedAt,
  }),
  maybeMessage: Option.some('Thanks'),
})
const history = PreviouslyTransactedWithRecipient.make({
  transactionCount: 1,
  mostRecentObservedAt: observedAt,
})
const preview = EthereumSepoliaEthTransactionPreview.make({
  previewId: 'quote-1',
  draft,
  estimatedFee: fee,
  resultingBalance,
  expiresAt: observedAt + 60_000,
  recipientFamiliarity: FamiliarAddress.make({ entry: addressBookEntry }),
  recipientHistory: history,
})
const failure = NetworkFailure.make({
  operation: 'PreviewTransaction',
  code: 'Unavailable',
})
const submission = TransactionSubmission.make({
  previewId: preview.previewId,
  transactionId: 'transaction-submitted',
  submittedAt: observedAt + 2,
})
const observedTransaction = TransactionRecord.make({
  transactionId: 'transaction-observed',
  accountId: account.accountId,
  network: ethereum,
  direction: 'Outgoing',
  status: 'Confirmed',
  value: draft.value,
  counterpartyAddress: draft.destinationAddress,
  observedAt,
})
const challenge = SigningChallenge.make({
  challengeId: 'challenge-1',
  accountId: account.accountId,
  digest: {
    algorithm: 'Keccak256',
    domain: 'wallet.example/access/v1',
    digestHex: '0xDigest',
  },
})
const proof = EthereumSignatureProof.make({
  challengeId: challenge.challengeId,
  accountId: challenge.accountId,
  address: account.address,
  signatureHex: '0xSignature',
})

const loadedModel: Model = {
  ...initialModel,
  portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
  addressBookEntries: [addressBookEntry],
  transactionObservation: ObservingTransactions.make({
    accountIds: [account.accountId],
  }),
  observedTransactions: [observedTransaction],
}

const commandNames = (
  commands: ReadonlyArray<Readonly<{ name: string }>>,
): ReadonlyArray<string> => Array_.map(commands, command => command.name)

describe('Wallet portfolio and address-book update', () => {
  it('handles refresh, load success, and load failure facts', () => {
    const [refreshModel, refreshCommands] = update(
      loadedModel,
      RequestedWalletRefresh.make({}),
    )
    expect(refreshModel.portfolio).toStrictEqual(LoadingPortfolio.make({}))
    expect(refreshModel.transactionObservation).toStrictEqual(
      WaitingForAccounts.make({}),
    )
    expect(commandNames(refreshCommands)).toStrictEqual(['LoadWallet'])

    const [successModel] = update(
      initialModel,
      SucceededLoadWallet.make({ portfolio }),
    )
    expect(successModel.portfolio).toStrictEqual(
      LoadedPortfolio.make({ snapshot: portfolio }),
    )
    expect(successModel.transactionObservation).toStrictEqual(
      ObservingTransactions.make({ accountIds: [account.accountId] }),
    )

    const [failedModel] = update(
      initialModel,
      FailedLoadWallet.make({ failure }),
    )
    expect(failedModel.portfolio).toStrictEqual(
      FailedPortfolio.make({ failure }),
    )
  })

  it('imports, replaces, and removes address-book entries', () => {
    const replacement = AddressBookEntry.make({
      ...addressBookEntry,
      displayName: 'Updated Recipient',
    })
    const [importedModel] = update(
      initialModel,
      ImportedAddressBookEntries.make({ entries: [addressBookEntry] }),
    )
    const [addedModel] = update(
      importedModel,
      AddedAddressBookEntry.make({ entry: replacement }),
    )
    const [removedModel] = update(
      addedModel,
      RemovedAddressBookEntry.make({ entryId: replacement.entryId }),
    )

    expect(importedModel.addressBookEntries).toStrictEqual([addressBookEntry])
    expect(addedModel.addressBookEntries).toStrictEqual([replacement])
    expect(removedModel.addressBookEntries).toStrictEqual([])
  })
})

describe('Wallet transaction update', () => {
  it('validates the editable recipient before requesting a preview', () => {
    const invalidInput =
      '0x1111111111111111111111111111111111111111111111111111111111111111'
    const [invalidModel, invalidCommands] = update(
      loadedModel,
      ChangedTransferRecipient.make({ value: invalidInput }),
    )

    expect(invalidModel.transferRecipient).toStrictEqual(
      InvalidTransferRecipient.make({
        input: invalidInput,
        reason: 'ExpectedEthereumAddress',
      }),
    )
    expect(invalidModel.transaction._tag).toBe('IdleTransaction')
    expect(invalidCommands).toStrictEqual([])

    const destinationAddress = '0x2222222222222222222222222222222222222222'
    const [recipientModel] = update(
      invalidModel,
      ChangedTransferRecipient.make({ value: destinationAddress }),
    )
    const [previewingModel, commands] = update(
      recipientModel,
      RequestedTransferPreview.make({}),
    )

    expect(recipientModel.transferRecipient).toStrictEqual(
      ValidTransferRecipient.make({ address: destinationAddress }),
    )
    expect(previewingModel.transaction).toMatchObject({
      _tag: 'PreviewingTransaction',
      draft: {
        destinationAddress,
        value: { atomicUnits: walletDemoTransferAtomicUnits },
      },
    })
    expect(commandNames(commands)).toStrictEqual(['PreviewTransaction'])
  })

  it('derives recipient context and requests a preview', () => {
    const [nextModel, commands] = update(
      loadedModel,
      ComposedTransfer.make({ draft }),
    )

    expect(nextModel.transaction).toStrictEqual(
      PreviewingTransaction.make({
        draft,
        recipientFamiliarity: FamiliarAddress.make({ entry: addressBookEntry }),
        recipientHistory: history,
      }),
    )
    expect(commandNames(commands)).toStrictEqual(['PreviewTransaction'])
    const maybeCommand = Array_.head(commands)
    expect(Option.isSome(maybeCommand)).toBe(true)
    if (Option.isSome(maybeCommand)) {
      expect(maybeCommand.value.args).toMatchObject({
        draft,
        recipientHistory: history,
      })
    }
  })

  it('handles preview success and failure facts', () => {
    const previewingModel: Model = {
      ...loadedModel,
      transaction: PreviewingTransaction.make({
        draft,
        recipientFamiliarity: FamiliarAddress.make({ entry: addressBookEntry }),
        recipientHistory: history,
      }),
    }
    const [successModel] = update(
      previewingModel,
      SucceededPreviewTransaction.make({ preview }),
    )
    const [failedModel] = update(
      previewingModel,
      FailedPreviewTransaction.make({ draft, failure }),
    )

    expect(successModel.transaction).toStrictEqual(
      PreviewedTransaction.make({ preview }),
    )
    expect(failedModel.transaction).toStrictEqual(
      FailedTransactionPreview.make({ draft, failure }),
    )
  })

  it('ignores stale transaction completion facts', () => {
    const previewingModel: Model = {
      ...loadedModel,
      transaction: PreviewingTransaction.make({
        draft,
        recipientFamiliarity: FamiliarAddress.make({ entry: addressBookEntry }),
        recipientHistory: history,
      }),
    }
    const staleDraft = EthereumSepoliaEthTransferDraft.make({
      ...draft,
      transferId: 'stale-transfer',
    })
    const stalePreview = EthereumSepoliaEthTransactionPreview.make({
      ...preview,
      draft: staleDraft,
    })
    const [stalePreviewSuccess] = update(
      previewingModel,
      SucceededPreviewTransaction.make({ preview: stalePreview }),
    )
    const [stalePreviewFailure] = update(
      previewingModel,
      FailedPreviewTransaction.make({ draft: staleDraft, failure }),
    )

    expect(stalePreviewSuccess).toBe(previewingModel)
    expect(stalePreviewFailure).toBe(previewingModel)
  })

  it('submits only the currently previewed transaction', () => {
    const previewedModel: Model = {
      ...loadedModel,
      transaction: PreviewedTransaction.make({ preview }),
    }
    const [staleModel, staleCommands] = update(
      previewedModel,
      RequestedSignedTransactionSubmission.make({ previewId: 'stale' }),
    )
    const [nextModel, commands] = update(
      previewedModel,
      RequestedSignedTransactionSubmission.make({
        previewId: preview.previewId,
      }),
    )

    expect(staleModel).toBe(previewedModel)
    expect(staleCommands).toStrictEqual([])
    expect(nextModel.transaction).toStrictEqual(
      SubmittingTransaction.make({ preview }),
    )
    expect(commandNames(commands)).toStrictEqual(['SignAndSubmitTransaction'])
  })

  it('handles submission success and failure facts', () => {
    const submittingModel: Model = {
      ...loadedModel,
      transaction: SubmittingTransaction.make({ preview }),
    }
    const [successModel] = update(
      submittingModel,
      SucceededSubmitSignedTransaction.make({ submission }),
    )
    const [failedModel] = update(
      submittingModel,
      FailedSubmitSignedTransaction.make({ preview, failure }),
    )

    expect(successModel.transaction).toStrictEqual(
      SubmittedTransaction.make({ preview, submission }),
    )
    expect(failedModel.transaction).toStrictEqual(
      FailedTransactionSubmission.make({ preview, failure }),
    )
  })
})

describe('Wallet challenge signing update', () => {
  it('requests signing and handles success and failure facts', () => {
    const [signingModel, commands] = update(
      loadedModel,
      RequestedChallengeSignature.make({ challenge }),
    )
    const [signedModel] = update(
      signingModel,
      SucceededSignChallenge.make({ challenge, proof }),
    )
    const [failedModel] = update(
      signingModel,
      FailedSignChallenge.make({ challenge, failure }),
    )

    expect(signingModel.signature).toStrictEqual(
      SigningChallengeState.make({ challenge }),
    )
    expect(commandNames(commands)).toStrictEqual(['SignChallenge'])
    expect(signedModel.signature).toStrictEqual(
      SignedChallenge.make({ challenge, proof }),
    )
    expect(failedModel.signature).toMatchObject({
      _tag: 'FailedChallengeSignature',
      challenge,
      failure,
    })
  })
})

describe('Wallet transaction observation update', () => {
  it('upserts observations and records sanitized failures', () => {
    const [observedModel] = update(
      loadedModel,
      ObservedTransaction.make({
        transaction: TransactionRecord.make({
          ...observedTransaction,
          status: 'Pending',
        }),
      }),
    )
    const [failedModel] = update(
      observedModel,
      FailedObserveTransactions.make({ failure }),
    )

    expect(observedModel.observedTransactions).toHaveLength(1)
    expect(observedModel.observedTransactions).toMatchObject([
      { status: 'Pending' },
    ])
    expect(failedModel.transactionObservation).toStrictEqual(
      FailedTransactionObservation.make({ failure }),
    )
  })

  it('resumes observation only when public accounts are loaded', () => {
    const failedObservationModel: Model = {
      ...loadedModel,
      transactionObservation: FailedTransactionObservation.make({ failure }),
    }
    const [resumedModel] = update(
      failedObservationModel,
      ResumedTransactionObservation.make({}),
    )
    const [unchangedModel] = update(
      initialModel,
      ResumedTransactionObservation.make({}),
    )

    expect(resumedModel.transactionObservation).toStrictEqual(
      ObservingTransactions.make({ accountIds: [account.accountId] }),
    )
    expect(unchangedModel).toBe(initialModel)
  })
})

describe('Wallet restoration', () => {
  it('restarts every finite operation represented by the Model', () => {
    const pendingModel: Model = {
      ...loadedModel,
      portfolio: LoadingPortfolio.make({}),
      transaction: PreviewingTransaction.make({
        draft,
        recipientFamiliarity: FamiliarAddress.make({ entry: addressBookEntry }),
        recipientHistory: history,
      }),
      signature: SigningChallengeState.make({ challenge }),
    }
    const [restoredModel, commands] = restore(pendingModel)

    expect(restoredModel).toBe(pendingModel)
    expect(commandNames(commands)).toStrictEqual([
      'LoadWallet',
      'PreviewTransaction',
      'SignChallenge',
    ])
  })

  it('restarts submission but leaves stable states inert', () => {
    const submittingModel: Model = {
      ...loadedModel,
      transaction: SubmittingTransaction.make({ preview }),
    }
    const [, submittingCommands] = restore(submittingModel)
    const [restoredModel, stableCommands] = restore(loadedModel)

    expect(commandNames(submittingCommands)).toStrictEqual([
      'SignAndSubmitTransaction',
    ])
    expect(restoredModel).toBe(loadedModel)
    expect(stableCommands).toStrictEqual([])
  })
})
