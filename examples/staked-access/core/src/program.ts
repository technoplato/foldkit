import * as Program from 'foldkit/program'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { restore, update } from './update.js'

/** The canonical renderer-free Staked Access Program. */
export const StakedAccessProgram = Program.make({
  id: 'staked-access',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
})
