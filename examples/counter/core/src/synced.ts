import { Interaction, Program } from 'foldkit'

import { App } from './app.js'
import { CountProjection, MessageWire } from './wire.js'

/**
 * The App wrapped for sync. The Model is Starting until the first snapshot,
 * then Ready with the count and navigation flat on it.
 */
export const SyncedCounter = Program.compose.sync({
  of: App,
  snapshot: CountProjection,
  message: MessageWire,
})

/** A synced Counter Model: Starting, Ready, or Failed. */
export type SyncedCounterModel = ReturnType<typeof SyncedCounter.init>[0]

/** A synced Counter Message: Counter Actions, menu Messages, and sync facts. */
export type SyncedCounterMessage = typeof SyncedCounter.Message.Type

/** A live Counter bound to the generic interaction every Client drives. */
export type BoundCounter = Interaction.BoundInteraction<
  SyncedCounterModel,
  SyncedCounterMessage
>

/**
 * Binds a live Counter handle to its interaction.
 *
 * @example
 * ```typescript
 * const counter = bindCounter(startCounter(config))
 * counter.press('Increment')
 * ```
 */
export const bindCounter = (
  handle: Interaction.ProgramHandle<SyncedCounterModel, SyncedCounterMessage>,
): BoundCounter => Interaction.bind(SyncedCounter, handle)
