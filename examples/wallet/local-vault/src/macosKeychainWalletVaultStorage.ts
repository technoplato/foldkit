import { Array as Array_, Effect, Option, Schema as S, Semaphore } from 'effect'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { AsyncEntry } from '@napi-rs/keyring'

import {
  WalletVaultOwnerKey,
  type WalletVaultStorage,
  WalletVaultStorageCustody,
  WalletVaultStorageError,
  localWalletVaultOwnerKey,
  makeWalletVaultOwnerPartitionKey,
} from './localWalletVault.js'

const keychainService = 'com.foldkit.wallet.local-vault.v1'
const walletIndexAccount = 'wallet-index'
const walletRecordAccountPrefix = 'wallet-record:'
const WalletRecordIndex = S.Array(S.String)
const WalletRecordIndexJson = S.fromJsonString(WalletRecordIndex)
const storageSemaphoreByService = new Map<string, Semaphore.Semaphore>()
const custodyLockTimeoutSeconds = 30

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

const validatedOwnerKey = (ownerKey: unknown): WalletVaultOwnerKey => {
  try {
    return S.decodeUnknownSync(WalletVaultOwnerKey)(ownerKey)
  } catch {
    throw invalidStorageRecord()
  }
}

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

const custodyLockPath = (
  service: string,
  ownerKey: WalletVaultOwnerKey,
): string => {
  const partitionDigest = createHash('sha256')
    .update(service)
    .update('\u0000')
    .update(ownerKey)
    .digest('hex')
  return join(
    homedir(),
    'Library',
    'Caches',
    'Foldkit',
    'wallet-keychain-locks',
    `${partitionDigest}.lock`,
  )
}

const acquireCustodyLock = (
  lockPath: string,
): Effect.Effect<ChildProcessWithoutNullStreams, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: async signal => {
      const lockDirectory = dirname(lockPath)
      await mkdir(lockDirectory, { mode: 0o700, recursive: true })
      await chmod(lockDirectory, 0o700)
      return new Promise((resolve, reject) => {
        const handshake = `${randomUUID()}\n`
        const lockProcess = spawn('/usr/bin/lockf', [
          '-k',
          '-t',
          String(custodyLockTimeoutSeconds),
          lockPath,
          '/bin/cat',
        ])
        let response = ''
        const removeListeners = () => {
          signal.removeEventListener('abort', handleAbort)
          lockProcess.removeListener('error', handleError)
          lockProcess.removeListener('exit', handleExit)
          lockProcess.stdout.removeListener('data', handleData)
        }
        const rejectAndStop = (error: unknown) => {
          removeListeners()
          lockProcess.kill()
          reject(error)
        }
        const handleAbort = () => {
          rejectAndStop(new Error('Interrupted Wallet custody lock'))
        }
        const handleError = (error: Error) => {
          rejectAndStop(error)
        }
        const handleExit = () => {
          rejectAndStop(new Error('Wallet custody lock unavailable'))
        }
        const handleData = (chunk: Buffer) => {
          response += chunk.toString('utf8')
          if (response.includes(handshake)) {
            removeListeners()
            resolve(lockProcess)
          }
        }
        signal.addEventListener('abort', handleAbort, { once: true })
        lockProcess.once('error', handleError)
        lockProcess.once('exit', handleExit)
        lockProcess.stdout.on('data', handleData)
        lockProcess.stdin.write(handshake)
      })
    },
    catch: unavailableStorage,
  })

const custodyLockFailure = (
  lockProcess: ChildProcessWithoutNullStreams,
): Effect.Effect<never, WalletVaultStorageError> =>
  Effect.tryPromise({
    try: signal =>
      new Promise((_, reject) => {
        let isSettled = false
        const removeListeners = () => {
          signal.removeEventListener('abort', handleAbort)
          lockProcess.removeListener('exit', handleExit)
        }
        const handleExit = () => {
          if (isSettled) {
            return
          }
          isSettled = true
          removeListeners()
          reject(new Error('Wallet custody lock was lost'))
        }
        const handleAbort = () => {
          isSettled = true
          removeListeners()
        }
        signal.addEventListener('abort', handleAbort, { once: true })
        lockProcess.once('exit', handleExit)
        if (lockProcess.exitCode !== null || lockProcess.signalCode !== null) {
          handleExit()
        }
      }),
    catch: unavailableStorage,
  })

const releaseCustodyLock = (
  lockProcess: ChildProcessWithoutNullStreams,
): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise(resolve => {
        if (lockProcess.exitCode !== null || lockProcess.signalCode !== null) {
          resolve()
        } else {
          lockProcess.once('exit', () => {
            resolve()
          })
          lockProcess.stdin.end()
        }
      }),
  )

