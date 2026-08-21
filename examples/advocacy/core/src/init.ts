import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'
import type { AdvocacyResources } from './resources.js'
import { LoadGraph } from './update.js'

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, AdvocacyResources>>,
] => [initialModel, [LoadGraph()]]

export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, AdvocacyResources>>,
] => [model, []]
