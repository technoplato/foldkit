import { describe, expect, it } from 'vitest'

import { AdapterTestFundingMethod, NetworkDescriptor } from './currency.js'
import {
  WalletProfile,
  WalletProfileAccount,
  activeWalletAccounts,
  nextWalletCreationRequest,
  toggledWalletNetworkMode,
} from './walletProfile.js'

const networks = [
  NetworkDescriptor.make({
    networkId: 'solana:devnet',
    chainId: 'solana',
    displayName: 'Solana Devnet',
    environment: 'Development',
    capabilities: ['Transfer', 'TestFunding'],
    testFundingMethod: AdapterTestFundingMethod.make({}),
  }),
  NetworkDescriptor.make({
    networkId: 'solana:testnet',
    chainId: 'solana',
    displayName: 'Solana Testnet',
    environment: 'Testnet',
    capabilities: ['Transfer', 'TestFunding'],
    testFundingMethod: AdapterTestFundingMethod.make({}),
  }),
  NetworkDescriptor.make({
    networkId: 'solana:mainnet',
    chainId: 'solana',
    displayName: 'Solana Mainnet',
    environment: 'Mainnet',
    capabilities: ['Transfer'],
  }),
]

const wallet = WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'Wallet 1',
  createdAt: 1_722_000_000_000,
  accounts: networks.map(network =>
    WalletProfileAccount.make({
      accountId: `wallet-1:${network.networkId}`,
      chainId: network.chainId,
      networkId: network.networkId,
      address: `${network.networkId}:address`,
      displayName: network.displayName,
    }),
  ),
})

describe('Wallet profile projection', () => {
  it('projects exact accounts through all three data-driven modes', () => {
    expect(activeWalletAccounts(wallet, networks, 'Devnet')).toMatchObject([
      { networkId: 'solana:devnet', networkName: 'Solana Devnet' },
    ])
    expect(activeWalletAccounts(wallet, networks, 'Testnet')).toMatchObject([
      { networkId: 'solana:testnet', networkName: 'Solana Testnet' },
    ])
    expect(activeWalletAccounts(wallet, networks, 'Live')).toMatchObject([
      { networkId: 'solana:mainnet', networkName: 'Solana Mainnet' },
    ])
    expect(toggledWalletNetworkMode('Testnet')).toBe('Live')
  })

  it('includes loaded networks in the next idempotent creation request', () => {
    expect(nextWalletCreationRequest([], networks)).toStrictEqual({
      requestId: 'wallet-1',
      displayName: 'Wallet 1',
      networks,
    })
    expect(nextWalletCreationRequest([wallet], networks)).toStrictEqual({
      requestId: 'wallet-2',
      displayName: 'Wallet 2',
      networks,
    })
  })
})
