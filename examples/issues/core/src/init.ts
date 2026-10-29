import { Option } from 'effect'
import { type Command } from 'foldkit'

import { AllWork } from './landing.js'
import { AllProducts } from './leftover.js'
import { type Message } from './message.js'
import {
  EditingIssueDraft,
  IdleIssueMutation,
  IdleProductAddition,
  IssueDraft,
  IssueList,
  LoadingIssues,
  LoadingLeftoverPresence,
  LoadingProducts,
  LoadingTriageCandidates,
  Model,
  type Navigation,
  NotObservingIssue,
  NotObservingIssueFiles,
  NotObservingIssueLogs,
  NotObservingLeftoverPresence,
} from './model.js'

/**
 * A blank filing form under one product: `emptyIssueDraft('scribe')` has no
 * title or details and priority P2. Filing an Issue leaves its product
 * chosen for the next one.
 */
export const emptyIssueDraft = (productId: string): IssueDraft =>
  IssueDraft.make({
    details: '',
    leftoverKind: Option.none(),
    priority: 'P2',
    productId,
    title: '',
  })

/** Creates the stable initial Model for one navigation destination. */
export const modelForNavigation = (navigation: Navigation): Model =>
  Model.make({
    draft: emptyIssueDraft(''),
    draftState: EditingIssueDraft.make({}),
    issueDetail: NotObservingIssue.make({}),
    issueFiles: NotObservingIssueFiles.make({}),
    issueLogs: NotObservingIssueLogs.make({}),
    issueMutation: IdleIssueMutation.make({}),
    issues: LoadingIssues.make({}),
    landingFilter: AllWork.make({}),
    leftoverComment: '',
    leftoverLink: '',
    leftoverPresence:
      navigation._tag === 'IssueDetail'
        ? LoadingLeftoverPresence.make({ leftoverId: navigation.issueId })
        : NotObservingLeftoverPresence.make({}),
    navigation,
    productAddition: IdleProductAddition.make({}),
    productFilter: AllProducts.make({}),
    products: LoadingProducts.make({}),
    triageCandidates: LoadingTriageCandidates.make({}),
  })

/** Creates the initial Issue Tracker Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [modelForNavigation(IssueList.make({})), []]
