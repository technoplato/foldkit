import { Array as Array_, Effect, Option, Schema as S, Semaphore } from 'effect'

import { AsyncEntry } from '@napi-rs/keyring'

import {
  type WalletVaultOwnerKey,
  type WalletVaultStorage,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
} from './localWalletVault.js'

const keychainService = 'com.foldkit.wallet.local-vault.v1'
const walletIndexAccount = 'wallet-index'
const walletRecordAccountPrefix = 'wallet-record:'
const WalletRecordIndex = S.Array(S.String)
const WalletRecordIndexJson = S.fromJsonString(WalletRecordIndex)
const storageSemaphoreByService = new Map<string, Semaphore.Semaphore>()

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

const unavailableStorage = () =>
  new WalletVaultStorageError({ code: 'Unavailable' })

const invalidStorageRecord = () =>
  new WalletVaultStorageError({ code: 'InvalidRecord' })

const storageConflict = () => new WalletVaultStorageError({ code: 'Conflict' })

const walletRecordAccount = (walletId: string): string =>
  `${walletRecordAccountPrefix}${walletId}`

const keychainAccountForOwner = (
  ownerKey: WalletVaultOwnerKey,
  account: string,
): string => {
  if (ownerKey === 'Local') {
    return account
  } else {
    return `owner:${ownerKey}:${account}`
  }
}

const entryFactoryForOwner = (
  entryFactory: MacOSKeychainEntryFactory,
  ownerKey: WalletVaultOwnerKey,
): MacOSKeychainEntryFactory => {
  return (service, account) =>
    entryFactory(service, keychainAccountForOwner(ownerKey, account))
}

const loadKeychainItem = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  account: string,
): Effect.Effect<Option.Option<string>, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: () => entryFactory(service, account).getPassword(),
    catch: unavailableStorage,
  }).pipe(Effect.map(Option.fromNullishOr))

const saveKeychainItem = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  account: string,
  value: string,
): Effect.Effect<void, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: () => entryFactory(service, account).setPassword(value),
    catch: unavailableStorage,
  })

const loadWalletIds = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
): Effect.Effect<ReadonlyArray<string>, WalletVaultStorageError> =>
  loadKeychainItem(entryFactory, service, walletIndexAccount).pipe(
    Effect.flatMap(maybeIndex => {
      if (Option.isNone(maybeIndex)) {
        return Effect.succeed([])
      } else {
        return Effect.try({
          try: () => {
            const walletIds = S.decodeUnknownSync(WalletRecordIndexJson)(
              maybeIndex.value,
            )
            if (
              Array_.length(Array_.dedupe(walletIds)) !==
              Array_.length(walletIds)
            ) {
              throw invalidStorageRecord()
            }
            return walletIds
          },
          catch: error =>
            error instanceof WalletVaultStorageError
              ? error
              : invalidStorageRecord(),
        })
      }
    }),
  )

const storageSemaphoreForService = (
  service: string,
  ownerKey: WalletVaultOwnerKey,
): Semaphore.Semaphore => {
  const storageKey = `${service}\u0000${ownerKey}`
  const existing = storageSemaphoreByService.get(storageKey)
  if (existing !== undefined) {
    return existing
  } else {
    const semaphore = Semaphore.makeUnsafe(1)
    storageSemaphoreByService.set(storageKey, semaphore)
    return semaphore
  }
}

const loadRequiredRecord = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  walletId: string,
): Effect.Effect<string, WalletVaultStorageError> =>
  loadKeychainItem(entryFactory, service, walletRecordAccount(walletId)).pipe(
    Effect.flatMap(maybeRecord => {
      if (Option.isSome(maybeRecord)) {
        return Effect.succeed(maybeRecord.value)
      } else {
        return Effect.fail(invalidStorageRecord())
      }
    }),
  )

const isRecordVisible = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  walletId: string,
  record: string,
): Effect.Effect<boolean, WalletVaultStorageError> =>
  loadWalletIds(entryFactory, service).pipe(
    Effect.flatMap(walletIds => {
      if (!Array_.contains(walletIds, walletId)) {
        return Effect.succeed(false)
      } else {
        return loadRequiredRecord(entryFactory, service, walletId).pipe(
          Effect.map(storedRecord => storedRecord === record),
        )
      }
    }),
  )

const commitRecordVisibility = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  walletId: string,
  record: string,
  walletIds: ReadonlyArray<string>,
): Effect.Effect<void, WalletVaultStorageError> => {
  const encodedIndex = S.encodeSync(WalletRecordIndexJson)(walletIds)
  return saveKeychainItem(
    entryFactory,
    service,
    walletIndexAccount,
    encodedIndex,
  ).pipe(
    Effect.catch(writeError =>
      isRecordVisible(entryFactory, service, walletId, record).pipe(
        Effect.catch(() => Effect.succeed(false)),
        Effect.flatMap(isVisible =>
          isVisible ? Effect.void : Effect.fail(writeError),
        ),
      ),
    ),
  )
}

const loadRecordsUnsafe = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
): Effect.Effect<ReadonlyArray<string>, WalletVaultStorageError> =>
  loadWalletIds(entryFactory, service).pipe(
    Effect.flatMap(walletIds =>
      Effect.forEach(walletIds, walletId =>
        loadRequiredRecord(entryFactory, service, walletId),
      ),
    ),
  )

const saveRecordUnsafe = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  walletId: string,
  record: string,
): Effect.Effect<void, WalletVaultStorageError> =>
  loadWalletIds(entryFactory, service).pipe(
    Effect.flatMap(walletIds =>
      loadKeychainItem(
        entryFactory,
        service,
        walletRecordAccount(walletId),
      ).pipe(
        Effect.flatMap(maybeRecord => {
          const isVisible = Array_.contains(walletIds, walletId)
          if (Option.isSome(maybeRecord)) {
            if (maybeRecord.value !== record) {
              return Effect.fail(storageConflict())
            } else if (isVisible) {
              return Effect.void
            } else {
              return commitRecordVisibility(
                entryFactory,
                service,
                walletId,
                record,
                [...walletIds, walletId],
              )
            }
          } else if (isVisible) {
            return Effect.fail(invalidStorageRecord())
          } else {
            return saveKeychainItem(
              entryFactory,
              service,
              walletRecordAccount(walletId),
              record,
            ).pipe(
              Effect.flatMap(() =>
                commitRecordVisibility(
                  entryFactory,
                  service,
                  walletId,
                  record,
                  [...walletIds, walletId],
                ),
              ),
            )
          }
        }),
      ),
    ),
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
  ownerKey: WalletVaultOwnerKey,
  service = keychainService,
): WalletVaultStorage => {
  const ownedEntryFactory = entryFactoryForOwner(entryFactory, ownerKey)
  const storageSemaphore = storageSemaphoreForService(service, ownerKey)
  return {
    ownerKey,
    loadRecords: storageSemaphore.withPermit(
      loadRecordsUnsafe(ownedEntryFactory, service),
    ),
    saveRecord: (walletId, record) =>
      storageSemaphore.withPermit(
        saveRecordUnsafe(ownedEntryFactory, service, walletId, record),
      ),
  }
}

/** Wallet record persistence backed by the current user's macOS Keychain. */
export const MacOSKeychainWalletVaultStorage: WalletVaultStorage =
  makeMacOSKeychainWalletVaultStorage(
    nativeKeychainEntryFactory,
    localWalletVaultOwnerKey,
  )
