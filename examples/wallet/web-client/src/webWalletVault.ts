import { Array as Array_, Effect, Layer, Option, Schema as S } from 'effect'
import { WalletCrypto, WalletSigner, WalletVault } from 'wallet-core-example'
import {
  WalletVaultOwnerKey,
  type WalletVaultStorage,
  WalletVaultStorageCustody,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
  makePersistentLocalWalletResources,
  makePersistentLocalWalletVault,
  walletIdForStoredWalletRecord,
} from 'wallet-local-vault-example'

const localWalletDatabaseName = 'foldkit-wallet-vault'
const walletDatabaseVersion = 2
const keyStoreName = 'encryption-keys'
const recordStoreName = 'wallet-records'
const preparedRecordStoreName = 'wallet-prepared-records'
const encryptionKeyId = 'wallet-vault-aes-gcm-v1'
const legacyAdditionalData = new TextEncoder().encode('Foldkit Wallet Vault v1')
const initializationVectorByteCount = 12

const LegacyEncryptedWalletRecord = S.Struct({
  version: S.Literal(1),
  initializationVector: S.Uint8ArrayFromBase64,
  ciphertext: S.Uint8ArrayFromBase64,
})
const BoundEncryptedWalletRecord = S.Struct({
  version: S.Literal(2),
  initializationVector: S.Uint8ArrayFromBase64,
  ciphertext: S.Uint8ArrayFromBase64,
})
const EncryptedWalletRecord = S.Union([
  LegacyEncryptedWalletRecord,
  BoundEncryptedWalletRecord,
])
const EncryptedWalletRecordJson = S.fromJsonString(EncryptedWalletRecord)
const EncryptedWalletRecords = S.Array(S.String)
const WalletIds = S.Array(S.String)
const OptionalString = S.Union([S.String, S.Undefined])
const EncryptedWalletRecordEntry = S.Struct({
  walletId: S.String,
  record: S.String,
})
type EncryptedWalletRecordEntry = typeof EncryptedWalletRecordEntry.Type
const emptyWalletRecords: ReadonlyArray<string> = []

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  Uint8Array.from(bytes).buffer

const unavailableVaultError = () =>
  new WalletVaultStorageError({ code: 'Unavailable' })

const invalidVaultRecordError = () =>
  new WalletVaultStorageError({ code: 'InvalidRecord' })

const conflictingVaultRecordError = () =>
  new WalletVaultStorageError({ code: 'Conflict' })

const walletVaultStorageError = (error: unknown): WalletVaultStorageError =>
  error instanceof WalletVaultStorageError ? error : unavailableVaultError()

const validatedOwnerKey = (ownerKey: unknown): WalletVaultOwnerKey => {
  try {
    return S.decodeUnknownSync(WalletVaultOwnerKey)(ownerKey)
  } catch {
    throw invalidVaultRecordError()
  }
}

const boundAdditionalData = (
  ownerKey: WalletVaultOwnerKey,
  walletId: string,
): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify(['Foldkit Wallet Vault v2', ownerKey, walletId]),
  )

const decodeOptionalString = (value: unknown): string | undefined =>
  S.decodeUnknownSync(OptionalString)(value)

/** Minimal durable browser database used by the encrypted Wallet vault. */
export type BrowserWalletVaultDatabase = Readonly<{
  ownerKey: WalletVaultOwnerKey
  loadEncryptionKey: () => Promise<CryptoKey | undefined>
  addEncryptionKey: (key: CryptoKey) => Promise<boolean>
  loadPreparedEncryptedRecord: (walletId: string) => Promise<string | undefined>
  loadCommittedEncryptedRecords: () => Promise<
    ReadonlyArray<EncryptedWalletRecordEntry>
  >
  addPreparedEncryptedRecord: (
    walletId: string,
    record: string,
  ) => Promise<boolean>
  commitPreparedEncryptedRecord: (
    walletId: string,
    record: string,
  ) => Promise<boolean>
}>

const requestResult = <Value>(request: IDBRequest<Value>): Promise<Value> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed')),
      { once: true },
    )
  })

const transactionCompletion = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB aborted')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB failed')),
      { once: true },
    )
  })

const walletDatabaseName = (ownerKey: WalletVaultOwnerKey): string =>
  ownerKey === localWalletVaultOwnerKey
    ? localWalletDatabaseName
    : `${localWalletDatabaseName}-${ownerKey}`

