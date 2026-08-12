import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]

export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [model, []]
