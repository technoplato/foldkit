import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  FailedCreateWallet,
  RequestedWalletCreation,
  SelectedWalletNetworkMode,
  SucceededCreateWallet,
} from './message.js'
import { initialModel } from './model.js'
import { restore, update } from './update.js'
import {
  BitcoinAddressSet,
  BitcoinWalletAccount,
  CreatingWallet,
  EthereumWalletAccount,
  FailedWalletCreation,
  ReadyToCreateWallet,
  SolanaWalletAccount,
  SuiWalletAccount,
  WalletCreationRequest,
  WalletProfile,
} from './walletProfile.js'

const request = WalletCreationRequest.make({
  requestId: 'wallet-1',
  displayName: 'Wallet 1',
})

const wallet = WalletProfile.make({
  walletId: request.requestId,
  displayName: request.displayName,
  createdAt: 1,
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

const commandNames = (
  commands: ReadonlyArray<Readonly<{ name: string }>>,
): ReadonlyArray<string> => Array.map(commands, command => command.name)

describe('wallet creation update', () => {
  it('creates one complete Wallet and switches every chain together', () => {
    const [creatingModel, commands] = update(
      initialModel,
      RequestedWalletCreation.make({}),
    )

    expect(creatingModel.walletCreation).toStrictEqual(
      CreatingWallet.make({ request }),
    )
    expect(commandNames(commands)).toStrictEqual(['CreateWallet'])

    const [createdModel] = update(
      creatingModel,
      SucceededCreateWallet.make({ request, wallet }),
    )
    const [devnetModel] = update(
      createdModel,
      SelectedWalletNetworkMode.make({ networkMode: 'Devnet' }),
    )

    expect(createdModel.wallets).toStrictEqual([wallet])
    expect(createdModel.walletCreation).toStrictEqual(
      ReadyToCreateWallet.make({}),
    )
    expect(devnetModel.walletNetworkMode).toBe('Devnet')
  })

  it('keeps failure and stale completion states finite', () => {
    const [creatingModel] = update(
      initialModel,
      RequestedWalletCreation.make({}),
    )
    const [failedModel] = update(
      creatingModel,
      FailedCreateWallet.make({ request, code: 'Unavailable' }),
    )
    const staleRequest = WalletCreationRequest.make({
      requestId: 'wallet-stale',
      displayName: 'Stale Wallet',
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

  it('restarts wallet creation alongside the initial portfolio load', () => {
    const creatingModel = {
      ...initialModel,
      walletCreation: CreatingWallet.make({ request }),
    }
    const [, commands] = restore(creatingModel)

    expect(commandNames(commands)).toStrictEqual(['CreateWallet', 'LoadWallet'])
  })
})
