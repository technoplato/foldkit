import { Program } from 'foldkit'

import { CounterProgram } from './program.js'
import { CountProjection, MessageWire } from './wire.js'

/**
 * Counter Program wrapped for Instant I/O.
 * Instant has no Model. Runtime.start uses the two Schemas.
 */
export const SyncedCounter = Program.compose.sync({
  of: CounterProgram,
  snapshot: CountProjection,
  message: MessageWire,
})
