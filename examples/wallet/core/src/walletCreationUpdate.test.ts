import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AdapterTestFundingMethod,
  ChainDescriptor,
  NetworkDescriptor,
} from './currency.js'
import {
  FailedCreateWallet,
  FailedLoadWalletProfiles,
  RequestedWalletCreation,
  RequestedWalletProfilesReload,
  SucceededCreateWallet,
  SucceededLoadWalletProfiles,
} from './message.js'
import {
  BalanceSnapshot,
  LoadedPortfolio,
  LoadingPortfolio,
  PortfolioSnapshot,
  initialModel,
} from './model.js'
import { restore, update } from './update.js'
import {
  CreatingWallet,
  FailedWalletCreation,
  LoadedWalletProfiles,
  ReadyToCreateWallet,
  WalletCreationRequest,
  WalletProfile,
  WalletProfileAccount,
} from './walletProfile.js'

const chain = ChainDescriptor.make({
  chainId: 'solana',
  displayName: 'Solana',
})
const network = NetworkDescriptor.make({
  networkId: 'solana:devnet',
  chainId: chain.chainId,
  displayName: 'Solana Devnet',
  environment: 'Development',
  capabilities: ['Transfer', 'TestFunding'],
  testFundingMethod: AdapterTestFundingMethod.make({}),
})
const portfolio = PortfolioSnapshot.make({
  dataSource: 'Live',
  chains: [chain],
  networks: [network],
  assets: [],
  accounts: [],
  balanceSnapshot: BalanceSnapshot.make({ observedAt: 1, balances: [] }),
  receivingInstructions: [],
})
const readyModel = {
  ...initialModel,
  walletProfileLoading: LoadedWalletProfiles.make({}),
  portfolio: LoadedPortfolio.make({ snapshot: portfolio }),
}

const request = WalletCreationRequest.make({
  requestId: 'wallet-1',
  displayName: 'Wallet 1',
  networks: [network],
})

const wallet = WalletProfile.make({
  walletId: request.requestId,
  displayName: request.displayName,
  createdAt: 1,
  accounts: [
    WalletProfileAccount.make({
      accountId: 'wallet-1:solana:devnet',
      chainId: network.chainId,
      networkId: network.networkId,
      address: 'solana-address',
      displayName: 'Solana Devnet account',
    }),
  ],
})

const commandNames = (
  commands: ReadonlyArray<Readonly<{ name: string }>>,
): ReadonlyArray<string> => Array.map(commands, command => command.name)

describe('wallet creation update', () => {
  it('loads the portfolio only after secure profiles are restored', () => {
    const [loadedModel, commands] = update(
      initialModel,
      SucceededLoadWalletProfiles.make({ wallets: [wallet] }),
    )
    const [failedModel] = update(
      initialModel,
      FailedLoadWalletProfiles.make({ code: 'Unavailable' }),
    )
    const [retryingModel, retryCommands] = update(
      failedModel,
      RequestedWalletProfilesReload.make({}),
    )

    expect(loadedModel.wallets).toStrictEqual([wallet])
    expect(loadedModel.portfolio).toStrictEqual(
      LoadingPortfolio.make({ requestId: 'portfolio-1' }),
    )
    expect(loadedModel.nextPortfolioRequestNumber).toBe(2)
    expect(commandNames(commands)).toStrictEqual(['LoadWallet'])
    expect(failedModel.walletProfileLoading._tag).toBe(
      'FailedWalletProfileLoading',
    )
    expect(retryingModel.walletProfileLoading._tag).toBe(
      'LoadingWalletProfiles',
    )
    expect(commandNames(retryCommands)).toStrictEqual(['LoadWalletProfiles'])
  })

  it('creates exact network accounts and refreshes with the updated profiles', () => {
    const [creatingModel, commands] = update(
      readyModel,
      RequestedWalletCreation.make({}),
    )

    expect(creatingModel.walletCreation).toStrictEqual(
      CreatingWallet.make({ request }),
    )
    expect(commandNames(commands)).toStrictEqual(['CreateWallet'])

    const [createdModel, refreshCommands] = update(
      creatingModel,
      SucceededCreateWallet.make({ request, wallet }),
    )

    expect(createdModel.wallets).toStrictEqual([wallet])
    expect(createdModel.walletCreation).toStrictEqual(
      ReadyToCreateWallet.make({}),
    )
    expect(createdModel.portfolio).toStrictEqual(
      LoadingPortfolio.make({ requestId: 'portfolio-1' }),
    )
    expect(createdModel.nextPortfolioRequestNumber).toBe(2)
    expect(commandNames(refreshCommands)).toStrictEqual(['LoadWallet'])
  })

  it('keeps failure and stale completion states finite', () => {
    const [creatingModel] = update(readyModel, RequestedWalletCreation.make({}))
    const [failedModel] = update(
      creatingModel,
      FailedCreateWallet.make({ request, code: 'Unavailable' }),
    )
    const staleRequest = WalletCreationRequest.make({
      requestId: 'wallet-stale',
      displayName: 'Stale Wallet',
      networks: [network],
    })
    const [staleModel] = update(
      failedModel,
      SucceededCreateWallet.make({ request: staleRequest, wallet }),
    )

    expect(failedModel.walletCreation).toStrictEqual(
      FailedWalletCreation.make({ request, code: 'Unavailable' }),
    )
    expect(staleModel).toBe(failedModel)
  })

  it('restarts creation and portfolio loading from restored finite state', () => {
    const creatingModel = {
      ...readyModel,
      portfolio: LoadingPortfolio.make({ requestId: 'portfolio-restored' }),
      walletCreation: CreatingWallet.make({ request }),
    }
    const [, commands] = restore(creatingModel)

    expect(commandNames(commands)).toStrictEqual(['CreateWallet', 'LoadWallet'])
  })
})
