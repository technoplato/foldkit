import { type Command } from 'foldkit'

import { type Message } from './message.js'
import {
  EditingIssueDraft,
  IssueDraft,
  IssueList,
  LoadingIssues,
  LoadingProducts,
  LoadingTriageCandidates,
  Model,
  type Navigation,
  NotObservingIssue,
} from './model.js'

/** Creates the stable initial Model for one navigation destination. */
export const modelForNavigation = (navigation: Navigation): Model =>
  Model.make({
    draft: IssueDraft.make({
      details: '',
      priority: 'P2',
      productId: '',
      title: '',
    }),
    draftState: EditingIssueDraft.make({}),
    issueDetail: NotObservingIssue.make({}),
    issues: LoadingIssues.make({}),
    navigation,
    products: LoadingProducts.make({}),
    triageCandidates: LoadingTriageCandidates.make({}),
  })

/** Creates the initial Issue Tracker Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [modelForNavigation(IssueList.make({})), []]
