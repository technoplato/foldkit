import { Program } from 'foldkit'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { restore, update } from './update.js'

/** The canonical renderer-free Multiple Counters Program shared by every host. */
export const MultipleCountersProgram = Program.make({
  id: 'multiple-counters',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
})
