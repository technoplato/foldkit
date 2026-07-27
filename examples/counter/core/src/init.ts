import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialCount } from './model.js'

// INIT

/** Creates the initial Counter Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [{ count: initialCount }, []]
