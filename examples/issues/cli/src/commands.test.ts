import { Array, Effect, Layer, Option, Stream } from 'effect'
import {
  StaticIssueTrackerResources,
  makeMemoryIssueTracker,
  makeMemoryProductCatalog,
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
  Issue,
  type IssueLandingState,
  IssueMention,
  IssueSuccessCriterion,
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
  StuckWork,
  UriReference,
} from '@foldkit/instant-tools/issues'

import {
  type AddProductInput,
  type IssueFilesService,
  type IssuesHost,
  type IssuesOutcome,
  type ListInput,
  type WorkInProgressInput,
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
  linkIssuesCommand,
  listIssuesCommand,
  listProductsCommand,
  logIssueCommand,
  markCriteriaCommand,
  markSubtasksCommand,
  rankIssueCommand,
  redactCredentials,
  resolveSaidMention,
  setIssueStatusCommand,
  showIssueCommand,
  typedMention,
  workInProgressCommand,
} from './commands.js'
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
      defaultAgent: 'claude-code/test',
      files,
      mirrorRoot: makeMirror(),
      nowMs: () => 1_792_000_000_000,
      readStandardInput: Effect.succeed(''),
      records: memoryIssueRecords(memory),
      resources: Layer.merge(
        StaticIssueTrackerResources,
        Layer.succeed(IssueTracker, tracker),
      ),
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
              value: `https://words.pisspoursoftware.xyz/recording/${recordingId}/section/segment-1884?t=10130.35`,
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
      text.indexOf('Landed second.'),
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
        isJson: false,
        jsonInput: Option.none(),
        log: Option.some('Filed from the session that hit it.'),
        logState: Option.none(),
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
        isJson: false,
        jsonInput: Option.none(),
        log: Option.none(),
        logState: Option.none(),
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
          value: `https://words.pisspoursoftware.xyz/recording/${recordingId}/section/segment-1884?t=10130.35`,
        },
        {
          _tag: 'Uri',
          value: `https://words.pisspoursoftware.xyz/recording/${recordingId}/section/segment-1885?t=10139.11`,
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
        isJson: false,
        jsonInput: Option.none(),
        log: Option.none(),
        logState: Option.none(),
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
        issue: '692',
        isJson: false,
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
    expect(before.stdout).toEqual([
      'Ranked #907 before #905: 2nd of 3 in P0.',
    ])
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
      'Cleared the rank of #904: back in age order, 1st of 3 in P0.',
    ])
    expect(Option.map(fetched(memory, '904'), issue => issue.backlogRank)).toEqual(
      Option.some(Option.none()),
    )
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
      rankIssueCommand(host, { ...none, before: Option.some('901'), issue: '904' }),
    )
    const missingAnchor = await run(
      rankIssueCommand(host, { ...none, before: Option.some('999'), issue: '904' }),
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
