import {
  Array,
  Clock,
  Effect,
  Equivalence,
  Match as M,
  Option,
  Predicate,
  Schema as S,
} from 'effect'
import { Command } from 'foldkit'

import {
  ActiveWork,
  ApplicationProduct,
  CheckedSubtask,
  ISSUE_VIEWER_ORIGIN,
  Issue,
  IssueAttachment,
  type IssueLandingState,
  IssueLogEvidenceQuery,
  IssueMention,
  IssueStatus,
  IssueSubtask,
  IssueSuccessCriterion,
  IssueTouchedFiles,
  IssueTracker,
  type IssueWorkActivity,
  IssueWorkInProgress,
  IssueWorkLogEntry,
  ProductCatalog,
  ProductCatalogEntry,
  RecordingMention,
  RecordingReference,
  TrackedProduct,
  TriageCandidate,
  TriageInbox as TriageInboxServiceTag,
  UncheckedSubtask,
  UriReference,
  describeIssueTrackerCause,
  issueViewerUrl,
  normalizeIssueId,
} from '@foldkit/instant-tools/issues'
import {
  LeftoverPresence,
  LeftoverPresenceJoin,
} from '@foldkit/instant-tools/leftover'
import { Logger } from '@foldkit/instant-tools/logging'

import { cardAcross, changeAcross, columnChangeOf } from './board.js'
import { menuStaysOpen } from './choices.js'
import { type PageEntity, pageEntityKey } from './entityGraph.js'
import { draftOfFinding } from './findingDraft.js'
import { type AgentFinding } from './graphFacts.js'
import { GraphRows } from './graphRows.js'
import { emptyIssueDraft } from './init.js'
import { IssueIdentity } from './issueIdentity.js'
import { describeIssueLandingError } from './issueLandings.js'
import {
  type IssueView,
  isIssueNumbered,
  issueNumberOfSearch,
  primedSearchText,
} from './issueView.js'
import { IssueViews, SavedView, describeIssueViewError } from './issueViews.js'
import {
  LeftoverStatus,
  type ProductFilter,
  hasCatalogIssueLink,
  leftoverMayClose,
  storedStatusOf,
} from './leftover.js'
import {
  type RowDirection,
  issueUnderCursorOf,
  issueViewOf,
  issuesInHandOf,
  listedIssues,
  loadedIssuesIn,
  movedRowCursor,
  productFilterOf,
  rowsInOrderOf,
  savedViewsOf,
  selectedRowsOf,
  selectedSetOf,
} from './listing.js'
import { type MenuRow, openMenuRowsOf } from './menus.js'
import {
  CompletedJoinLeftoverRoom,
  CompletedLeaveLeftoverRoom,
  FailedDeleteIssue,
  FailedDeleteIssueView,
  FailedFileIssueDraft,
  FailedJoinLeftoverRoom,
  FailedLeaveLeftoverRoom,
  FailedMarkFindingPromoted,
  FailedReviewTriageCandidate,
  FailedRowEditWrite,
  FailedSaveIssue,
  FailedSaveIssueView,
  FailedSaveIssueWorkLog,
  FailedSaveProduct,
  type Message,
  SucceededAppendIssueWorkLogEntry,
  SucceededCommentOnIssue,
  SucceededDeleteIssue,
  SucceededDeleteIssueView,
  SucceededFileIssueDraft,
  SucceededLinkCatalogIssue,
  SucceededMarkFindingPromoted,
  SucceededReviewTriageCandidate,
  SucceededRowEdit,
  SucceededSaveIssue,
  SucceededSaveIssueView,
  SucceededSaveIssueWorkLog,
  SucceededSaveProduct,
} from './message.js'
import {
  AskFlow,
  Backlog,
  ChoiceLayer,
  type ChoiceMenu,
  DeletedIssueMutation,
  DraftMention,
  EditingIssueDraft,
  Decisions,
  FailedDecisions,
  FailedFeatures,
  FailedFindings,
  FailedQuestions,
  FailedReminders,
  FailedIssue,
  FailedIssueDraft,
  FailedIssueFiles,
  FailedIssueGraph,
  FailedIssueLanding,
  FailedIssueLogs,
  FailedIssueMutation,
  FailedIssues,
  FailedLeftoverPresence,
  FailedPageFacts,
  FailedProductAddition,
  FailedProducts,
  FailedSavedViews,
  FailedTriageCandidates,
  Features,
  FileIssue,
  Findings,
  IdleIssueMutation,
  Inbox,
  IssueDetail,
  IssueDraft,
  IssueList,
  LoadedFeatures,
  LoadedFindings,
  LoadedIssue,
  LoadedIssueFiles,
  LoadedIssueGraph,
  LoadedIssueLanding,
  LoadedIssueLogs,
  LoadedIssues,
  LoadedLeftoverPresence,
  LoadedPageFacts,
  LoadedProducts,
  LoadedSavedViews,
  LoadedTriageCandidates,
  LoadingIssue,
  LoadingIssueLogs,
  LoadingLeftoverPresence,
  type Model,
  NamingViewLayer,
  type Navigation,
  NoLayer,
  NotObservingFeatures,
  NotObservingFindings,
  NotObservingIssue,
  NotObservingIssueFiles,
  NotObservingIssueGraph,
  NotObservingIssueLanding,
  NotObservingIssueLogs,
  NotObservingLeftoverPresence,
  NotObservingPageFacts,
  type PageFactsObservation,
  PeekLayer,
  type ProductAdditionState,
  Products,
  Questions,
  Reminders,
  RefusedProductAddition,
  SavedIssueMutation,
  SavedProductAddition,
  SavingIssueDraft,
  SavingIssueMutation,
  SavingProductAddition,
  type ScreenLayer,
  SubtaskMark,
  TriageInbox,
  UnchangedProductAddition,
  WorkInProgressEdit,
  loadedIssuesOf,
  nextModel,
} from './model.js'
import {
  AgentSurvey,
  observedIssue,
  statusFollowingLanding,
  workingSyncAgent,
} from './nowWorking.js'
import { searchOfView } from './route.js'
import { type RowChange, type RowEdit, isChangeTo } from './rowEdit.js'
import {
  selectionExtendedBy,
  selectionExtendedTo,
  selectionToggled,
} from './rowSelection.js'

// COMMAND

const TAGGED_LOGS_LIMIT = 200
const DATE_PART_WIDTH = 2

const taggedLogsQuery = (issueId: string) =>
  IssueLogEvidenceQuery.make({
    id: `issue-${issueId}-tagged-logs`,
    instantQueryJSON: JSON.stringify({
      instantToolsLogIssueLinks: {
        $: {
          limit: TAGGED_LOGS_LIMIT,
          order: { timestampMs: 'desc' },
          where: { issueID: issueId },
        },
      },
    }),
    issueID: issueId,
    label: `Logs tagged #${issueId}`,
    viewerURL: `${issueViewerUrl(issueId)}#evidence-logs`,
  })

const localDateOf = (timeMs: number): string => {
  const date = new Date(timeMs)
  const month = String(date.getMonth() + 1).padStart(DATE_PART_WIDTH, '0')
  const day = String(date.getDate()).padStart(DATE_PART_WIDTH, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const storedIssueIdOf = (issueId: string): string =>
  Option.getOrElse(normalizeIssueId(issueId), () => issueId.trim())

/** The id a work-log entry gets: `work-692-claimed-1792017248455`. */
export const workLogEntryId = (
  issueId: string,
  state: Option.Option<string>,
  occurredAtMs: number,
): string =>
  `work-${issueId}-${Option.getOrElse(state, () => 'note')}-${occurredAtMs.toString()}`

const isSameText = Option.makeEquivalence(Equivalence.String)

const isSameNumber = Option.makeEquivalence(Equivalence.Number)

/** Whether two work-log entries say the same thing, whatever their ids. */
const isSameEntry = (
  stored: IssueWorkLogEntry,
  entry: IssueWorkLogEntry,
): boolean =>
  stored.summary === entry.summary &&
  stored.occurredAtMs === entry.occurredAtMs &&
  isSameText(stored.agentId, entry.agentId) &&
  isSameText(stored.state, entry.state) &&
  isSameText(stored.commitSha, entry.commitSha) &&
  isSameNumber(stored.durationSeconds, entry.durationSeconds)

/** The entry as `issue` holds it, by whatever id it was stored under. */
const storedEntryOf = (
  issue: Issue,
  entry: IssueWorkLogEntry,
): Option.Option<IssueWorkLogEntry> =>
  Array.findFirst(issue.workLog, stored => isSameEntry(stored, entry))

const hasWorkLogEntry = (issue: Issue, entry: IssueWorkLogEntry): boolean =>
  Option.isSome(storedEntryOf(issue, entry))

/**
 * The first of `entryId`, `entryId-2`, `entryId-3`, ... no entry of `issue`
 * holds: two writers logging one state on one Issue in one millisecond both
 * build `work-692-progress-1792017248455`, and the second keeps its entry as
 * `work-692-progress-1792017248455-2`.
 */
const freeEntryId = (issue: Issue, entryId: string): string => {
  const taken = new Set(Array.map(issue.workLog, stored => stored.id))
  const candidateAt = (suffix: number): string =>
    suffix === 1 ? entryId : `${entryId}-${suffix.toString()}`
  let suffix = 1
  while (taken.has(candidateAt(suffix))) {
    suffix += 1
  }
  return candidateAt(suffix)
}

const appendWorkLogEntry = (
  issue: Issue,
  entry: IssueWorkLogEntry,
): ReadonlyArray<IssueWorkLogEntry> =>
  hasWorkLogEntry(issue, entry)
    ? issue.workLog
    : Array.append(
        issue.workLog,
        IssueWorkLogEntry.make({ ...entry, id: freeEntryId(issue, entry.id) }),
      )

/** The id `entry` was stored under on `issue`, or the id it was built with. */
const storedEntryIdOf = (issue: Issue, entry: IssueWorkLogEntry): string =>
  Option.match(storedEntryOf(issue, entry), {
    onNone: () => entry.id,
    onSome: stored => stored.id,
  })

const nextUpdatedAtMs = (issue: Issue, nowMs: number): number =>
  Math.max(nowMs, issue.updatedAtMs + 1)

const failureReason = (error: unknown): string =>
  describeIssueTrackerCause(error)

/** Builds the Issue a draft files under its allocated number. */
export const issueFromDraft = (
  draft: IssueDraft,
  product: TrackedProduct,
  issueId: string,
  nowMs: number,
): Issue =>
  Issue.make({
    area: draft.area,
    attachments: [],
    claimantId: draft.claimantId,
    complexity: Option.none(),
    createdAtMs: nowMs,
    details: draft.details,
    evidenceLogQueries: [taggedLogsQuery(issueId)],
    id: issueId,
    issueType: Option.orElse(draft.issueType, () => draft.leftoverKind),
    mentions: Array.map(draft.mentions, (mention, index) =>
      IssueMention.make({
        ...mention,
        id: `mention-${issueId}-${(index + 1).toString()}`,
        issueId,
      }),
    ),
    nightlyEligible: true,
    priority: draft.priority,
    product,
    projectId: Option.none(),
    relatedIssueIds: draft.relatedIssueIds,
    reportedDate: Option.some(localDateOf(nowMs)),
    sourceDocument: Option.none(),
    status: draft.status,
    successCriteria: Array.map(draft.successCriteria, (criterion, index) =>
      IssueSuccessCriterion.make({
        id: `issue-${issueId}-criterion-${(index + 1).toString()}`,
        isSatisfied: false,
        outcome: criterion.outcome,
        requiredEvidence: criterion.requiredEvidence,
      }),
    ),
    title: draft.title,
    updatedAtMs: nowMs,
    viewerURL: Option.some(issueViewerUrl(issueId)),
    workLog: Array.map(draft.workLog, entry =>
      IssueWorkLogEntry.make({
        agentId: entry.agentId,
        commitSha: entry.commitSha,
        durationSeconds: Option.none(),
        id: workLogEntryId(issueId, entry.state, entry.occurredAtMs),
        occurredAtMs: entry.occurredAtMs,
        state: entry.state,
        summary: entry.summary,
      }),
    ),
  })

/** Files one draft under the next free Issue number. */
export const FileIssueDraft = Command.define(
  'FileIssueDraft',
  {
    draft: IssueDraft,
    maybeFindingId: S.Option(S.String),
    product: TrackedProduct,
  },
  SucceededFileIssueDraft,
  FailedFileIssueDraft,
)(({ draft, maybeFindingId, product }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { nowMs } = yield* identity.next
    const issue = yield* tracker.file(issueId =>
      issueFromDraft(draft, product, issueId, nowMs),
    )
    return SucceededFileIssueDraft.make({ issue, maybeFindingId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedFileIssueDraft.make({ reason: failureReason(error) }),
      ),
    ),
  ),
)

/** Marks a finding's row with the Issue it became. */
export const MarkFindingPromoted = Command.define(
  'MarkFindingPromoted',
  { findingId: S.String, issueId: S.String },
  SucceededMarkFindingPromoted,
  FailedMarkFindingPromoted,
)(({ findingId, issueId }) =>
  Effect.gen(function* () {
    const graph = yield* GraphRows
    yield* graph.markFindingPromoted(findingId, Number(issueId))
    return SucceededMarkFindingPromoted.make({ findingId, issueId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedMarkFindingPromoted.make({
          findingId,
          issueId,
          reason: describeIssueLandingError(error),
        }),
      ),
    ),
  ),
)

/** Applies an explicit human review decision to one transcript draft. */
export const ReviewTriageCandidate = Command.define(
  'ReviewTriageCandidate',
  {
    candidate: TriageCandidate,
    decision: S.Literals(['Dismiss', 'Promote']),
  },
  SucceededReviewTriageCandidate,
  FailedReviewTriageCandidate,
)(({ candidate, decision }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const inbox = yield* TriageInboxServiceTag
    const { nowMs } = yield* identity.next
    const reviewed = TriageCandidate.make({
      ...candidate,
      status: decision === 'Promote' ? 'Promoted' : 'Dismissed',
      updatedAtMs: nowMs,
    })
    if (decision === 'Dismiss') {
      yield* inbox.saveCandidate(reviewed)
      return SucceededReviewTriageCandidate.make({
        candidate: reviewed,
        issue: Option.none(),
      })
    }
    const tracker = yield* IssueTracker
    const source = RecordingReference.make({
      recording: RecordingMention.make({
        endMilliseconds: Option.some(candidate.segment.endMilliseconds),
        recordingId: candidate.segment.recordingId,
        screenshotIds: [],
        startMilliseconds: candidate.segment.startMilliseconds,
      }),
    })
    const issue = yield* tracker.file(issueId =>
      Issue.make({
        area: Option.none(),
        attachments: [],
        claimantId: Option.none(),
        complexity: Option.none(),
        createdAtMs: nowMs,
        details: candidate.suggestedDetails,
        id: issueId,
        issueType: Option.none(),
        mentions: [
          IssueMention.make({
            capturedAtMs: Option.some(candidate.createdAtMs),
            directQuote: Option.some(candidate.segment.transcript),
            id: `mention-${issueId}`,
            issueId,
            related: Option.match(candidate.segment.publicUrl, {
              onNone: () => [],
              onSome: value => [UriReference.make({ value })],
            }),
            reporter: Option.none(),
            source,
          }),
        ],
        priority: candidate.suggestedPriority,
        product: candidate.product,
        projectId: Option.none(),
        reportedDate: Option.none(),
        sourceDocument: Option.none(),
        status: 'Open',
        successCriteria: [],
        title: candidate.suggestedTitle,
        updatedAtMs: nowMs,
        viewerURL: Option.some(issueViewerUrl(issueId)),
        workLog: [],
      }),
    )
    yield* inbox.saveCandidate(reviewed)
    return SucceededReviewTriageCandidate.make({
      candidate: reviewed,
      issue: Option.some(issue),
    })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedReviewTriageCandidate.make({ reason: failureReason(error) }),
      ),
    ),
  ),
)

const LEFTOVER_VIEWER_AGENT_ID = 'issues-viewer'
const LEFTOVER_VIEWER_ORIGIN = new URL(ISSUE_VIEWER_ORIGIN).host
const LEFTOVER_VIEWER_ROLE = 'viewer'

/** Persists one already-built Issue through the tracker. */
export const PersistIssue = Command.define(
  'PersistIssue',
  { issue: Issue },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issue }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    yield* tracker.save(issue)
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const appendSummary = (
  issueId: string,
  agentId: string,
  summary: string,
  nowMs: number,
) => {
  const entry = IssueWorkLogEntry.make({
    agentId: Option.some(agentId),
    commitSha: Option.none(),
    durationSeconds: Option.none(),
    id: `work-${storedIssueIdOf(issueId)}-${nowMs.toString()}`,
    occurredAtMs: nowMs,
    state: Option.none(),
    summary,
  })
  return {
    apply: (issue: Issue) =>
      Issue.make({
        ...issue,
        updatedAtMs: nextUpdatedAtMs(issue, nowMs),
        workLog: appendWorkLogEntry(issue, entry),
      }),
    hasLanded: (issue: Issue) => hasWorkLogEntry(issue, entry),
  }
}

/** Appends one IssueWorkLogEntry and reads the Issue back. */
export const CommentOnIssue = Command.define(
  'CommentOnIssue',
  { issueId: S.String, summary: S.String },
  SucceededCommentOnIssue,
  FailedSaveIssue,
)(({ issueId, summary }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { nowMs } = yield* identity.next
    const author = yield* identity.author
    const issue = yield* tracker.update(
      issueId,
      appendSummary(issueId, author, summary, nowMs),
    )
    return SucceededCommentOnIssue.make({ issue, summary })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Appends one IssueWorkLogEntry without changing Issue.status. */
export const SaveIssueWorkLog = Command.define(
  'SaveIssueWorkLog',
  { issue: Issue, summary: S.String },
  SucceededSaveIssueWorkLog,
  FailedSaveIssueWorkLog,
)(({ issue, summary }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const author = yield* identity.author
    const stored = yield* tracker.update(
      issue.id,
      appendSummary(issue.id, author, summary, nowMs),
    )
    return SucceededSaveIssueWorkLog.make({ issue: stored })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedSaveIssueWorkLog.make({ reason: failureReason(error) }),
      ),
    ),
  ),
)

/**
 * Appends one work-log entry with its state, agent, and commit, optionally
 * claiming the Issue and setting its status in the same write, and reads the
 * Issue back until the entry is there.
 */
export const AppendIssueWorkLogEntry = Command.define(
  'AppendIssueWorkLogEntry',
  {
    agentId: S.Option(S.String),
    claimantId: S.Option(S.String),
    commitSha: S.Option(S.String),
    issueId: S.String,
    state: S.String,
    status: S.Option(IssueStatus),
    summary: S.String,
  },
  SucceededAppendIssueWorkLogEntry,
  FailedSaveIssueWorkLog,
)(({ agentId, claimantId, commitSha, issueId, state, status, summary }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const entryId = workLogEntryId(
      storedIssueIdOf(issueId),
      Option.some(state),
      nowMs,
    )
    const entry = IssueWorkLogEntry.make({
      agentId,
      commitSha,
      durationSeconds: Option.none(),
      id: entryId,
      occurredAtMs: nowMs,
      state: Option.some(state),
      summary,
    })
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Issue.make({
          ...current,
          claimantId: Option.orElse(claimantId, () => current.claimantId),
          status: Option.getOrElse(status, () => current.status),
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
          workLog: appendWorkLogEntry(current, entry),
        }),
      hasLanded: stored =>
        hasWorkLogEntry(stored, entry) &&
        Option.match(status, {
          onNone: () => true,
          onSome: wanted => stored.status === wanted,
        }) &&
        Option.match(claimantId, {
          onNone: () => true,
          onSome: wanted => Option.contains(stored.claimantId, wanted),
        }),
    })
    return SucceededAppendIssueWorkLogEntry.make({
      entryId: storedEntryIdOf(issue, entry),
      issue,
    })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedSaveIssueWorkLog.make({ reason: failureReason(error) }),
      ),
    ),
  ),
)

