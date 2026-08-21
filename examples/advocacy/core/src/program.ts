import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import type { AdvocacyResources } from './resources.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** Renderer-free advocacy meeting Program shared by Foldkit, TUI, and CLI hosts. */
export const AdvocacyProgram: Program.Program<
  Model,
  Message,
  AdvocacyResources
> = Program.make({
  id: 'advocacy',
  version: 2,
  Model,
  Message,
  init,
  restore,
  update,
  subscriptions,
})
