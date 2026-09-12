import { Array, Option } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { init, restore } from './init.js'
import { Message, actionByToken, actions, tokenOf } from './message.js'
import { Model } from './model.js'
import { printDestination } from './path.js'
import { productView } from './product.js'
import { update } from './update.js'

/** Projects every Counter Action through Program.valid. */
export const counterValid: Program.ProgramValid<Model> = (
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

/** Builds the Counter screen tree. Device chrome follows occupancy. */
export const counterScreen: Program.ProgramScreen<Model> = (
  model,
  context: ActionContext = {},
): UiNode => {
  const product = productView(model)
  const device =
    context.device !== undefined
      ? context.device
      : Option.isSome(model.maybeDevice)
        ? model.maybeDevice.value
        : undefined
  if (device === undefined) {
    return product
  }
  const path = Option.isSome(model.maybePath)
    ? model.maybePath.value
    : undefined
  return wrapDevice(device, product, { title: printDestination(path) })
}

/**
 * The canonical renderer-free Counter Program shared by every client.
 * Clients paint this screen. Host titles live in `hostSurface.ts` for tab titles.
 */
export const CounterProgram: Program.Program<Model, Message> &
  Readonly<{ actionByToken: typeof actionByToken }> = Object.assign(
  Program.make({
    id: 'counter',
    version: 3,
    Model,
    Message,
    init,
    restore,
    update,
    valid: counterValid,
    screen: counterScreen,
  }),
  { actionByToken },
)
