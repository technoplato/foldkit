import { Option } from 'effect'
import { Runtime } from 'foldkit'

import { init } from '@instantdb/core'

import {
  makeInstantCoreProgramLogTransport,
  makePinnedOwnerController,
} from '../programLog/core.js'
import { makeInstantSharedSnapshotHooks } from '../programLog/sharedSnapshot.js'
import { makeInstantCoreSnapshotLogTransport } from '../snapshotLog/core.js'
import {
  type InstantSnapshotLogDatabase,
  InstantSnapshotLogSchema,
} from '../snapshotLog/snapshotLog.js'
import {
  type InstantOptions,
  clientFieldsKeptFor,
  engineProcessorId,
  fromTransport,
  instantLinksOf,
  instantRoomOf,
} from './fromTransport.js'
import {
  makeInstantLocalSnapshotHooks,
  storageKeyOfScope,
} from './localSnapshotSupport.js'

export {
  SharedInstantProject,
  engineProcessorId,
  fromTransport,
  instantCauseString,
  instantLinksOf,
  instantRoomOf,
  linkOfInstantStatus,
  type InstantApp,
  type InstantOptions,
} from './fromTransport.js'

type AsyncStorageLike = Readonly<{
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}>

declare const require: (specifier: string) => unknown

const isAsyncStorageLike = (value: unknown): value is AsyncStorageLike =>
  typeof value === 'object' &&
  value !== null &&
  'getItem' in value &&
  typeof value.getItem === 'function' &&
  'setItem' in value &&
  typeof value.setItem === 'function' &&
  'removeItem' in value &&
  typeof value.removeItem === 'function'

const resolveAsyncStorage = (): AsyncStorageLike | undefined => {
  try {
    // NOTE: Metro treats a literal `require(...)` directly inside a `try`
    // block as an optional dependency (`transformer.allowOptionalDependencies`),
    // so React Native apps without AsyncStorage still bundle cleanly.
    const loaded: unknown = require('@react-native-async-storage/async-storage')
    if (typeof loaded !== 'object' || loaded === null) {
      return undefined
    }
    const candidate =
      'default' in loaded &&
      typeof loaded.default === 'object' &&
      loaded.default !== null
        ? loaded.default
        : loaded
    return isAsyncStorageLike(candidate) ? candidate : undefined
  } catch {
    return undefined
  }
}

const nativeLocalSnapshotStore = (
  scope: Runtime.LocalSnapshotScope,
): Option.Option<Runtime.LocalSnapshotStore> => {
  const storage = resolveAsyncStorage()
  if (storage === undefined) {
    return Option.none()
  }
  const key = storageKeyOfScope(scope)
  return Option.some(
    Runtime.LocalSnapshot.fromPromises({
      load: () => storage.getItem(key),
      save: text => storage.setItem(key, text),
      remove: () => storage.removeItem(key),
    }),
  )
}

const coreDatabasesKey = Symbol.for('foldkit.instant.snapshotLog.coreDatabases')

type CoreDatabaseCache = Map<string, InstantSnapshotLogDatabase>

const coreDatabases = (): CoreDatabaseCache => {
  const global = globalThis as typeof globalThis & {
    [coreDatabasesKey]?: CoreDatabaseCache
  }
  const existing = global[coreDatabasesKey]
  if (existing !== undefined) {
    return existing
  }
  const created: CoreDatabaseCache = new Map()
  global[coreDatabasesKey] = created
  return created
}

const openDatabase = (options: InstantOptions): InstantSnapshotLogDatabase => {
  const cache = coreDatabases()
  const existing = cache.get(options.app.id)
  if (existing !== undefined) {
    return existing
  }
  const created = init({
    appId: options.app.id,
    schema: InstantSnapshotLogSchema,
  })
  cache.set(options.app.id, created)
  return created
}

/**
 * Instant SyncEngine for a React Native / Expo Processor.
 *
 * Automatically supplies a lazily-loaded `AsyncStorage`-backed local snapshot
 * store scoped to `(app, log, room, owner)` so Expo apps need zero per-app
 * snapshot wiring and apps without AsyncStorage still bundle cleanly.
 */
export const Instant = (options: InstantOptions): Runtime.SyncEngine => {
  const processor = engineProcessorId(options)
  if (options.transport !== undefined) {
    return fromTransport(options.transport, processor)
  }
  if (options.programLog !== undefined) {
    const database = options.database ?? openDatabase(options)
    const owner = options.owner ?? 'Anyone'
    const pinnedOwner = makePinnedOwnerController(database, owner)
    const snapshotHooks = makeInstantLocalSnapshotHooks(
      options,
      processor,
      owner,
      pinnedOwner,
      nativeLocalSnapshotStore,
    )
    const sharedSnapshotHooks = makeInstantSharedSnapshotHooks(
      database,
      options.programLog,
      instantRoomOf(processor),
      processor,
      owner,
      pinnedOwner,
    )
    return fromTransport(
      makeInstantCoreProgramLogTransport(database, options.programLog, {
        owner,
        pinnedOwner,
      }),
      processor,
      instantLinksOf(database),
      {
        writesSnapshot: false,
        ...snapshotHooks,
        ...sharedSnapshotHooks,
        ...clientFieldsKeptFor(options.app),
      },
    )
  }
  const database = options.database ?? openDatabase(options)
  const pinnedOwner = makePinnedOwnerController(database, 'Anyone')
  const snapshotHooks = makeInstantLocalSnapshotHooks(
    options,
    processor,
    'Anyone',
    pinnedOwner,
    nativeLocalSnapshotStore,
  )
  return fromTransport(
    makeInstantCoreSnapshotLogTransport(
      database,
      options.selectCountId ?? options.countId,
    ),
    processor,
    instantLinksOf(database),
    { ...snapshotHooks, ...clientFieldsKeptFor(options.app) },
  )
}
