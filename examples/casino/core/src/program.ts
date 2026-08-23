import { Array } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { type CasinoResources } from './casinoClient.js'
import { init, restore } from './init.js'
import { Message, actionByToken, actions, tokenOf } from './message.js'
import { Model, title } from './model.js'
import { productView } from './product.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'

/** Projects every Casino Action through Program.valid. */
export const casinoValid: Program.ProgramValid<Model> = (
  model,
  context: ActionContext = {},
) =>
  Array.map(actions, action => {
    const token = tokenOf(action)
    const hidden =
      action.hiddenBecause === undefined
        ? undefined
        : action.hiddenBecause(model)
    return {
      token,
      keys: action.keys ?? [],
      spoken: action.spoken ?? [],
      valid: action.valid(model, context),
      ...(hidden === undefined ? {} : { hidden }),
    }
  })

/** Builds the Casino screen tree. Device chrome is optional context. */
export const casinoScreen: Program.ProgramScreen<Model> = (
  model,
  context: ActionContext = {},
): UiNode => {
  const product = productView(model)
  if (context.device === undefined) {
    return product
  }
  return wrapDevice(context.device, product, { title })
}

/**
 * The canonical renderer-free Casino Program shared by every client.
 */
export const CasinoProgram: Program.Program<Model, Message, CasinoResources> &
  Readonly<{ actionByToken: typeof actionByToken }> = Object.assign(
  Program.make({
    id: 'casino',
    version: 2,
    Model,
    Message,
    init,
    restore,
    update,
    subscriptions,
    valid: casinoValid,
    screen: casinoScreen,
  }),
  { actionByToken },
)
