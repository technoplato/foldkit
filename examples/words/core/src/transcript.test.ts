import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { decodeRecordingDetail, decodeRecordingList } from './decode.js'
import {
  NoAudio,
  type RecordingDetail,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import {
  exportTranscript,
  formatClock,
  formatExportTimestamp,
  sectionAt,
  sectionPlaybackStart,
  speakerRunStartIDsOf,
  timelineOf,
  wordAt,
} from './transcript.js'

const words = (segmentStart: number, texts: ReadonlyArray<string>): string =>
  JSON.stringify(
    texts.map((text, index) => ({
      text,
      start: segmentStart + index * 0.5,
      end: segmentStart + index * 0.5 + 0.4,
    })),
  )

const segmentRow = (
  id: string,
  segmentIndex: number,
  start: number,
  texts: ReadonlyArray<string>,
  speaker: number | null,
) => ({
  id,
  segmentIndex,
  startTimeSeconds: start,
  endTimeSeconds: start + texts.length * 0.5,
  text: texts.join(' '),
  speaker,
  wordsJSON: words(start, texts),
  isFinal: true,
})

const recordingRow = {
  id: 'recording-1',
  title: 'Recording 001',
  startedAtMs: 1_790_000_000_000,
  durationSeconds: 90,
  activityKind: null,
  deviceIcon: 'iphone',
  speakers: [
    { id: 1, displayName: 'Michael' },
    {
      id: 2,
      source: {
        systemAudio: {
          _0: { platform: 'iPhone', appDisplayName: 'YouTube' },
        },
      },
    },
  ],
  clipboardEntries: [
    {
      id: 'clip-1',
      timestamp: 6,
      fullContent: 'first line\nsecond line',
      truncatedContent: 'first line',
    },
  ],
  segments: [
    segmentRow('section-b', 1, 10, ['world', 'again'], 2),
    segmentRow('section-a', 0, 5, ['Hello', 'there'], 1),
    { id: 'broken' },
  ],
  attachments: [
    {
      id: 'audio-1',
      kind: 'audio',
      byteCount: 1_000,
      storageFileID: 'file-audio',
    },
    {
      id: 'image-1',
      kind: 'image',
      timestampSeconds: 8,
      byteCount: 10,
      storageFileID: 'file-image',
    },
  ],
  previewSegmentA: [segmentRow('section-a', 0, 5, ['Hello', 'there'], 1)],
  previewSegmentB: [segmentRow('section-b', 1, 10, ['world', 'again'], 2)],
}

const detailOf = (row: unknown): RecordingDetail =>
  Option.getOrThrow(decodeRecordingDetail([row]).maybeDetail)

describe('decodeRecordingDetail', () => {
  it('orders sections by index, labels speakers like the iPhone, and counts unreadable rows', () => {
    const decoded = decodeRecordingDetail([recordingRow])
    const detail = Option.getOrThrow(decoded.maybeDetail)

    expect(detail.sections.map(section => section.id)).toEqual([
      'section-a',
      'section-b',
    ])
    expect(detail.speakers).toEqual([
      { id: 1, label: 'Michael' },
      { id: 2, label: 'iPhone system audio - YouTube' },
    ])
    expect(detail.audio).toEqual(
      StoredAudio({ fileID: 'file-audio', byteCount: 1_000 }),
    )
    expect(detail.images).toEqual([
      { id: 'image-1', timestampSeconds: 8, fileID: 'file-image' },
    ])
    expect(decoded.skipped.count).toBe(1)
    expect(Option.isSome(decoded.skipped.maybeFirstReason)).toBe(true)
  })

  it('gives words stable ids when the iPhone stored none', () => {
    const detail = detailOf(recordingRow)
    const first = Option.getOrThrow(Option.fromNullishOr(detail.sections[0]))

    expect(first.words.map(word => word.id)).toEqual([
      'section-a:0',
      'section-a:1',
    ])
  })

  it('tells uploading audio apart from missing audio', () => {
    expect(
      detailOf({
        ...recordingRow,
        attachments: [{ id: 'a', kind: 'audio', byteCount: 5 }],
      }).audio,
    ).toEqual(UploadingAudio({ byteCount: 5 }))
    expect(detailOf({ ...recordingRow, attachments: [] }).audio).toEqual(
      NoAudio(),
    )
  })
})

describe('decodeRecordingList', () => {
  it('lists newest first with the two preview lines and the activity', () => {
    const older = { ...recordingRow, id: 'older', startedAtMs: 1 }
    const live = {
      ...recordingRow,
      id: 'live',
      startedAtMs: 2,
      activityKind: 'active',
    }
    const decoded = decodeRecordingList([older, live])

    expect(decoded.recordings.map(recording => recording.id)).toEqual([
      'live',
      'older',
    ])
    expect(decoded.recordings[0]?.activity).toBe('Recording')
    expect(decoded.recordings[1]?.previewLines).toEqual([
      { sectionID: 'section-a', startSeconds: 5, text: 'Hello there' },
      { sectionID: 'section-b', startSeconds: 10, text: 'world again' },
    ])
  })
})

describe('what the live clock reads from a row', () => {
  it('reads whether the recording device publishes its beat in a live room, and the stretches its clock waited', () => {
    const captureGapsJSON = JSON.stringify([
      {
        cause: 'paused',
        endedAtMs: 2_500,
        id: 'gap-a',
        offsetSeconds: 1,
        startedAtMs: 2_000,
      },
      { cause: 'paused', id: 'gap-b', offsetSeconds: 3, startedAtMs: 4_000 },
    ])
    const decoded = decodeRecordingList([
      {
        ...recordingRow,
        id: 'live',
        startedAtMs: 1,
        liveRoomKey: '7f0e1c2d-3b4a-4c5d-8e6f-7a8b9c0d1e2f',
        captureGapsJSON,
      },
      { ...recordingRow, id: 'unreadable', startedAtMs: 0, captureGapsJSON: '{' },
    ])
    expect(
      decoded.recordings.map(recording => [
        recording.id,
        recording.isLiveRoomSet,
        recording.captureGaps,
      ]),
    ).toEqual([
      [
        'live',
        true,
        [
          { startedAtMs: 2_000, maybeEndedAtMs: Option.some(2_500) },
          { startedAtMs: 4_000, maybeEndedAtMs: Option.none() },
        ],
      ],
      ['unreadable', false, []],
    ])
  })
})

describe('the recording owner', () => {
  it('reads who owns each recording, so one shared by someone else can be told apart', () => {
    const decoded = decodeRecordingList([
      { ...recordingRow, id: 'shared', ownerUserID: 'someone-else' },
      { ...recordingRow, id: 'legacy', startedAtMs: 0 },
    ])
    expect(
      decoded.recordings.map(recording => [
        recording.id,
        recording.maybeOwnerUserID,
      ]),
    ).toEqual([
      ['shared', Option.some('someone-else')],
      ['legacy', Option.none()],
    ])
  })
})

describe('playback position', () => {
  const detail = detailOf(recordingRow)
  const sections: ReadonlyArray<Section> = detail.sections

  it('keeps the previous section current in the pause before the next one', () => {
    expect(Option.map(sectionAt(sections, 7), section => section.id)).toEqual(
      Option.some('section-a'),
    )
    expect(Option.map(sectionAt(sections, 10), section => section.id)).toEqual(
      Option.some('section-b'),
    )
    expect(sectionAt(sections, 2)).toEqual(Option.none())
  })

  it('finds the word playing at a time', () => {
    const section = Option.getOrThrow(sectionAt(sections, 5.6))

    expect(Option.map(wordAt(section, 5.6), word => word.text)).toEqual(
      Option.some('there'),
    )
    expect(sectionPlaybackStart(section)).toBe(5)
  })
})

describe('timeline and export', () => {
  const detail = detailOf(recordingRow)

  it('interleaves clipboard copies and images with sections by time', () => {
    expect(timelineOf(detail).map(entry => entry._tag)).toEqual([
      'SectionEntry',
      'ClipboardTimelineEntry',
      'ImageTimelineEntry',
      'SectionEntry',
    ])
  })

  it('copies plain text in the iPhone layout', () => {
    expect(
      exportTranscript(detail, 'PlainText', fileID => `image:${fileID}`),
    ).toBe(
      [
        '0:05  Michael',
        '  Hello there',
        '',
        '0:06  [Clipboard] first line',
        'second line',
        '',
        '0:08  [Image] image:file-image',
        '',
        '0:10  iPhone system audio - YouTube',
        '  world again',
        '',
      ].join('\n'),
    )
  })

  it('copies Markdown and SRT in the iPhone layout', () => {
    const markdown = exportTranscript(detail, 'Markdown', fileID => fileID)
    const srt = exportTranscript(detail, 'Srt', fileID => fileID)

    expect(markdown.split('\n').slice(0, 5)).toEqual([
      '**0:05** — *Michael*',
      'Hello there',
      '',
      '> 0:06 — Clipboard: first line',
      '> second line',
    ])
    expect(srt.split('\n').slice(0, 4)).toEqual([
      '1',
      '00:00:05,000 --> 00:00:06,000',
      'Michael: Hello there',
      '',
    ])
  })

  it('formats timestamps for export and for the clock', () => {
    expect(formatExportTimestamp(4_987)).toBe('83:07')
    expect(formatClock(4_987)).toBe('1:23:07')
    expect(formatClock(247)).toBe('4:07')
  })
})

describe('speaker runs', () => {
  it('labels a speaker once per run, like the iPhone', () => {
    const base = {
      startSeconds: 0,
      endSeconds: 1,
      text: 'x',
      words: [],
      isFinal: true,
    }
    const sections = [
      { ...base, id: 'a', index: 0, maybeSpeakerID: Option.some(0) },
      { ...base, id: 'b', index: 1, maybeSpeakerID: Option.some(0) },
      { ...base, id: 'c', index: 2, maybeSpeakerID: Option.some(1) },
      { ...base, id: 'd', index: 3, maybeSpeakerID: Option.none() },
      { ...base, id: 'e', index: 4, maybeSpeakerID: Option.none() },
    ]
    expect(speakerRunStartIDsOf(sections)).toEqual(['a', 'c', 'd'])
  })
})
