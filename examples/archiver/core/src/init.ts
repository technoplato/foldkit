import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model } from './model.js'

/** Creates the initial Archiver Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [{ urlDraft: '', archives: [] }, []]

/** Restores an existing Archiver Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [model, []]
