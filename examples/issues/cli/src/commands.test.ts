import { Array, Effect, Layer, Option, Stream } from 'effect'
import {
  IssueRecording,
  IssueRecordingMention,
  StaticIssueTrackerResources,
  issueAgentsOf,
  issueChildrenOf,
  issueReferencesOf,
  makeMemoryIssueTracker,
  makeMemoryProductCatalog,
  recordingIssuesOf,
} from 'issues-core-example'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  AbandonedWork,
  ActiveWork,
  ApplicationProduct,
  ChangedFile,
  Issue,
  IssueAgentPresence,
  type IssueLandingState,
  IssueMention,
  IssueSuccessCriterion,
  IssueTouchedFiles,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  type IssueWorkActivity,
  IssueWorkInProgress,
  IssueWorkLogEntry,
  ProductCatalog,
  ProductCatalogEntry,
  ProductCatalogError,
  type ProductCatalogService,
  RecordingMention,
  RecordingReference,
  RunningAgent,
  StuckWork,
  UriReference,
} from '@foldkit/instant-tools/issues'

import {
  FoundIssueAgents,
  FoundRecordingIssues,
  type IssueAgentsRead,
  UnavailableIssueAgents,
  UnavailableRecordingIssues,
  noIssueAgentsReader,
  noRecordingIssuesReader,
} from './agents.js'
import {
  BuildJob,
  type BuildJobsRead,
  FoundBuildJobs,
  UnavailableBuildJobs,
} from './builds.js'
import {
  type AddProductInput,
  type FileInput,
  type IssueFilesService,
  type IssuesHost,
  type IssuesOutcome,
  type ListInput,
  type MentionInput,
  type WorkInProgressInput,
  type WorkingSyncInput,
  addCriterionCommand,
  addMentionCommand,
  addProductCommand,
  addSubtasksCommand,
  attachIssueFilesCommand,
  claimIssueCommand,
  deleteIssueCommand,
  downloadIssueFileCommand,
  editIssueCommand,
  fileIssueCommand,
  issueTypes,
  linkIssuesCommand,
  listIssuesCommand,
  listProductsCommand,
  logIssueCommand,
  markCriteriaCommand,
  markSubtasksCommand,
  parentIssueCommand,
  rankIssueCommand,
  redactCredentials,
  removeSubtasksCommand,
  resolveSaid,
  resolveSaidMention,
  setIssueStatusCommand,
  showIssueCommand,
  showRecordingCommand,
  typedMention,
  workInProgressCommand,
  workingSyncCommand,
} from './commands.js'
import {
  FoundIssueChildren,
  UnavailableIssueChildren,
  noIssueChildrenReader,
} from './family.js'
import { noLandingReader } from './landing.js'
import {
  FoundIssueRecordings,
  UnavailableIssueRecordings,
  noIssueRecordingsReader,
} from './recordings.js'
import {
  FoundIssueReferences,
  UnavailableIssueReferences,
  noIssueReferencesReader,
} from './references.js'
import { memoryIssueRecords } from './resources.js'

const product = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
const recordingId = 'faa684c2-34e4-47e5-8f9b-3b2196da9463'

const stored = (
  id: string,
  title: string,
  overrides: Partial<typeof Issue.Type> = {},
) =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_790_000_000_000 + Number(id),
    details: `Details of ${title}.`,
    id,
    issueType: Option.some('defect'),
    mentions: [],
    priority: 'P2',
    product,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title,
    updatedAtMs: 1_790_000_000_000 + Number(id),
    viewerURL: Option.some(`https://issues.knophy.com/issues/${id}`),
    workLog: [],
    ...overrides,
  })

const transcriptLine = (index: number, start: number, text: string) =>
  JSON.stringify({
    at: '2026-10-10T12:06:00.000-04:00',
    atMs: 1_791_640_000_000 + index,
    end: start + 4,
    id: `segment-${index.toString()}`,
    index,
    isFinal: true,
    recording: recordingId,
    start,
    text,
    v: 1,
  })

const makeMirror = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'issues-mirror-'))
  const folder = join(root, 'recordings', '208 — 2026-10-10 — faa684c2')
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'transcript.jsonl'),
    Array.join(
      [
        transcriptLine(1883, 10_120.5, 'An aside before the request.'),
        transcriptLine(1884, 10_130.348, 'The save fails with a bare tag.'),
        transcriptLine(1885, 10_139.11, 'Show me the real cause instead.'),
        transcriptLine(1886, 10_150, 'And move on to the next thing.'),
      ],
      '\n',
    ),
  )
  return root
}

const makeHost = (
  seed: ReadonlyArray<typeof Issue.Type>,
  override: (tracker: IssueTrackerService) => IssueTrackerService = tracker =>
    tracker,
) =>
  Effect.gen(function* () {
    const memory = yield* makeMemoryIssueTracker(seed)
    const tracker = override(memory)
    const backupDirectory = mkdtempSync(join(tmpdir(), 'issues-backups-'))
    const storedFiles = new Map<string, Uint8Array>()
    const links: Array<string> = []
    const files: IssueFilesService = {
      download: path =>
        Option.match(Option.fromUndefinedOr(storedFiles.get(path)), {
          onNone: () => Effect.fail(new Error(`No stored file ${path}.`)),
          onSome: Effect.succeed,
        }),
      link: ({ entityId, fileId }) =>
        Effect.sync(() => {
          links.push(`${entityId}->${fileId}`)
        }),
      remove: ({ path }) =>
        Effect.sync(() => {
          storedFiles.delete(path)
        }),
      upload: ({ bytes, path }) =>
        Effect.sync(() => {
          storedFiles.set(path, bytes)
          return `file-${storedFiles.size.toString()}`
        }),
    }
    const host: IssuesHost = {
      backupDirectory,
      countTouchedFiles: worktree =>
        Effect.succeed(
          Option.some(
            IssueTouchedFiles.make({
              base: 'technoplato/main',
              checkedAtMs: 1_792_000_000_000,
              fileCount: 1,
              files: [
                ChangedFile.make({
                  deletions: 2,
                  insertions: 40,
                  path: `${worktree.split('/').at(-1) ?? ''}/src/nowWorking.ts`,
                }),
              ],
            }),
          ),
        ),
      defaultAgent: 'claude-code/test',
      files,
      mirrorRoot: makeMirror(),
      nowMs: () => 1_792_000_000_000,
      readBuildJobs: () =>
        Effect.succeed(FoundBuildJobs.make({ jobs: [], unreadable: [] })),
      readIssueAgents: noIssueAgentsReader,
      readIssueChildren: noIssueChildrenReader,
      readIssueRecordings: noIssueRecordingsReader,
      readIssueReferences: noIssueReferencesReader,
      readRecordingIssues: noRecordingIssuesReader,
      readLanding: noLandingReader,
      readStandardInput: Effect.succeed(''),
      readTextFile: path => Effect.try(() => readFileSync(path, 'utf8')),
      records: memoryIssueRecords(memory),
      resources: Layer.merge(
        StaticIssueTrackerResources,
        Layer.succeed(IssueTracker, tracker),
      ),
      timeZone: 'America/New_York',
    }
    return { backupDirectory, host, links, memory, storedFiles }
  })

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect)

const fetched = (tracker: IssueTrackerService, issueId: string) =>
  Effect.runSync(tracker.fetchIssue(issueId))

const linesOf = (outcome: IssuesOutcome) => Array.join(outcome.stdout, '\n')

const withProductCatalog = (
  host: IssuesHost,
  catalog: ProductCatalogService,
): IssuesHost => ({
  ...host,
  resources: Layer.merge(
    host.resources,
    Layer.succeed(ProductCatalog, catalog),
  ),
})

const scribeEntry = ProductCatalogEntry.make({
  product,
  updatedAtMs: 1_790_000_000_000,
})

const allIssues: ListInput = {
  claimant: Option.none(),
  isBacklog: false,
  isJson: false,
  isLanding: false,
  isStuck: false,
  isWorkInProgress: false,
  isWorking: false,
  limit: Option.none(),
  product: Option.none(),
  recording: Option.none(),
  search: Option.none(),
  statuses: [],
  targetBuild: Option.none(),
  type: Option.none(),
}

const noWorkChange = (issue: string): WorkInProgressInput => ({
  abandoned: Option.none(),
  agent: Option.none(),
  branch: Option.none(),
  commit: Option.none(),
  isActive: false,
  isClear: false,
  isJson: false,
  issue,
  repository: Option.none(),
  state: Option.none(),
  step: Option.none(),
  stuck: Option.none(),
  targetBuild: Option.none(),
  worktree: Option.none(),
})

const workAt = (
  landingState: IssueLandingState,
  maybeTargetBuild: Option.Option<string>,
  activity: IssueWorkActivity = ActiveWork.make({}),
) =>
  IssueWorkInProgress.make({
    activity,
    agentId: Option.some('claude-code/wip-835'),
    branch: Option.some('agent/claude/work'),
    commitSha: Option.none(),
    landingState,
    lastStep: Option.none(),
    repository: Option.none(),
    targetBuild: maybeTargetBuild,
    updatedAtMs: 1_792_260_000_000,
    worktree: Option.none(),
  })

const acagaInput: AddProductInput = {
  id: Option.some('acaga'),
  isJson: false,
  kind: Option.some('Application'),
  name: Option.some('ACAGA'),
}

