import * as Program from 'foldkit/program'

import { init, restore } from './init.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { type PaymentResources } from './processor.js'
import { update } from './update.js'

/** The renderer-free Payments Program shared by every client. */
export const PaymentsProgram: Program.Program<
  Model,
  Message,
  PaymentResources
> = Program.make({
  id: 'payments',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
})
