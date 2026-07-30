import { Array, Effect, Match as M, Schema as S } from 'effect'

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
  'FeedbackRequested',
  'Fixed',
  'InProgress',
  'Open',
  'PartiallyDone',
  'Planned',
  'Regressed',
  'Resolved',
  'VerificationNeeded',
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

/** One first-class application or library available as an Issue filing domain. */
export const ProductCatalogEntry = S.Struct({
  product: TrackedProduct,
  updatedAtMs: S.Number,
})
/** One first-class application or library available as an Issue filing domain. */
export type ProductCatalogEntry = typeof ProductCatalogEntry.Type

/** The exact position in one Recording where an Issue was reported. */
export const RecordingMention = S.Struct({
  endMilliseconds: S.OptionFromNullOr(S.Int),
  recordingId: S.String,
  screenshotIds: S.Array(S.String),
  startMilliseconds: S.Int,
})
/** The exact position in one Recording where an Issue was reported. */
export type RecordingMention = typeof RecordingMention.Type

/** One independently shareable excerpt from a longer Recording. */
export const RecordingSegment = S.Struct({
  createdAtMs: S.Number,
  endMilliseconds: S.Int,
  id: S.String,
  publicUrl: S.OptionFromNullOr(S.String),
  recordingId: S.String,
  startMilliseconds: S.Int,
  transcript: S.String,
})
/** One independently shareable excerpt from a longer Recording. */
export type RecordingSegment = typeof RecordingSegment.Type

/** The review state of a transcript-derived Issue candidate. */
export const TriageCandidateStatus = S.Literals([
  'Draft',
  'Dismissed',
  'Promoted',
])
/** The review state of a transcript-derived Issue candidate. */
export type TriageCandidateStatus = typeof TriageCandidateStatus.Type

/** A transcript-derived draft that cannot become an Issue without promotion. */
export const TriageCandidate = S.Struct({
  createdAtMs: S.Number,
  id: S.String,
  product: TrackedProduct,
  segment: RecordingSegment,
  status: TriageCandidateStatus,
  suggestedDetails: S.String,
  suggestedPriority: IssuePriority,
  suggestedTitle: S.String,
  updatedAtMs: S.Number,
})
/** A transcript-derived draft that cannot become an Issue without promotion. */
export type TriageCandidate = typeof TriageCandidate.Type

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

/** The media kind of an Issue attachment. */
export const IssueAttachmentKind = S.Literals([
  'Audio',
  'File',
  'Screenshot',
  'Video',
])
/** The media kind of an Issue attachment. */
export type IssueAttachmentKind = typeof IssueAttachmentKind.Type

/** An Issue attachment stored by Instant. */
export const InstantStorageAttachmentSource = S.TaggedStruct('InstantStorage', {
  fileId: S.String,
})
/** An Issue attachment captured in one Recording. */
export const RecordingAttachmentSource = S.TaggedStruct('Recording', {
  mediaId: S.OptionFromNullOr(S.String),
  recordingId: S.String,
})
/** An Issue attachment retained with the repository issue catalog. */
export const RepositoryAttachmentSource = S.TaggedStruct('Repository', {
  path: S.String,
})
/** An Issue attachment addressed by URI. */
export const UriAttachmentSource = S.TaggedStruct('Uri', {
  value: S.String,
})

/** The durable origin of an Issue attachment. */
export const IssueAttachmentSource = S.Union([
  InstantStorageAttachmentSource,
  RecordingAttachmentSource,
  RepositoryAttachmentSource,
  UriAttachmentSource,
])
/** The durable origin of an Issue attachment. */
export type IssueAttachmentSource = typeof IssueAttachmentSource.Type