const openWalletDatabase = (
  ownerKey: WalletVaultOwnerKey,
  onVersionChange: (database: IDBDatabase) => void,
): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    let isBlocked = false
    const request = globalThis.indexedDB.open(
      walletDatabaseName(ownerKey),
      walletDatabaseVersion,
    )
    request.addEventListener(
      'upgradeneeded',
      () => {
        const database = request.result
        if (!database.objectStoreNames.contains(keyStoreName)) {
          database.createObjectStore(keyStoreName)
        }
        if (!database.objectStoreNames.contains(recordStoreName)) {
          database.createObjectStore(recordStoreName)
        }
        if (!database.objectStoreNames.contains(preparedRecordStoreName)) {
          database.createObjectStore(preparedRecordStoreName)
        }
      },
      { once: true },
    )
    request.addEventListener(
      'blocked',
      () => {
        isBlocked = true
        reject(new Error('IndexedDB upgrade was blocked by another Wallet tab'))
      },
      { once: true },
    )
    request.addEventListener(
      'success',
      () => {
        const database = request.result
        if (isBlocked) {
          database.close()
        } else {
          database.addEventListener('versionchange', () => {
            database.close()
            onVersionChange(database)
          })
          resolve(database)
        }
      },
      { once: true },
    )
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB open failed')),
      { once: true },
    )
  })

