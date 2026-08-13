import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** The canonical renderer-free Archiver Program shared by every client. */
export const ArchiverProgram: Program.Program<Model, Message> = Program.make({
  id: 'archiver',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
})
