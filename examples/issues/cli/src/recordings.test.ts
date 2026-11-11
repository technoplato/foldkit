import { Duration, Effect, Option } from 'effect'
import { IssueRecording, IssueRecordingMention } from 'issues-core-example'
import { describe, expect, it } from 'vitest'

import {
  FoundIssueRecordings,
  UnavailableIssueRecordings,
  issueRecordingsJson,
  issueRecordingsSection,
  readIssueRecordings,
} from './recordings.js'

const RECORDING_411 = 'f592cdd1-0bab-4c26-be2f-4008a4fe26cf'
const RECORDING_409 = '33f6ef2c-5746-422d-b61a-b1dcd78de09f'
const LINE = '0b7e2fea-c676-4a82-a5ef-de883d2ade94'
const OG = 'https://og.pisspoursoftware.xyz'

const mention = (
  id: string,
  fields: Partial<IssueRecordingMention> = {},
): IssueRecordingMention =>
  IssueRecordingMention.make({
    id,
    maybeCapturedAtMs: Option.some(1_794_405_520_766),
    maybeLine: Option.none(),
    maybeStartSeconds: Option.none(),
    ...fields,
  })

const recordings = [
  IssueRecording.make({
    id: RECORDING_409,
    mentions: [mention('older')],
    startedAtMs: 1_794_300_000_000,
    title: 'Recording 409 — Nov 10, 2026',
  }),
  IssueRecording.make({
    id: RECORDING_411,
    mentions: [
      mention('first', {
        maybeLine: Option.some({ first: 10, last: 15, segmentId: LINE }),
        maybeStartSeconds: Option.some(202.144),
      }),
      mention('second', { maybeStartSeconds: Option.some(210.12) }),
    ],
    startedAtMs: 1_794_405_000_000,
    title: 'Recording 411 — Nov 11, 2026',
  }),
]

describe('issueRecordingsSection', () => {
  it('prints each recording that mentions the Issue, how many times, and a deep link per mention', () => {
    expect(
      issueRecordingsSection(FoundIssueRecordings.make({ recordings }), 3),
    ).toEqual([
      '',
      "Recordings (3 mentions in 2 recordings, from Scribe's rows)",
      '  Recording 409 — Nov 10, 2026  1 mention',
      `    ${OG}/recording/${RECORDING_409}`,
      '  Recording 411 — Nov 11, 2026  2 mentions',
      `    #10-15  ${OG}/recording/${RECORDING_411}/section/${LINE}?t=202.14`,
      `    ${OG}/recording/${RECORDING_411}?t=210.12`,
    ])
  })

  it('says so when the tracker lists more mentions from recordings than reach one in Scribe’s rows', () => {
    expect(
      issueRecordingsSection(
        FoundIssueRecordings.make({ recordings: recordings.slice(1) }),
        3,
      ).slice(-1),
    ).toEqual([
      "  The tracker lists 3 mentions from recordings; 2 reach a recording in Scribe's rows (the mirror is behind, or a recording is not a row there).",
    ])
    expect(
      issueRecordingsSection(FoundIssueRecordings.make({ recordings: [] }), 1),
    ).toEqual([
      '',
      "Recordings (0 mentions in 0 recordings, from Scribe's rows)",
      "  The tracker lists 1 mention from recordings; 0 reach a recording in Scribe's rows (the mirror is behind, or a recording is not a row there).",
    ])
  })

  it('prints nothing for an Issue no recording mentions, and why when Scribe cannot be read', () => {
    expect(
      issueRecordingsSection(FoundIssueRecordings.make({ recordings: [] }), 0),
    ).toEqual([])
    expect(
      issueRecordingsSection(
        UnavailableIssueRecordings.make({ reason: 'no answer.' }),
        2,
      ),
    ).toEqual(['', 'Recordings not shown: no answer.'])
  })
})

describe('issueRecordingsJson', () => {
  it('gives each recording with its count and each mention with its link, or why they could not be read', () => {
    const json = issueRecordingsJson(
      FoundIssueRecordings.make({ recordings: recordings.slice(1) }),
    )
    expect(json.recordings?.[0]).toMatchObject({
      id: RECORDING_411,
      mentionCount: 2,
      title: 'Recording 411 — Nov 11, 2026',
    })
    expect(json.recordings?.[0]?.mentions[0]).toMatchObject({
      id: 'first',
      firstLine: 10,
      lastLine: 15,
      link: `${OG}/recording/${RECORDING_411}/section/${LINE}?t=202.14`,
    })
    expect(
      issueRecordingsJson(
        UnavailableIssueRecordings.make({ reason: 'no answer.' }),
      ),
    ).toEqual({ recordingsNotShown: 'no answer.' })
  })
})

describe('readIssueRecordings', () => {
  it('reads the recordings Scribe answers with', async () => {
    const read = await Effect.runPromise(
      readIssueRecordings(
        async () => ({
          recordings: [
            {
              id: RECORDING_411,
              title: 'Recording 411 — Nov 11, 2026',
              startedAtMs: 1,
              issueMentions: [{ id: 'one', capturedAtMs: 2 }],
            },
          ],
        }),
        2248,
      ),
    )
    expect(read._tag).toBe('FoundIssueRecordings')
  })

  it('never fails: no answer in time, a refused query and rows it cannot read each say why', async () => {
    const silent = await Effect.runPromise(
      readIssueRecordings(
        () => new Promise(() => undefined),
        2248,
        Duration.millis(10),
      ),
    )
    expect(silent).toEqual(
      UnavailableIssueRecordings.make({
        reason: "Scribe's Instant app did not answer within 0.01 seconds.",
      }),
    )
    const refused = await Effect.runPromise(
      readIssueRecordings(async () => {
        throw new Error('Permission denied')
      }, 2248),
    )
    expect(refused._tag).toBe('UnavailableIssueRecordings')
    const unreadable = await Effect.runPromise(
      readIssueRecordings(async () => ({ recordings: [{ id: 7 }] }), 2248),
    )
    expect(unreadable).toEqual(
      UnavailableIssueRecordings.make({
        reason:
          "Scribe's Instant app answered with rows this command cannot read.",
      }),
    )
  })
})
