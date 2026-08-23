import { Option } from 'effect'
import { type Command } from 'foldkit'

import { AllProducts } from './leftover.js'
import { type Message } from './message.js'
import {
  EditingIssueDraft,
  IdleIssueMutation,
  IssueDraft,
  IssueList,
  LoadingIssues,
  LoadingLeftoverPresence,
  LoadingProducts,
  LoadingTriageCandidates,
  Model,
  type Navigation,
  NotObservingIssue,
  NotObservingIssueLogs,
  NotObservingLeftoverPresence,
} from './model.js'

/** Creates the stable initial Model for one navigation destination. */
export const modelForNavigation = (navigation: Navigation): Model =>
  Model.make({
    draft: IssueDraft.make({
      details: '',
      leftoverKind: Option.none(),
      priority: 'P2',
      productId: '',
      title: '',
    }),
    draftState: EditingIssueDraft.make({}),
    issueDetail: NotObservingIssue.make({}),
    issueLogs: NotObservingIssueLogs.make({}),
    issueMutation: IdleIssueMutation.make({}),
    issues: LoadingIssues.make({}),
    leftoverComment: '',
    leftoverLink: '',
    leftoverPresence:
      navigation._tag === 'IssueDetail'
        ? LoadingLeftoverPresence.make({ leftoverId: navigation.issueId })
        : NotObservingLeftoverPresence.make({}),
    navigation,
    productFilter: AllProducts.make({}),
    products: LoadingProducts.make({}),
    triageCandidates: LoadingTriageCandidates.make({}),
  })

/** Creates the initial Issue Tracker Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [modelForNavigation(IssueList.make({})), []]
