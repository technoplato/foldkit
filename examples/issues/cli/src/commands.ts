import {
  Array,
  Effect,
  Layer,
  Match as M,
  Option,
  Order,
  Ref,
  Result,
  Schema as S,
} from 'effect'
import {
  type AgentSurvey,
  ClearedIssueWorkInProgress,
  ComposedIssueDraft,
  ConfirmedIssueDeletion,
  DraftMention,
  DraftSuccessCriterion,
  DraftWorkLogEntry,
  FileIssue,
  IssueDetail,
  IssueDraft,
  IssueList,
  type IssueTrackerResources,
  LinkedCatalogIssue,
  type Message,
  type Model,
  ObservedAgentSurvey,
  type RankPlacement,
  SelectedIssueStatus,
  SubmittedIssue,
  SubmittedIssueAttachment,
  SubmittedIssueEdit,
  SubmittedIssueMention,
  SubmittedIssueRank,
  SubmittedIssueSubtasks,
  SubmittedIssueSuccessCriterion,
  SubmittedIssueWorkInProgress,
  SubmittedIssueWorkLogEntry,
  SubmittedProduct,
  SubmittedSubtaskMarks,
  SubmittedSuccessCriteriaMarks,
  type SubtaskMark,
  WorkInProgressEdit,
  backlogIssues,
  backlogOf,
  catalogIssueIds,
  describeIssueReference,
  issueFromDraft,
  landingSummary,
  laneHeading,
  nowWorkingLines,
  observedIssue,
  placeInBacklog,
  rankAfter,
  rankBefore,
  rankTop,
  sectionHeading,
  subtaskProgress,
  workInProgressLines,
  worktreeToCount,
} from 'issues-core-example'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { decodeIssueRecord } from '@foldkit/instant-tools/instant'
import {
  AbandonedWork,
  ActiveWork,
  ApplicationProduct,
  InstantStorageAttachmentSource,
  Issue,
  IssueAttachment,
  IssueAttachmentKind,
  IssueLandingState,
  IssueMention,
  IssuePriority,
  type IssueReference,
  IssueReference as IssueReferenceSchema,
  IssueStatus,
  type IssueSubtask,
  IssueSuccessEvidence,
  type IssueTouchedFiles,
  type IssueWorkActivity,
  IssueWorkInProgress,
  LibraryProduct,
  StuckWork,
  type TrackedProduct,
  UriAttachmentSource,
  describeIssueTrackerCause,
  isCloseToLanding,
  isWorkingNow,
  issueViewerUrl,
  normalizeIssueId,
} from '@foldkit/instant-tools/issues'

import {
  IssuesCommandFailure,
  executeMessages,
  withCatalogStatuses,
} from './host.js'
import {
  type ResolvedSaid,
  type SaidImageKind,
  findRecordingFolder,
  resolveSaid,
  typedMention,
} from './mentions.js'
import { type IssueRecordsService } from './resources.js'
import { issueIdsToCheck, surveyFromProgressCheck } from './working.js'

export { resolveSaid, resolveSaidMention, typedMention } from './mentions.js'

const SUCCEEDED_EXIT_CODE = 0
const FAILED_EXIT_CODE = 1
const USAGE_EXIT_CODE = 2
const MISSING_EXIT_CODE = 3
const RECORDING_ID_PREFIX_LENGTH = 8

/**
 * The issue types the tracker holds, as `scripts/instant-tools.mjs` enforced
 * them before `issues` replaced it.
 */
export const issueTypes: ReadonlyArray<string> = [
  'architecture',
  'defect',
  'enhancement',
  'feature',
  'infrastructure',
  'investigation',
  'process',
  'product direction',
  'prototype',
]

/**
 * Instant storage for Issue files: upload one, link it to the Issue's record,
 * remove it again, and download one by its storage path.
 */
export type IssueFilesService = Readonly<{
  download: (path: string) => Effect.Effect<Uint8Array, unknown>
  link: (
    input: Readonly<{ entityId: string; fileId: string }>,
  ) => Effect.Effect<void, unknown>
  remove: (
    input: Readonly<{ fileId: string; path: string }>,
  ) => Effect.Effect<void, unknown>
  upload: (
    input: Readonly<{
      bytes: Uint8Array
      contentType: string
      fileName: string
      path: string
    }>,
  ) => Effect.Effect<string, unknown>
}>

/** Everything a command needs from the machine it runs on. */
export type IssuesHost = Readonly<{
  backupDirectory: string
  /**
   * The files a worktree's branch touches against its main line, from git;
   * None when the worktree is gone or git cannot read it.
   */
  countTouchedFiles: (
    worktree: string,
  ) => Effect.Effect<Option.Option<IssueTouchedFiles>>
  defaultAgent: string
  files: IssueFilesService
  mirrorRoot: string
  nowMs: () => number
  readStandardInput: Effect.Effect<string>
  readTextFile: (path: string) => Effect.Effect<string, unknown>
  records: IssueRecordsService
  resources: Layer.Layer<IssueTrackerResources>
}>

/** What a command prints and the exit code it ends with. */
export type IssuesOutcome = Readonly<{
  exitCode: number
  stderr: ReadonlyArray<string>
  stdout: ReadonlyArray<string>
}>

const MINIMUM_CREDENTIAL_LENGTH = 8

const REDACTED_CREDENTIAL = '[redacted]'

/**
 * The outcome with every credential the host holds replaced by
 * `[redacted]`, so nothing printed names one, however Instant words a
 * failure. A value shorter than any real credential is never searched for.
 */
export const redactCredentials = (
  outcome: IssuesOutcome,
  credentials: ReadonlyArray<string>,
): IssuesOutcome => {
  const searchedCredentials = Array.filter(
    credentials,
    credential => credential.length >= MINIMUM_CREDENTIAL_LENGTH,
  )
  const redactLine = (line: string): string =>
    Array.reduce(searchedCredentials, line, (redactedLine, credential) =>
      redactedLine.replaceAll(credential, REDACTED_CREDENTIAL),
    )
  return {
    exitCode: outcome.exitCode,
    stderr: Array.map(outcome.stderr, redactLine),
    stdout: Array.map(outcome.stdout, redactLine),
  }
}

const succeeded = (stdout: ReadonlyArray<string>): IssuesOutcome => ({
  exitCode: SUCCEEDED_EXIT_CODE,
  stderr: [],
  stdout,
})

const usage = (message: string) =>
  new IssuesCommandFailure({ exitCode: USAGE_EXIT_CODE, message })

const failed = (command: string, reason: string) =>
  new IssuesCommandFailure({
    exitCode: FAILED_EXIT_CODE,
    message: `issues ${command} failed: ${reason}`,
  })

const missing = (issueId: string) =>
  new IssuesCommandFailure({
    exitCode: MISSING_EXIT_CODE,
    message: `Issue #${issueId} does not exist.`,
  })

const describeMissingIssues = (
  issueIds: Array.NonEmptyReadonlyArray<string>,
): string => {
  const numbers = Array.join(
    Array.map(issueIds, issueId => `#${issueId}`),
    ', ',
  )
  return issueIds.length === 1
    ? `Issue ${numbers} does not exist`
    : `Issues ${numbers} do not exist`
}

/**
 * Fails with exit code 3 when any of the Issue numbers names no stored
 * Issue, so a mistyped number never becomes a link to nothing.
 */
const requireExistingIssues = (
  host: IssuesHost,
  command: string,
  issueIds: ReadonlyArray<string>,
  consequence: string,
): Effect.Effect<void, IssuesCommandFailure> =>
  Effect.forEach(issueIds, issueId =>
    host.records.fetchIssueRecordsById(issueId).pipe(
      Effect.map(records =>
        Array.isReadonlyArrayEmpty(records)
          ? Option.some(issueId)
          : Option.none(),
      ),
      Effect.mapError(cause =>
        failed(command, describeIssueTrackerCause(cause)),
      ),
    ),
  ).pipe(
    Effect.flatMap(maybeMissingIssueIds =>
      Array.match(Array.getSomes(maybeMissingIssueIds), {
        onEmpty: () => Effect.void,
        onNonEmpty: missingIssueIds =>
          Effect.fail(
            new IssuesCommandFailure({
              exitCode: MISSING_EXIT_CODE,
              message: `${describeMissingIssues(missingIssueIds)}; ${consequence}`,
            }),
          ),
      }),
    ),
  )

const finish = (
  effect: Effect.Effect<IssuesOutcome, IssuesCommandFailure>,
): Effect.Effect<IssuesOutcome> =>
  effect.pipe(
    Effect.catchTag('IssuesCommandFailure', failure =>
      Effect.succeed({
        exitCode: failure.exitCode,
        stderr: [failure.message],
        stdout: [],
      }),
    ),
  )

/** The canonical web address of one Issue on issues. */
export const issueUrl = (issueId: string): string => issueViewerUrl(issueId)

const parseIssueNumber = (
  text: string,
): Effect.Effect<string, IssuesCommandFailure> =>
  Option.match(normalizeIssueId(text), {
    onNone: () =>
      Effect.fail(
        usage(
          `"${text}" is not an Issue number. Write it as digits, such as 692 or #692.`,
        ),
      ),
    onSome: Effect.succeed,
  })

const splitList = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.flatMap(values, value =>
    Array.filter(value.split(/[\s,]+/), part => part !== ''),
  )

const parseChoice = <A extends string>(
  kind: string,
  text: string,
  choices: ReadonlyArray<A>,
): Effect.Effect<A, IssuesCommandFailure> =>
  Option.match(
    Array.findFirst(
      choices,
      choice => choice.toLowerCase() === text.trim().toLowerCase(),
    ),
    {
      onNone: () =>
        Effect.fail(
          usage(
            `"${text}" is not a ${kind}. Valid: ${Array.join(choices, ', ')}.`,
          ),
        ),
      onSome: Effect.succeed,
    },
  )

const parseOptionalChoice = <A extends string>(
  kind: string,
  maybeText: Option.Option<string>,
  choices: ReadonlyArray<A>,
): Effect.Effect<Option.Option<A>, IssuesCommandFailure> =>
  Option.match(maybeText, {
    onNone: () => Effect.succeed(Option.none<A>()),
    onSome: text => Effect.map(parseChoice(kind, text, choices), Option.some),
  })

const statuses = IssueStatus.literals
const priorities = IssuePriority.literals
const evidenceKinds = IssueSuccessEvidence.literals
const landingStates = IssueLandingState.literals

