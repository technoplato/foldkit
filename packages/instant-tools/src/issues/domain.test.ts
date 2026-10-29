import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AbandonedWork,
  ActiveWork,
  ApplicationProduct,
  CheckedSubtask,
  Issue,
  ChangedFile,
  EndedAgent,
  IssueAgentPresence,
  IssueAttachment,
  IssueComplexity,
  IssueLandingState,
  IssueMention,
  IssueNewestFirst,
  type IssuePriority,
  IssueSourceDocument,
  IssueStatus,
  IssueSubtask,
  IssueSuccessCriterion,
  IssueSuccessEvidence,
  type IssueWorkActivity,
  IssueWorkInProgress,
  IssueWorkLogEntry,
  MediaReference,
  RunningAgent,
  RecordingMention,
  RecordingReference,
  RepositoryAttachmentSource,
  StuckWork,
  UncheckedSubtask,
  BinaryFile,
  escalatePriority,
  StaleAgent,
  UntrackedFile,
  isCloseToLanding,
  isWorkingNow,
  issueViewerUrl,
  nextIssueId,
  normalizeIssueId,
  registerMention,
} from './domain.js'

const firstMention = IssueMention.make({
  capturedAtMs: Option.some(1_753_825_157_000),
  directQuote: Option.some('the date time stamp is still not in the gutter'),
  id: 'mention-1',
  issueId: 'issue-021',
  related: [
    MediaReference.make({
      id: '67D962C8-4C7D-4EF9-9C16-5AFA136595F9',
      kind: 'screenshot',
    }),
  ],
  reporter: Option.none(),
  source: RecordingReference.make({
    recording: RecordingMention.make({
      endMilliseconds: Option.some(50_290),
      recordingId: '265DA0E4-7F4E-40C2-B9CF-7A067D9B1F62',
      screenshotIds: ['67D962C8-4C7D-4EF9-9C16-5AFA136595F9'],
      startMilliseconds: 47_409,
    }),
  }),
})

const workAt = (
  landingState: IssueLandingState,
  activity: IssueWorkActivity = ActiveWork.make({}),
) =>
  IssueWorkInProgress.make({
    activity,
    agentId: Option.some('claude-code/wip-835'),
    branch: Option.some('agent/claude/issues-wip-835'),
    commitSha: Option.some('84be45c4e'),
    landingState,
    lastStep: Option.some('Green: every focused test passes'),
    repository: Option.some('foldkit'),
    targetBuild: Option.some('106'),
    updatedAtMs: 1_792_260_000_000,
    worktree: Option.some(
      '/Users/laptop/Sync/worktrees/foldkit-issues-wip-835',
    ),
  })

const makeIssue = () =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_753_800_000_000,
    details: '',
    id: 'issue-021',
    issueType: Option.none(),
    mentions: [],
    priority: 'P4',
    product: ApplicationProduct.make({
      id: 'scribe',
      name: 'Scribe',
    }),
    projectId: Option.some('transcript-ui'),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [
      IssueSuccessCriterion.make({
        id: 'compact-initial-placement',
        outcome: 'The first transcript row starts at the top reading position.',
        requiredEvidence: [
          'FocusedTest',
          'SimulatorInteraction',
          'PhysicalDeviceInteraction',
        ],
      }),
    ],
    title: 'Put the full recording timestamp in the gutter',
    updatedAtMs: 1_753_800_000_000,
    viewerURL: Option.none(),
    workLog: [],
  })

