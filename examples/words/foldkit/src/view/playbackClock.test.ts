import { Array, Option } from 'effect'
import { Scene } from 'foldkit'
import { html } from 'foldkit/html'
import { describe, expect, test } from 'vitest'
import {
  AcquiredAudioPlayer,
  ClickedPlay,
  CompletedRunPlaybackClock,
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

import { RunClockTime, RunScrubberProgress } from '../mount.js'
import { playbackBar } from './playback.js'
import { readOnlySections } from './transcript.js'

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

const playingAt = (
  seconds: number,
  recording: RecordingDetail = detail,
): Model =>
  Array.reduce(
    [
      ObservedRecording({
        recordingID,
        maybeDetail: Option.some(recording),
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
      }),
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
      AcquiredAudioPlayer(),
      ClickedPlay(),
      HeardAudioPlaying(),
      HeardAudioPosition({ seconds, wallClockMs: 0 }),
    ],
    modelForRoute(RecordingRoute({ recordingID })),
    (model: Model, message: Message) => update(model, message)[0],
  )

const readyOf = (model: Model) => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const barView = (model: Model) => {
  const h = html<Message>()
  return h.div([], playbackBar(model, readyOf(model), false))
}

// The effects at the edge start as the bar mounts; each says so once.
const edgeStarted = Scene.Mount.resolveAll(
  [RunScrubberProgress, CompletedRunPlaybackClock()],
  [RunClockTime, CompletedRunPlaybackClock()],
)

describe('the words page tells its edge the clock (#2494)', () => {
  test('each section says when it starts, and the view marks no word and no section itself', () => {
    const painted = JSON.stringify(
      readOnlySections(detail.sections, () => undefined),
    )
    expect(painted).toContain('"data-section-seconds":"12"')
    expect(painted).not.toContain('data-current')
    expect(painted).not.toContain('bg-fill/70')
  })

  test('the scrubber and the time beside it carry the same clock', () => {
    Scene.scene(
      { update, view: barView },
      Scene.with(playingAt(6)),
      edgeStarted,
      Scene.expect(
        Scene.selector('[data-clock-progress][data-clock-place="6"]'),
      ).toExist(),
      Scene.expect(
        Scene.selector('[data-clock-time][data-clock-place="6"]'),
      ).toExist(),
    )
  })
})