const parseIssueNumbers = (
  values: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, IssuesCommandFailure> =>
  Effect.map(Effect.forEach(splitList(values), parseIssueNumber), Array.dedupe)

// INPUT

const JsonReference = S.Union([S.String, S.Number])

const JsonMentionInput = S.Struct({
  capturedAtMs: S.optionalKey(S.NullOr(S.Number)),
  directQuote: S.optionalKey(S.NullOr(S.String)),
  note: S.optionalKey(S.NullOr(S.String)),
  related: S.optionalKey(S.Array(IssueReferenceSchema)),
  reporter: S.optionalKey(S.NullOr(IssueReferenceSchema)),
  source: IssueReferenceSchema,
})

const JsonDraftInput = S.Struct({
  area: S.optionalKey(S.NullOr(S.String)),
  claimantId: S.optionalKey(S.NullOr(S.String)),
  details: S.optionalKey(S.String),
  id: S.optionalKey(S.Unknown),
  issueType: S.optionalKey(S.NullOr(S.String)),
  mentions: S.optionalKey(S.Array(JsonMentionInput)),
  priority: S.optionalKey(S.String),
  product: S.optionalKey(
    S.Union([
      S.String,
      S.Struct({ id: S.String, name: S.optionalKey(S.String) }),
    ]),
  ),
  relatedIssueIds: S.optionalKey(S.Array(JsonReference)),
  status: S.optionalKey(S.String),
  successCriteria: S.optionalKey(
    S.Array(
      S.Struct({
        outcome: S.String,
        requiredEvidence: S.optionalKey(S.Array(S.String)),
      }),
    ),
  ),
  title: S.optionalKey(S.String),
  type: S.optionalKey(S.String),
  workLog: S.optionalKey(
    S.Array(
      S.Struct({
        agentId: S.optionalKey(S.NullOr(S.String)),
        commitSha: S.optionalKey(S.NullOr(S.String)),
        occurredAtMs: S.optionalKey(S.Number),
        state: S.optionalKey(S.NullOr(S.String)),
        summary: S.String,
      }),
    ),
  ),
})
type JsonDraftInput = typeof JsonDraftInput.Type

const emptyJsonDraft: JsonDraftInput = {}

/** Everything `issues file` reads from its flags. */
export type FileInput = Readonly<{
  agent: Option.Option<string>
  area: Option.Option<string>
  claim: Option.Option<string>
  criteria: ReadonlyArray<string>
  details: Option.Option<string>
  dryRun: boolean
  evidence: ReadonlyArray<string>
  /** Files to attach beside the pictures `--said` brings, such as a mockup (`--image`). */
  images: ReadonlyArray<string>
  isJson: boolean
  /** `--no-images`: quote the lines, attach none of their pictures. */
  isWithoutImages: boolean
  jsonInput: Option.Option<string>
  log: Option.Option<string>
  logState: Option.Option<string>
  priority: Option.Option<string>
  product: Option.Option<string>
  related: ReadonlyArray<string>
  said: ReadonlyArray<string>
  status: Option.Option<string>
  title: Option.Option<string>
  type: Option.Option<string>
  typed: Option.Option<string>
  typedAt: Option.Option<string>
  typedMessage: Option.Option<string>
  typedSession: Option.Option<string>
}>

const readJsonDraft = (
  host: IssuesHost,
  maybeSource: Option.Option<string>,
): Effect.Effect<JsonDraftInput, IssuesCommandFailure> =>
  Option.match(maybeSource, {
    onNone: () => Effect.succeed(emptyJsonDraft),
    onSome: source =>
      Effect.gen(function* () {
        const text =
          source === '-'
            ? yield* host.readStandardInput
            : yield* Effect.try({
                try: () => readFileSync(source, 'utf8'),
                catch: cause =>
                  usage(
                    `--from-json ${source} could not be read: ${describeIssueTrackerCause(cause)}`,
                  ),
              })
        return yield* S.decodeUnknownEffect(S.fromJsonString(JsonDraftInput))(
          text,
        ).pipe(
          Effect.mapError(cause =>
            usage(
              `--from-json ${source} is not an Issue draft: ${describeIssueTrackerCause(cause)}`,
            ),
          ),
        )
      }),
  })

const firstSome = <A>(
  ...options: ReadonlyArray<Option.Option<A>>
): Option.Option<A> => Option.flatten(Array.findFirst(options, Option.isSome))

const jsonOptional = <A>(value: A | null | undefined): Option.Option<A> =>
  Option.fromNullishOr(value)

const parseCriterion = (
  outcome: string,
  evidence: ReadonlyArray<string>,
): Effect.Effect<DraftSuccessCriterion, IssuesCommandFailure> =>
  Effect.map(
    Effect.forEach(
      Array.match(splitList(evidence), {
        onEmpty: () => ['FocusedTest'],
        onNonEmpty: kinds => kinds,
      }),
      kind => parseChoice('kind of evidence', kind, evidenceKinds),
    ),
    requiredEvidence =>
      DraftSuccessCriterion.make({ outcome, requiredEvidence }),
  )

const jsonProductReference = (
  product: JsonDraftInput['product'],
): Option.Option<string> =>
  Option.map(Option.fromUndefinedOr(product), value =>
    typeof value === 'string' ? value : value.id,
  )

/** Builds the draft `issues file` submits from its flags and `--from-json`. */
export const composeDraft = (
  host: IssuesHost,
  input: FileInput,
  said: ReadonlyArray<ResolvedSaid>,
): Effect.Effect<IssueDraft, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const json = yield* readJsonDraft(host, input.jsonInput)
    if (json.id !== undefined) {
      return yield* Effect.fail(
        usage(
          'issues file takes the next free number itself; remove "id" from the draft.',
        ),
      )
    }
    const title = firstSome(input.title, jsonOptional(json.title))
    if (Option.isNone(title) || title.value.trim() === '') {
      return yield* Effect.fail(
        usage('A title is required: --title or "title" in --from-json.'),
      )
    }
    const priority = yield* parseChoice(
      'priority',
      Option.getOrElse(
        firstSome(input.priority, jsonOptional(json.priority)),
        () => 'P2',
      ),
      priorities,
    )
    const status = yield* parseChoice(
      'status',
      Option.getOrElse(
        firstSome(input.status, jsonOptional(json.status)),
        () => 'Open',
      ),
      statuses,
    )
    const issueType = yield* parseOptionalChoice(
      'issue type',
      firstSome(
        input.type,
        jsonOptional(json.issueType),
        jsonOptional(json.type),
      ),
      issueTypes,
    )
    const relatedIssueIds = yield* parseIssueNumbers([
      ...Array.map(json.relatedIssueIds ?? [], String),
      ...input.related,
    ])
    const jsonCriteria = yield* Effect.forEach(
      json.successCriteria ?? [],
      criterion =>
        parseCriterion(criterion.outcome, criterion.requiredEvidence ?? []),
    )
    const flagCriteria = yield* Effect.forEach(input.criteria, outcome =>
      parseCriterion(outcome, input.evidence),
    )
    const saidMentions = Array.map(said, resolved => resolved.mention)
    const typedMentions = Option.match(input.typed, {
      onNone: () => [],
      onSome: text => [
        typedMention({
          text,
          typedAt: input.typedAt,
          typedMessage: input.typedMessage,
          typedSession: input.typedSession,
        }),
      ],
    })
    const jsonMentions = Array.map(json.mentions ?? [], mention =>
      DraftMention.make({
        capturedAtMs: jsonOptional(mention.capturedAtMs),
        directQuote: jsonOptional(mention.directQuote),
        note: jsonOptional(mention.note),
        related: mention.related ?? [],
        reporter: jsonOptional(mention.reporter),
        source: mention.source,
      }),
    )
    const agent = Option.getOrElse(input.agent, () => host.defaultAgent)
    const jsonWorkLog = Array.map(json.workLog ?? [], entry =>
      DraftWorkLogEntry.make({
        agentId: firstSome(jsonOptional(entry.agentId), Option.some(agent)),
        commitSha: jsonOptional(entry.commitSha),
        occurredAtMs: entry.occurredAtMs ?? host.nowMs(),
        state: jsonOptional(entry.state),
        summary: entry.summary,
      }),
    )
    const flagWorkLog = Option.match(input.log, {
      onNone: () => [],
      onSome: summary => [
        DraftWorkLogEntry.make({
          agentId: Option.some(agent),
          commitSha: Option.none(),
          occurredAtMs: host.nowMs(),
          state: Option.some(Option.getOrElse(input.logState, () => 'filed')),
          summary,
        }),
      ],
    })
    return IssueDraft.make({
      area: firstSome(input.area, jsonOptional(json.area)),
      claimantId: firstSome(input.claim, jsonOptional(json.claimantId)),
      details: Option.getOrElse(
        firstSome(input.details, jsonOptional(json.details)),
        () => '',
      ),
      issueType,
      leftoverKind: Option.none(),
      mentions: [...jsonMentions, ...saidMentions, ...typedMentions],
      priority,
      productId: Option.getOrElse(
        firstSome(input.product, jsonProductReference(json.product)),
        () => '',
      ),
      relatedIssueIds,
      status,
      successCriteria: [...jsonCriteria, ...flagCriteria],
      title: title.value.trim(),
      workLog: [...jsonWorkLog, ...flagWorkLog],
    })
  })

// OUTPUT

const isoTime = (timeMs: number): string => new Date(timeMs).toISOString()

const issueHeadline = (issue: Issue): string =>
  Array.join(
    [
      `#${issue.id}`,
      issue.priority,
      issue.status,
      ...Option.toArray(issue.issueType),
      `[${issue.product.name}]`,
    ],
    '  ',
  )

/** One `issues list` line: `#692  P2  Open  <title>  [Scribe]`. */
export const issueListLine = (issue: Issue): string =>
  `#${issue.id}  ${issue.priority}  ${issue.status}  ${issue.title}  [${issue.product.name}]`

/**
 * One line of `issues list --landing`, `--wip`, `--stuck`, or
 * `--target-build`: the list line, where the work is, and its branch, such as
 * `#804  P1  InProgress  <title>  [Scribe]  Green for build 106  agent/claude/timeline-804`.
 */
export const issueWorkLine = (issue: Issue): string =>
  Option.match(issue.workInProgress, {
    onNone: () => issueListLine(issue),
    onSome: work =>
      Array.join(
        [
          issueListLine(issue),
          landingSummary(work),
          ...Option.toArray(work.branch),
        ],
        '  ',
      ),
  })

const fileCountText = (count: number): string =>
  `${count.toString()} ${count === 1 ? 'file' : 'files'} touched`

/**
 * One line of `issues list --working`: the list line, where the work is, the
 * running agent, its branch, and how many files it touches, such as
 * `#1374  P2  InProgress  <title>  [Scribe]  running claude-code/issue-wip-1374@max  agent/claude/issue-wip-1374  3 files touched`.
 */
export const issueWorkingLine = (issue: Issue): string =>
  Array.join(
    [
      issueListLine(issue),
      ...Option.toArray(Option.map(issue.workInProgress, landingSummary)),
      ...Option.toArray(
        Option.map(
          issue.agentPresence,
          presence => `running ${presence.agentId}`,
        ),
      ),
      ...Option.toArray(
        Option.orElse(
          Option.flatMap(issue.workInProgress, work => work.branch),
          () =>
            Option.flatMap(issue.agentPresence, presence => presence.branch),
        ),
      ),
      ...Option.toArray(
        Option.map(
          Option.flatMap(
            issue.agentPresence,
            presence => presence.touchedFiles,
          ),
          touchedFiles => fileCountText(touchedFiles.fileCount),
        ),
      ),
    ],
    '  ',
  )

const subtaskLine = (subtask: IssueSubtask, position: number): string =>
  `  [${subtask.state._tag === 'Checked' ? 'x' : ' '}] ${position.toString()} ${subtask.title} (${subtask.id})`

const subtaskLines = (issue: Issue): ReadonlyArray<string> =>
  Array.map(issue.subtasks, (subtask, index) => subtaskLine(subtask, index + 1))

const indented = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.map(lines, line => `  ${line}`)

const optionalLine = (
  label: string,
  value: Option.Option<string>,
): ReadonlyArray<string> =>
  Option.match(value, {
    onNone: () => [],
    onSome: text => [`${label}: ${text}`],
  })

