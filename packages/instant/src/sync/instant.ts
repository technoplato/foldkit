import { Runtime } from 'foldkit'

import { init } from '@instantdb/core'

import { makeInstantCoreSnapshotLogTransport } from '../snapshotLog/core.js'
import {
  type InstantSnapshotLogDatabase,
  InstantSnapshotLogSchema,
} from '../snapshotLog/snapshotLog.js'
import {
  type InstantOptions,
  engineProcessorId,
  fromTransport,
} from './fromTransport.js'

export {
  FoldkitCounterV01,
  engineProcessorId,
  fromTransport,
  instantCauseString,
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

const resolveDatabase = (
  options: InstantOptions,
): InstantSnapshotLogDatabase => {
  if (options.database !== undefined) {
    return options.database
  }
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
 * Instant SyncEngine for a browser Processor.
 *
 * Pass `transport` in tests. Pass `database` when the Host already opened
 * Instant core. Otherwise Instant() opens core from `app.id`.
 *
 * Instant has no Model. Runtime.start reads and writes through Schemas.
 */
export const Instant = (options: InstantOptions): Runtime.SyncEngine => {
  const processor = engineProcessorId(options)
  if (options.transport !== undefined) {
    return fromTransport(options.transport, processor)
  }
  return fromTransport(
    makeInstantCoreSnapshotLogTransport(resolveDatabase(options)),
    processor,
  )
}
