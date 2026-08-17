import { Processor, Runtime } from 'foldkit'

import { init } from '@instantdb/core'

import { makeInstantCoreSnapshotLogTransport } from '../snapshotLog/core.js'
import {
  type InstantSnapshotLogDatabase,
  InstantSnapshotLogSchema,
} from '../snapshotLog/snapshotLog.js'
import { type InstantOptions, fromTransport } from './fromTransport.js'

export {
  FoldkitCounterV01,
  fromTransport,
  instantCauseString,
  type InstantApp,
  type InstantOptions,
} from './fromTransport.js'

const resolveDatabase = (
  options: InstantOptions,
): InstantSnapshotLogDatabase => {
  if (options.database !== undefined) {
    return options.database
  }
  return init({
    appId: options.app.id,
    schema: InstantSnapshotLogSchema,
  })
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
  const processor = Processor.Host.print(options.processor)
  if (options.transport !== undefined) {
    return fromTransport(options.transport, processor)
  }
  return fromTransport(
    makeInstantCoreSnapshotLogTransport(resolveDatabase(options)),
    processor,
  )
}
