import { Array as Array_, Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type BrowserWalletVaultDatabase,
  makeBrowserWalletVaultStorage,
} from './webWalletVault.js'

const makeTestDatabase = (): Readonly<{
  database: BrowserWalletVaultDatabase
  records: Map<string, string>
}> => {
  let encryptionKey: CryptoKey | undefined
  const records = new Map<string, string>()
  return {
    records,
    database: {
      loadEncryptionKey: () => Promise.resolve(encryptionKey),
      addEncryptionKey: key => {
        if (encryptionKey === undefined) {
          encryptionKey = key
          return Promise.resolve(true)
        } else {
          return Promise.resolve(false)
        }
      },
      loadEncryptedRecords: () =>
        Promise.resolve(Array_.fromIterable(records.values())),
      saveEncryptedRecord: (walletId, record) => {
        records.set(walletId, record)
        return Promise.resolve()
      },
    },
  }
}

describe('browser Wallet vault storage', () => {
  it('encrypts records at rest and decrypts them after reconstruction', async () => {
    const testDatabase = makeTestDatabase()
    const firstStorage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )

    await Effect.runPromise(
      firstStorage.saveRecord('wallet-1', 'private-wallet-record'),
    )

    const encryptedRecord = testDatabase.records.get('wallet-1')
    expect(encryptedRecord).not.toContain('private-wallet-record')

    const reconstructedStorage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )
    const restored = await Effect.runPromise(reconstructedStorage.loadRecords)

    expect(restored).toStrictEqual(['private-wallet-record'])
  })

  it('reports tampered ciphertext as invalid key material', async () => {
    const testDatabase = makeTestDatabase()
    const storage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )
    await Effect.runPromise(
      storage.saveRecord('wallet-1', 'private-wallet-record'),
    )
    testDatabase.records.set('wallet-1', 'tampered')

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidKeyMaterial')
  })
})
