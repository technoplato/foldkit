import { Effect } from 'effect'

import type {
  MultipleCountersV3LocalIdentityEnvironment,
  MultipleCountersV3LocalIdentityStore,
} from '../client/localIdentity.js'

const databaseName = 'foldkit-instant-multiple-counters-v3'
const databaseVersion = 1
const secretsStoreName = 'origin-secrets'
const sequencesStoreName = 'actor-sequences'

const requestValue = <Value>(request: IDBRequest<Value>): Promise<Value> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    )
  })

const transactionCompletion = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB aborted.')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB failed.')),
      { once: true },
    )
  })

const openIdentityDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.addEventListener(
      'upgradeneeded',
      () => {
        const database = request.result
        if (!database.objectStoreNames.contains(secretsStoreName)) {
          database.createObjectStore(secretsStoreName)
        }
        if (!database.objectStoreNames.contains(sequencesStoreName)) {
          database.createObjectStore(sequencesStoreName)
        }
      },
      { once: true },
    )
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB could not open.')),
      { once: true },
    )
  })

const nextActorSequence = (positionKey: string): Promise<number> =>
  openIdentityDatabase().then(async database => {
    try {
      const transaction = database.transaction(sequencesStoreName, 'readwrite')
      const store = transaction.objectStore(sequencesStoreName)
      const current = await requestValue(store.get(positionKey))
      const nextSequence = typeof current === 'number' ? current + 1 : 1
      store.put(nextSequence, positionKey)
      await transactionCompletion(transaction)
      return nextSequence
    } finally {
      database.close()
    }
  })

const readOrCreateValue = (name: string, candidate: string): Promise<string> =>
  openIdentityDatabase().then(async database => {
    try {
      const transaction = database.transaction(secretsStoreName, 'readwrite')
      const store = transaction.objectStore(secretsStoreName)
      const current = await requestValue(store.get(name))
      const secret = typeof current === 'string' ? current : candidate
      if (typeof current !== 'string') {
        store.put(secret, name)
      }
      await transactionCompletion(transaction)
      return secret
    } finally {
      database.close()
    }
  })

/** Browser IndexedDB vault with atomic cross-tab sequence and secret allocation. */
export const makeBrowserMultipleCountersV3LocalIdentityStore =
  (): MultipleCountersV3LocalIdentityStore => ({
    nextActorSequence: positionKey =>
      Effect.tryPromise(() => nextActorSequence(positionKey)),
    readOrCreateValue: (name, create) =>
      create.pipe(
        Effect.flatMap(candidate =>
          Effect.tryPromise(() => readOrCreateValue(name, candidate)),
        ),
      ),
  })

/** Browser entropy, UUID, and clock sources used only by the host controller. */
export const browserMultipleCountersV3LocalIdentityEnvironment =
  (): MultipleCountersV3LocalIdentityEnvironment => ({
    now: Date.now,
    randomBytes: () => crypto.getRandomValues(new Uint8Array(32)),
    randomUuid: () => crypto.randomUUID(),
  })
