import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { CopyAudioSource, FileAudioSource } from './audioPlayer.js'
import type { CompressedCopy } from './compressedCopy.js'
import { PlaybackRoute, RecordingRoute, ShareRoute } from './link.js'
import {
  AcquiredAudioPlayer,
  ClickedPause,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedWord,
  FailedObserveCompressedCopy,
  HeardAudioPosition,
  type Message,
  ObservedCompressedCopy,
  ObservedFileUrls,
  ObservedRecording,
} from './message.js'
import type { Model, ReadyPlayback } from './model.js'
import {
  NoAudio,
  type RecordingDetail,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import {
  audioSourceOf,
  compressedCopyRequestOf,
  durationOf,
  followedSectionOf,
  isAudioPlayableOf,
  liveAudioCaptionOf,
  modelForRoute,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'
const startedAtMs = 1_793_668_368_183
const folder = `scribe/${recordingID}/generation-${startedAtMs}/compressed-audio`

const section = (index: number, startSeconds: number): Section => ({
  id: `line-${index}`,
  index,
  startSeconds,
  endSeconds: startSeconds + 4,
  maybeSpeakerID: Option.none(),
  text: `Line ${index}`,
  words: [
    {
      id: `line-${index}:0`,
      text: `Line ${index}`,
      startSeconds,
      endSeconds: startSeconds + 4,
    },
  ],
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const lines = [section(0, 100), section(1, 590), section(2, 640)]

const detail = (overrides: Partial<RecordingDetail> = {}): RecordingDetail => ({
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
  sections: lines,
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: NoAudio(),
  ...overrides,
})

const stopped = (audio: RecordingDetail['audio']): RecordingDetail =>
  detail({ summary: { ...detail().summary, activity: 'Idle' }, audio })

const copy = (overrides: Partial<CompressedCopy> = {}): CompressedCopy => ({
  streamID: '00a4b3a4-9cfe-476a-879f-113220fadad5',
  initializationPath: `${folder}/init.mp4`,
  codecs: 'mp4a.40.2',
  segmentSeconds: 6,
  segmentCount: 100,
  durationSeconds: 600,
  isFinished: false,
  ...overrides,
})

const copySource = CopyAudioSource({
  streamID: copy().streamID,
  initializationPath: copy().initializationPath,
  codecs: 'mp4a.40.2',
  segmentSeconds: 6,
})

const run = (model: Model, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    {
      model,
      commands: Array.empty<Readonly<{ name: string; args: unknown }>>(),
    },
    (state, message) => {
      const [next, commands] = update(state.model, message)
      return {
        model: next,
        commands: [
          ...state.commands,
          ...commands.map(command => ({
            name: command.name,
            args: command.args,
          })),
        ],
      }
    },
  )

const AUDIO_COMMANDS = ['SeekAudio', 'PlayAudio', 'PauseAudio']

const audioCommandsOf = (
  commands: ReadonlyArray<Readonly<{ name: string; args: unknown }>>,
) => Array.filter(commands, command => AUDIO_COMMANDS.includes(command.name))

const readyOf = (model: Model): ReadyPlayback => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const observed = (recordingDetail: RecordingDetail) =>
  ObservedRecording({
    recordingID,
    maybeDetail: Option.some(recordingDetail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })

const found = (compressedCopy: CompressedCopy) =>
  ObservedCompressedCopy({
    recordingID,
    maybeCopy: Option.some(compressedCopy),
  })

const live = () =>
  run(modelForRoute(RecordingRoute({ recordingID })), [observed(detail())])
    .model

describe('a recording in progress plays from its live copy (#1299)', () => {
  it("asks for the open recording's copy, and never for a share page", () => {
    expect(compressedCopyRequestOf(live())).toEqual(
      Option.some({ recordingID, startedAtMs, attempt: 0 }),
    )
    const sharePage = modelForRoute(
      ShareRoute({
        recordingID,
        shareID: '5ca1ab1e-0000-4000-8000-000000001299',
        k: Option.some('a'.repeat(64)),
        m: Option.none(),
      }),
    )
    expect(compressedCopyRequestOf(sharePage)).toEqual(Option.none())
  })

  it('plays the copy, placed 12 s behind its end, once one is stored', () => {
    const before = live()
    expect(audioSourceOf(before)).toEqual(Option.none())
    expect(isAudioPlayableOf(readyOf(before))).toBe(false)

    const { model } = run(before, [found(copy())])
    const ready = readyOf(model)
    expect(audioSourceOf(model)).toEqual(
      Option.some({ source: copySource, attempt: 0 }),
    )
    expect(ready.positionSeconds).toBe(588)
    expect(ready.maybePendingSeekSeconds).toEqual(Option.some(588))
    expect(durationOf(ready)).toBe(600)
    expect(isAudioPlayableOf(ready)).toBe(true)
    expect(liveAudioCaptionOf(ready)).toEqual(
      Option.some('Live audio from iPhone'),
    )
  })

  it('has no audio while no segment of the copy is stored', () => {
    const { model } = run(live(), [
      ObservedCompressedCopy({ recordingID, maybeCopy: Option.none() }),
    ])
    expect(audioSourceOf(model)).toEqual(Option.none())
    expect(isAudioPlayableOf(readyOf(model))).toBe(false)
  })

  it('Play joins the live edge as it is now, then keeps the place it played', () => {
    const acquired = run(live(), [found(copy()), AcquiredAudioPlayer()]).model
    const grown = run(acquired, [
      found(copy({ segmentCount: 110, durationSeconds: 660 })),
    ]).model
    expect(readyOf(grown).positionSeconds).toBe(588)

    const played = run(grown, [ClickedPlay()])
    expect(
      audioCommandsOf(played.commands).map(command => command.name),
    ).toEqual(['SeekAudio', 'PlayAudio'])
    expect(
      Option.map(
        Array.head(audioCommandsOf(played.commands)),
        command => command.args,
      ),
    ).toEqual(Option.some({ seconds: 648 }))
    expect(readyOf(played.model).transport).toBe('Playing')

    const later = run(played.model, [
      HeardAudioPosition({ seconds: 652 }),
      ClickedPause(),
      found(copy({ segmentCount: 120, durationSeconds: 720 })),
      ClickedPlay(),
    ])
    expect(
      audioCommandsOf(later.commands).map(command => command.name),
    ).toEqual(['PauseAudio', 'PlayAudio'])
  })

  it('a tapped line plays from that line, not the live edge', () => {
    const acquired = run(live(), [found(copy()), AcquiredAudioPlayer()]).model
    const tapped = run(acquired, [ClickedWord({ seconds: 100 })])
    expect(
      audioCommandsOf(tapped.commands).map(command => command.name),
    ).toEqual(['SeekAudio', 'PlayAudio'])
    expect(
      Option.map(
        Array.head(audioCommandsOf(tapped.commands)),
        command => command.args,
      ),
    ).toEqual(Option.some({ seconds: 100 }))
    const resumed = run(tapped.model, [
      ClickedPause(),
      found(copy({ segmentCount: 110, durationSeconds: 660 })),
      ClickedPlay(),
    ])
    expect(
      audioCommandsOf(resumed.commands).map(command => command.name),
    ).toEqual(['PauseAudio', 'PlayAudio'])
  })

  it('a link to a moment of a recording in progress opens the copy there', () => {
    const { model } = run(
      modelForRoute(
        PlaybackRoute({
          recordingID,
          t: Option.some('100'),
          focus: Option.none(),
        }),
      ),
      [observed(detail()), found(copy())],
    )
    expect(readyOf(model).positionSeconds).toBe(100)
    expect(readyOf(model).maybePendingSeekSeconds).toEqual(Option.some(100))
  })

  it('follows the newest line until the listener plays, then the line being heard', () => {
    const acquired = run(live(), [found(copy()), AcquiredAudioPlayer()]).model
    expect(
      Option.map(followedSectionOf(readyOf(acquired)), line => line.id),
    ).toEqual(Option.some('line-2'))
    const listening = run(acquired, [
      ClickedPlay(),
      HeardAudioPosition({ seconds: 592 }),
    ]).model
    expect(
      Option.map(followedSectionOf(readyOf(listening)), line => line.id),
    ).toEqual(Option.some('line-1'))
  })

  it('keeps playing the copy when the recording stops and its file arrives', () => {
    const playing = run(live(), [
      found(copy()),
      AcquiredAudioPlayer(),
      ClickedPlay(),
    ]).model
    const { model } = run(playing, [
      observed(stopped(StoredAudio({ fileID: 'audio-file', byteCount: 10 }))),
      found(
        copy({ isFinished: true, durationSeconds: 650, segmentCount: 109 }),
      ),
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    ])
    expect(audioSourceOf(model)).toEqual(
      Option.some({ source: copySource, attempt: 0 }),
    )
    expect(liveAudioCaptionOf(readyOf(model))).toEqual(Option.none())
  })

  it('a stopped recording still waiting for its file plays its finished copy from the start', () => {
    const { model } = run(modelForRoute(RecordingRoute({ recordingID })), [
      observed(stopped(UploadingAudio({ byteCount: 0 }))),
      found(
        copy({ isFinished: true, durationSeconds: 650, segmentCount: 109 }),
      ),
    ])
    expect(audioSourceOf(model)).toEqual(
      Option.some({ source: copySource, attempt: 0 }),
    )
    expect(readyOf(model).positionSeconds).toBe(0)
    expect(durationOf(readyOf(model))).toBe(650)
  })

  it('a recording whose file is stored plays the file and never asks for the copy', () => {
    const { model } = run(modelForRoute(RecordingRoute({ recordingID })), [
      observed(stopped(StoredAudio({ fileID: 'audio-file', byteCount: 10 }))),
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    ])
    expect(audioSourceOf(model)).toEqual(
      Option.some({
        source: FileAudioSource({ url: 'https://files/audio' }),
        attempt: 0,
      }),
    )
    expect(compressedCopyRequestOf(model)).toEqual(Option.none())
  })

  it('says why when the copy cannot be read, and Retry asks again', () => {
    const failed = run(live(), [
      FailedObserveCompressedCopy({
        recordingID,
        reason: 'The live audio did not load. The network connection dropped.',
      }),
    ]).model
    expect(readyOf(failed).compressedCopy).toEqual({
      _tag: 'FailedCompressedCopy',
      reason: 'The live audio did not load. The network connection dropped.',
    })
    const retried = run(failed, [ClickedRetryAudio()]).model
    expect(compressedCopyRequestOf(retried)).toEqual(
      Option.some({ recordingID, startedAtMs, attempt: 1 }),
    )
  })
})
