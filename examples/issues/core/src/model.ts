import { Effect, Option, Schema as S } from 'effect'

import {
  Issue,
  IssueLandingState,
  IssueReference,
  IssueStatus,
  IssueSuccessEvidence,
  IssueWorkActivity,
  ProductCatalogEntry,
  TrackedProduct,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { LeftoverPeer } from '@foldkit/instant-tools/leftover'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { LandingFilter } from './landing.js'
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
/** The backlog: the next build's lane, then each priority in rank order. */
export const Backlog = S.TaggedStruct('Backlog', {})
/** Every representable navigation destination. */
export const Navigation = S.Union([
  IssueList,
  IssueDetail,
  FileIssue,
  TriageInbox,
  Backlog,
])
/** Every representable navigation destination. */
export type Navigation = typeof Navigation.Type

const defaultDraftStatus: IssueStatus = 'Open'

const DraftOptionalString = S.Option(S.String).pipe(
  S.withDecodingDefaultKey(Effect.succeed(Option.none())),
  S.withConstructorDefault(Effect.succeed(Option.none())),
)

/**
 * One Mention written into a draft before the Issue has a number: Michael's
 * line in Recording 208, its words, and its deep link. Filing gives it the id
 * `mention-<number>-<position>`.
 */
export const DraftMention = S.Struct({
  capturedAtMs: S.Option(S.Number),
  directQuote: S.Option(S.String),
  note: S.Option(S.String),
  related: S.Array(IssueReference),
  reporter: S.Option(IssueReference),
  source: IssueReference,
})
/** One Mention written into a draft before the Issue has a number. */
export type DraftMention = typeof DraftMention.Type

/** One outcome a draft promises and the proof it needs. */
export const DraftSuccessCriterion = S.Struct({
  outcome: S.String,
  requiredEvidence: S.Array(IssueSuccessEvidence),
})
/** One outcome a draft promises and the proof it needs. */
export type DraftSuccessCriterion = typeof DraftSuccessCriterion.Type

/**
 * One work-log entry written into a draft, such as the agent that filed the
 * Issue saying so. Filing gives it the id `work-<number>-<state>-<time>`.
 */
export const DraftWorkLogEntry = S.Struct({
  agentId: S.Option(S.String),
  commitSha: S.Option(S.String),
  occurredAtMs: S.Number,
  state: S.Option(S.String),
  summary: S.String,
})
/** One work-log entry written into a draft. */
export type DraftWorkLogEntry = typeof DraftWorkLogEntry.Type

/**
 * The editable fields required to file one Issue. `productId` holds the
 * product as written, its id or its name, until filing resolves it.
 */
export const IssueDraft = S.Struct({
  area: DraftOptionalString,
  claimantId: DraftOptionalString,
  details: S.String,
  issueType: DraftOptionalString,
  leftoverKind: S.Option(LeftoverKind),
  mentions: S.Array(DraftMention).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  priority: Issue.fields.priority,
  productId: S.String,
  relatedIssueIds: S.Array(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  status: IssueStatus.pipe(
    S.withDecodingDefaultKey(Effect.succeed(defaultDraftStatus)),
    S.withConstructorDefault(Effect.succeed(defaultDraftStatus)),
  ),
  successCriteria: S.Array(DraftSuccessCriterion).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  title: S.String,
  workLog: S.Array(DraftWorkLogEntry).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
})
/** The editable fields required to file one Issue. */
export type IssueDraft = typeof IssueDraft.Type

/**
 * One change to an Issue's work in progress: only the fields given change.
 * `{ landingState: Option.some('Green'), commitSha: Option.some('5e1f00d') }`
 * moves the work to Green at that commit and keeps its branch and worktree.
 */
export const WorkInProgressEdit = S.Struct({
  activity: S.Option(IssueWorkActivity),
  agentId: S.Option(S.String),
  branch: S.Option(S.String),
  commitSha: S.Option(S.String),
  landingState: S.Option(IssueLandingState),
  lastStep: S.Option(S.String),
  repository: S.Option(S.String),
  targetBuild: S.Option(S.String),
  worktree: S.Option(S.String),
})
/** One change to an Issue's work in progress. */
export type WorkInProgressEdit = typeof WorkInProgressEdit.Type

/** Which way subtasks are marked: checked off, or back to unchecked. */
export const SubtaskMark = S.Literals(['Checked', 'Unchecked'])
/** Which way subtasks are marked. */
export type SubtaskMark = typeof SubtaskMark.Type

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
/**
 * The last change to an Issue was read back from the store. A work-log entry
 * names its id, such as `work-692-claimed-1792017248455`.
 */
export const SavedIssueMutation = S.TaggedStruct('SavedIssueMutation', {
  entryId: S.Option(S.String),
  issueId: S.String,
})
/** The last mutation deleted this Issue. */
export const DeletedIssueMutation = S.TaggedStruct('DeletedIssueMutation', {
  issue: Issue,
})
/** Every leftover mutation phase. */
export const IssueMutationState = S.Union([
  IdleIssueMutation,
  SavingIssueMutation,
  FailedIssueMutation,
  SavedIssueMutation,
  DeletedIssueMutation,
])
/** Every leftover mutation phase. */
export type IssueMutationState = typeof IssueMutationState.Type

/** No product is being added to the catalog. */
export const IdleProductAddition = S.TaggedStruct('IdleProductAddition', {})
/** A new product, such as `acaga` named ACAGA, is being saved. */
export const SavingProductAddition = S.TaggedStruct('SavingProductAddition', {
  product: TrackedProduct,
})
/** The catalog saved the new product and read it back. */
export const SavedProductAddition = S.TaggedStruct('SavedProductAddition', {
  product: TrackedProduct,
})
/** The catalog already holds the product as given, so nothing was written. */
export const UnchangedProductAddition = S.TaggedStruct(
  'UnchangedProductAddition',
  { product: TrackedProduct },
)
/**
 * The product was refused before anything was written: a malformed id, a
 * blank name, or an id or name another product already holds.
 */
export const RefusedProductAddition = S.TaggedStruct('RefusedProductAddition', {
  reason: S.String,
})
/** The catalog was not loaded, refused the save, or lost the product. */
export const FailedProductAddition = S.TaggedStruct('FailedProductAddition', {
  reason: S.String,
})
/** Every phase of adding one product to the catalog. */
export const ProductAdditionState = S.Union([
  IdleProductAddition,
  SavingProductAddition,
  SavedProductAddition,
  UnchangedProductAddition,
  RefusedProductAddition,
  FailedProductAddition,
])
/** Every phase of adding one product to the catalog. */
export type ProductAdditionState = typeof ProductAdditionState.Type

/** No leftover room is being observed. */
export const NotObservingLeftoverPresence = S.TaggedStruct(
  'NotObservingLeftoverPresence',
  {},
)
/** A leftover room is joined, but has not emitted peers yet. */
export const LoadingLeftoverPresence = S.TaggedStruct(
  'LoadingLeftoverPresence',
  { leftoverId: S.String },
)
/** Latest leftover room peers. */
export const LoadedLeftoverPresence = S.TaggedStruct('LoadedLeftoverPresence', {
  leftoverId: S.String,
  peers: S.Array(LeftoverPeer),
})
/** Leftover room observation failed. */
export const FailedLeftoverPresence = S.TaggedStruct('FailedLeftoverPresence', {
  leftoverId: S.String,
  reason: S.String,
})
/** Every leftover presence observation state. */
export const LeftoverPresenceState = S.Union([
  NotObservingLeftoverPresence,
  LoadingLeftoverPresence,
  LoadedLeftoverPresence,
  FailedLeftoverPresence,
])
/** Every leftover presence observation state. */
export type LeftoverPresenceState = typeof LeftoverPresenceState.Type

/** The shared renderer-independent Issue Tracker Model. */
export const Model = S.Struct({
  draft: IssueDraft,
  draftState: IssueDraftState,
  issueDetail: IssueDetailState,
  issueLogs: IssueLogsState,
  issueMutation: IssueMutationState,
  issues: IssuesState,
  landingFilter: LandingFilter,
  leftoverComment: S.String,
  leftoverLink: S.String,
  leftoverPresence: LeftoverPresenceState,
  navigation: Navigation,
  productAddition: ProductAdditionState,
  productFilter: ProductFilter,
  products: ProductsState,
  triageCandidates: TriageCandidatesState,
})
/** The shared renderer-independent Issue Tracker Model. */
export type Model = typeof Model.Type