describe('issues command', () => {
  it('refuses anything that is not an Issue number, with exit code 2', async () => {
    const { host } = await run(makeHost([]))

    const outcome = await run(
      showIssueCommand(host, { issue: 'issue-041', isJson: false }),
    )

    expect(outcome.exitCode).toBe(2)
    expect(Array.join(outcome.stderr, '\n')).toContain(
      '"issue-041" is not an Issue number',
    )
  })

  it('shows one Issue in full with its work log oldest first, and as JSON', async () => {
    const issue = stored('692', 'Filing hides the cause', {
      claimantId: Option.some('claude-code/issues-one-way'),
      mentions: [
        IssueMention.make({
          capturedAtMs: Option.some(1_791_640_001_884),
          directQuote: Option.some('Recording 208 #1884: "the save fails"'),
          id: 'mention-692-1',
          issueId: '692',
          related: [
            UriReference.make({
              value: `https://og.pisspoursoftware.xyz/recording/${recordingId}/section/segment-1884?t=10130.35`,
            }),
          ],
          reporter: Option.none(),
          source: RecordingReference.make({
            recording: RecordingMention.make({
              endMilliseconds: Option.some(10_143_110),
              recordingId,
              screenshotIds: [],
              startMilliseconds: 10_130_348,
            }),
          }),
        }),
      ],
      relatedIssueIds: ['502'],
      successCriteria: [
        IssueSuccessCriterion.make({
          id: 'issue-692-criterion-1',
          outcome: 'A failed save names its cause.',
          requiredEvidence: ['FocusedTest'],
        }),
      ],
      workLog: [
        IssueWorkLogEntry.make({
          agentId: Option.some('claude-code/a'),
          commitSha: Option.none(),
          durationSeconds: Option.none(),
          id: 'work-692-filed-1',
          occurredAtMs: 1_792_000_000_001,
          state: Option.some('filed'),
          summary: 'Filed first.',
        }),
        IssueWorkLogEntry.make({
          agentId: Option.some('claude-code/b'),
          commitSha: Option.some('e27b023ea'),
          durationSeconds: Option.none(),
          id: 'work-692-landed-2',
          occurredAtMs: 1_792_000_000_002,
          state: Option.some('landed'),
          summary: 'Landed second.',
        }),
      ],
    })
    const { host } = await run(makeHost([issue]))

    const text = linesOf(
      await run(showIssueCommand(host, { issue: '#692', isJson: false })),
    )
    expect(text).toContain('#692  P2  Open  defect  [Scribe]')
    expect(text).toContain('Filing hides the cause')
    expect(text).toContain('Claimed by: claude-code/issues-one-way')
    expect(text).toContain('[ ] A failed save names its cause. (FocusedTest)')
    expect(text).toContain('Related: #502')
    expect(text).toContain('segment-1884?t=10130.35')
    expect(text.indexOf('Filed first.')).toBeLessThan(
      text.lastIndexOf('Landed second.'),
    )
    expect(text).toContain(
      'Now working\n  Agent: claude-code/issues-one-way\n  Running: not checked yet\n  Last step: Landed second. (2026-10-14T17:46:40.002Z)',
    )

    const json = await run(
      showIssueCommand(host, { issue: '692', isJson: true }),
    )
    expect(JSON.parse(linesOf(json))).toMatchObject({
      claimantId: 'claude-code/issues-one-way',
      id: '692',
      relatedIssueIds: ['502'],
    })
  })

  it('says when an Issue does not exist, with exit code 3', async () => {
    const { host } = await run(makeHost([]))

    const outcome = await run(
      showIssueCommand(host, { issue: '404', isJson: false }),
    )

    expect(outcome.exitCode).toBe(3)
    expect(outcome.stderr).toEqual(['Issue #404 does not exist.'])
  })

  it('files every field under the next free number and prints it', async () => {
    const { host, memory } = await run(
      makeHost([stored('001', 'One'), stored('005', 'Five')]),
    )

    const outcome = await run(
      fileIssueCommand(host, {
        agent: Option.some('claude-code/issues-one-way'),
        area: Option.some('Issue tracker / CLI'),
        claim: Option.some('claude-code/issues-one-way'),
        criteria: ['A failed save names its cause.'],
        details: Option.some('The CLI drops the cause of a failed save.'),
        dryRun: false,
        evidence: ['FocusedTest', 'Log'],
        images: [],
        isJson: false,
        isWithoutImages: false,
        jsonInput: Option.none(),
        log: Option.some('Filed from the session that hit it.'),
        logState: Option.none(),
        parent: Option.none(),
        priority: Option.some('P1'),
        product: Option.some('Scribe'),
        related: ['001', '#005'],
        said: ['208:1884-1885'],
        status: Option.some('InProgress'),
        title: Option.some('issues file hides the cause'),
        type: Option.some('defect'),
        typed: Option.some('Make sure there is only one way to file issues.'),
        typedAt: Option.some('2026-10-14T18:10:00-04:00'),
        typedMessage: Option.some('82fc7bc4'),
        typedSession: Option.some('f1283b96'),
      }),
    )

    expect(outcome.exitCode).toBe(0)
    expect(linesOf(outcome)).toContain(
      'Filed #006: issues file hides the cause',
    )
    const filed = Option.getOrThrow(fetched(memory, '006'))
    expect(filed).toMatchObject({
      area: Option.some('Issue tracker / CLI'),
      claimantId: Option.some('claude-code/issues-one-way'),
      issueType: Option.some('defect'),
      priority: 'P1',
      product: { id: 'scribe' },
      relatedIssueIds: ['001', '005'],
      status: 'InProgress',
      successCriteria: [
        {
          outcome: 'A failed save names its cause.',
          requiredEvidence: ['FocusedTest', 'Log'],
        },
      ],
      workLog: [
        {
          agentId: Option.some('claude-code/issues-one-way'),
          state: Option.some('filed'),
          summary: 'Filed from the session that hit it.',
        },
      ],
    })
    expect(Array.map(filed.mentions, mention => mention.source._tag)).toEqual([
      'Recording',
      'Conversation',
    ])
  })

  it('refuses a product it does not know and lists the valid ones, with exit code 2', async () => {
    const { host } = await run(makeHost([]))

    const outcome = await run(
      fileIssueCommand(host, {
        agent: Option.none(),
        area: Option.none(),
        claim: Option.none(),
        criteria: [],
        details: Option.none(),
        dryRun: false,
        evidence: [],
        images: [],
        isJson: false,
        isWithoutImages: false,
        jsonInput: Option.none(),
        log: Option.none(),
        logState: Option.none(),
        parent: Option.none(),
        priority: Option.none(),
        product: Option.some('Scribee'),
        related: [],
        said: [],
        status: Option.none(),
        title: Option.some('A title'),
        type: Option.none(),
        typed: Option.none(),
        typedAt: Option.none(),
        typedMessage: Option.none(),
        typedSession: Option.none(),
      }),
    )

    expect(outcome.exitCode).toBe(2)
    expect(Array.join(outcome.stderr, '\n')).toContain(
      '"Scribee" names none. Valid: scribe (Scribe), foldkit (Foldkit)',
    )
  })

  it('refuses a status, priority, or evidence it does not know and lists the valid values', async () => {
    const { host } = await run(makeHost([stored('692', 'Filing')]))

    const status = await run(
      setIssueStatusCommand(host, {
        issue: '692',
        isJson: false,
        status: 'Done',
      }),
    )
    expect(status.exitCode).toBe(2)
    expect(Array.join(status.stderr, '\n')).toContain(
      '"Done" is not a status. Valid: Addressing, Backlog, Blocked',
    )
    expect(Array.join(status.stderr, '\n')).toContain('NeedsUserInput')
  })

  it('reads a recording line range from the Scribe mirror, word for word, with a deep link per line', async () => {
    const mirrorRoot = makeMirror()

    const mention = await run(
      resolveSaidMention(mirrorRoot, '208:1884-1885').pipe(
        Effect.orElseSucceed(() => undefined),
      ),
    )

    expect(mention).toMatchObject({
      directQuote: Option.some(
        `Recording 208 (${recordingId}) #1884-1885: "The save fails with a bare tag." "Show me the real cause instead."`,
      ),
      related: [
        {
          _tag: 'Uri',
          value: `https://og.pisspoursoftware.xyz/recording/${recordingId}/section/segment-1884?t=10130.35`,
        },
        {
          _tag: 'Uri',
          value: `https://og.pisspoursoftware.xyz/recording/${recordingId}/section/segment-1885?t=10139.11`,
        },
      ],
      source: {
        _tag: 'Recording',
        recording: {
          endMilliseconds: Option.some(10_143_110),
          recordingId,
          startMilliseconds: 10_130_348,
        },
      },
    })
  })

  it('never quotes a retired line or a sealed one: --said refuses them, and a # a retired copy shares is its kept line', async () => {
    // Scribe #1323 (its ADR 0064 section 8, ADR 0097): a retired line is no line, and a sealed line carries no words.
    // The mirror rewrites transcript.jsonl when a line is retired; a record that still says so is no line here either.
    const mirrorRoot = makeMirror()
    const folder = join(mirrorRoot, 'recordings', '208 — 2026-10-10 — faa684c2')
    const record = (
      index: number,
      start: number,
      text: string,
      extra: Record<string, unknown>,
    ) =>
      JSON.stringify({
        ...JSON.parse(transcriptLine(index, start, text)),
        ...extra,
      })
    writeFileSync(
      join(folder, 'transcript.jsonl'),
      Array.join(
        [
          transcriptLine(1884, 10_130.348, 'The save fails with a bare tag.'),
          transcriptLine(1885, 10_139.11, 'Show me the real cause instead.'),
          // Written after the kept line: the last record at a # used to win.
          record(1885, 10_139.11, 'An older pass of this line.', {
            id: 'segment-1885-old',
            retiredAtMs: 1_791_650_000_000,
          }),
          record(1886, 10_150, '', { sealed: 'voice' }),
          record(1887, 10_160, 'A retired copy.', { retired: true }),
        ],
        '\n',
      ),
    )

    const kept = await run(
      resolveSaidMention(mirrorRoot, '208:1885').pipe(
        Effect.orElseSucceed(() => undefined),
      ),
    )
    expect(kept?.directQuote).toEqual(
      Option.some(
        `Recording 208 (${recordingId}) #1885: "Show me the real cause instead."`,
      ),
    )

    const refusal = (spec: string) =>
      run(
        resolveSaidMention(mirrorRoot, spec).pipe(
          Effect.flip,
          Effect.orElseSucceed(() => undefined),
        ),
      )
    expect((await refusal('208:1886'))?.message).toContain('#1886 is sealed')
    expect((await refusal('208:1887'))?.message).toContain('has no line #1887')
  })

  it('writes a typed-chat Mention with its session, message, and time', () => {
    const mention = typedMention({
      text: 'Just call it issues.',
      typedAt: Option.some('2026-10-14T18:10:00-04:00'),
      typedMessage: Option.some('82fc7bc4'),
      typedSession: Option.some('f1283b96'),
    })

    expect(mention).toMatchObject({
      directQuote: Option.some('Just call it issues.'),
      related: [
        {
          _tag: 'Uri',
          value: 'claude-code://session/f1283b96/message/82fc7bc4',
        },
      ],
      source: {
        _tag: 'Conversation',
        conversation: {
          harness: 'claude-code',
          messageId: '82fc7bc4',
          sessionId: 'f1283b96',
          typedAtMs: Date.parse('2026-10-14T18:10:00-04:00'),
        },
      },
    })
  })

  it('logs a work-log entry, reads it back, and prints what issue-log printed', async () => {
    const { host, memory } = await run(makeHost([stored('692', 'Filing')]))

    const outcome = await run(
      logIssueCommand(host, {
        agent: Option.some('claude-code/issues-one-way'),
        claim: Option.some('claude-code/issues-one-way'),
        commit: Option.some('e27b023ea'),
        issue: '692',
        isJson: true,
        state: 'claimed',
        status: Option.some('InProgress'),
        summary: 'Claimed; red tests next.',
      }),
    )

    expect(outcome.exitCode).toBe(0)
    const printed = JSON.parse(linesOf(outcome))
    expect(printed).toMatchObject({
      issue: '692',
      status: 'InProgress',
      workLog: 1,
    })
    expect(printed.entry).toMatch(/^work-692-claimed-\d+$/)
    expect(
      Option.map(fetched(memory, '692'), issue => ({
        claimant: issue.claimantId,
        entries: issue.workLog.map(entry => entry.id),
      })),
    ).toEqual(
      Option.some({
        claimant: Option.some('claude-code/issues-one-way'),
        entries: [printed.entry],
      }),
    )
  })

  it('fails a log whose write does not land and names the cause, with exit code 1', async () => {
    const { host } = await run(
      makeHost([stored('692', 'Filing')], tracker => ({
        ...tracker,
        update: issueId =>
          Effect.fail(
            new IssueTrackerError({
              cause: new Error(
                `Issue ${issueId}: the change did not land after 3 writes; the stored Issue still reads without it.`,
              ),
              operation: 'Update',
            }),
          ),
      })),
    )

    const outcome = await run(
      logIssueCommand(host, {
        agent: Option.none(),
        claim: Option.none(),
        commit: Option.none(),
        issue: '692',
        isJson: false,
        state: 'progress',
        status: Option.none(),
        summary: 'Still going.',
      }),
    )

    expect(outcome.exitCode).toBe(1)
    expect(outcome.stderr).toEqual([
      'issues log failed: Update: Issue 692: the change did not land after 3 writes; the stored Issue still reads without it.',
    ])
  })

  it('claims an Issue with a claimed entry and InProgress', async () => {
    const { host, memory } = await run(makeHost([stored('692', 'Filing')]))

    const outcome = await run(
      claimIssueCommand(host, {
        agent: 'claude-code/issues-one-way',
        issue: '692',
        isJson: false,
        summary: Option.none(),
      }),
    )

    expect(outcome.exitCode).toBe(0)
    expect(
      Option.map(fetched(memory, '692'), issue => ({
        claimant: issue.claimantId,
        state: issue.workLog.map(entry => entry.state),
        status: issue.status,
      })),
    ).toEqual(
      Option.some({
        claimant: Option.some('claude-code/issues-one-way'),
        state: [Option.some('claimed')],
        status: 'InProgress',
      }),
    )
  })

  it('shows, logs, claims, and prints work on one Issue without reading the Issue catalog', async () => {
    const catalogReads: Array<string> = []
    const { host } = await run(
      makeHost([stored('692', 'Filing'), stored('693', 'Other')], tracker => ({
        ...tracker,
        observe: query => {
          catalogReads.push(String(query.limit))
          return tracker.observe(query)
        },
      })),
    )

    const outcomes = [
      await run(showIssueCommand(host, { issue: '692', isJson: false })),
      await run(
        logIssueCommand(host, {
          agent: Option.some('claude-code/issues-cpu'),
          claim: Option.none(),
          commit: Option.none(),
          issue: '692',
          isJson: false,
          state: 'progress',
          status: Option.none(),
          summary: 'Measured; fix next.',
        }),
      ),
      await run(
        claimIssueCommand(host, {
          agent: 'claude-code/issues-cpu',
          issue: '692',
          isJson: false,
          summary: Option.none(),
        }),
      ),
      await run(workInProgressCommand(host, noWorkChange('692'))),
    ]

    expect(Array.map(outcomes, outcome => outcome.exitCode)).toEqual([
      0, 0, 0, 0,
    ])
    expect(
      Option.getOrElse(Option.map(Array.head(outcomes), linesOf), () => ''),
    ).toContain('Filing')
    expect(catalogReads).toEqual([])
  })

  it('sets any status and links related Issues', async () => {
    const { host, memory } = await run(
      makeHost([
        stored('502', 'Overwrite'),
        stored('539', 'Mac mini transcription'),
        stored('692', 'Filing'),
      ]),
    )

    const status = await run(
      setIssueStatusCommand(host, {
        issue: '692',
        isJson: false,
        status: 'VerificationNeeded',
      }),
    )
    const linked = await run(
      linkIssuesCommand(host, {
        issue: '692',
        isJson: false,
        targets: ['502', '#539'],
      }),
    )

    expect([status.exitCode, linked.exitCode]).toEqual([0, 0])
    expect(
      Option.map(fetched(memory, '692'), issue => [
        issue.status,
        issue.relatedIssueIds,
      ]),
    ).toEqual(Option.some(['VerificationNeeded', ['502', '539']]))
  })

  it('refuses to link an Issue that does not exist and links nothing', async () => {
    const { host, memory } = await run(
      makeHost([stored('502', 'Overwrite'), stored('692', 'Filing')]),
    )

    const linked = await run(
      linkIssuesCommand(host, {
        issue: '692',
        isJson: false,
        targets: ['502', '999'],
      }),
    )

    expect(linked.exitCode).toBe(3)
    expect(linked.stderr).toEqual([
      'Issue #999 does not exist; nothing was linked.',
    ])
    expect(
      Option.map(fetched(memory, '692'), issue => issue.relatedIssueIds),
    ).toEqual(Option.some([]))
  })

  it('refuses to file an Issue related to ones that do not exist and files nothing', async () => {
    const { host, memory } = await run(makeHost([stored('001', 'One')]))

    const outcome = await run(
      fileIssueCommand(host, {
        agent: Option.none(),
        area: Option.none(),
        claim: Option.none(),
        criteria: [],
        details: Option.none(),
        dryRun: false,
        evidence: [],
        images: [],
        isJson: false,
        isWithoutImages: false,
        jsonInput: Option.none(),
        log: Option.none(),
        logState: Option.none(),
        parent: Option.none(),
        priority: Option.none(),
        product: Option.some('scribe'),
        related: ['001', '998', '#999'],
        said: [],
        status: Option.none(),
        title: Option.some('Related to missing Issues'),
        type: Option.none(),
        typed: Option.none(),
        typedAt: Option.none(),
        typedMessage: Option.none(),
        typedSession: Option.none(),
      }),
    )

    expect(outcome.exitCode).toBe(3)
    expect(outcome.stderr).toEqual([
      'Issues #998, #999 do not exist; nothing was filed.',
    ])
    expect(Option.isNone(fetched(memory, '002'))).toBe(true)
  })

  it('lists with filters and accounts for every stored Issue', async () => {
    const { host } = await run(
      makeHost([
        stored('690', 'Edited screenshots', {
          mentions: [
            IssueMention.make({
              capturedAtMs: Option.none(),
              directQuote: Option.none(),
              id: 'mention-690-1',
              issueId: '690',
              related: [],
              reporter: Option.none(),
              source: RecordingReference.make({
                recording: RecordingMention.make({
                  endMilliseconds: Option.none(),
                  recordingId,
                  screenshotIds: [],
                  startMilliseconds: 1,
                }),
              }),
            }),
          ],
        }),
        stored('691', 'Expose the Mac services', { status: 'InProgress' }),
        stored('692', 'Filing hides the cause'),
      ]),
    )

    const open = await run(
      listIssuesCommand(host, {
        ...allIssues,
        isJson: true,
        statuses: ['Open'],
      }),
    )
    const listed: ReadonlyArray<{ id: string }> = JSON.parse(linesOf(open))
    expect(Array.map(listed, issue => issue.id)).toEqual(['692', '690'])
    expect(open.stderr).toEqual([])

    const fromRecording = await run(
      listIssuesCommand(host, {
        ...allIssues,
        recording: Option.some('208'),
      }),
    )
    expect(fromRecording.stdout).toEqual([
      '#690  P2  Open  Edited screenshots  [Scribe]',
    ])
  })

  it('reads only the asked statuses from the tracker, and still accounts for every Issue in them', async () => {
    const observedStatuses: Array<ReadonlyArray<string>> = []
    const { host } = await run(
      makeHost(
        [
          stored('690', 'Open one'),
          stored('691', 'Working one', { status: 'InProgress' }),
          stored('692', 'Closed one', { status: 'Closed' }),
        ],
        tracker => ({
          ...tracker,
          observe: query => {
            observedStatuses.push(query.statuses)
            return tracker.observe(query)
          },
        }),
      ),
    )

    const outcome = await run(
      listIssuesCommand(host, {
        ...allIssues,
        statuses: ['Open,InProgress'],
      }),
    )

    expect(outcome.exitCode).toBe(0)
    expect(outcome.stderr).toEqual([])
    expect(outcome.stdout).toEqual([
      '#691  P2  InProgress  Working one  [Scribe]',
      '#690  P2  Open  Open one  [Scribe]',
    ])
    expect(observedStatuses).toEqual([['Open', 'InProgress']])
  })

  it('sets an Issue to wait on his answer with its question, and lists and shows the question', async () => {
    const question =
      'May the pricing page go public?\nOptions: 1. Not yet (recommended: the prices are not settled). 2. Yes, publish it.'
    const { host, memory } = await run(
      makeHost([
        stored('2237', 'The pricing page'),
        stored('2238', 'One-command self-host'),
      ]),
    )

    const asked = await run(
      logIssueCommand(host, {
        agent: Option.some('claude-code/needs-input-2263'),
        claim: Option.none(),
        commit: Option.none(),
        issue: '2237',
        isJson: false,
        state: 'question',
        status: Option.some('NeedsUserInput'),
        summary: question,
      }),
    )
    expect(asked.exitCode).toBe(0)
    expect(Option.getOrThrow(fetched(memory, '2237')).status).toBe(
      'NeedsUserInput',
    )

    const waiting = await run(
      listIssuesCommand(host, { ...allIssues, statuses: ['NeedsUserInput'] }),
    )
    expect(waiting.stderr).toEqual([])
    expect(waiting.stdout).toEqual([
      '#2237  P2  NeedsUserInput  The pricing page  [Scribe]',
      '    ? May the pricing page go public?',
      '      Options: 1. Not yet (recommended: the prices are not settled). 2. Yes, publish it.',
    ])

    const everything = await run(listIssuesCommand(host, allIssues))
    expect(everything.stdout).toEqual([
      '#2238  P2  Open  One-command self-host  [Scribe]',
      '#2237  P2  NeedsUserInput  The pricing page  [Scribe]',
      '    ? May the pricing page go public?',
      '      Options: 1. Not yet (recommended: the prices are not settled). 2. Yes, publish it.',
    ])

    const json = await run(
      listIssuesCommand(host, { ...allIssues, isJson: true }),
    )
    const listed: ReadonlyArray<{
      id: string
      openQuestions: ReadonlyArray<{ askedBy: string; question: string }>
    }> = JSON.parse(linesOf(json))
    expect(
      Array.map(listed, issue => [
        issue.id,
        Array.map(issue.openQuestions, open => [open.askedBy, open.question]),
      ]),
    ).toEqual([
      ['2238', []],
      ['2237', [['claude-code/needs-input-2263', question]]],
    ])

    const shown = linesOf(
      await run(showIssueCommand(host, { issue: '2237', isJson: false })),
    )
    expect(shown).toContain(
      'Needs user input\n  May the pricing page go public?\n  Options: 1. Not yet (recommended: the prices are not settled). 2. Yes, publish it.\n  Asked by claude-code/needs-input-2263,',
    )
    expect(shown.indexOf('Needs user input')).toBeLessThan(
      shown.indexOf('Work log'),
    )
    expect(
      linesOf(
        await run(showIssueCommand(host, { issue: '2238', isJson: false })),
      ),
    ).not.toContain('Needs user input')
  })

  it('deletes only with a typed yes, after a backup that holds the stored record', async () => {
    const { backupDirectory, host, memory } = await run(
      makeHost([stored('693', 'Throwaway')]),
    )

    const refused = await run(
      deleteIssueCommand(host, { issue: '693', isJson: false, yes: '' }),
    )
    expect(refused.exitCode).toBe(2)
    expect(Option.isSome(fetched(memory, '693'))).toBe(true)

    const deleted = await run(
      deleteIssueCommand(host, {
        issue: '693',
        isJson: false,
        yes: 'Delete the throwaway test issue.',
      }),
    )

    expect(deleted.exitCode).toBe(0)
    expect(fetched(memory, '693')).toEqual(Option.none())
    const backups = readdirSync(backupDirectory)
    expect(backups).toHaveLength(1)
    const backupPath = join(
      backupDirectory,
      Option.getOrThrow(Array.head(backups)),
    )
    const backup: Readonly<{
      records: ReadonlyArray<{ payloadJson: string }>
    }> = JSON.parse(readFileSync(backupPath, 'utf8'))
    expect(backup).toMatchObject({
      authorization: 'Delete the throwaway test issue.',
      issueId: '693',
      records: [{ issueID: '693' }],
    })
    expect(
      Array.map(backup.records, record => JSON.parse(record.payloadJson)),
    ).toMatchObject([{ title: 'Throwaway' }])
    expect(linesOf(deleted)).toContain(backupPath)
  })

  it('attaches a file: uploads it, links it, and records it on the Issue', async () => {
    const { host, links, memory, storedFiles } = await run(
      makeHost([stored('662', 'Not Synced')]),
    )
    const folder = mkdtempSync(join(tmpdir(), 'issues-attach-'))
    const screenshot = join(folder, 'not synced.png')
    writeFileSync(screenshot, 'png bytes')

    const outcome = await run(
      attachIssueFilesCommand(host, {
        capturedAt: Option.none(),
        contentType: Option.none(),
        files: [screenshot],
        issue: '662',
        isJson: false,
        kind: Option.none(),
      }),
    )

    expect(outcome.exitCode).toBe(0)
    const [path] = [...storedFiles.keys()]
    expect(path).toMatch(/^issues\/662\/[0-9a-f-]{36}-not synced\.png$/)
    expect(links).toEqual(['memory-662->file-1'])
    expect(
      Option.map(fetched(memory, '662'), issue =>
        issue.attachments.map(attachment => ({
          byteCount: attachment.byteCount,
          contentType: attachment.contentType,
          fileName: attachment.fileName,
          id: attachment.id,
          kind: attachment.kind,
          source: attachment.source,
        })),
      ),
    ).toEqual(
      Option.some([
        {
          byteCount: Option.some(9),
          contentType: 'image/png',
          fileName: 'not synced.png',
          id: 'file-1',
          kind: 'Screenshot',
          source: { _tag: 'InstantStorage', fileId: 'file-1' },
        },
      ]),
    )

    const target = mkdtempSync(join(tmpdir(), 'issues-download-'))
    const downloaded = await run(
      downloadIssueFileCommand(host, {
        directory: Option.some(target),
        isForced: false,
        storagePath: path ?? '',
      }),
    )
    expect(downloaded.exitCode).toBe(0)
    expect(readFileSync(join(target, 'not synced.png'), 'utf8')).toBe(
      'png bytes',
    )
    const again = await run(
      downloadIssueFileCommand(host, {
        directory: Option.some(target),
        isForced: false,
        storagePath: path ?? '',
      }),
    )
    expect(again.exitCode).toBe(2)
  })

  it('removes the uploaded file when the Issue does not take it', async () => {
    const { host, storedFiles } = await run(
      makeHost([stored('662', 'Not Synced')], tracker => ({
        ...tracker,
        update: issueId =>
          Effect.fail(
            new IssueTrackerError({
              cause: new Error(`Issue ${issueId}: the change did not land.`),
              operation: 'Update',
            }),
          ),
      })),
    )
    const folder = mkdtempSync(join(tmpdir(), 'issues-attach-'))
    const log = join(folder, 'crash.log')
    writeFileSync(log, 'trace')

    const outcome = await run(
      attachIssueFilesCommand(host, {
        capturedAt: Option.none(),
        contentType: Option.none(),
        files: [log],
        issue: '662',
        isJson: false,
        kind: Option.none(),
      }),
    )

    expect(outcome.exitCode).toBe(1)
    expect(Array.join(outcome.stderr, '\n')).toContain(
      'issues attach failed: Update: Issue 662: the change did not land.',
    )
    expect(storedFiles.size).toBe(0)
  })

  it('edits fields, adds and marks criteria by position or id, and adds a recording Mention', async () => {
    const { host, memory } = await run(makeHost([stored('692', 'Filing')]))

    const edited = await run(
      editIssueCommand(host, {
        area: Option.some('issues CLI'),
        details: Option.none(),
        issue: '692',
        isJson: false,
        priority: Option.some('P1'),
        product: Option.some('foldkit'),
        title: Option.some('Filing hid the cause'),
        type: Option.some('defect'),
      }),
    )
    const added = await run(
      addCriterionCommand(host, {
        evidence: ['FocusedTest,Log'],
        issue: '692',
        isJson: false,
        outcome: 'A failed save names its cause.',
      }),
    )
    const addedAgain = await run(
      addCriterionCommand(host, {
        evidence: [],
        issue: '692',
        isJson: false,
        outcome: 'A product reads by name.',
      }),
    )
    const marked = await run(
      markCriteriaCommand(host, {
        criteria: ['2', 'issue-692-criterion-1'],
        isJson: false,
        isUnsatisfied: false,
        issue: '692',
      }),
    )
    const mentioned = await run(
      addMentionCommand(host, {
        images: [],
        issue: '692',
        isJson: false,
        isWithoutImages: false,
        said: ['208:1885'],
        typed: Option.none(),
        typedAt: Option.none(),
        typedMessage: Option.none(),
        typedSession: Option.none(),
      }),
    )

    expect(
      [edited, added, addedAgain, marked, mentioned].map(
        outcome => outcome.exitCode,
      ),
    ).toEqual([0, 0, 0, 0, 0])
    const issue = Option.getOrThrow(fetched(memory, '692'))
    expect(issue).toMatchObject({
      area: Option.some('issues CLI'),
      issueType: Option.some('defect'),
      priority: 'P1',
      product: { id: 'foldkit' },
      title: 'Filing hid the cause',
    })
    expect(
      issue.successCriteria.map(criterion => [
        criterion.id,
        criterion.isSatisfied,
        criterion.requiredEvidence,
      ]),
    ).toEqual([
      ['issue-692-criterion-1', true, ['FocusedTest', 'Log']],
      ['issue-692-criterion-2', true, ['FocusedTest']],
    ])
    expect(issue.mentions.map(mention => mention.directQuote)).toEqual([
      Option.some(
        `Recording 208 (${recordingId}) #1885: "Show me the real cause instead."`,
      ),
    ])

    const unknown = await run(
      markCriteriaCommand(host, {
        criteria: ['7'],
        isJson: false,
        isUnsatisfied: false,
        issue: '692',
      }),
    )
    expect(unknown.exitCode).toBe(2)
    expect(Array.join(unknown.stderr, '\n')).toContain(
      'Issue #692 has no criterion 7. Its criteria: 1 issue-692-criterion-1',
    )
  })

  it('prints no credential the host holds, wherever a failure names it', () => {
    const adminToken = '7f3c1a52-0692-4e2b-9d41-credential'
    const outcome: IssuesOutcome = {
      exitCode: 1,
      stderr: [
        `issues file failed: File: FetchIssueIds: Record not found: app-admin-token ({"token":"${adminToken}"})`,
      ],
      stdout: [`{"reason":"refused ${adminToken}"}`],
    }

    expect(redactCredentials(outcome, [adminToken])).toEqual({
      exitCode: 1,
      stderr: [
        'issues file failed: File: FetchIssueIds: Record not found: app-admin-token ({"token":"[redacted]"})',
      ],
      stdout: ['{"reason":"refused [redacted]"}'],
    })
    expect(redactCredentials(outcome, ['', 'short'])).toEqual(outcome)
  })

  it('adds a product, lists it, files an Issue under it, and changes nothing when run again', async () => {
    const { host, memory } = await run(
      makeHost([stored('790', 'ACAGA is its own project')]),
    )
    const catalog = await run(makeMemoryProductCatalog([scribeEntry]))
    const withCatalog = withProductCatalog(host, catalog)

    const added = await run(
      addProductCommand(withCatalog, {
        ...acagaInput,
        kind: Option.some('application'),
      }),
    )
    const listed = await run(
      listProductsCommand(withCatalog, { isJson: false }),
    )
    const moved = await run(
      editIssueCommand(withCatalog, {
        area: Option.none(),
        details: Option.none(),
        issue: '790',
        isJson: false,
        priority: Option.none(),
        product: Option.some('acaga'),
        title: Option.none(),
        type: Option.none(),
      }),
    )
    const again = await run(addProductCommand(withCatalog, acagaInput))
    const againAsJson = await run(
      addProductCommand(withCatalog, { ...acagaInput, isJson: true }),
    )

    expect(added).toEqual({
      exitCode: 0,
      stderr: [],
      stdout: ['Added product acaga (ACAGA, Application).'],
    })
    expect(linesOf(listed)).toContain('acaga  ACAGA  (Application)')
    expect(moved.exitCode).toBe(0)
    expect(Option.map(fetched(memory, '790'), issue => issue.product)).toEqual(
      Option.some(ApplicationProduct.make({ id: 'acaga', name: 'ACAGA' })),
    )
    expect(again).toEqual({
      exitCode: 0,
      stderr: [],
      stdout: [
        'Product acaga (ACAGA, Application) is already in the catalog; nothing changed.',
      ],
    })
    expect(againAsJson.stdout).toEqual([
      '{"_tag":"Application","id":"acaga","name":"ACAGA"}',
    ])
    expect(
      Array.map(
        await Effect.runPromise(catalog.fetch),
        entry => entry.product.id,
      ),
    ).toEqual(['scribe', 'acaga'])
  })

  it('refuses a product it cannot add with exit code 2 and writes nothing', async () => {
    const { host } = await run(makeHost([]))
    const catalog = await run(makeMemoryProductCatalog([scribeEntry]))
    const withCatalog = withProductCatalog(host, catalog)
    const addWith = (input: Partial<AddProductInput>) =>
      run(addProductCommand(withCatalog, { ...acagaInput, ...input }))

    const outcomes = [
      await addWith({ id: Option.none() }),
      await addWith({ name: Option.none() }),
      await addWith({ kind: Option.none() }),
      await addWith({ kind: Option.some('Tool') }),
      await addWith({ id: Option.some('ACAGA') }),
      await addWith({
        id: Option.some('scribe'),
        name: Option.some('Scribe Two'),
      }),
    ]

    expect(Array.map(outcomes, outcome => outcome.exitCode)).toEqual([
      2, 2, 2, 2, 2, 2,
    ])
    expect(
      Array.map(outcomes, outcome => Array.join(outcome.stderr, '\n')),
    ).toEqual([
      'issues products add needs --id, such as --id acaga.',
      'issues products add needs --name, such as --name ACAGA.',
      'issues products add needs --kind: Application or Library.',
      '"Tool" is not a product kind. Valid: Application, Library.',
      '"ACAGA" is not a product id: use lowercase letters and digits joined by hyphens, such as acaga or instant-data-swift.',
      'Product scribe is already Scribe (Application); nothing changed.',
    ])
    expect(
      Array.map(
        await Effect.runPromise(catalog.fetch),
        entry => entry.product.id,
      ),
    ).toEqual(['scribe'])
  })

  it('reports a catalog that refuses the product with exit code 1', async () => {
    const { host } = await run(makeHost([]))
    const refusing: ProductCatalogService = {
      fetch: Effect.succeed([scribeEntry]),
      observe: Stream.succeed([scribeEntry]),
      save: () =>
        Effect.fail(
          new ProductCatalogError({
            cause: new Error('Permission denied: instantToolsProducts'),
            operation: 'Save',
          }),
        ),
    }

    const outcome = await run(
      addProductCommand(withProductCatalog(host, refusing), acagaInput),
    )

    expect(outcome).toEqual({
      exitCode: 1,
      stderr: [
        'issues products add failed: Save: Permission denied: instantToolsProducts',
      ],
      stdout: [],
    })
  })

  it('adds, checks, and unchecks subtasks by position or id, and shows them', async () => {
    const { host, memory } = await run(
      makeHost([stored('835', 'Track work in progress')]),
    )

    const added = await run(
      addSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        titles: ['Red tests', 'Green', 'Install the CLI'],
      }),
    )
    const checked = await run(
      markSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        mark: 'Checked',
        subtasks: ['1', 'issue-835-subtask-3'],
      }),
    )
    const unchecked = await run(
      markSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        mark: 'Unchecked',
        subtasks: ['3'],
      }),
    )
    const shown = await run(
      showIssueCommand(host, { issue: '835', isJson: false }),
    )

    expect(added.stdout).toEqual([
      'Added 3 subtasks to #835; 0 of 3 done.',
      '  [ ] 1 Red tests (issue-835-subtask-1)',
      '  [ ] 2 Green (issue-835-subtask-2)',
      '  [ ] 3 Install the CLI (issue-835-subtask-3)',
    ])
    expect(checked.stdout).toEqual([
      'Checked 1, issue-835-subtask-3 on #835; 2 of 3 done.',
    ])
    expect(unchecked.stdout).toEqual(['Unchecked 3 on #835; 1 of 3 done.'])
    expect(
      Option.getOrThrow(fetched(memory, '835')).subtasks.map(subtask => [
        subtask.id,
        subtask.state._tag,
        subtask.title,
      ]),
    ).toEqual([
      ['issue-835-subtask-1', 'Checked', 'Red tests'],
      ['issue-835-subtask-2', 'Unchecked', 'Green'],
      ['issue-835-subtask-3', 'Unchecked', 'Install the CLI'],
    ])
    expect(shown.stdout).toEqual(
      expect.arrayContaining([
        'Subtasks (1 of 3 done)',
        '  [x] 1 Red tests (issue-835-subtask-1)',
        '  [ ] 2 Green (issue-835-subtask-2)',
      ]),
    )

    const unknown = await run(
      markSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        mark: 'Checked',
        subtasks: ['7'],
      }),
    )
    expect(unknown.exitCode).toBe(2)
    expect(Array.join(unknown.stderr, '\n')).toContain(
      'Issue #835 has no subtask 7. Its subtasks: 1 issue-835-subtask-1 "Red tests"',
    )

    const blank = await run(
      addSubtasksCommand(host, { issue: '835', isJson: false, titles: [' '] }),
    )
    expect(blank.exitCode).toBe(2)
    expect(Array.join(blank.stderr, '\n')).toContain(
      'issues subtask add needs a title',
    )
  })

  it('records work in progress, prints it, keeps what a later change leaves out, and clears it', async () => {
    const { host, memory } = await run(
      makeHost([stored('835', 'Track work in progress')]),
    )

    const none = await run(workInProgressCommand(host, noWorkChange('835')))
    expect(none.stdout).toEqual(['No work in progress is recorded on #835.'])

    const red = await run(
      workInProgressCommand(host, {
        ...noWorkChange('835'),
        branch: Option.some('agent/claude/issues-wip-835'),
        repository: Option.some('foldkit'),
        state: Option.some('red'),
        step: Option.some('Red tests written'),
        worktree: Option.some(
          '/Users/laptop/Sync/worktrees/foldkit-issues-wip-835',
        ),
      }),
    )
    const green = await run(
      workInProgressCommand(host, {
        ...noWorkChange('835'),
        commit: Option.some('5e1f00d'),
        state: Option.some('GREEN'),
        targetBuild: Option.some('106'),
      }),
    )
    expect([red.exitCode, green.exitCode]).toEqual([0, 0])
    expect(green.stdout).toEqual([
      'Recorded the work in progress on #835: Green for build 106.',
    ])
    expect(
      Option.getOrThrow(fetched(memory, '835')).workInProgress,
    ).toMatchObject(
      Option.some({
        activity: { _tag: 'Active' },
        agentId: Option.some('claude-code/test'),
        branch: Option.some('agent/claude/issues-wip-835'),
        commitSha: Option.some('5e1f00d'),
        landingState: 'Green',
        lastStep: Option.some('Red tests written'),
        repository: Option.some('foldkit'),
        targetBuild: Option.some('106'),
        worktree: Option.some(
          '/Users/laptop/Sync/worktrees/foldkit-issues-wip-835',
        ),
      }),
    )

    const shown = await run(workInProgressCommand(host, noWorkChange('835')))
    expect(shown.stdout).toEqual([
      '#835 work in progress',
      '  State: Green for build 106',
      '  Branch: agent/claude/issues-wip-835 in foldkit',
      '  Worktree: /Users/laptop/Sync/worktrees/foldkit-issues-wip-835',
      '  Commit: 5e1f00d',
      '  Last step: Red tests written',
      expect.stringMatching(/^  Recorded \S+ by claude-code\/test$/),
    ])

    const stuck = await run(
      workInProgressCommand(host, {
        ...noWorkChange('835'),
        agent: Option.some('claude-code/wip-835@second-account'),
        stuck: Option.some('Waits on a review'),
      }),
    )
    expect(stuck.stdout).toEqual([
      'Recorded the work in progress on #835: Green for build 106, stuck: Waits on a review.',
    ])
    expect(
      Option.getOrThrow(fetched(memory, '835')).workInProgress,
    ).toMatchObject(
      Option.some({
        activity: { _tag: 'Stuck', reason: 'Waits on a review' },
        agentId: Option.some('claude-code/wip-835@second-account'),
      }),
    )

    const unknownState = await run(
      workInProgressCommand(host, {
        ...noWorkChange('835'),
        state: Option.some('done'),
      }),
    )
    expect(unknownState.exitCode).toBe(2)
    expect(Array.join(unknownState.stderr, '\n')).toContain(
      '"done" is not a landing state. Valid: Exploring, Red, Green, Pushed, Merged, Shipped.',
    )

    const twoActivities = await run(
      workInProgressCommand(host, {
        ...noWorkChange('835'),
        isActive: true,
        stuck: Option.some('Waits on a review'),
      }),
    )
    expect(twoActivities.exitCode).toBe(2)
    expect(Array.join(twoActivities.stderr, '\n')).toContain(
      'issues wip takes one of --active, --stuck, or --abandoned.',
    )

    const clearWithChange = await run(
      workInProgressCommand(host, {
        ...noWorkChange('835'),
        isClear: true,
        state: Option.some('red'),
      }),
    )
    expect(clearWithChange.exitCode).toBe(2)

    const cleared = await run(
      workInProgressCommand(host, { ...noWorkChange('835'), isClear: true }),
    )
    expect(cleared.stdout).toEqual(['Cleared the work in progress on #835.'])
    expect(Option.getOrThrow(fetched(memory, '835')).workInProgress).toEqual(
      Option.none(),
    )

    const missingIssue = await run(
      workInProgressCommand(host, {
        ...noWorkChange('999'),
        state: Option.some('red'),
      }),
    )
    expect(missingIssue.exitCode).toBe(3)
  })

  it('shows the work in progress on an Issue', async () => {
    const { host } = await run(
      makeHost([
        stored('804', 'Timeline window drops device events', {
          workInProgress: Option.some(
            workAt(
              'Pushed',
              Option.some('106'),
              StuckWork.make({ reason: 'Waits on the 106 cutter' }),
            ),
          ),
        }),
      ]),
    )

    const shown = await run(
      showIssueCommand(host, { issue: '804', isJson: false }),
    )

    expect(shown.stdout).toEqual(
      expect.arrayContaining([
        'Work in progress',
        '  State: Pushed for build 106',
        '  Stuck: Waits on the 106 cutter',
        '  Branch: agent/claude/work',
        '  Recorded 2026-10-17T18:00:00.000Z by claude-code/wip-835',
      ]),
    )
  })

  it('lists the work close to landing, the work in progress, the stuck work, and the work for one build', async () => {
    const { host } = await run(
      makeHost([
        stored('801', 'Green work', {
          workInProgress: Option.some(workAt('Green', Option.some('106'))),
        }),
        stored('802', 'Pushed and stuck', {
          workInProgress: Option.some(
            workAt(
              'Pushed',
              Option.none(),
              StuckWork.make({ reason: 'Waits on Michael' }),
            ),
          ),
        }),
        stored('803', 'Red work', {
          workInProgress: Option.some(workAt('Red', Option.none())),
        }),
        stored('804', 'Merged work', {
          workInProgress: Option.some(workAt('Merged', Option.some('106'))),
        }),
        stored('805', 'Abandoned green', {
          workInProgress: Option.some(
            workAt(
              'Green',
              Option.none(),
              AbandonedWork.make({ reason: 'Replaced by #801' }),
            ),
          ),
        }),
        stored('806', 'Not started'),
      ]),
    )

    const landing = await run(
      listIssuesCommand(host, { ...allIssues, isLanding: true }),
    )
    const working = await run(
      listIssuesCommand(host, { ...allIssues, isWorkInProgress: true }),
    )
    const stuck = await run(
      listIssuesCommand(host, { ...allIssues, isStuck: true }),
    )
    const forBuild = await run(
      listIssuesCommand(host, {
        ...allIssues,
        targetBuild: Option.some('106'),
      }),
    )
    const landingJson = await run(
      listIssuesCommand(host, { ...allIssues, isJson: true, isLanding: true }),
    )

    expect(landing.stdout).toEqual([
      '#802  P2  Open  Pushed and stuck  [Scribe]  Pushed, stuck: Waits on Michael  agent/claude/work',
      '#801  P2  Open  Green work  [Scribe]  Green for build 106  agent/claude/work',
    ])
    expect(working.stdout).toHaveLength(5)
    expect(stuck.stdout).toEqual([
      '#802  P2  Open  Pushed and stuck  [Scribe]  Pushed, stuck: Waits on Michael  agent/claude/work',
    ])
    expect(forBuild.stdout).toEqual([
      '#804  P2  Open  Merged work  [Scribe]  Merged for build 106  agent/claude/work',
      '#801  P2  Open  Green work  [Scribe]  Green for build 106  agent/claude/work',
    ])
    const listed: ReadonlyArray<{ id: string }> = JSON.parse(
      linesOf(landingJson),
    )
    expect(Array.map(listed, issue => issue.id)).toEqual(['802', '801'])

    const everything = await run(listIssuesCommand(host, allIssues))
    expect(everything.stdout).toContain('#806  P2  Open  Not started  [Scribe]')
    expect(everything.stdout).toContain('#801  P2  Open  Green work  [Scribe]')
  })
})

