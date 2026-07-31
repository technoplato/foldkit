import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  WalletVaultOwnerKey,
  type WalletVaultStorage,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
} from './localWalletVault.js'
import {
  type MacOSKeychainEntryFactory,
  makeLocalMacOSKeychainWalletVaultStorage,
  makeMacOSKeychainWalletVaultStorage,
  makeOwnerPartitionMacOSKeychainWalletVaultStorage,
} from './macosKeychainWalletVaultStorage.js'

const keychainService = 'com.foldkit.wallet.local-vault.v1'
const walletIndexAccount = 'wallet-index'
const walletRecordAccount = (walletId: string): string =>
  `wallet-record:${walletId}`
type SetFailureTiming = 'BeforeWrite' | 'AfterWrite'

const makeFakeKeychain = () => {
  const items = new Map<string, string>()
  const setFailures = new Map<string, Array<SetFailureTiming>>()
  const invocations: Array<
    Readonly<{
      service: string
      account: string
      operation: 'GetPassword' | 'SetPassword'
    }>
  > = []
  const itemKey = (service: string, account: string): string =>
    `${service}\u0000${account}`
  const entryFactory: MacOSKeychainEntryFactory = (service, account) => ({
    getPassword: async () => {
      invocations.push({ service, account, operation: 'GetPassword' })
      return items.get(itemKey(service, account))
    },
    setPassword: async password => {
      invocations.push({ service, account, operation: 'SetPassword' })
      const failures = setFailures.get(account) ?? []
      const maybeFailure = failures.shift()
      setFailures.set(account, failures)
      if (maybeFailure === 'BeforeWrite') {
        throw new Error('Injected Keychain write failure')
      }
      items.set(itemKey(service, account), password)
      if (maybeFailure === 'AfterWrite') {
        throw new Error('Injected Keychain write failure')
      }
    },
  })
  return {
    entryFactory,
    invocations,
    load: (account: string) => items.get(itemKey(keychainService, account)),
    failNextSet: (account: string, timing: SetFailureTiming) => {
      const failures = setFailures.get(account) ?? []
      failures.push(timing)
      setFailures.set(account, failures)
    },
    set: (account: string, value: string) => {
      items.set(itemKey(keychainService, account), value)
    },
  }
}

const persistRecord = (
  storage: WalletVaultStorage,
  walletId: string,
  record: string,
) =>
  storage
    .prepareRecord(walletId, () => record)
    .pipe(
      Effect.flatMap(preparedRecord =>
        storage.commitPreparedRecord(walletId, preparedRecord),
      ),
    )

