import { Command } from 'foldkit'
import type { WalletResources } from 'wallet-core-example'

import { type Message } from './message.js'
import { Model, Roaming } from './model.js'
import { spawnAt, spawnFacing } from './town.js'

/** Creates the initial World Model. The player starts roaming in the yard. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [Roaming({ at: spawnAt, facing: spawnFacing }), []]

/** Restores an existing World Model without inventing host state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
] => [model, []]