const DAY_MS = 86_400_000

describe('issues backlog', () => {
  const backlogSeed = () => [
    stored('901', 'Shipped last build', {
      priority: 'P1',
      status: 'InProgress',
      workInProgress: Option.some(workAt('Shipped', Option.some('110'))),
    }),
    stored('902', 'Green for the next build', {
      priority: 'P2',
      status: 'InProgress',
      workInProgress: Option.some(workAt('Green', Option.some('111'))),
    }),
    stored('903', 'Red for the next build', {
      priority: 'P0',
      status: 'InProgress',
      workInProgress: Option.some(workAt('Red', Option.some('111'))),
    }),
    stored('904', 'Oldest P0', {
      priority: 'P0',
      createdAtMs: 1_790_000_000_000,
    }),
    stored('905', 'Newer P0', { priority: 'P0' }),
    stored('906', 'Fixed P0', { priority: 'P0', status: 'Fixed' }),
    stored('907', 'Another P0', { priority: 'P0' }),
  ]

  it('lists the backlog: the next build, then each priority, oldest first', async () => {
    const { host } = await run(makeHost(backlogSeed()))

    const listed = await run(
      listIssuesCommand(host, { ...allIssues, isBacklog: true }),
    )
    const listedJson = await run(
      listIssuesCommand(host, { ...allIssues, isBacklog: true, isJson: true }),
    )
    const firstTwo = await run(
      listIssuesCommand(host, {
        ...allIssues,
        isBacklog: true,
        limit: Option.some(2),
      }),
    )

    expect(listed.stdout).toEqual([
      'Build 111, the next build: 2 Issues',
      '#903  P0  InProgress  Red for the next build  [Scribe]  Red for build 111  agent/claude/work',
      '#902  P2  InProgress  Green for the next build  [Scribe]  Green for build 111  agent/claude/work',
      'P0: 3 Issues',
      '#904  P0  Open  Oldest P0  [Scribe]',
      '#905  P0  Open  Newer P0  [Scribe]',
      '#907  P0  Open  Another P0  [Scribe]',
      'P1: 1 Issue',
      '#901  P1  InProgress  Shipped last build  [Scribe]  Shipped for build 110  agent/claude/work',
    ])
    const ids: ReadonlyArray<{ id: string }> = JSON.parse(linesOf(listedJson))
    expect(Array.map(ids, issue => issue.id)).toEqual([
      '903',
      '902',
      '904',
      '905',
      '907',
      '901',
    ])
    expect(firstTwo.stdout).toEqual([
      'Build 111, the next build: 2 Issues',
      '#903  P0  InProgress  Red for the next build  [Scribe]  Red for build 111  agent/claude/work',
      '#902  P2  InProgress  Green for the next build  [Scribe]  Green for build 111  agent/claude/work',
    ])
  })

  it('ranks an Issue before, after, or at the top of its priority, and the backlog follows', async () => {
    const { host, memory } = await run(makeHost(backlogSeed()))

    const before = await run(
      rankIssueCommand(host, {
        after: Option.none(),
        before: Option.some('905'),
        isClear: false,
        isTop: false,
        issue: '907',
      }),
    )

    expect(before.exitCode).toBe(0)
    expect(before.stdout).toEqual(['Ranked #907 before #905: 2nd of 3 in P0.'])
    const listed = await run(
      listIssuesCommand(host, { ...allIssues, isBacklog: true }),
    )
    expect(listed.stdout.slice(3, 7)).toEqual([
      'P0: 3 Issues',
      '#904  P0  Open  Oldest P0  [Scribe]',
      '#907  P0  Open  Another P0  [Scribe]',
      '#905  P0  Open  Newer P0  [Scribe]',
    ])

    const top = await run(
      rankIssueCommand(host, {
        after: Option.none(),
        before: Option.none(),
        isClear: false,
        isTop: true,
        issue: '905',
      }),
    )
    expect(top.stdout).toEqual(['Ranked #905 at the top: 1st of 3 in P0.'])

    const after = await run(
      rankIssueCommand(host, {
        after: Option.some('907'),
        before: Option.none(),
        isClear: false,
        isTop: false,
        issue: '904',
      }),
    )
    expect(after.stdout).toEqual(['Ranked #904 after #907: 3rd of 3 in P0.'])

    const cleared = await run(
      rankIssueCommand(host, {
        after: Option.none(),
        before: Option.none(),
        isClear: true,
        isTop: false,
        issue: '904',
      }),
    )
    expect(cleared.stdout).toEqual([
      'Cleared the rank of #904: back in age order, 2nd of 3 in P0.',
    ])
    expect(
      Option.map(fetched(memory, '904'), issue => issue.backlogRank),
    ).toEqual(Option.some(Option.none()))
    expect(
      Option.flatMap(fetched(memory, '905'), issue => issue.backlogRank),
    ).toEqual(Option.some(1_790_000_000_000 - DAY_MS))
  })

  it('refuses a rank across priorities, a missing Issue, and no place, with exit code 2 or 3', async () => {
    const { host } = await run(makeHost(backlogSeed()))
    const none = {
      after: Option.none(),
      before: Option.none(),
      isClear: false,
      isTop: false,
    }

    const across = await run(
      rankIssueCommand(host, {
        ...none,
        before: Option.some('901'),
        issue: '904',
      }),
    )
    const missingAnchor = await run(
      rankIssueCommand(host, {
        ...none,
        before: Option.some('999'),
        issue: '904',
      }),
    )
    const noPlace = await run(rankIssueCommand(host, { ...none, issue: '904' }))
    const twoPlaces = await run(
      rankIssueCommand(host, {
        ...none,
        after: Option.some('905'),
        before: Option.some('907'),
        issue: '904',
      }),
    )

    expect(across.exitCode).toBe(2)
    expect(across.stderr).toEqual([
      '#904 is P0 and #901 is P1: a rank orders Issues within one priority. Change the priority first: issues edit 904 --priority P1.',
    ])
    expect(missingAnchor.exitCode).toBe(3)
    expect(noPlace.exitCode).toBe(2)
    expect(noPlace.stderr).toEqual([
      'issues rank needs one place: --before <n>, --after <n>, --top, or --clear.',
    ])
    expect(twoPlaces.exitCode).toBe(2)
  })
})

