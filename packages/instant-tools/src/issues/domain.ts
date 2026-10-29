import {
  Array,
  Effect,
  Match as M,
  Option,
  Order,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
} from 'effect'

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
/** A reference to another Issue in the catalog. */
export const CatalogIssueReference = S.TaggedStruct('Issue', {
  id: S.String,
})
/**
 * The message a person typed to an agent, such as Michael's line in a Claude
 * Code chat: `{ harness: 'claude-code', sessionId: 'c863fc6a-…', messageId:
 * '82fc7bc4-…', typedAtMs: 1791713374021, note: 'Typed in the Claude chat.' }`.
 * Stored sources hold only the note, so every other key is optional and an
 * absent key stays absent when the reference is written back.
 */
export const ConversationMoment = S.Struct({
  harness: S.optionalKey(S.String),
  messageId: S.optionalKey(S.String),
  note: S.String,
  sessionId: S.optionalKey(S.String),
  typedAtMs: S.optionalKey(S.Number),
})
/** A reference to a message a person typed to an agent. */
export const ConversationReference = S.TaggedStruct('Conversation', {
  conversation: ConversationMoment,
})
/**
 * A stored reference whose shape no variant above models, kept verbatim so a
 * save writes it back unchanged. A writer that stores the reporter `"main"` or
 * `{ _tag: 'Conversation', conversation: { note } }` reads back as
 * `{ _tag: 'Unrecognized', value: "main" }`. Issue #591 lists the stored shapes
 * that made whole Issues unreadable before this variant existed.
 */
export const UnrecognizedReference = S.TaggedStruct('Unrecognized', {
  value: S.Union([
    S.String,
    S.Number,
    S.Boolean,
    S.Array(S.Json),
    S.Record(S.String, S.Json),
  ]),
})

const UnrecognizedReferenceFromStored = UnrecognizedReference.fields.value.pipe(
  S.decodeTo(
    UnrecognizedReference,
    SchemaTransformation.transform({
      decode: value => UnrecognizedReference.make({ value }),
      encode: reference => reference.value,
    }),
  ),
)

/** A polymorphic link from Issue data to one related artifact. */
export const IssueReference = S.Union([
  AgentReference,
  CatalogIssueReference,
  CommitReference,
  ConversationReference,
  MediaReference,
  ProjectReference,
  RecordingReference,
  ReleaseReference,
  UriReference,
  UnrecognizedReferenceFromStored,
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
  byteCount: S.OptionFromNullOr(S.Int).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  capturedAtMs: S.OptionFromNullOr(S.Number).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  contentType: S.String,
  fileName: S.String,
  id: S.String,
  issueId: S.String,
  kind: IssueAttachmentKind,
  sha256: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  source: IssueAttachmentSource,
})
/** One immutable media artifact attached to an Issue. */
export type IssueAttachment = typeof IssueAttachment.Type

/** One user or Agent report of an Issue. */
export const IssueMention = S.Struct({
  // NOTE: Writers store Mentions without a capture time, so it is optional (#591).
  capturedAtMs: S.OptionFromNullOr(S.Number).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  directQuote: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  id: S.String,
  issueId: S.String,
  // NOTE: Kept so a save from a Client does not drop a writer's note (#591).
  note: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
    S.withConstructorDefault(Effect.succeed(Option.none())),
  ),
  related: S.Array(IssueReference).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  reporter: S.OptionFromNullOr(IssueReference).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  source: IssueReference,
})
/** One user or Agent report of an Issue. */
export type IssueMention = typeof IssueMention.Type

/** One dated unit of work associated with an Issue. */
export const IssueWorkLogEntry = S.Struct({
  agentId: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  commitSha: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  durationSeconds: S.OptionFromNullOr(S.Int).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  id: S.String,
  occurredAtMs: S.Number,
  state: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  summary: S.String,
})
/** One dated unit of work associated with an Issue. */
export type IssueWorkLogEntry = typeof IssueWorkLogEntry.Type

