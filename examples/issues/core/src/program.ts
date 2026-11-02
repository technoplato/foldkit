import { Array } from 'effect'
import { Subscription } from 'foldkit'
import { type ActionContext } from 'foldkit/message'
import * as Program from 'foldkit/program'
import { type UiNode } from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import {
  IssueTracker,
  ProductCatalog,
  TriageInbox,
} from '@foldkit/instant-tools/issues'
import { LeftoverPresence } from '@foldkit/instant-tools/leftover'
import { Logger } from '@foldkit/instant-tools/logging'

import { type GraphRows } from './graphRows.js'
import { init } from './init.js'
import { type IssueFiles } from './issueFiles.js'
import { IssueIdentity } from './issueIdentity.js'
import { type IssueLandings } from './issueLandings.js'
import { type IssueViews } from './issueViews.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { everyInteractionOf } from './presentation.js'
import { productView } from './product.js'
import {
  graphSubscriptions,
  subscriptions,
  viewSubscriptions,
} from './subscription.js'
import { restore, update } from './update.js'

/** Every dependency required by the renderer-independent Issue Tracker. */
export type IssueTrackerResources =
  | GraphRows
  | IssueFiles
  | IssueLandings
  | IssueViews
  | IssueTracker
  | LeftoverPresence
  | Logger
  | ProductCatalog
  | TriageInbox
  | IssueIdentity

/** Projects leftover and navigation Actions through Program.valid. */
export const issuesValid: Program.ProgramValid<Model> = model =>
  Array.map(everyInteractionOf(model), interaction => ({
    token: interaction.token,
    keys: interaction.keys,
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
> = Program.make<Model, Message, IssueTrackerResources>({
  id: 'issues',
  version: 15,
  Model,
  Message,
  init,
  restore,
  update,
  subscriptions: Subscription.aggregate<
    Model,
    Message,
    IssueTrackerResources
  >()(subscriptions, graphSubscriptions, viewSubscriptions),
  valid: issuesValid,
  screen: issuesScreen,
})