// Scribe #1345: an Issue carries the screenshots and screen frames of the moment it quotes,
// above all when the Issue is about design.
describe('issues carry the pictures of the moment they quote', () => {
  const designRecordingId = '44b6f249-8e0a-4cb6-b54e-4d1a1100d6b3'
  const designFolderName = '322 — 2026-10-29 — 44b6f249'
  const startedAtMs = 1_793_286_718_000
  // Siri held the microphone for 30 s at 100 s of audio, so from then on a line's wall time is 30 s past
  // startedAt + its audio time, and the pictures (stamped on the wall clock) sit 30 s later too.
  const gapMs = 30_000

  type Picture = Readonly<{
    seconds: number
    source: string | null
    bytes?: string
    extension?: 'jpg' | 'png'
  }>

  const pictureName = ({ seconds, extension = 'jpg' }: Picture) =>
    `pic-${seconds.toString()}.${extension}`

  const addDesignRecording = (
    mirrorRoot: string,
    pictures: ReadonlyArray<Picture>,
  ): string => {
    const folder = join(mirrorRoot, 'recordings', designFolderName)
    mkdirSync(join(folder, 'images'), { recursive: true })
    writeFileSync(
      join(folder, 'meta.json'),
      JSON.stringify({ id: designRecordingId, startedAtMs }),
    )
    const line = (index: number, start: number, end: number, text: string) =>
      JSON.stringify({
        atMs: startedAtMs + start * 1_000,
        end,
        id: `design-${index.toString()}`,
        index,
        recording: designRecordingId,
        start,
        text,
      })
    writeFileSync(
      join(folder, 'transcript.jsonl'),
      Array.join(
        [
          line(66, 923.4, 929, 'Include the screen frames.'),
          line(67, 929, 936.2, 'Especially when we talk about design.'),
          line(68, 937.2, 941.4, 'In the issues.'),
        ],
        '\n',
      ),
    )
    writeFileSync(
      join(folder, 'events.jsonl'),
      Array.join(
        [
          JSON.stringify({
            kind: 'capture.gap',
            offset: 100,
            startedAtMs: startedAtMs + 100_000,
            state: 'open',
          }),
          JSON.stringify({
            endedAtMs: startedAtMs + 100_000 + gapMs,
            kind: 'capture.gap',
            offset: 100,
            startedAtMs: startedAtMs + 100_000,
            state: 'closed',
          }),
        ],
        '\n',
      ),
    )
    const rows = Array.map(pictures, picture => {
      const name = pictureName(picture)
      writeFileSync(
        join(folder, 'images', name),
        picture.bytes ?? `bytes of ${name}`,
      )
      return JSON.stringify({
        atMs: startedAtMs + picture.seconds * 1_000,
        attachment: `attachment-${picture.seconds.toString()}`,
        contentType:
          (picture.extension ?? 'jpg') === 'png' ? 'image/png' : 'image/jpeg',
        file: `/somewhere/else/${name}`,
        offset: picture.seconds,
        path: `images/${name}`,
        recording: designRecordingId,
        source: picture.source,
        v: 1,
      })
    })
    writeFileSync(join(folder, 'images.jsonl'), Array.join(rows, '\n'))
    return folder
  }

  // The lines run 923.4-941.4 s of audio: 953.4-971.4 s on the wall clock after the 30 s gap.
  const framesEveryFiveSeconds = Array.map(
    Array.makeBy(13, step => 925 + step * 5),
    seconds => ({ seconds, source: 'replaykit-frame:other-app' }),
  )
  const designPictures: ReadonlyArray<Picture> = [
    // A screenshot he took just before he spoke: kept (60 s before the first line).
    { extension: 'png', seconds: 900, source: 'photoLibraryScreenshot' },
    // Too early to be about these lines.
    { extension: 'png', seconds: 880, source: 'photoLibraryScreenshot' },
    // Camera photos, pastes, drops, and unlabelled pictures can be family photos: never attached by --said.
    { seconds: 955.5, source: 'photoLibrary' },
    { seconds: 956.5, source: 'pasted' },
    { seconds: 957.5, source: 'droppedFile' },
    { extension: 'png', seconds: 958.5, source: null },
    ...framesEveryFiveSeconds,
  ]

  const fileWith = (
    said: ReadonlyArray<string>,
    overrides: Partial<FileInput> = {},
  ): FileInput => ({
    agent: Option.none(),
    area: Option.none(),
    claim: Option.none(),
    criteria: [],
    details: Option.none(),
    dryRun: false,
    evidence: [],
    images: [],
    isJson: false,
    isWithoutImages: false,
    jsonInput: Option.none(),
    log: Option.none(),
    logState: Option.none(),
    parent: Option.none(),
    priority: Option.none(),
    product: Option.some('scribe'),
    related: [],
    said,
    status: Option.none(),
    title: Option.some('Issues carry their pictures'),
    type: Option.none(),
    typed: Option.none(),
    typedAt: Option.none(),
    typedMessage: Option.none(),
    typedSession: Option.none(),
    ...overrides,
  })

  const mentionWith = (
    issue: string,
    said: ReadonlyArray<string>,
    overrides: Partial<MentionInput> = {},
  ): MentionInput => ({
    images: [],
    issue,
    isJson: false,
    isWithoutImages: false,
    said,
    typed: Option.none(),
    typedAt: Option.none(),
    typedMessage: Option.none(),
    typedSession: Option.none(),
    ...overrides,
  })

  const attachedNames = (tracker: IssueTrackerService, issueId: string) =>
    Option.getOrElse(
      Option.map(fetched(tracker, issueId), issue =>
        Array.map(issue.attachments, attachment => attachment.fileName),
      ),
      () => [],
    )

  it('picks the screenshots and screen frames of the lines on the wall clock, never a photo', async () => {
    const mirrorRoot = makeMirror()
    const folder = addDesignRecording(mirrorRoot, designPictures)

    const said = await run(
      resolveSaid(mirrorRoot, '322:66-68').pipe(
        Effect.orElseSucceed(() => undefined),
      ),
    )

    // Frames 10 s before to 5 s after the lines (943.4-976.4 s wall): 945 ... 975, seven of them, six kept evenly
    // spaced. Without the gap the window would be 913.4-946.4 s and pick 915 ... 945.
    expect(Array.map(said?.images ?? [], image => image.fileName)).toEqual([
      'pic-900.png',
      'pic-945.jpg',
      'pic-950.jpg',
      'pic-955.jpg',
      'pic-965.jpg',
      'pic-970.jpg',
      'pic-975.jpg',
    ])
    expect(said?.images[0]).toMatchObject({
      attachmentId: 'attachment-900',
      capturedAtMs: startedAtMs + 900_000,
      contentType: 'image/png',
      filePath: join(folder, 'images', 'pic-900.png'),
      source: 'photoLibraryScreenshot',
    })
    expect(said?.mention.source).toMatchObject({
      _tag: 'Recording',
      recording: {
        recordingId: designRecordingId,
        screenshotIds: [
          'attachment-900',
          'attachment-945',
          'attachment-950',
          'attachment-955',
          'attachment-965',
          'attachment-970',
          'attachment-975',
        ],
      },
    })
  })

  it('reads a recording with no pictures as none', async () => {
    const mirrorRoot = makeMirror()

    const said = await run(
      resolveSaid(mirrorRoot, '208:1884-1885').pipe(
        Effect.orElseSucceed(() => undefined),
      ),
    )

    expect(said?.images).toEqual([])
    expect(said?.mention.source).toMatchObject({
      recording: { screenshotIds: [] },
    })
  })

  it('issues file --said attaches them, and --image adds a file once however often it is named', async () => {
    const { host, links, memory, storedFiles } = await run(makeHost([]))
    addDesignRecording(host.mirrorRoot, designPictures)
    const extra = join(mkdtempSync(join(tmpdir(), 'issues-image-')), 'mock.png')
    writeFileSync(extra, 'a mockup')
    // The same bytes as the screenshot --said already brings.
    const sameAsScreenshot = join(
      mkdtempSync(join(tmpdir(), 'issues-image-')),
      'copy.png',
    )
    writeFileSync(sameAsScreenshot, 'bytes of pic-900.png')

    const outcome = await run(
      fileIssueCommand(
        host,
        fileWith(['322:66-68', '322:67'], {
          images: [extra, sameAsScreenshot, extra],
        }),
      ),
    )

    expect(outcome.stderr).toEqual([])
    expect(outcome.exitCode).toBe(0)
    const [issueId = ''] = /#(\d+)/.exec(linesOf(outcome))?.slice(1) ?? []
    // 322:67 alone (959-966.2 s wall) also brings frame 960, which the cap left out of 322:66-68; the rest it
    // shares are attached once.
    expect(attachedNames(memory, issueId)).toEqual([
      'pic-900.png',
      'pic-945.jpg',
      'pic-950.jpg',
      'pic-955.jpg',
      'pic-965.jpg',
      'pic-970.jpg',
      'pic-975.jpg',
      'pic-960.jpg',
      'mock.png',
    ])
    expect(storedFiles.size).toBe(9)
    expect(links).toHaveLength(9)
    expect(
      Option.map(fetched(memory, issueId), issue => issue.attachments[0]),
    ).toMatchObject(
      Option.some({
        capturedAtMs: Option.some(startedAtMs + 900_000),
        kind: 'Screenshot',
      }),
    )
    expect(linesOf(outcome)).toContain(
      'Attached 9 pictures: 8 from Recording 322 (1 screenshot, 7 screen frames), 1 named with --image.',
    )
  })

  it('issues file --no-images attaches nothing, and --dry-run names the pictures and uploads none', async () => {
    const { host, storedFiles } = await run(makeHost([]))
    addDesignRecording(host.mirrorRoot, designPictures)

    const without = await run(
      fileIssueCommand(
        host,
        fileWith(['322:66-68'], { isWithoutImages: true }),
      ),
    )
    expect(without.exitCode).toBe(0)
    expect(storedFiles.size).toBe(0)

    const preview = await run(
      fileIssueCommand(host, fileWith(['322:66-68'], { dryRun: true })),
    )
    expect(preview.exitCode).toBe(0)
    expect(storedFiles.size).toBe(0)
    expect(linesOf(preview)).toContain('"fileName": "pic-900.png"')
  })

  it('issues mention --said adds only the pictures the Issue does not have yet', async () => {
    const { host, memory, storedFiles } = await run(
      makeHost([stored('1345', 'Pictures')]),
    )
    addDesignRecording(host.mirrorRoot, designPictures)

    const first = await run(
      addMentionCommand(host, mentionWith('1345', ['322:66'])),
    )
    const again = await run(
      addMentionCommand(host, mentionWith('1345', ['322:66-68'])),
    )

    expect([first.exitCode, again.exitCode]).toEqual([0, 0])
    const names = attachedNames(memory, '1345')
    expect(names).toHaveLength(new Set(names).size)
    expect(names).toEqual([
      'pic-900.png',
      'pic-945.jpg',
      'pic-950.jpg',
      'pic-955.jpg',
      'pic-960.jpg',
      'pic-965.jpg',
      'pic-970.jpg',
      'pic-975.jpg',
    ])
    expect(storedFiles.size).toBe(8)
  })

  it('says which picture failed and that the Issue was still filed', async () => {
    const { host, memory } = await run(makeHost([]))
    addDesignRecording(host.mirrorRoot, [
      { extension: 'png', seconds: 900, source: 'photoLibraryScreenshot' },
    ])
    const failingHost: IssuesHost = {
      ...host,
      files: {
        ...host.files,
        upload: () => Effect.fail(new Error('storage is down')),
      },
    }

    const outcome = await run(
      fileIssueCommand(failingHost, fileWith(['322:66-68'])),
    )

    expect(outcome.exitCode).toBe(1)
    expect(Option.isSome(fetched(memory, '001'))).toBe(true)
    expect(Array.join(outcome.stderr, '\n')).toMatch(
      /Filed #\d+, but attaching pic-900\.png failed: .*storage is down.*issues attach \d+ /,
    )
  })
})

