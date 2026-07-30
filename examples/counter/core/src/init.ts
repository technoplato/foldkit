import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialCount } from './model.js'

// INIT

/** Creates the initial Counter Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [{ count: initialCount }, []]

/** Restores an existing Counter Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [model, []]