const section = (
  title: string,
  lines: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.match(lines, {
    onEmpty: () => [],
    onNonEmpty: nonEmpty => ['', title, ...nonEmpty],
  })

const mentionLines = (mention: IssueMention): ReadonlyArray<string> => [
  `  ${Array.join(
    [
      ...Option.toArray(Option.map(mention.capturedAtMs, isoTime)),
      Option.getOrElse(
        firstSome(mention.directQuote, mention.note),
        () => '(no quote)',
      ),
    ],
    '  ',
  )}`,
  `    from ${describeIssueReference(mention.source)}`,
  ...Array.map(
    mention.related,
    related => `    ${describeIssueReference(related)}`,
  ),
]

/** Prints one Issue in full, its work log oldest first. */
export const issueDetailLines = (issue: Issue): ReadonlyArray<string> => [
  issueHeadline(issue),
  issue.title,
  ...optionalLine('Area', issue.area),
  ...optionalLine('Claimed by', issue.claimantId),
  ...optionalLine('Reported', issue.reportedDate),
  `Created: ${isoTime(issue.createdAtMs)}  Updated: ${isoTime(issue.updatedAtMs)}`,
  issueUrl(issue.id),
  ...section('Details', issue.details === '' ? [] : [issue.details]),
  ...section('Now working', indented(nowWorkingLines(issue))),
  ...Option.match(issue.workInProgress, {
    onNone: () => [],
    onSome: work =>
      section('Work in progress', indented(workInProgressLines(work))),
  }),
  ...section(`Subtasks (${subtaskProgress(issue)})`, subtaskLines(issue)),
  ...section(
    'Success criteria',
    Array.map(
      issue.successCriteria,
      criterion =>
        `  [${criterion.isSatisfied ? 'x' : ' '}] ${criterion.outcome} (${Array.join(criterion.requiredEvidence, ', ')})`,
    ),
  ),
  ...section('Mentions', Array.flatMap(issue.mentions, mentionLines)),
  ...Array.match(catalogIssueIds(issue), {
    onEmpty: () => [],
    onNonEmpty: ids => [
      '',
      `Related: ${Array.join(
        Array.map(ids, id => `#${id}`),
        ', ',
      )}`,
    ],
  }),
  ...section(
    'Attachments',
    Array.map(
      issue.attachments,
      attachment => `  ${attachment.fileName} (${attachment.kind})`,
    ),
  ),
  ...section(
    'Work log',
    Array.map(
      Array.sortWith(issue.workLog, entry => entry.occurredAtMs, Order.Number),
      entry =>
        `  ${Array.join(
          [
            isoTime(entry.occurredAtMs),
            ...Option.toArray(entry.state),
            ...Option.toArray(entry.agentId),
            entry.summary,
            ...Option.toArray(Option.map(entry.commitSha, sha => `[${sha}]`)),
          ],
          '  ',
        )}`,
    ),
  ),
]

const encodeIssue = S.encodeSync(Issue)

const issueJson = (issue: Issue): string =>
  JSON.stringify(encodeIssue(issue), null, 2)

// RUN

const loadedIssueOf = (
  command: string,
  model: Model,
  issueId: string,
): Effect.Effect<Issue, IssuesCommandFailure> =>
  M.value(model.issueDetail).pipe(
    M.withReturnType<Effect.Effect<Issue, IssuesCommandFailure>>(),
    M.tagsExhaustive({
      NotObservingIssue: () =>
        Effect.fail(failed(command, `Issue #${issueId} was not read.`)),
      LoadingIssue: () =>
        Effect.fail(failed(command, `Issue #${issueId} is still loading.`)),
      FailedIssue: ({ reason }) => Effect.fail(failed(command, reason)),
      LoadedIssue: ({ issue }) =>
        Option.match(issue, {
          onNone: () => Effect.fail(missing(issueId)),
          onSome: Effect.succeed,
        }),
    }),
  )

const changeIssue = (
  host: IssuesHost,
  command: string,
  issueId: string,
  messagesFor: (
    issue: Issue,
  ) =>
    | ReadonlyArray<Message>
    | Effect.Effect<ReadonlyArray<Message>, IssuesCommandFailure>,
): Effect.Effect<
  Readonly<{ entryId: Option.Option<string>; issue: Issue }>,
  IssuesCommandFailure
> =>
  Effect.gen(function* () {
    const model = yield* executeMessages(
      IssueDetail.make({ issueId }),
      settled =>
        Effect.flatMap(loadedIssueOf(command, settled, issueId), issue => {
          const messages = messagesFor(issue)
          return Effect.isEffect(messages) ? messages : Effect.succeed(messages)
        }),
      host.resources,
    )
    return yield* M.value(model.issueMutation).pipe(
      M.withReturnType<
        Effect.Effect<
          Readonly<{ entryId: Option.Option<string>; issue: Issue }>,
          IssuesCommandFailure
        >
      >(),
      M.tagsExhaustive({
        SavedIssueMutation: ({ entryId }) =>
          Effect.map(loadedIssueOf(command, model, issueId), issue => ({
            entryId,
            issue,
          })),
        FailedIssueMutation: ({ reason }) =>
          Effect.fail(failed(command, reason)),
        DeletedIssueMutation: ({ issue }) =>
          Effect.succeed({ entryId: Option.none(), issue }),
        IdleIssueMutation: () =>
          Effect.fail(
            failed(command, 'the tracker did not confirm the change.'),
          ),
        SavingIssueMutation: () =>
          Effect.fail(failed(command, 'the change is still saving.')),
      }),
    )
  })

/** Files one Issue under the next free number. */
export const fileIssueCommand = (
  host: IssuesHost,
  input: FileInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const said = yield* Effect.forEach(input.said, spec =>
        resolveSaid(host.mirrorRoot, spec),
      )
      // Read every picture before filing, so an unreadable --image files nothing.
      const pictures = yield* picturesToAttach(said, input)
      const draft = yield* composeDraft(host, input, said)
      yield* requireExistingIssues(
        host,
        'file',
        draft.relatedIssueIds,
        'nothing was filed.',
      )
      if (input.dryRun) {
        const preview = issueFromDraft(
          draft,
          ApplicationProduct.make({
            id: draft.productId,
            name: draft.productId,
          }),
          'next',
          host.nowMs(),
        )
        return succeeded([
          issueJson(
            Issue.make({
              ...preview,
              attachments: Array.map(pictures, (picture, position) =>
                previewAttachment(preview.id, picture, position),
              ),
            }),
          ),
        ])
      }
      const model = yield* executeMessages(
        FileIssue.make({}),
        () =>
          Effect.succeed([
            ComposedIssueDraft.make({ draft }),
            SubmittedIssue.make({}),
          ]),
        host.resources,
      )
      if (model.draftState._tag === 'FailedIssueDraft') {
        const reason = model.draftState.reason
        const isUsage =
          reason.startsWith('Choose an Application or Library') ||
          reason === 'A title is required.'
        return yield* Effect.fail(
          isUsage ? usage(reason) : failed('file', reason),
        )
      }
      if (model.navigation._tag !== 'IssueDetail') {
        return yield* Effect.fail(
          failed('file', 'the tracker did not report the new Issue.'),
        )
      }
      const filed = yield* loadedIssueOf(
        'file',
        model,
        model.navigation.issueId,
      )
      const issue = yield* attachPictures(host, filed.id, pictures).pipe(
        Effect.mapError(
          failure =>
            new IssuesCommandFailure({
              exitCode: FAILED_EXIT_CODE,
              message: `Filed #${filed.id}, but ${failure.message} ${retryAttach(filed.id, pictures)}`,
            }),
        ),
        Effect.map(Option.getOrElse(() => filed)),
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [
              `Filed #${issue.id}: ${issue.title}`,
              issueUrl(issue.id),
              ...picturesSummary(pictures),
            ],
      )
    }),
  )

/** Prints one Issue in full, or as JSON. */
export const showIssueCommand = (
  host: IssuesHost,
  input: Readonly<{ issue: string; isJson: boolean }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const model = yield* executeMessages(
        IssueDetail.make({ issueId }),
        () => Effect.succeed([]),
        host.resources,
      )
      const issue = yield* loadedIssueOf('show', model, issueId)
      return succeeded(
        input.isJson ? [issueJson(issue)] : issueDetailLines(issue),
      )
    }),
  )

/** Everything `issues list` filters by. */
export type ListInput = Readonly<{
  claimant: Option.Option<string>
  isBacklog: boolean
  isJson: boolean
  isLanding: boolean
  isStuck: boolean
  isWorkInProgress: boolean
  isWorking: boolean
  limit: Option.Option<number>
  product: Option.Option<string>
  recording: Option.Option<string>
  search: Option.Option<string>
  statuses: ReadonlyArray<string>
  targetBuild: Option.Option<string>
  type: Option.Option<string>
}>

const isStuckWork = (issue: Issue): boolean =>
  Option.exists(issue.workInProgress, work => work.activity._tag === 'Stuck')

const targetsBuild = (issue: Issue, build: string): boolean =>
  Option.exists(issue.workInProgress, work =>
    Option.contains(work.targetBuild, build),
  )

const matchesWorkFilters = (input: ListInput, issue: Issue): boolean =>
  (!input.isLanding || isCloseToLanding(issue)) &&
  (!input.isWorkInProgress || Option.isSome(issue.workInProgress)) &&
  (!input.isWorking || isWorkingNow(issue)) &&
  (!input.isStuck || isStuckWork(issue)) &&
  Option.match(input.targetBuild, {
    onNone: () => true,
    onSome: build => targetsBuild(issue, build.trim()),
  })

const isWorkListing = (input: ListInput): boolean =>
  input.isLanding ||
  input.isWorking ||
  input.isWorkInProgress ||
  input.isStuck ||
  Option.isSome(input.targetBuild)

const listLineFor = (input: ListInput): ((issue: Issue) => string) => {
  if (input.isWorking) {
    return issueWorkingLine
  } else if (isWorkListing(input)) {
    return issueWorkLine
  } else {
    return issueListLine
  }
}

const recordingFolderIdPattern = /— ([0-9a-f]{8})$/

const recordingFilter = (
  host: IssuesHost,
  recording: string,
): ((issue: Issue) => boolean) => {
  const isNumber =
    /^\d+$/.test(recording) && recording.length < RECORDING_ID_PREFIX_LENGTH
  const maybeIdPrefix = isNumber
    ? Option.flatMap(findRecordingFolder(host.mirrorRoot, recording), folder =>
        Option.flatMap(
          Option.fromNullOr(recordingFolderIdPattern.exec(folder)),
          match => Option.fromUndefinedOr(match[1]),
        ),
      )
    : Option.some(recording.toLowerCase())
  const maybeLabel = isNumber
    ? Option.some(new RegExp(`\\bRecording ${String(Number(recording))}\\b`))
    : Option.none()
  const namesRecording = (reference: IssueReference): boolean =>
    Option.match(maybeIdPrefix, {
      onNone: () => false,
      onSome: prefix =>
        M.value(reference).pipe(
          M.withReturnType<boolean>(),
          M.tag('Recording', ({ recording: mention }) =>
            mention.recordingId.toLowerCase().startsWith(prefix),
          ),
          M.tag('Uri', ({ value }) =>
            value.toLowerCase().includes(`/recording/${prefix}`),
          ),
          M.tag('Unrecognized', ({ value }) =>
            JSON.stringify(value).toLowerCase().includes(prefix),
          ),
          M.orElse(() => false),
        ),
    })
  return issue =>
    Array.some(
      issue.mentions,
      mention =>
        Array.some([mention.source, ...mention.related], namesRecording) ||
        Option.match(maybeLabel, {
          onNone: () => false,
          onSome: label =>
            Array.some(
              [
                ...Option.toArray(mention.directQuote),
                ...Option.toArray(mention.note),
              ],
              text => label.test(text),
            ),
        }),
    )
}

const loadIssues = (
  host: IssuesHost,
  command: string,
  statuses: ReadonlyArray<IssueStatus>,
): Effect.Effect<ReadonlyArray<Issue>, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const model = yield* executeMessages(
      IssueList.make({}),
      () => Effect.succeed([]),
      withCatalogStatuses(host.resources, statuses),
    )
    return yield* M.value(model.issues).pipe(
      M.withReturnType<
        Effect.Effect<ReadonlyArray<Issue>, IssuesCommandFailure>
      >(),
      M.tagsExhaustive({
        LoadingIssues: () =>
          Effect.fail(failed(command, 'the Issue list is still loading.')),
        FailedIssues: ({ reason }) => Effect.fail(failed(command, reason)),
        LoadedIssues: ({ issues: loaded }) => Effect.succeed(loaded),
      }),
    )
  })

/**
 * The backlog as `issues list --backlog` prints it: each build lane and
 * priority section under its heading, cut after `limit` Issues.
 */
const backlogListing = (
  issues: ReadonlyArray<Issue>,
  limit: Option.Option<number>,
): Readonly<{ issues: ReadonlyArray<Issue>; lines: ReadonlyArray<string> }> => {
  const backlog = backlogOf(issues)
  const shown = Option.match(limit, {
    onNone: () => backlogIssues(backlog),
    onSome: count => Array.take(backlogIssues(backlog), count),
  })
  const shownIds = new Set(Array.map(shown, issue => issue.id))
  const group = (
    heading: string,
    members: ReadonlyArray<Issue>,
  ): ReadonlyArray<string> => {
    const kept = Array.filter(members, issue => shownIds.has(issue.id))
    return Array.isReadonlyArrayEmpty(kept)
      ? []
      : [heading, ...Array.map(kept, issueWorkLine)]
  }
  return {
    issues: shown,
    lines: [
      ...Array.flatMap(backlog.lanes, lane =>
        group(laneHeading(lane), lane.issues),
      ),
      ...Array.flatMap(backlog.sections, section =>
        group(sectionHeading(section), section.issues),
      ),
    ],
  }
}

