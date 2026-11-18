import { Array as Array_, Effect, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  WalletCreationRequest,
  type WalletProfile,
  WalletVault,
} from 'wallet-core-example'
import { liveWalletNetworkDescriptors } from 'wallet-live-client-example'

import { hex } from '@scure/base'

import {
  LocalWalletTransferInternal,
  type WalletVaultStorage,
  WalletVaultStorageCustody,
  localWalletVaultOwnerKey,
  makeLocalWalletVault,
  makePersistentLocalWalletVault,
} from './localWalletVault.js'

const bothKindsOfMoney: ReadonlyArray<string> = [
  'solana:devnet',
  'solana:mainnet-beta',
  'ethereum:sepolia',
  'ethereum:mainnet',
]

const request = WalletCreationRequest.make({
  requestId: 'wallet-1',
  displayName: 'Wallet 1',
  networks: Array_.filter(liveWalletNetworkDescriptors, network =>
    Array_.contains(bothKindsOfMoney, network.networkId),
  ),
})

const countingRandomBytes = () => {
  let nextByte = 1
  return (byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount).fill(nextByte)
    nextByte += 1
    return bytes
  }
}

const addressOn = (wallet: WalletProfile, networkId: string): string =>
  Option.getOrThrow(
    Array_.findFirst(
      wallet.accounts,
      account => account.networkId === networkId,
    ),
  ).address

describe('Mainnet keys', () => {
  it('are never the keys of a test network, so a test send cannot move real money', async () => {
    const wallet = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.createWallet(request)
      }).pipe(Effect.provide(makeLocalWalletVault(countingRandomBytes()))),
    )

    expect(addressOn(wallet, 'solana:devnet')).not.toBe(
      addressOn(wallet, 'solana:mainnet-beta'),
    )
    expect(addressOn(wallet, 'ethereum:sepolia')).not.toBe(
      addressOn(wallet, 'ethereum:mainnet'),
    )
  })

  it('stay as they were in a wallet saved with one key per chain', async () => {
    const savedRecord = S.encodeSync(
      LocalWalletTransferInternal.StoredWalletRecordJson,
    )(
      LocalWalletTransferInternal.StoredWalletRecord.make({
        version: 2,
        request,
        createdAt: 1,
        keys: Array_.map(['ethereum', 'solana'], (chainId, index) =>
          LocalWalletTransferInternal.StoredWalletChainKey.make({
            chainId,
            privateKeyHex: hex.encode(new Uint8Array(32).fill(index + 1)),
          }),
        ),
      }),
    )
    const storage: WalletVaultStorage = {
      ownerKey: localWalletVaultOwnerKey,
      custody: WalletVaultStorageCustody.make('ProcessLocal'),
      loadRecords: Effect.succeed([savedRecord]),
      prepareRecord: (_walletId, createRecord) => Effect.sync(createRecord),
      commitPreparedRecord: () => Effect.void,
    }

    const [wallet] = await Effect.runPromise(
      Effect.gen(function* () {
        const vault = yield* WalletVault
        return yield* vault.loadWallets
      }).pipe(
        Effect.provide(
          makePersistentLocalWalletVault(countingRandomBytes(), storage),
        ),
      ),
    )

    expect(wallet).toBeDefined()
    if (wallet !== undefined) {
      expect(addressOn(wallet, 'solana:devnet')).toBe(
        addressOn(wallet, 'solana:mainnet-beta'),
      )
    }
  })
})
