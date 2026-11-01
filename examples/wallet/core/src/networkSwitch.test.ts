import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
} from './currency.js'
import {
  ChangedTransferRecipient,
  FailedRefreshWalletBalances,
  RequestedBalanceRefresh,
  SelectedSendNetwork,
  SelectedWalletNetworkMode,
  SucceededLoadWallet,
  SucceededRefreshWalletBalances,
} from './message.js'
import {
  AccountBalance,
  BalanceSnapshot,
  FirstTransactionWithRecipient,
  LoadedPortfolio,
  LoadingPortfolio,
  type Model,
  NetworkFailure,
  PortfolioSnapshot,
  SubmittingTransaction,
  TransactionPreview,
  TransferRequest,
  UnfamiliarAddress,
  ValidatedRecipient,
  ValidatedTransfer,
  initialModel,
} from './model.js'
import {
  primaryWalletBalanceLabel,
  primaryWalletSuggestedTestTransferAmount,
  primaryWalletSuggestedTestTransferLabel,
  transferPreviewReadinessLabel,
} from './presentation.js'
import { SendNetworkSelection } from './sendNetworkSelection.js'
import { update } from './update.js'
import { LoadedWalletProfiles, WalletProfile } from './walletProfile.js'

const chain = ChainDescriptor.make({ chainId: 'solana', displayName: 'Solana' })
const devnet = NetworkDescriptor.make({
  networkId: 'solana:devnet',
  chainId: chain.chainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: ['Transfer'],
})
const mainnet = NetworkDescriptor.make({
  networkId: 'solana:mainnet-beta',
  chainId: chain.chainId,
  displayName: 'Solana Mainnet Beta',
  environment: 'Mainnet',
  capabilities: ['Transfer'],
})
const assetOf = (network: NetworkDescriptor) =>
  AssetDescriptor.make({
    assetId: `${network.networkId}:sol`,
    networkId: network.networkId,
    displayName: 'SOL',
    symbol: 'SOL',
    decimalPlaces: 9,
    kind: NativeAsset.make({}),
  })
const accountOf = (network: NetworkDescriptor) => ({
  accountId: `wallet-1:${network.networkId}`,
  chainId: chain.chainId,
  networkId: network.networkId,
  address: 'C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih',
  displayName: 'Solana',
})
const wallet = WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'Wallet 1',
  createdAt: 1,
  accounts: [accountOf(devnet), accountOf(mainnet)],
})
const balanceOf = (
  network: NetworkDescriptor,
  atomicUnits: '2000000000' | '1000000000' | '7000000000',
  observedAt: number,
) =>
  AccountBalance.make({
    accountId: accountOf(network).accountId,
    amount: AssetAmount.make({
      assetId: assetOf(network).assetId,
      atomicUnits,
      observedAt,
    }),
  })
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Live',
  chains: [chain],
  networks: [devnet, mainnet],
  assets: [assetOf(devnet), assetOf(mainnet)],
  accounts: [accountOf(devnet), accountOf(mainnet)],
  balanceSnapshot: BalanceSnapshot.make({
    observedAt: 1,
    balances: [
      balanceOf(devnet, '2000000000', 1),
      balanceOf(mainnet, '1000000000', 1),
    ],
  }),
  receivingInstructions: [],
})
const selectionOf = (
  networkMode: 'Devnet' | 'Live',
  network: NetworkDescriptor,
) =>
  SendNetworkSelection.make({
    networkMode,
    chainId: chain.chainId,
    networkId: network.networkId,
    accountId: accountOf(network).accountId,
    assetId: assetOf(network).assetId,
  })
const devnetModel: Model = {
  ...initialModel,
  walletProfileLoading: LoadedWalletProfiles.make({}),
  wallets: [wallet],
  walletNetworkMode: 'Devnet',
  portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
  maybeSendNetworkSelection: Option.some(selectionOf('Devnet', devnet)),
}

const switchedToMainnet = () =>
  update(devnetModel, SelectedWalletNetworkMode.make({ networkMode: 'Live' }))

