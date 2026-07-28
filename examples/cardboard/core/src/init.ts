import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'

// INIT

/** Creates Cardboard at value four and no initial Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]