/** Adds one uploaded file to the Issue's attachments and reads it back. */
export const AppendIssueAttachment = Command.define(
  'AppendIssueAttachment',
  { attachment: IssueAttachment, issueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ attachment, issueId }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const hasAttachment = (issue: Issue) =>
      Array.some(issue.attachments, current => current.id === attachment.id)
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        hasAttachment(current)
          ? current
          : Issue.make({
              ...current,
              attachments: Array.append(current.attachments, attachment),
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
            }),
      hasLanded: hasAttachment,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const optionLanded = <A>(wanted: Option.Option<A>, stored: A): boolean =>
  Option.match(wanted, {
    onNone: () => true,
    onSome: value => value === stored,
  })

/** Changes the fields of an Issue that were given, and reads them back. */
export const EditIssue = Command.define(
  'EditIssue',
  {
    area: S.Option(S.String),
    details: S.Option(S.String),
    issueId: S.String,
    issueType: S.Option(S.String),
    priority: S.Option(Issue.fields.priority),
    product: S.Option(TrackedProduct),
    title: S.Option(S.String),
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ area, details, issueId, issueType, priority, product, title }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Issue.make({
          ...current,
          area: Option.orElse(area, () => current.area),
          details: Option.getOrElse(details, () => current.details),
          issueType: Option.orElse(issueType, () => current.issueType),
          priority: Option.getOrElse(priority, () => current.priority),
          product: Option.getOrElse(product, () => current.product),
          title: Option.getOrElse(title, () => current.title),
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        }),
      hasLanded: stored =>
        optionLanded(details, stored.details) &&
        optionLanded(priority, stored.priority) &&
        optionLanded(title, stored.title) &&
        optionLanded(
          Option.map(product, chosen => chosen.id),
          stored.product.id,
        ) &&
        Option.match(area, {
          onNone: () => true,
          onSome: value => Option.contains(stored.area, value),
        }) &&
        Option.match(issueType, {
          onNone: () => true,
          onSome: value => Option.contains(stored.issueType, value),
        }),
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/**
 * The id a new child of an Issue gets: its position after the children it
 * already has, moved on past any id in use. Two criteria named
 * `issue-692-crit-1` and `-2` by an older writer give `issue-692-criterion-3`.
 */
const nextChildId = (
  prefix: string,
  existingIds: ReadonlyArray<string>,
): string => {
  const taken = new Set(existingIds)
  const firstPosition = existingIds.length + 1
  const maybeFree = Array.findFirst(
    Array.makeBy(existingIds.length + 1, offset => firstPosition + offset),
    position => !taken.has(`${prefix}${position.toString()}`),
  )
  return `${prefix}${Option.getOrElse(maybeFree, () => firstPosition + existingIds.length + 1).toString()}`
}

/** Adds one success criterion under the next free criterion id. */
export const AddIssueSuccessCriterion = Command.define(
  'AddIssueSuccessCriterion',
  {
    issueId: S.String,
    outcome: S.String,
    requiredEvidence: IssueSuccessCriterion.fields.requiredEvidence,
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, outcome, requiredEvidence }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const hasOutcome = (issue: Issue) =>
      Array.some(
        issue.successCriteria,
        criterion => criterion.outcome === outcome,
      )
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        hasOutcome(current)
          ? current
          : Issue.make({
              ...current,
              successCriteria: Array.append(
                current.successCriteria,
                IssueSuccessCriterion.make({
                  id: nextChildId(
                    `issue-${current.id}-criterion-`,
                    Array.map(
                      current.successCriteria,
                      criterion => criterion.id,
                    ),
                  ),
                  isSatisfied: false,
                  outcome,
                  requiredEvidence,
                }),
              ),
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
            }),
      hasLanded: hasOutcome,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const criteriaListing = (issue: Issue): string =>
  Array.join(
    Array.map(
      issue.successCriteria,
      (criterion, index) =>
        `${(index + 1).toString()} ${criterion.id} "${criterion.outcome}"`,
    ),
    ', ',
  )

/** Marks success criteria satisfied or not, and reads them back. */
export const MarkIssueSuccessCriteria = Command.define(
  'MarkIssueSuccessCriteria',
  {
    criterionIds: S.Array(S.String),
    isSatisfied: S.Boolean,
    issueId: S.String,
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ criterionIds, isSatisfied, issueId }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const maybeIssue = yield* tracker.fetchIssue(issueId)
    if (Option.isNone(maybeIssue)) {
      return FailedSaveIssue.make({
        reason: `Issue ${issueId} does not exist.`,
      })
    }
    const knownIds = Array.map(
      maybeIssue.value.successCriteria,
      criterion => criterion.id,
    )
    const unknownIds = Array.filter(
      criterionIds,
      criterionId => !Array.contains(knownIds, criterionId),
    )
    if (Array.isReadonlyArrayNonEmpty(unknownIds)) {
      return FailedSaveIssue.make({
        reason: `Issue ${maybeIssue.value.id} has no criterion ${Array.join(unknownIds, ', ')}. Its criteria: ${criteriaListing(maybeIssue.value)}.`,
      })
    }
    const isMarked = (issue: Issue) =>
      Array.every(issue.successCriteria, criterion =>
        Array.contains(criterionIds, criterion.id)
          ? criterion.isSatisfied === isSatisfied
          : true,
      )
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Issue.make({
          ...current,
          successCriteria: Array.map(current.successCriteria, criterion =>
            Array.contains(criterionIds, criterion.id)
              ? IssueSuccessCriterion.make({ ...criterion, isSatisfied })
              : criterion,
          ),
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        }),
      hasLanded: isMarked,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const subtaskListing = (issue: Issue): string =>
  Array.join(
    Array.map(
      issue.subtasks,
      (subtask, index) =>
        `${(index + 1).toString()} ${subtask.id} "${subtask.title}"`,
    ),
    ', ',
  )

const hasSubtaskTitled = (
  subtasks: ReadonlyArray<IssueSubtask>,
  title: string,
): boolean => Array.some(subtasks, subtask => subtask.title === title)

/**
 * Adds subtasks under the next free subtask ids, unchecked, and reads them
 * back. A title the checklist already holds is not added again.
 */
export const AddIssueSubtasks = Command.define(
  'AddIssueSubtasks',
  { issueId: S.String, titles: S.Array(S.String) },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, titles }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const holdsEveryTitle = (issue: Issue) =>
      Array.every(titles, title => hasSubtaskTitled(issue.subtasks, title))
    const issue = yield* tracker.update(issueId, {
      apply: current => {
        if (holdsEveryTitle(current)) {
          return current
        }
        const nextSubtasks = Array.reduce(
          titles,
          current.subtasks,
          (subtasks, title) =>
            hasSubtaskTitled(subtasks, title)
              ? subtasks
              : Array.append(
                  subtasks,
                  IssueSubtask.make({
                    id: nextChildId(
                      `issue-${current.id}-subtask-`,
                      Array.map(subtasks, subtask => subtask.id),
                    ),
                    state: UncheckedSubtask.make({}),
                    title,
                  }),
                ),
        )
        return Issue.make({
          ...current,
          subtasks: nextSubtasks,
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        })
      },
      hasLanded: holdsEveryTitle,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const markedSubtask = (
  subtask: IssueSubtask,
  mark: SubtaskMark,
  nowMs: number,
): IssueSubtask =>
  M.value(mark).pipe(
    M.withReturnType<IssueSubtask>(),
    M.when('Checked', () =>
      subtask.state._tag === 'Checked'
        ? subtask
        : IssueSubtask.make({
            ...subtask,
            state: CheckedSubtask.make({ checkedAtMs: nowMs }),
          }),
    ),
    M.when('Unchecked', () =>
      IssueSubtask.make({ ...subtask, state: UncheckedSubtask.make({}) }),
    ),
    M.exhaustive,
  )

/**
 * Checks subtasks off, or back to unchecked, and reads them back. A subtask
 * already checked keeps the time it was first checked.
 */
export const MarkIssueSubtasks = Command.define(
  'MarkIssueSubtasks',
  { issueId: S.String, mark: SubtaskMark, subtaskIds: S.Array(S.String) },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, mark, subtaskIds }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const maybeIssue = yield* tracker.fetchIssue(issueId)
    if (Option.isNone(maybeIssue)) {
      return FailedSaveIssue.make({
        reason: `Issue ${issueId} does not exist.`,
      })
    }
    const knownIds = Array.map(maybeIssue.value.subtasks, subtask => subtask.id)
    const unknownIds = Array.filter(
      subtaskIds,
      subtaskId => !Array.contains(knownIds, subtaskId),
    )
    if (Array.isReadonlyArrayNonEmpty(unknownIds)) {
      return FailedSaveIssue.make({
        reason: `Issue ${maybeIssue.value.id} has no subtask ${Array.join(unknownIds, ', ')}. Its subtasks: ${subtaskListing(maybeIssue.value)}.`,
      })
    }
    const isMarked = (issue: Issue) =>
      Array.every(
        issue.subtasks,
        subtask =>
          !Array.contains(subtaskIds, subtask.id) ||
          subtask.state._tag === mark,
      )
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Issue.make({
          ...current,
          subtasks: Array.map(current.subtasks, subtask =>
            Array.contains(subtaskIds, subtask.id)
              ? markedSubtask(subtask, mark, nowMs)
              : subtask,
          ),
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        }),
      hasLanded: isMarked,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const firstLandingState: IssueLandingState = 'Exploring'

/**
 * The work in progress after one change: the fields the change gives, and
 * the rest as they were. Work recorded for the first time starts Exploring
 * and active.
 */
export const editedWorkInProgress = (
  maybeCurrent: Option.Option<IssueWorkInProgress>,
  edit: WorkInProgressEdit,
  nowMs: number,
): IssueWorkInProgress => {
  const current = Option.getOrElse(maybeCurrent, () =>
    IssueWorkInProgress.make({
      activity: ActiveWork.make({}),
      agentId: Option.none(),
      branch: Option.none(),
      commitSha: Option.none(),
      landingState: firstLandingState,
      lastStep: Option.none(),
      repository: Option.none(),
      targetBuild: Option.none(),
      updatedAtMs: nowMs,
      worktree: Option.none(),
    }),
  )
  return IssueWorkInProgress.make({
    activity: Option.getOrElse(edit.activity, () => current.activity),
    agentId: Option.orElse(edit.agentId, () => current.agentId),
    branch: Option.orElse(edit.branch, () => current.branch),
    commitSha: Option.orElse(edit.commitSha, () => current.commitSha),
    landingState: Option.getOrElse(
      edit.landingState,
      () => current.landingState,
    ),
    lastStep: Option.orElse(edit.lastStep, () => current.lastStep),
    repository: Option.orElse(edit.repository, () => current.repository),
    targetBuild: Option.orElse(edit.targetBuild, () => current.targetBuild),
    updatedAtMs: nowMs,
    worktree: Option.orElse(edit.worktree, () => current.worktree),
  })
}

const isSameActivity = (
  left: IssueWorkActivity,
  right: IssueWorkActivity,
): boolean =>
  M.value(left).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      Active: () => right._tag === 'Active',
      Stuck: ({ reason }) => right._tag === 'Stuck' && right.reason === reason,
      Abandoned: ({ reason }) =>
        right._tag === 'Abandoned' && right.reason === reason,
    }),
  )

const textLanded = (
  wanted: Option.Option<string>,
  stored: Option.Option<string>,
): boolean =>
  Option.match(wanted, {
    onNone: () => true,
    onSome: value => Option.contains(stored, value),
  })

const holdsEdit = (
  work: IssueWorkInProgress,
  edit: WorkInProgressEdit,
): boolean =>
  optionLanded(edit.landingState, work.landingState) &&
  Option.match(edit.activity, {
    onNone: () => true,
    onSome: activity => isSameActivity(activity, work.activity),
  }) &&
  textLanded(edit.agentId, work.agentId) &&
  textLanded(edit.branch, work.branch) &&
  textLanded(edit.commitSha, work.commitSha) &&
  textLanded(edit.lastStep, work.lastStep) &&
  textLanded(edit.repository, work.repository) &&
  textLanded(edit.targetBuild, work.targetBuild) &&
  textLanded(edit.worktree, work.worktree)

/** Records one change to an Issue's work in progress and reads it back. */
export const RecordIssueWorkInProgress = Command.define(
  'RecordIssueWorkInProgress',
  { edit: WorkInProgressEdit, issueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ edit, issueId }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const issue = yield* tracker.update(issueId, {
      apply: current => {
        const namedEdit = WorkInProgressEdit.make({
          ...edit,
          agentId: Option.orElse(edit.agentId, () => current.claimantId),
        })
        return statusFollowingLanding(
          Issue.make({
            ...current,
            updatedAtMs: nextUpdatedAtMs(current, nowMs),
            workInProgress: Option.some(
              editedWorkInProgress(current.workInProgress, namedEdit, nowMs),
            ),
          }),
          nowMs,
          Option.getOrElse(namedEdit.agentId, () => workingSyncAgent),
        )
      },
      hasLanded: stored =>
        Option.exists(stored.workInProgress, work => holdsEdit(work, edit)),
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const encodeIssue = S.encodeSync(Issue)

const isSameIssue = (left: Issue, right: Issue): boolean =>
  JSON.stringify(encodeIssue(left)) === JSON.stringify(encodeIssue(right))

/**
 * Records what the Mac saw of its agents on one Issue (`observedIssue`) and
 * reads it back until observing the same survey again changes nothing.
 */
export const RecordAgentSurvey = Command.define(
  'RecordAgentSurvey',
  {
    issueId: S.String,
    survey: AgentSurvey,
    touchedFiles: S.Option(IssueTouchedFiles),
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, survey, touchedFiles }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const issue = yield* tracker.update(issueId, {
      apply: current => observedIssue(current, survey, touchedFiles),
      hasLanded: stored =>
        isSameIssue(observedIssue(stored, survey, touchedFiles), stored),
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Removes an Issue's work in progress and reads the Issue back without it. */
export const ClearIssueWorkInProgress = Command.define(
  'ClearIssueWorkInProgress',
  { issueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const isCleared = (issue: Issue) => Option.isNone(issue.workInProgress)
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        isCleared(current)
          ? current
          : Issue.make({
              ...current,
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
              workInProgress: Option.none(),
            }),
      hasLanded: isCleared,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/**
 * Places an Issue within its priority at `rank`, a time on the `createdAtMs`
 * axis, or returns it to age order when the rank is None.
 */
export const RankIssue = Command.define(
  'RankIssue',
  { issueId: S.String, rank: S.Option(S.Number) },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, rank }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const isRanked = (issue: Issue) =>
      Option.makeEquivalence(Equivalence.Number)(issue.backlogRank, rank)
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        isRanked(current)
          ? current
          : Issue.make({
              ...current,
              backlogRank: rank,
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
            }),
      hasLanded: isRanked,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Adds one Mention under the next free mention id. */
export const AddIssueMention = Command.define(
  'AddIssueMention',
  { issueId: S.String, mention: DraftMention },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, mention }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const isSameMention = (stored: IssueMention) =>
      Option.getOrUndefined(stored.directQuote) ===
        Option.getOrUndefined(mention.directQuote) &&
      JSON.stringify(stored.source) === JSON.stringify(mention.source)
    const hasMention = (issue: Issue) =>
      Array.some(issue.mentions, isSameMention)
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        hasMention(current)
          ? current
          : Issue.make({
              ...current,
              mentions: Array.append(
                current.mentions,
                IssueMention.make({
                  ...mention,
                  id: nextChildId(
                    `mention-${current.id}-`,
                    Array.map(current.mentions, stored => stored.id),
                  ),
                  issueId: current.id,
                }),
              ),
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
            }),
      hasLanded: hasMention,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const STATUS_ENTRY_STATE = 'status'

/**
 * The Issue at a new status, with the work-log entry that keeps the move:
 * `Status Open → Blocked.` A status that stays the same writes nothing.
 */
const withStatusMove = (
  current: Issue,
  status: IssueStatus,
  author: string,
  nowMs: number,
): Issue =>
  current.status === status
    ? current
    : Issue.make({
        ...current,
        status,
        updatedAtMs: nextUpdatedAtMs(current, nowMs),
        workLog: appendWorkLogEntry(
          current,
          IssueWorkLogEntry.make({
            agentId: Option.some(author),
            commitSha: Option.none(),
            durationSeconds: Option.none(),
            id: workLogEntryId(
              current.id,
              Option.some(STATUS_ENTRY_STATE),
              nowMs,
            ),
            occurredAtMs: nowMs,
            state: Option.some(STATUS_ENTRY_STATE),
            summary: `Status ${current.status} → ${status}.`,
          }),
        ),
      })

/**
 * Sets any stored IssueStatus and reads it back. The move stays in the work
 * log, so the inbox and the Issue's history can name it.
 */
export const SetIssueStatus = Command.define(
  'SetIssueStatus',
  { issueId: S.String, status: IssueStatus },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, status }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const author = yield* identity.author
    const issue = yield* tracker.update(issueId, {
      apply: current => withStatusMove(current, status, author, nowMs),
      hasLanded: stored => stored.status === status,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const CLAIMED_STATUS: IssueStatus = 'InProgress'

const claimedSummary = (claimantId: string, author: string): string =>
  claimantId === author
    ? `Claimed by ${author}.`
    : `Claimed for ${claimantId} by ${author}.`

/**
 * Writes one claim: the claimant, InProgress with its status line when the
 * status moves, and a `claimed` line in the name of whoever claimed it. A claim
 * the claimant already holds writes nothing.
 */
const claimIssue = (issueId: string, claimantId: string) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const author = yield* identity.author
    const claim = IssueWorkLogEntry.make({
      agentId: Option.some(author),
      commitSha: Option.none(),
      durationSeconds: Option.none(),
      id: workLogEntryId(storedIssueIdOf(issueId), Option.some('claimed'), nowMs),
      occurredAtMs: nowMs,
      state: Option.some('claimed'),
      summary: claimedSummary(claimantId, author),
    })
    const issue = yield* tracker.update(issueId, {
      apply: current => {
        if (Option.contains(current.claimantId, claimantId)) {
          return current
        } else {
          const moved = withStatusMove(current, CLAIMED_STATUS, author, nowMs)
          return Issue.make({
            ...moved,
            claimantId: Option.some(claimantId),
            updatedAtMs: nextUpdatedAtMs(current, nowMs),
            workLog: appendWorkLogEntry(moved, claim),
          })
        }
      },
      hasLanded: stored => Option.contains(stored.claimantId, claimantId),
    })
    return SucceededSaveIssue.make({ issue })
  })

/**
 * The person signed in claims one Issue, as `issues claim` does: a `claimed`
 * work-log entry, the claimant, and InProgress, read back.
 */
export const ClaimIssueAsAuthor = Command.define(
  'ClaimIssueAsAuthor',
  { issueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const author = yield* identity.author
    return yield* claimIssue(issueId, author)
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/**
 * Claims one Issue for `claimantId`, an agent such as `claude-code/one@ld`, in
 * the name of the person signed in, as a drop on that agent's column on the
 * board does: `Claimed for claude-code/one@ld by owner@example.com.`
 */
export const ClaimIssueFor = Command.define(
  'ClaimIssueFor',
  { claimantId: S.String, issueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ claimantId, issueId }) =>
  Effect.gen(function* () {
    return yield* claimIssue(issueId, claimantId)
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Keeps a new view of the list. */
export const CreateIssueView = Command.define(
  'CreateIssueView',
  { name: S.String, position: S.Number, query: S.String },
  SucceededSaveIssueView,
  FailedSaveIssueView,
)(({ name, position, query }) =>
  Effect.gen(function* () {
    const views = yield* IssueViews
    const view = yield* views.createView({ name, position, query })
    return SucceededSaveIssueView.make({ view })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedSaveIssueView.make({
          name,
          reason: describeIssueViewError(error),
        }),
      ),
    ),
  ),
)

/** Writes a saved view's new name, place or what it shows. */
export const UpdateIssueView = Command.define(
  'UpdateIssueView',
  { view: SavedView },
  SucceededSaveIssueView,
  FailedSaveIssueView,
)(({ view }) =>
  Effect.gen(function* () {
    const views = yield* IssueViews
    const updated = yield* views.updateView(view)
    return SucceededSaveIssueView.make({ view: updated })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedSaveIssueView.make({
          name: view.name,
          reason: describeIssueViewError(error),
        }),
      ),
    ),
  ),
)

/** Deletes a saved view. */
export const DeleteIssueView = Command.define(
  'DeleteIssueView',
  { viewId: S.String },
  SucceededDeleteIssueView,
  FailedDeleteIssueView,
)(({ viewId }) =>
  Effect.gen(function* () {
    const views = yield* IssueViews
    yield* views.deleteView(viewId)
    return SucceededDeleteIssueView.make({ viewId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedDeleteIssueView.make({
          reason: describeIssueViewError(error),
          viewId,
        }),
      ),
    ),
  ),
)

/** Lets go of one Issue's claim and reads it back, with a work-log entry. */
export const ReleaseIssueClaim = Command.define(
  'ReleaseIssueClaim',
  { issueId: S.String },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const author = yield* identity.author
    const entryId = workLogEntryId(
      storedIssueIdOf(issueId),
      Option.some('released'),
      nowMs,
    )
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Option.match(current.claimantId, {
          onNone: () => current,
          onSome: claimantId =>
            Issue.make({
              ...current,
              claimantId: Option.none(),
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
              workLog: appendWorkLogEntry(
                current,
                IssueWorkLogEntry.make({
                  agentId: Option.some(author),
                  commitSha: Option.none(),
                  durationSeconds: Option.none(),
                  id: entryId,
                  occurredAtMs: nowMs,
                  state: Option.some('released'),
                  summary: `Claim of ${claimantId} released by ${author}.`,
                }),
              ),
            }),
        }),
      hasLanded: stored => Option.isNone(stored.claimantId),
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Deletes one Issue and returns what it held. */
export const DeleteIssue = Command.define(
  'DeleteIssue',
  { issueId: S.String },
  SucceededDeleteIssue,
  FailedDeleteIssue,
)(({ issueId }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const issue = yield* tracker.delete(issueId)
    return SucceededDeleteIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedDeleteIssue.make({ issueId, reason: failureReason(error) }),
      ),
    ),
  ),
)

/** Adds one related Issue number to relatedIssueIds and reads it back. */
export const LinkCatalogIssue = Command.define(
  'LinkCatalogIssue',
  { sourceIssueId: S.String, targetIssueId: S.String },
  SucceededLinkCatalogIssue,
  FailedSaveIssue,
)(({ sourceIssueId, targetIssueId }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const target = storedIssueIdOf(targetIssueId)
    const issue = yield* tracker.update(sourceIssueId, {
      apply: current =>
        hasCatalogIssueLink(current, target)
          ? current
          : Issue.make({
              ...current,
              relatedIssueIds: Array.append(current.relatedIssueIds, target),
              updatedAtMs: nextUpdatedAtMs(current, nowMs),
            }),
      hasLanded: stored => hasCatalogIssueLink(stored, target),
    })
    return SucceededLinkCatalogIssue.make({ issue, targetIssueId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Stores leftover status without shrinking the wide IssueStatus union. */
export const SetLeftoverStatus = Command.define(
  'SetLeftoverStatus',
  {
    issueId: S.String,
    leftover: LeftoverStatus,
  },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, leftover }) =>
  Effect.gen(function* () {
    if (leftover === 'Closed' && !leftoverMayClose(issueId)) {
      return FailedSaveIssue.make({
        reason: `Issue ${issueId} cannot be Closed.`,
      })
    }
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { nowMs } = yield* identity.next
    const author = yield* identity.author
    const status = storedStatusOf(leftover)
    const issue = yield* tracker.update(issueId, {
      apply: current => withStatusMove(current, status, author, nowMs),
      hasLanded: stored => stored.status === status,
    })
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Moves one leftover onto another live catalog product without closing it. */
export const RetargetIssueProduct = Command.define(
  'RetargetIssueProduct',
  { issue: Issue, product: TrackedProduct },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issue, product }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { nowMs } = yield* identity.next
    const stored = yield* tracker.update(issue.id, {
      apply: current =>
        Issue.make({
          ...current,
          product,
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        }),
      hasLanded: read => read.product.id === product.id,
    })
    return SucceededSaveIssue.make({ issue: stored })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
    ),
  ),
)

const isSameProduct = (left: TrackedProduct, right: TrackedProduct): boolean =>
  left._tag === right._tag && left.id === right.id && left.name === right.name

/**
 * Saves one new product to the catalog, then reads the catalog back: the
 * product counts as saved only once a fetch returns it with its name and
 * kind.
 */
export const SaveProduct = Command.define(
  'SaveProduct',
  { product: TrackedProduct },
  SucceededSaveProduct,
  FailedSaveProduct,
)(({ product }) =>
  Effect.gen(function* () {
    const catalog = yield* ProductCatalog
    const nowMs = yield* Clock.currentTimeMillis
    const entry = ProductCatalogEntry.make({ product, updatedAtMs: nowMs })
    yield* catalog.save(entry)
    const stored = yield* catalog.fetch
    if (Array.some(stored, read => isSameProduct(read.product, product))) {
      return SucceededSaveProduct.make({ entry })
    } else {
      return FailedSaveProduct.make({
        reason: `Product ${product.id} was saved but does not read back.`,
      })
    }
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveProduct.make({ reason: failureReason(error) })),
    ),
  ),
)

/** Publishes this viewer into one leftover Instant room. */
export const JoinLeftoverRoom = Command.define(
  'JoinLeftoverRoom',
  {
    agentId: S.String,
    leftoverId: S.String,
    origin: S.String,
    role: S.String,
  },
  CompletedJoinLeftoverRoom,
  FailedJoinLeftoverRoom,
)(({ agentId, leftoverId, origin, role }) =>
  Effect.gen(function* () {
    const presence = yield* LeftoverPresence
    yield* presence.joinLeftoverRoom(
      LeftoverPresenceJoin.make({
        agentId,
        leftoverId,
        origin,
        role,
      }),
    )
    return CompletedJoinLeftoverRoom.make({ leftoverId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedJoinLeftoverRoom.make({
          leftoverId,
          reason: failureReason(error),
        }),
      ),
    ),
  ),
)

/** Leaves one leftover Instant room. */
export const LeaveLeftoverRoom = Command.define(
  'LeaveLeftoverRoom',
  { leftoverId: S.String },
  CompletedLeaveLeftoverRoom,
  FailedLeaveLeftoverRoom,
)(({ leftoverId }) =>
  Effect.gen(function* () {
    const presence = yield* LeftoverPresence
    yield* presence.leaveLeftoverRoom(leftoverId)
    return CompletedLeaveLeftoverRoom.make({ leftoverId })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedLeaveLeftoverRoom.make({
          leftoverId,
          reason: failureReason(error),
        }),
      ),
    ),
  ),
)

type Resources =
  | GraphRows
  | IssueTracker
  | Logger
  | ProductCatalog
  | TriageInboxServiceTag
  | IssueIdentity
  | LeftoverPresence
  | IssueViews
type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, Resources>>,
]

const leftoverViewerJoin = (leftoverId: string) => ({
  agentId: LEFTOVER_VIEWER_AGENT_ID,
  leftoverId,
  origin: LEFTOVER_VIEWER_ORIGIN,
  role: LEFTOVER_VIEWER_ROLE,
})

const noLeftoverRoomCommands: ReadonlyArray<
  Command.Command<Message, never, Resources>
> = []

const leftoverRoomCommands = (
  previousLeftoverId: Option.Option<string>,
  nextLeftoverId: Option.Option<string>,
): ReadonlyArray<Command.Command<Message, never, Resources>> => {
  const leave = Option.match(previousLeftoverId, {
    onNone: () => noLeftoverRoomCommands,
    onSome: leftoverId => {
      if (
        Option.isSome(nextLeftoverId) &&
        leftoverId === nextLeftoverId.value
      ) {
        return noLeftoverRoomCommands
      }
      return [LeaveLeftoverRoom({ leftoverId })]
    },
  })
  const join = Option.match(nextLeftoverId, {
    onNone: () => noLeftoverRoomCommands,
    onSome: leftoverId => [JoinLeftoverRoom(leftoverViewerJoin(leftoverId))],
  })
  return Array.appendAll(leave, join)
}

const LEFT_PAGES_KEPT = 24

const isOfEntity =
  (entity: PageEntity) =>
  (left: typeof LoadedPageFacts.Type): boolean =>
    pageEntityKey(left.entity) === pageEntityKey(entity)

/**
 * What the rows last said about the pages a person left, the newest first, so
 * Back paints a page at its full height at once and lands on the rows it left.
 * Recording 208's rows answer half a second after it opens, 100 Issues above
 * the place Back restores. The next answer replaces what was kept.
 */
const leftPageFactsOf = (
  model: Model,
): ReadonlyArray<typeof LoadedPageFacts.Type> =>
  model.pageFacts._tag === 'LoadedPageFacts'
    ? Array.take(
        [
          model.pageFacts,
          ...Array.filter(
            model.leftPageFacts,
            Predicate.not(isOfEntity(model.pageFacts.entity)),
          ),
        ],
        LEFT_PAGES_KEPT,
      )
    : model.leftPageFacts

const pageFactsOnOpening = (
  navigation: Navigation,
  leftPageFacts: ReadonlyArray<typeof LoadedPageFacts.Type>,
): PageFactsObservation =>
  navigation._tag === 'EntityPage'
    ? Option.getOrElse<PageFactsObservation, PageFactsObservation>(
        Array.findFirst(leftPageFacts, isOfEntity(navigation.entity)),
        () => NotObservingPageFacts.make({}),
      )
    : NotObservingPageFacts.make({})

const withNavigation = (model: Model, navigation: Navigation): UpdateReturn => {
  const isSameIssueDetail =
    model.navigation._tag === 'IssueDetail' &&
    navigation._tag === 'IssueDetail' &&
    model.navigation.issueId === navigation.issueId
  const isSameEntityPage =
    model.navigation._tag === 'EntityPage' &&
    navigation._tag === 'EntityPage' &&
    pageEntityKey(model.navigation.entity) === pageEntityKey(navigation.entity)
  const previousLeftoverId =
    model.navigation._tag === 'IssueDetail'
      ? Option.some(model.navigation.issueId)
      : Option.none()
  const nextLeftoverId =
    navigation._tag === 'IssueDetail'
      ? Option.some(navigation.issueId)
      : Option.none()
  const leftPageFacts = isSameEntityPage
    ? model.leftPageFacts
    : leftPageFactsOf(model)
  return [
    nextModel({
      ...model,
      leftPageFacts,
      leftoverComment: isSameIssueDetail ? model.leftoverComment : '',
      leftoverLink: isSameIssueDetail ? model.leftoverLink : '',
      leftoverPresence: Option.match(nextLeftoverId, {
        onNone: () => NotObservingLeftoverPresence.make({}),
        onSome: leftoverId => LoadingLeftoverPresence.make({ leftoverId }),
      }),
      issueMutation: IdleIssueMutation.make({}),
      issueDetail:
        navigation._tag === 'IssueDetail'
          ? LoadingIssue.make({ issueId: navigation.issueId })
          : NotObservingIssue.make({}),
      issueFiles: isSameIssueDetail
        ? model.issueFiles
        : NotObservingIssueFiles.make({}),
      issueGraph: isSameIssueDetail
        ? model.issueGraph
        : NotObservingIssueGraph.make({}),
      issueLanding: isSameIssueDetail
        ? model.issueLanding
        : NotObservingIssueLanding.make({}),
      pageFacts: isSameEntityPage
        ? model.pageFacts
        : pageFactsOnOpening(navigation, leftPageFacts),
      draft:
        Option.isSome(model.maybeDraftFindingId) &&
        navigation._tag !== 'FileIssue'
          ? emptyIssueDraft(model.draft.productId)
          : model.draft,
      featuresList:
        navigation._tag === 'Features'
          ? model.featuresList
          : NotObservingFeatures.make({}),
      findingsList:
        navigation._tag === 'Findings'
          ? model.findingsList
          : NotObservingFindings.make({}),
      maybeDraftFindingId:
        navigation._tag === 'FileIssue'
          ? model.maybeDraftFindingId
          : Option.none(),
      issueLogs:
        navigation._tag === 'IssueDetail'
          ? LoadingIssueLogs.make({ issueId: navigation.issueId })
          : NotObservingIssueLogs.make({}),
      isGoKeyPending: false,
      isSearchFocused: false,
      layer: NoLayer.make({}),
      navigation,
      returnListView:
        model.navigation._tag === 'IssueList'
          ? model.navigation.view
          : model.returnListView,
    }),
    leftoverRoomCommands(previousLeftoverId, nextLeftoverId),
  ]
}

const findingsOnPage = (model: Model): ReadonlyArray<AgentFinding> => {
  const listed =
    model.findingsList._tag === 'LoadedFindings'
      ? model.findingsList.findings
      : []
  const facts =
    model.pageFacts._tag === 'LoadedPageFacts' ? [model.pageFacts.facts] : []
  const onIssue =
    model.issueGraph._tag === 'LoadedIssueGraph'
      ? model.issueGraph.graph.findings
      : []
  return [
    ...listed,
    ...onIssue,
    ...Array.flatMap(facts, found =>
      M.value(found).pipe(
        M.withReturnType<ReadonlyArray<AgentFinding>>(),
        M.tag('FindingFacts', ({ finding }) => [finding]),
        M.tag('AgentFacts', ({ runs }) =>
          Array.flatMap(runs, page => page.findings),
        ),
        M.orElse(() => []),
      ),
    ),
  ]
}

const issuesByIdIn = (model: Model): ReadonlyMap<string, Issue> =>
  new Map(Array.map(loadedIssuesIn(model), issue => [issue.id, issue]))

const isPageOf = (model: Model, entity: PageEntity): boolean =>
  model.navigation._tag === 'EntityPage' &&
  pageEntityKey(model.navigation.entity) === pageEntityKey(entity)

const catalogProducts = (
  model: Model,
): ReadonlyArray<typeof ProductCatalogEntry.Type> =>
  model.products._tag === 'LoadedProducts' ? model.products.products : []

/**
 * Reads a product as written: its id, such as `scribe`, or its name, such as
 * `Scribe`, in any case. An id match wins over a name match.
 */
export const productForReference = (
  products: ReadonlyArray<typeof ProductCatalogEntry.Type>,
  reference: string,
): Option.Option<typeof TrackedProduct.Type> => {
  const wanted = reference.trim().toLowerCase()
  return Option.map(
    Option.orElse(
      Array.findFirst(
        products,
        entry => entry.product.id.toLowerCase() === wanted,
      ),
      () =>
        Array.findFirst(
          products,
          entry => entry.product.name.toLowerCase() === wanted,
        ),
    ),
    entry => entry.product,
  )
}

/** Lists the products a draft may name: `scribe (Scribe), foldkit (Foldkit)`. */
export const productChoices = (
  products: ReadonlyArray<typeof ProductCatalogEntry.Type>,
): string =>
  Array.join(
    Array.map(products, entry => `${entry.product.id} (${entry.product.name})`),
    ', ',
  )

const unknownProductReason = (model: Model): string => {
  const products = catalogProducts(model)
  const reference = model.draft.productId.trim()
  if (Array.isReadonlyArrayEmpty(products)) {
    return 'Choose an Application or Library.'
  }
  if (reference === '') {
    return `Choose an Application or Library. Valid: ${productChoices(products)}.`
  }
  return `Choose an Application or Library: "${reference}" names none. Valid: ${productChoices(products)}.`
}

const saveDraft = (model: Model): UpdateReturn => {
  if (
    model.navigation._tag !== 'FileIssue' ||
    model.draftState._tag === 'SavingIssueDraft'
  ) {
    return [model, []]
  }
  if (model.draft.title.trim() === '') {
    return [
      nextModel({
        ...model,
        draftState: FailedIssueDraft.make({ reason: 'A title is required.' }),
      }),
      [],
    ]
  }
  const maybeProduct = productForReference(
    catalogProducts(model),
    model.draft.productId,
  )
  if (Option.isNone(maybeProduct)) {
    return [
      nextModel({
        ...model,
        draftState: FailedIssueDraft.make({
          reason: unknownProductReason(model),
        }),
      }),
      [],
    ]
  }
  return [
    nextModel({ ...model, draftState: SavingIssueDraft.make({}) }),
    [
      FileIssueDraft({
        draft: model.draft,
        maybeFindingId: model.maybeDraftFindingId,
        product: maybeProduct.value,
      }),
    ],
  ]
}

const updateDraft = (
  model: Model,
  transform: (draft: IssueDraft) => IssueDraft,
): UpdateReturn => [
  nextModel({
    ...model,
    draft: transform(model.draft),
    draftState: EditingIssueDraft.make({}),
  }),
  [],
]

const casinoProduct = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'casino', name: 'Casino' }),
  updatedAtMs: 1_753_800_000_000,
})

type ProductTally = Readonly<{
  count: number
  entry: typeof ProductCatalogEntry.Type
}>

const productShapeKey = (product: typeof TrackedProduct.Type): string =>
  `${product.id}\u0000${product._tag}\u0000${product.name}`

/**
 * One catalog entry per product id, shaped the way most of its Issues name
 * it: 26 Issues under the Foldkit Library outweigh one under an Application
 * called FoldKit. A tie keeps the shape seen first.
 */
const productsFromIssues = (
  issues: ReadonlyArray<typeof Issue.Type>,
): ReadonlyArray<typeof ProductCatalogEntry.Type> => {
  const tallies = new Map<string, ProductTally>()
  for (const issue of issues) {
    const key = productShapeKey(issue.product)
    const current = tallies.get(key)
    tallies.set(key, {
      count: (current?.count ?? 0) + 1,
      entry:
        current?.entry ??
        ProductCatalogEntry.make({
          product: issue.product,
          updatedAtMs: issue.updatedAtMs,
        }),
    })
  }
  const byProductId = new Map<string, ProductTally>()
  for (const tally of tallies.values()) {
    const current = byProductId.get(tally.entry.product.id)
    if (current === undefined || tally.count > current.count) {
      byProductId.set(tally.entry.product.id, tally)
    }
  }
  return Array.map([...byProductId.values()], tally => tally.entry)
}

const mergeCatalog = (
  left: ReadonlyArray<typeof ProductCatalogEntry.Type>,
  right: ReadonlyArray<typeof ProductCatalogEntry.Type>,
): ReadonlyArray<typeof ProductCatalogEntry.Type> => {
  const seen = new Map<string, typeof ProductCatalogEntry.Type>()
  for (const entry of [...left, ...right, casinoProduct]) {
    if (!seen.has(entry.product.id)) {
      seen.set(entry.product.id, entry)
    }
  }
  return [...seen.values()]
}

const PRODUCT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const withProductAddition = (
  model: Model,
  productAddition: ProductAdditionState,
): UpdateReturn => [nextModel({ ...model, productAddition }), []]

const refuseProduct = (model: Model, reason: string): UpdateReturn =>
  withProductAddition(model, RefusedProductAddition.make({ reason }))

const isSameName = (left: TrackedProduct, right: TrackedProduct): boolean =>
  left.name.trim().toLowerCase() === right.name.trim().toLowerCase()

const addToCatalog = (
  model: Model,
  products: ReadonlyArray<typeof ProductCatalogEntry.Type>,
  product: TrackedProduct,
): UpdateReturn =>
  Option.match(
    Array.findFirst(products, entry => entry.product.id === product.id),
    {
      onSome: ({ product: holder }) =>
        isSameProduct(holder, product)
          ? withProductAddition(
              model,
              UnchangedProductAddition.make({ product }),
            )
          : refuseProduct(
              model,
              `Product ${holder.id} is already ${holder.name} (${holder._tag}); nothing changed.`,
            ),
      onNone: () =>
        Option.match(
          Array.findFirst(products, entry =>
            isSameName(entry.product, product),
          ),
          {
            onSome: ({ product: holder }) =>
              refuseProduct(
                model,
                `Product ${holder.id} is already named ${holder.name}; nothing was added.`,
              ),
            onNone: () => [
              nextModel({
                ...model,
                productAddition: SavingProductAddition.make({ product }),
              }),
              [SaveProduct({ product })],
            ],
          },
        ),
    },
  )

const addProduct = (model: Model, product: TrackedProduct): UpdateReturn => {
  if (!PRODUCT_ID_PATTERN.test(product.id)) {
    return refuseProduct(
      model,
      `"${product.id}" is not a product id: use lowercase letters and digits joined by hyphens, such as acaga or instant-data-swift.`,
    )
  }
  if (product.name.trim() === '') {
    return refuseProduct(model, 'A product needs a name, such as ACAGA.')
  }
  return M.value(model.products).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      LoadingProducts: () =>
        withProductAddition(
          model,
          FailedProductAddition.make({
            reason: 'The product catalog has not loaded; nothing was added.',
          }),
        ),
      FailedProducts: ({ reason }) =>
        withProductAddition(
          model,
          FailedProductAddition.make({
            reason: `The product catalog did not load (${reason}); nothing was added.`,
          }),
        ),
      LoadedProducts: ({ products }) => addToCatalog(model, products, product),
    }),
  )
}

const reviewTriageCandidate = (
  model: Model,
  candidateId: string,
  decision: 'Dismiss' | 'Promote',
): UpdateReturn => {
  if (model.triageCandidates._tag !== 'LoadedTriageCandidates') {
    return [model, []]
  }
  const maybeCandidate = Array.findFirst(
    model.triageCandidates.candidates,
    candidate => candidate.id === candidateId && candidate.status === 'Draft',
  )
  if (Option.isNone(maybeCandidate)) return [model, []]
  return [
    model,
    [ReviewTriageCandidate({ candidate: maybeCandidate.value, decision })],
  ]
}

const patchIssues = (
  state: typeof LoadedIssues.Type | Model['issues'],
  issue: typeof Issue.Type,
): Model['issues'] => {
  if (state._tag !== 'LoadedIssues') {
    return state
  }
  const exists = Array.some(state.issues, current => current.id === issue.id)
  return loadedIssuesOf(
    exists
      ? Array.map(state.issues, current =>
          current.id === issue.id ? issue : current,
        )
      : Array.append(state.issues, issue),
  )
}

const removeIssue = (
  state: Model['issues'],
  issueId: string,
): Model['issues'] => {
  if (state._tag !== 'LoadedIssues') {
    return state
  }
  return loadedIssuesOf(
    Array.filter(state.issues, current => current.id !== issueId),
  )
}

const loadedDetailIssue = (
  model: Model,
  issueId: string,
): Option.Option<typeof Issue.Type> => {
  if (
    model.navigation._tag !== 'IssueDetail' ||
    model.navigation.issueId !== issueId ||
    model.issueDetail._tag !== 'LoadedIssue'
  ) {
    return Option.none()
  }
  return model.issueDetail.issue
}

const issueSearchOpens = (model: Model): Option.Option<string> => {
  if (model.navigation._tag !== 'IssueList') {
    return Option.none()
  }
  const { query } = model.navigation.view
  const maybeDigits = issueNumberOfSearch(query)
  const issues = loadedIssuesIn(model)
  const maybeNumbered = Option.flatMap(maybeDigits, digits =>
    Array.findFirst(issues, issue => isIssueNumbered(issue, digits)),
  )
  const maybeUnderCursor = issueUnderCursorOf(model)
  if (Option.isSome(maybeNumbered)) {
    return Option.some(maybeNumbered.value.id)
  } else if (model.issues._tag !== 'LoadedIssues') {
    return Option.flatMap(maybeDigits, () => normalizeIssueId(query))
  } else if (Option.isSome(maybeUnderCursor)) {
    return Option.some(maybeUnderCursor.value.id)
  } else {
    return Option.map(
      Array.head(listedIssues(model, issues)),
      issue => issue.id,
    )
  }
}

const movedMenuMark = (
  model: Model,
  direction: 'Next' | 'Previous',
): UpdateReturn => {
  if (model.layer._tag !== 'ChoiceLayer') {
    return [model, []]
  }
  const lastPosition = Math.max(openMenuRowsOf(model).length - 1, 0)
  const position =
    direction === 'Next'
      ? Math.min(model.layer.position + 1, lastPosition)
      : Math.max(model.layer.position - 1, 0)
  return [
    nextModel({
      ...model,
      layer: ChoiceLayer.make({ ...model.layer, position }),
    }),
    [],
  ]
}

const layerBelow = (model: Model): ScreenLayer =>
  model.layer._tag === 'ChoiceLayer' &&
  Option.isSome(model.layer.maybePeekedIssueId)
    ? PeekLayer.make({ issueId: model.layer.maybePeekedIssueId.value })
    : NoLayer.make({})

/**
 * Whether a layer that holds the keyboard is open: choices, or naming a view.
 * While one is, a press on a row's field is a stray one, such as Enter on the
 * chip that had the keyboard before the layer opened, and changes nothing.
 */
const isDialogOpen = (model: Model): boolean =>
  model.layer._tag === 'ChoiceLayer' || model.layer._tag === 'NamingViewLayer'

const openedRowField = (
  model: Model,
  issueId: string,
  menu: ChoiceMenu,
): UpdateReturn => [
  nextModel({
    ...model,
    isGoKeyPending: false,
    isSearchFocused: false,
    layer: ChoiceLayer.make({
      maybeRowIssueId: selectedSetOf(model).has(issueId)
        ? Option.none()
        : Option.some(issueId),
      menu,
      position: 0,
      query: '',
    }),
    maybeRowCursor: Option.some(issueId),
    maybeSelectionRun: Option.none(),
  }),
  [],
]

const pickedMenuRow = (
  model: Model,
  maybeRow: Option.Option<MenuRow>,
): UpdateReturn =>
  Option.match(maybeRow, {
    onNone: () => [model, []],
    onSome: ({ action: { message } }) => {
      if (
        model.layer._tag === 'ChoiceLayer' &&
        menuStaysOpen(model.layer.menu)
      ) {
        return update(model, message)
      } else {
        const closed = nextModel({ ...model, layer: layerBelow(model) })
        return message._tag === 'AppliedRowChange'
          ? appliedRowChange(closed, issuesInHandOf(model), message.change)
          : update(closed, message)
      }
    },
  })

const withListView = (
  model: Model,
  change: (view: IssueView) => IssueView,
): UpdateReturn =>
  model.navigation._tag === 'IssueList'
    ? [
        nextModel({
          ...model,
          navigation: IssueList.make({ view: change(model.navigation.view) }),
        }),
        [],
      ]
    : [model, []]

const toggled = <Value>(
  values: ReadonlyArray<Value>,
  value: Value,
): ReadonlyArray<Value> =>
  Array.contains(values, value)
    ? Array.filter(values, current => current !== value)
    : Array.append(values, value)

const withProductFilter = (
  model: Model,
  product: ProductFilter,
): UpdateReturn =>
  model.navigation._tag === 'Backlog'
    ? [nextModel({ ...model, navigation: Backlog.make({ product }) }), []]
    : withListView(model, view => ({ ...view, product }))

const backToList = (model: Model): UpdateReturn =>
  withNavigation(
    model,
    IssueList.make({
      view:
        model.navigation._tag === 'Backlog'
          ? { ...model.returnListView, product: model.navigation.product }
          : model.returnListView,
    }),
  )

const savedAsRowEdit = (
  saved: typeof SucceededSaveIssue.Type | typeof FailedSaveIssue.Type,
): Message =>
  M.value(saved).pipe(
    M.withReturnType<Message>(),
    M.tagsExhaustive({
      SucceededSaveIssue: ({ issue }) => SucceededRowEdit.make({ issue }),
      FailedSaveIssue: ({ reason }) => FailedRowEditWrite.make({ reason }),
    }),
  )


const rowEditCommand = ({
  change,
  issueId,
}: RowEdit): Command.Command<Message, never, Resources> =>
  M.value(change).pipe(
    M.withReturnType<Command.Command<Message, never, Resources>>(),
    M.tagsExhaustive({
      ChangedStatus: ({ status }) =>
        Command.mapMessage(SetIssueStatus({ issueId, status }), savedAsRowEdit),
      ChangedPriority: ({ priority }) =>
        Command.mapMessage(
          EditIssue({
            area: Option.none(),
            details: Option.none(),
            issueId,
            issueType: Option.none(),
            priority: Option.some(priority),
            product: Option.none(),
            title: Option.none(),
          }),
          savedAsRowEdit,
        ),
      ChangedProduct: ({ product }) =>
        Command.mapMessage(
          EditIssue({
            area: Option.none(),
            details: Option.none(),
            issueId,
            issueType: Option.none(),
            priority: Option.none(),
            product: Option.some(product),
            title: Option.none(),
          }),
          savedAsRowEdit,
        ),
      ClaimedByAuthor: () =>
        Command.mapMessage(ClaimIssueAsAuthor({ issueId }), savedAsRowEdit),
      ClaimedFor: ({ claimantId }) =>
        Command.mapMessage(
          ClaimIssueFor({ claimantId, issueId }),
          savedAsRowEdit,
        ),
      ReleasedClaim: () =>
        Command.mapMessage(ReleaseIssueClaim({ issueId }), savedAsRowEdit),
    }),
  )

const cursorKeptOn = (before: Model, after: Model): Option.Option<string> => {
  const rowsAfter = rowsInOrderOf(after)
  const isStillListed = (issueId: string): boolean =>
    Array.some(rowsAfter, issue => issue.id === issueId)
  if (Option.exists(before.maybeRowCursor, isStillListed)) {
    return before.maybeRowCursor
  } else {
    const rowsBefore = rowsInOrderOf(before)
    const maybePosition = Option.flatMap(before.maybeRowCursor, issueId =>
      Array.findFirstIndex(rowsBefore, issue => issue.id === issueId),
    )
    return Option.flatMap(maybePosition, position =>
      Option.orElse(
        Option.map(
          Array.findFirst(Array.drop(rowsBefore, position), issue =>
            isStillListed(issue.id),
          ),
          issue => issue.id,
        ),
        () => Option.map(Array.last(rowsAfter), issue => issue.id),
      ),
    )
  }
}

const savedViewById = (
  model: Model,
  viewId: string,
): Option.Option<SavedView> =>
  Array.findFirst(savedViewsOf(model), view => view.id === viewId)

const positionAfterLast = (views: ReadonlyArray<SavedView>): number =>
  Option.match(Array.last(views), {
    onNone: () => 1,
    onSome: last => last.position + 1,
  })

const positionMovedTo = (
  views: ReadonlyArray<SavedView>,
  viewId: string,
  direction: RowDirection,
): Option.Option<number> => {
  const others = Array.filter(views, view => view.id !== viewId)
  return Option.flatMap(
    Array.findFirstIndex(views, view => view.id === viewId),
    from => {
      const gap = direction === 'Next' ? from + 1 : from - 1
      const before = Array.get(others, gap - 1)
      const after = Array.get(others, gap)
      if (gap < 0 || gap >= views.length) {
        return Option.none()
      } else if (Option.isSome(before) && Option.isSome(after)) {
        return Option.some((before.value.position + after.value.position) / 2)
      } else {
        return Option.map(
          Option.orElse(before, () => after),
          neighbor =>
            Option.isSome(before)
              ? neighbor.position + 1
              : neighbor.position / 2,
        )
      }
    },
  )
}

const submittedViewName = (model: Model): UpdateReturn => {
  if (model.layer._tag !== 'NamingViewLayer') {
    return [model, []]
  }
  const name = model.layer.name.trim()
  const closed = nextModel({ ...model, layer: NoLayer.make({}) })
  if (name === '') {
    return [model, []]
  } else {
    return Option.match(model.layer.maybeViewId, {
      onNone: () => [
        closed,
        [
          CreateIssueView({
            name,
            position: positionAfterLast(savedViewsOf(model)),
            query: searchOfView(issueViewOf(model)),
          }),
        ],
      ],
      onSome: viewId =>
        Option.match(savedViewById(model, viewId), {
          onNone: () => [closed, []],
          onSome: view => [
            closed,
            [UpdateIssueView({ view: SavedView.make({ ...view, name }) })],
          ],
        }),
    })
  }
}

const isCloseRefused = ({ change, issueId }: RowEdit): boolean =>
  change._tag === 'ChangedStatus' &&
  change.status === 'Closed' &&
  !leftoverMayClose(issueId)

const appliedRowChange = (
  model: Model,
  issueIds: ReadonlyArray<string>,
  change: RowChange,
): UpdateReturn => {
  const asked = Array.map(
    issueIds,
    (issueId): RowEdit => ({
      change,
      issueId,
    }),
  )
  const issuesById = issuesByIdIn(model)
  const isChange = (edit: RowEdit): boolean =>
    Option.match(Option.fromUndefinedOr(issuesById.get(edit.issueId)), {
      onNone: () => true,
      onSome: issue => isChangeTo(issue, edit.change),
    })
  const edits = Array.filter(
    asked,
    edit => !isCloseRefused(edit) && isChange(edit),
  )
  const refused = Array.filter(asked, isCloseRefused)
  const noted = nextModel({
    ...model,
    failedRowEdits: Array.appendAll(
      model.failedRowEdits,
      Array.map(refused, edit => ({
        edit,
        reason: `Issue ${edit.issueId} cannot be Closed.`,
      })),
    ),
  })
  const maybeFirstEdit = Array.head(edits)
  if (Option.isNone(maybeFirstEdit)) {
    return [noted, []]
  } else {
    const changed = nextModel({
      ...noted,
      rowEdits: Array.appendAll(noted.rowEdits, edits),
    })
    return [
      nextModel({ ...changed, maybeRowCursor: cursorKeptOn(model, changed) }),
      Array.isReadonlyArrayEmpty(model.rowEdits)
        ? [rowEditCommand(maybeFirstEdit.value)]
        : [],
    ]
  }
}

const nextRowEdit = (model: Model): UpdateReturn => {
  const rest = Array.drop(model.rowEdits, 1)
  return [
    nextModel({ ...model, rowEdits: rest }),
    Option.match(Array.head(rest), {
      onNone: () => [],
      onSome: edit => [rowEditCommand(edit)],
    }),
  ]
}

const isIssueMutationSaving = (model: Model): boolean =>
  model.issueMutation._tag === 'SavingIssueMutation'

/**
 * The Model once a write to `issue` landed: the Issue shown and listed as
 * stored. A write never moves the page, whichever page it returns to.
 */
const savedIssue = (model: Model, issue: Issue): Model => {
  const isShown =
    model.navigation._tag === 'IssueDetail' &&
    model.navigation.issueId === issue.id
  return nextModel({
    ...model,
    issueDetail: isShown
      ? LoadedIssue.make({ issue: Option.some(issue), issueId: issue.id })
      : model.issueDetail,
    issueMutation: isShown
      ? SavedIssueMutation.make({ entryId: Option.none(), issueId: issue.id })
      : IdleIssueMutation.make({}),
    issues: patchIssues(model.issues, issue),
  })
}

/**
 * The Model once a submitted draft was filed as `issue`: the draft is clear,
 * the new Issue opens if the filing form is still the page, and the finding it
 * was promoted from names it, whatever the page.
 */
const filedIssueDraft = (
  model: Model,
  issue: Issue,
  maybeFindingId: Option.Option<string>,
): UpdateReturn => {
  const marks = Option.toArray(
    Option.map(maybeFindingId, findingId =>
      MarkFindingPromoted({ findingId, issueId: issue.id }),
    ),
  )
  const isDraftFiled = model.draftState._tag === 'SavingIssueDraft'
  const filed = nextModel({
    ...model,
    draft: isDraftFiled ? emptyIssueDraft(model.draft.productId) : model.draft,
    draftState: isDraftFiled ? EditingIssueDraft.make({}) : model.draftState,
    issues: patchIssues(model.issues, issue),
  })
  if (model.navigation._tag === 'FileIssue') {
    const [opened, commands] = withNavigation(
      filed,
      IssueDetail.make({ issueId: issue.id }),
    )
    return [opened, [...commands, ...marks]]
  } else {
    return [filed, marks]
  }
}

const startLeftoverCommand = (
  model: Model,
  command: Command.Command<Message, never, Resources>,
): UpdateReturn => [
  nextModel({ ...model, issueMutation: SavingIssueMutation.make({}) }),
  [command],
]

/** Restores destination-specific observation state from a Model snapshot. */
export const restore = (model: Model): UpdateReturn =>
  withNavigation(model, model.navigation)

// UPDATE

/** Applies one Issue Tracker Message to the Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      TickedClock: ({ nowMs, timeZone }) => [
        nextModel({ ...model, clock: { nowMs, timeZone } }),
        [],
      ],
      ObservedIssues: ({ issues }) => {
        const nextProducts =
          model.products._tag === 'LoadedProducts'
            ? LoadedProducts.make({
                products: mergeCatalog(
                  model.products.products,
                  productsFromIssues(issues),
                ),
              })
            : model.products
        return [
          nextModel({
            ...model,
            issues: loadedIssuesOf(issues),
            products: nextProducts,
          }),
          [],
        ]
      },
      FailedObserveIssues: ({ reason }) => [
        nextModel({ ...model, issues: FailedIssues.make({ reason }) }),
        [],
      ],
      ObservedProducts: ({ products }) => {
        const nextProducts = mergeCatalog(
          products,
          model.issues._tag === 'LoadedIssues'
            ? productsFromIssues(model.issues.issues)
            : [],
        )
        const nextProductId =
          model.draft.productId === ''
            ? Option.match(Array.head(nextProducts), {
                onNone: () => '',
                onSome: entry => entry.product.id,
              })
            : model.draft.productId
        return [
          nextModel({
            ...model,
            draft: IssueDraft.make({
              ...model.draft,
              productId: nextProductId,
            }),
            products: LoadedProducts.make({ products: nextProducts }),
          }),
          [],
        ]
      },
      FailedObserveProducts: ({ reason }) => [
        nextModel({ ...model, products: FailedProducts.make({ reason }) }),
        [],
      ],
      ObservedTriageCandidates: ({ candidates }) => [
        nextModel({
          ...model,
          triageCandidates: LoadedTriageCandidates.make({ candidates }),
        }),
        [],
      ],
      FailedObserveTriageCandidates: ({ reason }) => [
        nextModel({
          ...model,
          triageCandidates: FailedTriageCandidates.make({ reason }),
        }),
        [],
      ],
      ObservedIssue: ({ issue, issueId }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            issueDetail: LoadedIssue.make({ issue, issueId }),
          }),
          [],
        ]
      },
      FailedObserveIssue: ({ issueId, reason }) => [
        nextModel({
          ...model,
          issueDetail: FailedIssue.make({ issueId, reason }),
        }),
        [],
      ],
      ObservedIssueFiles: ({ files, issueId }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            issueFiles: LoadedIssueFiles.make({ files, issueId }),
          }),
          [],
        ]
      },
      FailedObserveIssueFiles: ({ issueId, reason }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            issueFiles: FailedIssueFiles.make({ issueId, reason }),
          }),
          [],
        ]
      },
      ObservedIssueLanding: ({ issueId, landing }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            issueLanding: LoadedIssueLanding.make({ issueId, landing }),
          }),
          [],
        ]
      },
      FailedObserveIssueLanding: ({ issueId, reason }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            issueLanding: FailedIssueLanding.make({ issueId, reason }),
          }),
          [],
        ]
      },
      ObservedIssueGraph: ({ graph, issueId }) =>
        model.navigation._tag === 'IssueDetail' &&
        model.navigation.issueId === issueId
          ? [
              nextModel({
                ...model,
                issueGraph: LoadedIssueGraph.make({ graph, issueId }),
              }),
              [],
            ]
          : [model, []],
      FailedObserveIssueGraph: ({ issueId, reason }) =>
        model.navigation._tag === 'IssueDetail' &&
        model.navigation.issueId === issueId
          ? [
              nextModel({
                ...model,
                issueGraph: FailedIssueGraph.make({ issueId, reason }),
              }),
              [],
            ]
          : [model, []],
      ObservedBuilds: ({ builds }) => [
        nextModel({ ...model, knownBuilds: builds }),
        [],
      ],
      FailedObserveBuilds: () => [model, []],
      ObservedAgentChips: ({ runs }) => [
        nextModel({ ...model, knownAgents: runs }),
        [],
      ],
      FailedObserveAgentChips: () => [model, []],
      ObservedPageFacts: ({ entity, facts }) =>
        isPageOf(model, entity)
          ? [
              nextModel({
                ...model,
                pageFacts: LoadedPageFacts.make({ entity, facts }),
              }),
              [],
            ]
          : [model, []],
      FailedObservePageFacts: ({ entity, reason }) =>
        isPageOf(model, entity)
          ? [
              nextModel({
                ...model,
                pageFacts: FailedPageFacts.make({ entity, reason }),
              }),
              [],
            ]
          : [model, []],
      ObservedIssueLogs: ({ issueId, logs }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            issueLogs: LoadedIssueLogs.make({ issueId, logs }),
          }),
          [],
        ]
      },
      FailedObserveIssueLogs: ({ issueId, reason }) => [
        nextModel({
          ...model,
          issueLogs: FailedIssueLogs.make({ issueId, reason }),
        }),
        [],
      ],
      SelectedIssue: ({ issueId }) =>
        withNavigation(model, IssueDetail.make({ issueId })),
      DismissedIssueDetail: () => backToList(model),
      ClickedOpenIssueList: () => backToList(model),
      ClickedFileIssue: () => withNavigation(model, FileIssue.make({})),
      ClickedOpenTriage: () => withNavigation(model, TriageInbox.make({})),
      ClickedOpenBacklog: () =>
        withNavigation(
          model,
          Backlog.make({ product: productFilterOf(model) }),
        ),
      ClickedOpenAskFlow: () => withNavigation(model, AskFlow.make({})),
      ClickedOpenFindings: () => withNavigation(model, Findings.make({})),
      ClickedOpenDecisions: () => withNavigation(model, Decisions.make({})),
      ClickedOpenQuestions: () => withNavigation(model, Questions.make({})),
      ObservedQuestions: ({ questions }) => [
        nextModel({
          ...model,
          questionsList: { _tag: 'LoadedQuestions', questions },
        }),
        [],
      ],
      FailedObserveQuestions: ({ reason }) => [
        nextModel({
          ...model,
          questionsList: FailedQuestions.make({ reason }),
        }),
        [],
      ],
      ClickedOpenReminders: () => withNavigation(model, Reminders.make({})),
      ObservedReminders: ({ reminders }) => [
        nextModel({
          ...model,
          remindersList: { _tag: 'LoadedReminders', reminders },
        }),
        [],
      ],
      FailedObserveReminders: ({ reason }) => [
        nextModel({
          ...model,
          remindersList: FailedReminders.make({ reason }),
        }),
        [],
      ],
      ObservedDecisions: ({ decisions }) => [
        nextModel({
          ...model,
          knownDecisions: { _tag: 'LoadedDecisions', decisions },
        }),
        [],
      ],
      FailedObserveDecisions: ({ reason }) => [
        nextModel({
          ...model,
          knownDecisions: FailedDecisions.make({ reason }),
        }),
        [],
      ],
      ClickedOpenFeatures: () => withNavigation(model, Features.make({})),
      ClickedOpenProducts: () => withNavigation(model, Products.make({})),
      ObservedFeatures: ({ features }) =>
        model.navigation._tag === 'Features'
          ? [
              nextModel({
                ...model,
                featuresList: LoadedFeatures.make({ features }),
              }),
              [],
            ]
          : [model, []],
      FailedObserveFeatures: ({ reason }) =>
        model.navigation._tag === 'Features'
          ? [
              nextModel({
                ...model,
                featuresList: FailedFeatures.make({ reason }),
              }),
              [],
            ]
          : [model, []],
      ObservedFeatureChips: ({ features }) => [
        nextModel({ ...model, knownFeatures: features }),
        [],
      ],
      FailedObserveFeatureChips: () => [model, []],
      ObservedFindings: ({ findings }) =>
        model.navigation._tag === 'Findings'
          ? [
              nextModel({
                ...model,
                findingsList: LoadedFindings.make({ findings }),
              }),
              [],
            ]
          : [model, []],
      FailedObserveFindings: ({ reason }) =>
        model.navigation._tag === 'Findings'
          ? [
              nextModel({
                ...model,
                findingsList: FailedFindings.make({ reason }),
              }),
              [],
            ]
          : [model, []],
      ClickedPromoteFinding: ({ findingId }) =>
        Option.match(
          Array.findFirst(
            findingsOnPage(model),
            finding => finding.findingId === findingId,
          ),
          {
            onNone: () => [model, []],
            onSome: finding =>
              withNavigation(
                nextModel({
                  ...model,
                  draft: draftOfFinding(
                    finding,
                    issuesByIdIn(model),
                    model.draft,
                  ),
                  draftState: EditingIssueDraft.make({}),
                  maybeDraftFindingId: Option.some(findingId),
                }),
                FileIssue.make({}),
              ),
          },
        ),
      SucceededMarkFindingPromoted: () => [model, []],
      FailedMarkFindingPromoted: ({ findingId, issueId, reason }) => [
        nextModel({
          ...model,
          issueMutation: FailedIssueMutation.make({
            reason: `#${issueId} is filed, and finding ${findingId} still says open: ${reason}`,
          }),
        }),
        [],
      ],
      ClickedOpenInbox: () => withNavigation(model, Inbox.make({})),
      SelectedInboxKind: ({ kind }) => [
        nextModel({ ...model, navigation: Inbox.make({ kind }) }),
        [],
      ],
      UpdatedSearchQuery: ({ query }) =>
        model.navigation._tag === 'IssueList'
          ? [
              nextModel({
                ...model,
                navigation: IssueList.make({
                  view: { ...model.navigation.view, query },
                }),
              }),
              [],
            ]
          : [model, []],
      SubmittedSearch: () =>
        Option.match(issueSearchOpens(model), {
          onNone: () => [model, []],
          onSome: issueId =>
            withNavigation(model, IssueDetail.make({ issueId })),
        }),
      FocusedSearchField: () => {
        primedSearchText(loadedIssuesIn(model))
        if (model.navigation._tag === 'IssueList') {
          return [nextModel({ ...model, isSearchFocused: true }), []]
        } else {
          const [listing, commands] = backToList(model)
          return [nextModel({ ...listing, isSearchFocused: true }), commands]
        }
      },
      BlurredSearchField: () => [
        nextModel({ ...model, isSearchFocused: false }),
        [],
      ],
      MovedRowCursor: ({ direction }) => {
        const maybeRowCursor = movedRowCursor(
          rowsInOrderOf(model),
          model.maybeRowCursor,
          direction,
        )
        return [
          nextModel({
            ...model,
            isSearchFocused: false,
            layer:
              model.layer._tag === 'PeekLayer'
                ? PeekLayer.make({
                    issueId: Option.getOrElse(maybeRowCursor, () =>
                      model.layer._tag === 'PeekLayer'
                        ? model.layer.issueId
                        : '',
                    ),
                  })
                : model.layer,
            maybeRowCursor,
            maybeSelectionRun: Option.none(),
          }),
          [],
        ]
      },
      MovedCursorAcross: ({ direction }) =>
        Option.match(cardAcross(model, direction), {
          onNone: () => [model, []],
          onSome: issueId => [
            nextModel({
              ...model,
              maybeRowCursor: Option.some(issueId),
              maybeSelectionRun: Option.none(),
            }),
            [],
          ],
        }),
      MovedCardAcross: ({ direction }) =>
        Option.match(changeAcross(model, direction), {
          onNone: () => [model, []],
          onSome: change =>
            appliedRowChange(model, issuesInHandOf(model), change),
        }),
      DroppedCard: ({ column, issueId }) =>
        Option.match(columnChangeOf(model, column), {
          onNone: () => [model, []],
          onSome: change =>
            appliedRowChange(
              nextModel({ ...model, maybeRowCursor: Option.some(issueId) }),
              selectedSetOf(model).has(issueId)
                ? Array.map(selectedRowsOf(model), issue => issue.id)
                : [issueId],
              change,
            ),
        }),
      ObservedSavedViews: ({ views }) => [
        nextModel({ ...model, savedViews: LoadedSavedViews.make({ views }) }),
        [],
      ],
      FailedObserveSavedViews: ({ reason }) => [
        nextModel({ ...model, savedViews: FailedSavedViews.make({ reason }) }),
        [],
      ],
      ClickedSaveView: () => [
        nextModel({
          ...model,
          isGoKeyPending: false,
          isSearchFocused: false,
          layer: NamingViewLayer.make({ maybeViewId: Option.none(), name: '' }),
        }),
        [],
      ],
      ClickedRenameView: ({ viewId }) =>
        Option.match(savedViewById(model, viewId), {
          onNone: () => [model, []],
          onSome: view => [
            nextModel({
              ...model,
              layer: NamingViewLayer.make({
                maybeViewId: Option.some(viewId),
                name: view.name,
              }),
            }),
            [],
          ],
        }),
      UpdatedViewName: ({ name }) =>
        model.layer._tag === 'NamingViewLayer'
          ? [
              nextModel({
                ...model,
                layer: NamingViewLayer.make({ ...model.layer, name }),
              }),
              [],
            ]
          : [model, []],
      SubmittedViewName: () => submittedViewName(model),
      ClickedUpdateView: ({ viewId }) =>
        Option.match(savedViewById(model, viewId), {
          onNone: () => [model, []],
          onSome: view =>
            model.navigation._tag === 'IssueList'
              ? [
                  nextModel({ ...model, layer: NoLayer.make({}) }),
                  [
                    UpdateIssueView({
                      view: SavedView.make({
                        ...view,
                        query: searchOfView(model.navigation.view),
                      }),
                    }),
                  ],
                ]
              : [model, []],
        }),
      ClickedMoveView: ({ direction, viewId }) =>
        Option.match(
          Option.zipWith(
            savedViewById(model, viewId),
            positionMovedTo(savedViewsOf(model), viewId, direction),
            (view, position) => SavedView.make({ ...view, position }),
          ),
          {
            onNone: () => [model, []],
            onSome: view => [model, [UpdateIssueView({ view })]],
          },
        ),
      ClickedDeleteView: ({ viewId }) => [model, [DeleteIssueView({ viewId })]],
      SucceededSaveIssueView: () => [
        nextModel({ ...model, maybeViewFailure: Option.none() }),
        [],
      ],
      FailedSaveIssueView: ({ name, reason }) => [
        nextModel({
          ...model,
          maybeViewFailure: Option.some(`Not saved: view ${name}: ${reason}`),
        }),
        [],
      ],
      SucceededDeleteIssueView: () => [
        nextModel({ ...model, maybeViewFailure: Option.none() }),
        [],
      ],
      FailedDeleteIssueView: ({ reason }) => [
        nextModel({
          ...model,
          maybeViewFailure: Option.some(`Not deleted: ${reason}`),
        }),
        [],
      ],
      DismissedViewFailure: () => [
        nextModel({ ...model, maybeViewFailure: Option.none() }),
        [],
      ],
      ClearedRowCursor: () => [
        nextModel({
          ...model,
          maybeRowCursor: Option.none(),
          maybeSelectionRun: Option.none(),
        }),
        [],
      ],
      ToggledRowUnderCursor: () =>
        Option.match(issueUnderCursorOf(model), {
          onNone: () => [model, []],
          onSome: issue => [selectionToggled(model, issue.id), []],
        }),
      ToggledRowSelection: ({ issueId }) => [
        selectionToggled(model, issueId),
        [],
      ],
      ExtendedRowSelection: ({ direction }) => [
        selectionExtendedBy(model, direction),
        [],
      ],
      ExtendedRowSelectionTo: ({ issueId }) => [
        selectionExtendedTo(model, issueId),
        [],
      ],
      ClearedRowSelection: () => [
        nextModel({
          ...model,
          maybeSelectionRun: Option.none(),
          selectedIssueIds: [],
        }),
        [],
      ],
      PeekedRowUnderCursor: () =>
        Option.match(issueUnderCursorOf(model), {
          onNone: () => [model, []],
          onSome: issue => [
            nextModel({
              ...model,
              isSearchFocused: false,
              layer: PeekLayer.make({ issueId: issue.id }),
            }),
            [],
          ],
        }),
      OpenedRowUnderCursor: () =>
        Option.match(issueUnderCursorOf(model), {
          onNone: () => [model, []],
          onSome: issue =>
            withNavigation(model, IssueDetail.make({ issueId: issue.id })),
        }),
      OpenedCommandPalette: () => [
        nextModel({
          ...model,
          isGoKeyPending: false,
          isSearchFocused: false,
          layer: ChoiceLayer.make({
            menu: 'Everything',
            position: 0,
            query: '',
          }),
        }),
        [],
      ],
      OpenedChoiceMenu: ({ menu }) => [
        nextModel({
          ...model,
          isGoKeyPending: false,
          isSearchFocused: false,
          layer: ChoiceLayer.make({
            heldIssueIds: issuesInHandOf(model),
            maybePeekedIssueId:
              model.layer._tag === 'PeekLayer'
                ? Option.some(model.layer.issueId)
                : Option.none(),
            menu,
            position: 0,
            query: '',
          }),
        }),
        [],
      ],
      OpenedRowField: ({ issueId, menu }) =>
        isDialogOpen(model)
          ? [model, []]
          : openedRowField(model, issueId, menu),
      AppliedRowChange: ({ change }) =>
        appliedRowChange(model, issuesInHandOf(model), change),
      SucceededRowEdit: ({ issue }) =>
        nextRowEdit(
          nextModel({
            ...model,
            issueDetail:
              model.navigation._tag === 'IssueDetail' &&
              model.navigation.issueId === issue.id
                ? LoadedIssue.make({
                    issue: Option.some(issue),
                    issueId: issue.id,
                  })
                : model.issueDetail,
            issues: patchIssues(model.issues, issue),
          }),
        ),
      FailedRowEditWrite: ({ reason }) =>
        nextRowEdit(
          nextModel({
            ...model,
            failedRowEdits: Option.match(Array.head(model.rowEdits), {
              onNone: () => model.failedRowEdits,
              onSome: edit =>
                Array.append(model.failedRowEdits, { edit, reason }),
            }),
          }),
        ),
      DismissedFailedRowEdits: () => [
        nextModel({ ...model, failedRowEdits: [] }),
        [],
      ],
      UpdatedMenuQuery: ({ query }) =>
        model.layer._tag === 'ChoiceLayer'
          ? [
              nextModel({
                ...model,
                layer: ChoiceLayer.make({ ...model.layer, position: 0, query }),
              }),
              [],
            ]
          : [model, []],
      MovedMenuMark: ({ direction }) => movedMenuMark(model, direction),
      SubmittedMenu: () =>
        model.layer._tag === 'ChoiceLayer'
          ? pickedMenuRow(
              model,
              Array.get(openMenuRowsOf(model), model.layer.position),
            )
          : [model, []],
      PickedMenuRow: ({ token }) =>
        pickedMenuRow(
          model,
          Array.findFirst(
            openMenuRowsOf(model),
            row => row.action.token === token,
          ),
        ),
      DismissedLayer: () => [
        nextModel({ ...model, layer: layerBelow(model) }),
        [],
      ],
      PressedGoKey: () => [nextModel({ ...model, isGoKeyPending: true }), []],
      CancelledGoKey: () => [
        nextModel({ ...model, isGoKeyPending: false }),
        [],
      ],
      ClickedPromoteTriageCandidate: ({ candidateId }) =>
        reviewTriageCandidate(model, candidateId, 'Promote'),
      ClickedDismissTriageCandidate: ({ candidateId }) =>
        reviewTriageCandidate(model, candidateId, 'Dismiss'),
      UpdatedIssueTitle: ({ value }) =>
        updateDraft(model, draft =>
          IssueDraft.make({ ...draft, title: value }),
        ),
      UpdatedIssueDetails: ({ value }) =>
        updateDraft(model, draft =>
          IssueDraft.make({ ...draft, details: value }),
        ),
      SelectedIssueProduct: ({ productId }) =>
        updateDraft(model, draft => IssueDraft.make({ ...draft, productId })),
      SelectedIssuePriority: ({ priority }) =>
        updateDraft(model, draft => IssueDraft.make({ ...draft, priority })),
      ComposedIssueDraft: ({ draft }) => updateDraft(model, () => draft),
      SubmittedIssue: () => saveDraft(model),
      SucceededSaveIssue: ({ issue }) => [savedIssue(model, issue), []],
      FailedSaveIssue: ({ reason }) => [
        nextModel({
          ...model,
          issueMutation: FailedIssueMutation.make({ reason }),
        }),
        [],
      ],
      SucceededFileIssueDraft: ({ issue, maybeFindingId }) =>
        filedIssueDraft(model, issue, maybeFindingId),
      FailedFileIssueDraft: ({ reason }) => [
        nextModel({
          ...model,
          draftState: FailedIssueDraft.make({ reason }),
        }),
        [],
      ],
      SucceededCommentOnIssue: ({ issue, summary }) => {
        const saved = savedIssue(model, issue)
        return [
          nextModel({
            ...saved,
            leftoverComment:
              saved.leftoverComment === summary ? '' : saved.leftoverComment,
          }),
          [],
        ]
      },
      SucceededLinkCatalogIssue: ({ issue, targetIssueId }) => {
        const saved = savedIssue(model, issue)
        return [
          nextModel({
            ...saved,
            leftoverLink:
              saved.leftoverLink === targetIssueId ? '' : saved.leftoverLink,
          }),
          [],
        ]
      },
      SucceededReviewTriageCandidate: ({ candidate, issue }) => {
        const nextCandidates =
          model.triageCandidates._tag === 'LoadedTriageCandidates'
            ? Array.map(model.triageCandidates.candidates, current =>
                current.id === candidate.id ? candidate : current,
              )
            : []
        const reviewed = nextModel({
          ...model,
          triageCandidates: LoadedTriageCandidates.make({
            candidates: nextCandidates,
          }),
        })
        return Option.match(issue, {
          onNone: () => [reviewed, []],
          onSome: promoted =>
            withNavigation(
              reviewed,
              IssueDetail.make({ issueId: promoted.id }),
            ),
        })
      },
      FailedReviewTriageCandidate: ({ reason }) => [
        nextModel({
          ...model,
          triageCandidates: FailedTriageCandidates.make({ reason }),
        }),
        [],
      ],
      UpdatedLeftoverComment: ({ value }) => [
        nextModel({ ...model, leftoverComment: value }),
        [],
      ],
      UpdatedLeftoverLink: ({ value }) => [
        nextModel({ ...model, leftoverLink: value }),
        [],
      ],
      SubmittedIssueComment: ({ issueId, summary }) => {
        if (summary.trim() === '' || isIssueMutationSaving(model)) {
          return [model, []]
        }
        return startLeftoverCommand(model, CommentOnIssue({ issueId, summary }))
      },
      AppendedIssueWorkLog: ({ summary }) => {
        if (summary.trim() === '') {
          return [model, []]
        }
        if (model.navigation._tag !== 'IssueDetail') {
          return [model, []]
        }
        return Option.match(
          loadedDetailIssue(model, model.navigation.issueId),
          {
            onNone: () => [model, []],
            onSome: issue =>
              startLeftoverCommand(model, SaveIssueWorkLog({ issue, summary })),
          },
        )
      },
      SucceededSaveIssueWorkLog: ({ issue }) => [
        nextModel({
          ...model,
          issueDetail:
            model.navigation._tag === 'IssueDetail' &&
            model.navigation.issueId === issue.id
              ? LoadedIssue.make({
                  issue: Option.some(issue),
                  issueId: issue.id,
                })
              : model.issueDetail,
          issueMutation: IdleIssueMutation.make({}),
          issues: patchIssues(model.issues, issue),
        }),
        [],
      ],
      FailedSaveIssueWorkLog: ({ reason }) => [
        nextModel({
          ...model,
          issueMutation: FailedIssueMutation.make({ reason }),
        }),
        [],
      ],
      SubmittedIssueWorkLogEntry: entry => {
        if (entry.summary.trim() === '') {
          return [
            nextModel({
              ...model,
              issueMutation: FailedIssueMutation.make({
                reason: 'A work-log summary is required.',
              }),
            }),
            [],
          ]
        }
        return startLeftoverCommand(
          model,
          AppendIssueWorkLogEntry({
            agentId: entry.agentId,
            claimantId: entry.claimantId,
            commitSha: entry.commitSha,
            issueId: entry.issueId,
            state: entry.state,
            status: entry.status,
            summary: entry.summary,
          }),
        )
      },
      SucceededAppendIssueWorkLogEntry: ({ entryId, issue }) => [
        nextModel({
          ...model,
          issueDetail:
            model.navigation._tag === 'IssueDetail' &&
            model.navigation.issueId === issue.id
              ? LoadedIssue.make({
                  issue: Option.some(issue),
                  issueId: issue.id,
                })
              : model.issueDetail,
          issueMutation: SavedIssueMutation.make({
            entryId: Option.some(entryId),
            issueId: issue.id,
          }),
          issues: patchIssues(model.issues, issue),
        }),
        [],
      ],
      SubmittedIssueAttachment: ({ attachment, issueId }) =>
        startLeftoverCommand(
          model,
          AppendIssueAttachment({ attachment, issueId }),
        ),
      SubmittedIssueEdit: edit => {
        const maybeProduct = Option.map(edit.productId, reference =>
          productForReference(catalogProducts(model), reference),
        )
        if (Option.isSome(maybeProduct) && Option.isNone(maybeProduct.value)) {
          return [
            nextModel({
              ...model,
              issueMutation: FailedIssueMutation.make({
                reason: `Choose an Application or Library: "${Option.getOrElse(edit.productId, () => '')}" names none. Valid: ${productChoices(catalogProducts(model))}.`,
              }),
            }),
            [],
          ]
        }
        return startLeftoverCommand(
          model,
          EditIssue({
            area: edit.area,
            details: edit.details,
            issueId: edit.issueId,
            issueType: edit.issueType,
            priority: edit.priority,
            product: Option.flatten(maybeProduct),
            title: edit.title,
          }),
        )
      },
      SubmittedIssueSuccessCriterion: ({
        issueId,
        outcome,
        requiredEvidence,
      }) =>
        startLeftoverCommand(
          model,
          AddIssueSuccessCriterion({ issueId, outcome, requiredEvidence }),
        ),
      SubmittedSuccessCriteriaMarks: ({ criterionIds, isSatisfied, issueId }) =>
        startLeftoverCommand(
          model,
          MarkIssueSuccessCriteria({ criterionIds, isSatisfied, issueId }),
        ),
      SubmittedIssueSubtasks: ({ issueId, titles }) => {
        const nextTitles = Array.dedupe(
          Array.filter(
            Array.map(titles, title => title.trim()),
            title => title !== '',
          ),
        )
        if (Array.isReadonlyArrayEmpty(nextTitles)) {
          return [
            nextModel({
              ...model,
              issueMutation: FailedIssueMutation.make({
                reason: 'A subtask title is required.',
              }),
            }),
            [],
          ]
        }
        return startLeftoverCommand(
          model,
          AddIssueSubtasks({ issueId, titles: nextTitles }),
        )
      },
      SubmittedSubtaskMarks: ({ issueId, mark, subtaskIds }) =>
        startLeftoverCommand(
          model,
          MarkIssueSubtasks({ issueId, mark, subtaskIds }),
        ),
      SubmittedIssueWorkInProgress: ({ edit, issueId }) =>
        startLeftoverCommand(
          model,
          RecordIssueWorkInProgress({ edit, issueId }),
        ),
      ClearedIssueWorkInProgress: ({ issueId }) =>
        startLeftoverCommand(model, ClearIssueWorkInProgress({ issueId })),
      ObservedAgentSurvey: ({ issueId, survey, touchedFiles }) =>
        startLeftoverCommand(
          model,
          RecordAgentSurvey({ issueId, survey, touchedFiles }),
        ),
      SubmittedIssueRank: ({ issueId, rank }) =>
        startLeftoverCommand(model, RankIssue({ issueId, rank })),
      SelectedLandingFilter: ({ filter }) =>
        withListView(model, view => ({ ...view, landing: filter })),
      ToggledStatusFilter: ({ status }) =>
        withListView(model, view => ({
          ...view,
          statuses: toggled(view.statuses, status),
        })),
      ClearedStatusFilter: () =>
        withListView(model, view => ({ ...view, statuses: [] })),
      ToggledPriorityFilter: ({ priority }) =>
        withListView(model, view => ({
          ...view,
          priorities: toggled(view.priorities, priority),
        })),
      ClearedPriorityFilter: () =>
        withListView(model, view => ({ ...view, priorities: [] })),
      SelectedClaimantFilter: ({ filter }) =>
        withListView(model, view => ({ ...view, claimant: filter })),
      SelectedIssueSort: ({ sort }) =>
        withListView(model, view => ({ ...view, sort })),
      SelectedIssueGrouping: ({ grouping }) =>
        withListView(model, view => ({ ...view, grouping })),
      SelectedIssueLayout: ({ layout }) =>
        withListView(model, view => ({ ...view, layout })),
      SubmittedIssueMention: ({ issueId, mention }) =>
        startLeftoverCommand(model, AddIssueMention({ issueId, mention })),
      SelectedIssueStatus: ({ issueId, status }) =>
        startLeftoverCommand(model, SetIssueStatus({ issueId, status })),
      ConfirmedIssueDeletion: ({ issueId }) =>
        startLeftoverCommand(model, DeleteIssue({ issueId })),
      SucceededDeleteIssue: ({ issue }) => {
        const [navigated, commands] = withNavigation(model, IssueList.make({}))
        return [
          nextModel({
            ...navigated,
            issueMutation: DeletedIssueMutation.make({ issue }),
            issues: removeIssue(navigated.issues, issue.id),
          }),
          commands,
        ]
      },
      FailedDeleteIssue: ({ reason }) => [
        nextModel({
          ...model,
          issueMutation: FailedIssueMutation.make({ reason }),
        }),
        [],
      ],
      LinkedCatalogIssue: ({ sourceIssueId, targetIssueId }) => {
        if (
          targetIssueId.trim() === '' ||
          targetIssueId === sourceIssueId ||
          isIssueMutationSaving(model)
        ) {
          return [model, []]
        }
        return startLeftoverCommand(
          model,
          LinkCatalogIssue({ sourceIssueId, targetIssueId }),
        )
      },
      ClickedLeftoverStatus: ({ issueId, status }) =>
        startLeftoverCommand(
          model,
          SetLeftoverStatus({ issueId, leftover: status }),
        ),
      SelectedProductFilter: ({ filter }) => withProductFilter(model, filter),
      RetargetedIssueProduct: ({ issueId, productId }) => {
        if (model.products._tag !== 'LoadedProducts') {
          return [model, []]
        }
        const maybeProduct = Array.findFirst(
          model.products.products,
          entry => entry.product.id === productId,
        )
        if (Option.isNone(maybeProduct)) {
          return [model, []]
        }
        return Option.match(loadedDetailIssue(model, issueId), {
          onNone: () => [model, []],
          onSome: issue =>
            startLeftoverCommand(
              model,
              RetargetIssueProduct({
                issue,
                product: maybeProduct.value.product,
              }),
            ),
        })
      },
      SubmittedProduct: ({ product }) => addProduct(model, product),
      SucceededSaveProduct: ({ entry }) => [
        nextModel({
          ...model,
          productAddition: SavedProductAddition.make({
            product: entry.product,
          }),
          products:
            model.products._tag === 'LoadedProducts'
              ? LoadedProducts.make({
                  products: mergeCatalog(model.products.products, [entry]),
                })
              : model.products,
        }),
        [],
      ],
      FailedSaveProduct: ({ reason }) =>
        withProductAddition(model, FailedProductAddition.make({ reason })),
      OpenedNavigation: ({ navigation }) => withNavigation(model, navigation),
      ObservedLeftoverPeers: ({ leftoverId, peers }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== leftoverId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            leftoverPresence: LoadedLeftoverPresence.make({
              leftoverId,
              peers,
            }),
          }),
          [],
        ]
      },
      FailedObserveLeftoverPeers: ({ leftoverId, reason }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== leftoverId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            leftoverPresence: FailedLeftoverPresence.make({
              leftoverId,
              reason,
            }),
          }),
          [],
        ]
      },
      CompletedJoinLeftoverRoom: () => [model, []],
      FailedJoinLeftoverRoom: ({ leftoverId, reason }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== leftoverId
        ) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            leftoverPresence: FailedLeftoverPresence.make({
              leftoverId,
              reason,
            }),
          }),
          [],
        ]
      },
      CompletedLeaveLeftoverRoom: () => [model, []],
      FailedLeaveLeftoverRoom: ({ leftoverId, reason }) => {
        if (model.leftoverPresence._tag === 'NotObservingLeftoverPresence') {
          return [model, []]
        }
        if (model.leftoverPresence.leftoverId !== leftoverId) {
          return [model, []]
        }
        return [
          nextModel({
            ...model,
            leftoverPresence: FailedLeftoverPresence.make({
              leftoverId,
              reason,
            }),
          }),
          [],
        ]
      },
    }),
  )
