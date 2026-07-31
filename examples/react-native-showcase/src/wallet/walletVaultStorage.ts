import { Array as Array_, Effect, Option, Schema as S, Semaphore } from 'effect'
import {
  WalletVaultOwnerKey,
  type WalletVaultStorage,
  WalletVaultStorageCustody,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
} from 'wallet-local-vault-example'

const localWalletIndexKey = 'foldkit.wallet.index.v1'
const localWalletRecordKeyPrefix = 'foldkit.wallet.record.v2.'
const legacyLocalWalletRecordKeyPrefix = 'foldkit.wallet.record.v1.'
const authenticatedWalletKeyPrefix = 'foldkit.wallet.owner.v1.'
const WalletRecordIndex = S.Array(S.String)
const WalletRecordIndexJson = S.fromJsonString(WalletRecordIndex)
const WalletStorageKeyDigest = S.String.check(S.isPattern(/^[a-f0-9]{64}$/u))
const LegacyWalletId = S.String.check(
  S.isLengthBetween(1, 128),
  S.isPattern(/^[A-Za-z0-9._-]+$/u),
)
const storageSemaphoreByOwnerKey = new Map<string, Semaphore.Semaphore>()

/** Secure key-value operations needed by the Expo Wallet vault adapter. */
export type ExpoSecureStoreClient = Readonly<{
  isAvailable: () => Promise<boolean>
  load: (key: string) => Promise<string | null>
  save: (key: string, value: string) => Promise<void>
  digestKey: (value: string) => Promise<string>
}>

const unavailableVaultError = () =>
  new WalletVaultStorageError({ code: 'Unavailable' })

const invalidVaultRecordError = () =>
  new WalletVaultStorageError({ code: 'InvalidRecord' })

const conflictingVaultRecordError = () =>
  new WalletVaultStorageError({ code: 'Conflict' })

const validatedOwnerKey = (ownerKey: unknown): WalletVaultOwnerKey => {
  try {
    return S.decodeUnknownSync(WalletVaultOwnerKey)(ownerKey)
  } catch {
    throw invalidVaultRecordError()
  }
}

const storageSemaphoreForOwner = (
  ownerKey: WalletVaultOwnerKey,
): Semaphore.Semaphore => {
  const existing = storageSemaphoreByOwnerKey.get(ownerKey)
  if (existing !== undefined) {
    return existing
  } else {
    const semaphore = Semaphore.makeUnsafe(1)
    storageSemaphoreByOwnerKey.set(ownerKey, semaphore)
    return semaphore
  }
}

const walletIndexKey = (ownerKey: WalletVaultOwnerKey): string =>
  ownerKey === localWalletVaultOwnerKey
    ? localWalletIndexKey
    : `${authenticatedWalletKeyPrefix}${ownerKey}.index`

const walletRecordKey = (
  ownerKey: WalletVaultOwnerKey,
  walletIdDigest: string,
): string =>
  ownerKey === localWalletVaultOwnerKey
    ? `${localWalletRecordKeyPrefix}${walletIdDigest}`
    : `${authenticatedWalletKeyPrefix}${ownerKey}.record.v2.${walletIdDigest}`

const legacyWalletRecordKey = (
  ownerKey: WalletVaultOwnerKey,
  walletId: string,
): Option.Option<string> => {
  try {
    const legacyWalletId = S.decodeUnknownSync(LegacyWalletId)(walletId)
    return Option.some(
      ownerKey === localWalletVaultOwnerKey
        ? `${legacyLocalWalletRecordKeyPrefix}${legacyWalletId}`
        : `${authenticatedWalletKeyPrefix}${ownerKey}.record.${legacyWalletId}`,
    )
  } catch {
    return Option.none()
  }
}

const walletIdDigest = (
  secureStore: ExpoSecureStoreClient,
  walletId: string,
): Effect.Effect<string, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: () => secureStore.digestKey(walletId),
    catch: unavailableVaultError,
  }).pipe(
    Effect.flatMap(digest =>
      S.decodeUnknownEffect(WalletStorageKeyDigest)(digest).pipe(
        Effect.mapError(invalidVaultRecordError),
      ),
    ),
  )

