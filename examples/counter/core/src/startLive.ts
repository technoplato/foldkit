import { Layer, Schema as S } from 'effect'
import { Processor } from 'foldkit'

import {
  FoldkitCounterV01,
  Instant,
  InstantSnapshotLogSchema,
  SnapshotLogError,
  listFileCountSnapshots,
  makeAdminSnapshotLogTransport,
  makeMemorySnapshotLogTransport,
  resolveInstantSyncEngine,
} from '@foldkit/instant'
import type {
  InstantSnapshotLogDatabase,
  SnapshotLogTransport,
} from '@foldkit/instant'

import {
  InstantEngine,
  instantEngineFromLayer,
  isMemoryTape,
} from './instantEngine.js'
import {
  MemoryLive,
  type SyncedCounterHandle,
  startSyncedCounterHandle,
} from './startSynced.js'
import { namedCountId, resolveCountIdFromRows } from './share.js'
import { activeCountId } from './wire.js'

export {
  FoldkitCounterV01,
  Instant,
  InstantSnapshotLogSchema,
  SnapshotLogError,
  makeAdminSnapshotLogTransport,
  makeMemorySnapshotLogTransport,
}
export { InstantEngine, MemoryLive, isMemoryTape }
export type { InstantSnapshotLogDatabase, SnapshotLogTransport }

/** Instant() arguments for one live Counter. Layers pass these, not windows. */
export type StartLiveCounterOptions = Readonly<{
  instance?: string
  database?: InstantSnapshotLogDatabase
  transport?: SnapshotLogTransport
}>

/**
 * Node Instant Layer. Caller supplies Host.
 *
 * COUNTER_TAPE=memory selects Memory. COUNTER_TAPE_PATH uses a file
 * tape. Pass transport or database to skip env resolve.
 */
export const NodeLive = (
  processor: Processor.Host.Host,
  options?: StartLiveCounterOptions,
): Layer.Layer<InstantEngine> =>
  Layer.sync(InstantEngine, () => {
    if (options?.transport !== undefined || options?.database !== undefined) {
      return Instant({
        app: FoldkitCounterV01,
        processor,
        ...options,
      })
    }
    const shareName = process.env['COUNTER_SHARE_NAME']
    const isCreate = process.env['COUNTER_SHARE_CREATE'] === '1'
    if (isCreate && shareName !== undefined && shareName !== '') {
      process.env['COUNTER_COUNT_ID'] = namedCountId(shareName)
    }
    const tapePath = process.env['COUNTER_TAPE_PATH']
    if (tapePath !== undefined && tapePath !== '') {
      process.env['COUNTER_COUNT_ID'] = resolveCountIdFromRows(
        listFileCountSnapshots(tapePath),
      )
    }
    const instance = options?.instance ?? process.env['COUNTER_INSTANT_ROOM']
    const selectCountId =
      shareName !== undefined &&
      shareName !== '' &&
      !isCreate &&
      (tapePath === undefined || tapePath === '')
        ? (
            rows: ReadonlyArray<{
              readonly id: string
              readonly name?: string
              readonly owner?: string
              readonly granted?: string
            }>,
          ) => {
            const id = resolveCountIdFromRows(rows)
            process.env['COUNTER_COUNT_ID'] = id
            return id
          }
        : undefined
    return resolveInstantSyncEngine({
      app: FoldkitCounterV01,
      processor,
      ...(instance === undefined || instance === '' ? {} : { instance }),
      countId: activeCountId(),
      ...(selectCountId === undefined ? {} : { selectCountId }),
    })
  })

/**
 * Browser Instant Layer name. On Node this is NodeLive so both
 * package entries export the same surface names.
 */
export const BrowserLive = NodeLive

/**
 * Starts the Counter on Instant for one Processor.
 *
 * Pass a Layer to choose Instant. Pass a Host to use NodeLive for
 * that Host. startLiveCounter reads InstantEngine from Context.
 */
export function startLiveCounter(
  layer: Layer.Layer<InstantEngine>,
): SyncedCounterHandle
export function startLiveCounter(
  processor: Processor.Host.Host,
  options?: StartLiveCounterOptions,
): SyncedCounterHandle
export function startLiveCounter(
  processorOrLayer: Processor.Host.Host | Layer.Layer<InstantEngine>,
  options?: StartLiveCounterOptions,
): SyncedCounterHandle {
  if (S.is(Processor.Host.Host)(processorOrLayer)) {
    return startSyncedCounterHandle(
      instantEngineFromLayer(NodeLive(processorOrLayer, options)),
    )
  }
  return startSyncedCounterHandle(instantEngineFromLayer(processorOrLayer))
}
