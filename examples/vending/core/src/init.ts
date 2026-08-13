import { Command } from 'foldkit'
import type { WalletResources } from 'wallet-core-example'

import { type Message } from './message.js'
import {
  IdleClipboard,
  IdleFunding,
  IdleSelection,
  IdleVend,
  LoadingProfiles,
  Model,
  defaultCatalog,
  listPriceDisplay,
  settleLamports,
} from './model.js'
import { LoadProfiles } from './update.js'

/** Creates the initial Vending Model and starts profile restoration. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [
  Model.make({
    catalog: defaultCatalog,
    keypadBuffer: '',
    selection: IdleSelection.make({}),
    vendPhase: IdleVend.make({}),
    listPriceDisplay,
    settleLamports,
    wallet: LoadingProfiles.make({}),
    incoming: [],
    funding: IdleFunding.make({}),
    clipboard: IdleClipboard.make({}),
  }),
  [LoadProfiles()],
]

/** Restores an existing Vending Model without inventing host state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [model, []]
