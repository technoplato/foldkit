import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  WalletVaultOwnerKey,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
} from './localWalletVault.js'
import {
  type MacOSKeychainEntryFactory,
  makeMacOSKeychainWalletVaultStorage,
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
      firstStorage.saveRecord('wallet-1', '{"private":"record-1"}'),
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

    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))
    const setInvocationCount = fakeKeychain.invocations.filter(
      invocation => invocation.operation === 'SetPassword',
    ).length
    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))

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

    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))
    const failure = await Effect.runPromise(
      storage.saveRecord('wallet-1', 'different-record').pipe(Effect.flip),
    )

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
      storage.saveRecord('wallet-1', 'first-record').pipe(Effect.flip),
    )

    expect(failure.code).toBe('Unavailable')
    expect(fakeKeychain.load(walletRecordAccount('wallet-1'))).toBeUndefined()
    expect(fakeKeychain.load(walletIndexAccount)).toBeUndefined()
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      [],
    )
  })

  it('hides an orphan after failure between record and visibility writes and recovers an identical retry', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      localWalletVaultOwnerKey,
    )
    fakeKeychain.failNextSet(walletIndexAccount, 'BeforeWrite')

    const failure = await Effect.runPromise(
      storage.saveRecord('wallet-1', 'first-record').pipe(Effect.flip),
    )

    expect(failure.code).toBe('Unavailable')
    expect(fakeKeychain.load(walletRecordAccount('wallet-1'))).toBe(
      'first-record',
    )
    expect(fakeKeychain.load(walletIndexAccount)).toBeUndefined()
    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      [],
    )

    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))
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
    fakeKeychain.failNextSet(walletIndexAccount, 'AfterWrite')

    await expect(
      Effect.runPromise(storage.saveRecord('wallet-1', 'first-record')),
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
    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))
    fakeKeychain.failNextSet(walletIndexAccount, 'BeforeWrite')

    const failure = await Effect.runPromise(
      storage.saveRecord('wallet-2', 'second-record').pipe(Effect.flip),
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
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
      ownerKey,
    )

    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))

    expect(fakeKeychain.load(`owner:${ownerKey}:${walletIndexAccount}`)).toBe(
      '["wallet-1"]',
    )
    expect(fakeKeychain.load(walletIndexAccount)).toBeUndefined()
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
