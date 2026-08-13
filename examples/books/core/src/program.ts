import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** Renderer-free books Program shared by Foldkit, React, TUI, and CLI. */
export const BooksProgram: Program.Program<Model, Message> = Program.make({
  id: 'books',
  version: 4,
  Model,
  Message,
  init,
  restore,
  update,
})