/** Lists Issues newest first, filtered, and accounts for every stored one. */
export const listIssuesCommand = (
  host: IssuesHost,
  input: ListInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const wantedStatuses = yield* Effect.forEach(
        splitList(input.statuses),
        status => parseChoice('status', status, statuses),
      )
      const wantedType = yield* parseOptionalChoice(
        'issue type',
        input.type,
        issueTypes,
      )
      const issues = yield* loadIssues(host, 'list', wantedStatuses)
      const storedIds = yield* host.records
        .fetchIssueIds(wantedStatuses)
        .pipe(
          Effect.mapError(cause =>
            failed('list', describeIssueTrackerCause(cause)),
          ),
        )
      const readIds = new Set(Array.map(issues, issue => issue.id))
      const unreadable = Array.filter(storedIds, id => !readIds.has(id))
      const matchesProduct = (issue: Issue) =>
        Option.match(input.product, {
          onNone: () => true,
          onSome: product =>
            issue.product.id.toLowerCase() === product.toLowerCase() ||
            issue.product.name.toLowerCase() === product.toLowerCase(),
        })
      const matchesRecording = Option.match(input.recording, {
        onNone: () => (_issue: Issue) => true,
        onSome: recording => recordingFilter(host, recording),
      })
      const filtered = Array.filter(
        issues,
        issue =>
          (Array.isReadonlyArrayEmpty(wantedStatuses) ||
            Array.contains(wantedStatuses, issue.status)) &&
          matchesProduct(issue) &&
          matchesRecording(issue) &&
          Option.match(input.claimant, {
            onNone: () => true,
            onSome: claimant => Option.contains(issue.claimantId, claimant),
          }) &&
          Option.match(wantedType, {
            onNone: () => true,
            onSome: type => Option.contains(issue.issueType, type),
          }) &&
          Option.match(input.search, {
            onNone: () => true,
            onSome: search =>
              `${issue.title}\n${issue.details}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          }) &&
          matchesWorkFilters(input, issue),
      )
      const listing = input.isBacklog
        ? backlogListing(filtered, input.limit)
        : {
            issues: Option.match(input.limit, {
              onNone: () => filtered,
              onSome: limit => Array.take(filtered, limit),
            }),
            lines: [],
          }
      const stdout = input.isJson
        ? [
            JSON.stringify(
              Array.map(listing.issues, issue => encodeIssue(issue)),
            ),
          ]
        : input.isBacklog
          ? listing.lines
          : Array.map(listing.issues, listLineFor(input))
      if (Array.isReadonlyArrayNonEmpty(unreadable)) {
        return {
          exitCode: FAILED_EXIT_CODE,
          stderr: [
            `Read ${issues.length.toString()} of ${storedIds.length.toString()} stored Issues; not read: ${Array.join(
              Array.map(unreadable, id => `#${id}`),
              ', ',
            )}. issues show <number> names the cause.`,
          ],
          stdout,
        }
      }
      return succeeded(stdout)
    }),
  )

/** Everything `issues log` reads. */
export type LogInput = Readonly<{
  agent: Option.Option<string>
  claim: Option.Option<string>
  commit: Option.Option<string>
  issue: string
  isJson: boolean
  state: string
  status: Option.Option<string>
  summary: string
}>

const logEntry = (
  host: IssuesHost,
  command: string,
  input: LogInput,
): Effect.Effect<IssuesOutcome, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const issueId = yield* parseIssueNumber(input.issue)
    const state = input.state.trim()
    if (state === '') {
      return yield* Effect.fail(
        usage(
          'A work-log state is required, such as claimed, progress, landed, waiting, or blocked.',
        ),
      )
    }
    const summary =
      input.summary === '-'
        ? (yield* host.readStandardInput).trim()
        : input.summary.trim()
    if (summary === '') {
      return yield* Effect.fail(
        usage(
          `issues ${command} needs a summary (or - to read it from standard input).`,
        ),
      )
    }
    const status = yield* parseOptionalChoice('status', input.status, statuses)
    const { entryId, issue } = yield* changeIssue(
      host,
      command,
      issueId,
      () => [
        SubmittedIssueWorkLogEntry.make({
          agentId: Option.some(
            Option.getOrElse(input.agent, () => host.defaultAgent),
          ),
          claimantId: input.claim,
          commitSha: input.commit,
          issueId,
          state,
          status,
          summary,
        }),
      ],
    )
    const entry = Option.getOrElse(entryId, () => '')
    return succeeded(
      input.isJson
        ? [
            JSON.stringify({
              entry,
              issue: issueId,
              status: issue.status,
              workLog: issue.workLog.length,
            }),
          ]
        : [
            `Logged on #${issueId} (${state}): ${entry}; ${issue.workLog.length.toString()} work-log entries; status ${issue.status}.`,
          ],
    )
  })

/** Appends one work-log entry, optionally claiming and setting status. */
export const logIssueCommand = (
  host: IssuesHost,
  input: LogInput,
): Effect.Effect<IssuesOutcome> => finish(logEntry(host, 'log', input))

/** Claims an Issue: a `claimed` entry, the claimant, and InProgress. */
export const claimIssueCommand = (
  host: IssuesHost,
  input: Readonly<{
    agent: string
    issue: string
    isJson: boolean
    summary: Option.Option<string>
  }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    logEntry(host, 'claim', {
      agent: Option.some(input.agent),
      claim: Option.some(input.agent),
      commit: Option.none(),
      issue: input.issue,
      isJson: input.isJson,
      state: 'claimed',
      status: Option.some('InProgress'),
      summary: Option.getOrElse(
        input.summary,
        () => `Claimed by ${input.agent}.`,
      ),
    }),
  )

/** Sets any stored status. */
export const setIssueStatusCommand = (
  host: IssuesHost,
  input: Readonly<{ issue: string; isJson: boolean; status: string }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const status = yield* parseChoice('status', input.status, statuses)
      const { issue } = yield* changeIssue(host, 'status', issueId, () => [
        SelectedIssueStatus.make({ issueId, status }),
      ])
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [`Set #${issueId} to ${issue.status}.`],
      )
    }),
  )

/** Links related Issue numbers. */
export const linkIssuesCommand = (
  host: IssuesHost,
  input: Readonly<{
    issue: string
    isJson: boolean
    targets: ReadonlyArray<string>
  }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const targets = yield* parseIssueNumbers(input.targets)
      if (Array.isReadonlyArrayEmpty(targets)) {
        return yield* Effect.fail(usage('issues link needs an Issue to link.'))
      }
      yield* requireExistingIssues(host, 'link', targets, 'nothing was linked.')
      const { issue } = yield* changeIssue(host, 'link', issueId, () =>
        Array.map(targets, targetIssueId =>
          LinkedCatalogIssue.make({ sourceIssueId: issueId, targetIssueId }),
        ),
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [
              `Linked #${issueId} to ${Array.join(
                Array.map(targets, target => `#${target}`),
                ', ',
              )}.`,
            ],
      )
    }),
  )

const writeBackup = (
  host: IssuesHost,
  issueId: string,
  authorization: string,
  records: ReadonlyArray<unknown>,
): Effect.Effect<string, IssuesCommandFailure> =>
  Effect.try({
    try: () => {
      const backedUpAtMs = host.nowMs()
      mkdirSync(host.backupDirectory, { recursive: true })
      const path = join(
        host.backupDirectory,
        `issue-${issueId}-${isoTime(backedUpAtMs).replace(/[:.]/g, '-')}.json`,
      )
      const descriptor = openSync(path, 'wx', 0o600)
      try {
        writeSync(
          descriptor,
          `${JSON.stringify(
            {
              authorization,
              backedUpAt: isoTime(backedUpAtMs),
              issueId,
              records,
            },
            null,
            2,
          )}\n`,
        )
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      return path
    },
    catch: cause =>
      failed(
        'delete',
        `the backup could not be written to ${host.backupDirectory}: ${describeIssueTrackerCause(cause)}; nothing was deleted.`,
      ),
  })

/** Deletes one Issue on Michael's typed yes, after backing up its record. */
export const deleteIssueCommand = (
  host: IssuesHost,
  input: Readonly<{ issue: string; isJson: boolean; yes: string }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      if (input.yes.trim() === '') {
        return yield* Effect.fail(
          usage(
            'issues delete needs --yes "<Michael\'s typed words>": a permanent delete needs his yes typed in the chat. Nothing was deleted.',
          ),
        )
      }
      const records = yield* host.records
        .fetchIssueRecordsById(issueId)
        .pipe(
          Effect.mapError(cause =>
            failed('delete', describeIssueTrackerCause(cause)),
          ),
        )
      if (Array.isReadonlyArrayEmpty(records)) {
        return yield* Effect.fail(missing(issueId))
      }
      if (records.length > 1) {
        return yield* Effect.fail(
          failed(
            'delete',
            `Issue #${issueId} is held by ${records.length.toString()} records; nothing was deleted.`,
          ),
        )
      }
      const backupPath = yield* writeBackup(
        host,
        issueId,
        input.yes.trim(),
        records,
      )
      const { issue } = yield* changeIssue(host, 'delete', issueId, () => [
        ConfirmedIssueDeletion.make({ issueId }),
      ]).pipe(
        Effect.mapError(
          failure =>
            new IssuesCommandFailure({
              exitCode: failure.exitCode,
              message: `${failure.message} The backup is at ${backupPath}.`,
            }),
        ),
      )
      return succeeded(
        input.isJson
          ? [JSON.stringify({ backup: backupPath, deleted: issue.id })]
          : [`Deleted #${issue.id} (${issue.title}).`, `Backup: ${backupPath}`],
      )
    }),
  )

/** Lists the products an Issue may be filed under. */
export const listProductsCommand = (
  host: IssuesHost,
  input: Readonly<{ isJson: boolean }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const model = yield* executeMessages(
        FileIssue.make({}),
        () => Effect.succeed([]),
        host.resources,
      )
      const products =
        model.products._tag === 'LoadedProducts' ? model.products.products : []
      return succeeded(
        input.isJson
          ? [JSON.stringify(Array.map(products, entry => entry.product))]
          : Array.map(
              products,
              entry =>
                `${entry.product.id}  ${entry.product.name}  (${entry.product._tag})`,
            ),
      )
    }),
  )

const ProductKind = S.Literals(['Application', 'Library'])
const productKinds = ProductKind.literals

/** Everything `issues products add` takes: the new product's id, name, and kind. */
export type AddProductInput = Readonly<{
  id: Option.Option<string>
  isJson: boolean
  kind: Option.Option<string>
  name: Option.Option<string>
}>

const requireFlag = (
  maybeValue: Option.Option<string>,
  missingMessage: string,
): Effect.Effect<string, IssuesCommandFailure> =>
  Option.match(maybeValue, {
    onNone: () => Effect.fail(usage(missingMessage)),
    onSome: value => Effect.succeed(value.trim()),
  })

const productOf = (
  kind: typeof ProductKind.Type,
  id: string,
  name: string,
): TrackedProduct =>
  M.value(kind).pipe(
    M.withReturnType<TrackedProduct>(),
    M.when('Application', () => ApplicationProduct.make({ id, name })),
    M.when('Library', () => LibraryProduct.make({ id, name })),
    M.exhaustive,
  )

const describeProduct = (product: TrackedProduct): string =>
  `${product.id} (${product.name}, ${product._tag})`

/**
 * Adds one product Issues may be filed under, such as `acaga` named ACAGA,
 * an Application, and reads it back. Adding the same product again changes
 * nothing.
 */
export const addProductCommand = (
  host: IssuesHost,
  input: AddProductInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const id = yield* requireFlag(
        input.id,
        'issues products add needs --id, such as --id acaga.',
      )
      const name = yield* requireFlag(
        input.name,
        'issues products add needs --name, such as --name ACAGA.',
      )
      const kindText = yield* requireFlag(
        input.kind,
        'issues products add needs --kind: Application or Library.',
      )
      const kind = yield* parseChoice('product kind', kindText, productKinds)
      const model = yield* executeMessages(
        FileIssue.make({}),
        () =>
          Effect.succeed([
            SubmittedProduct.make({ product: productOf(kind, id, name) }),
          ]),
        host.resources,
      )
      const printed = (product: TrackedProduct, line: string) =>
        succeeded(input.isJson ? [JSON.stringify(product)] : [line])
      return yield* M.value(model.productAddition).pipe(
        M.withReturnType<Effect.Effect<IssuesOutcome, IssuesCommandFailure>>(),
        M.tagsExhaustive({
          SavedProductAddition: ({ product }) =>
            Effect.succeed(
              printed(product, `Added product ${describeProduct(product)}.`),
            ),
          UnchangedProductAddition: ({ product }) =>
            Effect.succeed(
              printed(
                product,
                `Product ${describeProduct(product)} is already in the catalog; nothing changed.`,
              ),
            ),
          RefusedProductAddition: ({ reason }) => Effect.fail(usage(reason)),
          FailedProductAddition: ({ reason }) =>
            Effect.fail(failed('products add', reason)),
          IdleProductAddition: () =>
            Effect.fail(
              failed(
                'products add',
                'the tracker did not confirm the product.',
              ),
            ),
          SavingProductAddition: () =>
            Effect.fail(failed('products add', 'the product is still saving.')),
        }),
      )
    }),
  )