describe('issues working', () => {
  const syncInput = (agents: string, registry: string): WorkingSyncInput => ({
    agents,
    isDryRun: false,
    isSweep: false,
    registry: Option.some(registry),
  })

  const writeSurvey = () => {
    const folder = mkdtempSync(join(tmpdir(), 'issues-working-'))
    const agents = join(folder, 'progress.json')
    const registry = join(folder, 'agents-registry.json')
    writeFileSync(
      agents,
      JSON.stringify({
        agents: [
          {
            account: 'max',
            agentId: 'claude-code/issue-wip-1374@max',
            branch: 'agent/claude/issue-wip-1374',
            harness: 'claude-code',
            issue: 1374,
            kind: 'run',
            name: 'issue-wip-1374',
            startedAtMs: 1_791_999_000_000,
            worktree: '/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374',
          },
          {
            account: null,
            agentId: null,
            branch: null,
            harness: 'claude-code',
            issue: null,
            kind: 'subagent',
            name: null,
            startedAtMs: null,
            worktree: null,
          },
        ],
        dead: [],
        generatedAtMs: 1_792_000_000_000,
        sessions: [{ account: 'al', name: 'claude-code', pid: 10675 }],
      }),
    )
    writeFileSync(
      registry,
      JSON.stringify({
        agents: [
          {
            ended: '2026-10-29T17:00:00-04:00',
            issue: 1201,
            name: 'sweep-1201',
            started: '2026-10-29T15:00:00-04:00',
            state: 'done',
          },
          {
            issue: 1374,
            name: 'issue-wip-1374',
            started: '2026-10-29T18:13:28-04:00',
            state: 'running',
          },
          { id: 'a row with no name', state: 'stopped' },
        ],
        tasks: [],
      }),
    )
    return { agents, registry }
  }

  const seed = () => [
    stored('1374', 'Show who works on what', {
      claimantId: Option.some('claude-code/issue-wip-1374@max'),
      status: 'InProgress',
      updatedAtMs: 1_791_999_500_000,
    }),
    stored('1201', 'Sweep the backlog', {
      claimantId: Option.some('claude-code/sweep-1201@ld'),
      status: 'InProgress',
      updatedAtMs: 1_791_999_500_000,
    }),
    stored('880', 'Merged work', {
      status: 'InProgress',
      updatedAtMs: 1_791_999_500_000,
      workInProgress: Option.some(workAt('Merged', Option.none())),
    }),
    stored('806', 'Not started', { updatedAtMs: 1_791_999_500_000 }),
  ]

  it('records who works on the Issues of running and recently ended agents, and releases ended claims', async () => {
    const { host, memory } = await run(makeHost(seed()))
    const { agents, registry } = writeSurvey()

    const synced = await run(
      workingSyncCommand(host, syncInput(agents, registry)),
    )

    expect(synced.exitCode).toBe(0)
    expect(synced.stdout).toEqual([
      '#1374 running claude-code/issue-wip-1374@max, 1 file touched',
      '#1201 Released the claim of claude-code/sweep-1201@ld: its run ended (done) and no agent is running on #1201.',
      'Checked 2 Issues against 1 running agent: 2 changed.',
    ])
    expect(Option.getOrThrow(fetched(memory, '1201')).claimantId).toEqual(
      Option.none(),
    )
    expect(Option.getOrThrow(fetched(memory, '880')).status).toBe('InProgress')

    const again = await run(
      workingSyncCommand(host, syncInput(agents, registry)),
    )
    expect(again.stdout).toEqual([
      'Checked 2 Issues against 1 running agent: 0 changed.',
    ])
  })

  it('sweeps every Issue, moving merged work to verification', async () => {
    const { host, memory } = await run(makeHost(seed()))
    const { agents, registry } = writeSurvey()

    const swept = await run(
      workingSyncCommand(host, {
        ...syncInput(agents, registry),
        isSweep: true,
      }),
    )

    expect(swept.stdout).toEqual([
      '#1374 running claude-code/issue-wip-1374@max, 1 file touched',
      '#1201 Released the claim of claude-code/sweep-1201@ld: its run ended (done) and no agent is running on #1201.',
      '#880 InProgress → VerificationNeeded: the work is Merged',
      'Checked 4 Issues against 1 running agent: 3 changed.',
    ])
    expect(Option.getOrThrow(fetched(memory, '880')).status).toBe(
      'VerificationNeeded',
    )
  })

  it('sweeps every Issue, whatever its status: an agent shown running on an Issue that moved on reads as ended, and a finished Issue loses its claim', async () => {
    const shownRunning = IssueAgentPresence.make({
      account: Option.some('max'),
      agentId: 'claude-code/perf-waste-fixes@max',
      branch: Option.some('agent/claude/perf-waste-fixes'),
      harness: Option.some('claude-code'),
      run: RunningAgent.make({ sinceMs: 1_791_000_000_000 }),
      startedAtMs: Option.none(),
      touchedFiles: Option.none(),
      worktree: Option.none(),
    })
    const { host, memory } = await run(
      makeHost([
        ...seed(),
        stored('1507', 'Energy ledger gaps', {
          agentPresence: Option.some(shownRunning),
          claimantId: Option.some('claude-code/perf-waste-fixes@max'),
          status: 'VerificationNeeded',
          updatedAtMs: 1_791_999_500_000,
          workLog: [
            IssueWorkLogEntry.make({
              agentId: Option.some('claude-code/perf-waste-fixes@max'),
              commitSha: Option.none(),
              durationSeconds: Option.none(),
              id: 'work-1507-progress-1',
              occurredAtMs: 1_791_999_500_000,
              state: Option.some('progress'),
              summary: 'Landed on main; verify after the install.',
            }),
          ],
        }),
        stored('265', 'Landscape layout', {
          claimantId: Option.some('claude-code/landscape-265@max'),
          status: 'Verified',
          updatedAtMs: 1_791_999_500_000,
        }),
      ]),
    )
    const { agents, registry } = writeSurvey()

    const unswept = await run(
      workingSyncCommand(host, syncInput(agents, registry)),
    )
    expect(linesOf(unswept)).not.toMatch(/#1507|#265/)

    const swept = await run(
      workingSyncCommand(host, {
        ...syncInput(agents, registry),
        isSweep: true,
      }),
    )

    expect(swept.stdout).toEqual(
      expect.arrayContaining([
        '#1507 claude-code/perf-waste-fixes@max ended (no longer running)',
        '#265 Released the claim of claude-code/landscape-265@max: #265 is Verified and no agent named landscape-265 is running.',
      ]),
    )
    const sweptGhost = Option.getOrThrow(fetched(memory, '1507'))
    expect(
      Option.map(sweptGhost.agentPresence, presence => presence.run._tag),
    ).toEqual(Option.some('Ended'))
    expect(sweptGhost.status).toBe('VerificationNeeded')
    expect(Option.getOrThrow(fetched(memory, '265')).claimantId).toEqual(
      Option.none(),
    )
    expect(Option.getOrThrow(fetched(memory, '806')).workLog).toEqual([])
  })

  it('counts no files in a worktree several running agents share, and says so', async () => {
    const counted: Array<string> = []
    const made = await run(makeHost(seed()))
    const host: IssuesHost = {
      ...made.host,
      countTouchedFiles: worktree => {
        counted.push(worktree)
        return made.host.countTouchedFiles(worktree)
      },
    }
    const folder = mkdtempSync(join(tmpdir(), 'issues-working-'))
    const agents = join(folder, 'progress.json')
    const shared = '/Users/laptop/Sync/tools/realtime-voice'
    writeFileSync(
      agents,
      JSON.stringify({
        agents: [
          {
            account: 'max',
            agentId: 'claude-code/issue-wip-1374@max',
            issue: 1374,
            name: 'issue-wip-1374',
            worktree: shared,
          },
          {
            account: 'max',
            agentId: 'claude-code/sweep-1201@max',
            issue: 1201,
            name: 'sweep-1201',
            worktree: shared,
          },
        ],
        dead: [],
        generatedAtMs: 1_792_000_000_000,
      }),
    )

    const synced = await run(
      workingSyncCommand(host, {
        agents,
        isDryRun: false,
        isSweep: false,
        registry: Option.none(),
      }),
    )

    expect(counted).toEqual([])
    expect(synced.stdout).toEqual([
      '#1374 running claude-code/issue-wip-1374@max',
      '#1201 running claude-code/sweep-1201@max',
      'Files not counted in /Users/laptop/Sync/tools/realtime-voice: 2 running agents share it.',
      'Checked 2 Issues against 2 running agents: 2 changed.',
    ])
  })

  it('counts a worktree again only once its last count is ten minutes old', async () => {
    const counted: Array<number> = []
    const made = await run(makeHost(seed()))
    const host: IssuesHost = {
      ...made.host,
      countTouchedFiles: worktree => {
        counted.push(counted.length + 1)
        return made.host.countTouchedFiles(worktree)
      },
    }
    const { agents, registry } = writeSurvey()
    const surveyAt = (minutes: number) => {
      const path = join(
        mkdtempSync(join(tmpdir(), 'issues-working-')),
        'p.json',
      )
      writeFileSync(
        path,
        JSON.stringify({
          ...JSON.parse(readFileSync(agents, 'utf8')),
          generatedAtMs: 1_792_000_000_000 + minutes * 60_000,
        }),
      )
      return path
    }

    await run(workingSyncCommand(host, syncInput(agents, registry)))
    await run(workingSyncCommand(host, syncInput(surveyAt(5), registry)))
    expect(counted).toEqual([1])

    await run(workingSyncCommand(host, syncInput(surveyAt(11), registry)))
    expect(counted).toEqual([1, 2])
  })

  it('says what a dry run would change and writes nothing', async () => {
    const { host, memory } = await run(makeHost(seed()))
    const { agents, registry } = writeSurvey()

    const dry = await run(
      workingSyncCommand(host, {
        ...syncInput(agents, registry),
        isDryRun: true,
      }),
    )

    expect(dry.stdout).toContain(
      'Dry run: checked 2 Issues against 1 running agent: 2 would change.',
    )
    expect(Option.getOrThrow(fetched(memory, '1201')).claimantId).toEqual(
      Option.some('claude-code/sweep-1201@ld'),
    )
  })

  it('fails with the reason when the progress check cannot be read', async () => {
    const { host } = await run(makeHost(seed()))

    const failed = await run(
      workingSyncCommand(host, {
        agents: '/nonexistent/progress.json',
        isDryRun: false,
        isSweep: false,
        registry: Option.none(),
      }),
    )

    expect(failed.exitCode).toBe(1)
    expect(linesOf({ ...failed, stdout: failed.stderr })).toContain(
      '/nonexistent/progress.json',
    )
  })

  it('shows a Now working block on the Issue and lists the Issues an agent works on now', async () => {
    const { host } = await run(makeHost(seed()))
    const { agents, registry } = writeSurvey()
    await run(workingSyncCommand(host, syncInput(agents, registry)))

    const shown = await run(
      showIssueCommand(host, { issue: '1374', isJson: false }),
    )
    expect(shown.stdout).toEqual(
      expect.arrayContaining([
        'Now working',
        '  Agent: claude-code/issue-wip-1374@max (account max)',
        '  Running: yes, seen since 2026-10-14T17:46:40.000Z (started 2026-10-14T17:30:00.000Z)',
        '  Branch: agent/claude/issue-wip-1374',
        '  Worktree: /Users/laptop/Sync/worktrees/foldkit-issue-wip-1374',
        '  Files: 1 touched against technoplato/main (counted 2026-10-14T17:46:40.000Z)',
        '    foldkit-issue-wip-1374/src/nowWorking.ts  +40 -2',
      ]),
    )

    const working = await run(
      listIssuesCommand(host, { ...allIssues, isWorking: true }),
    )
    expect(working.stdout).toEqual([
      '#1374  P2  InProgress  Show who works on what  [Scribe]  running claude-code/issue-wip-1374@max  agent/claude/issue-wip-1374  1 file touched',
    ])
  })
})

describe("issues show lists the Issue's build jobs", () => {
  const nowMs = 1_792_000_000_000
  const measured = BuildJob.make({
    agent: 'build-sh-1412',
    endedAtMs: nowMs - 60_000,
    exitCode: 0,
    heartbeatAtMs: nowMs - 60_000,
    id: 'job-measure',
    issueNumber: 1412,
    label: 'measure-1412-cold',
    machine: 'mini',
    queuedAtMs: nowMs - 600_000,
    slot: 1,
    startedAtMs: nowMs - 240_000,
    state: 'passed',
    warm: true,
  })
  const buildIssue = stored('1412', 'build.sh on the mini', {
    claimantId: Option.some('claude-code/build-sh-1412'),
    successCriteria: [
      IssueSuccessCriterion.make({
        id: 'issue-1412-criterion-1',
        outcome: 'A job on the mini is queryable from the issues tool.',
        requiredEvidence: ['FocusedTest'],
      }),
    ],
    workInProgress: Option.some(workAt('Pushed', Option.none())),
  })
  const reading = (
    host: IssuesHost,
    read: BuildJobsRead,
  ): Readonly<{ asked: Array<number>; host: IssuesHost }> => {
    const asked: Array<number> = []
    return {
      asked,
      host: {
        ...host,
        readBuildJobs: issueNumber => {
          asked.push(issueNumber)
          return Effect.succeed(read)
        },
      },
    }
  }

  it('prints them after Now working and Work in progress, before the success criteria', async () => {
    const made = await run(makeHost([buildIssue]))
    const { asked, host } = reading(
      made.host,
      FoundBuildJobs.make({ jobs: [measured], unreadable: [] }),
    )

    const shown = await run(
      showIssueCommand(host, { issue: '1412', isJson: false }),
    )

    expect(shown.exitCode).toBe(0)
    expect(asked).toEqual([1412])
    const text = linesOf(shown)
    expect(text).toContain(
      "\n\nBuilds (Scribe's buildJobs, newest first)\n  10-14 13:36  passed  mini slot 1 warm  measure-1412-cold  exit 0  ran 3 min, waited 6 min  build-sh-1412\n",
    )
    expect(text.indexOf('Now working')).toBeLessThan(
      text.indexOf('Work in progress'),
    )
    expect(text.indexOf('Work in progress')).toBeLessThan(
      text.indexOf("Builds (Scribe's buildJobs"),
    )
    expect(text.indexOf("Builds (Scribe's buildJobs")).toBeLessThan(
      text.indexOf('Success criteria'),
    )
  })

  it('still shows the Issue, with one line saying why, when Scribe cannot be read', async () => {
    const made = await run(makeHost([buildIssue]))
    const { host } = reading(
      made.host,
      UnavailableBuildJobs.make({
        reason: "Scribe's Instant app did not answer within 5 seconds.",
      }),
    )

    const shown = await run(
      showIssueCommand(host, { issue: '1412', isJson: false }),
    )

    expect(shown.exitCode).toBe(0)
    expect(shown.stderr).toEqual([])
    expect(shown.stdout).toContain(
      "Builds not shown: Scribe's Instant app did not answer within 5 seconds.",
    )
    expect(shown.stdout).toContain('build.sh on the mini')
  })

  it('prints no Builds section when the Issue has no jobs', async () => {
    const { host } = await run(makeHost([buildIssue]))

    const text = linesOf(
      await run(showIssueCommand(host, { issue: '1412', isJson: false })),
    )

    expect(text).toContain('Work in progress')
    expect(text).not.toContain('Builds')
  })

  it('puts them under builds in --json, or says why under buildsNotShown', async () => {
    const made = await run(makeHost([buildIssue]))
    const withJobs = reading(
      made.host,
      FoundBuildJobs.make({ jobs: [measured], unreadable: [] }),
    )
    const withoutScribe = reading(
      made.host,
      UnavailableBuildJobs.make({ reason: 'no Scribe Instant credentials.' }),
    )

    const json = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(withJobs.host, { issue: '1412', isJson: true }),
        ),
      ),
    )
    const unavailable = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(withoutScribe.host, {
            issue: '1412',
            isJson: true,
          }),
        ),
      ),
    )

    expect(json).toMatchObject({ builds: [measured], id: '1412' })
    expect(json).not.toHaveProperty('buildsNotShown')
    expect(unavailable).toMatchObject({
      buildsNotShown: 'no Scribe Instant credentials.',
      id: '1412',
    })
    expect(unavailable).not.toHaveProperty('builds')
  })

  it('asks for the number the Issue is stored under, and nothing for a number it cannot read', async () => {
    const made = await run(makeHost([stored('041', 'An early Issue')]))
    const { asked, host } = reading(
      made.host,
      FoundBuildJobs.make({ jobs: [], unreadable: [] }),
    )

    await run(showIssueCommand(host, { issue: '#041', isJson: false }))
    const refused = await run(
      showIssueCommand(host, { issue: 'issue-041', isJson: false }),
    )

    expect(asked).toEqual([41])
    expect(refused.exitCode).toBe(2)
  })
})

