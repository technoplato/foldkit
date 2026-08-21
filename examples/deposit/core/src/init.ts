import { Option } from 'effect'
import { Command } from 'foldkit'
import type { WalletResources } from 'wallet-core-example'

import { type Message } from './message.js'
import {
  IdleClipboard,
  IdleFunding,
  LoadingProfiles,
  Model,
  Sender,
  localSenderId,
} from './model.js'
import { LoadProfiles } from './update.js'

/** Creates the initial Deposit Model and starts profile restoration. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [
  Model.make({
    sender: Sender.make({
      id: localSenderId,
      deposits: [],
      unlocked: [],
    }),
    selectedChain: 'sol',
    selectedNetwork: 'devnet',
    selectedFiatMethod: 'stripe',
    wallet: LoadingProfiles.make({}),
    incoming: [],
    funding: IdleFunding.make({}),
    clipboard: IdleClipboard.make({}),
    lastOutcome: Option.none(),
  }),
  [LoadProfiles()],
]

/** Restores an existing Deposit Model without inventing host state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [model, []]
