import * as Program from 'foldkit/program'
import type { WalletResources } from 'wallet-core-example'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** The renderer-free Vending Program shared by every client. */
export const VendingProgram: Program.Program<Model, Message, WalletResources> =
  Program.make({
    id: 'vending',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    subscriptions,
  })
