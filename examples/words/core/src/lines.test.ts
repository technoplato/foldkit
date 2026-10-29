import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { decodeRecordingDetail, decodeRecordingList } from './decode.js'
import { SectionRoute } from './link.js'
import { firstRecordingWindow } from './listWindow.js'
import { type Message, ObservedRecording } from './message.js'
import type { Model, ReadyPlayback } from './model.js'
import type { RecordingDetail, RecordingSummary } from './recording.js'
import { matchedPreviewLineOf, recordingsMatching } from './search.js'
import { decodeSharedRange } from './share/decode.js'
import { recordingListQueryOf } from './store.js'
import { exportTranscript } from './transcript.js'
import { modelForRoute, update } from './update.js'

// docs/FEATURES.md item 2 (Michael's contract, typed 2026-10-14 21:52 EDT): "a wrong line is retired, never edited or
// deleted (#662, ADR 0064 section 8)". Every reader skips a retired line first, before anything else looks at it (ADR
// 0064 section 8 and its #1317 amendment). A sealed line (ADR 0097, #1183) keeps its place, time and speaker and
// carries no words; its envelope never leaves his own devices. Issue #1322 (the words site), #1329 (its share page).
// Every word below is invented.

const recordingID = '3f6c2a1e-8b4d-4e2f-9a7c-5d1e0b2c4a6f'

