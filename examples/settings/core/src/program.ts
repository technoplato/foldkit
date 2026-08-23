import { Array } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { init, restore } from './init.js'
import { Message, actionByToken, actions, tokenOf } from './message.js'
import { Model, title } from './model.js'
import { SettingsOrigin } from './origin.js'
import { productView } from './product.js'
import { update } from './update.js'

export { title }

/** Projects every Settings Action through Program.valid. */
export const settingsValid: Program.ProgramValid<Model> = (
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

/** Builds the Settings screen tree. Device chrome is optional context. */
export const settingsScreen: Program.ProgramScreen<Model> = (
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
 * The canonical renderer-free Settings Program shared by every client.
 * Clients paint this screen. The origin URL is not a screen title.
 */
export const SettingsProgram: Program.Program<Model, Message, SettingsOrigin> &
  Readonly<{ actionByToken: typeof actionByToken }> = Object.assign(
  Program.make({
    id: 'settings',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    valid: settingsValid,
    screen: settingsScreen,
  }),
  { actionByToken },
)