/** Builds the origin-local IndexedDB implementation used by browser hosts. */
export const makeIndexedDbWalletVaultDatabase = (
  ownerKey: unknown = localWalletVaultOwnerKey,
): BrowserWalletVaultDatabase => {
  const owner = validatedOwnerKey(ownerKey)
  let openedDatabase: IDBDatabase | undefined
  let databasePromise: Promise<IDBDatabase> | undefined
  const database = () => {
    databasePromise ??= openWalletDatabase(owner, closedDatabase => {
      if (openedDatabase === closedDatabase) {
        openedDatabase = undefined
        databasePromise = undefined
      }
    })
      .then(nextDatabase => {
        openedDatabase = nextDatabase
        return nextDatabase
      })
      .catch(error => {
        databasePromise = undefined
        throw error
      })
    return databasePromise
  }

  return {
    ownerKey: owner,
    loadEncryptionKey: async () => {
      const walletDatabase = await database()
      const transaction = walletDatabase.transaction(keyStoreName, 'readonly')
      return requestResult<CryptoKey | undefined>(
        transaction.objectStore(keyStoreName).get(encryptionKeyId),
      )
    },
    addEncryptionKey: async key => {
      const walletDatabase = await database()
      const transaction = walletDatabase.transaction(keyStoreName, 'readwrite')
      const request = transaction
        .objectStore(keyStoreName)
        .add(key, encryptionKeyId)
      const completion = transactionCompletion(transaction)
      try {
        await requestResult(request)
        await completion
        return true
      } catch (error) {
        await completion.catch(() => undefined)
        if (error instanceof DOMException && error.name === 'ConstraintError') {
          return false
        } else {
          throw error
        }
      }
    },
    loadPreparedEncryptedRecord: async walletId => {
      const walletDatabase = await database()
      const transaction = walletDatabase.transaction(
        [recordStoreName, preparedRecordStoreName],
        'readonly',
      )
      const [committedRecord, preparedRecord] = await Promise.all([
        requestResult<unknown>(
          transaction.objectStore(recordStoreName).get(walletId),
        ),
        requestResult<unknown>(
          transaction.objectStore(preparedRecordStoreName).get(walletId),
        ),
      ])
      try {
        return (
          decodeOptionalString(committedRecord) ??
          decodeOptionalString(preparedRecord)
        )
      } catch {
        throw invalidVaultRecordError()
      }
    },
    loadCommittedEncryptedRecords: async () => {
      const walletDatabase = await database()
      const transaction = walletDatabase.transaction(
        recordStoreName,
        'readonly',
      )
      const recordStore = transaction.objectStore(recordStoreName)
      const [walletIds, records] = await Promise.all([
        requestResult(recordStore.getAllKeys()),
        requestResult(recordStore.getAll()),
      ])
      let validatedWalletIds: ReadonlyArray<string>
      let validatedRecords: ReadonlyArray<string>
      try {
        validatedWalletIds = S.decodeUnknownSync(WalletIds)(walletIds)
        validatedRecords = S.decodeUnknownSync(EncryptedWalletRecords)(records)
      } catch {
        throw invalidVaultRecordError()
      }
      if (
        Array_.length(validatedWalletIds) !== Array_.length(validatedRecords)
      ) {
        throw invalidVaultRecordError()
      }
      return Array_.map(
        Array_.zip(validatedWalletIds, validatedRecords),
        ([walletId, record]) =>
          EncryptedWalletRecordEntry.make({ walletId, record }),
      )
    },
    addPreparedEncryptedRecord: async (walletId, record) => {
      const walletDatabase = await database()
      const transaction = walletDatabase.transaction(
        [recordStoreName, preparedRecordStoreName],
        'readwrite',
      )
      const committedStore = transaction.objectStore(recordStoreName)
      const preparedStore = transaction.objectStore(preparedRecordStoreName)
      return new Promise((resolve, reject) => {
        let isCommittedRead = false
        let isPreparedRead = false
        let committedRecord: string | undefined
        let preparedRecord: string | undefined
        let result: boolean | undefined
        let validationFailure: WalletVaultStorageError | undefined
        const decide = () => {
          if (!isCommittedRead || !isPreparedRead || result !== undefined) {
            return
          }
          if (committedRecord !== undefined || preparedRecord !== undefined) {
            result = false
          } else {
            result = true
            preparedStore.add(record, walletId)
          }
        }
        const committedRequest = committedStore.get(walletId)
        committedRequest.addEventListener('success', () => {
          try {
            committedRecord = decodeOptionalString(committedRequest.result)
            isCommittedRead = true
            decide()
          } catch {
            validationFailure = invalidVaultRecordError()
            transaction.abort()
          }
        })
        const preparedRequest = preparedStore.get(walletId)
        preparedRequest.addEventListener('success', () => {
          try {
            preparedRecord = decodeOptionalString(preparedRequest.result)
            isPreparedRead = true
            decide()
          } catch {
            validationFailure = invalidVaultRecordError()
            transaction.abort()
          }
        })
        transaction.addEventListener(
          'complete',
          () => {
            if (result === undefined) {
              reject(new Error('IndexedDB prepare decision was incomplete'))
            } else {
              resolve(result)
            }
          },
          { once: true },
        )
        transaction.addEventListener(
          'abort',
          () =>
            reject(
              validationFailure ??
                transaction.error ??
                new Error('IndexedDB Wallet prepare aborted'),
            ),
          { once: true },
        )
        transaction.addEventListener(
          'error',
          () =>
            reject(
              validationFailure ??
                transaction.error ??
                new Error('IndexedDB Wallet prepare failed'),
            ),
          { once: true },
        )
      })
    },
    commitPreparedEncryptedRecord: async (walletId, record) => {
      const walletDatabase = await database()
      const transaction = walletDatabase.transaction(
        [recordStoreName, preparedRecordStoreName],
        'readwrite',
      )
      const committedStore = transaction.objectStore(recordStoreName)
      const preparedStore = transaction.objectStore(preparedRecordStoreName)
      return new Promise((resolve, reject) => {
        let isCommittedRead = false
        let isPreparedRead = false
        let committedRecord: string | undefined
        let preparedRecord: string | undefined
        let result: boolean | undefined
        let validationFailure: WalletVaultStorageError | undefined
        const decide = () => {
          if (!isCommittedRead || !isPreparedRead || result !== undefined) {
            return
          }
          if (committedRecord !== undefined) {
            result = committedRecord === record
          } else if (preparedRecord === record) {
            result = true
            committedStore.add(record, walletId)
            preparedStore.delete(walletId)
          } else {
            result = false
          }
        }
        const committedRequest = committedStore.get(walletId)
        committedRequest.addEventListener('success', () => {
          try {
            committedRecord = decodeOptionalString(committedRequest.result)
            isCommittedRead = true
            decide()
          } catch {
            validationFailure = invalidVaultRecordError()
            transaction.abort()
          }
        })
        const preparedRequest = preparedStore.get(walletId)
        preparedRequest.addEventListener('success', () => {
          try {
            preparedRecord = decodeOptionalString(preparedRequest.result)
            isPreparedRead = true
            decide()
          } catch {
            validationFailure = invalidVaultRecordError()
            transaction.abort()
          }
        })
        transaction.addEventListener(
          'complete',
          () => {
            if (result === undefined) {
              reject(new Error('IndexedDB commit decision was incomplete'))
            } else {
              resolve(result)
            }
          },
          { once: true },
        )
        transaction.addEventListener(
          'abort',
          () =>
            reject(
              validationFailure ??
                transaction.error ??
                new Error('IndexedDB Wallet commit aborted'),
            ),
          { once: true },
        )
        transaction.addEventListener(
          'error',
          () =>
            reject(
              validationFailure ??
                transaction.error ??
                new Error('IndexedDB Wallet commit failed'),
            ),
          { once: true },
        )
      })
    },
  }
}

