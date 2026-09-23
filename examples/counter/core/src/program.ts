import * as Program from 'foldkit/program'

import { init } from './init.js'
import { Message, catalog } from './message.js'
import { Model } from './model.js'
import { navigation } from './navigation.js'
import { counterScreen } from './screen.js'
import { update } from './update.js'

/**
 * The canonical Counter Program. It knows nothing about React, terminals,
 * or Instant. Clients bind to `CounterProgram.interaction`, which the
 * Catalog derives: buttons, keys, and CLI commands all come from
 * `Increment`, `Decrement`, and `Reset`.
 *
 * Every Counter Message is Domain, so every synchronization mode shares the
 * count.
 */
export const CounterProgram = Program.make({
  id: 'counter',
  version: 5,
  Model,
  Message,
  init,
  update,
  catalog,
  navigation,
  screen: counterScreen,
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})