const MAXIMUM_FILE_BYTES = 100 * 1024 * 1024
const uploadPrefix =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/

const contentTypesByExtension: ReadonlyMap<string, string> = new Map([
  ['.csv', 'text/csv'],
  ['.gif', 'image/gif'],
  ['.heic', 'image/heic'],
  ['.html', 'text/html'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json'],
  ['.log', 'text/plain'],
  ['.m4a', 'audio/mp4'],
  ['.md', 'text/markdown'],
  ['.mov', 'video/quicktime'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain'],
  ['.wav', 'audio/wav'],
  ['.webp', 'image/webp'],
  ['.zip', 'application/zip'],
])

const inferredContentType = (fileName: string): string =>
  contentTypesByExtension.get(extname(fileName).toLowerCase()) ??
  'application/octet-stream'

const inferredKind = (contentType: string): typeof IssueAttachmentKind.Type => {
  if (contentType.startsWith('audio/')) {
    return 'Audio'
  }
  if (contentType.startsWith('image/')) {
    return 'Screenshot'
  }
  if (contentType.startsWith('video/')) {
    return 'Video'
  }
  return 'File'
}

const storageSafeName = (fileName: string): string =>
  fileName.replace(/[\u0000-\u001f\u007f/]/g, '_')

/** Everything `issues attach` reads. */
export type AttachInput = Readonly<{
  capturedAt: Option.Option<string>
  contentType: Option.Option<string>
  files: ReadonlyArray<string>
  issue: string
  isJson: boolean
  kind: Option.Option<string>
}>

const attachOne = (
  host: IssuesHost,
  input: AttachInput,
  issueId: string,
  entityId: string,
  filePath: string,
): Effect.Effect<string, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const stat = yield* Effect.try({
      try: () => statSync(filePath),
      catch: cause =>
        usage(
          `${filePath} cannot be read: ${describeIssueTrackerCause(cause)}`,
        ),
    })
    if (!stat.isFile()) {
      return yield* Effect.fail(usage(`${filePath} is not a file.`))
    }
    if (stat.size > MAXIMUM_FILE_BYTES) {
      return yield* Effect.fail(
        usage(`${filePath} is larger than the 100 MiB an Issue file may be.`),
      )
    }
    const bytes = new Uint8Array(readFileSync(filePath))
    const fileName = basename(filePath)
    const contentType = Option.getOrElse(input.contentType, () =>
      inferredContentType(fileName),
    )
    const kind = yield* Option.match(input.kind, {
      onNone: () => Effect.succeed(inferredKind(contentType)),
      onSome: text =>
        parseChoice('file kind', text, IssueAttachmentKind.literals),
    })
    const capturedAtMs = Option.getOrElse(
      Option.filter(
        Option.map(input.capturedAt, Date.parse),
        timeMs => !Number.isNaN(timeMs),
      ),
      () => Math.round(stat.mtimeMs),
    )
    const path = `issues/${issueId}/${randomUUID()}-${storageSafeName(fileName)}`
    const fileId = yield* host.files
      .upload({ bytes, contentType, fileName, path })
      .pipe(
        Effect.mapError(cause =>
          failed(
            'attach',
            `upload ${path}: ${describeIssueTrackerCause(cause)}`,
          ),
        ),
      )
    const removeUpload = (failure: IssuesCommandFailure) =>
      host.files.remove({ fileId, path }).pipe(
        Effect.matchEffect({
          onFailure: cause =>
            Effect.fail(
              new IssuesCommandFailure({
                exitCode: failure.exitCode,
                message: `${failure.message} Removing the uploaded ${path} failed too: ${describeIssueTrackerCause(cause)}`,
              }),
            ),
          onSuccess: () => Effect.fail(failure),
        }),
      )
    yield* host.files.link({ entityId, fileId }).pipe(
      Effect.mapError(cause =>
        failed('attach', `link ${path}: ${describeIssueTrackerCause(cause)}`),
      ),
      Effect.catchTag('IssuesCommandFailure', removeUpload),
    )
    yield* changeIssue(host, 'attach', issueId, () => [
      SubmittedIssueAttachment.make({
        attachment: IssueAttachment.make({
          byteCount: Option.some(bytes.byteLength),
          capturedAtMs: Option.some(capturedAtMs),
          contentType,
          fileName,
          id: fileId,
          issueId,
          kind,
          sha256: Option.some(createHash('sha256').update(bytes).digest('hex')),
          source: InstantStorageAttachmentSource.make({ fileId }),
        }),
        issueId,
      }),
    ]).pipe(Effect.catchTag('IssuesCommandFailure', removeUpload))
    return input.isJson
      ? JSON.stringify({ fileId, fileName, issue: issueId, kind, path })
      : `Attached ${fileName} to #${issueId} (${kind}, ${bytes.byteLength.toString()} bytes): ${path}`
  })

/** Uploads files, links them to the Issue, and records them on it. */
export const attachIssueFilesCommand = (
  host: IssuesHost,
  input: AttachInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      if (Array.isReadonlyArrayEmpty(input.files)) {
        return yield* Effect.fail(usage('issues attach needs a file.'))
      }
      const records = yield* host.records
        .fetchIssueRecordsById(issueId)
        .pipe(
          Effect.mapError(cause =>
            failed('attach', describeIssueTrackerCause(cause)),
          ),
        )
      const record = yield* Array.match(records, {
        onEmpty: () => Effect.fail(missing(issueId)),
        onNonEmpty: nonEmpty =>
          nonEmpty.length === 1
            ? Effect.succeed(Array.headNonEmpty(nonEmpty))
            : Effect.fail(
                failed(
                  'attach',
                  `Issue #${issueId} is held by ${nonEmpty.length.toString()} records.`,
                ),
              ),
      })
      const lines = yield* Effect.forEach(input.files, filePath =>
        attachOne(host, input, issueId, record.id, filePath),
      )
      return succeeded(lines)
    }),
  )

// PICTURES OF THE MOMENT (Scribe #1345)
// An Issue carries the screenshots and screen frames of the moment it quotes, above all when it is about design.
// The tracker's Instant rules let only the owner's signed-in email view `$files`, so the pictures stay private.

/** The `--said` moment a picture is from; a file named with `--image` has none. */
type PictureMoment = Readonly<{ kind: SaidImageKind; recordingNumber: string }>

/** One picture to attach, read before anything is filed. */
type Picture = Readonly<{
  bytes: Uint8Array
  capturedAtMs: number
  contentType: string
  fileName: string
  filePath: string
  moment: Option.Option<PictureMoment>
  sha256: string
}>

const readPicture = (
  filePath: string,
  flag: string,
): Effect.Effect<
  Readonly<{ bytes: Uint8Array; mtimeMs: number }>,
  IssuesCommandFailure
> =>
  Effect.try({
    try: () => {
      const stat = statSync(filePath)
      if (!stat.isFile()) {
        throw new Error('it is not a file')
      }
      if (stat.size > MAXIMUM_FILE_BYTES) {
        throw new Error('it is larger than the 100 MiB an Issue file may be')
      }
      return {
        bytes: new Uint8Array(readFileSync(filePath)),
        mtimeMs: stat.mtimeMs,
      }
    },
    catch: cause =>
      usage(
        `${flag} ${filePath} cannot be read: ${describeIssueTrackerCause(cause)}`,
      ),
  })

const sha256Of = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

/**
 * The pictures `issues file` and `issues mention` attach: those of each `--said` moment (unless `--no-images`),
 * then each `--image`, each picture once however often it is named (by its bytes).
 */
const picturesToAttach = (
  said: ReadonlyArray<ResolvedSaid>,
  input: Readonly<{ images: ReadonlyArray<string>; isWithoutImages: boolean }>,
): Effect.Effect<ReadonlyArray<Picture>, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const fromSaid = input.isWithoutImages
      ? []
      : yield* Effect.forEach(
          Array.flatMap(said, resolved =>
            Array.map(resolved.images, image => ({
              image,
              recordingNumber: resolved.recordingNumber,
            })),
          ),
          ({ image, recordingNumber }) =>
            Effect.map(readPicture(image.filePath, '--said'), ({ bytes }) => ({
              bytes,
              capturedAtMs: image.capturedAtMs,
              contentType: image.contentType,
              fileName: image.fileName,
              filePath: image.filePath,
              moment: Option.some({ kind: image.kind, recordingNumber }),
              sha256: sha256Of(bytes),
            })),
        )
    const named = yield* Effect.forEach(input.images, filePath =>
      Effect.gen(function* () {
        const fileName = basename(filePath)
        const contentType = inferredContentType(fileName)
        if (!contentType.startsWith('image/')) {
          return yield* Effect.fail(
            usage(
              `--image ${filePath} is not a picture (${contentType}); attach other files with issues attach.`,
            ),
          )
        }
        const { bytes, mtimeMs } = yield* readPicture(filePath, '--image')
        return {
          bytes,
          capturedAtMs: Math.round(mtimeMs),
          contentType,
          fileName,
          filePath: resolve(filePath),
          moment: Option.none(),
          sha256: sha256Of(bytes),
        }
      }),
    )
    return Array.dedupeWith(
      [...fromSaid, ...named],
      (first, second) => first.sha256 === second.sha256,
    )
  })

const pictureAttachment = (
  issueId: string,
  picture: Picture,
  fileId: string,
): IssueAttachment =>
  IssueAttachment.make({
    byteCount: Option.some(picture.bytes.byteLength),
    capturedAtMs: Option.some(picture.capturedAtMs),
    contentType: picture.contentType,
    fileName: picture.fileName,
    id: fileId,
    issueId,
    kind: 'Screenshot',
    sha256: Option.some(picture.sha256),
    source: InstantStorageAttachmentSource.make({ fileId }),
  })

/** What `--dry-run` shows it would attach: the picture, stored nowhere yet. */
const previewAttachment = (
  issueId: string,
  picture: Picture,
  position: number,
): IssueAttachment =>
  IssueAttachment.make({
    ...pictureAttachment(
      issueId,
      picture,
      `preview-${(position + 1).toString()}`,
    ),
    source: UriAttachmentSource.make({
      value: pathToFileURL(picture.filePath).href,
    }),
  })

const issueRecordOf = (host: IssuesHost, command: string, issueId: string) =>
  Effect.gen(function* () {
    const records = yield* host.records
      .fetchIssueRecordsById(issueId)
      .pipe(
        Effect.mapError(cause =>
          failed(command, describeIssueTrackerCause(cause)),
        ),
      )
    return yield* Array.match(records, {
      onEmpty: () => Effect.fail(missing(issueId)),
      onNonEmpty: nonEmpty =>
        nonEmpty.length === 1
          ? Effect.succeed(Array.headNonEmpty(nonEmpty))
          : Effect.fail(
              failed(
                command,
                `Issue #${issueId} is held by ${nonEmpty.length.toString()} records.`,
              ),
            ),
    })
  })

const attachmentFailure = (message: string) =>
  new IssuesCommandFailure({ exitCode: FAILED_EXIT_CODE, message })

/**
 * Uploads each picture, links it to the Issue's record, and records them all on the Issue in one change. When a
 * step fails, every upload so far is removed and the failure names the picture. None to attach: `Option.none()`.
 */
