import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { OrbitStore } from './store.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** The canonical renderer-free Orbit Program shared by every client. */
export const OrbitProgram: Program.Program<Model, Message, OrbitStore> =
  Program.make({
    id: 'orbit',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    subscriptions,
  })
