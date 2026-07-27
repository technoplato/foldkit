import type { Command } from 'foldkit'

import type { Message } from './message.js'
import { type Model, initialModel } from './model.js'
import { LoadWallet } from './update.js'
import type { WalletResources } from './walletClient.js'

/** Creates the initial Wallet Model and starts public portfolio loading. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [initialModel, [LoadWallet()]]