describe('switching network', () => {
  it('asks for fresh balances at once', () => {
    const [mainnetModel, commands] = switchedToMainnet()

    expect(mainnetModel.walletNetworkMode).toBe('Live')
    expect(commands.map(command => command.name)).toContain(
      'RefreshWalletBalances',
    )
  })

  it('shows no number for the new network until its fresh balance lands', () => {
    const [mainnetModel] = switchedToMainnet()
    const [refreshedModel] = update(
      mainnetModel,
      SucceededRefreshWalletBalances.make({
        walletIds: [wallet.walletId],
        balanceSnapshot: BalanceSnapshot.make({
          observedAt: 2,
          balances: [
            balanceOf(devnet, '2000000000', 2),
            balanceOf(mainnet, '7000000000', 2),
          ],
        }),
      }),
    )

    expect(primaryWalletBalanceLabel(mainnetModel)).toBe(
      'Checking the Solana Mainnet Beta balance…',
    )
    expect(primaryWalletBalanceLabel(refreshedModel)).toBe('7 SOL')
  })

  it('says the balance is unavailable when the refresh fails, never the old number', () => {
    const [mainnetModel] = switchedToMainnet()
    const [failedModel] = update(
      mainnetModel,
      FailedRefreshWalletBalances.make({
        walletIds: [wallet.walletId],
        failure: NetworkFailure.make({
          operation: 'RefreshBalances',
          code: 'Unavailable',
        }),
      }),
    )

    expect(primaryWalletBalanceLabel(failedModel)).toBe(
      'The Solana Mainnet Beta balance could not be read. Refresh to try again.',
    )
  })
})

describe('a host that heard of a new transaction', () => {
  it('asks for fresh balances and leaves the rest of the wallet alone', () => {
    const [refreshingModel, commands] = update(
      devnetModel,
      RequestedBalanceRefresh.make({}),
    )

    expect(commands.map(command => command.name)).toEqual([
      'RefreshWalletBalances',
    ])
    expect(refreshingModel.portfolio).toEqual(devnetModel.portfolio)
    expect(refreshingModel.transaction).toEqual(devnetModel.transaction)
    expect(refreshingModel.transferAmount).toEqual(devnetModel.transferAmount)
    expect(refreshingModel.balanceFreshness._tag).toBe('RefreshingBalances')
  })

  it('asks for nothing before there is a portfolio to refresh', () => {
    const [waitingModel, commands] = update(
      initialModel,
      RequestedBalanceRefresh.make({}),
    )

    expect(commands).toEqual([])
    expect(waitingModel).toEqual(initialModel)
  })
})

describe('the small test amount', () => {
  it('is offered on a test network', () => {
    expect(
      Option.isSome(primaryWalletSuggestedTestTransferAmount(devnetModel)),
    ).toBe(true)
    expect(
      Option.isSome(primaryWalletSuggestedTestTransferLabel(devnetModel)),
    ).toBe(true)
    expect(transferPreviewReadinessLabel(devnetModel)).toBe(
      'Enter an amount or use the small test amount.',
    )
  })

  it('is never offered on Mainnet, where nothing is a test', () => {
    const [mainnetModel] = switchedToMainnet()
    const [refreshedModel] = update(
      mainnetModel,
      SucceededRefreshWalletBalances.make({
        walletIds: [wallet.walletId],
        balanceSnapshot: BalanceSnapshot.make({
          observedAt: 2,
          balances: [
            balanceOf(devnet, '2000000000', 2),
            balanceOf(mainnet, '7000000000', 2),
          ],
        }),
      }),
    )
    expect(primaryWalletSuggestedTestTransferAmount(refreshedModel)).toEqual(
      Option.none(),
    )
    expect(primaryWalletSuggestedTestTransferLabel(refreshedModel)).toEqual(
      Option.none(),
    )
    expect(transferPreviewReadinessLabel(refreshedModel)).toBe(
      'Enter an amount.',
    )
  })
})

