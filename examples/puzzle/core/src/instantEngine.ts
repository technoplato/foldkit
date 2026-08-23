import { Context, Effect, Layer } from 'effect'
import type { Runtime } from 'foldkit'

const envValue = (key: string): string | undefined => {
  const runtime = globalThis as typeof globalThis & {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>
    }
  }
  return runtime.process?.env?.[key]
}

/** True when PUZZLE_TAPE or EXPO_PUBLIC_PUZZLE_TAPE is memory. */
export const isMemoryTape = (): boolean =>
  envValue('PUZZLE_TAPE') === 'memory' ||
  envValue('EXPO_PUBLIC_PUZZLE_TAPE') === 'memory'

/** Local file tape path. Empty and missing both mean no file tape. */
export const puzzleTapePath = (): string | undefined => {
  const value = envValue('PUZZLE_TAPE_PATH')
  if (value === undefined || value === '') {
    return undefined
  }
  return value
}

/**
 * Instant SyncEngine for this Processor.
 *
 * Live vs Memory is a Layer. Instant() may build the engine inside a
 * Layer. startLivePuzzle reads this service. Windows do not.
 */
export class InstantEngine extends Context.Service<
  InstantEngine,
  Runtime.SyncEngine
>()('Puzzle/InstantEngine') {}

/** Builds the Instant SyncEngine from one Layer. */
export const instantEngineFromLayer = (
  layer: Layer.Layer<InstantEngine>,
): Runtime.SyncEngine =>
  Effect.runSync(Effect.service(InstantEngine).pipe(Effect.provide(layer)))
