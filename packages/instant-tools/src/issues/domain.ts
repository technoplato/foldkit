import { Array, Match as M, Schema as S } from 'effect'

/** The urgency of an Issue, ordered from immediate P0 to eventual P4. */
export const IssuePriority = S.Literals(['P0', 'P1', 'P2', 'P3', 'P4'])
/** The urgency of an Issue, ordered from immediate P0 to eventual P4. */
export type IssuePriority = typeof IssuePriority.Type

/** The workflow state of an Issue without imposing one project-management service. */
export const IssueStatus = S.Literals([
  'Addressing',
  'Backlog',
  'Blocked',
  'Closed',
  'InProgress',
  'Open',
  'Resolved',
  'Verified',
])
/** The workflow state of an Issue without imposing one project-management service. */
export type IssueStatus = typeof IssueStatus.Type

/** An application that owns Projects and Issues. */
export const ApplicationProduct = S.TaggedStruct('Application', {
  id: S.String,
  name: S.String,
})
/** A library that owns Projects and Issues. */
export const LibraryProduct = S.TaggedStruct('Library', {
  id: S.String,
  name: S.String,
})

/** An application or library that owns Projects and Issues. */
export const TrackedProduct = S.Union([ApplicationProduct, LibraryProduct])
/** An application or library that owns Projects and Issues. */
export type TrackedProduct = typeof TrackedProduct.Type

/** The exact position in one Recording where an Issue was reported. */
export const RecordingMention = S.Struct({
  endMilliseconds: S.OptionFromNullOr(S.Int),
  recordingId: S.String,
  screenshotIds: S.Array(S.String),
  startMilliseconds: S.Int,
})
/** The exact position in one Recording where an Issue was reported. */
export type RecordingMention = typeof RecordingMention.Type

/** A reference to an Agent. */
export const AgentReference = S.TaggedStruct('Agent', {
  id: S.String,
})
/** A reference to an immutable repository Commit. */
export const CommitReference = S.TaggedStruct('Commit', {
  repository: S.String,
  sha: S.String,
})
/** A reference to supporting Media. */
export const MediaReference = S.TaggedStruct('Media', {
  id: S.String,
  kind: S.String,
})
/** A reference to a Project owned by an application or library. */
export const ProjectReference = S.TaggedStruct('Project', {
  productId: S.String,
  projectId: S.String,
})
/** A reference to an exact Recording location. */
export const RecordingReference = S.TaggedStruct('Recording', {
  recording: RecordingMention,
})
/** A reference to a released version of an application or library. */
export const ReleaseReference = S.TaggedStruct('Release', {
  productId: S.String,
  version: S.String,
})
/** A reference to an externally addressable resource. */
export const UriReference = S.TaggedStruct('Uri', {
  value: S.String,
})

/** A polymorphic link from Issue data to one related artifact. */
export const IssueReference = S.Union([
  AgentReference,
  CommitReference,
  MediaReference,
  ProjectReference,
  RecordingReference,
  ReleaseReference,
  UriReference,
])
/** A polymorphic link from Issue data to one related artifact. */
export type IssueReference = typeof IssueReference.Type

/** One user or Agent report of an Issue. */
export const IssueMention = S.Struct({
  capturedAtMs: S.Number,
  directQuote: S.OptionFromNullOr(S.String),
  id: S.String,
  issueId: S.String,
  related: S.Array(IssueReference),
  reporter: S.OptionFromNullOr(IssueReference),
  source: IssueReference,
})
/** One user or Agent report of an Issue. */
export type IssueMention = typeof IssueMention.Type

/** One dated unit of work associated with an Issue. */
export const IssueWorkLogEntry = S.Struct({
  agentId: S.OptionFromNullOr(S.String),
  commitSha: S.OptionFromNullOr(S.String),
  durationSeconds: S.OptionFromNullOr(S.Int),
  id: S.String,
  occurredAtMs: S.Number,
  state: S.OptionFromNullOr(S.String),
  summary: S.String,
})
/** One dated unit of work associated with an Issue. */
export type IssueWorkLogEntry = typeof IssueWorkLogEntry.Type

/** A lossless human-readable source document imported into the Issue tracker. */
export const IssueSourceDocument = S.Struct({
  body: S.String,
  format: S.Literal('Markdown'),
  location: S.OptionFromNullOr(S.String),
})
/** A lossless human-readable source document imported into the Issue tracker. */
export type IssueSourceDocument = typeof IssueSourceDocument.Type

/** A transport-independent Issue with durable evidence and work history. */
export const Issue = S.Struct({
  createdAtMs: S.Number,
  details: S.String,
  id: S.String,
  mentions: S.Array(IssueMention),
  priority: IssuePriority,
  product: TrackedProduct,
  projectId: S.OptionFromNullOr(S.String),
  sourceDocument: S.OptionFromNullOr(IssueSourceDocument),
  status: IssueStatus,
  title: S.String,
  updatedAtMs: S.Number,
  workLog: S.Array(IssueWorkLogEntry),
})
/** A transport-independent Issue with durable evidence and work history. */
export type Issue = typeof Issue.Type

/** A first unique Mention was recorded at the Issue's baseline priority. */
export const Accepted = S.TaggedStruct('Accepted', {
  issue: Issue,
})
/** A later unique Mention was recorded and moved the Issue one step toward P0. */
export const AcceptedAndEscalated = S.TaggedStruct('AcceptedAndEscalated', {
  issue: Issue,
})
/** A retried Mention was ignored because its identity was already recorded. */
export const Duplicate = S.TaggedStruct('Duplicate', {
  issue: Issue,
})
/** A Mention was ignored because it named a different Issue. */
export const WrongIssue = S.TaggedStruct('WrongIssue', {
  issue: Issue,
})

/** The result of trying to record one Issue Mention. */
export const IssueMentionRegistration = S.Union([
  Accepted,
  AcceptedAndEscalated,
  Duplicate,
  WrongIssue,
])
/** The result of trying to record one Issue Mention. */
export type IssueMentionRegistration = typeof IssueMentionRegistration.Type

/** Moves one priority step toward P0 and saturates there. */
export const escalatePriority = (priority: IssuePriority): IssuePriority =>
  M.value(priority).pipe(
    M.withReturnType<IssuePriority>(),
    M.when('P0', () => 'P0'),
    M.when('P1', () => 'P0'),
    M.when('P2', () => 'P1'),
    M.when('P3', () => 'P2'),
    M.when('P4', () => 'P3'),
    M.exhaustive,
  )

/** Records one unique Mention and escalates only when an earlier Mention exists. */
export const registerMention = (
  issue: Issue,
  mention: IssueMention,
): IssueMentionRegistration => {
  if (mention.issueId !== issue.id) {
    return WrongIssue.make({ issue })
  }

  const isDuplicate = Array.some(
    issue.mentions,
    existingMention => existingMention.id === mention.id,
  )
  if (isDuplicate) {
    return Duplicate.make({ issue })
  }

  const isRepeatedMention = Array.isReadonlyArrayNonEmpty(issue.mentions)
  const nextIssue = Issue.make({
    ...issue,
    mentions: Array.append(issue.mentions, mention),
    priority: isRepeatedMention
      ? escalatePriority(issue.priority)
      : issue.priority,
    updatedAtMs: Math.max(issue.updatedAtMs, mention.capturedAtMs),
  })

  if (isRepeatedMention) {
    return AcceptedAndEscalated.make({ issue: nextIssue })
  } else {
    return Accepted.make({ issue: nextIssue })
  }
}
