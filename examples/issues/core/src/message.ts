import { Schema as S } from 'effect'

import {
  Issue,
  IssuePriority,
  ProductCatalogEntry,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { LeftoverStatus, ProductFilter } from './leftover.js'
import { Navigation } from './model.js'

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
  SubmittedIssue,
  SucceededSaveIssue,
  FailedSaveIssue,
  SucceededReviewTriageCandidate,
  FailedReviewTriageCandidate,
  OpenedNavigation,
  SelectedProductFilter,
  SubmittedIssueComment,
  AppendedIssueWorkLog,
  SucceededSaveIssueWorkLog,
  FailedSaveIssueWorkLog,
  LinkedCatalogIssue,
  ClickedLeftoverStatus,
  RetargetedIssueProduct,
])
/** Every fact accepted by the Issue Tracker Program. */
export type Message = typeof Message.Type
