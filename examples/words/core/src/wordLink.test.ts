import { Array, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import {
  SectionRoute,
  scribeRouteToShareUrl,
  urlToScribeRoute,
  wordLinkRouteOf,
} from './link.js'
import {
  AcquiredAudioPlayer,
  ClickedCopyWordLink,
  type Message,
  ObservedFileUrls,
  ObservedRecording,
} from './message.js'
import type { Model } from './model.js'
import { playbackClockOf, spokenAt } from './playbackClock.js'
import { type RecordingDetail, type Section, StoredAudio } from './recording.js'
import { modelForRoute, update } from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

// Made-up words and times: nothing here is from a real recording.
const sectionOf = (
  index: number,
  starts: ReadonlyArray<readonly [string, number]>,
): Section => ({
  id: `0b1c2d3e-4f50-4a6b-8c7d-00000000000${index.toString()}`,
  index,
  startSeconds: starts[0]?.[1] ?? 0,
  endSeconds: (starts[starts.length - 1]?.[1] ?? 0) + 0.4,
  maybeSpeakerID: Option.none(),
  text: Array.map(starts, ([text]) => text).join(' '),
  words: Array.map(starts, ([text, startSeconds], at) => ({
    id: `word-${index.toString()}-${at.toString()}`,
    text,
    startSeconds,
    endSeconds: startSeconds + 0.3,
  })),
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const sections = [
  sectionOf(0, [
    ['The', 2],
    ['keeper', 2.3564],
    ['lit', 2.71],
  ]),
  sectionOf(1, [
    ['Far', 7],
    ['out', 7.2567],
    ['a', 7.61],
  ]),
]

const detail: RecordingDetail = {
  summary: {
    id: recordingID,
    title: 'The Lantern Keeper',
    startedAtMs: 0,
    durationSeconds: 60,
    maybeUpdatedAtMs: Option.none(),
    maybeOwnerUserID: Option.none(),
    activity: 'Idle',
    maybeDeviceIcon: Option.none(),
    previewLines: [],
    isLiveRoomSet: false,
    captureGaps: [],
  },
  sections,
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const opened = (route: Parameters<typeof modelForRoute>[0]): Model =>
  Array.reduce(
    [
      ObservedRecording({
        recordingID,
        maybeDetail: Option.some(detail),
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
      }),
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
      AcquiredAudioPlayer(),
    ],
    modelForRoute(route),
    (model: Model, message: Message) => update(model, message)[0],
  )

const out = Option.getOrThrow(Array.get(sections, 1))

describe('a link to one word', () => {
  it('is the link to its section at the time the word starts, never a hair before it', () => {
    expect(wordLinkRouteOf(recordingID, out, 'word-1-1')).toEqual(
      Option.some(
        SectionRoute({
          recordingID,
          sectionID: out.id,
          t: Option.some('7.257'),
        }),
      ),
    )
    expect(
      Option.map(
        wordLinkRouteOf(
          recordingID,
          Option.getOrThrow(Array.get(sections, 0)),
          'word-0-1',
        ),
        route => route.t,
      ),
    ).toEqual(Option.some(Option.some('2.357')))
    expect(wordLinkRouteOf(recordingID, out, 'not-a-word')).toEqual(
      Option.none(),
    )
  })

  it('opens on that word: the mark is on it, not on the word before', () => {
    const route = Option.getOrThrow(
      wordLinkRouteOf(recordingID, out, 'word-1-1'),
    )
    const reopened = Option.match(fromString(scribeRouteToShareUrl(route)), {
      onNone: () => route,
      onSome: urlToScribeRoute,
    })
    const model = opened(reopened)
    const ready =
      model.playback._tag === 'ReadyPlayback' ? model.playback : undefined
    expect(ready).toBeDefined()
    const place = ready === undefined ? 0 : playbackClockOf(ready).placeSeconds
    expect(
      spokenAt(
        Array.map(sections, section => ({
          startSeconds: section.startSeconds,
          wordStarts: Array.map(section.words, word => word.startSeconds),
        })),
        place,
      ),
    ).toEqual({ maybeSection: Option.some(1), maybeWord: Option.some(1) })
  })

  it('is copied with a word saying so', () => {
    const [, commands] = update(
      opened(
        SectionRoute({ recordingID, sectionID: out.id, t: Option.none() }),
      ),
      ClickedCopyWordLink({ wordID: 'word-1-1' }),
    )
    expect(Array.map(commands, command => command.name)).toContain('CopyText')
    expect(JSON.stringify(commands)).toContain('t=7.257')
  })
})
