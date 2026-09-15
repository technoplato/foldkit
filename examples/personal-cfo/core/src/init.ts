import { Command } from 'foldkit'

import { RestoreSession } from './command.js'
import type { Ledger } from './ledger.js'
import { type Message } from './message.js'
import { type Model, emptyModel } from './model.js'
import type { Notifier } from './notifier.js'

type Resources = Ledger | Notifier

/** Creates the initial Personal CFO Model and restores the Ledger. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, Resources>>,
] => [emptyModel(), [RestoreSession()]]

/** Restores an existing Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, Resources>>,
] => [model, [RestoreSession()]]
