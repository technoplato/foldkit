import { Program } from 'foldkit'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** The renderer- and platform-agnostic Wallet Program. */
export const WalletProgram = Program.make({
  id: 'wallet',
  version: 1,
  Model,
  Message,
  init,
  update,
  subscriptions,
})
