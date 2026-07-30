import { Schema as S } from 'effect'

import {
  Issue,
  IssuePriority,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

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
export const ObservedIssue = S.TaggedStruct('ObservedIssue', {
  issue: S.Option(Issue),
  issueId: S.String,
})
export const FailedObserveIssue = S.TaggedStruct('FailedObserveIssue', {
  issueId: S.String,
  reason: S.String,
})
export const SelectedIssue = S.TaggedStruct('SelectedIssue', {
  issueId: S.String,
})
export const DismissedIssueDetail = S.TaggedStruct('DismissedIssueDetail', {})
export const ClickedFileIssue = S.TaggedStruct('ClickedFileIssue', {})
export const ClickedOpenTriage = S.TaggedStruct('ClickedOpenTriage', {})
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
export const OpenedNavigation = S.TaggedStruct('OpenedNavigation', {
  navigation: Navigation,
})

/** Every fact accepted by the Issue Tracker Program. */
export const Message = S.Union([
  ObservedIssues,
  FailedObserveIssues,
  ObservedProducts,
  FailedObserveProducts,
  ObservedIssue,
  FailedObserveIssue,
  SelectedIssue,
  DismissedIssueDetail,
  ClickedFileIssue,
  ClickedOpenTriage,
  UpdatedIssueTitle,
  UpdatedIssueDetails,
  SelectedIssueProduct,
  SelectedIssuePriority,
  SubmittedIssue,
  SucceededSaveIssue,
  FailedSaveIssue,
  OpenedNavigation,
])
/** Every fact accepted by the Issue Tracker Program. */
export type Message = typeof Message.Type
