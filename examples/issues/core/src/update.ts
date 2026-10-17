import { Array, Clock, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'

import {
  ApplicationProduct,
  ISSUE_VIEWER_ORIGIN,
  Issue,
  IssueAttachment,
  IssueLogEvidenceQuery,
  IssueMention,
  IssueStatus,
  IssueSuccessCriterion,
  IssueTracker,
  IssueWorkLogEntry,
  ProductCatalog,
  ProductCatalogEntry,
  RecordingMention,
  RecordingReference,
  TrackedProduct,
  TriageCandidate,
  TriageInbox as TriageInboxServiceTag,
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

import { emptyIssueDraft } from './init.js'
import { IssueIdentity } from './issueIdentity.js'
import {
  LeftoverStatus,
  hasCatalogIssueLink,
  leftoverMayClose,
  storedStatusOf,
} from './leftover.js'
import {
  CompletedJoinLeftoverRoom,
  CompletedLeaveLeftoverRoom,
  FailedDeleteIssue,
  FailedJoinLeftoverRoom,
  FailedLeaveLeftoverRoom,
  FailedReviewTriageCandidate,
  FailedSaveIssue,
  FailedSaveIssueWorkLog,
  FailedSaveProduct,
  type Message,
  SucceededAppendIssueWorkLogEntry,
  SucceededDeleteIssue,
  SucceededReviewTriageCandidate,
  SucceededSaveIssue,
  SucceededSaveIssueWorkLog,
  SucceededSaveProduct,
} from './message.js'
import {
  DeletedIssueMutation,
  DraftMention,
  EditingIssueDraft,
  FailedIssue,
  FailedIssueDraft,
  FailedIssueLogs,
  FailedIssueMutation,
  FailedIssues,
  FailedLeftoverPresence,
  FailedProductAddition,
  FailedProducts,
  FailedTriageCandidates,
  FileIssue,
  IdleIssueMutation,
  IssueDetail,
  IssueDraft,
  IssueList,
  LoadedIssue,
  LoadedIssueLogs,
  LoadedIssues,
  LoadedLeftoverPresence,
  LoadedProducts,
  LoadedTriageCandidates,
  LoadingIssue,
  LoadingIssueLogs,
  LoadingLeftoverPresence,
  Model,
  type Navigation,
  NotObservingIssue,
  NotObservingIssueLogs,
  NotObservingLeftoverPresence,
  type ProductAdditionState,
  RefusedProductAddition,
  SavedIssueMutation,
  SavedProductAddition,
  SavingIssueDraft,
  SavingIssueMutation,
  SavingProductAddition,
  TriageInbox,
  UnchangedProductAddition,
} from './model.js'

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

const hasWorkLogEntry = (issue: Issue, entryId: string): boolean =>
  Array.some(issue.workLog, entry => entry.id === entryId)

const appendWorkLogEntry = (
  issue: Issue,
  entry: IssueWorkLogEntry,
): ReadonlyArray<IssueWorkLogEntry> =>
  hasWorkLogEntry(issue, entry.id)
    ? issue.workLog
    : Array.append(issue.workLog, entry)

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
export const SaveIssue = Command.define(
  'SaveIssue',
  { draft: IssueDraft, product: TrackedProduct },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ draft, product }) =>
  Effect.gen(function* () {
    const identity = yield* IssueIdentity
    const tracker = yield* IssueTracker
    const { nowMs } = yield* identity.next
    const issue = yield* tracker.file(issueId =>
      issueFromDraft(draft, product, issueId, nowMs),
    )
    return SucceededSaveIssue.make({ issue })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSaveIssue.make({ reason: failureReason(error) })),
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
    hasLanded: (issue: Issue) => hasWorkLogEntry(issue, entry.id),
  }
}

/** Appends one IssueWorkLogEntry and reads the Issue back. */
export const CommentOnIssue = Command.define(
  'CommentOnIssue',
  { issueId: S.String, summary: S.String },
  SucceededSaveIssue,
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
    return SucceededSaveIssue.make({ issue })
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
        hasWorkLogEntry(stored, entryId) &&
        Option.match(status, {
          onNone: () => true,
          onSome: wanted => stored.status === wanted,
        }) &&
        Option.match(claimantId, {
          onNone: () => true,
          onSome: wanted => Option.contains(stored.claimantId, wanted),
        }),
    })
    return SucceededAppendIssueWorkLogEntry.make({ entryId, issue })
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