describe('macOS Keychain Wallet vault storage', () => {
  it('loads an empty Wallet list when the index item is absent', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )

    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      [],
    )
    expect(fakeKeychain.invocations).toStrictEqual([
      {
        service: keychainService,
        account: walletIndexAccount,
        operation: 'GetPassword',
      },
    ])
  })

  it('saves and reloads records through a reconstructed adapter', async () => {
    const fakeKeychain = makeFakeKeychain()
    const firstStorage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )

    await Effect.runPromise(
      persistRecord(firstStorage, 'wallet-1', '{"private":"record-1"}'),
    )
    const reconstructedStorage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )

    await expect(
      Effect.runPromise(reconstructedStorage.loadRecords),
    ).resolves.toStrictEqual(['{"private":"record-1"}'])
    expect(fakeKeychain.load(walletIndexAccount)).toBe('["wallet-1"]')
  })

  it('accepts an identical retry without rewriting the immutable record', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )

    await Effect.runPromise(persistRecord(storage, 'wallet-1', 'first-record'))
    const setInvocationCount = fakeKeychain.invocations.filter(
      invocation => invocation.operation === 'SetPassword',
    ).length
    let retryFactoryCalls = 0
    const preparedRecord = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => {
        retryFactoryCalls += 1
        return 'different-record'
      }),
    )
    await Effect.runPromise(
      storage.commitPreparedRecord('wallet-1', preparedRecord),
    )

    expect(preparedRecord).toBe('first-record')
    expect(retryFactoryCalls).toBe(0)
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['first-record'],
    )
    expect(fakeKeychain.load(walletIndexAccount)).toBe('["wallet-1"]')
    expect(
      fakeKeychain.invocations.filter(
        invocation => invocation.operation === 'SetPassword',
      ),
    ).toHaveLength(setInvocationCount)
  })

  it('rejects a Wallet id collision without overwriting the first record', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )

    await Effect.runPromise(persistRecord(storage, 'wallet-1', 'first-record'))
    const preparedRecord = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'different-record'),
    )
    const failure = await Effect.runPromise(
      storage
        .commitPreparedRecord('wallet-1', 'different-record')
        .pipe(Effect.flip),
    )

    expect(preparedRecord).toBe('first-record')
    expect(failure).toBeInstanceOf(WalletVaultStorageError)
    expect(failure.code).toBe('Conflict')
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['first-record'],
    )
  })

  it('keeps a record invisible when storage fails before its write', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )
    fakeKeychain.failNextSet(walletRecordAccount('wallet-1'), 'BeforeWrite')

    const failure = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'first-record').pipe(Effect.flip),
    )

    expect(failure.code).toBe('Unavailable')
    expect(fakeKeychain.load(walletRecordAccount('wallet-1'))).toBeUndefined()
    expect(fakeKeychain.load(walletIndexAccount)).toBeUndefined()
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      [],
    )
  })

  it('confirms preparation when Keychain persisted before reporting failure', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )
    fakeKeychain.failNextSet(walletRecordAccount('wallet-1'), 'AfterWrite')

    await expect(
      Effect.runPromise(
        storage.prepareRecord('wallet-1', () => 'first-record'),
      ),
    ).resolves.toBe('first-record')
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      [],
    )
    await Effect.runPromise(
      storage.commitPreparedRecord('wallet-1', 'first-record'),
    )
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['first-record'],
    )
  })

  it('hides an orphan after failure between record and visibility writes and recovers an identical retry', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )
    const preparedRecord = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'first-record'),
    )
    fakeKeychain.failNextSet(walletIndexAccount, 'BeforeWrite')

    const failure = await Effect.runPromise(
      storage
        .commitPreparedRecord('wallet-1', preparedRecord)
        .pipe(Effect.flip),
    )

    expect(failure.code).toBe('Unavailable')
    expect(fakeKeychain.load(walletRecordAccount('wallet-1'))).toBe(
      'first-record',
    )
    expect(fakeKeychain.load(walletIndexAccount)).toBeUndefined()
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      [],
    )
    const recoveredRecord = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'different-record'),
    )
    expect(recoveredRecord).toBe('first-record')

    await Effect.runPromise(
      storage.commitPreparedRecord('wallet-1', recoveredRecord),
    )
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['first-record'],
    )
  })

  it('confirms success when the visibility marker committed before its write reported failure', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )
    const preparedRecord = await Effect.runPromise(
      storage.prepareRecord('wallet-1', () => 'first-record'),
    )
    fakeKeychain.failNextSet(walletIndexAccount, 'AfterWrite')

    await expect(
      Effect.runPromise(
        storage.commitPreparedRecord('wallet-1', preparedRecord),
      ),
    ).resolves.toBeUndefined()
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['first-record'],
    )
  })

  it('preserves prior visible records when a later visibility write fails', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )
    await Effect.runPromise(persistRecord(storage, 'wallet-1', 'first-record'))
    const secondPreparedRecord = await Effect.runPromise(
      storage.prepareRecord('wallet-2', () => 'second-record'),
    )
    fakeKeychain.failNextSet(walletIndexAccount, 'BeforeWrite')

    const failure = await Effect.runPromise(
      storage
        .commitPreparedRecord('wallet-2', secondPreparedRecord)
        .pipe(Effect.flip),
    )

    expect(failure.code).toBe('Unavailable')
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['first-record'],
    )
  })

  it('fails closed when a visible index references a missing record', async () => {
    const fakeKeychain = makeFakeKeychain()
    fakeKeychain.set(walletIndexAccount, '["wallet-1"]')
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )

    const failure = await Effect.runPromise(
      storage.loadRecords.pipe(Effect.flip),
    )

    expect(failure.code).toBe('InvalidRecord')
  })

  it('partitions authenticated owners without placing a subject id in Keychain', async () => {
    const fakeKeychain = makeFakeKeychain()
    const ownerKey = WalletVaultOwnerKey.make('A'.repeat(43))
    const storage = makeOwnerPartitionMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      ownerKey,
    )

    await Effect.runPromise(persistRecord(storage, 'wallet-1', 'first-record'))

    expect(fakeKeychain.load(`owner:${ownerKey}:${walletIndexAccount}`)).toBe(
      '["wallet-1"]',
    )
    expect(fakeKeychain.load(walletIndexAccount)).toBeUndefined()
  })

  it('uses separate runtime-validated local and authenticated constructors', () => {
    const fakeKeychain = makeFakeKeychain()
    const authenticatedOwnerKey = 'A'.repeat(43)
    const localStorage = makeLocalMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
    )
    const authenticatedStorage =
      makeOwnerPartitionMacOSKeychainWalletVaultStorage(
        fakeKeychain.entryFactory,
        authenticatedOwnerKey,
      )

    expect(localStorage.ownerKey).toBe('Local')
    expect(authenticatedStorage.ownerKey).toBe(authenticatedOwnerKey)
    expect(() =>
      makeOwnerPartitionMacOSKeychainWalletVaultStorage(
        fakeKeychain.entryFactory,
        'Local',
      ),
    ).toThrow(WalletVaultStorageError)
    expect(() =>
      makeOwnerPartitionMacOSKeychainWalletVaultStorage(
        fakeKeychain.entryFactory,
        'subject@example.com',
      ),
    ).toThrow(WalletVaultStorageError)
    expect(() =>
      makeMacOSKeychainWalletVaultStorage(
        fakeKeychain.entryFactory,
        'not-an-owner-key',
      ),
    ).toThrow(WalletVaultStorageError)
  })

  it('declares the host custody concurrency guarantee explicitly', () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeLocalMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
    )

    expect(storage.custody).toBe(
      process.platform === 'darwin'
        ? 'CrossProcessSingleWriter'
        : 'ProcessLocal',
    )
  })

  it('sanitizes native Keychain failures without exposing their cause', async () => {
    const sensitiveCause = 'private-record-that-must-not-escape'
    const entryFactory: MacOSKeychainEntryFactory = () => ({
      getPassword: async () => Promise.reject(new Error(sensitiveCause)),
      setPassword: async () => Promise.reject(new Error(sensitiveCause)),
    })
    const storage = makeMacOSKeychainWalletVaultStorage(
      entryFactory,
      localWalletVaultOwnerKey,
    )

    const failure = await Effect.runPromise(
      storage.loadRecords.pipe(Effect.flip),
    )

    expect(failure).toBeInstanceOf(WalletVaultStorageError)
    expect(failure.code).toBe('Unavailable')
    expect(String(failure)).not.toContain(sensitiveCause)
    expect(JSON.stringify(failure)).not.toContain(sensitiveCause)
  })
})
