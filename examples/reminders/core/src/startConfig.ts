import type { Runtime } from 'foldkit'

import type { SyncedReminders } from './synced.js'

// START

/** A live synced Reminders any Client can read, watch, and send to. */
export type RemindersHandle = Runtime.SyncedHandle<typeof SyncedReminders.of>

const instanceLength = 8

/** Mints a short per-run Processor instance, such as `4f2a9c1e`. */
export const newProcessorInstance = (): string =>
  globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, instanceLength)
