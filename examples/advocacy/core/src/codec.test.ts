import { Array, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  KindPhone,
  PhoneNumber,
  PreferredPhone,
  PreferredVideo,
  advocateFromNumber,
  encodeWrite,
  graphFromInstantRows,
  meetingSamPastId,
  seedGraph,
  writesForGraph,
} from './index.js'
import {
  InstantKindTags,
  InstantOriginTags,
  InstantPreferredTags,
  InstantRoleTags,
} from './instantTags.js'

const emptyRows = {
  advocacyPeople: [],
  advocacyMeetings: [],
  advocacyCalls: [],
  advocacyParticipants: [],
  advocacyChats: [],
  advocacySegments: [],
}

const scheduledMeetingRow = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: 1,
  notes: '',
  originTag: 'scheduled',
  preferredTag: 'phone',
  start: 10,
  end: 20,
}

const phoneCallRow = {
  id: '22222222-2222-4222-8222-222222222222',
  meetingId: meetingSamPastId,
  openedAt: 30,
  kindTag: 'phone',
  fromNumber: advocateFromNumber,
}

const rowsFromWrites = (graph: typeof seedGraph) =>
  Array.reduce(writesForGraph(graph), emptyRows, (rows, write) => {
    const encoded = encodeWrite(write)
    return {
      ...rows,
      [encoded.namespace]: Array.append(rows[encoded.namespace], {
        id: encoded.id,
        ...encoded.attrs,
      }),
    }
  })

describe('graphFromInstantRows', () => {
  test('round-trips the seed graph without inventing fields', () => {
    expect(graphFromInstantRows(rowsFromWrites(seedGraph))).toEqual(seedGraph)
  })

  test('keeps an explicit scheduled preferredTag', () => {
    const videoMeeting = graphFromInstantRows({
      ...emptyRows,
      advocacyMeetings: [{ ...scheduledMeetingRow, preferredTag: 'video' }],
    })
    const phoneMeeting = graphFromInstantRows({
      ...emptyRows,
      advocacyMeetings: [scheduledMeetingRow],
    })

    const maybeVideo = Array.head(videoMeeting.meetings)
    const maybePhone = Array.head(phoneMeeting.meetings)
    expect(Option.isSome(maybeVideo)).toBe(true)
    expect(Option.isSome(maybePhone)).toBe(true)
    if (Option.isSome(maybeVideo)) {
      expect(maybeVideo.value.origin._tag).toBe('OriginScheduled')
      if (maybeVideo.value.origin._tag === 'OriginScheduled') {
        expect(maybeVideo.value.origin.preferred).toEqual(PreferredVideo())
      }
    }
    if (Option.isSome(maybePhone)) {
      expect(maybePhone.value.origin._tag).toBe('OriginScheduled')
      if (maybePhone.value.origin._tag === 'OriginScheduled') {
        expect(maybePhone.value.origin.preferred).toEqual(PreferredPhone())
      }
    }
  })

  test('drops a scheduled meeting when preferredTag is missing', () => {
    const { preferredTag: _preferredTag, ...withoutPreferred } =
      scheduledMeetingRow
    const graph = graphFromInstantRows({
      ...emptyRows,
      advocacyMeetings: [withoutPreferred, scheduledMeetingRow],
    })

    expect(Array.map(graph.meetings, meeting => meeting.id)).toEqual([
      scheduledMeetingRow.id,
    ])
    expect(
      Array.some(
        graph.meetings,
        meeting =>
          meeting.origin._tag === 'OriginScheduled' &&
          meeting.origin.preferred._tag === 'PreferredVideo' &&
          meeting.id !== scheduledMeetingRow.id,
      ),
    ).toBe(false)
  })

  test('drops a scheduled meeting when preferredTag is unknown', () => {
    const graph = graphFromInstantRows({
      ...emptyRows,
      advocacyMeetings: [{ ...scheduledMeetingRow, preferredTag: 'fax' }],
    })

    expect(graph.meetings).toEqual([])
  })

  test('drops a scheduled meeting when start or end is missing', () => {
    const { start: _start, ...withoutStart } = scheduledMeetingRow
    const { end: _end, ...withoutEnd } = scheduledMeetingRow

    expect(
      graphFromInstantRows({
        ...emptyRows,
        advocacyMeetings: [withoutStart],
      }).meetings,
    ).toEqual([])
    expect(
      graphFromInstantRows({
        ...emptyRows,
        advocacyMeetings: [withoutEnd],
      }).meetings,
    ).toEqual([])
  })

  test('drops a phone call when fromNumber is missing', () => {
    const { fromNumber: _fromNumber, ...withoutFromNumber } = phoneCallRow
    const graph = graphFromInstantRows({
      ...emptyRows,
      advocacyCalls: [withoutFromNumber, phoneCallRow],
    })

    expect(Array.map(graph.calls, call => call.id)).toEqual([phoneCallRow.id])
    expect(
      Array.some(
        graph.calls,
        call => call.kind._tag === 'KindPhone' && call.kind.fromNumber === '',
      ),
    ).toBe(false)
  })

  test('drops a phone call when fromNumber is empty', () => {
    const graph = graphFromInstantRows({
      ...emptyRows,
      advocacyCalls: [{ ...phoneCallRow, fromNumber: '' }],
    })

    expect(graph.calls).toEqual([])
  })

  test('drops rows with unknown Instant tags', () => {
    const graph = graphFromInstantRows({
      ...emptyRows,
      advocacyMeetings: [{ ...scheduledMeetingRow, originTag: 'recurring' }],
      advocacyCalls: [{ ...phoneCallRow, kindTag: 'fax' }],
      advocacyParticipants: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          meetingId: scheduledMeetingRow.id,
          personId: scheduledMeetingRow.id,
          invitedAt: 1,
          roleTag: 'RoleGuest',
        },
      ],
    })

    expect(graph.meetings).toEqual([])
    expect(graph.calls).toEqual([])
    expect(graph.participants).toEqual([])
  })
})

describe('PhoneNumber and KindPhone', () => {
  test('rejects an empty fromNumber', () => {
    expect(S.decodeUnknownExit(PhoneNumber)('')._tag).toBe('Failure')
    expect(
      S.decodeUnknownExit(KindPhone)({
        _tag: 'KindPhone',
        fromNumber: '',
      })._tag,
    ).toBe('Failure')
    expect(() => KindPhone({ fromNumber: '' })).toThrow()
  })

  test('constructs KindPhone from a non-empty number', () => {
    expect(KindPhone({ fromNumber: advocateFromNumber }).fromNumber).toBe(
      advocateFromNumber,
    )
  })
})

describe('Instant tag closed sets', () => {
  test('codec Literals use the Instant schema tag sets', () => {
    expect(S.decodeUnknownExit(S.Literals(InstantOriginTags))('fax')._tag).toBe(
      'Failure',
    )
    expect(
      S.decodeUnknownExit(S.Literals(InstantPreferredTags))('fax')._tag,
    ).toBe('Failure')
    expect(S.decodeUnknownExit(S.Literals(InstantKindTags))('fax')._tag).toBe(
      'Failure',
    )
    expect(
      S.decodeUnknownExit(S.Literals(InstantRoleTags))('RoleGuest')._tag,
    ).toBe('Failure')
    expect(
      S.decodeUnknownExit(S.Literals(InstantOriginTags))('scheduled')._tag,
    ).toBe('Success')
    expect(
      S.decodeUnknownExit(S.Literals(InstantPreferredTags))('video')._tag,
    ).toBe('Success')
  })
})
