import { Array } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { init, restore } from './init.js'
import { Message, actionByToken, actions, tokenOf } from './message.js'
import { Model, uriOf } from './model.js'
import { productView } from './product.js'
import { update } from './update.js'

/** Projects every Puzzle Action through Program.valid. */
export const puzzleValid: Program.ProgramValid<Model> = (
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

/** Builds the Puzzle screen tree. Device chrome is optional context. */
export const puzzleScreen: Program.ProgramScreen<Model> = (
  model,
  context: ActionContext = {},
): UiNode => {
  const product = productView(model)
  if (context.device === undefined) {
    return product
  }
  return wrapDevice(context.device, product, { title: uriOf(model) })
}

/**
 * The canonical renderer-free Puzzle Program shared by every client.
 * Host titles and descriptions live in `hostSurface.ts` on this Program.
 */
export const PuzzleProgram: Program.Program<Model, Message> &
  Readonly<{ actionByToken: typeof actionByToken }> = Object.assign(
  Program.make({
    id: 'puzzle',
    version: 1,
    Model,
    Message,
    init,
    restore,
    update,
    valid: puzzleValid,
    screen: puzzleScreen,
  }),
  { actionByToken },
)