describe('issue domain', () => {
  it('preserves planned feature workflow state', () => {
    expect(S.decodeUnknownSync(IssueStatus)('Planned')).toBe('Planned')
  })

  it('preserves research as live success evidence', () => {
    expect(S.decodeUnknownSync(IssueSuccessEvidence)('Research')).toBe(
      'Research',
    )
  })

  it('preserves code review as live success evidence', () => {
    expect(S.decodeUnknownSync(IssueSuccessEvidence)('CodeReview')).toBe(
      'CodeReview',
    )
  })

  it('preserves performance and multi-device as live success evidence', () => {
    expect(S.decodeUnknownSync(IssueSuccessEvidence)('Performance')).toBe(
      'Performance',
    )
    expect(S.decodeUnknownSync(IssueSuccessEvidence)('MultiDevice')).toBe(
      'MultiDevice',
    )
  })

  it('preserves catalog Issue references and omitted related arrays', () => {
    const mention = S.decodeUnknownSync(IssueMention)({
      capturedAtMs: 1_753_825_157_000,
      id: 'mention-issue-link',
      issueId: '218',
      source: { _tag: 'Agent', id: 'grok-4.6-issues-evidence' },
      related: [{ _tag: 'Issue', id: '044' }],
    })
    expect(mention.related).toEqual([{ _tag: 'Issue', id: '044' }])

    const omittedRelated = S.decodeUnknownSync(IssueMention)({
      capturedAtMs: 1_753_825_157_000,
      id: 'mention-legacy-related',
      issueId: '044',
      source: { _tag: 'Agent', id: 'grok-4.6-issues-evidence' },
    })
    expect(omittedRelated.related).toEqual([])
  })

  it('preserves live High and Medium complexity labels', () => {
    expect(S.decodeUnknownSync(IssueComplexity)('High')).toBe('High')
    expect(S.decodeUnknownSync(IssueComplexity)('Medium')).toBe('Medium')
  })

  it('accepts only explicitly enumerated success evidence', () => {
    expect(S.decodeUnknownSync(IssueSuccessEvidence)('Snapshot')).toBe(
      'Snapshot',
    )
    expect(() =>
      S.decodeUnknownSync(IssueSuccessEvidence)('FutureEvidence'),
    ).toThrow()
    expect(() => S.decodeUnknownSync(IssueSuccessEvidence)('')).toThrow()
  })

  it('defaults missing legacy attachment metadata to none', () => {
    const attachment = S.decodeUnknownSync(IssueAttachment)({
      contentType: 'image/png',
      fileName: 'issue-capture.png',
      id: 'attachment-legacy',
      issueId: 'issue-legacy',
      kind: 'Screenshot',
      source: RepositoryAttachmentSource.make({
        path: 'recordings/issue-capture.png',
      }),
    })

    expect(attachment.byteCount).toEqual(Option.none())
    expect(attachment.capturedAtMs).toEqual(Option.none())
    expect(attachment.sha256).toEqual(Option.none())
  })

  it('defaults a missing legacy source-document location to none', () => {
    const sourceDocument = S.decodeUnknownSync(IssueSourceDocument)({
      body: '# Image analysis',
      format: 'Markdown',
    })

    expect(sourceDocument.location).toEqual(Option.none())
  })

  it('defaults missing legacy Mention metadata to none', () => {
    const mention = S.decodeUnknownSync(IssueMention)({
      capturedAtMs: 1_753_825_157_000,
      id: 'mention-legacy',
      issueId: 'issue-legacy',
      related: [],
      source: {
        _tag: 'Recording',
        recording: {
          endMilliseconds: null,
          recordingId: 'recording-legacy',
          screenshotIds: [],
          startMilliseconds: 0,
        },
      },
    })

    expect(mention.directQuote).toEqual(Option.none())
    expect(mention.reporter).toEqual(Option.none())
  })

  it('reads a Mention stored without a capture time, with a bare reporter name and a note', () => {
    const storedMention = {
      directQuote: 'The list stops before the newest Issue.',
      id: 'mention-584-1',
      issueId: '584',
      note: 'Recording 199 #245',
      reporter: 'main',
      source: { _tag: 'Agent', id: 'claude-code-main' },
    }
    const mention = S.decodeUnknownSync(IssueMention)(storedMention)

    expect(mention.capturedAtMs).toEqual(Option.none())
    expect(mention.note).toEqual(Option.some('Recording 199 #245'))
    expect(mention.reporter).toEqual(
      Option.some({ _tag: 'Unrecognized', value: 'main' }),
    )
    expect(S.encodeUnknownSync(IssueMention)(mention)).toEqual({
      ...storedMention,
      capturedAtMs: null,
      related: [],
    })
  })

  it('keeps reference shapes it does not model verbatim through a save', () => {
    const conversation = {
      _tag: 'Conversation',
      conversation: { note: 'Relayed by the coordinating session.' },
    }
    const labeledRecording = {
      _tag: 'Recording',
      id: '096',
      label: 'Recording 096 timestamp 0:18',
    }
    const storedMention = {
      capturedAtMs: 1_753_825_157_000,
      directQuote: null,
      id: 'mention-478-1',
      issueId: '478',
      note: null,
      related: ['147', { issueId: '216' }, labeledRecording],
      reporter: null,
      source: conversation,
    }
    const mention = S.decodeUnknownSync(IssueMention)(storedMention)

    expect(mention.source).toEqual(conversation)
    expect(Array.map(mention.related, reference => reference._tag)).toEqual([
      'Unrecognized',
      'Unrecognized',
      'Unrecognized',
    ])
    expect(S.encodeUnknownSync(IssueMention)(mention)).toEqual(storedMention)
  })

  it('still reads a modeled reference as its own variant', () => {
    const mention = S.decodeUnknownSync(IssueMention)({
      capturedAtMs: 1_753_825_157_000,
      id: 'mention-modeled',
      issueId: '218',
      related: [{ _tag: 'Issue', id: '044' }],
      source: { _tag: 'Agent', id: 'grok-4.6-issues-evidence' },
    })

    expect(mention.source).toEqual({
      _tag: 'Agent',
      id: 'grok-4.6-issues-evidence',
    })
    expect(mention.related).toEqual([{ _tag: 'Issue', id: '044' }])
  })

  it('reads work-log rows an older writer stored under other keys', () => {
    const issue = makeIssue()
    const encoded = S.encodeUnknownSync(Issue)(issue)
    const decoded = S.decodeUnknownSync(Issue)({
      ...encoded,
      workLog: [
        {
          agent: 'claude-code',
          atMs: 1_785_851_462_354,
          id: 'issue-146-work-1',
          note: 'Diagnosed from a sample capture.',
        },
        {
          agentId: 'grok-4.6-playback-blink',
          id: 'issue-221-worklog-claim',
          summary: 'Claimed.',
          timestampMs: 1_787_155_632_190,
        },
        {
          id: 'issue-146-work-2',
          occurredAtMs: 1_785_878_005_116,
          summary: 'Consumed the fix.',
        },
      ],
    })

    expect(decoded.workLog).toEqual([
      IssueWorkLogEntry.make({
        agentId: Option.some('claude-code'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: 'issue-146-work-1',
        occurredAtMs: 1_785_851_462_354,
        state: Option.none(),
        summary: 'Diagnosed from a sample capture.',
      }),
      IssueWorkLogEntry.make({
        agentId: Option.some('grok-4.6-playback-blink'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: 'issue-221-worklog-claim',
        occurredAtMs: 1_787_155_632_190,
        state: Option.none(),
        summary: 'Claimed.',
      }),
      IssueWorkLogEntry.make({
        agentId: Option.none(),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: 'issue-146-work-2',
        occurredAtMs: 1_785_878_005_116,
        state: Option.none(),
        summary: 'Consumed the fix.',
      }),
    ])
  })

  it('rejects a work-log row with no time under any known key', () => {
    const issue = makeIssue()
    const encoded = S.encodeUnknownSync(Issue)(issue)

    expect(() =>
      S.decodeUnknownSync(Issue)({
        ...encoded,
        workLog: [{ id: 'issue-undated', summary: 'No time.' }],
      }),
    ).toThrow()
  })

  it('preserves the stored Complex complexity label', () => {
    expect(S.decodeUnknownSync(IssueComplexity)('Complex')).toBe('Complex')
  })

  it('keeps updatedAtMs when a registered Mention has no capture time', () => {
    const issue = makeIssue()
    const registration = registerMention(
      issue,
      IssueMention.make({
        ...firstMention,
        capturedAtMs: Option.none(),
        id: 'mention-undated',
        issueId: issue.id,
      }),
    )

    expect(registration._tag).toBe('Accepted')
    expect(registration.issue.updatedAtMs).toBe(issue.updatedAtMs)
  })

  it('orders Issues newest first and breaks a creation-time tie by id', () => {
    const issue = makeIssue()
    const older = Issue.make({ ...issue, createdAtMs: 1_000, id: '575' })
    const newerLowId = Issue.make({ ...issue, createdAtMs: 2_000, id: '583' })
    const newerHighId = Issue.make({ ...issue, createdAtMs: 2_000, id: '584' })

    expect(
      Array.map(
        Array.sort([older, newerLowId, newerHighId], IssueNewestFirst),
        sorted => sorted.id,
      ),
    ).toEqual(['584', '583', '575'])
  })

  it('defaults missing legacy work-log metadata to none', () => {
    const entry = S.decodeUnknownSync(IssueWorkLogEntry)({
      id: 'work-log-legacy',
      occurredAtMs: 1_753_825_157_000,
      state: 'Addressing',
      summary: 'Investigated the issue.',
    })

    expect(entry.agentId).toEqual(Option.none())
    expect(entry.commitSha).toEqual(Option.none())
    expect(entry.durationSeconds).toEqual(Option.none())
  })

  it('escalates one step toward P0 and saturates there', () => {
    const priorities: ReadonlyArray<IssuePriority> = [
      'P4',
      'P3',
      'P2',
      'P1',
      'P0',
      'P0',
    ]
    expect(
      priorities.reduce<IssuePriority>(
        current => escalatePriority(current),
        'P4',
      ),
    ).toBe('P0')
    expect(escalatePriority('P4')).toBe('P3')
    expect(escalatePriority('P0')).toBe('P0')
  })

  it('keeps the first mention at baseline and escalates later unique mentions', () => {
    const accepted = registerMention(makeIssue(), firstMention)
    expect(accepted._tag).toBe('Accepted')
    expect(accepted.issue.priority).toBe('P4')

    const secondMention = IssueMention.make({
      ...firstMention,
      id: 'mention-2',
    })
    const escalated = registerMention(accepted.issue, secondMention)
    expect(escalated._tag).toBe('AcceptedAndEscalated')
    expect(escalated.issue.priority).toBe('P3')
    expect(escalated.issue.mentions).toHaveLength(2)

    const duplicate = registerMention(escalated.issue, secondMention)
    expect(duplicate._tag).toBe('Duplicate')
    expect(duplicate.issue.priority).toBe('P3')
    expect(duplicate.issue.mentions).toHaveLength(2)
  })

  it('round-trips exact recording, quote, and screenshot evidence through Schema', () => {
    const attachment = IssueAttachment.make({
      byteCount: Option.some(334_048),
      capturedAtMs: Option.some(1_753_842_697_000),
      contentType: 'image/png',
      fileName: '2026-07-29-excessive-initial-vertical-offset.png',
      id: 'attachment-042-1',
      issueId: 'issue-021',
      kind: 'Screenshot',
      sha256: Option.some(
        '28da2c5f4e14e976f3c04f56684ecf2778e88c488d0b9090117814e4a7ee9b83',
      ),
      source: RepositoryAttachmentSource.make({
        path: 'issues/attachments/042/2026-07-29-excessive-initial-vertical-offset.png',
      }),
    })
    const issue = Issue.make({
      ...registerMention(makeIssue(), firstMention).issue,
      attachments: [attachment],
    })
    const encoded = S.encodeUnknownSync(Issue)(issue)
    const decoded = S.decodeUnknownSync(Issue)(encoded)

    expect(decoded).toEqual(issue)
    expect(encoded.attachments).toEqual([
      {
        byteCount: 334_048,
        capturedAtMs: 1_753_842_697_000,
        contentType: 'image/png',
        fileName: '2026-07-29-excessive-initial-vertical-offset.png',
        id: 'attachment-042-1',
        issueId: 'issue-021',
        kind: 'Screenshot',
        sha256:
          '28da2c5f4e14e976f3c04f56684ecf2778e88c488d0b9090117814e4a7ee9b83',
        source: {
          _tag: 'Repository',
          path: 'issues/attachments/042/2026-07-29-excessive-initial-vertical-offset.png',
        },
      },
    ])
    expect(encoded.successCriteria).toEqual([
      {
        id: 'compact-initial-placement',
        isSatisfied: false,
        outcome: 'The first transcript row starts at the top reading position.',
        requiredEvidence: [
          'FocusedTest',
          'SimulatorInteraction',
          'PhysicalDeviceInteraction',
        ],
      },
    ])
    expect(
      Option.map(Array.head(decoded.mentions), mention => mention.source._tag),
    ).toEqual(Option.some('Recording'))
  })

  it('defaults missing legacy success criteria to an empty collection', () => {
    const issue = makeIssue()
    const encoded = S.encodeUnknownSync(Issue)(issue)
    const legacyPayload: Record<string, unknown> = { ...encoded }
    delete legacyPayload['successCriteria']

    expect(S.decodeUnknownSync(Issue)(legacyPayload).successCriteria).toEqual(
      [],
    )
    expect(
      S.decodeUnknownSync(Issue)(legacyPayload).evidenceLogQueries,
    ).toEqual([])
    expect(S.decodeUnknownSync(Issue)(legacyPayload).nightlyEligible).toBe(true)
  })

  it('reads an Issue number in every spelling agents use and pads it below 1,000', () => {
    expect(normalizeIssueId('92')).toEqual(Option.some('092'))
    expect(normalizeIssueId(' #92 ')).toEqual(Option.some('092'))
    expect(normalizeIssueId('issue 92')).toEqual(Option.some('092'))
    expect(normalizeIssueId('Issue #692')).toEqual(Option.some('692'))
    expect(normalizeIssueId('092')).toEqual(Option.some('092'))
    expect(normalizeIssueId('1001')).toEqual(Option.some('1001'))
    expect(normalizeIssueId('0')).toEqual(Option.none())
    expect(normalizeIssueId('92a')).toEqual(Option.none())
    expect(normalizeIssueId('issue-041')).toEqual(Option.none())
    expect(normalizeIssueId('')).toEqual(Option.none())
  })

  it('takes the number after the highest one in use, past any gap', () => {
    expect(nextIssueId(['001', '153', '692', 'issue-preview'])).toBe('693')
    expect(nextIssueId(['issue-041'])).toBe('001')
    expect(nextIssueId([])).toBe('001')
    expect(nextIssueId(['998', '999'])).toBe('1000')
  })

  it('links an Issue to its page on issues.pisspoursoftware.xyz', () => {
    expect(issueViewerUrl('692')).toBe(
      'https://issues.pisspoursoftware.xyz/issues/692',
    )
  })

  it('reads a typed-chat Conversation source as its own variant and writes it back unchanged', () => {
    const typed = {
      _tag: 'Conversation',
      conversation: {
        harness: 'claude-code',
        messageId: '82fc7bc4-3fb8-47f9-93de-90ec9d004131',
        note: 'Typed in the Claude chat.',
        sessionId: 'c863fc6a-8ae7-4eca-8838-49cc9408897c',
        typedAtMs: 1_791_713_374_021,
      },
    }
    const storedMention = {
      capturedAtMs: 1_791_713_374_021,
      directQuote: 'Ensure those are all documented issues.',
      id: 'mention-689-typed-1',
      issueId: '689',
      note: null,
      related: [],
      reporter: null,
      source: typed,
    }
    const mention = S.decodeUnknownSync(IssueMention)(storedMention)

    expect(mention.source._tag).toBe('Conversation')
    expect(S.encodeUnknownSync(IssueMention)(mention)).toEqual(storedMention)
  })

  it('reads and writes the related Issue numbers stored beside the mentions', () => {
    const encoded = S.encodeUnknownSync(Issue)(makeIssue())
    const withRelated = S.decodeUnknownSync(Issue)({
      ...encoded,
      relatedIssueIds: ['147', '539'],
    })
    expect(withRelated.relatedIssueIds).toEqual(['147', '539'])
    expect(S.encodeUnknownSync(Issue)(withRelated)).toMatchObject({
      relatedIssueIds: ['147', '539'],
    })

    const legacyPayload: Record<string, unknown> = { ...encoded }
    delete legacyPayload['relatedIssueIds']
    expect(S.decodeUnknownSync(Issue)(legacyPayload).relatedIssueIds).toEqual(
      [],
    )
  })

  it('reads an Issue stored before subtasks and work in progress as having neither', () => {
    const encoded = S.encodeUnknownSync(Issue)(makeIssue())
    const legacyPayload: Record<string, unknown> = { ...encoded }
    delete legacyPayload['subtasks']
    delete legacyPayload['workInProgress']

    const decoded = S.decodeUnknownSync(Issue)(legacyPayload)

    expect(decoded.subtasks).toEqual([])
    expect(decoded.workInProgress).toEqual(Option.none())
  })

  it('round-trips subtasks and work in progress through the stored JSON', () => {
    const IssueJson = S.fromJsonString(Issue)
    const issue = Issue.make({
      ...makeIssue(),
      subtasks: [
        IssueSubtask.make({
          id: 'issue-021-subtask-1',
          state: CheckedSubtask.make({ checkedAtMs: 1_792_260_000_000 }),
          title: 'Red tests for the gutter timestamp',
        }),
        IssueSubtask.make({
          id: 'issue-021-subtask-2',
          state: UncheckedSubtask.make({}),
          title: 'Green',
        }),
      ],
      workInProgress: Option.some(
        workAt('Pushed', StuckWork.make({ reason: 'Waits on a review' })),
      ),
    })

    const json = S.encodeSync(IssueJson)(issue)

    expect(S.decodeUnknownSync(IssueJson)(json)).toEqual(issue)
    expect(JSON.parse(json)).toMatchObject({
      subtasks: [
        {
          id: 'issue-021-subtask-1',
          state: { _tag: 'Checked', checkedAtMs: 1_792_260_000_000 },
        },
        { id: 'issue-021-subtask-2', state: { _tag: 'Unchecked' } },
      ],
      workInProgress: {
        activity: { _tag: 'Stuck', reason: 'Waits on a review' },
        branch: 'agent/claude/issues-wip-835',
        landingState: 'Pushed',
        targetBuild: '106',
      },
    })
  })

  it('reads stored work in progress that names only its state, as active work', () => {
    const encoded = S.encodeUnknownSync(Issue)(makeIssue())

    const decoded = S.decodeUnknownSync(Issue)({
      ...encoded,
      workInProgress: { landingState: 'Red', updatedAtMs: 5 },
    })

    expect(decoded.workInProgress).toEqual(
      Option.some(
        IssueWorkInProgress.make({
          activity: ActiveWork.make({}),
          agentId: Option.none(),
          branch: Option.none(),
          commitSha: Option.none(),
          landingState: 'Red',
          lastStep: Option.none(),
          repository: Option.none(),
          targetBuild: Option.none(),
          updatedAtMs: 5,
          worktree: Option.none(),
        }),
      ),
    )
  })

  it('counts an Issue close to landing while its work is green or pushed and not abandoned', () => {
    const workingAt = (
      landingState: IssueLandingState,
      activity?: IssueWorkActivity,
    ) =>
      Issue.make({
        ...makeIssue(),
        workInProgress: Option.some(workAt(landingState, activity)),
      })

    expect(
      Array.map(IssueLandingState.literals, landingState =>
        isCloseToLanding(workingAt(landingState)),
      ),
    ).toEqual([false, false, true, true, false, false])
    expect(
      isCloseToLanding(
        workingAt('Green', StuckWork.make({ reason: 'Waits on a review' })),
      ),
    ).toBe(true)
    expect(
      isCloseToLanding(
        workingAt('Pushed', AbandonedWork.make({ reason: 'Replaced by #804' })),
      ),
    ).toBe(false)
    expect(isCloseToLanding(makeIssue())).toBe(false)
  })
  it('reads an Issue stored before agent presence as having none', () => {
    const encoded = S.encodeUnknownSync(Issue)(makeIssue())
    const legacyPayload: Record<string, unknown> = { ...encoded }
    delete legacyPayload['agentPresence']

    expect(S.decodeUnknownSync(Issue)(legacyPayload).agentPresence).toEqual(
      Option.none(),
    )
  })

  it('round-trips the running agent, its branch, worktree and touched files through the stored JSON', () => {
    const IssueJson = S.fromJsonString(Issue)
    const issue = Issue.make({
      ...makeIssue(),
      agentPresence: Option.some(
        IssueAgentPresence.make({
          account: Option.some('max'),
          agentId: 'claude-code/issue-wip-1374@max',
          branch: Option.some('agent/claude/issue-wip-1374'),
          harness: Option.some('claude'),
          run: RunningAgent.make({ sinceMs: 1_793_312_008_000 }),
          startedAtMs: Option.some(1_793_312_008_000),
          touchedFiles: Option.some({
            base: 'technoplato/main',
            checkedAtMs: 1_793_312_100_000,
            fileCount: 3,
            files: [
              ChangedFile.make({
                deletions: 2,
                insertions: 40,
                path: 'packages/instant-tools/src/issues/domain.ts',
              }),
              BinaryFile.make({ path: 'docs/shot.png' }),
              UntrackedFile.make({ path: 'examples/issues/core/src/now.ts' }),
            ],
          }),
          worktree: Option.some(
            '/Users/laptop/Sync/worktrees/foldkit-issue-wip-1374',
          ),
        }),
      ),
    })

    const json = S.encodeSync(IssueJson)(issue)

    expect(S.decodeUnknownSync(IssueJson)(json)).toEqual(issue)
    expect(JSON.parse(json)).toMatchObject({
      agentPresence: {
        account: 'max',
        agentId: 'claude-code/issue-wip-1374@max',
        run: { _tag: 'Running', sinceMs: 1_793_312_008_000 },
        touchedFiles: {
          base: 'technoplato/main',
          fileCount: 3,
          files: [
            { _tag: 'Changed', deletions: 2, insertions: 40 },
            { _tag: 'Binary', path: 'docs/shot.png' },
            { _tag: 'Untracked' },
          ],
        },
      },
    })
  })

  it('reads stored agent presence that names only the agent and its run', () => {
    const encoded = S.encodeUnknownSync(Issue)(makeIssue())

    const decoded = S.decodeUnknownSync(Issue)({
      ...encoded,
      agentPresence: {
        agentId: 'codex/backlog-1201@ld',
        run: { _tag: 'Ended', how: 'exit 0', sinceMs: 9 },
      },
    })

    expect(decoded.agentPresence).toEqual(
      Option.some(
        IssueAgentPresence.make({
          account: Option.none(),
          agentId: 'codex/backlog-1201@ld',
          branch: Option.none(),
          harness: Option.none(),
          run: EndedAgent.make({ how: 'exit 0', sinceMs: 9 }),
          startedAtMs: Option.none(),
          touchedFiles: Option.none(),
          worktree: Option.none(),
        }),
      ),
    )
  })

  it('counts an Issue as worked on now only while its agent runs', () => {
    const presentAs = (run: IssueAgentPresence['run']) =>
      Issue.make({
        ...makeIssue(),
        agentPresence: Option.some(
          IssueAgentPresence.make({
            account: Option.none(),
            agentId: 'claude-code/issue-wip-1374@max',
            branch: Option.none(),
            harness: Option.none(),
            run,
            startedAtMs: Option.none(),
            touchedFiles: Option.none(),
            worktree: Option.none(),
          }),
        ),
      })

    expect(isWorkingNow(presentAs(RunningAgent.make({ sinceMs: 1 })))).toBe(
      true,
    )
    expect(
      isWorkingNow(presentAs(EndedAgent.make({ how: 'exit 0', sinceMs: 1 }))),
    ).toBe(false)
    expect(
      isWorkingNow(
        presentAs(StaleAgent.make({ reason: 'not running', sinceMs: 1 })),
      ),
    ).toBe(false)
    expect(isWorkingNow(makeIssue())).toBe(false)
  })
})
