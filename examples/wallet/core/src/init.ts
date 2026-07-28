import type { Command } from 'foldkit'

import { PendingWalletIntent, type WalletIntent } from './intent.js'
import type { Message } from './message.js'
import {
  type Model,
  initialModel,
  transferRecipientFromInput,
} from './model.js'
import { LoadWallet } from './update.js'
import type { WalletResources } from './walletClient.js'

/** Creates the initial Wallet Model and starts public portfolio loading. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [initialModel, [LoadWallet()]]

/** Creates portable startup state that applies an intent after loading. */
export const modelForWalletIntent = (intent: WalletIntent): Model => ({
  ...initialModel,
  walletIntent: PendingWalletIntent.make({ intent }),
  transferRecipient: transferRecipientFromInput(intent.destinationAddress),
})
