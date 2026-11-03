import { Array, Option } from 'effect'
import { Scene } from 'foldkit'
import { html } from 'foldkit/html'
import { describe, test } from 'vitest'
import {
  AcquiredAudioPlayer,
  type CompressedCopy,
  FailedObserveCompressedCopy,
  type Message,
  type Model,
  NoAudio,
  ObservedCompressedCopy,
  ObservedRecording,
  type RecordingDetail,
  RecordingRoute,
  modelForRoute,
  update,
} from 'words-core-example'

import { playbackBar } from './playback.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'
const startedAtMs = 1_793_668_368_183
const stopMessage = 'The audio arrives when the recording stops'

const liveDetail: RecordingDetail = {
  summary: {
    id: recordingID,
    title: 'Recording 315',
    startedAtMs,
    durationSeconds: 650,
    maybeUpdatedAtMs: Option.none(),
    maybeOwnerUserID: Option.none(),
    activity: 'Recording',
    maybeDeviceIcon: Option.some('phone'),
    previewLines: [],
    isLiveRoomSet: false,
    captureGaps: [],
  },
  sections: [],
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: NoAudio(),
}

const copy: CompressedCopy = {
  streamID: '00a4b3a4-9cfe-476a-879f-113220fadad5',
  initializationPath: `scribe/${recordingID}/generation-${startedAtMs}/compressed-audio/init.mp4`,
  codecs: 'mp4a.40.2',
  segmentSeconds: 6,
  segmentCount: 100,
  durationSeconds: 600,
  isFinished: false,
}

const liveModel = (messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    [
      ObservedRecording({
        recordingID,
        maybeDetail: Option.some(liveDetail),
        skippedCount: 0,
        maybeSkippedReason: Option.none(),
      }),
      ...messages,
    ],
    modelForRoute(RecordingRoute({ recordingID })),
    (model, message) => update(model, message)[0],
  )

const barView = (model: Model) => {
  const h = html<Message>()
  return model.playback._tag === 'ReadyPlayback'
    ? h.div([], playbackBar(model, model.playback, false))
    : h.div([], [])
}

describe("the words page's bar for a recording in progress (#1299)", () => {
  test('plays its live copy, with no word of waiting for the stop', () => {
    Scene.scene(
      { update, view: barView },
      Scene.with(
        liveModel([
          ObservedCompressedCopy({ recordingID, maybeCopy: Option.some(copy) }),
          AcquiredAudioPlayer(),
        ]),
      ),
      Scene.expect(Scene.text('Live audio from iPhone')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Play' })).toExist(),
      Scene.expect(Scene.text(stopMessage, { exact: false })).toBeAbsent(),
    )
  })

  test('says the audio plays once it reaches Scribe while no copy is stored', () => {
    Scene.scene(
      { update, view: barView },
      Scene.with(
        liveModel([
          ObservedCompressedCopy({ recordingID, maybeCopy: Option.none() }),
        ]),
      ),
      Scene.expect(Scene.text('Recording on another device')).toExist(),
      Scene.expect(
        Scene.text(
          'Following along live. The audio plays here once it reaches Scribe.',
        ),
      ).toExist(),
      Scene.expect(Scene.text(stopMessage, { exact: false })).toBeAbsent(),
    )
  })

  test('says why the live audio did not load, with Retry', () => {
    Scene.scene(
      { update, view: barView },
      Scene.with(
        liveModel([
          FailedObserveCompressedCopy({
            recordingID,
            reason: 'The network connection dropped.',
          }),
        ]),
      ),
      Scene.expect(Scene.text('The live audio did not load')).toExist(),
      Scene.expect(Scene.text('The network connection dropped.')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Retry' })).toExist(),
    )
  })
})
