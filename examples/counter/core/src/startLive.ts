import { Layer, Schema as S } from 'effect'
import { Processor } from 'foldkit'

import {
  FoldkitCounterV01,
  Instant,
  InstantSnapshotLogSchema,
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

export {
  FoldkitCounterV01,
  Instant,
  InstantSnapshotLogSchema,
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
    return resolveInstantSyncEngine({
      app: FoldkitCounterV01,
      processor,
      ...(options?.instance === undefined
        ? {}
        : { instance: options.instance }),
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
