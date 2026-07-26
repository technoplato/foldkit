import { Program } from 'foldkit'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** The canonical renderer-free Calculator Program shared by every client. */
export const CalculatorProgram = Program.make({
  id: 'calculator',
  version: 1,
  Model,
  Message,
  init,
  update,
})
