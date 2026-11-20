import { Option } from 'effect'
import { Runtime } from 'foldkit'
import { localSnapshotFile } from 'foldkit/cli'
import { join } from 'node:path'

import { stateDirectoryOf } from '../nodeDatabase/nodeDatabase.js'
import { makeAdminProgramLogTransport } from '../programLog/admin.js'
import {
  makeInstantCoreProgramLogTransport,
  makePinnedOwnerController,
} from '../programLog/core.js'
import { makeInstantSharedSnapshotHooks } from '../programLog/sharedSnapshot.js'
import { makeAdminSnapshotLogTransport } from '../snapshotLog/admin.js'
import { makeInstantCoreSnapshotLogTransport } from '../snapshotLog/core.js'
import {
  type InstantOptions,
  engineProcessorId,
  fromTransport,
  instantLinksOf,
  instantRoomOf,
  missingAdminToken,
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

const nodeLocalSnapshotStoreOf =
  (database: unknown) =>
  (
    scope: Runtime.LocalSnapshotScope,
  ): Option.Option<Runtime.LocalSnapshotStore> =>
    Option.map(stateDirectoryOf(database), stateDirectory =>
      localSnapshotFile(
        join(stateDirectory, 'snapshots', `${storageKeyOfScope(scope)}.json`),
      ),
    )

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
  if (options.programLog !== undefined && options.database !== undefined) {
    const owner = options.owner ?? 'Anyone'
    const pinnedOwner = makePinnedOwnerController(options.database, owner)
    const snapshotHooks = makeInstantLocalSnapshotHooks(
      options,
      processor,
      owner,
      pinnedOwner,
      nodeLocalSnapshotStoreOf(options.database),
    )
    const sharedSnapshotHooks = makeInstantSharedSnapshotHooks(
      options.database,
      options.programLog,
      instantRoomOf(processor),
      processor,
      owner,
      pinnedOwner,
    )
    return fromTransport(
      makeInstantCoreProgramLogTransport(options.database, options.programLog, {
        owner,
        pinnedOwner,
      }),
      processor,
      instantLinksOf(options.database),
      { writesSnapshot: false, ...snapshotHooks, ...sharedSnapshotHooks },
    )
  }
  if (options.programLog === undefined && options.database !== undefined) {
    const pinnedOwner = makePinnedOwnerController(options.database, 'Anyone')
    const snapshotHooks = makeInstantLocalSnapshotHooks(
      options,
      processor,
      'Anyone',
      pinnedOwner,
      nodeLocalSnapshotStoreOf(options.database),
    )
    return fromTransport(
      makeInstantCoreSnapshotLogTransport(
        options.database,
        options.selectCountId ?? options.countId,
      ),
      processor,
      instantLinksOf(options.database),
      snapshotHooks,
    )
  }
  const adminToken = adminTokenFromEnv()
  if (adminToken === undefined) {
    return missingAdminToken(processor)
  }
  if (options.programLog !== undefined) {
    return fromTransport(
      makeAdminProgramLogTransport(
        options.app.id,
        adminToken,
        options.programLog,
      ),
      processor,
      undefined,
      { writesSnapshot: false },
    )
  }
  return fromTransport(
    makeAdminSnapshotLogTransport(
      options.app.id,
      adminToken,
      options.selectCountId ?? options.countId,
    ),
    processor,
  )
}
