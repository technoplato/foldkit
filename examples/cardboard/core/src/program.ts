import { Program } from 'foldkit'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** The canonical renderer- and platform-agnostic Cardboard Program. */
export const CardboardProgram = Program.make({
  id: '0',
  version: 1,
  Model,
  Message,
  init,
  update,
  subscriptions,
})
