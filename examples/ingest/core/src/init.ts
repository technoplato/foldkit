import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model, emptyModel } from './model.js'

// INIT

/** Creates the initial Ingest Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [emptyModel(), []]

/** Restores an existing Ingest Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [model, []]
