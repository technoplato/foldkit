import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** The canonical renderer-free Counter Program shared by every client. */
export const CounterProgram: Program.Program<Model, Message> = Program.make({
  id: 'counter',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
})
