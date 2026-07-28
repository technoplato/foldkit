import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  NativeAsset,
  NetworkDescriptor,
} from './currency.js'
import {
  AccountBalance,
  BalanceSnapshot,
  PortfolioSnapshot,
  WalletAccount,
} from './model.js'
import {
  availableSendNetworkSelections,
  nextSendNetworkSelection,
  selectSendNetworkForMode,
} from './sendNetworkSelection.js'

const chainIds = ['bitcoin', 'ethereum', 'solana', 'sui']
const chains = Array.map(chainIds, chainId =>
  ChainDescriptor.make({ chainId, displayName: chainId }),
)
const networks = Array.flatMap(chains, chain => [
  NetworkDescriptor.make({
    networkId: `${chain.chainId}:devnet`,
    chainId: chain.chainId,
    displayName: `${chain.displayName} Devnet`,
    environment: 'Development',
    capabilities: ['Transfer'],
  }),
  NetworkDescriptor.make({
    networkId: `${chain.chainId}:testnet`,
    chainId: chain.chainId,
    displayName: `${chain.displayName} Testnet`,
    environment: 'Testnet',
    capabilities: ['Transfer'],
  }),
])
const assets = Array.map(networks, network =>
  AssetDescriptor.make({
    assetId: `${network.networkId}:native`,
    networkId: network.networkId,
    displayName: `${network.displayName} native asset`,
    symbol: network.chainId,
    decimalPlaces: 9,
    kind: NativeAsset.make({}),
  }),
)
const accounts = Array.map(networks, network =>
  WalletAccount.make({
    accountId: `${network.networkId}:account`,
    networkId: network.networkId,
    address: `${network.networkId}:address`,
    displayName: `${network.displayName} account`,
  }),
)
const balances = Array.map(accounts, account => {
  const asset = Option.getOrThrow(
    Array.findFirst(
      assets,
      candidate => candidate.networkId === account.networkId,
    ),
  )
  return AccountBalance.make({
    accountId: account.accountId,
    amount: AssetAmount.make({
      assetId: asset.assetId,
      atomicUnits: '1000000000',
      observedAt: 1,
    }),
  })
})
const simulatedPortfolioFixture = PortfolioSnapshot.make({
  chains,
  networks,
  assets,
  accounts,
  balanceSnapshot: BalanceSnapshot.make({ observedAt: 1, balances }),
  receivingInstructions: [],
})

describe('send network selection', () => {
  it('projects all four chains in each global network mode', () => {
    expect(
      Array.map(
        availableSendNetworkSelections(simulatedPortfolioFixture, 'Devnet'),
        selection => selection.chainId,
      ),
    ).toEqual(['bitcoin', 'ethereum', 'solana', 'sui'])
    expect(
      Array.map(
        availableSendNetworkSelections(simulatedPortfolioFixture, 'Testnet'),
        selection => selection.chainId,
      ),
    ).toEqual(['bitcoin', 'ethereum', 'solana', 'sui'])
  })

  it('preserves the selected chain when every wallet changes mode', () => {
    const devnetSelections = availableSendNetworkSelections(
      simulatedPortfolioFixture,
      'Devnet',
    )
    const maybeSui = Array.findFirst(
      devnetSelections,
      selection => selection.chainId === 'sui',
    )
    if (Option.isNone(maybeSui)) {
      throw new Error('Expected a Sui Devnet send selection')
    }

    const nextSelection = selectSendNetworkForMode(
      simulatedPortfolioFixture,
      maybeSui,
      'Testnet',
    )

    expect(Option.getOrThrow(nextSelection)).toMatchObject({
      networkMode: 'Testnet',
      chainId: 'sui',
      networkId: 'sui:testnet',
    })
  })

  it('cycles across every sendable chain without changing mode', () => {
    const first = Option.getOrThrow(
      selectSendNetworkForMode(
        simulatedPortfolioFixture,
        Option.none(),
        'Testnet',
      ),
    )
    const second = Option.getOrThrow(
      nextSendNetworkSelection(simulatedPortfolioFixture, first),
    )

    expect(first.chainId).toBe('ethereum')
    expect(second.networkMode).toBe('Testnet')
    expect(second.chainId).not.toBe(first.chainId)
  })
})
