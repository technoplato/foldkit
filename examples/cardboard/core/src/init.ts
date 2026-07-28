import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'

// INIT

/** Creates the constitutional Rule Zero Model and no initial Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]
