import { Command } from 'foldkit'

import { type Message } from './message.js'
import { type Model, initialModel } from './model.js'
import { type PaymentResources } from './processor.js'

/** Creates the initial Payments Model. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, PaymentResources>>,
] => [initialModel, []]

/** Restores an existing Payments Model without inventing host state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, PaymentResources>>,
] => [model, []]
