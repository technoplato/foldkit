import { Interaction, Program } from 'foldkit'

import { App } from './app.js'
import { MessageWire, RemindersProjection } from './wire.js'

/**
 * The App wrapped for sync. The Model is Starting until the log is read,
 * then Ready with the reminders, the session, and the stack flat on it.
 */
export const SyncedReminders = Program.compose.sync({
  of: App,
  snapshot: RemindersProjection,
  message: MessageWire,
})

/** A synced Reminders Model: Starting, Ready, or Failed. */
export type SyncedRemindersModel = ReturnType<typeof SyncedReminders.init>[0]

/** A synced Reminders Message. */
export type SyncedRemindersMessage = typeof SyncedReminders.Message.Type

/** Live Reminders bound to the generic interaction. */
export type BoundReminders = Interaction.BoundInteraction<
  SyncedRemindersModel,
  SyncedRemindersMessage
>

/**
 * Binds a live handle to its interaction.
 *
 * @example
 * ```typescript
 * const reminders = bindReminders(handle)
 * reminders.press('AddReminder:Buy milk')
 * ```
 */
export const bindReminders = (
  handle: Interaction.ProgramHandle<
    SyncedRemindersModel,
    SyncedRemindersMessage
  >,
): BoundReminders => Interaction.bind(SyncedReminders, handle)
