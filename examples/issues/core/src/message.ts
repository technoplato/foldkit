import { Schema as S } from 'effect'

import {
  Issue,
  IssueAttachment,
  IssuePriority,
  IssueStatus,
  IssueSuccessEvidence,
  IssueTouchedFiles,
  ProductCatalogEntry,
  TrackedProduct,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'
import { LeftoverPeer } from '@foldkit/instant-tools/leftover'
import { IssueLogEvidence } from '@foldkit/instant-tools/logging'

import { PageEntity } from './entityGraph.js'
import { IssueFileAddress } from './issueFiles.js'
import { IssueLanding, LandedBuild, PageFacts } from './issueLandings.js'
import { LandingFilter } from './landing.js'
import { LeftoverStatus, ProductFilter } from './leftover.js'
import {
  DraftMention,
  IssueDraft,
  Navigation,
  SubtaskMark,
  WorkInProgressEdit,
} from './model.js'
import { AgentSurvey } from './nowWorking.js'

/**
 * The reader's clock was read: the time and the offset of their time zone
 * from UTC in minutes, once when the tracker opens and then each minute.
 */
export const TickedClock = S.TaggedStruct('TickedClock', {
  nowMs: S.Number,
  offsetMinutes: S.Number,
})
export const ObservedIssues = S.TaggedStruct('ObservedIssues', {
  issues: S.Array(Issue),
})
/**
 * A live snapshot's Issues as a Message, without walking them again: the
 * store decoded them, and `ObservedIssues.make` re-validates all of them,
 * about 110 ms for the 1,535 stored Issues on every live change.
 */
export const observedIssuesOf = (
  issues: ReadonlyArray<typeof Issue.Type>,
): typeof ObservedIssues.Type => ({ _tag: 'ObservedIssues', issues })
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
export const ObservedIssueFiles = S.TaggedStruct('ObservedIssueFiles', {
  files: S.Array(IssueFileAddress),
  issueId: S.String,
})
export const FailedObserveIssueFiles = S.TaggedStruct(
  'FailedObserveIssueFiles',
  { issueId: S.String, reason: S.String },
)
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
/** Scribe's rows said where the open Issue landed. */
export const ObservedIssueLanding = S.TaggedStruct('ObservedIssueLanding', {
  issueId: S.String,
  landing: IssueLanding,
})
/** Scribe's rows could not be read for the open Issue. */
export const FailedObserveIssueLanding = S.TaggedStruct(
  'FailedObserveIssueLanding',
  { issueId: S.String, reason: S.String },
)
/** Scribe's rows said which builds there are, so chips can name them. */
export const ObservedBuilds = S.TaggedStruct('ObservedBuilds', {
  builds: S.Array(LandedBuild),
})
/** Scribe's builds could not be read; chips show the number alone. */
export const FailedObserveBuilds = S.TaggedStruct('FailedObserveBuilds', {
  reason: S.String,
})
/** Scribe's rows said what the build or commit on the page is. */
export const ObservedPageFacts = S.TaggedStruct('ObservedPageFacts', {
  entity: PageEntity,
  facts: PageFacts,
})
/** Scribe's rows could not be read for the build or commit on the page. */
export const FailedObservePageFacts = S.TaggedStruct('FailedObservePageFacts', {
  entity: PageEntity,
  reason: S.String,
})
export const ClickedFileIssue = S.TaggedStruct('ClickedFileIssue', {})
export const ClickedOpenTriage = S.TaggedStruct('ClickedOpenTriage', {})
export const ClickedOpenBacklog = S.TaggedStruct('ClickedOpenBacklog', {})
/** A person opened the page of how long asks take. */
export const ClickedOpenAskFlow = S.TaggedStruct('ClickedOpenAskFlow', {})
/** A person typed into the list's search field: `heart rate`, `#1538`. */
export const UpdatedSearchQuery = S.TaggedStruct('UpdatedSearchQuery', {
  query: S.String,
})
/** A person pressed Enter in the list's search field. */
export const SubmittedSearch = S.TaggedStruct('SubmittedSearch', {})
/** The search field holds the focus now: `/` was pressed or it was clicked. */
export const FocusedSearchField = S.TaggedStruct('FocusedSearchField', {})
/** The search field let go of the focus. */
export const BlurredSearchField = S.TaggedStruct('BlurredSearchField', {})
/** The row cursor moved a row: `j` or `k` on the list. */
export const MovedRowCursor = S.TaggedStruct('MovedRowCursor', {
  direction: S.Literals(['Next', 'Previous']),
})
/** A person opened the row under the cursor: Enter on the list. */
export const OpenedRowUnderCursor = S.TaggedStruct('OpenedRowUnderCursor', {})
/** A person pressed `g`, and the next key says where to go. */
export const PressedGoKey = S.TaggedStruct('PressedGoKey', {})
/** The key after `g` named no place. */
export const CancelledGoKey = S.TaggedStruct('CancelledGoKey', {})
/** A person went to the list: `g` then `l`. */
export const ClickedOpenIssueList = S.TaggedStruct('ClickedOpenIssueList', {})
/** A person opened the command palette: Cmd+K. */
export const OpenedCommandPalette = S.TaggedStruct('OpenedCommandPalette', {})
/** A person typed into the command palette: `backlog`, `1358`. */
export const UpdatedPaletteQuery = S.TaggedStruct('UpdatedPaletteQuery', {
  query: S.String,
})
/** The palette's mark moved a row: an arrow key. */
export const MovedPaletteMark = S.TaggedStruct('MovedPaletteMark', {
  direction: S.Literals(['Next', 'Previous']),
})
/** A person pressed Enter in the palette, running the marked row. */
export const SubmittedPalette = S.TaggedStruct('SubmittedPalette', {})
/** A person clicked one row of the palette: its interaction's token. */
export const PickedPaletteRow = S.TaggedStruct('PickedPaletteRow', {
  token: S.String,
})
/** A person closed what showed above the page: Esc, or a press outside it. */
export const DismissedLayer = S.TaggedStruct('DismissedLayer', {})
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
/**
 * The Mac looked at its agents (`issues working sync`): who runs on the Issue,
 * which runs ended, and the files the running agent's worktree touches.
 */
export const ObservedAgentSurvey = S.TaggedStruct('ObservedAgentSurvey', {
  issueId: S.String,
  survey: AgentSurvey,
  touchedFiles: S.Option(IssueTouchedFiles),
})
export const ClearedIssueWorkInProgress = S.TaggedStruct(
  'ClearedIssueWorkInProgress',
  { issueId: S.String },
)
export const SubmittedIssueRank = S.TaggedStruct('SubmittedIssueRank', {
  issueId: S.String,
  rank: S.Option(S.Number),
})
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
  TickedClock,
  ObservedIssues,
  FailedObserveIssues,
  ObservedProducts,
  FailedObserveProducts,
  ObservedTriageCandidates,
  FailedObserveTriageCandidates,
  ObservedIssue,
  FailedObserveIssue,
  ObservedIssueFiles,
  FailedObserveIssueFiles,
  ObservedIssueLanding,
  FailedObserveIssueLanding,
  ObservedBuilds,
  FailedObserveBuilds,
  ObservedPageFacts,
  FailedObservePageFacts,
  ObservedIssueLogs,
  FailedObserveIssueLogs,
  SelectedIssue,
  DismissedIssueDetail,
  ClickedFileIssue,
  ClickedOpenTriage,
  ClickedOpenBacklog,
  ClickedOpenAskFlow,
  UpdatedSearchQuery,
  SubmittedSearch,
  FocusedSearchField,
  BlurredSearchField,
  MovedRowCursor,
  OpenedRowUnderCursor,
  PressedGoKey,
  CancelledGoKey,
  ClickedOpenIssueList,
  OpenedCommandPalette,
  UpdatedPaletteQuery,
  MovedPaletteMark,
  SubmittedPalette,
  PickedPaletteRow,
  DismissedLayer,
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
  ObservedAgentSurvey,
  ClearedIssueWorkInProgress,
  SubmittedIssueRank,
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
