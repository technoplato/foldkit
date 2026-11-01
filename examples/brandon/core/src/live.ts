import type { Layer } from 'effect'
import { type Processor, Runtime } from 'foldkit'

import type { BrandonProgram } from './program.js'
import type { BrandonServer } from './server.js'
import { SyncedBrandon } from './synced.js'

/** Live Brandon dot. */
export type BrandonHandle = Runtime.SyncedHandle<typeof BrandonProgram>

/** Starts Brandon dot on an engine the caller built. */
export const startBrandonOn = (
  sync: Runtime.SyncEngine,
  server: Layer.Layer<BrandonServer>,
  host: Processor.Host.Host,
): BrandonHandle =>
  Runtime.startHandle({ program: SyncedBrandon, sync, resources: server, host })
