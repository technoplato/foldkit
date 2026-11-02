import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  IssueWorkLogEntry,
  RecordingMention,
  RecordingReference,
} from '@foldkit/instant-tools/issues'

import { timelineOf } from './timeline.js'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const FILED_AT_MS = Date.parse('2026-10-30T13:00:00Z')

const entry = (summary: string, minutes: number, state = 'progress') =>
  IssueWorkLogEntry.make({
    agentId: Option.some('claude-code/one@ld'),
    commitSha: Option.none(),
    durationSeconds: Option.none(),
    id: `work-${minutes.toString()}`,
    occurredAtMs: FILED_AT_MS + minutes * MINUTE_MS,
    state: Option.some(state),
    summary,
  })

const saidAt = (atMs: number, id: string) =>
  IssueMention.make({
    capturedAtMs: Option.some(atMs),
    directQuote: Option.some('my phone is getting hot again'),
    id,
    issueId: '1395',
    reporter: Option.none(),
    source: RecordingReference.make({
      recording: RecordingMention.make({
        endMilliseconds: Option.none(),
        recordingId: 'faa684c2-34e4-47e5-8f9b-3b2196da9463',
        screenshotIds: [],
        startMilliseconds: 14_287_000,
      }),
    }),
  })

const issueWith = (
  workLog: ReadonlyArray<IssueWorkLogEntry>,
  mentions: ReadonlyArray<IssueMention> = [],
): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: FILED_AT_MS,
    details: '',
    id: '1395',
    issueType: Option.none(),
    mentions,
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title: 'The phone runs hot',
    updatedAtMs: FILED_AT_MS,
    viewerURL: Option.none(),
    workLog,
  })

const stepNames = (issue: Issue): ReadonlyArray<string> =>
  Array.map(timelineOf(issue), step => step.name)

describe('the timeline says only what its entries say', () => {
  it('reads Merged only when the words put the work on main', () => {
    expect(
      stepNames(
        issueWith([
          entry('pushed, not merged; merged with main d09e5440', 10),
        ]),
      ),
    ).not.toContain('Merged')
    expect(
      stepNames(issueWith([entry('Not merged to main yet: waiting on CI.', 10)])),
    ).not.toContain('Merged')
    expect(
      stepNames(issueWith([entry('Landed on main 8fc12c548 for Build 214.', 10)])),
    ).toContain('Merged')
    expect(
      stepNames(issueWith([entry('Merged into Scribe main as 1a2b3c4d5.', 10)])),
    ).toContain('Merged')
  })

  it('reads a state of landed as Merged only when it says main', () => {
    expect(
      stepNames(issueWith([entry('Landed on the branch; main next.', 10, 'landed')])),
    ).not.toContain('Merged')
  })

  it('reads Asked from what he said before it was filed, never a later mention', () => {
    const askedBefore = issueWith(
      [],
      [
        saidAt(FILED_AT_MS - 3 * MINUTE_MS, 'mention-1'),
        saidAt(FILED_AT_MS + 2 * DAY_MS, 'mention-2'),
      ],
    )
    const mentionedAfter = issueWith(
      [],
      [saidAt(FILED_AT_MS + 2 * DAY_MS, 'mention-1')],
    )

    expect(
      Option.map(
        Array.findFirst(timelineOf(askedBefore), step => step.name === 'Asked'),
        step => step.atMs,
      ),
    ).toEqual(Option.some(FILED_AT_MS - 3 * MINUTE_MS))
    expect(stepNames(mentionedAfter)).toEqual(['Filed'])
  })
})
