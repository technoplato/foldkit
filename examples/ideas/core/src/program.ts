import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { IdeasStore } from './store.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** The canonical renderer-free Ideas Program shared by every client. */
export const IdeasProgram: Program.Program<Model, Message, IdeasStore> =
  Program.make({
    id: 'ideas',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    subscriptions,
  })
