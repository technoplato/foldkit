import type { LinkSharing } from './share.js'
import type { RemindersStore } from './store.js'

// SERVICES

/**
 * What Reminders needs from the host that runs it: the reminders store and
 * a way to share a link. A host provides them as Layers, such as the
 * Instant store on the Reminders V3 schema and the browser's share sheet.
 */
export type RemindersServices = RemindersStore | LinkSharing