const LegacyIssueWorkLogEntry = S.Struct({
  agent: S.optionalKey(S.String),
  agentId: S.optionalKey(S.String),
  atMs: S.optionalKey(S.Number),
  id: S.String,
  note: S.optionalKey(S.String),
  summary: S.optionalKey(S.String),
  timestampMs: S.optionalKey(S.Number),
})

/**
 * Reads a work-log row an older writer stored under other keys: `atMs` or
 * `timestampMs` for `occurredAtMs`, `note` for `summary`, and `agent` for
 * `agentId`. `{ id: 'work-1', atMs: 1785851462354, agent: 'claude-code', note:
 * 'Diagnosed' }` reads as an entry that occurred at 1785851462354. Without it
 * the Issues holding such rows could not be read at all (#591).
 */
const IssueWorkLogEntryFromLegacyKeys = LegacyIssueWorkLogEntry.pipe(
  S.decodeTo(
    IssueWorkLogEntry,
    SchemaTransformation.transformOrFail<
      typeof IssueWorkLogEntry.Encoded,
      typeof LegacyIssueWorkLogEntry.Type
    >({
      decode: legacy => {
        const maybeOccurredAtMs = Option.orElse(
          Option.fromUndefinedOr(legacy.atMs),
          () => Option.fromUndefinedOr(legacy.timestampMs),
        )
        const maybeSummary = Option.orElse(
          Option.fromUndefinedOr(legacy.summary),
          () => Option.fromUndefinedOr(legacy.note),
        )
        if (Option.isNone(maybeOccurredAtMs) || Option.isNone(maybeSummary)) {
          return Effect.fail(
            new SchemaIssue.InvalidValue(Option.some(legacy), {
              description:
                'Expected a work-log row with atMs or timestampMs and a summary or note',
            }),
          )
        }
        const maybeAgentId = Option.orElse(
          Option.fromUndefinedOr(legacy.agentId),
          () => Option.fromUndefinedOr(legacy.agent),
        )
        return Effect.succeed({
          agentId: Option.getOrNull(maybeAgentId),
          commitSha: null,
          durationSeconds: null,
          id: legacy.id,
          occurredAtMs: maybeOccurredAtMs.value,
          state: null,
          summary: maybeSummary.value,
        })
      },
      encode: entry =>
        Effect.succeed({
          ...(typeof entry.agentId === 'string'
            ? { agentId: entry.agentId }
            : {}),
          atMs: entry.occurredAtMs,
          id: entry.id,
          summary: entry.summary,
        }),
    }),
  ),
)

const IssueWorkLogEntryFromStored = S.Union([
  IssueWorkLogEntry,
  IssueWorkLogEntryFromLegacyKeys,
])

/** A closed kind of proof required to demonstrate that an Issue outcome succeeded. */
export const IssueSuccessEvidence = S.Literals([
  'Accessibility',
  'BuildProvenance',
  'CodeReview',
  'FocusedTest',
  'Log',
  'MultiDevice',
  'Performance',
  'Persistence',
  'PhysicalDeviceInteraction',
  'Research',
  'SimulatorInteraction',
  'Snapshot',
  'VisualComparison',
])
/** A kind of proof required to demonstrate that an Issue outcome succeeded. */
export type IssueSuccessEvidence = typeof IssueSuccessEvidence.Type

/** Compatibility alias for clients that distinguish the currently enumerated labels. */
export const KnownIssueSuccessEvidence = IssueSuccessEvidence
/** Compatibility alias for clients that distinguish the currently enumerated labels. */
export type KnownIssueSuccessEvidence = IssueSuccessEvidence

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
export const IssueComplexity = S.Literals([
  // NOTE: Stored Issues use Complex, and rejecting it hid them (#591).
  'Complex',
  'High',
  'Large',
  'Medium',
  'Moderate',
  'Small',
])
/** A coarse estimate used to keep unattended repair work bounded. */
export type IssueComplexity = typeof IssueComplexity.Type

const OptionalIssueString = S.OptionFromNullOr(S.String).pipe(
  S.withDecodingDefaultKey(Effect.succeed(null)),
)
const OptionalIssueComplexity = S.OptionFromNullOr(IssueComplexity).pipe(
  S.withDecodingDefaultKey(Effect.succeed(null)),
)

