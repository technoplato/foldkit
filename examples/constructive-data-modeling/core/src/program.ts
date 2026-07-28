import { Program } from 'foldkit'

import { init } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** The canonical renderer- and transport-neutral constructive modeling deck. */
export const ConstructiveDataModelingProgram = Program.make({
  id: 'constructive-data-modeling-deck',
  version: 1,
  Model,
  Message,
  init,
  update,
})