const attachPictures = (
  host: IssuesHost,
  issueId: string,
  pictures: ReadonlyArray<Picture>,
): Effect.Effect<Option.Option<Issue>, IssuesCommandFailure> =>
  Array.isReadonlyArrayEmpty(pictures)
    ? Effect.succeed(Option.none())
    : Effect.gen(function* () {
        const record = yield* issueRecordOf(host, 'attach', issueId).pipe(
          Effect.mapError(failure =>
            attachmentFailure(`attaching pictures failed: ${failure.message}`),
          ),
        )
        const uploaded: Array<
          Readonly<{ fileId: string; path: string; picture: Picture }>
        > = []
        const removeUploads = (failure: IssuesCommandFailure) =>
          Effect.forEach(uploaded, ({ fileId, path }) =>
            Effect.ignore(host.files.remove({ fileId, path })),
          ).pipe(Effect.andThen(Effect.fail(failure)))
        for (const picture of pictures) {
          const path = `issues/${issueId}/${randomUUID()}-${storageSafeName(picture.fileName)}`
          const fileId = yield* host.files
            .upload({
              bytes: picture.bytes,
              contentType: picture.contentType,
              fileName: picture.fileName,
              path,
            })
            .pipe(
              Effect.mapError(cause =>
                attachmentFailure(
                  `attaching ${picture.fileName} failed: upload ${path}: ${describeIssueTrackerCause(cause)}.`,
                ),
              ),
              Effect.catchTag('IssuesCommandFailure', removeUploads),
            )
          uploaded.push({ fileId, path, picture })
          yield* host.files.link({ entityId: record.id, fileId }).pipe(
            Effect.mapError(cause =>
              attachmentFailure(
                `attaching ${picture.fileName} failed: link ${path}: ${describeIssueTrackerCause(cause)}.`,
              ),
            ),
            Effect.catchTag('IssuesCommandFailure', removeUploads),
          )
        }
        const { issue } = yield* changeIssue(host, 'attach', issueId, () =>
          Array.map(uploaded, ({ fileId, picture }) =>
            SubmittedIssueAttachment.make({
              attachment: pictureAttachment(issueId, picture, fileId),
              issueId,
            }),
          ),
        ).pipe(
          Effect.mapError(failure =>
            attachmentFailure(
              `attaching ${Array.join(
                Array.map(uploaded, ({ picture }) => picture.fileName),
                ', ',
              )} failed: ${failure.message}`,
            ),
          ),
          Effect.catchTag('IssuesCommandFailure', removeUploads),
        )
        return Option.some(issue)
      })

const shellQuoted = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`

const retryAttach = (
  issueId: string,
  pictures: ReadonlyArray<Picture>,
): string =>
  `None of the pictures were attached; attach them with: issues attach ${issueId} ${Array.join(
    Array.map(pictures, picture => shellQuoted(picture.filePath)),
    ' ',
  )}`

const counted = (count: number, singular: string): string =>
  `${count.toString()} ${singular}${count === 1 ? '' : 's'}`

/** `Attached 9 pictures: 8 from Recording 322 (1 screenshot, 7 screen frames), 1 named with --image.` */
const picturesSummary = (
  pictures: ReadonlyArray<Picture>,
): ReadonlyArray<string> => {
  if (Array.isReadonlyArrayEmpty(pictures)) {
    return []
  }
  const said = Array.getSomes(Array.map(pictures, picture => picture.moment))
  const recordings = Array.dedupe(
    Array.map(said, moment => moment.recordingNumber),
  )
  const fromRecordings = Array.map(recordings, recordingNumber => {
    const ofRecording = Array.filter(
      said,
      moment => moment.recordingNumber === recordingNumber,
    )
    const screenshots = Array.filter(
      ofRecording,
      moment => moment.kind === 'Screenshot',
    ).length
    const frames = ofRecording.length - screenshots
    const kinds = Array.join(
      [
        ...(screenshots === 0 ? [] : [counted(screenshots, 'screenshot')]),
        ...(frames === 0 ? [] : [counted(frames, 'screen frame')]),
      ],
      ', ',
    )
    return `${ofRecording.length.toString()} from Recording ${recordingNumber} (${kinds})`
  })
  const named = pictures.length - said.length
  const parts = [
    ...fromRecordings,
    ...(named === 0 ? [] : [`${named.toString()} named with --image`]),
  ]
  return [
    `Attached ${counted(pictures.length, 'picture')}: ${Array.join(parts, ', ')}.`,
  ]
}

/** Downloads one stored Issue file by its storage path. */
export const downloadIssueFileCommand = (
  host: IssuesHost,
  input: Readonly<{
    directory: Option.Option<string>
    isForced: boolean
    storagePath: string
  }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const directory = resolve(Option.getOrElse(input.directory, () => '.'))
      const destination = join(
        directory,
        basename(input.storagePath).replace(uploadPrefix, ''),
      )
      if (!input.isForced && existsSync(destination)) {
        return yield* Effect.fail(
          usage(`${destination} already exists; pass --force to replace it.`),
        )
      }
      const bytes = yield* host.files
        .download(input.storagePath)
        .pipe(
          Effect.mapError(cause =>
            failed('download', describeIssueTrackerCause(cause)),
          ),
        )
      yield* Effect.try({
        try: () => writeFileSync(destination, bytes),
        catch: cause =>
          failed(
            'download',
            `${destination} could not be written: ${describeIssueTrackerCause(cause)}`,
          ),
      })
      return succeeded([
        `Downloaded ${input.storagePath} (${bytes.byteLength.toString()} bytes) to ${destination}`,
      ])
    }),
  )

/** Where `issues rank` places an Issue; exactly one is given. */
export type RankInput = Readonly<{
  after: Option.Option<string>
  before: Option.Option<string>
  isClear: boolean
  isTop: boolean
  issue: string
}>

const ordinal = (position: number): string => {
  const lastTwo = position % 100
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${position.toString()}th`
  }
  return M.value(position % 10).pipe(
    M.withReturnType<string>(),
    M.when(1, () => `${position.toString()}st`),
    M.when(2, () => `${position.toString()}nd`),
    M.when(3, () => `${position.toString()}rd`),
    M.orElse(() => `${position.toString()}th`),
  )
}

const rankOf = (
  issueId: string,
  anchorId: string,
  placement: RankPlacement,
): Effect.Effect<number, IssuesCommandFailure> =>
  M.value(placement).pipe(
    M.withReturnType<Effect.Effect<number, IssuesCommandFailure>>(),
    M.tagsExhaustive({
      RankedAt: ({ rank }) => Effect.succeed(rank),
      DifferentPriority: ({ anchorPriority, issuePriority }) =>
        Effect.fail(
          usage(
            `#${issueId} is ${issuePriority} and #${anchorId} is ${anchorPriority}: a rank orders Issues within one priority. Change the priority first: issues edit ${String(Number(issueId))} --priority ${anchorPriority}.`,
          ),
        ),
      NoRoom: () =>
        Effect.fail(
          failed(
            'rank',
            `#${issueId} has no room there: its two neighbors hold the same place. Rank one of them first.`,
          ),
        ),
      UnknownIssue: ({ issueId: unknownId }) => Effect.fail(missing(unknownId)),
    }),
  )

/**
 * Places an Issue within its priority: before or after another Issue of the
 * same priority, at the top, or back in age order with --clear. The backlog
 * (`issues list --backlog`, the site's Backlog) shows the new order.
 */
export const rankIssueCommand = (
  host: IssuesHost,
  input: RankInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const maybeBefore = yield* Effect.transposeOption(
        Option.map(input.before, parseIssueNumber),
      )
      const maybeAfter = yield* Effect.transposeOption(
        Option.map(input.after, parseIssueNumber),
      )
      const placeCount = Array.filter(
        [
          Option.isSome(maybeBefore),
          Option.isSome(maybeAfter),
          input.isTop,
          input.isClear,
        ],
        isGiven => isGiven,
      ).length
      if (placeCount !== 1) {
        return yield* Effect.fail(
          usage(
            'issues rank needs one place: --before <n>, --after <n>, --top, or --clear.',
          ),
        )
      }
      const issues = yield* loadIssues(host, 'rank', [])
      const findStored = (id: string) =>
        Array.findFirst(issues, issue => issue.id === id)
      const issue = yield* Option.match(findStored(issueId), {
        onNone: () => Effect.fail(missing(issueId)),
        onSome: Effect.succeed,
      })
      const anchorId = Option.getOrElse(
        Option.orElse(maybeBefore, () => maybeAfter),
        () => issueId,
      )
      const rank = yield* Effect.transposeOption(
        input.isClear
          ? Option.none()
          : Option.some(
              rankOf(
                issueId,
                anchorId,
                Option.match(maybeBefore, {
                  onSome: before => rankBefore(issues, issueId, before),
                  onNone: () =>
                    Option.match(maybeAfter, {
                      onSome: after => rankAfter(issues, issueId, after),
                      onNone: () => rankTop(issues, issueId),
                    }),
                }),
              ),
            ),
      )
      const { issue: ranked } = yield* changeIssue(
        host,
        'rank',
        issueId,
        () => [SubmittedIssueRank.make({ issueId, rank })],
      )
      const place = Option.match(
        placeInBacklog(
          backlogOf(
            Array.map(issues, stored =>
              stored.id === ranked.id ? ranked : stored,
            ),
          ),
          issueId,
        ),
        {
          onNone: () => `${issue.status}, so not in the backlog`,
          onSome: ({ count, group, position }) =>
            `${ordinal(position)} of ${count.toString()} in ${group}`,
        },
      )
      const where = Option.match(maybeBefore, {
        onSome: anchorId => `Ranked #${issueId} before #${anchorId}`,
        onNone: () =>
          Option.match(maybeAfter, {
            onSome: anchorId => `Ranked #${issueId} after #${anchorId}`,
            onNone: () =>
              input.isClear
                ? `Cleared the rank of #${issueId}: back in age order,`
                : `Ranked #${issueId} at the top`,
          }),
      })
      return succeeded([
        input.isClear ? `${where} ${place}.` : `${where}: ${place}.`,
      ])
    }),
  )

/** Everything `issues edit` changes; only the fields given change. */
export type EditInput = Readonly<{
  area: Option.Option<string>
  details: Option.Option<string>
  issue: string
  isJson: boolean
  priority: Option.Option<string>
  product: Option.Option<string>
  title: Option.Option<string>
  type: Option.Option<string>
}>

/** Changes an Issue's title, details, priority, type, area, or product. */
export const editIssueCommand = (
  host: IssuesHost,
  input: EditInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const priority = yield* parseOptionalChoice(
        'priority',
        input.priority,
        priorities,
      )
      const issueType = yield* parseOptionalChoice(
        'issue type',
        input.type,
        issueTypes,
      )
      const changes = Array.filter(
        [
          Option.map(input.title, () => 'title'),
          Option.map(input.details, () => 'details'),
          Option.map(priority, value => `priority ${value}`),
          Option.map(issueType, value => `type ${value}`),
          Option.map(input.area, value => `area ${value}`),
          Option.map(input.product, value => `product ${value}`),
        ],
        Option.isSome,
      )
      if (Array.isReadonlyArrayEmpty(changes)) {
        return yield* Effect.fail(
          usage(
            'issues edit needs a field to change: --title, --details, --priority, --type, --area, or --product.',
          ),
        )
      }
      const { issue } = yield* changeIssue(host, 'edit', issueId, () => [
        SubmittedIssueEdit.make({
          area: input.area,
          details: input.details,
          issueId,
          issueType,
          priority,
          productId: input.product,
          title: input.title,
        }),
      ]).pipe(
        Effect.mapError(failure =>
          failure.message.includes('Choose an Application or Library')
            ? usage(failure.message.replace('issues edit failed: ', ''))
            : failure,
        ),
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [
              `Edited #${issueId}: ${Array.join(
                Array.map(changes, change =>
                  Option.getOrElse(change, () => ''),
                ),
                ', ',
              )}.`,
            ],
      )
    }),
  )

/** Adds one success criterion. */
export const addCriterionCommand = (
  host: IssuesHost,
  input: Readonly<{
    evidence: ReadonlyArray<string>
    issue: string
    isJson: boolean
    outcome: string
  }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const outcome = input.outcome.trim()
      if (outcome === '') {
        return yield* Effect.fail(
          usage('issues criterion needs the outcome, one observable sentence.'),
        )
      }
      const criterion = yield* parseCriterion(outcome, input.evidence)
      const { issue } = yield* changeIssue(host, 'criterion', issueId, () => [
        SubmittedIssueSuccessCriterion.make({
          issueId,
          outcome: criterion.outcome,
          requiredEvidence: criterion.requiredEvidence,
        }),
      ])
      const added = Option.getOrElse(
        Option.map(
          Array.findFirst(
            issue.successCriteria,
            stored => stored.outcome === criterion.outcome,
          ),
          stored => stored.id,
        ),
        () => '',
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [`Added criterion ${added} to #${issueId}.`],
      )
    }),
  )