/** A subtask nobody has checked off yet. */
export const UncheckedSubtask = S.TaggedStruct('Unchecked', {})
/** A subtask checked off at `checkedAtMs`. */
export const CheckedSubtask = S.TaggedStruct('Checked', {
  checkedAtMs: S.Number,
})
/** Whether a subtask is checked off. */
export const IssueSubtaskState = S.Union([UncheckedSubtask, CheckedSubtask])
/** Whether a subtask is checked off. */
export type IssueSubtaskState = typeof IssueSubtaskState.Type

/**
 * One step of an Issue's work on its checklist, such as
 * `{ id: 'issue-835-subtask-1', title: 'Red tests', state: { _tag: 'Unchecked' } }`.
 */
export const IssueSubtask = S.Struct({
  id: S.String,
  state: IssueSubtaskState,
  title: S.String,
})
/** One step of an Issue's work on its checklist. */
export type IssueSubtask = typeof IssueSubtask.Type

/**
 * Where an Issue's code is on its way to a build: Exploring before any test,
 * Red once failing tests are committed, Green once they pass, Pushed once the
 * branch is on its remote, Merged once it is on main, Shipped once a build
 * holding it is installed.
 */
export const IssueLandingState = S.Literals([
  'Exploring',
  'Red',
  'Green',
  'Pushed',
  'Merged',
  'Shipped',
])
/** Where an Issue's code is on its way to a build. */
export type IssueLandingState = typeof IssueLandingState.Type

/** Someone is moving the work forward. */
export const ActiveWork = S.TaggedStruct('Active', {})
/** The work cannot move until something changes, such as "Waits on a review". */
export const StuckWork = S.TaggedStruct('Stuck', { reason: S.String })
/** Nobody will carry the work on, such as "Replaced by #804". */
export const AbandonedWork = S.TaggedStruct('Abandoned', { reason: S.String })
/** Whether an Issue's work is moving, stuck, or abandoned, and why. */
export const IssueWorkActivity = S.Union([ActiveWork, StuckWork, AbandonedWork])
/** Whether an Issue's work is moving, stuck, or abandoned, and why. */
export type IssueWorkActivity = typeof IssueWorkActivity.Type

/**
 * Where an Issue's work in progress is: branch `agent/claude/timeline-804` in
 * `realtime-voice`, its worktree and last commit, the build it targets (`106`),
 * its landing state, the last step and the agent that recorded it.
 */
export const IssueWorkInProgress = S.Struct({
  activity: IssueWorkActivity.pipe(
    S.withDecodingDefaultKey(Effect.succeed(ActiveWork.make({}))),
  ),
  agentId: OptionalIssueString,
  branch: OptionalIssueString,
  commitSha: OptionalIssueString,
  landingState: IssueLandingState,
  lastStep: OptionalIssueString,
  repository: OptionalIssueString,
  targetBuild: OptionalIssueString,
  updatedAtMs: S.Number,
  worktree: OptionalIssueString,
})
/** Where an Issue's work in progress is. */
export type IssueWorkInProgress = typeof IssueWorkInProgress.Type

/**
 * A file a branch changed and the lines git counted:
 * `{ path: 'packages/instant-tools/src/issues/domain.ts', insertions: 40, deletions: 2 }`.
 */
export const ChangedFile = S.TaggedStruct('Changed', {
  deletions: S.Number,
  insertions: S.Number,
  path: S.String,
})
/** A binary file a branch changed, such as `docs/shot.png`; git counts no lines in it. */
export const BinaryFile = S.TaggedStruct('Binary', { path: S.String })
/** A new file in the worktree that is not yet added to git. */
export const UntrackedFile = S.TaggedStruct('Untracked', { path: S.String })
/** One file a branch touches: changed with its line counts, binary, or untracked. */
export const IssueTouchedFile = S.Union([
  ChangedFile,
  BinaryFile,
  UntrackedFile,
])
/** One file a branch touches. */
export type IssueTouchedFile = typeof IssueTouchedFile.Type