describe('the recordings that mention an Issue (Scribe #2248)', () => {
  const recordingMention = (id: string, startMilliseconds: number) =>
    IssueMention.make({
      capturedAtMs: Option.some(1_794_405_520_766 + startMilliseconds),
      directQuote: Option.some(`Recording 411 (${id})`),
      id,
      issueId: '2248',
      related: [],
      reporter: Option.none(),
      source: RecordingReference.make({
        recording: RecordingMention.make({
          endMilliseconds: Option.some(startMilliseconds + 1_000),
          recordingId,
          screenshotIds: [],
          startMilliseconds,
        }),
      }),
    })
  const mentioned = stored('2248', 'Mentions and their recordings', {
    mentions: [
      recordingMention('mention-2248-1', 202_144),
      recordingMention('mention-2248-2', 900_000),
    ],
  })
  const twoMentions = FoundIssueRecordings.make({
    recordings: [
      IssueRecording.make({
        id: recordingId,
        mentions: [
          IssueRecordingMention.make({
            id: 'row-1',
            maybeCapturedAtMs: Option.some(1),
            maybeLine: Option.some({
              first: 10,
              last: 15,
              segmentId: 'segment-10',
            }),
            maybeStartSeconds: Option.some(202.144),
          }),
          IssueRecordingMention.make({
            id: 'row-2',
            maybeCapturedAtMs: Option.some(2),
            maybeLine: Option.none(),
            maybeStartSeconds: Option.some(900),
          }),
        ],
        startedAtMs: 1_794_405_000_000,
        title: 'Recording 411 — Nov 11, 2026',
      }),
    ],
  })

  it('show prints each recording with how many times it mentions the Issue, above the mentions, asking for the Issue by its number', async () => {
    const made = await run(makeHost([mentioned]))
    const asked: Array<number> = []
    const host: IssuesHost = {
      ...made.host,
      readIssueRecordings: issueNumber => {
        asked.push(issueNumber)
        return Effect.succeed(twoMentions)
      },
    }
    const text = linesOf(
      await run(showIssueCommand(host, { issue: '2248', isJson: false })),
    )
    expect(asked).toEqual([2248])
    expect(text).toContain(
      "Recordings (2 mentions in 1 recording, from Scribe's rows)\n  Recording 411 — Nov 11, 2026  2 mentions\n" +
        `    #10-15  https://og.pisspoursoftware.xyz/recording/${recordingId}/section/segment-10?t=202.14\n` +
        `    https://og.pisspoursoftware.xyz/recording/${recordingId}?t=900`,
    )
    expect(text.indexOf('Recordings (')).toBeLessThan(
      text.indexOf('\nMentions\n'),
    )
  })

  it('show --json gives the recordings with their counts, or why they could not be read', async () => {
    const made = await run(makeHost([mentioned]))
    const json = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueRecordings: () => Effect.succeed(twoMentions),
            },
            { issue: '2248', isJson: true },
          ),
        ),
      ),
    )
    const unavailable = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueRecordings: () =>
                Effect.succeed(
                  UnavailableIssueRecordings.make({ reason: 'no answer.' }),
                ),
            },
            { issue: '2248', isJson: true },
          ),
        ),
      ),
    )
    expect(json.recordings[0]).toMatchObject({
      id: recordingId,
      mentionCount: 2,
    })
    expect(unavailable).toMatchObject({ recordingsNotShown: 'no answer.' })
    expect(unavailable).not.toHaveProperty('recordings')
  })

  it('list --json carries each Issue’s mentionCount: every mention once, two in one recording twice', async () => {
    const made = await run(
      makeHost([mentioned, stored('2249', 'Never mentioned')]),
    )
    const listed = JSON.parse(
      linesOf(
        await run(listIssuesCommand(made.host, { ...allIssues, isJson: true })),
      ),
    ) as ReadonlyArray<{ id: string; mentionCount: number }>
    expect(listed.map(issue => [issue.id, issue.mentionCount]).sort()).toEqual([
      ['2248', 2],
      ['2249', 0],
    ])
  })
})

