import { describe, expect, it } from 'vitest'

import {
  BitcoinAddressSet,
  BitcoinWalletAccount,
  EthereumWalletAccount,
  SolanaWalletAccount,
  SuiWalletAccount,
  WalletProfile,
  activeWalletAccounts,
  nextWalletCreationRequest,
} from './walletProfile.js'

const wallet = WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'Wallet 1',
  createdAt: 1_722_000_000_000,
  accounts: {
    bitcoin: BitcoinWalletAccount.make({
      accountId: 'wallet-1:bitcoin',
      devnetAddresses: BitcoinAddressSet.make({
        nativeSegwitAddress: 'bcrt1native',
        taprootAddress: 'bcrt1taproot',
      }),
      testnetAddresses: BitcoinAddressSet.make({
        nativeSegwitAddress: 'tb1native',
        taprootAddress: 'tb1taproot',
      }),
      preferredAddressType: 'NativeSegwit',
    }),
    ethereum: EthereumWalletAccount.make({
      accountId: 'wallet-1:ethereum',
      address: '0x1111111111111111111111111111111111111111',
    }),
    solana: SolanaWalletAccount.make({
      accountId: 'wallet-1:solana',
      address: 'solana-address',
    }),
    sui: SuiWalletAccount.make({
      accountId: 'wallet-1:sui',
      address: '0xsui',
    }),
  },
})

describe('Wallet profile projection', () => {
  it('projects all four accounts through one global network mode', () => {
    expect(activeWalletAccounts(wallet, 'Devnet')).toMatchObject([
      {
        chain: 'Bitcoin',
        networkName: 'Bitcoin Regtest',
        address: 'bcrt1native',
      },
      { chain: 'Ethereum', networkName: 'Ethereum Localnet' },
      { chain: 'Solana', networkName: 'Solana Devnet' },
      { chain: 'Sui', networkName: 'Sui Devnet' },
    ])
    expect(activeWalletAccounts(wallet, 'Testnet')).toMatchObject([
      {
        chain: 'Bitcoin',
        networkName: 'Bitcoin Testnet',
        address: 'tb1native',
      },
      { chain: 'Ethereum', networkName: 'Ethereum Sepolia' },
      { chain: 'Solana', networkName: 'Solana Testnet' },
      { chain: 'Sui', networkName: 'Sui Testnet' },
    ])
  })

  it('creates a stable next request from the public Wallet list', () => {
    expect(nextWalletCreationRequest([])).toStrictEqual({
      requestId: 'wallet-1',
      displayName: 'Wallet 1',
    })
    expect(nextWalletCreationRequest([wallet])).toStrictEqual({
      requestId: 'wallet-2',
      displayName: 'Wallet 2',
    })
  })
})
