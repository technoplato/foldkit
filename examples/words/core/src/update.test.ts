import { Array, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import {
  PlaybackRoute,
  RecordingListRoute,
  RecordingRoute,
  SectionRoute,
  scribeRouteToShareUrl,
} from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedUrl,
  ClickedCopyMomentLink,
  ClickedCopySectionLink,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedReturnToPlayhead,
  ClickedWord,
  ConfirmedMissingRecording,
  ElapsedFocusHighlight,
  EndedScrub,
  HeardAudioPosition,
  type Message,
  MovedScrub,
  ObservedFileUrls,
  ObservedRecording,
  ScrolledTranscriptAway,
  StartedScrub,
} from './message.js'
import type { Model, ReadyPlayback } from './model.js'
import {
  type RecordingDetail,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import {
  audioSourceOf,
  fileIDsOf,
  followedSectionOf,
  isLiveRecording,
  modelForRoute,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

const section = (
  id: string,
  index: number,
  startSeconds: number,
  text: string,
): Section => ({
  id,
  index,
  startSeconds,
  endSeconds: startSeconds + 2,
  maybeSpeakerID: Option.none(),
  text,
  words: [
    {
      id: `${id}:0`,
      text,
      startSeconds: startSeconds + 0.2,
      endSeconds: startSeconds + 1,
    },
  ],
  isFinal: true,
})

const sectionA = section('0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', 0, 5, 'Hello')
const sectionB = section('1b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', 1, 20, 'World')

const detail = (overrides: Partial<RecordingDetail> = {}): RecordingDetail => ({
  summary: {
    id: recordingID,
    title: 'Recording 018',
    startedAtMs: 0,
    durationSeconds: 60,
    activity: 'Idle',
    maybeDeviceIcon: Option.none(),
    previewLines: [],
  },
  sections: [sectionA, sectionB],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
  ...overrides,
})

const urlOf = (link: string) => Option.getOrThrow(fromString(link))

const run = (model: Model, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    { model, commandNames: Array.empty<string>() },
    (state, message) => {
      const [next, commands] = update(state.model, message)
      return {
        model: next,
        commandNames: [
          ...state.commandNames,
          ...commands.map(command => command.name),
        ],
      }
    },
  )

const readyOf = (model: Model): ReadyPlayback => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const opened = (route: Parameters<typeof scribeRouteToShareUrl>[0]) =>
  modelForRoute(route)

const observed = (recordingDetail: RecordingDetail = detail()) =>
  ObservedRecording({
    recordingID,
    maybeDetail: Option.some(recordingDetail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })

describe('opening links', () => {
  it('opens a section link one second before the section and highlights it', () => {
    const start = opened(
      SectionRoute({
        recordingID,
        sectionID: sectionB.id,
        t: Option.none(),
      }),
    )
    const { model, commandNames } = run(start, [observed()])
    const ready = readyOf(model)

    expect(ready.positionSeconds).toBe(19)
    expect(ready.maybePendingSeekSeconds).toEqual(Option.some(19))
    expect(ready.maybeFocusedSectionID).toEqual(Option.some(sectionB.id))
    expect(ready.follow).toBe('Detached')
    expect(commandNames).toEqual(['ClearFocusHighlightLater'])

    const cleared = run(model, [
      ElapsedFocusHighlight({ revision: ready.focusRevision }),
    ])
    expect(readyOf(cleared.model).maybeFocusedSectionID).toEqual(Option.none())
  })

  it("uses the link's t when it has one", () => {
    const start = opened(
      SectionRoute({
        recordingID,
        sectionID: sectionB.id,
        t: Option.some('12.5'),
      }),
    )
    expect(readyOf(run(start, [observed()]).model).positionSeconds).toBe(12.5)
  })

  it('seeks once the audio player is ready', () => {
    const start = opened(
      PlaybackRoute({
        recordingID,
        t: Option.some('30'),
        focus: Option.none(),
      }),
    )
    const { model, commandNames } = run(start, [
      observed(),
      AcquiredAudioPlayer(),
    ])

    expect(readyOf(model).maybePendingSeekSeconds).toEqual(Option.none())
    expect(commandNames).toEqual(['SeekAudio'])
  })

  it('asks the server before saying a recording is not shared, and recovers if it arrives', () => {
    const start = opened(RecordingRoute({ recordingID }))
    const empty = ObservedRecording({
      recordingID,
      maybeDetail: Option.none(),
      skippedCount: 0,
      maybeSkippedReason: Option.none(),
    })
    const afterEmpty = run(start, [empty])
    expect(afterEmpty.commandNames).toEqual(['ConfirmRecording'])
    expect(afterEmpty.model.playback._tag).toBe('OpeningPlayback')

    const missing = run(afterEmpty.model, [
      ConfirmedMissingRecording({ recordingID }),
    ])
    expect(missing.model.playback._tag).toBe('MissingRecording')

    expect(run(missing.model, [observed()]).model.playback._tag).toBe(
      'ReadyPlayback',
    )
  })

  it('closes playback when the URL returns to the list', () => {
    const start = run(opened(RecordingRoute({ recordingID })), [observed()])
    const list = run(start.model, [
      ChangedUrl({ url: urlOf(scribeRouteToShareUrl(RecordingListRoute())) }),
    ])
    expect(list.model.playback._tag).toBe('NoPlayback')
  })
})

describe('playing', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [
    observed(),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-1' } }),
    AcquiredAudioPlayer(),
  ]).model

  it('loads the first audio URL and keeps it when the signed URL changes', () => {
    expect(audioSourceOf(ready)).toEqual(
      Option.some({ url: 'https://files/audio-1', attempt: 0 }),
    )
    const refreshed = run(ready, [
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio-2' } }),
    ]).model
    expect(audioSourceOf(refreshed)).toEqual(
      Option.some({ url: 'https://files/audio-1', attempt: 0 }),
    )
    const retried = run(refreshed, [ClickedRetryAudio()]).model
    expect(audioSourceOf(retried)).toEqual(
      Option.some({ url: 'https://files/audio-2', attempt: 1 }),
    )
  })

  it('plays from a clicked word and follows the playhead again', () => {
    const detached = run(ready, [ScrolledTranscriptAway()]).model
    const { model, commandNames } = run(detached, [
      ClickedWord({ seconds: 20.2 }),
    ])
    const next = readyOf(model)

    expect(next.positionSeconds).toBe(20.2)
    expect(next.transport).toBe('Playing')
    expect(next.follow).toBe('Following')
    expect(commandNames).toEqual(['SeekAudio', 'PlayAudio'])
    expect(
      Option.map(followedSectionOf(next), followed => followed.id),
    ).toEqual(Option.some(sectionB.id))
  })

  it('ignores player positions while the listener drags the scrubber, then seeks', () => {
    const { model, commandNames } = run(ready, [
      StartedScrub({ seconds: 10 }),
      MovedScrub({ seconds: 40 }),
      HeardAudioPosition({ seconds: 3 }),
      EndedScrub({ seconds: 41 }),
    ])
    const next = readyOf(model)

    expect(next.positionSeconds).toBe(41)
    expect(next.scrub._tag).toBe('NotScrubbing')
    expect(commandNames).toEqual(['SeekAudio'])
  })

  it('returns to the playhead after scrolling away', () => {
    const detached = run(ready, [ScrolledTranscriptAway()]).model
    expect(readyOf(detached).follow).toBe('Detached')
    expect(
      readyOf(run(detached, [ClickedReturnToPlayhead()]).model).follow,
    ).toBe('Following')
  })

  it('plays only once the audio player is ready', () => {
    const noPlayer = run(opened(RecordingRoute({ recordingID })), [observed()])
    expect(run(noPlayer.model, [ClickedPlay()]).commandNames).toEqual([])
    expect(run(ready, [ClickedPlay()]).commandNames).toEqual(['PlayAudio'])
  })
})

describe('following a recording in progress', () => {
  it('follows the newest section as snapshots arrive and has no audio yet', () => {
    const live = detail({
      summary: { ...detail().summary, activity: 'Recording' },
      audio: UploadingAudio({ byteCount: 0 }),
    })
    const first = run(opened(RecordingRoute({ recordingID })), [observed(live)])
    const firstReady = readyOf(first.model)
    expect(isLiveRecording(firstReady)).toBe(true)
    expect(audioSourceOf(first.model)).toEqual(Option.none())
    expect(fileIDsOf(first.model)).toEqual([])

    const sectionC = section(
      '2b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
      2,
      40,
      'Again',
    )
    const grown = run(first.model, [
      observed({ ...live, sections: [sectionA, sectionB, sectionC] }),
    ])
    expect(
      Option.map(
        followedSectionOf(readyOf(grown.model)),
        followed => followed.id,
      ),
    ).toEqual(Option.some(sectionC.id))
  })
})

describe('copying links', () => {
  const ready = run(opened(RecordingRoute({ recordingID })), [observed()]).model

  it('copies a section link with the one-second lead-in', () => {
    const [, commands] = update(
      ready,
      ClickedCopySectionLink({ sectionID: sectionB.id }),
    )
    expect(commands.map(command => command.args)).toEqual([
      {
        text: `https://words.knophy.com/recording/${recordingID}/section/${sectionB.id}?t=19`,
        notice: {
          text: 'Copied link to this moment',
          isFailure: false,
          revision: 1,
        },
      },
    ])
  })

  it('copies a link to the current moment', () => {
    const at = run(ready, [HeardAudioPosition({ seconds: 42.7 })]).model
    const [, commands] = update(at, ClickedCopyMomentLink())
    expect(commands.map(command => command.args)).toEqual([
      {
        text: `https://words.knophy.com/playback/${recordingID}?t=41`,
        notice: {
          text: 'Copied link to this moment',
          isFailure: false,
          revision: 1,
        },
      },
    ])
  })
})
