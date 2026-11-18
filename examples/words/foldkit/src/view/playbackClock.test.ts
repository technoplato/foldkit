import { Array, Option } from 'effect'
import { Scene } from 'foldkit'
import { html } from 'foldkit/html'
import { describe, test } from 'vitest'
import {
  AcquiredAudioPlayer,
  ClickedPlay,
  HeardAudioPlaying,
  HeardAudioPosition,
  type Message,
  type Model,
  ObservedFileUrls,
  ObservedRecording,
  type RecordingDetail,
  RecordingRoute,
  type Section,
  StoredAudio,
  modelForRoute,
  update,
} from 'words-core-example'

import { playbackBar } from './playback.js'
import { transcript } from './transcript.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

// Made-up words: nothing here is from a real recording.
const sectionOf = (
  index: number,
  startSeconds: number,
  texts: ReadonlyArray<string>,
): Section => ({
  id: `section-${index.toString()}`,
  index,
  startSeconds,
  endSeconds: startSeconds + texts.length * 0.5,
  maybeSpeakerID: Option.none(),
  text: texts.join(' '),
  words: Array.map(texts, (text, at) => ({
    id: `section-${index.toString()}:${at.toString()}`,
    text,
    startSeconds: startSeconds + at * 0.5,
    endSeconds: startSeconds + at * 0.5 + 0.4,
  })),
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

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
  sections: [
    sectionOf(0, 5, ['The', 'keeper', 'lit', 'the', 'lamp.']),
    sectionOf(1, 12, ['Far', 'out', 'a', 'bell', 'answered.']),
  ],
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const playingAt = (seconds: number): Model =>
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
      ClickedPlay(),
      HeardAudioPlaying(),
      HeardAudioPosition({ seconds }),
    ],
    modelForRoute(RecordingRoute({ recordingID })),
    (model: Model, message: Message) => update(model, message)[0],
  )

const pageView = (model: Model) => {
  const h = html<Message>()
  return model.playback._tag === 'ReadyPlayback'
    ? h.div(
        [],
        [
          transcript(model.playback, false, false),
          ...playbackBar(model, model.playback, false),
        ],
      )
    : h.div([], [])
}

describe('the words page tells its edge the clock (#2494)', () => {
  test('the transcript carries the place, that it runs, and the length, and marks no word itself', () => {
    Scene.scene(
      { update, view: pageView },
      Scene.with(playingAt(6)),
      Scene.expect(
        Scene.selector(
          'section[data-clock-place="6"][data-clock-rate="1"][data-clock-marking="true"]',
        ),
      ).toExist(),
      Scene.expect(Scene.selector('.word-current')).toBeAbsent(),
      Scene.expect(Scene.selector('[data-word-current]')).toBeAbsent(),
    )
  })

  test('each section says when it starts and each word when it does, so the edge can find the one spoken', () => {
    Scene.scene(
      { update, view: pageView },
      Scene.with(playingAt(6)),
      Scene.expect(
        Scene.selector('article[data-section-seconds="12"]'),
      ).toExist(),
      Scene.expect(Scene.selector('[data-word-seconds="12.5"]')).toExist(),
    )
  })

  test('the scrubber and the time beside it carry the same clock', () => {
    Scene.scene(
      { update, view: pageView },
      Scene.with(playingAt(6)),
      Scene.expect(
        Scene.selector('[data-clock-progress][data-clock-place="6"]'),
      ).toExist(),
      Scene.expect(
        Scene.selector('[data-clock-time][data-clock-place="6"]'),
      ).toExist(),
    )
  })
})
