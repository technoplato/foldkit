import { Runtime } from 'foldkit'

import { makeAdminSnapshotLogTransport } from '../snapshotLog/admin.js'
import { makeInstantCoreSnapshotLogTransport } from '../snapshotLog/core.js'
import {
  type InstantOptions,
  engineProcessorId,
  fromTransport,
  missingAdminToken,
} from './fromTransport.js'

export {
  FoldkitCounterV01,
  engineProcessorId,
  fromTransport,
  instantCauseString,
  type InstantApp,
  type InstantOptions,
} from './fromTransport.js'

const adminTokenFromEnv = (): string | undefined => {
  const token = process.env['INSTANT_APP_ADMIN_TOKEN']
  if (token === undefined || token === '') {
    return undefined
  }
  return token
}

/**
 * Instant SyncEngine for a trusted Node Processor.
 *
 * Pass `transport` in tests. Otherwise Instant() uses the admin token from
 * the trusted wrapper. Instant never prints that token.
 *
 * Instant has no Model. Runtime.start reads and writes through Schemas.
 */
export const Instant = (options: InstantOptions): Runtime.SyncEngine => {
  const processor = engineProcessorId(options)
  if (options.transport !== undefined) {
    return fromTransport(options.transport, processor)
  }
  if (options.database !== undefined) {
    return fromTransport(
      makeInstantCoreSnapshotLogTransport(options.database),
      processor,
    )
  }
  const adminToken = adminTokenFromEnv()
  if (adminToken === undefined) {
    return missingAdminToken(processor)
  }
  return fromTransport(
    makeAdminSnapshotLogTransport(options.app.id, adminToken, options.countId),
    processor,
  )
}
