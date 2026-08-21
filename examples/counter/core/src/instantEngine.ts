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

/** True when COUNTER_TAPE or EXPO_PUBLIC_COUNTER_TAPE is memory. */
export const isMemoryTape = (): boolean =>
  envValue('COUNTER_TAPE') === 'memory' ||
  envValue('EXPO_PUBLIC_COUNTER_TAPE') === 'memory'

/**
 * Instant SyncEngine for this Processor.
 *
 * Live vs Memory is a Layer. Instant() may build the engine inside a
 * Layer. startLiveCounter reads this service. Windows do not.
 */
export class InstantEngine extends Context.Service<
  InstantEngine,
  Runtime.SyncEngine
>()('Counter/InstantEngine') {}

/** Builds the Instant SyncEngine from one Layer. */
export const instantEngineFromLayer = (
  layer: Layer.Layer<InstantEngine>,
): Runtime.SyncEngine =>
  Effect.runSync(Effect.service(InstantEngine).pipe(Effect.provide(layer)))