const criterionIdFor = (
  issue: Issue,
  reference: string,
): Option.Option<string> => {
  const trimmed = reference.trim()
  const byPosition = /^\d+$/.test(trimmed)
    ? Option.map(
        Array.get(issue.successCriteria, Number(trimmed) - 1),
        criterion => criterion.id,
      )
    : Option.none()
  return Option.orElse(byPosition, () =>
    Option.map(
      Array.findFirst(
        issue.successCriteria,
        criterion => criterion.id === trimmed,
      ),
      criterion => criterion.id,
    ),
  )
}

const criteriaListing = (issue: Issue): string =>
  Array.join(
    Array.map(
      issue.successCriteria,
      (criterion, index) =>
        `${(index + 1).toString()} ${criterion.id} "${criterion.outcome}"`,
    ),
    ', ',
  )

/** Marks success criteria, by position or id, satisfied or not. */
export const markCriteriaCommand = (
  host: IssuesHost,
  input: Readonly<{
    criteria: ReadonlyArray<string>
    isJson: boolean
    isUnsatisfied: boolean
    issue: string
  }>,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const references = splitList(input.criteria)
      if (Array.isReadonlyArrayEmpty(references)) {
        return yield* Effect.fail(
          usage(
            'issues satisfy needs a criterion: its position (1, 2, ...) or id.',
          ),
        )
      }
      const { issue } = yield* changeIssue(host, 'satisfy', issueId, current =>
        Effect.map(
          Effect.forEach(references, reference =>
            Option.match(criterionIdFor(current, reference), {
              onNone: () =>
                Effect.fail(
                  usage(
                    `Issue #${issueId} has no criterion ${reference}. Its criteria: ${criteriaListing(current)}.`,
                  ),
                ),
              onSome: Effect.succeed,
            }),
          ),
          criterionIds => [
            SubmittedSuccessCriteriaMarks.make({
              criterionIds: Array.dedupe(criterionIds),
              isSatisfied: !input.isUnsatisfied,
              issueId,
            }),
          ],
        ),
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [
              `Marked ${Array.join(references, ', ')} on #${issueId} ${input.isUnsatisfied ? 'not satisfied' : 'satisfied'}; ${Array.filter(issue.successCriteria, criterion => criterion.isSatisfied).length.toString()} of ${issue.successCriteria.length.toString()} satisfied.`,
            ],
      )
    }),
  )

/** Everything `issues mention` reads. */
export type MentionInput = Readonly<{
  /** Files to attach beside the pictures `--said` brings (`--image`). */
  images: ReadonlyArray<string>
  issue: string
  isJson: boolean
  /** `--no-images`: quote the lines, attach none of their pictures. */
  isWithoutImages: boolean
  said: ReadonlyArray<string>
  typed: Option.Option<string>
  typedAt: Option.Option<string>
  typedMessage: Option.Option<string>
  typedSession: Option.Option<string>
}>

/** Adds Michael's later words to an Issue as Mentions, with their links. */
export const addMentionCommand = (
  host: IssuesHost,
  input: MentionInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const said = yield* Effect.forEach(input.said, spec =>
        resolveSaid(host.mirrorRoot, spec),
      )
      const pictures = yield* picturesToAttach(said, input)
      const mentions = [
        ...Array.map(said, resolved => resolved.mention),
        ...Option.match(input.typed, {
          onNone: () => [],
          onSome: text => [
            typedMention({
              text,
              typedAt: input.typedAt,
              typedMessage: input.typedMessage,
              typedSession: input.typedSession,
            }),
          ],
        }),
      ]
      if (Array.isReadonlyArrayEmpty(mentions)) {
        return yield* Effect.fail(
          usage(
            'issues mention needs --said <recording>:<lines> or --typed "<words>".',
          ),
        )
      }
      const { issue: mentioned } = yield* changeIssue(
        host,
        'mention',
        issueId,
        () =>
          Array.map(mentions, mention =>
            SubmittedIssueMention.make({ issueId, mention }),
          ),
      )
      // A picture the Issue already holds (same bytes) is not attached again.
      const storedHashes = new Set(
        Array.getSomes(
          Array.map(mentioned.attachments, attachment => attachment.sha256),
        ),
      )
      const newPictures = Array.filter(
        pictures,
        picture => !storedHashes.has(picture.sha256),
      )
      const issue = yield* attachPictures(host, issueId, newPictures).pipe(
        Effect.mapError(
          failure =>
            new IssuesCommandFailure({
              exitCode: FAILED_EXIT_CODE,
              message: `issues mention added the Mention to #${issueId}, but ${failure.message} ${retryAttach(issueId, newPictures)}`,
            }),
        ),
        Effect.map(Option.getOrElse(() => mentioned)),
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [
              `Added ${mentions.length.toString()} Mention${mentions.length === 1 ? '' : 's'} to #${issueId}; it has ${issue.mentions.length.toString()}.`,
              ...picturesSummary(newPictures),
            ],
      )
    }),
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

/** Everything `issues subtask add` reads. */
export type AddSubtasksInput = Readonly<{
  issue: string
  isJson: boolean
  titles: ReadonlyArray<string>
}>

/**
 * Adds subtasks to an Issue's checklist, unchecked, each title once, and
 * prints the checklist: `Added 3 subtasks to #835; 0 of 3 done.`
 */
export const addSubtasksCommand = (
  host: IssuesHost,
  input: AddSubtasksInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const titles = Array.filter(
        Array.map(input.titles, title => title.trim()),
        title => title !== '',
      )
      if (Array.isReadonlyArrayEmpty(titles)) {
        return yield* Effect.fail(
          usage(
            'issues subtask add needs a title: one short step, such as "Red tests".',
          ),
        )
      }
      const before = yield* Ref.make<ReadonlyArray<IssueSubtask>>([])
      const { issue } = yield* changeIssue(
        host,
        'subtask add',
        issueId,
        current =>
          Effect.as(Ref.set(before, current.subtasks), [
            SubmittedIssueSubtasks.make({ issueId, titles }),
          ]),
      )
      const beforeIds = new Set(
        Array.map(yield* Ref.get(before), subtask => subtask.id),
      )
      const addedCount = Array.filter(
        issue.subtasks,
        subtask => !beforeIds.has(subtask.id),
      ).length
      const plural = addedCount === 1 ? '' : 's'
      const headline =
        addedCount === 0
          ? `#${issueId} already has every subtask given; ${subtaskProgress(issue)}.`
          : `Added ${addedCount.toString()} subtask${plural} to #${issueId}; ${subtaskProgress(issue)}.`
      return succeeded(
        input.isJson ? [issueJson(issue)] : [headline, ...subtaskLines(issue)],
      )
    }),
  )

/** Everything `issues subtask check` and `uncheck` read. */
export type MarkSubtasksInput = Readonly<{
  issue: string
  isJson: boolean
  mark: SubtaskMark
  subtasks: ReadonlyArray<string>
}>

const subtaskIdFor = (
  issue: Issue,
  reference: string,
): Option.Option<string> => {
  const trimmed = reference.trim()
  const byPosition = /^\d+$/.test(trimmed)
    ? Option.map(
        Array.get(issue.subtasks, Number(trimmed) - 1),
        subtask => subtask.id,
      )
    : Option.none()
  return Option.orElse(byPosition, () =>
    Option.map(
      Array.findFirst(issue.subtasks, subtask => subtask.id === trimmed),
      subtask => subtask.id,
    ),
  )
}

/**
 * Checks subtasks off, or back to unchecked, by position or id:
 * `Checked 1, issue-835-subtask-3 on #835; 2 of 3 done.`
 */
export const markSubtasksCommand = (
  host: IssuesHost,
  input: MarkSubtasksInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const command =
        input.mark === 'Checked' ? 'subtask check' : 'subtask uncheck'
      const references = splitList(input.subtasks)
      if (Array.isReadonlyArrayEmpty(references)) {
        return yield* Effect.fail(
          usage(
            `issues ${command} needs a subtask: its position (1, 2, ...) or id.`,
          ),
        )
      }
      const { issue } = yield* changeIssue(host, command, issueId, current =>
        Effect.map(
          Effect.forEach(references, reference =>
            Option.match(subtaskIdFor(current, reference), {
              onNone: () =>
                Effect.fail(
                  usage(
                    `Issue #${issueId} has no subtask ${reference}. Its subtasks: ${Array.match(
                      current.subtasks,
                      {
                        onEmpty: () => 'none',
                        onNonEmpty: () => subtaskListing(current),
                      },
                    )}.`,
                  ),
                ),
              onSome: Effect.succeed,
            }),
          ),
          subtaskIds => [
            SubmittedSubtaskMarks.make({
              issueId,
              mark: input.mark,
              subtaskIds: Array.dedupe(subtaskIds),
            }),
          ],
        ),
      )
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : [
              `${input.mark} ${Array.join(references, ', ')} on #${issueId}; ${subtaskProgress(issue)}.`,
            ],
      )
    }),
  )

/** Everything `issues wip` reads; only the flags given change. */
export type WorkInProgressInput = Readonly<{
  abandoned: Option.Option<string>
  agent: Option.Option<string>
  branch: Option.Option<string>
  commit: Option.Option<string>
  isActive: boolean
  isClear: boolean
  isJson: boolean
  issue: string
  repository: Option.Option<string>
  state: Option.Option<string>
  step: Option.Option<string>
  stuck: Option.Option<string>
  targetBuild: Option.Option<string>
  worktree: Option.Option<string>
}>

const requiredReason = (
  flag: string,
  maybeReason: Option.Option<string>,
): Effect.Effect<Option.Option<string>, IssuesCommandFailure> =>
  Option.match(maybeReason, {
    onNone: () => Effect.succeed(Option.none()),
    onSome: reason =>
      reason.trim() === ''
        ? Effect.fail(
            usage(
              `issues wip ${flag} needs the reason, such as ${flag} "Waits on a review".`,
            ),
          )
        : Effect.succeed(Option.some(reason.trim())),
  })

const parseActivity = (
  input: WorkInProgressInput,
): Effect.Effect<Option.Option<IssueWorkActivity>, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const maybeStuck = yield* requiredReason('--stuck', input.stuck)
    const maybeAbandoned = yield* requiredReason('--abandoned', input.abandoned)
    const activities: ReadonlyArray<IssueWorkActivity> = [
      ...(input.isActive ? [ActiveWork.make({})] : []),
      ...Option.toArray(
        Option.map(maybeStuck, reason => StuckWork.make({ reason })),
      ),
      ...Option.toArray(
        Option.map(maybeAbandoned, reason => AbandonedWork.make({ reason })),
      ),
    ]
    if (activities.length > 1) {
      return yield* Effect.fail(
        usage('issues wip takes one of --active, --stuck, or --abandoned.'),
      )
    }
    return Array.head(activities)
  })

const trimmedText = (maybeText: Option.Option<string>): Option.Option<string> =>
  Option.filter(
    Option.map(maybeText, text => text.trim()),
    text => text !== '',
  )

const hasWorkChange = (edit: WorkInProgressEdit): boolean =>
  Option.isSome(edit.activity) ||
  Option.isSome(edit.landingState) ||
  Array.some(
    [
      edit.branch,
      edit.commitSha,
      edit.lastStep,
      edit.repository,
      edit.targetBuild,
      edit.worktree,
    ],
    Option.isSome,
  )

const encodeWorkInProgress = S.encodeSync(IssueWorkInProgress)

const printedWorkInProgress = (issue: Issue, isJson: boolean): IssuesOutcome =>
  Option.match(issue.workInProgress, {
    onNone: () =>
      succeeded(
        isJson
          ? ['null']
          : [`No work in progress is recorded on #${issue.id}.`],
      ),
    onSome: work =>
      succeeded(
        isJson
          ? [JSON.stringify(encodeWorkInProgress(work), null, 2)]
          : [
              `#${issue.id} work in progress`,
              ...indented(workInProgressLines(work)),
            ],
      ),
  })

