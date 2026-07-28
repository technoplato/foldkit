import { Array as Array_, Effect, Schema as S } from 'effect'
import { WalletVaultError } from 'wallet-core-example'
import type { WalletVaultStorage } from 'wallet-local-vault-example'

const walletIndexKey = 'foldkit.wallet.index.v1'
const walletRecordKeyPrefix = 'foldkit.wallet.record.v1.'
const WalletRecordIndex = S.Array(S.String)
const WalletRecordIndexJson = S.fromJsonString(WalletRecordIndex)

/** Secure key-value operations needed by the Expo Wallet vault adapter. */
export type ExpoSecureStoreClient = Readonly<{
  isAvailable: () => Promise<boolean>
  load: (key: string) => Promise<string | null>
  save: (key: string, value: string) => Promise<void>
}>

const unavailableVaultError = () =>
  new WalletVaultError({ code: 'Unavailable' })

const invalidVaultRecordError = () =>
  new WalletVaultError({ code: 'InvalidKeyMaterial' })

const walletRecordKey = (walletId: string): string =>
  `${walletRecordKeyPrefix}${walletId}`

const loadWalletIds = (
  secureStore: ExpoSecureStoreClient,
): Effect.Effect<ReadonlyArray<string>, WalletVaultError> =>
  Effect.tryPromise({
    try: async () => {
      const isAvailable = await secureStore.isAvailable()
      if (!isAvailable) {
        throw new Error('SecureStore is unavailable')
      }
      return secureStore.load(walletIndexKey)
    },
    catch: unavailableVaultError,
  }).pipe(
    Effect.flatMap(maybeIndex => {
      if (maybeIndex === null) {
        return Effect.succeed([])
      } else {
        return Effect.try({
          try: () => S.decodeUnknownSync(WalletRecordIndexJson)(maybeIndex),
          catch: invalidVaultRecordError,
        })
      }
    }),
  )

/** Builds per-Wallet encrypted Keychain or Keystore record persistence. */
export const makeExpoWalletVaultStorage = (
  secureStore: ExpoSecureStoreClient,
): WalletVaultStorage => ({
  loadRecords: loadWalletIds(secureStore).pipe(
    Effect.flatMap(walletIds =>
      Effect.forEach(walletIds, walletId =>
        Effect.tryPromise({
          try: () => secureStore.load(walletRecordKey(walletId)),
          catch: unavailableVaultError,
        }).pipe(
          Effect.flatMap(maybeRecord =>
            maybeRecord === null
              ? Effect.fail(invalidVaultRecordError())
              : Effect.succeed(maybeRecord),
          ),
        ),
      ),
    ),
  ),
  saveRecord: (walletId, record) =>
    loadWalletIds(secureStore).pipe(
      Effect.flatMap(walletIds => {
        const nextWalletIds = Array_.contains(walletIds, walletId)
          ? walletIds
          : [...walletIds, walletId]
        const encodedIndex = S.encodeSync(WalletRecordIndexJson)(nextWalletIds)
        return Effect.tryPromise({
          try: async () => {
            await secureStore.save(walletRecordKey(walletId), record)
            await secureStore.save(walletIndexKey, encodedIndex)
          },
          catch: unavailableVaultError,
        })
      }),
    ),
})
