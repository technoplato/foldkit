import { Interaction, Program } from 'foldkit'

import { App } from './app.js'
import { ListProjection, MessageWire } from './wire.js'

/**
 * The App wrapped for sync. The Model is Starting until the tape is read,
 * then Ready with the counters, the session, and the stack flat on it.
 */
export const SyncedCounters = Program.compose.sync({
  of: App,
  snapshot: ListProjection,
  message: MessageWire,
})

/** A synced Multiple Counters Model: Starting, Ready, or Failed. */
export type SyncedCountersModel = ReturnType<typeof SyncedCounters.init>[0]

/** A synced Multiple Counters Message. */
export type SyncedCountersMessage = typeof SyncedCounters.Message.Type

/** Live Multiple Counters bound to the generic interaction. */
export type BoundCounters = Interaction.BoundInteraction<
  SyncedCountersModel,
  SyncedCountersMessage
>

/**
 * Binds a live handle to its interaction.
 *
 * @example
 * ```typescript
 * const counters = bindCounters(startCounters(config))
 * counters.press('Increment:1')
 * ```
 */
export const bindCounters = (
  handle: Interaction.ProgramHandle<SyncedCountersModel, SyncedCountersMessage>,
): BoundCounters => Interaction.bind(SyncedCounters, handle)
