import { Command } from 'foldkit'

import type { CasinoResources } from './casinoClient.js'
import { type Message } from './message.js'
import { type Model, emptyModel, withInitProbing } from './model.js'
import {
  ProbeFundCyclingAgent,
  ProbeHumanity,
  ProbeStripe,
  ProbeZkIdentity,
} from './update.js'

// INIT

/** Creates the initial Casino Model and starts origin probes. Wallet waits for a click. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CasinoResources>>,
] => [
  withInitProbing(emptyModel()),
  [ProbeStripe(), ProbeZkIdentity(), ProbeHumanity(), ProbeFundCyclingAgent()],
]

/** Restores an existing Casino Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CasinoResources>>,
] => [model, []]
