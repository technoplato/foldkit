import { Command } from 'foldkit'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'

// INIT

/** Creates the initial Calculator Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]
