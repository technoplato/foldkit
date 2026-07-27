import * as Program from 'foldkit/program'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** The canonical renderer-free showcase navigation Program. */
export const ShowcaseProgram: Program.Program<Model, Message> = Program.make({
  id: 'showcase',
  version: 1,
  Model,
  Message,
  init,
  update,
})
