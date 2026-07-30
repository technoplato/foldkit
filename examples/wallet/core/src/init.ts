import type { Command } from 'foldkit'

import { PendingWalletIntent, type WalletIntent } from './intent.js'
import type { Message } from './message.js'
import { type Model, initialModel } from './model.js'
import { LoadWalletProfiles } from './update.js'
import type { WalletResources } from './walletClient.js'

/** Creates the initial Model and starts secure profile restoration. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [initialModel, [LoadWalletProfiles()]]

/** Creates portable startup state that applies an intent after loading. */
export const modelForWalletIntent = (intent: WalletIntent): Model => ({
  ...initialModel,
  walletIntent: PendingWalletIntent.make({ intent }),
})
