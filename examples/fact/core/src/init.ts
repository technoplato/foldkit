import type { Command } from 'foldkit'

import type { Message } from './message.js'
import { Idle, type Model } from './model.js'

/** The stable initial Fact Model before any request is made. */
export const initialModel: Model = Idle.make({})

/** Initializes the Fact Program without performing a request. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]
