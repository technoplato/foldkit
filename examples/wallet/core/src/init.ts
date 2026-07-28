import type { Command } from 'foldkit'

import { PendingWalletIntent, type WalletIntent } from './intent.js'
import type { Message } from './message.js'
import { type Model, initialModel } from './model.js'
import { LoadWallet, LoadWalletProfiles } from './update.js'
import type { WalletResources } from './walletClient.js'

/** Creates the initial Model and starts vault restoration plus portfolio loading. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [initialModel, [LoadWalletProfiles(), LoadWallet()]]

/** Creates portable startup state that applies an intent after loading. */
export const modelForWalletIntent = (intent: WalletIntent): Model => ({
  ...initialModel,
  walletIntent: PendingWalletIntent.make({ intent }),
})
