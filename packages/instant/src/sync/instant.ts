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

const browserLocalSnapshotStore = (
  scope: Runtime.LocalSnapshotScope,
): Option.Option<Runtime.LocalSnapshotStore> =>
  typeof globalThis.indexedDB === 'undefined'
    ? Option.none()
    : Option.some(
        Runtime.LocalSnapshot.indexedDb(
          storageKeyOfScope(scope),
          globalThis.indexedDB,
        ),
      )

/**
 * Instant SyncEngine for a browser Processor.
 *
 * Pass `transport` in tests. Pass `database` when the Host already opened
 * Instant core. Otherwise Instant() opens core from `app.id`.
 *
 * Automatically supplies an IndexedDB-backed local snapshot store when
 * running in a browser with `indexedDB` (never in fake-transport tests).
 *
 * Instant has no Model. Runtime.start reads and writes through Schemas.
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
      browserLocalSnapshotStore,
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
    browserLocalSnapshotStore,
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
