import * as Program from 'foldkit/program'

import {
  IssueTracker,
  ProductCatalog,
  TriageInbox,
} from '@foldkit/instant-tools/issues'

import { init } from './init.js'
import { IssueIdentity } from './issueIdentity.js'
import { Message } from './message.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { restore, update } from './update.js'

/** Every dependency required by the renderer-independent Issue Tracker. */
export type IssueTrackerResources =
  | IssueTracker
  | ProductCatalog
  | TriageInbox
  | IssueIdentity

/** The canonical Issue Tracker Program shared by every Client. */
export const IssueTrackerProgram: Program.Program<
  Model,
  Message,
  IssueTrackerResources
> = Program.make({
  id: 'issues',
  version: 1,
  Model,
  Message,
  init,
  restore,
  update,
  subscriptions,
})