/** Sets any stored IssueStatus and reads it back. */
export const SetIssueStatus = Command.define(
  'SetIssueStatus',
  { issueId: S.String, status: IssueStatus },
  SucceededSaveIssue,
  FailedSaveIssue,
)(({ issueId, status }) =>
  Effect.gen(function* () {
    const tracker = yield* IssueTracker
    const nowMs = yield* Clock.currentTimeMillis
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Issue.make({
          ...current,
          status,
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        }),
      hasLanded: stored => stored.status === status,
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
  SucceededSaveIssue,
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
    return SucceededSaveIssue.make({ issue })
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
    const status = storedStatusOf(leftover)
    const issue = yield* tracker.update(issueId, {
      apply: current =>
        Issue.make({
          ...current,
          status,
          updatedAtMs: nextUpdatedAtMs(current, nowMs),
        }),
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
  | IssueTracker
  | Logger
  | ProductCatalog
  | TriageInboxServiceTag
  | IssueIdentity
  | LeftoverPresence
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

const withNavigation = (model: Model, navigation: Navigation): UpdateReturn => {
  const isSameIssueDetail =
    model.navigation._tag === 'IssueDetail' &&
    navigation._tag === 'IssueDetail' &&
    model.navigation.issueId === navigation.issueId
  const previousLeftoverId =
    model.navigation._tag === 'IssueDetail'
      ? Option.some(model.navigation.issueId)
      : Option.none()
  const nextLeftoverId =
    navigation._tag === 'IssueDetail'
      ? Option.some(navigation.issueId)
      : Option.none()
  return [
    Model.make({
      ...model,
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
      issueLogs:
        navigation._tag === 'IssueDetail'
          ? LoadingIssueLogs.make({ issueId: navigation.issueId })
          : NotObservingIssueLogs.make({}),
      navigation,
    }),
    leftoverRoomCommands(previousLeftoverId, nextLeftoverId),
  ]
}

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
  if (model.navigation._tag !== 'FileIssue') {
    return [model, []]
  }
  if (model.draft.title.trim() === '') {
    return [
      Model.make({
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
      Model.make({
        ...model,
        draftState: FailedIssueDraft.make({
          reason: unknownProductReason(model),
        }),
      }),
      [],
    ]
  }
  return [
    Model.make({ ...model, draftState: SavingIssueDraft.make({}) }),
    [SaveIssue({ draft: model.draft, product: maybeProduct.value })],
  ]
}

const updateDraft = (
  model: Model,
  transform: (draft: IssueDraft) => IssueDraft,
): UpdateReturn => [
  Model.make({
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
): UpdateReturn => [Model.make({ ...model, productAddition }), []]

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
              Model.make({
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
  return LoadedIssues.make({
    issues: exists
      ? Array.map(state.issues, current =>
          current.id === issue.id ? issue : current,
        )
      : Array.append(state.issues, issue),
  })
}

const removeIssue = (
  state: Model['issues'],
  issueId: string,
): Model['issues'] => {
  if (state._tag !== 'LoadedIssues') {
    return state
  }
  return LoadedIssues.make({
    issues: Array.filter(state.issues, current => current.id !== issueId),
  })
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

const startLeftoverCommand = (
  model: Model,
  command: Command.Command<Message, never, Resources>,
): UpdateReturn => [
  Model.make({ ...model, issueMutation: SavingIssueMutation.make({}) }),
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
          Model.make({
            ...model,
            issues: LoadedIssues.make({ issues }),
            products: nextProducts,
          }),
          [],
        ]
      },
      FailedObserveIssues: ({ reason }) => [
        Model.make({ ...model, issues: FailedIssues.make({ reason }) }),
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
          Model.make({
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
        Model.make({ ...model, products: FailedProducts.make({ reason }) }),
        [],
      ],
      ObservedTriageCandidates: ({ candidates }) => [
        Model.make({
          ...model,
          triageCandidates: LoadedTriageCandidates.make({ candidates }),
        }),
        [],
      ],
      FailedObserveTriageCandidates: ({ reason }) => [
        Model.make({
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
          Model.make({
            ...model,
            issueDetail: LoadedIssue.make({ issue, issueId }),
          }),
          [],
        ]
      },
      FailedObserveIssue: ({ issueId, reason }) => [
        Model.make({
          ...model,
          issueDetail: FailedIssue.make({ issueId, reason }),
        }),
        [],
      ],
      ObservedIssueLogs: ({ issueId, logs }) => {
        if (
          model.navigation._tag !== 'IssueDetail' ||
          model.navigation.issueId !== issueId
        ) {
          return [model, []]
        }
        return [
          Model.make({
            ...model,
            issueLogs: LoadedIssueLogs.make({ issueId, logs }),
          }),
          [],
        ]
      },
      FailedObserveIssueLogs: ({ issueId, reason }) => [
        Model.make({
          ...model,
          issueLogs: FailedIssueLogs.make({ issueId, reason }),
        }),
        [],
      ],
      SelectedIssue: ({ issueId }) =>
        withNavigation(model, IssueDetail.make({ issueId })),
      DismissedIssueDetail: () => withNavigation(model, IssueList.make({})),
      ClickedFileIssue: () => withNavigation(model, FileIssue.make({})),
      ClickedOpenTriage: () => withNavigation(model, TriageInbox.make({})),
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
      SucceededSaveIssue: ({ issue }) => {
        if (
          model.navigation._tag === 'IssueDetail' &&
          model.navigation.issueId === issue.id
        ) {
          return [
            Model.make({
              ...model,
              issueDetail: LoadedIssue.make({
                issue: Option.some(issue),
                issueId: issue.id,
              }),
              issueMutation: SavedIssueMutation.make({
                entryId: Option.none(),
                issueId: issue.id,
              }),
              issues: patchIssues(model.issues, issue),
            }),
            [],
          ]
        }
        return withNavigation(
          Model.make({
            ...model,
            draft:
              model.draftState._tag === 'SavingIssueDraft'
                ? emptyIssueDraft(model.draft.productId)
                : model.draft,
            draftState: EditingIssueDraft.make({}),
            issueMutation: IdleIssueMutation.make({}),
            issues: patchIssues(model.issues, issue),
          }),
          IssueDetail.make({ issueId: issue.id }),
        )
      },
      FailedSaveIssue: ({ reason }) =>
        model.navigation._tag === 'FileIssue'
          ? [
              Model.make({
                ...model,
                draftState: FailedIssueDraft.make({ reason }),
                issueMutation: IdleIssueMutation.make({}),
              }),
              [],
            ]
          : [
              Model.make({
                ...model,
                issueMutation: FailedIssueMutation.make({ reason }),
              }),
              [],
            ],
      SucceededReviewTriageCandidate: ({ candidate, issue }) => {
        const nextCandidates =
          model.triageCandidates._tag === 'LoadedTriageCandidates'
            ? Array.map(model.triageCandidates.candidates, current =>
                current.id === candidate.id ? candidate : current,
              )
            : []
        const nextModel = Model.make({
          ...model,
          triageCandidates: LoadedTriageCandidates.make({
            candidates: nextCandidates,
          }),
        })
        return Option.match(issue, {
          onNone: () => [nextModel, []],
          onSome: promoted =>
            withNavigation(
              nextModel,
              IssueDetail.make({ issueId: promoted.id }),
            ),
        })
      },
      FailedReviewTriageCandidate: ({ reason }) => [
        Model.make({
          ...model,
          triageCandidates: FailedTriageCandidates.make({ reason }),
        }),
        [],
      ],
      UpdatedLeftoverComment: ({ value }) => [
        Model.make({ ...model, leftoverComment: value }),
        [],
      ],
      UpdatedLeftoverLink: ({ value }) => [
        Model.make({ ...model, leftoverLink: value }),
        [],
      ],
      SubmittedIssueComment: ({ issueId, summary }) => {
        if (summary.trim() === '') {
          return [model, []]
        }
        return startLeftoverCommand(
          Model.make({ ...model, leftoverComment: '' }),
          CommentOnIssue({ issueId, summary }),
        )
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
        Model.make({
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
        Model.make({
          ...model,
          issueMutation: FailedIssueMutation.make({ reason }),
        }),
        [],
      ],
      SubmittedIssueWorkLogEntry: entry => {
        if (entry.summary.trim() === '') {
          return [
            Model.make({
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
        Model.make({
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
            Model.make({
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
      SubmittedIssueMention: ({ issueId, mention }) =>
        startLeftoverCommand(model, AddIssueMention({ issueId, mention })),
      SelectedIssueStatus: ({ issueId, status }) =>
        startLeftoverCommand(model, SetIssueStatus({ issueId, status })),
      ConfirmedIssueDeletion: ({ issueId }) =>
        startLeftoverCommand(model, DeleteIssue({ issueId })),
      SucceededDeleteIssue: ({ issue }) => {
        const [navigated, commands] = withNavigation(model, IssueList.make({}))
        return [
          Model.make({
            ...navigated,
            issueMutation: DeletedIssueMutation.make({ issue }),
            issues: removeIssue(navigated.issues, issue.id),
          }),
          commands,
        ]
      },
      FailedDeleteIssue: ({ reason }) => [
        Model.make({
          ...model,
          issueMutation: FailedIssueMutation.make({ reason }),
        }),
        [],
      ],
      LinkedCatalogIssue: ({ sourceIssueId, targetIssueId }) => {
        if (targetIssueId.trim() === '' || targetIssueId === sourceIssueId) {
          return [model, []]
        }
        return startLeftoverCommand(
          Model.make({ ...model, leftoverLink: '' }),
          LinkCatalogIssue({ sourceIssueId, targetIssueId }),
        )
      },
      ClickedLeftoverStatus: ({ issueId, status }) =>
        startLeftoverCommand(
          model,
          SetLeftoverStatus({ issueId, leftover: status }),
        ),
      SelectedProductFilter: ({ filter }) => [
        Model.make({ ...model, productFilter: filter }),
        [],
      ],
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
        Model.make({
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
          Model.make({
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
          Model.make({
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
          Model.make({
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
          Model.make({
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
