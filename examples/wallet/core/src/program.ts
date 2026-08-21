import * as Program from 'foldkit/program'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { restore, update } from './update.js'
import type { WalletResources } from './walletClient.js'

/** The renderer- and platform-agnostic Wallet Program. */
export const WalletProgram: Program.Program<Model, Message, WalletResources> =
  Program.make({
    id: 'wallet',
    version: 11,
    Model,
    Message,
    init,
    restore,
    update,
    subscriptions,
  })
