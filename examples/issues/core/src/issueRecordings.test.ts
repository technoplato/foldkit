import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  issueRecordingsOf,
  issueRecordingsQuery,
  mentionsInRecordings,
} from './issueRecordings.js'

const RECORDING_411 = 'f592cdd1-0bab-4c26-be2f-4008a4fe26cf'
const RECORDING_409 = '33f6ef2c-5746-422d-b61a-b1dcd78de09f'
const LINE = '0b7e2fea-c676-4a82-a5ef-de883d2ade94'

const storedMention = (id: string, fields: object = {}) => ({
  id,
  capturedAtMs: 1_794_405_520_766,
  sourceJSON: JSON.stringify({
    _tag: 'Recording',
    recording: {
      recordingId: RECORDING_411,
      startMilliseconds: 202_144,
      endMilliseconds: 231_628,
    },
  }),
  ...fields,
})

describe('issueRecordingsQuery', () => {
  it('asks for the recordings an Issue is mentioned in, each with that Issue’s mentions and their lines', () => {
    expect(issueRecordingsQuery(2248)).toEqual({
      recordings: {
        $: {
          where: { 'issueMentions.issue.number': 2248 },
          fields: ['id', 'title', 'startedAtMs'],
        },
        issueMentions: {
          $: {
            where: { 'issue.number': 2248 },
            fields: ['id', 'capturedAtMs', 'sourceJSON'],
          },
          moment: {
            $: {
              fields: [
                'segmentID',
                'startSeconds',
                'firstLineIndex',
                'lastLineIndex',
              ],
            },
          },
        },
      },
    })
  })
})

describe('issueRecordingsOf', () => {
  it('reads each recording with every mention of the Issue in it, oldest recording and mention first; two in one recording count twice', () => {
    const recordings = issueRecordingsOf({
      recordings: [
        {
          id: RECORDING_411,
          title: 'Recording 411 — Nov 11, 2026',
          startedAtMs: 1_794_405_000_000,
          issueMentions: [
            storedMention('second', { capturedAtMs: 1_794_405_600_000 }),
            storedMention('first', {
              moment: [
                {
                  segmentID: LINE,
                  startSeconds: 202.144,
                  firstLineIndex: 10,
                  lastLineIndex: 15,
                },
              ],
            }),
          ],
        },
        {
          id: RECORDING_409,
          title: 'Recording 409 — Nov 10, 2026',
          startedAtMs: 1_794_300_000_000,
          issueMentions: [
            storedMention('older', {
              capturedAtMs: null,
              sourceJSON: '{"_tag":"Recording"}',
            }),
          ],
        },
      ],
    })

    expect(recordings.map(recording => recording.id)).toEqual([
      RECORDING_409,
      RECORDING_411,
    ])
    expect(mentionsInRecordings(recordings)).toBe(3)
    const [older, newer] = recordings
    expect(older?.mentions).toEqual([
      {
        id: 'older',
        maybeCapturedAtMs: Option.none(),
        maybeLine: Option.none(),
        maybeStartSeconds: Option.none(),
      },
    ])
    expect(newer?.title).toBe('Recording 411 — Nov 11, 2026')
    expect(newer?.mentions.map(mention => mention.id)).toEqual([
      'first',
      'second',
    ])
    expect(newer?.mentions[0]?.maybeLine).toEqual(
      Option.some({ segmentId: LINE, first: 10, last: 15 }),
    )
    expect(newer?.mentions[0]?.maybeStartSeconds).toEqual(Option.some(202.144))
    expect(newer?.mentions[1]?.maybeLine).toEqual(Option.none())
    expect(newer?.mentions[1]?.maybeStartSeconds).toEqual(Option.some(202.144))
  })

  it('reads no recordings as none, and a moment given as one row the same as a list of one', () => {
    expect(issueRecordingsOf({ recordings: [] })).toEqual([])
    const [recording] = issueRecordingsOf({
      recordings: [
        {
          id: RECORDING_411,
          title: 'Recording 411 — Nov 11, 2026',
          startedAtMs: 1,
          issueMentions: [
            storedMention('one', {
              moment: {
                segmentID: LINE,
                startSeconds: 210.12,
                firstLineIndex: 12,
                lastLineIndex: 12,
              },
            }),
          ],
        },
      ],
    })
    expect(recording?.mentions[0]?.maybeLine).toEqual(
      Option.some({ segmentId: LINE, first: 12, last: 12 }),
    )
    expect(recording?.mentions[0]?.maybeStartSeconds).toEqual(
      Option.some(210.12),
    )
  })

  it('refuses rows that are not recordings', () => {
    expect(() => issueRecordingsOf({ recordings: [{ id: 7 }] })).toThrow()
  })
})
