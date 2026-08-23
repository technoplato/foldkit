import { Array } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { init, restore } from './init.js'
import { Message, actionByToken, actions, tokenOf } from './message.js'
import { Model } from './model.js'
import { GateOrigin } from './origin.js'
import { productView } from './product.js'
import { update } from './update.js'

export const title = 'Gate'

/** Projects every Gate Action through Program.valid. */
export const gateValid: Program.ProgramValid<Model> = (
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

/** Builds the Gate screen tree. Device chrome is optional context. */
export const gateScreen: Program.ProgramScreen<Model> = (
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
 * The canonical renderer-free Gate Program shared by every client.
 * Clients paint this screen. The origin URL is not a screen title.
 */
export const GateProgram: Program.Program<Model, Message, GateOrigin> &
  Readonly<{ actionByToken: typeof actionByToken }> = Object.assign(
  Program.make({
    id: 'gate',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    valid: gateValid,
    screen: gateScreen,
  }),
  { actionByToken },
)
