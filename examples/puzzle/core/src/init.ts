import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, demoModel } from './model.js'

// INIT

/** Creates the initial Puzzle Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [demoModel(), []]

/** Restores an existing Puzzle Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [model, []]
