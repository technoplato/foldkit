import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  type IssuePriority,
  MediaReference,
  RecordingMention,
  RecordingReference,
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
    createdAtMs: 1_753_800_000_000,
    details: '',
    id: 'issue-021',
    mentions: [],
    priority: 'P4',
    product: ApplicationProduct.make({
      id: 'scribe',
      name: 'Scribe',
    }),
    projectId: Option.some('transcript-ui'),
    sourceDocument: Option.none(),
    status: 'InProgress',
    title: 'Put the full recording timestamp in the gutter',
    updatedAtMs: 1_753_800_000_000,
    workLog: [],
  })

describe('issue domain', () => {
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
    const issue = registerMention(makeIssue(), firstMention).issue
    const encoded = S.encodeUnknownSync(Issue)(issue)
    const decoded = S.decodeUnknownSync(Issue)(encoded)

    expect(decoded).toEqual(issue)
    expect(
      Option.map(Array.head(decoded.mentions), mention => mention.source._tag),
    ).toEqual(Option.some('Recording'))
  })
})