const lineID = (number: number): string =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`

const wordsJSONOf = (start: number, texts: ReadonlyArray<string>): string =>
  JSON.stringify(
    texts.map((text, position) => ({
      text,
      start: start + position * 0.5,
      end: start + position * 0.5 + 0.4,
    })),
  )

const KEPT_WRITE_MS = 1_000
const RETIRED_AT_MS = 9_000

const lineRow = (
  number: number,
  segmentIndex: number,
  start: number,
  texts: ReadonlyArray<string>,
  fields: Readonly<Record<string, unknown>> = {},
) => ({
  id: lineID(number),
  recordingID,
  transcriptionID: 'transcription-1',
  segmentIndex,
  startTimeSeconds: start,
  endTimeSeconds: start + texts.length * 0.5,
  text: texts.join(' '),
  speaker: 1,
  wordCount: texts.length,
  wordsJSON: wordsJSONOf(start, texts),
  isFinal: true,
  updatedAtMs: KEPT_WRITE_MS,
  ...fields,
})

const retiredRow = (
  number: number,
  segmentIndex: number,
  start: number,
  texts: ReadonlyArray<string>,
  maybeKeptLineNumber: Option.Option<number>,
) =>
  lineRow(number, segmentIndex, start, texts, {
    retiredAtMs: RETIRED_AT_MS,
    retiredReason: 'A test copy of another line',
    updatedAtMs: RETIRED_AT_MS,
    ...Option.match(maybeKeptLineNumber, {
      onNone: () => ({}),
      onSome: keptLineNumber => ({
        supersededBy: [{ id: lineID(keptLineNumber) }],
      }),
    }),
  })

const ENVELOPE = 'sw1.key-1.enc.c2VhbGVkIHdvcmRz'

const sealedRow = (
  number: number,
  segmentIndex: number,
  start: number,
  wordsSeal: string,
  fields: Readonly<Record<string, unknown>> = {},
) =>
  lineRow(number, segmentIndex, start, [], {
    text: '',
    wordCount: 0,
    wordsJSON: '[]',
    speaker: 2,
    wordsSeal,
    sealedWords: ENVELOPE,
    ...fields,
  })

const recordingRow = (
  segments: ReadonlyArray<unknown>,
  fields: Readonly<Record<string, unknown>> = {},
) => ({
  id: recordingID,
  title: 'Recording 900',
  startedAtMs: 1_790_000_000_000,
  durationSeconds: 120,
  speakers: [],
  clipboardEntries: [],
  attachments: [],
  segments,
  ...fields,
})

const detailOf = (segments: ReadonlyArray<unknown>): RecordingDetail =>
  Option.getOrThrow(decodeRecordingDetail([recordingRow(segments)]).maybeDetail)

const sectionTextsOf = (detail: RecordingDetail): ReadonlyArray<string> =>
  Array.map(detail.sections, section => section.text)

describe('a retired line is no line on the recording page', () => {
  it('shows the kept line at a # it shares with a retired copy, though the retirement stamped the copy newer', () => {
    const detail = detailOf([
      lineRow(1, 0, 5, ['alpha', 'one']),
      lineRow(2, 1, 10, ['bravo', 'two']),
      retiredRow(3, 1, 10, ['zebra', 'copy'], Option.some(2)),
      lineRow(4, 2, 15, ['charlie', 'three']),
    ])

    expect(
      Array.map(detail.sections, section => [section.index, section.id]),
    ).toEqual([
      [0, lineID(1)],
      [1, lineID(2)],
      [2, lineID(4)],
    ])
    expect(sectionTextsOf(detail).join(' ')).not.toContain('zebra')
  })

  it('skips a run of retired rows, and the kept lines around it keep their #', () => {
    const detail = detailOf([
      lineRow(1, 0, 5, ['alpha']),
      retiredRow(2, 1, 6, ['zebra'], Option.none()),
      retiredRow(3, 2, 7, ['yankee'], Option.none()),
      retiredRow(4, 3, 8, ['xray'], Option.none()),
      retiredRow(5, 4, 9, ['whiskey'], Option.none()),
      lineRow(6, 5, 10, ['bravo']),
    ])

    expect(Array.map(detail.sections, section => section.index)).toEqual([0, 5])
    expect(sectionTextsOf(detail)).toEqual(['alpha', 'bravo'])
  })

  it('reads a retired row for what places it, never its words, so one without words is not unreadable', () => {
    const decoded = decodeRecordingDetail([
      recordingRow([
        lineRow(1, 0, 5, ['alpha']),
        {
          id: lineID(2),
          segmentIndex: 1,
          retiredAtMs: RETIRED_AT_MS,
          supersededBy: [{ id: lineID(1) }],
        },
      ]),
    ])

    expect(decoded.skipped.count).toBe(0)
    expect(
      Option.map(decoded.maybeDetail, detail =>
        Array.map(detail.sections, section => section.id),
      ),
    ).toEqual(Option.some([lineID(1)]))
  })
})

const readyOf = (model: Model): ReadyPlayback => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const openLink = (
  sectionID: string,
  t: Option.Option<string>,
  detail: RecordingDetail,
) => {
  const message: Message = ObservedRecording({
    recordingID,
    maybeDetail: Option.some(detail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })
  const [model, commands] = update(
    modelForRoute(SectionRoute({ recordingID, sectionID, t })),
    message,
  )
  return {
    ready: readyOf(model),
    scrolls: Array.filterMap(commands, command =>
      command.name === 'ScrollToSection'
        ? Option.some(command.args)
        : Option.none(),
    ),
  }
}

describe('a link to a retired line', () => {
  it('opens the recording at the line that replaced it, not at the retired line or its time', () => {
    const { ready, scrolls } = openLink(
      lineID(7),
      Option.some('39'),
      detailOf([
        lineRow(1, 0, 5, ['alpha']),
        lineRow(2, 1, 20, ['bravo']),
        retiredRow(7, 7, 40, ['zebra'], Option.some(2)),
        lineRow(8, 8, 45, ['charlie']),
      ]),
    )

    expect(ready.maybeFocusedSectionID).toEqual(Option.some(lineID(2)))
    expect(ready.positionSeconds).toBe(19)
    expect(scrolls).toEqual([{ sectionID: lineID(2), placement: 'Center' }])
  })

  it('opens at the next kept line when the retired line names none', () => {
    const { ready, scrolls } = openLink(
      lineID(2),
      Option.none(),
      detailOf([
        lineRow(1, 0, 5, ['alpha']),
        retiredRow(2, 1, 10, ['zebra'], Option.none()),
        retiredRow(3, 2, 12, ['yankee'], Option.none()),
        lineRow(4, 3, 20, ['bravo']),
      ]),
    )

    expect(ready.maybeFocusedSectionID).toEqual(Option.some(lineID(4)))
    expect(ready.positionSeconds).toBe(19)
    expect(scrolls).toEqual([{ sectionID: lineID(4), placement: 'Center' }])
  })
})

const listRecordingOf = (
  previewSegmentA: unknown,
  previewSegmentB: unknown,
): RecordingSummary =>
  Option.getOrThrow(
    Array.head(
      decodeRecordingList([
        recordingRow([], { previewSegmentA, previewSegmentB }),
      ]).recordings,
    ),
  )

describe('the list previews and search', () => {
  const recording = listRecordingOf(
    [retiredRow(3, 1, 10, ['zebra', 'preview'], Option.some(2))],
    [lineRow(2, 2, 12, ['bravo', 'preview'])],
  )

  it('leaves a retired preview line out', () => {
    expect(recording.previewLines).toEqual([
      { sectionID: lineID(2), startSeconds: 12, text: 'bravo preview' },
    ])
  })

  it('finds nothing in a retired line, and still finds the kept one', () => {
    expect(recordingsMatching([recording], 'zebra')).toEqual([])
    expect(matchedPreviewLineOf(recording, 'zebra')).toEqual(Option.none())
    expect(
      Option.map(
        matchedPreviewLineOf(recording, 'bravo'),
        line => line.sectionID,
      ),
    ).toEqual(Option.some(lineID(2)))
  })

  it('asks for what the rule needs, and never for the sealed words', () => {
    const query = recordingListQueryOf(firstRecordingWindow)

    expect(query.recordings.previewSegmentA).toEqual({
      $: { fields: expect.arrayContaining(['retiredAtMs', 'wordsSeal']) },
    })
    expect(query.recordings.previewSegmentB).toEqual(
      query.recordings.previewSegmentA,
    )
    expect(JSON.stringify(query)).not.toContain('sealedWords')
  })
})

describe('a sealed line', () => {
  it('keeps its place, time and speaker, and shows as sealed with no words and no envelope', () => {
    const detail = detailOf([
      lineRow(1, 0, 5, ['alpha']),
      sealedRow(2, 1, 12, 'voice'),
      lineRow(3, 2, 20, ['bravo']),
    ])
    const sealed = Option.getOrThrow(Array.get(detail.sections, 1))

    expect(sealed).toEqual({
      id: lineID(2),
      index: 1,
      startSeconds: 12,
      endSeconds: 12,
      maybeSpeakerID: Option.some(2),
      text: '[sealed]',
      words: [],
      isFinal: true,
      maybeWordsSeal: Option.some('Voice'),
    })
    expect(JSON.stringify(detail)).not.toContain('sw1.')
  })

  it('never shows words a sealed row carries against the rules', () => {
    const detail = detailOf([
      sealedRow(1, 0, 5, 'voice', {
        text: 'forbidden secret',
        wordCount: 2,
        wordsJSON: wordsJSONOf(5, ['forbidden', 'secret']),
      }),
    ])

    expect(JSON.stringify(detail)).not.toContain('forbidden')
    expect(sectionTextsOf(detail)).toEqual(['[sealed]'])
    expect(
      exportTranscript(detail, 'PlainText', fileID => fileID),
    ).not.toContain('forbidden')
  })

  it('reads a held line as being checked, and a seal it does not know as sealed', () => {
    const detail = detailOf([
      sealedRow(1, 0, 5, 'held'),
      sealedRow(2, 1, 10, 'a-seal-from-a-later-build'),
    ])

    expect(
      Array.map(detail.sections, section => [
        section.text,
        section.maybeWordsSeal,
      ]),
    ).toEqual([
      ['[checking the voice]', Option.some('Held')],
      ['[sealed]', Option.some('Voice')],
    ])
  })

  it('is never a preview or a search hit', () => {
    const recording = listRecordingOf(
      [sealedRow(1, 1, 10, 'voice', { text: 'forbidden secret' })],
      [lineRow(2, 2, 12, ['bravo', 'preview'])],
    )

    expect(Array.map(recording.previewLines, line => line.text)).toEqual([
      'bravo preview',
    ])
    expect(recordingsMatching([recording], 'forbidden')).toEqual([])
    expect(recordingsMatching([recording], 'sealed')).toEqual([])
  })
})

describe('the share page reads its scrubbed lines through the same rule (#1329)', () => {
  const scrubbedLine = (
    number: number,
    text: string,
    fields: Readonly<Record<string, unknown>> = {},
  ) => ({
    id: `scrubbed-${number}`,
    ownerUserID: 'owner-1',
    shareID: 'share-1',
    recordingID,
    segmentID: lineID(number),
    segmentIndex: number,
    startSeconds: number * 5,
    endSeconds: number * 5 + 4,
    status: 'passed',
    text,
    wordsJSON: wordsJSONOf(number * 5, text.split(' ')),
    redactions: 0,
    checkedAtMs: 1,
    ...fields,
  })

  it('shows a sealed scrubbed line as sealed and leaves a retired one out', () => {
    const maybeRange = decodeSharedRange(
      [
        {
          id: 'share-1',
          recordingID,
          firstSegmentIndex: 1,
          lastSegmentIndex: 3,
          createdAtMs: 1,
          visibility: 'link',
          scrubStatus: 'passed',
          scrubbedLines: [
            scrubbedLine(1, 'alpha [a person]'),
            scrubbedLine(2, 'forbidden secret', { wordsSeal: 'voice' }),
            scrubbedLine(3, 'zebra copy', { retiredAtMs: RETIRED_AT_MS }),
          ],
        },
      ],
      Option.none(),
    )
    const lines = Option.getOrThrow(
      Option.map(maybeRange, range => range.lines),
    )

    expect(
      Array.map(lines, line => [
        line.index,
        line.text,
        line.words.length,
        line.maybeWordsSeal,
      ]),
    ).toEqual([
      [1, 'alpha [a person]', 2, Option.none()],
      [2, '[sealed]', 0, Option.some('Voice')],
    ])
    expect(JSON.stringify(lines)).not.toContain('forbidden')
  })
})