/**
 * Records where an Issue's work is (only the flags given change), prints it
 * when no flag changes it, or clears it: `issues wip 804 --state green
 * --commit 8b89b2f1b` keeps its branch and worktree.
 */
export const workInProgressCommand = (
  host: IssuesHost,
  input: WorkInProgressInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const issueId = yield* parseIssueNumber(input.issue)
      const landingState = yield* parseOptionalChoice(
        'landing state',
        input.state,
        landingStates,
      )
      const activity = yield* parseActivity(input)
      const edit = WorkInProgressEdit.make({
        activity,
        agentId: Option.some(
          Option.getOrElse(trimmedText(input.agent), () => host.defaultAgent),
        ),
        branch: trimmedText(input.branch),
        commitSha: trimmedText(input.commit),
        landingState,
        lastStep: trimmedText(input.step),
        repository: trimmedText(input.repository),
        targetBuild: trimmedText(input.targetBuild),
        worktree: trimmedText(input.worktree),
      })
      if (input.isClear) {
        if (hasWorkChange(edit)) {
          return yield* Effect.fail(
            usage(
              'issues wip --clear takes no other change; run it alone to remove the work in progress.',
            ),
          )
        }
        const { issue } = yield* changeIssue(host, 'wip', issueId, () => [
          ClearedIssueWorkInProgress.make({ issueId }),
        ])
        return succeeded(
          input.isJson
            ? [issueJson(issue)]
            : [`Cleared the work in progress on #${issueId}.`],
        )
      }
      if (!hasWorkChange(edit)) {
        const model = yield* executeMessages(
          IssueDetail.make({ issueId }),
          () => Effect.succeed([]),
          host.resources,
        )
        const issue = yield* loadedIssueOf('wip', model, issueId)
        return printedWorkInProgress(issue, input.isJson)
      }
      const { issue } = yield* changeIssue(host, 'wip', issueId, () => [
        SubmittedIssueWorkInProgress.make({ edit, issueId }),
      ])
      return succeeded(
        input.isJson
          ? [issueJson(issue)]
          : Option.match(issue.workInProgress, {
              onNone: () => [`No work in progress is recorded on #${issueId}.`],
              onSome: work => [
                `Recorded the work in progress on #${issueId}: ${landingSummary(work)}.`,
              ],
            }),
      )
    }),
  )

/** Everything `issues working sync` reads. */
export type WorkingSyncInput = Readonly<{
  agents: string
  isDryRun: boolean
  isSweep: boolean
  registry: Option.Option<string>
}>

const sweptStatuses: ReadonlyArray<IssueStatus> = ['InProgress', 'Addressing']

const MINUTE_MS = 60_000
const RECOUNT_AFTER_MINUTES = 10

/**
 * How old a worktree's file count may grow before a sync counts it again:
 * ten minutes. Each count stats every tracked file (about 0.65 s of CPU in
 * a Scribe worktree).
 */
export const recountFilesAfterMs = RECOUNT_AFTER_MINUTES * MINUTE_MS

const hasFreshFileCount = (
  issue: Issue,
  worktree: string,
  observedAtMs: number,
): boolean =>
  Option.exists(
    issue.agentPresence,
    presence =>
      presence.run._tag === 'Running' &&
      Option.exists(
        presence.touchedFiles,
        touchedFiles =>
          observedAtMs - touchedFiles.checkedAtMs < recountFilesAfterMs,
      ) &&
      Option.exists(
        Option.orElse(
          Option.flatMap(issue.workInProgress, work => work.worktree),
          () => presence.worktree,
        ),
        counted => counted === worktree,
      ),
  )

const readJsonFile = (
  host: IssuesHost,
  what: string,
  path: string,
): Effect.Effect<unknown, IssuesCommandFailure> =>
  host.readTextFile(path).pipe(
    Effect.flatMap(text => Effect.try((): unknown => JSON.parse(text))),
    Effect.mapError(cause =>
      failed(
        'working sync',
        `could not read ${what} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
    ),
  )

const readSurvey = (
  host: IssuesHost,
  input: WorkingSyncInput,
): Effect.Effect<AgentSurvey, IssuesCommandFailure> =>
  Effect.gen(function* () {
    const progressCheck = yield* readJsonFile(
      host,
      'the progress check',
      input.agents,
    )
    const maybeRegistry = yield* Option.match(input.registry, {
      onNone: () => Effect.succeed(Option.none<unknown>()),
      onSome: path =>
        Effect.map(
          readJsonFile(host, 'the agents registry', path),
          Option.some,
        ),
    })
    return yield* Result.match(
      surveyFromProgressCheck(progressCheck, maybeRegistry, host.nowMs()),
      {
        onFailure: reason => Effect.fail(failed('working sync', reason)),
        onSuccess: Effect.succeed,
      },
    )
  })

const readIssueById = (
  host: IssuesHost,
  issueId: string,
): Effect.Effect<Option.Option<Issue>, IssuesCommandFailure> =>
  host.records.fetchIssueRecordsById(issueId).pipe(
    Effect.mapError(cause =>
      failed('working sync', describeIssueTrackerCause(cause)),
    ),
    Effect.flatMap(records =>
      Option.match(Array.head(records), {
        onNone: () => Effect.succeed(Option.none<Issue>()),
        onSome: record =>
          Effect.try({
            try: () => Option.some(decodeIssueRecord(record)),
            catch: cause =>
              failed(
                'working sync',
                `Issue #${issueId} could not be read: ${String(cause)}`,
              ),
          }),
      }),
    ),
  )

const encodedIssueText = (issue: Issue): string =>
  JSON.stringify(encodeIssue(issue))

const presenceChangeLines = (
  before: Issue,
  after: Issue,
): ReadonlyArray<string> =>
  Option.match(after.agentPresence, {
    onNone: () => [],
    onSome: presence => {
      const isSame =
        JSON.stringify(encodeIssue(before).agentPresence) ===
        JSON.stringify(encodeIssue(after).agentPresence)
      if (isSame) {
        return []
      }
      return M.value(presence.run).pipe(
        M.withReturnType<ReadonlyArray<string>>(),
        M.tagsExhaustive({
          Running: () => [
            `#${after.id} running ${presence.agentId}${Option.match(
              presence.touchedFiles,
              {
                onNone: () => '',
                onSome: touchedFiles =>
                  `, ${fileCountText(touchedFiles.fileCount)}`,
              },
            )}`,
          ],
          Ended: ({ how }) =>
            Option.isSome(before.claimantId) && Option.isNone(after.claimantId)
              ? []
              : [`#${after.id} ${presence.agentId} ended (${how})`],
          Stale: ({ reason }) => [
            `#${after.id} claim of ${presence.agentId} is stale: ${reason}`,
          ],
        }),
      )
    },
  })

const claimChangeLines = (before: Issue, after: Issue): ReadonlyArray<string> =>
  Option.match(before.claimantId, {
    onNone: () => [],
    onSome: claimant =>
      Option.isNone(after.claimantId)
        ? [
            `#${after.id} claim of ${claimant} released: its run ended (${Option.match(
              Option.flatMap(after.agentPresence, presence =>
                presence.run._tag === 'Ended'
                  ? Option.some(presence.run.how)
                  : Option.none(),
              ),
              { onNone: () => 'ended', onSome: how => how },
            )})`,
          ]
        : [],
  })

const statusChangeLines = (
  before: Issue,
  after: Issue,
): ReadonlyArray<string> =>
  before.status === after.status
    ? []
    : [
        `#${after.id} ${before.status} → ${after.status}${Option.match(
          after.workInProgress,
          {
            onNone: () => '',
            onSome: work => `: the work is ${work.landingState}`,
          },
        )}`,
      ]

/**
 * What one look at the agents changes on an Issue, one line each:
 * `#1374 running claude-code/issue-wip-1374@max, 3 files touched`,
 * `#1201 claim of claude-code/sweep-1201@ld released: its run ended (done)`,
 * `#880 InProgress → VerificationNeeded: the work is Merged`.
 */
export const workingChangeLines = (
  before: Issue,
  after: Issue,
): ReadonlyArray<string> => [
  ...presenceChangeLines(before, after),
  ...claimChangeLines(before, after),
  ...statusChangeLines(before, after),
]

const pluralOf = (count: number, one: string, many: string): string =>
  `${count.toString()} ${count === 1 ? one : many}`

/**
 * Looks at the Mac's agents and records on each Issue who works on it now:
 * reads `tools/agent-progress-check --json` (`--agents`) and
 * `agents-registry.json` (`--registry`), reads the Issues of running agents
 * and of runs that ended in the last six hours (and with `--sweep` every
 * Issue InProgress or Addressing), counts the files each running agent's
 * worktree touches (not in a worktree several running agents share, such as
 * one main checkout, whose changes no one agent owns), and saves each Issue
 * the survey changes. A dry run prints the changes and saves nothing.
 */
export const workingSyncCommand = (
  host: IssuesHost,
  input: WorkingSyncInput,
): Effect.Effect<IssuesOutcome> =>
  finish(
    Effect.gen(function* () {
      const survey = yield* readSurvey(host, input)
      const byNumber = yield* Effect.forEach(issueIdsToCheck(survey), issueId =>
        readIssueById(host, issueId),
      )
      const swept = input.isSweep
        ? yield* loadIssues(host, 'working sync', sweptStatuses)
        : []
      const issues = Array.dedupeWith(
        [...Array.getSomes(byNumber), ...swept],
        (left, right) => left.id === right.id,
      )
      const worktreeUses = Array.groupBy(
        Array.getSomes(
          Array.map(issues, issue => worktreeToCount(issue, survey)),
        ),
        worktree => worktree,
      )
      const sharedWorktrees = Array.filter(
        Object.entries(worktreeUses),
        ([, uses]) => uses.length > 1,
      )
      const results = yield* Effect.forEach(issues, issue =>
        Effect.gen(function* () {
          const touchedFiles = yield* Option.match(
            Option.filter(
              worktreeToCount(issue, survey),
              worktree =>
                (worktreeUses[worktree]?.length ?? 0) === 1 &&
                !hasFreshFileCount(issue, worktree, survey.observedAtMs),
            ),
            {
              onNone: () => Effect.succeed(Option.none<IssueTouchedFiles>()),
              onSome: host.countTouchedFiles,
            },
          )
          const observed = observedIssue(issue, survey, touchedFiles)
          if (encodedIssueText(observed) === encodedIssueText(issue)) {
            return { failure: Option.none<string>(), lines: [] }
          }
          const lines = workingChangeLines(issue, observed)
          if (input.isDryRun) {
            return { failure: Option.none<string>(), lines }
          }
          const saved = yield* Effect.result(
            changeIssue(host, 'working sync', issue.id, () => [
              ObservedAgentSurvey.make({
                issueId: issue.id,
                survey,
                touchedFiles,
              }),
            ]),
          )
          return Result.match(saved, {
            onFailure: failure => ({
              failure: Option.some(failure.message),
              lines: [],
            }),
            onSuccess: ({ issue: stored }) => ({
              failure: Option.none<string>(),
              lines: workingChangeLines(issue, stored),
            }),
          })
        }),
      )
      const changedCount = Array.filter(results, result =>
        Array.isReadonlyArrayNonEmpty(result.lines),
      ).length
      const checked = `${pluralOf(issues.length, 'Issue', 'Issues')} against ${pluralOf(survey.live.length, 'running agent', 'running agents')}`
      const summary = input.isDryRun
        ? `Dry run: checked ${checked}: ${changedCount.toString()} would change.`
        : `Checked ${checked}: ${changedCount.toString()} changed.`
      const failures = Array.getSomes(
        Array.map(results, result => result.failure),
      )
      const stdout = [
        ...Array.flatMap(results, result => result.lines),
        ...Array.map(
          sharedWorktrees,
          ([worktree, uses]) =>
            `Files not counted in ${worktree}: ${pluralOf(uses.length, 'running agent shares', 'running agents share')} it.`,
        ),
        summary,
      ]
      return Array.isReadonlyArrayEmpty(failures)
        ? succeeded(stdout)
        : { exitCode: FAILED_EXIT_CODE, stderr: failures, stdout }
    }),
  )