const withCrossProcessCustody = <A, E, R>(
  lockPath: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | WalletVaultStorageError, R> =>
  Effect.acquireUseRelease(
    acquireCustodyLock(lockPath),
    lockProcess => Effect.raceFirst(effect, custodyLockFailure(lockProcess)),
    releaseCustodyLock,
  )

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

const confirmPreparedRecord = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  walletId: string,
  record: string,
): Effect.Effect<string, WalletVaultStorageError> =>
  loadKeychainItem(entryFactory, service, walletRecordAccount(walletId)).pipe(
    Effect.flatMap(maybeRecord => {
      if (Option.isSome(maybeRecord) && maybeRecord.value === record) {
        return Effect.succeed(record)
      } else {
        return Effect.fail(invalidStorageRecord())
      }
    }),
  )

const prepareRecordUnsafe = (
  entryFactory: MacOSKeychainEntryFactory,
  service: string,
  walletId: string,
  createRecord: () => string,
): Effect.Effect<string, WalletVaultStorageError> =>
  loadKeychainItem(entryFactory, service, walletRecordAccount(walletId)).pipe(
    Effect.flatMap(maybeRecord => {
      if (Option.isSome(maybeRecord)) {
        return Effect.succeed(maybeRecord.value)
      } else {
        return Effect.try({
          try: createRecord,
          catch: invalidStorageRecord,
        }).pipe(
          Effect.flatMap(record =>
            saveKeychainItem(
              entryFactory,
              service,
              walletRecordAccount(walletId),
              record,
            ).pipe(
              Effect.as(record),
              Effect.catch(writeError =>
                confirmPreparedRecord(
                  entryFactory,
                  service,
                  walletId,
                  record,
                ).pipe(Effect.catch(() => Effect.fail(writeError))),
              ),
            ),
          ),
        )
      }
    }),
  )

const commitPreparedRecordUnsafe = (
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
          } else {
            return Effect.fail(invalidStorageRecord())
          }
        }),
      ),
    ),
  )

/** Native Keychain entry factory used by local and till vaults. */
export const nativeKeychainEntryFactory: MacOSKeychainEntryFactory = (
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
  ownerKey: unknown,
  service = keychainService,
): WalletVaultStorage => {
  const validatedOwner = validatedOwnerKey(ownerKey)
  const ownedEntryFactory = entryFactoryForOwner(entryFactory, validatedOwner)
  const storageSemaphore = storageSemaphoreForService(service, validatedOwner)
  const lockPath = custodyLockPath(service, validatedOwner)
  const withCustody = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | WalletVaultStorageError, R> =>
    storageSemaphore.withPermit(
      process.platform === 'darwin'
        ? withCrossProcessCustody(lockPath, effect)
        : effect,
    )
  return {
    ownerKey: validatedOwner,
    custody: WalletVaultStorageCustody.make(
      process.platform === 'darwin'
        ? 'CrossProcessSingleWriter'
        : 'ProcessLocal',
    ),
    loadRecords: withCustody(loadRecordsUnsafe(ownedEntryFactory, service)),
    prepareRecord: (walletId, createRecord) =>
      withCustody(
        prepareRecordUnsafe(ownedEntryFactory, service, walletId, createRecord),
      ),
    commitPreparedRecord: (walletId, record) =>
      withCustody(
        commitPreparedRecordUnsafe(
          ownedEntryFactory,
          service,
          walletId,
          record,
        ),
      ),
  }
}

/** Builds local-only Wallet persistence backed by macOS Keychain. */
export const makeLocalMacOSKeychainWalletVaultStorage = (
  entryFactory: MacOSKeychainEntryFactory,
  service = keychainService,
): WalletVaultStorage =>
  makeMacOSKeychainWalletVaultStorage(
    entryFactory,
    localWalletVaultOwnerKey,
    service,
  )

/** Builds owner-partitioned Wallet persistence backed by macOS Keychain. */
export const makeOwnerPartitionMacOSKeychainWalletVaultStorage = (
  entryFactory: MacOSKeychainEntryFactory,
  ownerKey: unknown,
  service = keychainService,
): WalletVaultStorage =>
  makeMacOSKeychainWalletVaultStorage(
    entryFactory,
    makeWalletVaultOwnerPartitionKey(ownerKey),
    service,
  )

/** Wallet record persistence backed by the current user's macOS Keychain. */
export const MacOSKeychainWalletVaultStorage: WalletVaultStorage =
  makeLocalMacOSKeychainWalletVaultStorage(nativeKeychainEntryFactory)
