import { Array as Array_, Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  type WalletVaultOwnerKey,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
} from 'wallet-local-vault-example'

import {
  type BrowserWalletVaultDatabase,
  makeBrowserWalletVaultStorage,
} from './webWalletVault.js'

const LegacyEncryptedRecordJson = S.fromJsonString(
  S.Struct({
    version: S.Literal(1),
    initializationVector: S.Uint8ArrayFromBase64,
    ciphertext: S.Uint8ArrayFromBase64,
  }),
)
const legacyAdditionalData = new TextEncoder().encode('Foldkit Wallet Vault v1')

const makeTestDatabase = (
  ownerKey: WalletVaultOwnerKey = localWalletVaultOwnerKey,
): Readonly<{
  database: BrowserWalletVaultDatabase
  committedRecords: Map<string, string>
  preparedRecords: Map<string, string>
}> => {
  let encryptionKey: CryptoKey | undefined
  const committedRecords = new Map<string, string>()
  const preparedRecords = new Map<string, string>()
  return {
    committedRecords,
    preparedRecords,
    database: {
      ownerKey,
      loadEncryptionKey: () => Promise.resolve(encryptionKey),
      addEncryptionKey: key => {
        if (encryptionKey === undefined) {
          encryptionKey = key
          return Promise.resolve(true)
        } else {
          return Promise.resolve(false)
        }
      },
      loadCommittedEncryptedRecords: () =>
        Promise.resolve(
          Array_.map(
            Array_.fromIterable(committedRecords.entries()),
            ([walletId, record]) => ({ walletId, record }),
          ),
        ),
      loadPreparedEncryptedRecord: walletId =>
        Promise.resolve(
          committedRecords.get(walletId) ?? preparedRecords.get(walletId),
        ),
      addPreparedEncryptedRecord: (walletId, record) => {
        if (committedRecords.has(walletId) || preparedRecords.has(walletId)) {
          return Promise.resolve(false)
        } else {
          preparedRecords.set(walletId, record)
          return Promise.resolve(true)
        }
      },
      commitPreparedEncryptedRecord: (walletId, record) => {
        const existing =
          committedRecords.get(walletId) ?? preparedRecords.get(walletId)
        if (existing !== record) {
          return Promise.resolve(false)
        }
        committedRecords.set(walletId, record)
        preparedRecords.delete(walletId)
        return Promise.resolve(true)
      },
    },
  }
}

