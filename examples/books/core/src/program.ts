import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

export const BooksProgram: Program.Program<Model, Message> = Program.make({
  id: 'books',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
})
