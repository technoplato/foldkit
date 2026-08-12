import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { update } from './update.js'

/** Renderer-free conversation Program shared by Foldkit, React, TUI, and CLI. */
export const ConversationsProgram: Program.Program<Model, Message> =
  Program.make({
    id: 'conversations',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
  })
