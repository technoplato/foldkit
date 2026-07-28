import type * as Command from 'foldkit/command'

import type { Message } from './message.js'
import { type Model, initialModel } from './model.js'

/** Creates the deck at its opening slide with no initial Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]
