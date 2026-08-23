import { Layer, Schema as S } from 'effect'
import { Processor } from 'foldkit'

import { InstantPuzzle } from './instantAdmin.js'
import {
  InstantEngine,
  instantEngineFromLayer,
  isMemoryTape,
  puzzleTapePath,
} from './instantEngine.js'
import { makeFilePuzzleSnapshotLogTransport } from './instantFile.js'
import {
  FoldkitPuzzleV01,
  type InstantPuzzleSnapshotLogDatabase,
  InstantPuzzleSnapshotLogSchema,
  InstantSnapshotLogSchema,
  type PuzzleSnapshotLogTransport,
} from './instantSchema.js'
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
export { InstantEngine, MemoryLive, isMemoryTape, puzzleTapePath }
export { makeAdminPuzzleSnapshotLogTransport } from './instantAdmin.js'
export { makeFilePuzzleSnapshotLogTransport } from './instantFile.js'
export type { InstantPuzzleSnapshotLogDatabase, PuzzleSnapshotLogTransport }

/** Instant() arguments for one live Puzzle. Layers pass these, not windows. */
export type StartLivePuzzleOptions = Readonly<{
  instance?: string
  database?: InstantPuzzleSnapshotLogDatabase
  transport?: PuzzleSnapshotLogTransport
}>

/**
 * Node Instant Layer. Caller supplies Host.
 *
 * Pass transport or database to skip env resolve. PUZZLE_TAPE=memory
 * selects Memory. PUZZLE_TAPE_PATH uses a file tape. Live Instant is
 * the default when neither is passed.
 */
export const NodeLive = (
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
    const tapePath = puzzleTapePath()
    if (tapePath !== undefined) {
      return InstantPuzzle({
        app: FoldkitPuzzleV01,
        processor,
        transport: makeFilePuzzleSnapshotLogTransport(tapePath),
        ...(options?.instance === undefined
          ? {}
          : { instance: options.instance }),
      })
    }
    return InstantPuzzle({
      app: FoldkitPuzzleV01,
      processor,
      ...options,
    })
  })

/**
 * Browser Instant Layer name. On Node this is NodeLive so both
 * package entries export the same surface names.
 */
export const BrowserLive = NodeLive

/**
 * Starts the Puzzle on Instant for one Processor.
 *
 * Pass a Layer to choose Instant. Pass a Host to use NodeLive for
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
      instantEngineFromLayer(NodeLive(processorOrLayer, options)),
    )
  }
  return startSyncedPuzzleHandle(instantEngineFromLayer(processorOrLayer))
}
