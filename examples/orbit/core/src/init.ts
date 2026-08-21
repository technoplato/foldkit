import { Option } from 'effect'
import { Command } from 'foldkit'

import { type Message } from './message.js'
import { AbsentWallet, Model } from './model.js'
import { runIndex } from './runIndex.js'
import { OrbitStore } from './store.js'
import { LoadSnap } from './update.js'

/** Empty sims, empty ledger. Used by tests and headless before runIndex. */
export const emptyModel = (): Model =>
  Model.make({
    sims: {
      tortoise: AbsentWallet.make({}),
      achilles: AbsentWallet.make({}),
    },
    log: [],
    seq: 0,
    steps: [],
    lastOutcome: Option.none(),
    selectedToolId: Option.none(),
    source: 'StaticFallback',
  })

/** Creates the initial Orbit Model with the agent index already executed. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, OrbitStore>>,
] => {
  const { model } = runIndex(emptyModel())
  return [model, [LoadSnap()]]
}

/** Restores an existing Orbit Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, OrbitStore>>,
] => [model, []]
