import type { Command } from 'foldkit'

import { ShowcaseShell } from './catalog.js'
import type { Message, Model } from './program.js'

/**
 * Parent update is fully derived by Program.compose.
 * No hand Got* arms for catalog children.
 */
export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  ShowcaseShell.update(model, message) as readonly [
    Model,
    ReadonlyArray<Command.Command<Message>>,
  ]
