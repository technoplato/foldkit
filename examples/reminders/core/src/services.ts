import type { RemindersStore } from './store.js'

// SERVICES

/**
 * What Reminders needs from the host that runs it: the reminders store. A
 * host provides it as a Layer, such as the Instant store on the Reminders
 * V3 schema.
 */
export type RemindersServices = RemindersStore
