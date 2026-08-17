import {
  FailedCounterSession,
  SignedInCounterSession,
  describeCounterWindowError,
} from 'counter-core-example'

import {
  type InstantSnapshotLogDatabase,
  InstantSnapshotLogSchema,
  makeInstantCoreSnapshotLogTransport,
} from '@foldkit/instant/browser'
import { init } from '@instantdb/core'

import { openSnapshotCounterWindowTape } from './snapshot.js'

export {
  type CounterSnapshotCommit,
  commitCounterSnapshotMessage,
  decodeCounterLogMessage,
  openSnapshotCounterWindowTape,
  readCounterSnapshotModel,
} from './snapshot.js'

/** Opens the Instant snapshot-log schema used by every Counter browser Processor. */
export const makeCounterInstantDatabase = (
  appId: string,
): InstantSnapshotLogDatabase =>
  init({ appId, schema: InstantSnapshotLogSchema })

/** Signs one Counter Processor into the dedicated V0.1 Instant app. */
export const signInCounterWindowSession = async () =>
  SignedInCounterSession.make({ userId: 'count' })

/** Opens the live Instant Counter snapshot log for one Processor. */
export const openLiveCounterWindowTape = (
  database: InstantSnapshotLogDatabase,
  processorId: string,
  _userId?: string,
) =>
  openSnapshotCounterWindowTape(
    makeInstantCoreSnapshotLogTransport(database),
    processorId,
  )

export { describeCounterWindowError, FailedCounterSession }
