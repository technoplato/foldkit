import { type Command, Program } from 'foldkit'

import { Message, type Message as MessageType } from './message.js'
import { Model, ShowingCaptures } from './model.js'
import { update } from './update.js'

/** Creates the initial Client Matrix Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<MessageType>>,
] => [
  Model.make({
    liveClientState: ShowingCaptures.make({}),
    orientation: 'ModesAsRows',
    selectedMode: 'DeleteConfirmation',
  }),
  [],
]

/** The renderer-independent Client Matrix Program. */
export const ClientMatrixProgram = Program.make({
  id: 'ClientMatrix',
  version: 1,
  Model,
  Message,
  init,
  update,
})