/** One immutable media artifact attached to an Issue. */
export const IssueAttachment = S.Struct({
  byteCount: S.OptionFromNullOr(S.Int),
  capturedAtMs: S.OptionFromNullOr(S.Number),
  contentType: S.String,
  fileName: S.String,
  id: S.String,
  issueId: S.String,
  kind: IssueAttachmentKind,
  sha256: S.OptionFromNullOr(S.String),
  source: IssueAttachmentSource,
})
/** One immutable media artifact attached to an Issue. */
export type IssueAttachment = typeof IssueAttachment.Type

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

/** A kind of proof required to demonstrate that an Issue outcome succeeded. */
export const IssueSuccessEvidence = S.Literals([
  'Accessibility',
  'BuildProvenance',
  'FocusedTest',
  'Log',
  'Persistence',
  'PhysicalDeviceInteraction',
  'SimulatorInteraction',
  'VisualComparison',
])
/** A kind of proof required to demonstrate that an Issue outcome succeeded. */
export type IssueSuccessEvidence = typeof IssueSuccessEvidence.Type

/** One independently checkable user-visible outcome and its required proof. */
export const IssueSuccessCriterion = S.Struct({
  id: S.String,
  isSatisfied: S.Boolean.pipe(
    S.withDecodingDefaultKey(Effect.succeed(false)),
    S.withConstructorDefault(Effect.succeed(false)),
  ),
  outcome: S.String,
  requiredEvidence: S.Array(IssueSuccessEvidence),
})
/** One independently checkable user-visible outcome and its required proof. */
export type IssueSuccessCriterion = typeof IssueSuccessCriterion.Type

const IssueSuccessCriteria = S.Array(IssueSuccessCriterion).pipe(
  S.withDecodingDefaultKey(Effect.succeed([])),
  S.withConstructorDefault(Effect.succeed([])),
)

/** A stable Instant query embedded in an Issue for direct log evidence retrieval. */
export const IssueLogEvidenceQuery = S.Struct({
  id: S.String,
  instantQueryJSON: S.String,
  issueID: S.String,
  label: S.String,
  viewerURL: S.String,
})
/** A stable Instant query embedded in an Issue for direct log evidence retrieval. */
export type IssueLogEvidenceQuery = typeof IssueLogEvidenceQuery.Type

const IssueLogEvidenceQueries = S.Array(IssueLogEvidenceQuery).pipe(
  S.withDecodingDefaultKey(Effect.succeed([])),
  S.withConstructorDefault(Effect.succeed([])),
)

/** A coarse estimate used to keep unattended repair work bounded. */
export const IssueComplexity = S.Literals(['Small', 'Moderate', 'Large'])
/** A coarse estimate used to keep unattended repair work bounded. */
export type IssueComplexity = typeof IssueComplexity.Type

const OptionalIssueString = S.OptionFromNullOr(S.String).pipe(
  S.withDecodingDefaultKey(Effect.succeed(null)),
)
const OptionalIssueComplexity = S.OptionFromNullOr(IssueComplexity).pipe(
  S.withDecodingDefaultKey(Effect.succeed(null)),
)

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
  area: OptionalIssueString,
  attachments: S.Array(IssueAttachment),
  claimantId: OptionalIssueString,
  complexity: OptionalIssueComplexity,
  createdAtMs: S.Number,
  details: S.String,
  evidenceLogQueries: IssueLogEvidenceQueries,
  id: S.String,
  issueType: OptionalIssueString,
  mentions: S.Array(IssueMention),
  nightlyEligible: S.Boolean.pipe(
    S.withDecodingDefaultKey(Effect.succeed(true)),
    S.withConstructorDefault(Effect.succeed(true)),
  ),
  priority: IssuePriority,
  product: TrackedProduct,
  projectId: S.OptionFromNullOr(S.String),
  reportedDate: OptionalIssueString,
  sourceDocument: S.OptionFromNullOr(IssueSourceDocument),
  status: IssueStatus,
  successCriteria: IssueSuccessCriteria,
  title: S.String,
  updatedAtMs: S.Number,
  viewerURL: OptionalIssueString,
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
