import { Schema as S } from 'effect'

import {
  Issue,
  ProductCatalogEntry,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { LeftoverKind, ProductFilter } from './leftover.js'

/** The live collection has not emitted its first snapshot. */
export const LoadingIssues = S.TaggedStruct('LoadingIssues', {})
/** The live collection emitted its latest snapshot. */
export const LoadedIssues = S.TaggedStruct('LoadedIssues', {
  issues: S.Array(Issue),
})
/** Live collection observation failed. */
export const FailedIssues = S.TaggedStruct('FailedIssues', {
  reason: S.String,
})
/** Every live Issue collection state. */
export const IssuesState = S.Union([LoadingIssues, LoadedIssues, FailedIssues])
/** Every live Issue collection state. */
export type IssuesState = typeof IssuesState.Type

/** The product catalog has not emitted its first snapshot. */
export const LoadingProducts = S.TaggedStruct('LoadingProducts', {})
/** The product catalog emitted its latest snapshot. */
export const LoadedProducts = S.TaggedStruct('LoadedProducts', {
  products: S.Array(ProductCatalogEntry),
})
/** Product catalog observation failed. */
export const FailedProducts = S.TaggedStruct('FailedProducts', {
  reason: S.String,
})
/** Every first-class product catalog state. */
export const ProductsState = S.Union([
  LoadingProducts,
  LoadedProducts,
  FailedProducts,
])
/** Every first-class product catalog state. */
export type ProductsState = typeof ProductsState.Type

/** Transcript-derived triage drafts have not emitted their first snapshot. */
export const LoadingTriageCandidates = S.TaggedStruct(
  'LoadingTriageCandidates',
  {},
)
/** The latest transcript-derived triage drafts are available. */
export const LoadedTriageCandidates = S.TaggedStruct('LoadedTriageCandidates', {
  candidates: S.Array(TriageCandidate),
})
/** Transcript-derived triage observation failed. */
export const FailedTriageCandidates = S.TaggedStruct('FailedTriageCandidates', {
  reason: S.String,
})
/** Every transcript triage observation state. */
export const TriageCandidatesState = S.Union([
  LoadingTriageCandidates,
  LoadedTriageCandidates,
  FailedTriageCandidates,
])
/** Every transcript triage observation state. */
export type TriageCandidatesState = typeof TriageCandidatesState.Type

/** No individual Issue destination is being observed. */
export const NotObservingIssue = S.TaggedStruct('NotObservingIssue', {})
/** One individual Issue is being observed, but has not emitted yet. */
export const LoadingIssue = S.TaggedStruct('LoadingIssue', {
  issueId: S.String,
})
/** One individual Issue observation emitted. */
export const LoadedIssue = S.TaggedStruct('LoadedIssue', {
  issue: S.Option(Issue),
  issueId: S.String,
})
/** One individual Issue observation failed. */
export const FailedIssue = S.TaggedStruct('FailedIssue', {
  issueId: S.String,
  reason: S.String,
})
/** Every selected-Issue observation state. */
export const IssueDetailState = S.Union([
  NotObservingIssue,
  LoadingIssue,
  LoadedIssue,
  FailedIssue,
])
/** Every selected-Issue observation state. */
export type IssueDetailState = typeof IssueDetailState.Type

/** No Issue log evidence destination is selected. */
export const NotObservingIssueLogs = S.TaggedStruct('NotObservingIssueLogs', {})
/** The selected Issue log query has not emitted yet. */
export const LoadingIssueLogs = S.TaggedStruct('LoadingIssueLogs', {
  issueId: S.String,
})
/** The selected Issue log query emitted its latest evidence rows. */
export const LoadedIssueLogs = S.TaggedStruct('LoadedIssueLogs', {
  issueId: S.String,
  logs: S.Array(IssueLogEvidence),
})
/** The selected Issue log query failed. */
export const FailedIssueLogs = S.TaggedStruct('FailedIssueLogs', {
  issueId: S.String,
  reason: S.String,
})
/** Every selected Issue log evidence state. */
export const IssueLogsState = S.Union([
  NotObservingIssueLogs,
  LoadingIssueLogs,
  LoadedIssueLogs,
  FailedIssueLogs,
])
/** Every selected Issue log evidence state. */
export type IssueLogsState = typeof IssueLogsState.Type

/** The live Issue collection is visible. */
export const IssueList = S.TaggedStruct('IssueList', {})
/** One Issue detail is visible. */
export const IssueDetail = S.TaggedStruct('IssueDetail', {
  issueId: S.String,
})
/** The new-Issue filing form is visible. */
export const FileIssue = S.TaggedStruct('FileIssue', {})
/** Transcript-derived draft triage candidates are visible. */
export const TriageInbox = S.TaggedStruct('TriageInbox', {})
/** Every representable navigation destination. */
export const Navigation = S.Union([
  IssueList,
  IssueDetail,
  FileIssue,
  TriageInbox,
])
/** Every representable navigation destination. */
export type Navigation = typeof Navigation.Type

/** The editable fields required to file one Issue. */
export const IssueDraft = S.Struct({
  details: S.String,
  leftoverKind: S.Option(LeftoverKind),
  priority: Issue.fields.priority,
  productId: S.String,
  title: S.String,
})
/** The editable fields required to file one Issue. */
export type IssueDraft = typeof IssueDraft.Type

/** The filing form is ready for editing or submission. */
export const EditingIssueDraft = S.TaggedStruct('EditingIssueDraft', {})
/** The filing form is saving an Issue. */
export const SavingIssueDraft = S.TaggedStruct('SavingIssueDraft', {})
/** The filing form failed to save. */
export const FailedIssueDraft = S.TaggedStruct('FailedIssueDraft', {
  reason: S.String,
})
/** Every filing state. */
export const IssueDraftState = S.Union([
  EditingIssueDraft,
  SavingIssueDraft,
  FailedIssueDraft,
])
/** Every filing state. */
export type IssueDraftState = typeof IssueDraftState.Type

/** No leftover mutation is in flight. */
export const IdleIssueMutation = S.TaggedStruct('IdleIssueMutation', {})
/** A leftover comment, link, or status save is in flight. */
export const SavingIssueMutation = S.TaggedStruct('SavingIssueMutation', {})
/** A leftover mutation failed. */
export const FailedIssueMutation = S.TaggedStruct('FailedIssueMutation', {
  reason: S.String,
})
/** Every leftover mutation phase. */
export const IssueMutationState = S.Union([
  IdleIssueMutation,
  SavingIssueMutation,
  FailedIssueMutation,
])
/** Every leftover mutation phase. */
export type IssueMutationState = typeof IssueMutationState.Type

/** The shared renderer-independent Issue Tracker Model. */
export const Model = S.Struct({
  draft: IssueDraft,
  draftState: IssueDraftState,
  issueDetail: IssueDetailState,
  issueLogs: IssueLogsState,
  issueMutation: IssueMutationState,
  issues: IssuesState,
  leftoverComment: S.String,
  leftoverLink: S.String,
  navigation: Navigation,
  productFilter: ProductFilter,
  products: ProductsState,
  triageCandidates: TriageCandidatesState,
})
/** The shared renderer-independent Issue Tracker Model. */
export type Model = typeof Model.Type
