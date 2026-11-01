import { Option } from 'effect'
import { type Command } from 'foldkit'

import { defaultIssueView } from './issueView.js'
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
  NoLayer,
  NotObservingIssue,
  NotObservingIssueFiles,
  NotObservingIssueLanding,
  NotObservingIssueLogs,
  NotObservingLeftoverPresence,
  NotObservingPageFacts,
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
    clock: { nowMs: 0, offsetMinutes: 0 },
    draft: emptyIssueDraft(''),
    draftState: EditingIssueDraft.make({}),
    issueDetail: NotObservingIssue.make({}),
    issueFiles: NotObservingIssueFiles.make({}),
    issueLanding: NotObservingIssueLanding.make({}),
    issueLogs: NotObservingIssueLogs.make({}),
    issueMutation: IdleIssueMutation.make({}),
    isGoKeyPending: false,
    isSearchFocused: false,
    issues: LoadingIssues.make({}),
    knownBuilds: [],
    layer: NoLayer.make({}),
    leftoverComment: '',
    leftoverLink: '',
    leftoverPresence:
      navigation._tag === 'IssueDetail'
        ? LoadingLeftoverPresence.make({ leftoverId: navigation.issueId })
        : NotObservingLeftoverPresence.make({}),
    maybeRowCursor: Option.none(),
    navigation,
    pageFacts: NotObservingPageFacts.make({}),
    productAddition: IdleProductAddition.make({}),
    products: LoadingProducts.make({}),
    returnListView:
      navigation._tag === 'IssueList' ? navigation.view : defaultIssueView,
    triageCandidates: LoadingTriageCandidates.make({}),
  })

/** Creates the initial Issue Tracker Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [modelForNavigation(IssueList.make({})), []]
