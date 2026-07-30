import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueAttachment,
  IssueMention,
  type IssuePriority,
  IssueStatus,
  IssueSuccessCriterion,
  IssueSuccessEvidence,
  IssueWorkLogEntry,
  MediaReference,
  RecordingMention,
  RecordingReference,
  RepositoryAttachmentSource,
  escalatePriority,
  registerMention,
} from './domain.js'

const firstMention = IssueMention.make({
  capturedAtMs: 1_753_825_157_000,
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
})
