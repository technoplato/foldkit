import { Effect, Layer, Schema as S } from 'effect'
import { Processor, Runtime } from 'foldkit'

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

const browserInstantEngine = (
  processor: Processor.Host.Host,
  options?: StartLiveCounterOptions,
): Runtime.SyncEngine => {
  const engine = Instant({
    app: FoldkitCounterV01,
    processor,
    ...options,
  })
  if (options?.transport !== undefined) {
    return engine
  }
  return {
    processor: engine.processor,
    read: () => Effect.succeed({ snapshot: undefined, messages: [] }),
    subscribe: enqueue =>
      engine.subscribe(enqueue).pipe(Effect.forkScoped, Effect.asVoid),
    write: engine.write,
  }
}

/**
 * Browser Instant Layer. Caller supplies Host.
 *
 * Instant() opens the browser Instant core. Boot does not wait for
 * Instant `queryOnce` or the first subscribe event. Runtime.start
 * Ready-paints from Program init, then subscribe can catch up.
 * COUNTER_TAPE=memory selects Memory.
 * Pass database only from a native Instant Layer.
 */
export const BrowserLive = (
  processor: Processor.Host.Host,
  options?: StartLiveCounterOptions,
): Layer.Layer<InstantEngine> =>
  Layer.sync(InstantEngine, () => {
    if (isMemoryTape()) {
      return memorySyncedEngine(processor)
    }
    return browserInstantEngine(processor, options)
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
