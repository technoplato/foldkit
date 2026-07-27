import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { HomeScene, Model, type Navigation } from './model.js'

// INIT

/** Creates a showcase Model for one navigation destination. */
export const modelForNavigation = (navigation: Navigation): Model =>
  Model.make({ navigation })

/** The canonical initial showcase Model. */
export const initialModel = modelForNavigation(HomeScene.make({}))

/** Creates the initial showcase Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [initialModel, []]
