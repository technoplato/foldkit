import { Array } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { init, restore } from './init.js'
import type { Ledger } from './ledger.js'
import { Message, actionByToken, actions, tokenOf } from './message.js'
import { Model, uri } from './model.js'
import type { Notifier } from './notifier.js'
import { productView } from './product.js'
import { update } from './update.js'

/** Resources required by Personal CFO Commands. */
export type PersonalCfoResources = Ledger | Notifier

/** Projects every Personal CFO Action through Program.valid. */
export const personalCfoValid: Program.ProgramValid<Model> = (
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

/** Builds the Personal CFO screen tree. Device chrome is optional context. */
export const personalCfoScreen: Program.ProgramScreen<Model> = (
  model,
  context: ActionContext = {},
): UiNode => {
  const product = productView(model)
  if (context.device === undefined) {
    return product
  }
  return wrapDevice(context.device, product, { title: uri })
}

/**
 * The canonical renderer-free Personal CFO Program shared by every client.
 * Clients paint this screen.
 */
export const PersonalCfoProgram: Program.Program<
  Model,
  Message,
  PersonalCfoResources
> &
  Readonly<{ actionByToken: typeof actionByToken }> = Object.assign(
  Program.make({
    id: 'personal-cfo',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    valid: personalCfoValid,
    screen: personalCfoScreen,
  }),
  { actionByToken },
)