const loadOrCreateEncryptionKey = (
  database: BrowserWalletVaultDatabase,
  webCrypto: Crypto,
): Effect.Effect<CryptoKey, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: async () => {
      const existingKey = await database.loadEncryptionKey()
      if (existingKey !== undefined) {
        return existingKey
      }
      const generatedKey = await webCrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
      const didAddKey = await database.addEncryptionKey(generatedKey)
      if (didAddKey) {
        return generatedKey
      }
      const winningKey = await database.loadEncryptionKey()
      if (winningKey === undefined) {
        throw new Error('Wallet encryption key was not persisted')
      } else {
        return winningKey
      }
    },
    catch: walletVaultStorageError,
  })

const decryptRecord = (
  record: string,
  ownerKey: WalletVaultOwnerKey,
  walletId: string,
  key: CryptoKey,
  webCrypto: Crypto,
): Effect.Effect<string, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: async () => {
      const encrypted = S.decodeUnknownSync(EncryptedWalletRecordJson)(record)
      const plaintext = await webCrypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(encrypted.initializationVector),
          additionalData: arrayBuffer(
            encrypted.version === 1
              ? legacyAdditionalData
              : boundAdditionalData(ownerKey, walletId),
          ),
        },
        key,
        arrayBuffer(encrypted.ciphertext),
      )
      const decodedRecord = new TextDecoder().decode(plaintext)
      if (
        encrypted.version === 1 &&
        walletIdForStoredWalletRecord(decodedRecord) !== walletId
      ) {
        throw invalidVaultRecordError()
      }
      return decodedRecord
    },
    catch: invalidVaultRecordError,
  })

const encryptRecord = (
  record: string,
  ownerKey: WalletVaultOwnerKey,
  walletId: string,
  key: CryptoKey,
  webCrypto: Crypto,
): Effect.Effect<string, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: async () => {
      const initializationVector = webCrypto.getRandomValues(
        new Uint8Array(initializationVectorByteCount),
      )
      const ciphertext = await webCrypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(initializationVector),
          additionalData: arrayBuffer(boundAdditionalData(ownerKey, walletId)),
        },
        key,
        arrayBuffer(new TextEncoder().encode(record)),
      )
      return S.encodeSync(EncryptedWalletRecordJson)(
        BoundEncryptedWalletRecord.make({
          version: 2,
          initializationVector,
          ciphertext: new Uint8Array(ciphertext),
        }),
      )
    },
    catch: unavailableVaultError,
  })

const loadPreparedEncryptedRecord = (
  database: BrowserWalletVaultDatabase,
  walletId: string,
): Effect.Effect<Option.Option<string>, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: () => database.loadPreparedEncryptedRecord(walletId),
    catch: walletVaultStorageError,
  }).pipe(Effect.map(Option.fromNullishOr))

const loadPreparedRecord = (
  database: BrowserWalletVaultDatabase,
  webCrypto: Crypto,
  key: CryptoKey,
  walletId: string,
): Effect.Effect<Option.Option<string>, WalletVaultStorageError> =>
  loadPreparedEncryptedRecord(database, walletId).pipe(
    Effect.flatMap(maybeEncryptedRecord => {
      if (Option.isNone(maybeEncryptedRecord)) {
        return Effect.succeed(Option.none())
      }
      return decryptRecord(
        maybeEncryptedRecord.value,
        database.ownerKey,
        walletId,
        key,
        webCrypto,
      ).pipe(Effect.map(Option.some))
    }),
  )

