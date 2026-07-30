import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  CopiedToClipboard,
  CopyingToClipboard,
  clipboardCopyRequestForAddress,
} from './clipboard.js'
import {
  AdapterTestFundingMethod,
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
} from './currency.js'
import {
  ChangedTransferAmount,
  ChangedTransferRecipient,
  ComposedTransfer,
  FailedCopyToClipboard,
  FailedLoadWallet,
  FailedObserveTransactions,
  ObservedTransaction,
  RequestedClipboardCopy,
  RequestedTestFunding,
  RequestedTransactionHistoryReload,
  RequestedTransferPreview,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  SucceededCopyToClipboard,
  SucceededLoadTransactionHistory,
  SucceededLoadWallet,
  SucceededLoadWalletProfiles,
  SucceededRefreshWalletBalances,
  SucceededRequestTestFunding,
  SucceededValidateTransfer,
} from './message.js'
import {
  AccountBalance,
  BalanceSnapshot,
  LoadingPortfolio,
  type Model,
  NetworkFailure,
  PortfolioSnapshot,
  SignatureProof,
  SignedChallenge,
  TestFundingReceipt,
  TransactionHistoryPage,
  TransactionRecord,
  TransferRequest,
  ValidatedRecipient,
  ValidatedTransfer,
  initialModel,
} from './model.js'
import { SendNetworkSelection } from './sendNetworkSelection.js'
import { makeWalletTestChallenge } from './signingChallenge.js'
import { restore, update } from './update.js'
import { WalletProfile } from './walletProfile.js'