describe('an Issue’s agents, and a recording’s (Scribe #2303)', () => {
  const ASKED_MS = Date.parse('2026-11-12T12:39:50Z')
  const recording398 = 'b619ec79-8d48-474e-8dc3-7d7d4862b48a'
  const agentRows = [
    {
      id: 'issue-agents-2303',
      agentID: 'claude-code/issue-agents-2303@max',
      account: 'max',
      harness: 'claude-code',
      issueNumber: 2303,
      kind: 'headless',
      name: 'issue-agents-2303',
      remoteURL: 'https://claude.ai/code/session_EXAMPLE_RUN',
      status: 'running',
      startedAtMs: ASKED_MS + 107 * 60_000,
    },
  ]
  const agentsOf = (issueNumbers: ReadonlyArray<number>): IssueAgentsRead =>
    FoundIssueAgents.make({
      issues: issueAgentsOf(issueNumbers, { agentRuns: agentRows }),
    })
  const mentionRows = {
    issueMentions: [
      {
        id: 'm1',
        capturedAtMs: 1_000,
        issue: [
          {
            number: 2303,
            title: 'Agents on their Issue',
            status: 'InProgress',
          },
        ],
        recording: [
          {
            id: recording398,
            title: 'Recording 398 — Nov 8, 2026',
            startedAtMs: 1,
          },
        ],
      },
    ],
  }
  const issue2303 = stored('2303', 'Agents on their Issue')
  const mirrorWith = (
    folders: ReadonlyArray<readonly [string, string]>,
  ): string => {
    const root = mkdtempSync(join(tmpdir(), 'issues-agents-mirror-'))
    for (const [folder, id] of folders) {
      const path = join(root, 'recordings', folder)
      mkdirSync(path, { recursive: true })
      writeFileSync(
        join(path, 'meta.json'),
        JSON.stringify({ v: 1, id, folder, title: `Recording ${folder}` }),
      )
    }
    return root
  }

  it('show prints the agents started for the Issue, read by its number, before its work log', async () => {
    const made = await run(makeHost([issue2303]))
    const asked: Array<ReadonlyArray<number>> = []
    const text = linesOf(
      await run(
        showIssueCommand(
          {
            ...made.host,
            readIssueAgents: issueNumbers => {
              asked.push(issueNumbers)
              return Effect.succeed(agentsOf(issueNumbers))
            },
          },
          { issue: '2303', isJson: false },
        ),
      ),
    )
    expect(asked).toEqual([[2303]])
    expect(text).toContain(
      "Agents (1 started for this Issue, newest first, from Scribe's rows)\n" +
        '  issue-agents-2303  ·  running, started 11-12 09:26  ·  claude-code  ·  account max\n' +
        '    claude-code/issue-agents-2303@max\n' +
        '    Claude: https://claude.ai/code/session_EXAMPLE_RUN\n' +
        '    Chat: scribe-shared://agent/issue-agents-2303',
    )
  })

  it('show --json gives the agents, or why they could not be read', async () => {
    const made = await run(makeHost([issue2303]))
    const json = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueAgents: issueNumbers =>
                Effect.succeed(agentsOf(issueNumbers)),
            },
            { issue: '2303', isJson: true },
          ),
        ),
      ),
    )
    const unavailable = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueAgents: () =>
                Effect.succeed(
                  UnavailableIssueAgents.make({ reason: 'no answer.' }),
                ),
            },
            { issue: '2303', isJson: true },
          ),
        ),
      ),
    )
    expect(json.agents[0]).toMatchObject({
      name: 'issue-agents-2303',
      account: 'max',
      claudeLink: 'https://claude.ai/code/session_EXAMPLE_RUN',
      chatLink: 'scribe-shared://agent/issue-agents-2303',
    })
    expect(unavailable).toMatchObject({ agentsNotShown: 'no answer.' })
    expect(unavailable).not.toHaveProperty('agents')
  })

  it('recording lists the Issues its lines mention, each with its agents, by its id', async () => {
    const made = await run(makeHost([issue2303]))
    const askedRecordings: Array<string> = []
    const askedIssues: Array<ReadonlyArray<number>> = []
    const outcome = await run(
      showRecordingCommand(
        {
          ...made.host,
          readRecordingIssues: recordingId => {
            askedRecordings.push(recordingId)
            return Effect.succeed(
              FoundRecordingIssues.make({
                recording: recordingIssuesOf(recordingId, mentionRows),
              }),
            )
          },
          readIssueAgents: issueNumbers => {
            askedIssues.push(issueNumbers)
            return Effect.succeed(agentsOf(issueNumbers))
          },
        },
        { recording: recording398.toUpperCase(), isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(0)
    expect(askedRecordings).toEqual([recording398])
    expect(askedIssues).toEqual([[2303]])
    expect(outcome.stdout.slice(0, 5)).toEqual([
      `Recording 398 — Nov 8, 2026  ${recording398}`,
      "1 mention of 1 Issue in Scribe's rows; agents started for 1 of them",
      '',
      '#2303  Agents on their Issue  [InProgress]  1 mention',
      '  issue-agents-2303  ·  running, started 11-12 09:26  ·  claude-code  ·  account max',
    ])
  })

  it('recording finds a number’s id in the mirror’s folder', async () => {
    const made = await run(makeHost([issue2303]))
    const asked: Array<string> = []
    const outcome = await run(
      showRecordingCommand(
        {
          ...made.host,
          mirrorRoot: mirrorWith([
            [
              '397 — 2026-11-08 — 0d7a1f63',
              '0d7a1f63-0000-4000-8000-000000000397',
            ],
            ['398 — 2026-11-08 — b619ec79', recording398],
          ]),
          readRecordingIssues: recordingId => {
            asked.push(recordingId)
            return Effect.succeed(
              FoundRecordingIssues.make({
                recording: recordingIssuesOf(recordingId, mentionRows),
              }),
            )
          },
          readIssueAgents: issueNumbers =>
            Effect.succeed(agentsOf(issueNumbers)),
        },
        { recording: '398', isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(0)
    expect(asked).toEqual([recording398])
  })

  it('recording refuses a number two mirror folders share, naming both ids', async () => {
    const made = await run(makeHost([issue2303]))
    const outcome = await run(
      showRecordingCommand(
        {
          ...made.host,
          mirrorRoot: mirrorWith([
            [
              '020 — 2026-09-30 — 1a2b3c4d',
              '1a2b3c4d-0000-4000-8000-000000000020',
            ],
            [
              '020 — 2026-10-02 — 5e6f7a8b',
              '5e6f7a8b-0000-4000-8000-000000000020',
            ],
          ]),
        },
        { recording: '20', isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(2)
    expect(outcome.stderr.join('\n')).toContain(
      '1a2b3c4d-0000-4000-8000-000000000020',
    )
    expect(outcome.stderr.join('\n')).toContain(
      '5e6f7a8b-0000-4000-8000-000000000020',
    )
  })

  it('recording says when no mirror folder has the number', async () => {
    const made = await run(makeHost([issue2303]))
    const outcome = await run(
      showRecordingCommand(
        { ...made.host, mirrorRoot: mirrorWith([]) },
        { recording: '9999', isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(3)
    expect(outcome.stderr.join('\n')).toContain('9999')
  })

  it('recording fails, saying why, when Scribe’s rows cannot be read', async () => {
    const made = await run(makeHost([issue2303]))
    const outcome = await run(
      showRecordingCommand(
        {
          ...made.host,
          readRecordingIssues: () =>
            Effect.succeed(
              UnavailableRecordingIssues.make({ reason: 'no answer.' }),
            ),
        },
        { recording: recording398, isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(1)
    expect(outcome.stderr.join('\n')).toContain('no answer.')
  })

  it('recording --json gives the recording, its mention count, and each Issue with its count and agents', async () => {
    const made = await run(makeHost([issue2303]))
    const json = JSON.parse(
      linesOf(
        await run(
          showRecordingCommand(
            {
              ...made.host,
              readRecordingIssues: recordingId =>
                Effect.succeed(
                  FoundRecordingIssues.make({
                    recording: recordingIssuesOf(recordingId, mentionRows),
                  }),
                ),
              readIssueAgents: issueNumbers =>
                Effect.succeed(agentsOf(issueNumbers)),
            },
            { recording: recording398, isJson: true },
          ),
        ),
      ),
    )
    expect(json).toMatchObject({
      recording: { id: recording398, title: 'Recording 398 — Nov 8, 2026' },
      mentionCount: 1,
      issues: [
        {
          number: 2303,
          mentionCount: 1,
          agents: [{ name: 'issue-agents-2303', account: 'max' }],
        },
      ],
    })
  })
})

describe('true epics: an Issue’s parent and its children (Scribe #2348)', () => {
  const epic = stored('2347', 'Epic: ready for release', {
    issueType: Option.some('epic'),
  })
  const child = stored('2332', 'QR sign-in', {
    priority: 'P1',
    status: 'InProgress',
  })
  const defect = stored('2340', 'A plain defect')
  const childRows = {
    issues: [
      {
        number: 2333,
        title: 'One scribe command',
        status: 'Closed',
        priority: 'P2',
        issueType: 'feature',
      },
      {
        number: 2332,
        title: 'QR sign-in',
        status: 'InProgress',
        priority: 'P1',
        issueType: 'feature',
      },
    ],
  }
  const foundChildren = FoundIssueChildren.make({
    children: issueChildrenOf(childRows),
  })
  const parentInput = (
    issue: string,
    parent: Option.Option<string>,
    isClear = false,
  ) => ({ issue, isClear, isJson: false, parent })
  const fileUnder = (parent: string): FileInput => ({
    agent: Option.none(),
    area: Option.none(),
    claim: Option.none(),
    criteria: [],
    details: Option.none(),
    dryRun: false,
    evidence: [],
    images: [],
    isJson: false,
    isWithoutImages: false,
    jsonInput: Option.none(),
    log: Option.none(),
    logState: Option.none(),
    parent: Option.some(parent),
    priority: Option.none(),
    product: Option.some('scribe'),
    related: [],
    said: [],
    status: Option.none(),
    title: Option.some('A child of the release epic'),
    type: Option.some('feature'),
    typed: Option.none(),
    typedAt: Option.none(),
    typedMessage: Option.none(),
    typedSession: Option.none(),
  })

  it('knows epic as an issue type', () => {
    expect(issueTypes).toContain('epic')
  })

  it('files an Issue under an epic with --parent, and files nothing under a parent that is not an epic or does not exist', async () => {
    const { host, memory } = await run(makeHost([epic, defect]))
    const filed = await run(fileIssueCommand(host, fileUnder('2347')))
    expect(filed.exitCode).toBe(0)
    expect(linesOf(filed)).toContain('Filed #2348')
    expect(Option.getOrThrow(fetched(memory, '2348')).parentIssueId).toEqual(
      Option.some('2347'),
    )

    const notEpic = await run(fileIssueCommand(host, fileUnder('2340')))
    expect(notEpic.exitCode).toBe(2)
    expect(Array.join(notEpic.stderr, '\n')).toContain(
      '#2340 is not an epic (its type is defect)',
    )
    expect(Array.join(notEpic.stderr, '\n')).toContain(
      'issues edit 2340 --type epic',
    )
    const unknown = await run(fileIssueCommand(host, fileUnder('9999')))
    expect(unknown.exitCode).toBe(3)
    expect(Array.join(unknown.stderr, '\n')).toContain(
      'Issue #9999 does not exist',
    )
    expect(fetched(memory, '2349')).toEqual(Option.none())
  })

  it('sets an Issue’s parent, clears it, and reads each change back', async () => {
    const { host, memory } = await run(makeHost([epic, child]))
    const set = await run(
      parentIssueCommand(host, parentInput('2332', Option.some('#2347'))),
    )
    expect(set).toMatchObject({
      exitCode: 0,
      stdout: ['Set the parent of #2332 to #2347: Epic: ready for release.'],
    })
    expect(Option.getOrThrow(fetched(memory, '2332')).parentIssueId).toEqual(
      Option.some('2347'),
    )

    const cleared = await run(
      parentIssueCommand(host, parentInput('2332', Option.none(), true)),
    )
    expect(cleared.stdout).toEqual([
      'Cleared the parent of #2332; it was #2347.',
    ])
    expect(Option.getOrThrow(fetched(memory, '2332')).parentIssueId).toEqual(
      Option.none(),
    )

    const again = await run(
      parentIssueCommand(host, parentInput('2332', Option.none(), true)),
    )
    expect(again).toMatchObject({
      exitCode: 0,
      stdout: ['#2332 has no parent.'],
    })
  })

  it('refuses a parent no Issue holds, one that is not an epic, the Issue itself, and a cycle', async () => {
    const outerEpic = stored('2350', 'An epic under the release epic', {
      issueType: Option.some('epic'),
      parentIssueId: Option.some('2347'),
    })
    const { host, memory } = await run(
      makeHost([epic, child, defect, outerEpic]),
    )
    const refused = async (
      issue: string,
      parent: Option.Option<string>,
      isClear = false,
    ) => {
      const outcome = await run(
        parentIssueCommand(host, parentInput(issue, parent, isClear)),
      )
      return { code: outcome.exitCode, text: Array.join(outcome.stderr, '\n') }
    }

    expect(await refused('2332', Option.some('9999'))).toEqual({
      code: 3,
      text: 'Issue #9999 does not exist; no parent was set.',
    })
    expect(await refused('9998', Option.some('2347'))).toMatchObject({
      code: 3,
    })
    expect(await refused('2332', Option.some('2340'))).toEqual({
      code: 2,
      text: "#2340 is not an epic (its type is defect); an Issue's parent is an epic. Make it one first: issues edit 2340 --type epic",
    })
    expect(await refused('2347', Option.some('2347'))).toEqual({
      code: 2,
      text: '#2347 cannot be its own parent.',
    })
    expect(await refused('2347', Option.some('2350'))).toEqual({
      code: 2,
      text: '#2350 sits under #2347 already (#2350, then #2347): #2347 under #2350 would make a cycle.',
    })
    expect((await refused('2332', Option.none())).code).toBe(2)
    expect((await refused('2332', Option.some('2347'), true)).code).toBe(2)
    expect(Option.getOrThrow(fetched(memory, '2347')).parentIssueId).toEqual(
      Option.none(),
    )
    expect(Option.getOrThrow(fetched(memory, '2332')).parentIssueId).toEqual(
      Option.none(),
    )
  })

  it('removes subtasks by position or id and prints the checklist after', async () => {
    const { host, memory } = await run(
      makeHost([stored('835', 'Track work in progress')]),
    )
    await run(
      addSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        titles: ['Red tests', 'Green', 'Install the CLI'],
      }),
    )
    const removed = await run(
      removeSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        subtasks: ['1', 'issue-835-subtask-3'],
      }),
    )
    expect(removed.stdout).toEqual([
      'Removed 1, issue-835-subtask-3 from #835; 0 of 1 done.',
      '  [ ] 1 Green (issue-835-subtask-2)',
    ])
    expect(
      Option.getOrThrow(fetched(memory, '835')).subtasks.map(
        subtask => subtask.id,
      ),
    ).toEqual(['issue-835-subtask-2'])

    const unknown = await run(
      removeSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        subtasks: ['7'],
      }),
    )
    expect(unknown.exitCode).toBe(2)
    expect(Array.join(unknown.stderr, '\n')).toContain(
      'Issue #835 has no subtask 7. Its subtasks: 1 issue-835-subtask-2 "Green"',
    )
    const none = await run(
      removeSubtasksCommand(host, {
        issue: '835',
        isJson: false,
        subtasks: [],
      }),
    )
    expect(none.exitCode).toBe(2)
  })

  it('show prints the parent, and an epic’s children read from Scribe’s rows by its number, open first', async () => {
    const underEpic = Issue.make({
      ...child,
      parentIssueId: Option.some('2347'),
    })
    const made = await run(makeHost([epic, underEpic]))
    const asked: Array<number> = []
    const host: IssuesHost = {
      ...made.host,
      readIssueChildren: issueNumber => {
        asked.push(issueNumber)
        return Effect.succeed(
          issueNumber === 2347
            ? foundChildren
            : FoundIssueChildren.make({
                children: issueChildrenOf({ issues: [] }),
              }),
        )
      },
    }
    const childText = linesOf(
      await run(showIssueCommand(host, { issue: '2332', isJson: false })),
    )
    expect(childText).toContain('Parent: #2347 Epic: ready for release (Open)')
    expect(childText).not.toContain('Children')

    const epicText = linesOf(
      await run(showIssueCommand(host, { issue: '2347', isJson: false })),
    )
    expect(asked).toEqual([2332, 2347])
    expect(epicText).toContain(
      'Children (1 of 2 done)\n' +
        '  #2332  InProgress  P1  QR sign-in\n' +
        '  #2333  Closed  P2  One scribe command',
    )
  })

  it('show still shows the Issue, saying why its children are not shown, when they cannot be read', async () => {
    const made = await run(makeHost([epic]))
    const outcome = await run(
      showIssueCommand(
        {
          ...made.host,
          readIssueChildren: () =>
            Effect.succeed(
              UnavailableIssueChildren.make({
                reason: 'Attributes are missing in your schema: parentNumber',
              }),
            ),
        },
        { issue: '2347', isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(0)
    expect(linesOf(outcome)).toContain(
      'Children not shown: Attributes are missing in your schema: parentNumber',
    )
  })

  it('show --json gives the parent, the children with their progress, or why they could not be read', async () => {
    const underEpic = Issue.make({
      ...child,
      parentIssueId: Option.some('2347'),
    })
    const made = await run(makeHost([epic, underEpic]))
    const epicJson = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueChildren: () => Effect.succeed(foundChildren),
            },
            { issue: '2347', isJson: true },
          ),
        ),
      ),
    )
    expect(epicJson.children).toMatchObject({
      progress: { done: 1, total: 2 },
      issues: [
        { id: '2332', number: 2332, status: 'InProgress', priority: 'P1' },
        { id: '2333', number: 2333, status: 'Closed' },
      ],
    })
    const childJson = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueChildren: () =>
                Effect.succeed(
                  UnavailableIssueChildren.make({ reason: 'no answer.' }),
                ),
            },
            { issue: '2332', isJson: true },
          ),
        ),
      ),
    )
    expect(childJson).toMatchObject({
      parentIssueId: '2347',
      parent: {
        id: '2347',
        title: 'Epic: ready for release',
        status: 'Open',
      },
      childrenNotShown: 'no answer.',
    })
    expect(childJson).not.toHaveProperty('children')
  })
})

