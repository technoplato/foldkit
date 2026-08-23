import { Layer, Schema as S } from 'effect'
import { Processor } from 'foldkit'

import {
  InstantEngine,
  instantEngineFromLayer,
  isMemoryTape,
} from './instantEngine.js'
import {
  FoldkitPuzzleV01,
  type InstantPuzzleSnapshotLogDatabase,
  InstantPuzzleSnapshotLogSchema,
  InstantSnapshotLogSchema,
  type PuzzleSnapshotLogTransport,
} from './instantSchema.js'
import { InstantPuzzle } from './instantTransport.js'
import {
  MemoryLive,
  type SyncedPuzzleHandle,
  memorySyncedEngine,
  startSyncedPuzzleHandle,
} from './startSynced.js'

export {
  FoldkitPuzzleV01,
  InstantPuzzle as Instant,
  InstantPuzzleSnapshotLogSchema,
  InstantSnapshotLogSchema,
}
export { InstantEngine, MemoryLive, isMemoryTape }
export type { InstantPuzzleSnapshotLogDatabase, PuzzleSnapshotLogTransport }

/** Instant() arguments for one live Puzzle. Layers pass these, not windows. */
export type StartLivePuzzleOptions = Readonly<{
  instance?: string
  database?: InstantPuzzleSnapshotLogDatabase
  transport?: PuzzleSnapshotLogTransport
}>

/**
 * Browser Instant Layer. Caller supplies Host.
 *
 * Instant() opens the browser Instant core. Pass transport or
 * database to skip env resolve. PUZZLE_TAPE=memory selects Memory
 * when neither is passed.
 */
export const BrowserLive = (
  processor: Processor.Host.Host,
  options?: StartLivePuzzleOptions,
): Layer.Layer<InstantEngine> =>
  Layer.sync(InstantEngine, () => {
    if (options?.transport !== undefined || options?.database !== undefined) {
      return InstantPuzzle({
        app: FoldkitPuzzleV01,
        processor,
        ...options,
      })
    }
    if (isMemoryTape()) {
      return memorySyncedEngine(processor)
    }
    return InstantPuzzle({
      app: FoldkitPuzzleV01,
      processor,
      ...options,
    })
  })

/**
 * Starts the Puzzle on Instant for one Processor.
 *
 * Pass a Layer to choose Instant. Pass a Host to use BrowserLive for
 * that Host. startLivePuzzle reads InstantEngine from Context.
 */
export function startLivePuzzle(
  layer: Layer.Layer<InstantEngine>,
): SyncedPuzzleHandle
export function startLivePuzzle(
  processor: Processor.Host.Host,
  options?: StartLivePuzzleOptions,
): SyncedPuzzleHandle
export function startLivePuzzle(
  processorOrLayer: Processor.Host.Host | Layer.Layer<InstantEngine>,
  options?: StartLivePuzzleOptions,
): SyncedPuzzleHandle {
  if (S.is(Processor.Host.Host)(processorOrLayer)) {
    return startSyncedPuzzleHandle(
      instantEngineFromLayer(BrowserLive(processorOrLayer, options)),
    )
  }
  return startSyncedPuzzleHandle(instantEngineFromLayer(processorOrLayer))
}
