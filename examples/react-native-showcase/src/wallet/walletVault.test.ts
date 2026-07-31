import { Array as Array_, Effect, Option, Order } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeWalletVaultOwnerPartitionKey } from 'wallet-local-vault-example'

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
      digestKey: async value => {
        const digest = new Uint8Array(
          await globalThis.crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(value),
          ),
        )
        return Array.from(digest, byte =>
          byte.toString(16).padStart(2, '0'),
        ).join('')
      },
    },
  }
}

const recordKeyForValue = (
  records: ReadonlyMap<string, string>,
  value: string,
): string => {
  const maybeEntry = Array_.findFirst(
    Array_.fromIterable(records.entries()),
    ([, storedValue]) => storedValue === value,
  )
  if (Option.isNone(maybeEntry)) {
    throw new Error('Expected persisted Wallet record')
  }
  const [key] = maybeEntry.value
  return key
}

describe('Expo Wallet vault storage', () => {
  it('restores separately persisted Wallet records', async () => {
    const testSecureStore = makeTestSecureStore()
    const firstStorage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    await Effect.runPromise(
      Effect.all([
        firstStorage
          .prepareRecord('wallet-1', () => 'record-1')
          .pipe(
            Effect.flatMap(record =>
              firstStorage.commitPreparedRecord('wallet-1', record),
            ),
          ),
        firstStorage
          .prepareRecord('wallet-2', () => 'record-2')
          .pipe(
            Effect.flatMap(record =>
              firstStorage.commitPreparedRecord('wallet-2', record),
            ),
          ),
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
    const record = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'record-1'),
    )
    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', record))
    testSecureStore.records.delete(
      recordKeyForValue(testSecureStore.records, record),
    )

    const error = await Effect.runPromise(Effect.flip(storage.loadRecords))

    expect(error.code).toBe('InvalidRecord')
  })

  it('recovers a durable record whose visibility index write was lost', async () => {
    const testSecureStore = makeTestSecureStore()
    const storage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    const prepared = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'record-1'),
    )
    expect(await Effect.runPromise(storage.loadRecords)).toStrictEqual([])

    let didRunCreateRecord = false
    const recovered = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => {
        didRunCreateRecord = true
        return 'record-2'
      }),
    )
    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', recovered))
    const restored = await Effect.runPromise(storage.loadRecords)

    expect(prepared).toBe('record-1')
    expect(didRunCreateRecord).toBe(false)
    expect(restored).toStrictEqual(['record-1'])
  })

  it('makes exact retries idempotent and rejects a different record', async () => {
    const testSecureStore = makeTestSecureStore()
    const storage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    const prepared = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'record-1'),
    )

    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', prepared))
    await Effect.runPromise(storage.commitPreparedRecord('wallet-1', prepared))
    const error = await Effect.runPromise(
      Effect.flip(storage.commitPreparedRecord('wallet-1', 'record-2')),
    )

    expect(
      testSecureStore.records.get(
        recordKeyForValue(testSecureStore.records, 'record-1'),
      ),
    ).toBe('record-1')
    expect(error.code).toBe('Conflict')
  })

  it('hashes arbitrary Wallet identifiers into fixed SecureStore keys', async () => {
    const testSecureStore = makeTestSecureStore()
    const storage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    const unsafeWalletId = 'wallet:/imported owner?value=1'
    const prepared = await Effect.runPromise(
      storage.prepareRecord(unsafeWalletId, () => 'record-1'),
    )
    await Effect.runPromise(
      storage.commitPreparedRecord(unsafeWalletId, prepared),
    )
    const recordKey = recordKeyForValue(testSecureStore.records, 'record-1')

    expect(recordKey).toMatch(/^foldkit\.wallet\.record\.v2\.[a-f0-9]{64}$/u)
    expect(recordKey).not.toContain(unsafeWalletId)
    expect(await Effect.runPromise(storage.loadRecords)).toStrictEqual([
      'record-1',
    ])
  })

  it('restores legacy v1 records without rewriting their raw keys', async () => {
    const testSecureStore = makeTestSecureStore()
    testSecureStore.records.set(
      'foldkit.wallet.record.v1.wallet-1',
      'legacy-record',
    )
    testSecureStore.records.set(
      'foldkit.wallet.index.v1',
      JSON.stringify(['wallet-1']),
    )
    const storage = makeExpoWalletVaultStorage(testSecureStore.secureStore)

    expect(await Effect.runPromise(storage.loadRecords)).toStrictEqual([
      'legacy-record',
    ])
    expect(
      testSecureStore.records.get('foldkit.wallet.record.v1.wallet-1'),
    ).toBe('legacy-record')
  })

  it('partitions records behind a host-derived opaque owner key', async () => {
    const testSecureStore = makeTestSecureStore()
    const ownerKey = makeWalletVaultOwnerPartitionKey('A'.repeat(43))
    const localStorage = makeExpoWalletVaultStorage(testSecureStore.secureStore)
    const ownerPartitionStorage = makeExpoWalletVaultStorage(
      testSecureStore.secureStore,
      ownerKey,
    )

    const local = await Effect.runPromise(
      localStorage.prepareRecord('wallet-1', () => 'local'),
    )
    await Effect.runPromise(
      localStorage.commitPreparedRecord('wallet-1', local),
    )
    const ownerPartition = await Effect.runPromise(
      ownerPartitionStorage.prepareRecord('wallet-1', () => 'owner-partition'),
    )
    await Effect.runPromise(
      ownerPartitionStorage.commitPreparedRecord('wallet-1', ownerPartition),
    )

    expect(await Effect.runPromise(localStorage.loadRecords)).toStrictEqual([
      'local',
    ])
    expect(
      await Effect.runPromise(ownerPartitionStorage.loadRecords),
    ).toStrictEqual(['owner-partition'])
  })
})