describe('browser Wallet vault storage', () => {
  it('keeps prepared encrypted records hidden until an exact commit', async () => {
    const testDatabase = makeTestDatabase()
    const firstStorage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )

    const preparedRecord = await Effect.runPromise(
      firstStorage.prepareRecord('wallet-1', () => 'private-wallet-record'),
    )

    const encryptedRecord = testDatabase.preparedRecords.get('wallet-1')
    expect(preparedRecord).toBe('private-wallet-record')
    expect(encryptedRecord).not.toContain('private-wallet-record')
    expect(JSON.parse(encryptedRecord ?? '{}')).toMatchObject({ version: 2 })
    expect(await Effect.runPromise(firstStorage.loadRecords)).toStrictEqual([])

    await Effect.runPromise(
      firstStorage.commitPreparedRecord('wallet-1', 'private-wallet-record'),
    )

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
      storage.prepareRecord('wallet-1', () => 'private-wallet-record'),
    )
    await Effect.runPromise(
      storage.commitPreparedRecord('wallet-1', 'private-wallet-record'),
    )
    testDatabase.committedRecords.set('wallet-1', 'tampered')

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidRecord')
  })

  it('preserves invalid database records as a permanent storage failure', async () => {
    const testDatabase = makeTestDatabase()
    const storage = makeBrowserWalletVaultStorage(
      {
        ...testDatabase.database,
        loadCommittedEncryptedRecords: () =>
          Promise.reject(
            new WalletVaultStorageError({ code: 'InvalidRecord' }),
          ),
      },
      globalThis.crypto,
    )

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidRecord')
  })

  it('recovers an orphan without rerunning record creation', async () => {
    const testDatabase = makeTestDatabase()
    const firstStorage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )
    await Effect.runPromise(
      firstStorage.prepareRecord('wallet-1', () => 'record-1'),
    )

    const reconstructedStorage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )
    let didRunCreateRecord = false
    const recovered = await Effect.runPromise(
      reconstructedStorage.prepareRecord('wallet-1', () => {
        didRunCreateRecord = true
        return 'record-2'
      }),
    )
    await Effect.runPromise(
      reconstructedStorage.commitPreparedRecord('wallet-1', recovered),
    )

    expect(didRunCreateRecord).toBe(false)
    expect(recovered).toBe('record-1')
    expect(
      await Effect.runPromise(reconstructedStorage.loadRecords),
    ).toStrictEqual(['record-1'])
  })

  it('binds each ciphertext to its exact owner and Wallet slot', async () => {
    const testDatabase = makeTestDatabase()
    const storage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )
    const first = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'record-1'),
    )
    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', first))
    const second = await Effect.runPromise(
      storage.prepareRecord('wallet-2', () => 'record-2'),
    )
    await Effect.runPromise(storage.commitPreparedRecord('wallet-2', second))
    const firstCiphertext = testDatabase.committedRecords.get('wallet-1')
    const secondCiphertext = testDatabase.committedRecords.get('wallet-2')
    if (firstCiphertext === undefined || secondCiphertext === undefined) {
      throw new Error('Expected committed Wallet ciphertexts')
    }
    testDatabase.committedRecords.set('wallet-1', secondCiphertext)
    testDatabase.committedRecords.set('wallet-2', firstCiphertext)

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidRecord')
  })

  it('rejects legacy ciphertext moved to a different Wallet slot', async () => {
    const testDatabase = makeTestDatabase()
    const storage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )
    const seed = await Effect.runPromise(
      storage.prepareRecord('seed-wallet', () => 'seed-record'),
    )
    await Effect.runPromise(storage.commitPreparedRecord('seed-wallet', seed))
    const key = await testDatabase.database.loadEncryptionKey()
    if (key === undefined) {
      throw new Error('Expected a persisted browser Wallet encryption key')
    }
    const legacyRecord = JSON.stringify({
      request: { requestId: 'wallet-1', displayName: 'Wallet 1' },
      createdAt: 1,
      bitcoinPrivateKey: '01'.repeat(32),
      ethereumPrivateKey: '02'.repeat(32),
      solanaPrivateKey: '03'.repeat(32),
      suiPrivateKey: '04'.repeat(32),
    })
    const initializationVector = new Uint8Array(12).fill(7)
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: initializationVector,
        additionalData: legacyAdditionalData,
      },
      key,
      new TextEncoder().encode(legacyRecord),
    )
    testDatabase.committedRecords.clear()
    testDatabase.committedRecords.set(
      'wallet-2',
      S.encodeSync(LegacyEncryptedRecordJson)({
        version: 1,
        initializationVector,
        ciphertext: new Uint8Array(ciphertext),
      }),
    )

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidRecord')
  })

  it('makes exact commit retries idempotent and rejects different bytes', async () => {
    const testDatabase = makeTestDatabase()
    const storage = makeBrowserWalletVaultStorage(
      testDatabase.database,
      globalThis.crypto,
    )

    const prepared = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'record-1'),
    )
    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', prepared))
    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', prepared))
    const error = await Effect.runPromise(
      Effect.flip(storage.commitPreparedRecord('wallet-1', 'record-2')),
    )

    expect(error.code).toBe('Conflict')
    expect(storage.ownerKey).toBe(localWalletVaultOwnerKey)
    expect(storage.custody).toBe('CrossProcessSingleWriter')
  })
})
