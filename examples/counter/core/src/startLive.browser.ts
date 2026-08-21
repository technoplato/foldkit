import { Layer, Schema as S } from 'effect'
import { Processor } from 'foldkit'

import {
  FoldkitCounterV01,
  Instant,
  InstantSnapshotLogSchema,
  makeMemorySnapshotLogTransport,
} from '@foldkit/instant/browser'
import type {
  InstantSnapshotLogDatabase,
  SnapshotLogTransport,
} from '@foldkit/instant/browser'

import {
  InstantEngine,
  instantEngineFromLayer,
  isMemoryTape,
} from './instantEngine.js'
import {
  MemoryLive,
  type SyncedCounterHandle,
  memorySyncedEngine,
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
 * Browser Instant Layer. Caller supplies Host.
 *
 * Instant() opens the browser Instant core. COUNTER_TAPE=memory
 * selects Memory. Pass database only from a native Instant Layer.
 */
export const BrowserLive = (
  processor: Processor.Host.Host,
  options?: StartLiveCounterOptions,
): Layer.Layer<InstantEngine> =>
  Layer.sync(InstantEngine, () => {
    if (isMemoryTape()) {
      return memorySyncedEngine(processor)
    }
    return Instant({
      app: FoldkitCounterV01,
      processor,
      ...options,
    })
  })

/**
 * Starts the Counter on Instant for one Processor.
 *
 * Pass a Layer to choose Instant. Pass a Host to use BrowserLive for
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
      instantEngineFromLayer(BrowserLive(processorOrLayer, options)),
    )
  }
  return startSyncedCounterHandle(instantEngineFromLayer(processorOrLayer))
}
