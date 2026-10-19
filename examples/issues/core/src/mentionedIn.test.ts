import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  ConversationReference,
  Issue,
  IssueMention,
  RecordingMention,
  RecordingReference,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { lineRangeLabel, mentionedIn } from './mentionedIn.js'

const recording208 = 'faa684c2-34e4-47e5-8f9b-3b2196da9463'
const recording243 = '77314e54-340e-446d-a0c4-94c1117f94eb'
const words = (
  recordingId: string,
  segmentId: string,
  seconds: number,
): string =>
  `https://words.pisspoursoftware.xyz/recording/${recordingId}/section/${segmentId}?t=${seconds.toString()}`

const said = (
  id: string,
  {
    recordingId,
    startMilliseconds,
    capturedAtMs,
    quote,
    note,
    related,
  }: {
    readonly recordingId: string
    readonly startMilliseconds: number
    readonly capturedAtMs: number
    readonly quote: string
    readonly note?: string
    readonly related: ReadonlyArray<string>
  },
): IssueMention =>
  IssueMention.make({
    capturedAtMs: Option.some(capturedAtMs),
    directQuote: Option.some(quote),
    id,
    issueId: '721',
    note: Option.fromNullishOr(note),
    related: related.map(value => UriReference.make({ value })),
    reporter: Option.none(),
    source: RecordingReference.make({
      recording: RecordingMention.make({
        endMilliseconds: Option.none(),
        recordingId,
        screenshotIds: [],
        startMilliseconds,
      }),
    }),
  })

const issueWith = (mentions: ReadonlyArray<IssueMention>): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_000,
    details: 'Topics and tags.',
    id: '721',
    issueType: Option.none(),
    mentions,
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title: 'Triage, topics and tags',
    updatedAtMs: 1_000,
    viewerURL: Option.none(),
    workLog: [],
  })

const decisions = said('mention-721-3', {
  recordingId: recording243,
  startMilliseconds: 3_297_750,
  capturedAtMs: 1_792_160_000_000,
  quote: `Recording 243 (${recording243}) #506-523: "Ooh yeah, this is this is good topics."`,
  note: 'Lines: #506 c4882394-455e-43cb-8d4b-e44a86c108f2, #523 4a9fd2c1-0b13-4c3e-9a67-8f9b2b1d3e4f',
  related: [
    words(recording243, 'c4882394-455e-43cb-8d4b-e44a86c108f2', 3297.75),
  ],
})
const getTheTopicsOut = said('mention-721-4', {
  recordingId: recording243,
  startMilliseconds: 14_266_380,
  capturedAtMs: 1_792_172_000_000,
  quote: `Recording 243 (${recording243}) #2273: "Okay, yeah, definitely get the topics out."`,
  related: [
    words(recording243, 'e98a8032-ea7e-4d0e-bcd9-a7463612ed4f', 14266.38),
  ],
})
const topicTree = said('mention-721-2', {
  recordingId: recording208.toUpperCase(),
  startMilliseconds: 15_585_520,
  capturedAtMs: 1_791_650_000_000,
  quote:
    'Recording 208 #3037-3056 (the topic tree): "kind of like the Dewey decimal system"',
  related: [
    'https://words.knophy.com/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463/section/01fb400f-0802-4fb8-9479-c7b31bbbb8a0?t=15585.52',
  ],
})
const byTheClock = said('mention-721-5', {
  recordingId: recording208,
  startMilliseconds: 14_240_980,
  capturedAtMs: 1_791_640_000_000,
  quote: 'source of the idea.',
  related: [],
})
const typed = IssueMention.make({
  capturedAtMs: Option.some(1_792_200_000_000),
  directQuote: Option.some('And then also get the functionality built in.'),
  id: 'mention-721-6',
  issueId: '721',
  related: [],
  reporter: Option.none(),
  source: ConversationReference.make({
    conversation: { note: 'Typed in the Claude chat, 2026-10-19 17:10.' },
  }),
})

describe('Mentioned in: every recording and line that mentioned an Issue', () => {
  it('groups the lines by recording, the recording with the newest line first, and each group newest first', () => {
    const groups = mentionedIn(
      issueWith([topicTree, decisions, typed, byTheClock, getTheTopicsOut]),
    )

    expect(groups.map(group => group.recordingLabel)).toEqual([
      'Recording 243',
      'Recording 208',
    ])
    expect(groups.map(group => group.recordingId)).toEqual([
      recording243,
      recording208,
    ])
    expect(groups[0]?.lines.map(lineRangeLabel)).toEqual(['#2273', '#506-523'])
    expect(groups[1]?.lines.map(lineRangeLabel)).toEqual([
      '#3037-3056',
      'no line link',
    ])
  })

  it('links each line range to its words page exactly, on the words host', () => {
    const [recent, older] = mentionedIn(
      issueWith([topicTree, decisions, getTheTopicsOut]),
    )

    expect(recent?.lines.map(line => Option.getOrNull(line.deepLink))).toEqual([
      words(recording243, 'e98a8032-ea7e-4d0e-bcd9-a7463612ed4f', 14266.38),
      words(recording243, 'c4882394-455e-43cb-8d4b-e44a86c108f2', 3297.75),
    ])
    expect(older?.lines.map(line => Option.getOrNull(line.deepLink))).toEqual([
      words(recording208, '01fb400f-0802-4fb8-9479-c7b31bbbb8a0', 15585.52),
    ])
  })

  it('keeps his words verbatim without the recording prefix the group already says', () => {
    const [recent, older] = mentionedIn(issueWith([topicTree, getTheTopicsOut]))

    expect(recent?.lines[0]?.quote).toBe(
      '"Okay, yeah, definitely get the topics out."',
    )
    expect(older?.lines[0]?.quote).toBe(
      '(the topic tree): "kind of like the Dewey decimal system"',
    )
  })

  it('shows a mention found only by the recording clock at its recording, with no line link', () => {
    const [group] = mentionedIn(issueWith([byTheClock]))

    expect(group?.recordingLabel).toBe('Recording faa684c2')
    expect(group?.lines.map(line => Option.isNone(line.deepLink))).toEqual([
      true,
    ])
    expect(group?.lines[0]?.quote).toBe('source of the idea.')
  })

  it('reads the range from the Lines note when the words do not say it', () => {
    const withoutRange = said('mention-721-7', {
      recordingId: recording243,
      startMilliseconds: 3_297_750,
      capturedAtMs: 1_792_160_000_000,
      quote: 'Ooh yeah, this is this is good topics.',
      note: 'Lines: #506 c4882394-455e-43cb-8d4b-e44a86c108f2, #507 3b8a1f2e-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
      related: [
        words(recording243, 'c4882394-455e-43cb-8d4b-e44a86c108f2', 3297.75),
      ],
    })

    expect(
      mentionedIn(issueWith([withoutRange]))[0]?.lines.map(lineRangeLabel),
    ).toEqual(['#506-507'])
  })

  it('leaves out typed and agent Mentions, which stay under Mentions', () => {
    expect(mentionedIn(issueWith([typed]))).toEqual([])
  })
})