/** Builds encrypted record storage from browser database and Web Crypto APIs. */
export const makeBrowserWalletVaultStorage = (
  database: BrowserWalletVaultDatabase,
  webCrypto: Crypto,
): WalletVaultStorage => ({
  ownerKey: database.ownerKey,
  custody: WalletVaultStorageCustody.make('CrossProcessSingleWriter'),
  loadRecords: Effect.tryPromise({
    try: database.loadCommittedEncryptedRecords,
    catch: walletVaultStorageError,
  }).pipe(
    Effect.flatMap(records => {
      if (Array_.isReadonlyArrayNonEmpty(records)) {
        return loadOrCreateEncryptionKey(database, webCrypto).pipe(
          Effect.flatMap(key =>
            Effect.forEach(records, ({ walletId, record }) =>
              decryptRecord(
                record,
                database.ownerKey,
                walletId,
                key,
                webCrypto,
              ),
            ),
          ),
        )
      } else {
        return Effect.succeed(emptyWalletRecords)
      }
    }),
  ),
  prepareRecord: (walletId, createRecord) =>
    loadOrCreateEncryptionKey(database, webCrypto).pipe(
      Effect.flatMap(key =>
        loadPreparedRecord(database, webCrypto, key, walletId).pipe(
          Effect.flatMap(maybeExistingRecord => {
            if (Option.isSome(maybeExistingRecord)) {
              return Effect.succeed(maybeExistingRecord.value)
            }
            return Effect.try({
              try: createRecord,
              catch: invalidVaultRecordError,
            }).pipe(
              Effect.flatMap(record =>
                encryptRecord(
                  record,
                  database.ownerKey,
                  walletId,
                  key,
                  webCrypto,
                ).pipe(
                  Effect.flatMap(encryptedRecord =>
                    Effect.tryPromise({
                      try: () =>
                        database.addPreparedEncryptedRecord(
                          walletId,
                          encryptedRecord,
                        ),
                      catch: walletVaultStorageError,
                    }),
                  ),
                  Effect.flatMap(didAddRecord => {
                    if (didAddRecord) {
                      return Effect.succeed(record)
                    }
                    return loadPreparedRecord(
                      database,
                      webCrypto,
                      key,
                      walletId,
                    ).pipe(
                      Effect.flatMap(maybeWinningRecord =>
                        Option.isSome(maybeWinningRecord)
                          ? Effect.succeed(maybeWinningRecord.value)
                          : Effect.fail(unavailableVaultError()),
                      ),
                    )
                  }),
                ),
              ),
            )
          }),
        ),
      ),
    ),
  commitPreparedRecord: (walletId, record) =>
    loadOrCreateEncryptionKey(database, webCrypto).pipe(
      Effect.flatMap(key =>
        loadPreparedEncryptedRecord(database, walletId).pipe(
          Effect.flatMap(maybeEncryptedRecord => {
            if (Option.isNone(maybeEncryptedRecord)) {
              return Effect.fail(invalidVaultRecordError())
            }
            return decryptRecord(
              maybeEncryptedRecord.value,
              database.ownerKey,
              walletId,
              key,
              webCrypto,
            ).pipe(
              Effect.flatMap(existingRecord => {
                if (existingRecord !== record) {
                  return Effect.fail(conflictingVaultRecordError())
                }
                return Effect.tryPromise({
                  try: () =>
                    database.commitPreparedEncryptedRecord(
                      walletId,
                      maybeEncryptedRecord.value,
                    ),
                  catch: walletVaultStorageError,
                }).pipe(
                  Effect.flatMap(didCommit =>
                    didCommit
                      ? Effect.void
                      : Effect.fail(invalidVaultRecordError()),
                  ),
                )
              }),
            )
          }),
        ),
      ),
    ),
})

/** Encrypted origin-local Wallet vault for secure browser contexts. */
export const BrowserWalletVault: Layer.Layer<WalletVault> =
  makePersistentLocalWalletVault(
    byteCount => globalThis.crypto.getRandomValues(new Uint8Array(byteCount)),
    makeBrowserWalletVaultStorage(
      makeIndexedDbWalletVaultDatabase(),
      globalThis.crypto,
    ),
  )

/** Encrypted origin-local Wallet vault, signer, and crypto services. */
export const BrowserWalletResources: Layer.Layer<
  WalletVault | WalletSigner | WalletCrypto
> = makePersistentLocalWalletResources(
  byteCount => globalThis.crypto.getRandomValues(new Uint8Array(byteCount)),
  makeBrowserWalletVaultStorage(
    makeIndexedDbWalletVaultDatabase(),
    globalThis.crypto,
  ),
)
