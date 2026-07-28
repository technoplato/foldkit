import { Array as Array_, Effect, Order } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type ExpoSecureStoreClient,
  makeExpoWalletVaultStorage,
} from './walletVaultStorage'

const makeTestSecureStore = (): Readonly<{
  records: Map<string, string>
  secureStore: ExpoSecureStoreClient
}> => {
  const records = new Map<string, string>()
  return {
    records,
    secureStore: {
      isAvailable: () => Promise.resolve(true),
      load: key => Promise.resolve(records.get(key) ?? null),
      save: (key, value) => {
        records.set(key, value)
        return Promise.resolve()
      },
    },
  }
}

describe('Expo Wallet vault storage', () => {
  it('restores separately persisted Wallet records', async () => {
    const testSecureStore = makeTestSecureStore()
    const firstStorage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    await Effect.runPromise(
      Effect.all([
        firstStorage.saveRecord('wallet-1', 'record-1'),
        firstStorage.saveRecord('wallet-2', 'record-2'),
      ]),
    )

    const reconstructedStorage = makeExpoWalletVaultStorage(
      testSecureStore.secureStore,
    )
    const restored = await Effect.runPromise(reconstructedStorage.loadRecords)

    expect(Array_.sort(restored, Order.String)).toStrictEqual([
      'record-1',
      'record-2',
    ])
  })

  it('reports an indexed record that is missing from secure storage', async () => {
    const testSecureStore = makeTestSecureStore()
    const storage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    await Effect.runPromise(storage.saveRecord('wallet-1', 'record-1'))
    testSecureStore.records.delete('foldkit.wallet.record.v1.wallet-1')

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidKeyMaterial')
  })
})
