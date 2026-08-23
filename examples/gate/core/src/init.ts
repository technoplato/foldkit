import { Command } from 'foldkit'

import { ReadOrigin } from './command.js'
import { type Message } from './message.js'
import { Model, Reading } from './model.js'
import { GateOrigin } from './origin.js'

// INIT

type InitReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, GateOrigin>>,
]

/** Creates the initial Gate Model and Commands. */
export const init = (): InitReturn => [
  Model.make({ origin: Reading() }),
  [ReadOrigin()],
]

/** Restores an existing Gate Model without inventing a fetch. */
export const restore = (model: Model): InitReturn => [model, []]
