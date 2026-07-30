import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AssetAmount,
  AssetDescriptor,
  ChainDescriptor,
  IssuedAsset,
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
  SendNetworkSelection,
  availableSendNetworkSelections,
  nextSendNetworkSelection,
  selectSendNetworkForMode,
  sendNetworkSelectionIdentity,
  sendNetworkSelectionLabel,
} from './sendNetworkSelection.js'
import { WalletProfile } from './walletProfile.js'

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
  NetworkDescriptor.make({
    networkId: `${chain.chainId}:mainnet`,
    chainId: chain.chainId,
    displayName: `${chain.displayName} Mainnet`,
    environment: 'Mainnet',
    capabilities: ['Transfer'],
  }),
])
const nativeAssets = Array.map(networks, network =>
  AssetDescriptor.make({
    assetId: `${network.networkId}:native`,
    networkId: network.networkId,
    displayName: `${network.displayName} native asset`,
    symbol: network.chainId,
    decimalPlaces: 9,
    kind: NativeAsset.make({}),
  }),
)
const issuedAsset = AssetDescriptor.make({
  assetId: 'ethereum:testnet:usdc',
  networkId: 'ethereum:testnet',
  displayName: 'Test USDC',
  symbol: 'USDC',
  decimalPlaces: 6,
  kind: IssuedAsset.make({ reference: 'usdc' }),
})
const assets = [...nativeAssets, issuedAsset]
const accounts = Array.map(networks, network =>
  WalletAccount.make({
    accountId: `${network.networkId}:account`,
    chainId: network.chainId,
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
  dataSource: 'Fixture',
  chains,
  networks,
  assets,
  accounts,
  balanceSnapshot: BalanceSnapshot.make({ observedAt: 1, balances }),
  receivingInstructions: [],
})
const wallets = [
  WalletProfile.make({
    walletId: 'wallet-1',
    displayName: 'Wallet 1',
    createdAt: 1,
    accounts,
  }),
]

describe('send network selection', () => {
  it('projects all four chains in each global network mode', () => {
    expect(
      Array.dedupe(
        Array.map(
          availableSendNetworkSelections(simulatedPortfolioFixture, 'Devnet'),
          selection => selection.chainId,
        ),
      ),
    ).toEqual(['bitcoin', 'ethereum', 'solana', 'sui'])
    expect(
      Array.dedupe(
        Array.map(
          availableSendNetworkSelections(simulatedPortfolioFixture, 'Testnet'),
          selection => selection.chainId,
        ),
      ),
    ).toEqual(['bitcoin', 'ethereum', 'solana', 'sui'])
    expect(
      Array.map(
        availableSendNetworkSelections(simulatedPortfolioFixture, 'Live'),
        selection => selection.chainId,
      ),
    ).toEqual(['bitcoin', 'ethereum', 'solana', 'sui'])
  })

  it('includes issued assets without requiring a balance placeholder', () => {
    expect(
      Array.some(
        availableSendNetworkSelections(simulatedPortfolioFixture, 'Testnet'),
        selection => selection.assetId === issuedAsset.assetId,
      ),
    ).toBe(true)
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
      wallets,
      maybeSui,
      'Testnet',
    )

    expect(Option.getOrThrow(nextSelection)).toMatchObject({
      networkMode: 'Testnet',
      chainId: 'sui',
      networkId: 'sui:testnet',
    })
  })

  it('cycles across every sendable asset without changing mode', () => {
    const first = Option.getOrThrow(
      selectSendNetworkForMode(
        simulatedPortfolioFixture,
        wallets,
        Option.none(),
        'Testnet',
      ),
    )
    const second = Option.getOrThrow(
      nextSendNetworkSelection(simulatedPortfolioFixture, first),
    )

    expect(first.chainId).toBe('ethereum')
    expect(second.networkMode).toBe('Testnet')
    expect(second.assetId).not.toBe(first.assetId)
  })

  it('preserves and labels the selected Wallet across network modes', () => {
    const walletTwoAccounts = Array.map(accounts, account =>
      WalletAccount.make({
        ...account,
        accountId: `wallet-2:${account.accountId}`,
        address: `wallet-2:${account.address}`,
      }),
    )
    const walletTwo = WalletProfile.make({
      walletId: 'wallet-2',
      displayName: 'Wallet 2',
      createdAt: 2,
      accounts: walletTwoAccounts,
    })
    const allWallets = [...wallets, walletTwo]
    const multiWalletPortfolio = PortfolioSnapshot.make({
      ...simulatedPortfolioFixture,
      accounts: [...accounts, ...walletTwoAccounts],
    })
    const maybeWalletTwoSuiDevnet = Array.findFirst(
      availableSendNetworkSelections(multiWalletPortfolio, 'Devnet'),
      selection =>
        selection.chainId === 'sui' &&
        selection.accountId.startsWith('wallet-2:'),
    )
    if (Option.isNone(maybeWalletTwoSuiDevnet)) {
      throw new Error('Expected Wallet 2 Sui Devnet selection')
    }

    const testnetSelection = Option.getOrThrow(
      selectSendNetworkForMode(
        multiWalletPortfolio,
        allWallets,
        maybeWalletTwoSuiDevnet,
        'Testnet',
      ),
    )
    const liveSelection = Option.getOrThrow(
      selectSendNetworkForMode(
        multiWalletPortfolio,
        allWallets,
        Option.some(testnetSelection),
        'Live',
      ),
    )
    const devnetSelection = Option.getOrThrow(
      selectSendNetworkForMode(
        multiWalletPortfolio,
        allWallets,
        Option.some(liveSelection),
        'Devnet',
      ),
    )

    expect(testnetSelection).toMatchObject({
      networkMode: 'Testnet',
      chainId: 'sui',
      networkId: 'sui:testnet',
    })
    expect(testnetSelection.accountId.startsWith('wallet-2:')).toBe(true)
    expect(liveSelection).toMatchObject({
      networkMode: 'Live',
      chainId: 'sui',
      networkId: 'sui:mainnet',
    })
    expect(liveSelection.accountId.startsWith('wallet-2:')).toBe(true)
    expect(devnetSelection).toMatchObject({
      networkMode: 'Devnet',
      chainId: 'sui',
      networkId: 'sui:devnet',
    })
    expect(devnetSelection.accountId.startsWith('wallet-2:')).toBe(true)
    expect(
      sendNetworkSelectionLabel(
        multiWalletPortfolio,
        allWallets,
        testnetSelection,
      ),
    ).toBe('Wallet 2 · sui · sui Testnet')

    const partialPortfolio = PortfolioSnapshot.make({
      ...multiWalletPortfolio,
      accounts: Array.filter(
        multiWalletPortfolio.accounts,
        account => account.accountId !== testnetSelection.accountId,
      ),
    })
    const sameWalletFallback = Option.getOrThrow(
      selectSendNetworkForMode(
        partialPortfolio,
        allWallets,
        maybeWalletTwoSuiDevnet,
        'Testnet',
      ),
    )

    expect(sameWalletFallback.accountId.startsWith('wallet-2:')).toBe(true)
    expect(sameWalletFallback.chainId).toBe('bitcoin')
  })

  it('encodes delimiter-bearing ids without selector collisions', () => {
    const first = SendNetworkSelection.make({
      networkMode: 'Testnet',
      chainId: 'chain',
      networkId: 'a:b',
      accountId: 'c',
      assetId: 'd',
    })
    const second = SendNetworkSelection.make({
      networkMode: 'Testnet',
      chainId: 'chain',
      networkId: 'a',
      accountId: 'b:c',
      assetId: 'd',
    })

    expect(sendNetworkSelectionIdentity(first)).not.toBe(
      sendNetworkSelectionIdentity(second),
    )
    expect(sendNetworkSelectionIdentity(first)).toContain('%3A')
  })
})
