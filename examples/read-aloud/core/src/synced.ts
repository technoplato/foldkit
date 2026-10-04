import { Interaction, Program, type Runtime } from 'foldkit'

import { App } from './app.js'
import { MessageWire, ReadAloudProjection } from './wire.js'

/**
 * The App wrapped for sync. The Model is Starting until the log is read,
 * then Ready with Read Aloud, the session, and the stack flat on it.
 */
export const SyncedReadAloud = Program.compose.sync({
  of: App,
  snapshot: ReadAloudProjection,
  message: MessageWire,
})

/** A synced Read Aloud Model: Starting, Ready, or Failed. */
export type SyncedReadAloudModel = ReturnType<typeof SyncedReadAloud.init>[0]

/** A synced Read Aloud Message. */
export type SyncedReadAloudMessage = typeof SyncedReadAloud.Message.Type

/** A live synced Read Aloud any Client can read, watch, and send to. */
export type ReadAloudHandle = Runtime.SyncedHandle<typeof SyncedReadAloud.of>

/** Live Read Aloud bound to the generic interaction. */
export type BoundReadAloud = Interaction.BoundInteraction<
  SyncedReadAloudModel,
  SyncedReadAloudMessage
>

/**
 * Binds a live handle to its interaction.
 *
 * @example
 * ```typescript
 * const readAloud = bindReadAloud(handle)
 * readAloud.press('NextPage')
 * ```
 */
export const bindReadAloud = (
  handle: Interaction.ProgramHandle<
    SyncedReadAloudModel,
    SyncedReadAloudMessage
  >,
): BoundReadAloud => Interaction.bind(SyncedReadAloud, handle)

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)
