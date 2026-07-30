import { Array as Array_, Effect, Option, Schema as S } from 'effect'
import { WalletVaultError } from 'wallet-core-example'

import { AsyncEntry } from '@napi-rs/keyring'

import type { WalletVaultStorage } from './localWalletVault.js'

const keychainService = 'com.foldkit.wallet.local-vault.v1'
const walletIndexAccount = 'wallet-index'
const walletRecordAccountPrefix = 'wallet-record:'
const WalletRecordIndex = S.Array(S.String)
const WalletRecordIndexJson = S.fromJsonString(WalletRecordIndex)

/** The native Keychain entry operations required by Wallet persistence. */
export type MacOSKeychainEntry = Readonly<{
  getPassword: () => Promise<string | undefined>
  setPassword: (password: string) => Promise<void>
}>

/** An injectable native Keychain entry factory. */
export type MacOSKeychainEntryFactory = (
  service: string,
  account: string,
) => MacOSKeychainEntry

const unavailableVaultError = () =>
  new WalletVaultError({ code: 'Unavailable' })

const walletRecordAccount = (walletId: string): string =>
  `${walletRecordAccountPrefix}${walletId}`

const loadKeychainItem = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  account: string,
): Effect.Effect<Option.Option<string>, WalletVaultError> =>
  Effect.tryPromise({
    try: () => entryFactory(service, account).getPassword(),
    catch: unavailableVaultError,
  }).pipe(Effect.map(Option.fromNullishOr))

const saveKeychainItem = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  account: string,
  value: string,
): Effect.Effect<void, WalletVaultError> =>
  Effect.tryPromise({
    try: () => entryFactory(service, account).setPassword(value),
    catch: unavailableVaultError,
  })

const loadWalletIds = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
): Effect.Effect<ReadonlyArray<string>, WalletVaultError> =>
  loadKeychainItem(entryFactory, service, walletIndexAccount).pipe(
    Effect.flatMap(maybeIndex => {
      if (Option.isNone(maybeIndex)) {
        return Effect.succeed([])
      } else {
        return Effect.try({
          try: () =>
            S.decodeUnknownSync(WalletRecordIndexJson)(maybeIndex.value),
          catch: unavailableVaultError,
        })
      }
    }),
  )

const nativeKeychainEntryFactory: MacOSKeychainEntryFactory = (
  service,
  account,
) => {
  const entry = new AsyncEntry(service, account)
  return {
    getPassword: () => entry.getPassword(),
    setPassword: password => entry.setPassword(password),
  }
}

/** Builds Wallet record persistence backed by native macOS Keychain entries. */
export const makeMacOSKeychainWalletVaultStorage = (
  entryFactory: MacOSKeychainEntryFactory,
  service = keychainService,
): WalletVaultStorage => ({
  loadRecords: loadWalletIds(entryFactory, service).pipe(
    Effect.flatMap(walletIds =>
      Effect.forEach(walletIds, walletId =>
        loadKeychainItem(entryFactory, service, walletRecordAccount(walletId)),
      ),
    ),
    Effect.map(Array_.getSomes),
  ),
  saveRecord: (walletId, record) =>
    loadWalletIds(entryFactory, service).pipe(
      Effect.flatMap(walletIds => {
        const nextWalletIds = Array_.contains(walletIds, walletId)
          ? walletIds
          : [...walletIds, walletId]
        const encodedIndex = S.encodeSync(WalletRecordIndexJson)(nextWalletIds)
        return saveKeychainItem(
          entryFactory,
          service,
          walletRecordAccount(walletId),
          record,
        ).pipe(
          Effect.flatMap(() =>
            saveKeychainItem(
              entryFactory,
              service,
              walletIndexAccount,
              encodedIndex,
            ),
          ),
        )
      }),
    ),
})

/** Wallet record persistence backed by the current user's macOS Keychain. */
export const MacOSKeychainWalletVaultStorage: WalletVaultStorage =
  makeMacOSKeychainWalletVaultStorage(nativeKeychainEntryFactory)
