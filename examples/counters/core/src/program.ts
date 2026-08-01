import { Program } from 'foldkit'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { synchronization } from './synchronization.js'
import { restore, update } from './update.js'
import { EventRegistry } from './wire.js'

/**
 * The canonical renderer-free Multiple Counters Program shared by every host.
 * Version 2 intentionally starts a new incompatible session and replay boundary.
 */
export const MultipleCountersProgram = Program.make({
  id: 'multiple-counters',
  version: 2,
  Model,
  Message,
  init,
  migrations: [],
  restore,
  synchronization,
  update,
  versionedEvents: EventRegistry,
})