/**
 * The files a worktree's branch touches against its main line, as git counted
 * them at `checkedAtMs`: `fileCount` is every file, `files` keeps the first
 * ones, such as 3 files touched against `technoplato/main`.
 */
export const IssueTouchedFiles = S.Struct({
  base: S.String,
  checkedAtMs: S.Number,
  fileCount: S.Number,
  files: S.Array(IssueTouchedFile),
})
/** The files a worktree's branch touches against its main line. */
export type IssueTouchedFiles = typeof IssueTouchedFiles.Type

/** The agent runs; `sinceMs` is when the tracker first saw it running. */
export const RunningAgent = S.TaggedStruct('Running', { sinceMs: S.Number })
/** The agent's run ended, and how, such as `done` or `exit 143`. */
export const EndedAgent = S.TaggedStruct('Ended', {
  how: S.String,
  sinceMs: S.Number,
})
/**
 * Nothing shows the claimant running and no recorded run of it ended either,
 * such as a hand-started session that went quiet twelve hours ago.
 */
export const StaleAgent = S.TaggedStruct('Stale', {
  reason: S.String,
  sinceMs: S.Number,
})
/** Whether the agent on an Issue runs, ended, or went stale. */
export const IssueAgentRun = S.Union([RunningAgent, EndedAgent, StaleAgent])
/** Whether the agent on an Issue runs, ended, or went stale. */
export type IssueAgentRun = typeof IssueAgentRun.Type

/**
 * The agent working on an Issue as the Mac last saw it
 * (`tools/agent-progress-check` and `agents-registry.json`):
 * `claude-code/issue-wip-1374@max` on account `max`, Running, on
 * branch `agent/claude/issue-wip-1374` in its worktree, with the files it
 * touches. Only `issues working sync` writes it.
 */
export const IssueAgentPresence = S.Struct({
  account: OptionalIssueString,
  agentId: S.String,
  branch: OptionalIssueString,
  harness: OptionalIssueString,
  run: IssueAgentRun,
  startedAtMs: S.OptionFromNullOr(S.Number).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  touchedFiles: S.OptionFromNullOr(IssueTouchedFiles).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  worktree: OptionalIssueString,
})
/** The agent working on an Issue as the Mac last saw it. */
export type IssueAgentPresence = typeof IssueAgentPresence.Type

/** A lossless human-readable source document imported into the Issue tracker. */
export const IssueSourceDocument = S.Struct({
  body: S.String,
  format: S.Literal('Markdown'),
  location: S.OptionFromNullOr(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
  ),
})
/** A lossless human-readable source document imported into the Issue tracker. */
export type IssueSourceDocument = typeof IssueSourceDocument.Type

/** A transport-independent Issue with durable evidence and work history. */
export const Issue = S.Struct({
  agentPresence: S.OptionFromNullOr(IssueAgentPresence).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
    S.withConstructorDefault(Effect.succeed(Option.none())),
  ),
  area: OptionalIssueString,
  attachments: S.Array(IssueAttachment),
  /**
   * Where `issues rank` placed the Issue within its priority, on the same axis
   * as `createdAtMs`: an Issue ranked between two filed on Monday and Tuesday
   * holds a Monday-night time. None keeps it in age order.
   */
  backlogRank: S.OptionFromNullOr(S.Number).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
    S.withConstructorDefault(Effect.succeed(Option.none())),
  ),
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
  // NOTE: 329 stored Issues name their related Issues here, beside the Mentions.
  relatedIssueIds: S.Array(S.String).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  reportedDate: OptionalIssueString,
  sourceDocument: S.OptionFromNullOr(IssueSourceDocument),
  status: IssueStatus,
  subtasks: S.Array(IssueSubtask).pipe(
    S.withDecodingDefaultKey(Effect.succeed([])),
    S.withConstructorDefault(Effect.succeed([])),
  ),
  successCriteria: IssueSuccessCriteria,
  title: S.String,
  updatedAtMs: S.Number,
  viewerURL: OptionalIssueString,
  workInProgress: S.OptionFromNullOr(IssueWorkInProgress).pipe(
    S.withDecodingDefaultKey(Effect.succeed(null)),
    S.withConstructorDefault(Effect.succeed(Option.none())),
  ),
  workLog: S.Array(IssueWorkLogEntryFromStored),
})
/** A transport-independent Issue with durable evidence and work history. */
export type Issue = typeof Issue.Type

