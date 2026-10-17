import { Schema as S } from 'effect'

import {
  Issue,
  IssueAttachment,
  IssuePriority,
  IssueStatus,
  IssueSuccessEvidence,
  ProductCatalogEntry,
  TrackedProduct,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { LeftoverPeer } from '@foldkit/instant-tools/leftover'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { LandingFilter } from './landing.js'
import { LeftoverStatus, ProductFilter } from './leftover.js'
import {
  DraftMention,
  IssueDraft,
  Navigation,
  SubtaskMark,
  WorkInProgressEdit,
} from './model.js'

export const ObservedIssues = S.TaggedStruct('ObservedIssues', {
  issues: S.Array(Issue),
})
export const FailedObserveIssues = S.TaggedStruct('FailedObserveIssues', {
  reason: S.String,
})
export const ObservedProducts = S.TaggedStruct('ObservedProducts', {
  products: S.Array(ProductCatalogEntry),
})
export const FailedObserveProducts = S.TaggedStruct('FailedObserveProducts', {
  reason: S.String,
})
export const ObservedTriageCandidates = S.TaggedStruct(
  'ObservedTriageCandidates',
  { candidates: S.Array(TriageCandidate) },
)
export const FailedObserveTriageCandidates = S.TaggedStruct(
  'FailedObserveTriageCandidates',
  { reason: S.String },
)
export const ObservedIssue = S.TaggedStruct('ObservedIssue', {
  issue: S.Option(Issue),
  issueId: S.String,
})
export const FailedObserveIssue = S.TaggedStruct('FailedObserveIssue', {
  issueId: S.String,
  reason: S.String,
})
export const ObservedIssueLogs = S.TaggedStruct('ObservedIssueLogs', {
  issueId: S.String,
  logs: S.Array(IssueLogEvidence),
})
export const FailedObserveIssueLogs = S.TaggedStruct('FailedObserveIssueLogs', {
  issueId: S.String,
  reason: S.String,
})
export const SelectedIssue = S.TaggedStruct('SelectedIssue', {
  issueId: S.String,
})
export const DismissedIssueDetail = S.TaggedStruct('DismissedIssueDetail', {})
export const ClickedFileIssue = S.TaggedStruct('ClickedFileIssue', {})
export const ClickedOpenTriage = S.TaggedStruct('ClickedOpenTriage', {})
export const ClickedPromoteTriageCandidate = S.TaggedStruct(
  'ClickedPromoteTriageCandidate',
  { candidateId: S.String },
)
export const ClickedDismissTriageCandidate = S.TaggedStruct(
  'ClickedDismissTriageCandidate',
  { candidateId: S.String },
)
export const UpdatedIssueTitle = S.TaggedStruct('UpdatedIssueTitle', {
  value: S.String,
})
export const UpdatedIssueDetails = S.TaggedStruct('UpdatedIssueDetails', {
  value: S.String,
})
export const SelectedIssueProduct = S.TaggedStruct('SelectedIssueProduct', {
  productId: S.String,
})
export const SelectedIssuePriority = S.TaggedStruct('SelectedIssuePriority', {
  priority: IssuePriority,
})
export const ComposedIssueDraft = S.TaggedStruct('ComposedIssueDraft', {
  draft: IssueDraft,
})
export const SubmittedIssue = S.TaggedStruct('SubmittedIssue', {})
export const SucceededSaveIssue = S.TaggedStruct('SucceededSaveIssue', {
  issue: Issue,
})
export const FailedSaveIssue = S.TaggedStruct('FailedSaveIssue', {
  reason: S.String,
})
export const SucceededReviewTriageCandidate = S.TaggedStruct(
  'SucceededReviewTriageCandidate',
  { candidate: TriageCandidate, issue: S.Option(Issue) },
)
export const FailedReviewTriageCandidate = S.TaggedStruct(
  'FailedReviewTriageCandidate',
  { reason: S.String },
)
export const OpenedNavigation = S.TaggedStruct('OpenedNavigation', {
  navigation: Navigation,
})
export const SelectedProductFilter = S.TaggedStruct('SelectedProductFilter', {
  filter: ProductFilter,
})
export const UpdatedLeftoverComment = S.TaggedStruct('UpdatedLeftoverComment', {
  value: S.String,
})
export const UpdatedLeftoverLink = S.TaggedStruct('UpdatedLeftoverLink', {
  value: S.String,
})
export const SubmittedIssueComment = S.TaggedStruct('SubmittedIssueComment', {
  issueId: S.String,
  summary: S.String,
})
export const AppendedIssueWorkLog = S.TaggedStruct('AppendedIssueWorkLog', {
  summary: S.String,
})
export const SucceededSaveIssueWorkLog = S.TaggedStruct(
  'SucceededSaveIssueWorkLog',
  { issue: Issue },
)
export const FailedSaveIssueWorkLog = S.TaggedStruct('FailedSaveIssueWorkLog', {
  reason: S.String,
})
export const SubmittedIssueWorkLogEntry = S.TaggedStruct(
  'SubmittedIssueWorkLogEntry',
  {
    agentId: S.Option(S.String),
    claimantId: S.Option(S.String),
    commitSha: S.Option(S.String),
    issueId: S.String,
    state: S.String,
    status: S.Option(IssueStatus),
    summary: S.String,
  },
)
export const SucceededAppendIssueWorkLogEntry = S.TaggedStruct(
  'SucceededAppendIssueWorkLogEntry',
  { entryId: S.String, issue: Issue },
)
export const SubmittedIssueAttachment = S.TaggedStruct(
  'SubmittedIssueAttachment',
  { attachment: IssueAttachment, issueId: S.String },
)
export const SubmittedIssueEdit = S.TaggedStruct('SubmittedIssueEdit', {
  area: S.Option(S.String),
  details: S.Option(S.String),
  issueId: S.String,
  issueType: S.Option(S.String),
  priority: S.Option(IssuePriority),
  productId: S.Option(S.String),
  title: S.Option(S.String),
})
export const SubmittedIssueSuccessCriterion = S.TaggedStruct(
  'SubmittedIssueSuccessCriterion',
  {
    issueId: S.String,
    outcome: S.String,
    requiredEvidence: S.Array(IssueSuccessEvidence),
  },
)
export const SubmittedSuccessCriteriaMarks = S.TaggedStruct(
  'SubmittedSuccessCriteriaMarks',
  {
    criterionIds: S.Array(S.String),
    isSatisfied: S.Boolean,
    issueId: S.String,
  },
)
export const SubmittedIssueSubtasks = S.TaggedStruct('SubmittedIssueSubtasks', {
  issueId: S.String,
  titles: S.Array(S.String),
})
export const SubmittedSubtaskMarks = S.TaggedStruct('SubmittedSubtaskMarks', {
  issueId: S.String,
  mark: SubtaskMark,
  subtaskIds: S.Array(S.String),
})
export const SubmittedIssueWorkInProgress = S.TaggedStruct(
  'SubmittedIssueWorkInProgress',
  { edit: WorkInProgressEdit, issueId: S.String },
)
export const ClearedIssueWorkInProgress = S.TaggedStruct(
  'ClearedIssueWorkInProgress',
  { issueId: S.String },
)
export const SelectedLandingFilter = S.TaggedStruct('SelectedLandingFilter', {
  filter: LandingFilter,
})
export const SubmittedIssueMention = S.TaggedStruct('SubmittedIssueMention', {
  issueId: S.String,
  mention: DraftMention,
})
export const SelectedIssueStatus = S.TaggedStruct('SelectedIssueStatus', {
  issueId: S.String,
  status: IssueStatus,
})
export const ConfirmedIssueDeletion = S.TaggedStruct('ConfirmedIssueDeletion', {
  issueId: S.String,
})
export const SucceededDeleteIssue = S.TaggedStruct('SucceededDeleteIssue', {
  issue: Issue,
})
export const FailedDeleteIssue = S.TaggedStruct('FailedDeleteIssue', {
  issueId: S.String,
  reason: S.String,
})
export const LinkedCatalogIssue = S.TaggedStruct('LinkedCatalogIssue', {
  sourceIssueId: S.String,
  targetIssueId: S.String,
})
export const ClickedLeftoverStatus = S.TaggedStruct('ClickedLeftoverStatus', {
  issueId: S.String,
  status: LeftoverStatus,
})
export const RetargetedIssueProduct = S.TaggedStruct('RetargetedIssueProduct', {
  issueId: S.String,
  productId: S.String,
})
export const SubmittedProduct = S.TaggedStruct('SubmittedProduct', {
  product: TrackedProduct,
})
export const SucceededSaveProduct = S.TaggedStruct('SucceededSaveProduct', {
  entry: ProductCatalogEntry,
})
export const FailedSaveProduct = S.TaggedStruct('FailedSaveProduct', {
  reason: S.String,
})
export const ObservedLeftoverPeers = S.TaggedStruct('ObservedLeftoverPeers', {
  leftoverId: S.String,
  peers: S.Array(LeftoverPeer),
})
export const FailedObserveLeftoverPeers = S.TaggedStruct(
  'FailedObserveLeftoverPeers',
  {
    leftoverId: S.String,
    reason: S.String,
  },
)
export const CompletedJoinLeftoverRoom = S.TaggedStruct(
  'CompletedJoinLeftoverRoom',
  { leftoverId: S.String },
)
export const FailedJoinLeftoverRoom = S.TaggedStruct('FailedJoinLeftoverRoom', {
  leftoverId: S.String,
  reason: S.String,
})
export const CompletedLeaveLeftoverRoom = S.TaggedStruct(
  'CompletedLeaveLeftoverRoom',
  { leftoverId: S.String },
)
export const FailedLeaveLeftoverRoom = S.TaggedStruct(
  'FailedLeaveLeftoverRoom',
  {
    leftoverId: S.String,
    reason: S.String,
  },
)

/** Every fact accepted by the Issue Tracker Program. */
export const Message = S.Union([
  ObservedIssues,
  FailedObserveIssues,
  ObservedProducts,
  FailedObserveProducts,
  ObservedTriageCandidates,
  FailedObserveTriageCandidates,
  ObservedIssue,
  FailedObserveIssue,
  ObservedIssueLogs,
  FailedObserveIssueLogs,
  SelectedIssue,
  DismissedIssueDetail,
  ClickedFileIssue,
  ClickedOpenTriage,
  ClickedPromoteTriageCandidate,
  ClickedDismissTriageCandidate,
  UpdatedIssueTitle,
  UpdatedIssueDetails,
  SelectedIssueProduct,
  SelectedIssuePriority,
  ComposedIssueDraft,
  SubmittedIssue,
  SucceededSaveIssue,
  FailedSaveIssue,
  SucceededReviewTriageCandidate,
  FailedReviewTriageCandidate,
  OpenedNavigation,
  SelectedProductFilter,
  UpdatedLeftoverComment,
  UpdatedLeftoverLink,
  SubmittedIssueComment,
  AppendedIssueWorkLog,
  SucceededSaveIssueWorkLog,
  FailedSaveIssueWorkLog,
  SubmittedIssueWorkLogEntry,
  SucceededAppendIssueWorkLogEntry,
  SubmittedIssueAttachment,
  SubmittedIssueEdit,
  SubmittedIssueSuccessCriterion,
  SubmittedSuccessCriteriaMarks,
  SubmittedIssueSubtasks,
  SubmittedSubtaskMarks,
  SubmittedIssueWorkInProgress,
  ClearedIssueWorkInProgress,
  SelectedLandingFilter,
  SubmittedIssueMention,
  SelectedIssueStatus,
  ConfirmedIssueDeletion,
  SucceededDeleteIssue,
  FailedDeleteIssue,
  LinkedCatalogIssue,
  ClickedLeftoverStatus,
  RetargetedIssueProduct,
  SubmittedProduct,
  SucceededSaveProduct,
  FailedSaveProduct,
  ObservedLeftoverPeers,
  FailedObserveLeftoverPeers,
  CompletedJoinLeftoverRoom,
  FailedJoinLeftoverRoom,
  CompletedLeaveLeftoverRoom,
  FailedLeaveLeftoverRoom,
])
/** Every fact accepted by the Issue Tracker Program. */
export type Message = typeof Message.Type