describe('a pasted payment link', () => {
  const recipient = 'C5DLCjAX2UGrVDvoz8M4TYBCWSyUL9451GzG62SfQuih'
  const mainnetModel: Model = {
    ...devnetModel,
    walletNetworkMode: 'Live',
    maybeSendNetworkSelection: Option.some(selectionOf('Live', mainnet)),
  }
  const paste = (model: Model, query: string) =>
    update(
      model,
      ChangedTransferRecipient.make({ value: `solana:${recipient}${query}` }),
    )[0]

  it('is refused when it names another network, and changes no amount', () => {
    const pasted = paste(mainnetModel, '?amount=1&cluster=devnet')
    expect(pasted.transferRecipient._tag).toBe('InvalidTransferRecipient')
    expect(pasted.transferAmount).toEqual(mainnetModel.transferAmount)
  })

  it('is refused when its network is one this wallet does not know', () => {
    expect(
      paste(devnetModel, '?cluster=somewhere').transferRecipient._tag,
    ).toBe('InvalidTransferRecipient')
  })

  it('fills the send when it names the selected network', () => {
    const onDevnet = paste(devnetModel, '?amount=1&cluster=devnet')
    expect(onDevnet.transferRecipient._tag).not.toBe('InvalidTransferRecipient')
    expect(onDevnet.transferAmount._tag).toBe('ValidTransferAmount')
    const onMainnet = paste(mainnetModel, '?amount=1&cluster=mainnet-beta')
    expect(onMainnet.transferRecipient._tag).not.toBe(
      'InvalidTransferRecipient',
    )
  })

  it('fills the send when it names no network', () => {
    expect(paste(mainnetModel, '?amount=1').transferRecipient._tag).not.toBe(
      'InvalidTransferRecipient',
    )
  })
})

describe('a send in flight', () => {
  const preview = TransactionPreview.make({
    previewId: 'preview-1',
    transfer: ValidatedTransfer.make({
      request: TransferRequest.make({
        transferId: 'transfer-1',
        accountId: accountOf(devnet).accountId,
        assetId: assetOf(devnet).assetId,
        destinationAddress: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
        atomicUnits: '1000',
        maybeMessage: Option.none(),
      }),
      recipient: ValidatedRecipient.make({
        networkId: devnet.networkId,
        address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
        normalizedAddress: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
        displayAddress: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      }),
    }),
    estimatedFee: AssetAmount.make({
      assetId: assetOf(devnet).assetId,
      atomicUnits: '5000',
      observedAt: 1,
    }),
    resultingBalance: AssetAmount.make({
      assetId: assetOf(devnet).assetId,
      atomicUnits: '1999994000',
      observedAt: 1,
    }),
    expiresAt: 2,
    recipientFamiliarity: UnfamiliarAddress.make({}),
    recipientHistory: FirstTransactionWithRecipient.make({}),
  })
  const sendingModel: Model = {
    ...devnetModel,
    transaction: SubmittingTransaction.make({ preview }),
  }

  it('keeps its network until it finishes', () => {
    const [modeModel, modeCommands] = update(
      sendingModel,
      SelectedWalletNetworkMode.make({ networkMode: 'Live' }),
    )
    const [railModel, railCommands] = update(
      sendingModel,
      SelectedSendNetwork.make({ selection: selectionOf('Live', mainnet) }),
    )

    expect(modeModel).toBe(sendingModel)
    expect(modeCommands).toHaveLength(0)
    expect(railModel).toBe(sendingModel)
    expect(railCommands).toHaveLength(0)
  })
})

describe('a host without the current mode', () => {
  it('opens in the first mode it has networks for, so the screen is never an empty Testnet', () => {
    const requestId = 'portfolio-1'
    const loading: Model = {
      ...initialModel,
      walletProfileLoading: LoadedWalletProfiles.make({}),
      wallets: [wallet],
      walletNetworkMode: 'Testnet',
      portfolio: LoadingPortfolio.make({ requestId }),
    }

    const [loaded] = update(
      loading,
      SucceededLoadWallet.make({ requestId, portfolio }),
    )

    expect(loaded.walletNetworkMode).toBe('Devnet')
    expect(
      Option.map(loaded.maybeSendNetworkSelection, ({ networkId }) => networkId),
    ).toEqual(Option.some('solana:devnet'))
  })

  it('keeps the current mode when the host has networks for it', () => {
    const requestId = 'portfolio-2'
    const loading: Model = {
      ...initialModel,
      walletProfileLoading: LoadedWalletProfiles.make({}),
      wallets: [wallet],
      walletNetworkMode: 'Live',
      portfolio: LoadingPortfolio.make({ requestId }),
    }

    const [loaded] = update(
      loading,
      SucceededLoadWallet.make({ requestId, portfolio }),
    )

    expect(loaded.walletNetworkMode).toBe('Live')
  })
})
