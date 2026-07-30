import { Array as Array_, Effect, Layer, Schema as S } from 'effect'
import {
  WalletCrypto,
  WalletSigner,
  WalletVault,
  WalletVaultError,
} from 'wallet-core-example'
import {
  type WalletVaultStorage,
  makePersistentLocalWalletResources,
  makePersistentLocalWalletVault,
} from 'wallet-local-vault-example'

const walletDatabaseName = 'foldkit-wallet-vault'
const walletDatabaseVersion = 1
const keyStoreName = 'encryption-keys'
const recordStoreName = 'wallet-records'
const encryptionKeyId = 'wallet-vault-aes-gcm-v1'
const additionalData = new TextEncoder().encode('Foldkit Wallet Vault v1')
const initializationVectorByteCount = 12

const EncryptedWalletRecord = S.Struct({
  version: S.Literal(1),
  initializationVector: S.Uint8ArrayFromBase64,
  ciphertext: S.Uint8ArrayFromBase64,
})
const EncryptedWalletRecordJson = S.fromJsonString(EncryptedWalletRecord)
const EncryptedWalletRecords = S.Array(S.String)
const emptyWalletRecords: ReadonlyArray<string> = []

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  Uint8Array.from(bytes).buffer

/** Minimal durable browser database used by the encrypted Wallet vault. */
export type BrowserWalletVaultDatabase = Readonly<{
  loadEncryptionKey: () => Promise<CryptoKey | undefined>
  addEncryptionKey: (key: CryptoKey) => Promise<boolean>
  loadEncryptedRecords: () => Promise<ReadonlyArray<string>>
  saveEncryptedRecord: (walletId: string, record: string) => Promise<void>
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

const openWalletDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(
      walletDatabaseName,
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
      },
      { once: true },
    )
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB open failed')),
      { once: true },
    )
  })

/** Builds the origin-local IndexedDB implementation used by browser hosts. */
export const makeIndexedDbWalletVaultDatabase =
  (): BrowserWalletVaultDatabase => {
    let databasePromise: Promise<IDBDatabase> | undefined
    const database = () => {
      databasePromise ??= openWalletDatabase()
      return databasePromise
    }

    return {
      loadEncryptionKey: async () => {
        const walletDatabase = await database()
        const transaction = walletDatabase.transaction(keyStoreName, 'readonly')
        return requestResult<CryptoKey | undefined>(
          transaction.objectStore(keyStoreName).get(encryptionKeyId),
        )
      },
      addEncryptionKey: async key => {
        const walletDatabase = await database()
        const transaction = walletDatabase.transaction(
          keyStoreName,
          'readwrite',
        )
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
          if (
            error instanceof DOMException &&
            error.name === 'ConstraintError'
          ) {
            return false
          } else {
            throw error
          }
        }
      },
      loadEncryptedRecords: async () => {
        const walletDatabase = await database()
        const transaction = walletDatabase.transaction(
          recordStoreName,
          'readonly',
        )
        const records = await requestResult(
          transaction.objectStore(recordStoreName).getAll(),
        )
        return S.decodeUnknownSync(EncryptedWalletRecords)(records)
      },
      saveEncryptedRecord: async (walletId, record) => {
        const walletDatabase = await database()
        const transaction = walletDatabase.transaction(
          recordStoreName,
          'readwrite',
        )
        transaction.objectStore(recordStoreName).put(record, walletId)
        await transactionCompletion(transaction)
      },
    }
  }

const unavailableVaultError = () =>
  new WalletVaultError({ code: 'Unavailable' })

const invalidVaultRecordError = () =>
  new WalletVaultError({ code: 'InvalidKeyMaterial' })

const loadOrCreateEncryptionKey = (
  database: BrowserWalletVaultDatabase,
  webCrypto: Crypto,
): Effect.Effect<CryptoKey, WalletVaultError> =>
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
    catch: unavailableVaultError,
  })

const decryptRecord = (
  record: string,
  key: CryptoKey,
  webCrypto: Crypto,
): Effect.Effect<string, WalletVaultError> =>
  Effect.tryPromise({
    try: async () => {
      const encrypted = S.decodeUnknownSync(EncryptedWalletRecordJson)(record)
      const plaintext = await webCrypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(encrypted.initializationVector),
          additionalData: arrayBuffer(additionalData),
        },
        key,
        arrayBuffer(encrypted.ciphertext),
      )
      return new TextDecoder().decode(plaintext)
    },
    catch: invalidVaultRecordError,
  })

/** Builds encrypted record storage from browser database and Web Crypto APIs. */
export const makeBrowserWalletVaultStorage = (
  database: BrowserWalletVaultDatabase,
  webCrypto: Crypto,
): WalletVaultStorage => ({
  loadRecords: Effect.tryPromise({
    try: database.loadEncryptedRecords,
    catch: unavailableVaultError,
  }).pipe(
    Effect.flatMap(records => {
      if (Array_.isReadonlyArrayNonEmpty(records)) {
        return loadOrCreateEncryptionKey(database, webCrypto).pipe(
          Effect.flatMap(key =>
            Effect.forEach(records, record =>
              decryptRecord(record, key, webCrypto),
            ),
          ),
        )
      } else {
        return Effect.succeed(emptyWalletRecords)
      }
    }),
  ),
  saveRecord: (walletId, record) =>
    loadOrCreateEncryptionKey(database, webCrypto).pipe(
      Effect.flatMap(key =>
        Effect.tryPromise({
          try: async () => {
            const initializationVector = webCrypto.getRandomValues(
              new Uint8Array(initializationVectorByteCount),
            )
            const ciphertext = await webCrypto.subtle.encrypt(
              {
                name: 'AES-GCM',
                iv: arrayBuffer(initializationVector),
                additionalData: arrayBuffer(additionalData),
              },
              key,
              arrayBuffer(new TextEncoder().encode(record)),
            )
            const encryptedRecord = S.encodeSync(EncryptedWalletRecordJson)(
              EncryptedWalletRecord.make({
                version: 1,
                initializationVector,
                ciphertext: new Uint8Array(ciphertext),
              }),
            )
            await database.saveEncryptedRecord(walletId, encryptedRecord)
          },
          catch: unavailableVaultError,
        }),
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
