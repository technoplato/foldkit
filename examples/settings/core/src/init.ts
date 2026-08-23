import { Command } from 'foldkit'

import { ReadOrigin } from './command.js'
import { type Message } from './message.js'
import { type Model, loadingModel } from './model.js'
import { SettingsOrigin } from './origin.js'

type InitReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, SettingsOrigin>>,
]

/** Creates the initial Settings Model and loads Access apps. */
export const init = (): InitReturn => [loadingModel(), [ReadOrigin()]]

/** Restores an existing Settings Model without inventing a fetch. */
export const restore = (model: Model): InitReturn => [model, []]
