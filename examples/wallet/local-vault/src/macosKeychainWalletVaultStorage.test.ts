import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { WalletVaultError } from 'wallet-core-example'

import {
  type MacOSKeychainEntryFactory,
  makeMacOSKeychainWalletVaultStorage,
} from './macosKeychainWalletVaultStorage.js'

const keychainService = 'com.foldkit.wallet.local-vault.v1'
const walletIndexAccount = 'wallet-index'

const makeFakeKeychain = () => {
  const items = new Map<string, string>()
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
      items.set(itemKey(service, account), password)
    },
  })
  return {
    entryFactory,
    invocations,
    load: (account: string) => items.get(itemKey(keychainService, account)),
  }
}

describe('macOS Keychain Wallet vault storage', () => {
  it('loads an empty Wallet list when the index item is absent', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
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
    )

    await Effect.runPromise(
      firstStorage.saveRecord('wallet-1', '{"private":"record-1"}'),
    )
    const reconstructedStorage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
    )

    await expect(
      Effect.runPromise(reconstructedStorage.loadRecords),
    ).resolves.toStrictEqual(['{"private":"record-1"}'])
    expect(fakeKeychain.load(walletIndexAccount)).toBe('["wallet-1"]')
  })

  it('updates an existing record without duplicating its index entry', async () => {
    const fakeKeychain = makeFakeKeychain()
    const storage = makeMacOSKeychainWalletVaultStorage(
      fakeKeychain.entryFactory,
    )

    await Effect.runPromise(storage.saveRecord('wallet-1', 'first-record'))
    await Effect.runPromise(storage.saveRecord('wallet-1', 'second-record'))

    await expect(Effect.runPromise(storage.loadRecords)).resolves.toStrictEqual(
      ['second-record'],
    )
    expect(fakeKeychain.load(walletIndexAccount)).toBe('["wallet-1"]')
  })

  it('sanitizes native Keychain failures without exposing their cause', async () => {
    const sensitiveCause = 'private-record-that-must-not-escape'
    const entryFactory: MacOSKeychainEntryFactory = () => ({
      getPassword: async () => Promise.reject(new Error(sensitiveCause)),
      setPassword: async () => Promise.reject(new Error(sensitiveCause)),
    })
    const storage = makeMacOSKeychainWalletVaultStorage(entryFactory)

    const failure = await Effect.runPromise(
      storage.loadRecords.pipe(Effect.flip),
    )

    expect(failure).toBeInstanceOf(WalletVaultError)
    expect(failure.code).toBe('Unavailable')
    expect(String(failure)).not.toContain(sensitiveCause)
    expect(JSON.stringify(failure)).not.toContain(sensitiveCause)
  })
})
