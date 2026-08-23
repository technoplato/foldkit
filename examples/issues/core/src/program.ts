import { Array } from 'effect'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import {
  IssueTracker,
  ProductCatalog,
  TriageInbox,
} from '@foldkit/instant-tools/issues'
import { Logger } from '@foldkit/instant-tools/logging'

import { init } from './init.js'
import { IssueIdentity } from './issueIdentity.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { interactionsForModel } from './presentation.js'
import { productView } from './product.js'
import { subscriptions } from './subscription.js'
import { restore, update } from './update.js'

/** Every dependency required by the renderer-independent Issue Tracker. */
export type IssueTrackerResources =
  | IssueTracker
  | Logger
  | ProductCatalog
  | TriageInbox
  | IssueIdentity

/** Projects leftover and navigation Actions through Program.valid. */
export const issuesValid: Program.ProgramValid<Model> = model =>
  Array.map(interactionsForModel(model), interaction => ({
    token: interaction.token,
    keys: [],
    spoken: [],
    valid: true,
  }))

/** Builds the Issues screen tree. Device chrome is optional context. */
export const issuesScreen: Program.ProgramScreen<Model> = (
  model,
  context: ActionContext = {},
): UiNode => {
  const product = productView(model)
  if (context.device === undefined) {
    return product
  }
  return wrapDevice(context.device, product, { title: 'Issues' })
}

/** The canonical Issue Tracker Program shared by every Client. */
export const IssueTrackerProgram: Program.Program<
  Model,
  Message,
  IssueTrackerResources
> = Program.make({
  id: 'issues',
  version: 4,
  Model,
  Message,
  init,
  restore,
  update,
  subscriptions,
  valid: issuesValid,
  screen: issuesScreen,
})