const loadWalletIds = (
  secureStore: ExpoSecureStoreClient,
  ownerKey: WalletVaultOwnerKey,
): Effect.Effect<ReadonlyArray<string>, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: async () => {
      const isAvailable = await secureStore.isAvailable()
      if (!isAvailable) {
        throw new Error('SecureStore is unavailable')
      }
      return secureStore.load(walletIndexKey(ownerKey))
    },
    catch: unavailableVaultError,
  }).pipe(
    Effect.flatMap(maybeIndex => {
      if (maybeIndex === null) {
        return Effect.succeed([])
      } else {
        return Effect.try({
          try: () => {
            const walletIds = S.decodeUnknownSync(WalletRecordIndexJson)(
              maybeIndex,
            )
            if (
              Array_.length(Array_.dedupe(walletIds)) !==
              Array_.length(walletIds)
            ) {
              throw invalidVaultRecordError()
            }
            return walletIds
          },
          catch: invalidVaultRecordError,
        })
      }
    }),
  )

/** Builds per-Wallet encrypted Keychain or Keystore record persistence. */
export const makeExpoWalletVaultStorage = (
  secureStore: ExpoSecureStoreClient,
  ownerKey: unknown = localWalletVaultOwnerKey,
): WalletVaultStorage => {
  const owner = validatedOwnerKey(ownerKey)
  const storageSemaphore = storageSemaphoreForOwner(owner)
  const loadPreparedRecord = (
    walletId: string,
  ): Effect.Effect<Option.Option<string>, WalletVaultStorageError> =>
    walletIdDigest(secureStore, walletId).pipe(
      Effect.flatMap(digest =>
        Effect.tryPromise({
          try: () => secureStore.load(walletRecordKey(owner, digest)),
          catch: unavailableVaultError,
        }),
      ),
      Effect.flatMap(record => {
        if (record !== null) {
          return Effect.succeed(Option.some(record))
        }
        const maybeLegacyKey = legacyWalletRecordKey(owner, walletId)
        if (Option.isNone(maybeLegacyKey)) {
          return Effect.succeed(Option.none())
        }
        return Effect.tryPromise({
          try: () => secureStore.load(maybeLegacyKey.value),
          catch: unavailableVaultError,
        }).pipe(Effect.map(Option.fromNullishOr))
      }),
    )
  const loadRecords = loadWalletIds(secureStore, owner).pipe(
    Effect.flatMap(walletIds =>
      Effect.forEach(walletIds, walletId =>
        loadPreparedRecord(walletId).pipe(
          Effect.flatMap(maybeRecord =>
            Option.isNone(maybeRecord)
              ? Effect.fail(invalidVaultRecordError())
              : Effect.succeed(maybeRecord.value),
          ),
        ),
      ),
    ),
  )
  const commitRecordVisibility = (
    walletId: string,
    record: string,
  ): Effect.Effect<void, WalletVaultStorageError> =>
    loadPreparedRecord(walletId).pipe(
      Effect.flatMap(maybeRecord => {
        if (Option.isNone(maybeRecord)) {
          return Effect.fail(invalidVaultRecordError())
        } else if (maybeRecord.value !== record) {
          return Effect.fail(conflictingVaultRecordError())
        }
        return loadWalletIds(secureStore, owner).pipe(
          Effect.flatMap(walletIds => {
            if (Array_.contains(walletIds, walletId)) {
              return Effect.void
            }
            const encodedIndex = S.encodeSync(WalletRecordIndexJson)([
              ...walletIds,
              walletId,
            ])
            return Effect.tryPromise({
              try: () => secureStore.save(walletIndexKey(owner), encodedIndex),
              catch: unavailableVaultError,
            })
          }),
        )
      }),
    )

  return {
    ownerKey: owner,
    custody: WalletVaultStorageCustody.make('ProcessLocal'),
    loadRecords: storageSemaphore.withPermit(loadRecords),
    prepareRecord: (walletId, createRecord) =>
      storageSemaphore.withPermit(
        loadPreparedRecord(walletId).pipe(
          Effect.flatMap(maybeExistingRecord => {
            if (Option.isSome(maybeExistingRecord)) {
              return Effect.succeed(maybeExistingRecord.value)
            }
            return Effect.try({
              try: createRecord,
              catch: invalidVaultRecordError,
            }).pipe(
              Effect.flatMap(record =>
                walletIdDigest(secureStore, walletId).pipe(
                  Effect.flatMap(digest =>
                    Effect.tryPromise({
                      try: () =>
                        secureStore.save(
                          walletRecordKey(owner, digest),
                          record,
                        ),
                      catch: unavailableVaultError,
                    }),
                  ),
                  Effect.as(record),
                ),
              ),
            )
          }),
        ),
      ),
    commitPreparedRecord: (walletId, record) =>
      storageSemaphore.withPermit(commitRecordVisibility(walletId, record)),
  }
}