const chain = ChainDescriptor.make({ chainId: 'solana', displayName: 'Solana' })
const network = NetworkDescriptor.make({
  networkId: 'solana:devnet',
  chainId: chain.chainId,
  displayName: 'Solana Devnet',
  environment: 'Testnet',
  capabilities: ['Transfer', 'TestFunding', 'TransactionHistory'],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const asset = AssetDescriptor.make({
  assetId: 'solana:devnet:sol',
  networkId: network.networkId,
  displayName: 'Devnet SOL',
  symbol: 'SOL',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const account = {
  accountId: 'account-1',
  chainId: chain.chainId,
  networkId: network.networkId,
  address: 'account-address',
  displayName: 'Account',
}
const wallet = WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'Wallet 1',
  createdAt: 1,
  accounts: [account],
})
const devnetNetwork = NetworkDescriptor.make({
  networkId: 'solana:development',
  chainId: chain.chainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TestFunding',
    'TransactionHistory',
    'TransactionObservation',
  ],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const devnetAsset = AssetDescriptor.make({
  assetId: 'solana:development:sol',
  networkId: devnetNetwork.networkId,
  displayName: 'Devnet SOL',
  symbol: 'SOL',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const devnetAccount = {
  accountId: 'account-devnet',
  chainId: chain.chainId,
  networkId: devnetNetwork.networkId,
  address: 'devnet-account-address',
  displayName: 'Devnet Account',
}
const suiChain = ChainDescriptor.make({ chainId: 'sui', displayName: 'Sui' })
const suiDevnetNetwork = NetworkDescriptor.make({
  networkId: 'sui:devnet',
  chainId: suiChain.chainId,
  displayName: 'Sui Devnet',
  environment: 'Development',
  capabilities: [
    'Transfer',
    'TestFunding',
    'TransactionHistory',
    'TransactionObservation',
  ],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const suiDevnetAsset = AssetDescriptor.make({
  assetId: 'sui:devnet:sui',
  networkId: suiDevnetNetwork.networkId,
  displayName: 'Devnet SUI',
  symbol: 'SUI',
  decimalPlaces: 9,
  kind: NativeAsset.make({}),
})
const suiDevnetAccount = {
  accountId: 'account-sui-devnet',
  chainId: suiChain.chainId,
  networkId: suiDevnetNetwork.networkId,
  address: 'sui-devnet-account-address',
  displayName: 'Sui Devnet Account',
}
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Fixture',
  chains: [chain],
  networks: [network],
  assets: [asset],
  accounts: [account],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: 1,
    balances: [
      AccountBalance.make({
        accountId: account.accountId,
        amount: AssetAmount.make({
          assetId: asset.assetId,
          atomicUnits: '1000',
          observedAt: 1,
        }),
      }),
    ],
  }),
  receivingInstructions: [],
})

const transitionPortfolio = PortfolioSnapshot.make({
  ...portfolio,
  chains: [chain, suiChain],
  networks: [network, devnetNetwork, suiDevnetNetwork],
  assets: [asset, devnetAsset, suiDevnetAsset],
  accounts: [account, devnetAccount, suiDevnetAccount],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: 1,
    balances: [
      ...portfolio.balanceSnapshot.balances,
      AccountBalance.make({
        accountId: devnetAccount.accountId,
        amount: AssetAmount.make({
          assetId: devnetAsset.assetId,
          atomicUnits: '2000',
          observedAt: 1,
        }),
      }),
      AccountBalance.make({
        accountId: suiDevnetAccount.accountId,
        amount: AssetAmount.make({
          assetId: suiDevnetAsset.assetId,
          atomicUnits: '3000',
          observedAt: 1,
        }),
      }),
    ],
  }),
})

const portfolioRequestId = 'portfolio-test'
const finishPortfolioLoad = (model: Model, snapshot: PortfolioSnapshot) =>
  update(
    {
      ...model,
      portfolio: LoadingPortfolio.make({ requestId: portfolioRequestId }),
    },
    SucceededLoadWallet.make({
      requestId: portfolioRequestId,
      portfolio: snapshot,
    }),
  )

describe('wallet update', () => {
  it('models a successful host clipboard write', () => {
    const request = clipboardCopyRequestForAddress('account-address')
    const [copyingModel, commands] = update(
      initialModel,
      RequestedClipboardCopy.make({ request }),
    )
    const [copiedModel] = update(
      copyingModel,
      SucceededCopyToClipboard.make({ request }),
    )

    expect(copyingModel.clipboardCopy._tag).toBe('CopyingToClipboard')
    expect(commands).toHaveLength(1)
    expect(copiedModel.clipboardCopy._tag).toBe('CopiedToClipboard')
  })

  it('models a denied host clipboard write and ignores stale results', () => {
    const firstRequest = clipboardCopyRequestForAddress('first-address')
    const secondRequest = clipboardCopyRequestForAddress('second-address')
    const [firstModel] = update(
      initialModel,
      RequestedClipboardCopy.make({ request: firstRequest }),
    )
    const [secondModel] = update(
      firstModel,
      RequestedClipboardCopy.make({ request: secondRequest }),
    )
    const [staleModel] = update(
      secondModel,
      SucceededCopyToClipboard.make({ request: firstRequest }),
    )
    const [failedModel] = update(
      staleModel,
      FailedCopyToClipboard.make({
        request: secondRequest,
        code: 'Denied',
      }),
    )

    expect(staleModel).toBe(secondModel)
    expect(failedModel.clipboardCopy._tag).toBe('FailedClipboardCopy')
    if (failedModel.clipboardCopy._tag !== 'FailedClipboardCopy') {
      throw new Error('Expected clipboard copying to fail')
    }
    expect(failedModel.clipboardCopy.code).toBe('Denied')
  })

  it('does not replay a restored clipboard write without user activation', () => {
    const request = clipboardCopyRequestForAddress('account-address')
    const copyingModel = {
      ...initialModel,
      clipboardCopy: CopyingToClipboard.make({ request }),
    }
    const [restoredModel, commands] = restore(copyingModel)

    expect(restoredModel.clipboardCopy._tag).toBe('FailedClipboardCopy')
    expect(commands).toHaveLength(1)
  })

  it('hydrates live accounts before resuming restored finite work', () => {
    const [profileModel] = update(
      initialModel,
      SucceededLoadWalletProfiles.make({ wallets: [] }),
    )
    if (profileModel.portfolio._tag !== 'LoadingPortfolio') {
      throw new Error('Expected the portfolio to start loading')
    }
    const [loadedModel] = update(
      profileModel,
      SucceededLoadWallet.make({
        requestId: profileModel.portfolio.requestId,
        portfolio,
      }),
    )
    const [amountModel] = update(
      loadedModel,
      ChangedTransferAmount.make({ value: '0.000000001' }),
    )
    const [fundingModel] = update(amountModel, RequestedTestFunding.make({}))
    const [restoredModel, restoreCommands] = restore(fundingModel)

    expect(fundingModel.testFunding._tag).toBe('RequestingTestFunding')
    expect(restoredModel.portfolio._tag).toBe('LoadingPortfolio')
    expect(restoreCommands.map(command => command.name)).toEqual(['LoadWallet'])
    if (restoredModel.portfolio._tag !== 'LoadingPortfolio') {
      throw new Error('Expected restored portfolio hydration')
    }
    const [failedHydrationModel] = update(
      restoredModel,
      FailedLoadWallet.make({
        requestId: restoredModel.portfolio.requestId,
        failure: NetworkFailure.make({
          operation: 'LoadPortfolio',
          code: 'Unavailable',
        }),
      }),
    )
    expect(failedHydrationModel.testFunding._tag).toBe('FailedTestFunding')
    expect(failedHydrationModel.transactionHistory._tag).toBe(
      'FailedTransactionHistory',
    )
    const [hydratedModel, resumedCommands] = update(
      restoredModel,
      SucceededLoadWallet.make({
        requestId: restoredModel.portfolio.requestId,
        portfolio,
      }),
    )

    expect(hydratedModel.testFunding._tag).toBe('RequestingTestFunding')
    expect(resumedCommands.map(command => command.name)).toContain(
      'RequestTestFunding',
    )
  })

  it('loads normalized catalogs and starts finite history loading', () => {
    const [model, commands] = finishPortfolioLoad(initialModel, portfolio)

    expect(model.portfolio._tag).toBe('LoadedPortfolio')
    expect(model.transactionHistory._tag).toBe('LoadingTransactionHistory')
    expect(commands).toHaveLength(1)
  })

  it('ignores a stale portfolio response after a newer load starts', () => {
    const currentModel = {
      ...initialModel,
      portfolio: LoadingPortfolio.make({ requestId: 'portfolio-current' }),
    }
    const [staleModel] = update(
      currentModel,
      SucceededLoadWallet.make({
        requestId: 'portfolio-stale',
        portfolio,
      }),
    )

    expect(staleModel).toBe(currentModel)
  })

  it('rebinds every scoped state when the mode and cryptocurrency change', () => {
    const [loadedModel] = finishPortfolioLoad(initialModel, transitionPortfolio)
    const [recipientModel] = update(
      loadedModel,
      ChangedTransferRecipient.make({ value: 'destination-address' }),
    )
    const [amountModel] = update(
      recipientModel,
      ChangedTransferAmount.make({ value: '1' }),
    )
    const [fundingModel] = update(amountModel, RequestedTestFunding.make({}))
    const [validatingModel] = update(
      fundingModel,
      RequestedTransferPreview.make({}),
    )
    const staleChallenge = makeWalletTestChallenge(
      'challenge-before-network-change',
      account.accountId,
    )
    const staleScopedModel = {
      ...validatingModel,
      clipboardCopy: CopiedToClipboard.make({
        request: clipboardCopyRequestForAddress(account.address),
      }),
      signature: SignedChallenge.make({
        challenge: staleChallenge,
        proof: SignatureProof.make({
          challengeId: staleChallenge.challengeId,
          accountId: staleChallenge.accountId,
          algorithm: 'test-signature',
          publicIdentity: 'test-public-identity',
          signature: 'test-signature-bytes',
          encoding: 'test-encoding',
        }),
      }),
    }

    const [devnetModel, devnetCommands] = update(
      staleScopedModel,
      SelectedWalletNetworkMode.make({ networkMode: 'Devnet' }),
    )

    expect(devnetModel.maybeSendNetworkSelection).toMatchObject({
      _tag: 'Some',
      value: {
        accountId: devnetAccount.accountId,
        networkId: devnetNetwork.networkId,
        assetId: devnetAsset.assetId,
      },
    })
    expect(devnetModel.transferRecipient._tag).toBe('EmptyTransferRecipient')
    expect(devnetModel.transferAmount._tag).toBe('EmptyTransferAmount')
    expect(devnetModel.testFunding._tag).toBe('ReadyToRequestTestFunding')
    expect(devnetModel.transaction._tag).toBe('IdleTransaction')
    expect(devnetModel.clipboardCopy._tag).toBe('IdleClipboardCopy')
    expect(devnetModel.signature._tag).toBe('IdleSignature')
    expect(devnetModel.transactionHistory).toMatchObject({
      _tag: 'LoadingTransactionHistory',
      query: {
        accountId: devnetAccount.accountId,
        networkId: devnetNetwork.networkId,
      },
    })
    expect(devnetModel.transactionObservation).toMatchObject({
      _tag: 'ObservingTransactions',
      accountIds: [devnetAccount.accountId],
    })
    expect(devnetModel.transactions).toEqual([])
    expect(devnetCommands).toHaveLength(1)

    const suiSelection = SendNetworkSelection.make({
      networkMode: 'Devnet',
      chainId: suiChain.chainId,
      networkId: suiDevnetNetwork.networkId,
      accountId: suiDevnetAccount.accountId,
      assetId: suiDevnetAsset.assetId,
    })
    const [suiModel, suiCommands] = update(
      {
        ...devnetModel,
        clipboardCopy: staleScopedModel.clipboardCopy,
        signature: staleScopedModel.signature,
      },
      SelectedSendNetwork.make({ selection: suiSelection }),
    )

    expect(suiModel.maybeSendNetworkSelection).toEqual(
      Option.some(suiSelection),
    )
    expect(suiModel.transactionHistory).toMatchObject({
      _tag: 'LoadingTransactionHistory',
      query: {
        accountId: suiDevnetAccount.accountId,
        networkId: suiDevnetNetwork.networkId,
      },
    })
    expect(suiModel.transactionObservation).toMatchObject({
      _tag: 'ObservingTransactions',
      accountIds: [suiDevnetAccount.accountId],
    })
    expect(suiModel.clipboardCopy._tag).toBe('IdleClipboardCopy')
    expect(suiModel.signature._tag).toBe('IdleSignature')
    expect(suiCommands).toHaveLength(1)

    const failure = NetworkFailure.make({
      operation: 'ObserveTransactions',
      code: 'Unavailable',
    })
    const [ignoredStaleFailure] = update(
      suiModel,
      FailedObserveTransactions.make({
        accountIds: [devnetAccount.accountId],
        failure,
      }),
    )
    expect(ignoredStaleFailure).toBe(suiModel)

    const [failedObservationModel] = update(
      suiModel,
      FailedObserveTransactions.make({
        accountIds: [suiDevnetAccount.accountId],
        failure,
      }),
    )
    expect(failedObservationModel.transactionObservation._tag).toBe(
      'FailedTransactionObservation',
    )

    const [testnetModel] = update(
      failedObservationModel,
      SelectedWalletNetworkMode.make({ networkMode: 'Testnet' }),
    )
    expect(testnetModel.transactionObservation).toMatchObject({
      _tag: 'ObservingTransactions',
      accountIds: [account.accountId],
    })
  })

  it('distinguishes unsupported selected-network history', () => {
    const unsupportedPortfolio = PortfolioSnapshot.make({
      ...portfolio,
      networks: [{ ...network, capabilities: ['Transfer'] }],
    })
    const [model, commands] = finishPortfolioLoad(
      initialModel,
      unsupportedPortfolio,
    )

    expect(model.transactionHistory).toMatchObject({
      _tag: 'FailedTransactionHistory',
      failure: {
        _tag: 'NetworkFailure',
        operation: 'LoadTransactionHistory',
        code: 'UnsupportedCapability',
      },
    })
    expect(commands).toHaveLength(0)
  })

  it('moves one generic transfer through adapter validation', () => {
    const [loadedModel] = finishPortfolioLoad(initialModel, portfolio)
    const request = TransferRequest.make({
      transferId: 'transfer-1',
      accountId: account.accountId,
      assetId: asset.assetId,
      destinationAddress: 'destination-address',
      atomicUnits: '10',
      maybeMessage: Option.none(),
    })
    const [validatingModel] = update(
      loadedModel,
      ComposedTransfer.make({ request }),
    )
    const [previewingModel, commands] = update(
      validatingModel,
      SucceededValidateTransfer.make({
        validation: ValidatedTransfer.make({
          request,
          recipient: ValidatedRecipient.make({
            networkId: network.networkId,
            address: request.destinationAddress,
            normalizedAddress: request.destinationAddress,
            displayAddress: request.destinationAddress,
          }),
        }),
      }),
    )

    expect(previewingModel.transaction._tag).toBe('PreviewingTransaction')
    expect(commands).toHaveLength(1)
  })

  it('composes sends from the user-entered exact display amount', () => {
    const [loadedModel] = finishPortfolioLoad(initialModel, portfolio)
    const [recipientModel] = update(
      loadedModel,
      ChangedTransferRecipient.make({ value: 'destination-address' }),
    )
    const [amountModel] = update(
      recipientModel,
      ChangedTransferAmount.make({ value: '1.000000001' }),
    )
    const [validatingModel, commands] = update(
      amountModel,
      RequestedTransferPreview.make({}),
    )

    expect(amountModel.transferAmount).toMatchObject({
      _tag: 'ValidTransferAmount',
      atomicUnits: '1000000001',
    })
    expect(validatingModel.transaction).toMatchObject({
      _tag: 'ValidatingTransfer',
      request: {
        transferId: 'transfer-1',
        atomicUnits: '1000000001',
        maybeMessage: Option.none(),
      },
    })
    expect(validatingModel.nextTransferRequestNumber).toBe(2)
    expect(commands).toHaveLength(1)
  })

  it('models generic non-production funding from the selected asset amount', () => {
    const [loadedModel] = finishPortfolioLoad(
      { ...initialModel, wallets: [wallet] },
      portfolio,
    )
    const [amountModel] = update(
      loadedModel,
      ChangedTransferAmount.make({ value: '2' }),
    )
    const [requestingModel, commands] = update(
      amountModel,
      RequestedTestFunding.make({}),
    )
    if (requestingModel.testFunding._tag !== 'RequestingTestFunding') {
      throw new Error('Expected test funding to be requested')
    }
    const request = requestingModel.testFunding.request
    const receipt = TestFundingReceipt.make({
      requestId: request.requestId,
      fundingId: 'funding-1',
      acceptedAt: 2,
      amount: AssetAmount.make({
        assetId: request.assetId,
        atomicUnits: request.atomicUnits,
        observedAt: 2,
      }),
      maybeTransactionId: Option.some('transaction-1'),
    })
    const [receivedModel, refreshCommands] = update(
      requestingModel,
      SucceededRequestTestFunding.make({ request, receipt }),
    )

    expect(request.environment).toBe('Testnet')
    expect(request.atomicUnits).toBe('2000000000')
    expect(commands).toHaveLength(1)
    expect(receivedModel.testFunding._tag).toBe('ReceivedTestFunding')
    expect(refreshCommands.map(command => command.name)).toEqual([
      'RefreshWalletBalances',
    ])
  })

  it('refreshes a loaded balance after a new confirmed observation', () => {
    const [loadedModel] = finishPortfolioLoad(
      { ...initialModel, wallets: [wallet] },
      portfolio,
    )
    const transaction = TransactionRecord.make({
      recordId: 'account-1:incoming-1:incoming',
      transactionId: 'incoming-1',
      accountId: account.accountId,
      networkId: network.networkId,
      direction: 'Incoming',
      status: 'Confirmed',
      amount: AssetAmount.make({
        assetId: asset.assetId,
        atomicUnits: '500',
        observedAt: 2,
      }),
      counterpartyAddress: 'sender-address',
      normalizedCounterpartyAddress: 'sender-address',
      observedAt: 2,
    })
    const [observedModel, refreshCommands] = update(
      loadedModel,
      ObservedTransaction.make({ transaction }),
    )
    const refreshedSnapshot = BalanceSnapshot.make({
      observedAt: 3,
      balances: [
        AccountBalance.make({
          accountId: account.accountId,
          amount: AssetAmount.make({
            assetId: asset.assetId,
            atomicUnits: '1500',
            observedAt: 3,
          }),
        }),
      ],
    })
    const [refreshedModel] = update(
      observedModel,
      SucceededRefreshWalletBalances.make({
        walletIds: [wallet.walletId],
        balanceSnapshot: refreshedSnapshot,
      }),
    )
    const [, duplicateCommands] = update(
      observedModel,
      ObservedTransaction.make({ transaction }),
    )

    expect(refreshCommands.map(command => command.name)).toEqual([
      'RefreshWalletBalances',
    ])
    expect(refreshedModel.portfolio).toMatchObject({
      _tag: 'LoadedPortfolio',
      snapshot: {
        balanceSnapshot: {
          observedAt: 3,
          balances: [{ amount: { atomicUnits: '1500' } }],
        },
      },
    })
    expect(refreshedModel.transactions).toEqual(observedModel.transactions)
    expect(duplicateCommands).toEqual([])
  })

  it('accepts the matching history page', () => {
    const [loadingModel] = finishPortfolioLoad(initialModel, portfolio)
    if (loadingModel.transactionHistory._tag !== 'LoadingTransactionHistory') {
      throw new Error('Expected transaction history to be loading')
    }
    const query = loadingModel.transactionHistory.query
    const [loadedModel] = update(
      loadingModel,
      SucceededLoadTransactionHistory.make({
        query,
        page: TransactionHistoryPage.make({
          records: [],
          maybeNextCursor: Option.none(),
        }),
      }),
    )

    expect(loadedModel.transactionHistory._tag).toBe('LoadedTransactionHistory')
    const [reloadingModel, commands] = update(
      loadedModel,
      RequestedTransactionHistoryReload.make({}),
    )
    expect(reloadingModel.transactionHistory).toMatchObject({
      _tag: 'LoadingTransactionHistory',
      query: {
        accountId: account.accountId,
        networkId: network.networkId,
        maybeCursor: Option.none(),
      },
    })
    expect(commands).toHaveLength(1)
  })
})
