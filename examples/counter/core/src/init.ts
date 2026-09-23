import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { Model, initialCount } from './model.js'

// INIT

/** Creates the initial Counter Model. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [Model.make({ count: initialCount }), []]