/**
 * True while an Issue's work is Green or Pushed and not abandoned: tested and
 * waiting to merge. Work that is stuck still counts, so a reader sees what
 * holds it; Merged and Shipped work has landed.
 */
export const isCloseToLanding = (issue: Issue): boolean =>
  Option.exists(
    issue.workInProgress,
    work =>
      (work.landingState === 'Green' || work.landingState === 'Pushed') &&
      work.activity._tag !== 'Abandoned',
  )

/** True while the agent on an Issue runs, as `issues working sync` last saw it. */
export const isWorkingNow = (issue: Issue): boolean =>
  Option.exists(
    issue.agentPresence,
    presence => presence.run._tag === 'Running',
  )

/**
 * Orders Issues newest first by `createdAtMs`, then by descending `id` when two
 * Issues share a creation time. Issue `584` created at 07:05 sorts before Issue
 * `575` created at 00:05. The tracker sorts with it before applying a query
 * limit, so a capped read keeps the newest Issues instead of the oldest (#591).
 */
export const IssueNewestFirst: Order.Order<Issue> = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (issue: Issue) => issue.createdAtMs),
  Order.mapInput(Order.flip(Order.String), (issue: Issue) => issue.id),
)

const issueNumberPadding = 3
const issueReferencePrefix = /^issue\s*#?\s*/i

/**
 * Reads an Issue number in the spellings agents write and prints it the way
 * the tracker stores it: digits, zero-padded to three below 1,000. `'92'`,
 * `'#92'`, and `'issue 92'` all read as `'092'`; `'1001'` stays `'1001'`.
 * Anything else, such as `'issue-041'` or `'0'`, is not an Issue number.
 */
export const normalizeIssueId = (value: string): Option.Option<string> => {
  const withoutPrefix = value.trim().replace(issueReferencePrefix, '')
  const digits = withoutPrefix.startsWith('#')
    ? withoutPrefix.slice(1).trim()
    : withoutPrefix
  if (!/^\d+$/.test(digits)) {
    return Option.none()
  }
  const number = Number(digits)
  if (!Number.isSafeInteger(number) || number <= 0) {
    return Option.none()
  }
  return Option.some(String(number).padStart(issueNumberPadding, '0'))
}

/**
 * The number after the highest Issue number in use, past any gap. Numbers in
 * use `['001', '153', '692']` give `'693'`; ids that are not numbers, such as
 * `'issue-preview'`, are ignored, so an empty tracker starts at `'001'`.
 */
export const nextIssueId = (issueIds: ReadonlyArray<string>): string => {
  const highest = Array.reduce(issueIds, 0, (current, issueId) =>
    Option.match(normalizeIssueId(issueId), {
      onNone: () => current,
      onSome: normalized => Math.max(current, Number(normalized)),
    }),
  )
  return String(highest + 1).padStart(issueNumberPadding, '0')
}

/**
 * Where people read Issues: the issues site behind Cloudflare Access. Page
 * loads on its old name, `https://issues.knophy.com`, redirect here.
 */
export const ISSUE_VIEWER_ORIGIN = 'https://issues.pisspoursoftware.xyz'

/**
 * The page of one Issue on the issues site: `issueViewerUrl('692')` is
 * `https://issues.pisspoursoftware.xyz/issues/692`.
 */
export const issueViewerUrl = (issueId: string): string =>
  `${ISSUE_VIEWER_ORIGIN}/issues/${issueId}`

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
    updatedAtMs: Math.max(
      issue.updatedAtMs,
      Option.getOrElse(mention.capturedAtMs, () => issue.updatedAtMs),
    ),
  })

  if (isRepeatedMention) {
    return AcceptedAndEscalated.make({ issue: nextIssue })
  } else {
    return Accepted.make({ issue: nextIssue })
  }
}