describe('where an Issue is named: recordings and Claude sessions (Scribe #2348)', () => {
  const NAMED_MS = Date.parse('2026-11-13T14:20:00Z')
  const MINUTE_MS = 60_000
  const recording428 = 'aa11bb22-0000-4000-8000-000000000428'
  const sessionUrl = 'https://claude.ai/code/session_01EXAMPLE'
  const epic = stored('2347', 'Epic: ready for release', {
    issueType: Option.some('epic'),
  })
  const base = {
    issueNumber: 2347,
    matchedBy: 'number',
    source: 'test',
  }
  const lineRow = (index: number) => ({
    ...base,
    id: `l${index.toString()}`,
    placeKind: 'line',
    quote: `Line ${index.toString()} names 2347.`,
    atMs: NAMED_MS + index * MINUTE_MS,
    recordingID: recording428,
    segmentID: `segment-${index.toString()}`,
    startSeconds: 12.5,
    lineIndex: index,
    authorKind: 'person',
    authorName: 'Michael',
  })
  const rows = {
    issueReferences: [
      lineRow(0),
      {
        ...base,
        id: 's1',
        placeKind: 'session',
        quote: 'Logged on #2347',
        atMs: NAMED_MS + MINUTE_MS,
        lastAtMs: NAMED_MS + 80 * MINUTE_MS,
        claudeURL: sessionUrl,
        agentID: 'claude-code/tracker-epics-2348@pp',
        account: 'pp',
        role: 'worked',
        source: 'workLog',
      },
      {
        ...base,
        id: 's2',
        placeKind: 'session',
        quote: 'Read #2347 too',
        atMs: NAMED_MS + 10 * MINUTE_MS,
        claudeURL: sessionUrl,
        agentName: 'tracker-epics-2348-foldkit',
        role: 'named',
        source: 'toolCall',
      },
      {
        ...base,
        id: 's3',
        placeKind: 'session',
        quote: 'named #2347 in passing',
        atMs: NAMED_MS + 2 * MINUTE_MS,
        hostSessionID: 'other-host',
        source: 'agentMessage',
      },
    ],
  }
  const found = FoundIssueReferences.make({
    references: issueReferencesOf(rows, [
      { id: recording428, title: 'Recording 428 — Nov 12, 2026' },
    ]),
  })

  it('show prints each recording place that names the Issue and each session, read by its number', async () => {
    const made = await run(makeHost([epic]))
    const asked: Array<number> = []
    const text = linesOf(
      await run(
        showIssueCommand(
          {
            ...made.host,
            readIssueReferences: issueNumber => {
              asked.push(issueNumber)
              return Effect.succeed(found)
            },
          },
          { issue: '2347', isJson: false },
        ),
      ),
    )
    expect(asked).toEqual([2347])
    expect(text).toContain(
      "Named in recordings (1 place in 1 recording, newest first, from Scribe's rows)\n" +
        '  Recording 428 — Nov 12, 2026\n' +
        `    line #0  11-13 09:20  Michael  https://og.pisspoursoftware.xyz/recording/${recording428}/section/segment-0?t=12.5\n` +
        '      "Line 0 names 2347."',
    )
    expect(text).toContain(
      "Sessions (2 that name #2347, newest first, from Scribe's rows)\n" +
        '  claude-code/tracker-epics-2348@pp  ·  account pp  ·  worked  ·  11-13 09:21 to 11-13 10:40\n' +
        `    ${sessionUrl}\n` +
        '    "Logged on #2347"\n' +
        '    sub-agent tracker-epics-2348-foldkit  ·  named  ·  11-13 09:30\n' +
        '      "Read #2347 too"\n' +
        '  session other-host  ·  named  ·  11-13 09:22\n' +
        '    no claude.ai link was recorded\n' +
        '    "named #2347 in passing"',
    )
  })

  it('show prints the newest 20 places and says how many more --json gives', async () => {
    const made = await run(makeHost([epic]))
    const many = FoundIssueReferences.make({
      references: issueReferencesOf({
        issueReferences: Array.makeBy(25, lineRow),
      }),
    })
    const text = linesOf(
      await run(
        showIssueCommand(
          { ...made.host, readIssueReferences: () => Effect.succeed(many) },
          { issue: '2347', isJson: false },
        ),
      ),
    )
    expect(text).toContain('Named in recordings (25 places in 1 recording')
    expect(text).toContain('line #24  ')
    expect(text).not.toContain('line #4  ')
    expect(text).toContain('  5 more: issues show 2347 --json')
  })

  it('show still shows the Issue, saying why, when the places cannot be read', async () => {
    const made = await run(makeHost([epic]))
    const outcome = await run(
      showIssueCommand(
        {
          ...made.host,
          readIssueReferences: () =>
            Effect.succeed(
              UnavailableIssueReferences.make({
                reason: 'issueReferences is not in the schema yet',
              }),
            ),
        },
        { issue: '2347', isJson: false },
      ),
    )
    expect(outcome.exitCode).toBe(0)
    expect(linesOf(outcome)).toContain(
      'Named in recordings and sessions not shown: issueReferences is not in the schema yet',
    )
  })

  it('show --json gives the places and the sessions, or why they could not be read', async () => {
    const made = await run(makeHost([epic]))
    const json = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            { ...made.host, readIssueReferences: () => Effect.succeed(found) },
            { issue: '2347', isJson: true },
          ),
        ),
      ),
    )
    expect(json.references.recordings[0]).toMatchObject({
      id: recording428,
      title: 'Recording 428 — Nov 12, 2026',
      placeCount: 1,
      places: [
        {
          kind: 'line',
          quote: 'Line 0 names 2347.',
          link: `https://og.pisspoursoftware.xyz/recording/${recording428}/section/segment-0?t=12.5`,
          authorName: 'Michael',
          lineIndex: 0,
          atMs: NAMED_MS,
        },
      ],
    })
    expect(json.references.sessions[0]).toMatchObject({
      claudeURL: sessionUrl,
      own: {
        agentId: 'claude-code/tracker-epics-2348@pp',
        role: 'worked',
        firstQuote: 'Logged on #2347',
      },
      subagents: [{ agentName: 'tracker-epics-2348-foldkit', role: 'named' }],
    })
    expect(json.references.sessions[1]).toMatchObject({
      claudeLinkMissing: 'no claude.ai link was recorded',
      hostSessionId: 'other-host',
    })
    const unavailable = JSON.parse(
      linesOf(
        await run(
          showIssueCommand(
            {
              ...made.host,
              readIssueReferences: () =>
                Effect.succeed(
                  UnavailableIssueReferences.make({ reason: 'no answer.' }),
                ),
            },
            { issue: '2347', isJson: true },
          ),
        ),
      ),
    )
    expect(unavailable).toMatchObject({ referencesNotShown: 'no answer.' })
    expect(unavailable).not.toHaveProperty('references')
  })
})
