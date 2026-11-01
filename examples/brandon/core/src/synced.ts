import { Program } from 'foldkit'

import { BrandonProgram } from './program.js'
import { MessageWire, Projection } from './wire.js'

/**
 * Brandon dot wrapped for sync. The Model is Starting until the log is
 * read, then Ready with the scoreboard flat on it.
 */
export const SyncedBrandon = Program.compose.sync({
  of: BrandonProgram,
  snapshot: Projection,
  message: MessageWire,
})

/** A synced Brandon dot Model: Starting, Ready, or Failed. */
export type SyncedBrandonModel = ReturnType<typeof SyncedBrandon.init>[0]
