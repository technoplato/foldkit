import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ClickedJumpBackward,
  ClickedJumpForward,
  ClickedPlayPause,
  ClickedWord,
  FailedAudioControl,
  MountedAudioPlayer,
  ObservedAudioEnded,
  ObservedAudioPaused,
  ObservedAudioPlaying,
  ObservedAudioTime,
  OpenedRoute,
  ScrubbedPlayback,
  SucceededFetchWordsData,
} from './message.js'
import {
  MediaAudioFailure,
  Model,
  PlayingPlayback,
  Word,
  WordsData,
  activeWordAt,
} from './model.js'
import { RecordingSegmentRoute } from './route.js'
import { init, update } from './update.js'

const route = RecordingSegmentRoute.make({
  recordingID: 'recording-123',
  segmentRangeID: 'segment-range-456',
})
const otherRoute = RecordingSegmentRoute.make({
  recordingID: 'recording-789',
  segmentRangeID: 'segment-range-012',
})
const data = WordsData.make({
  version: 1,
  recordingID: route.recordingID,
  segmentRangeID: route.segmentRangeID,
  range: {
    firstSegmentID: 'segment-a',
    lastSegmentID: 'segment-b',
  },
  words: [
    Word.make({ id: 'word-1', text: 'Foldkit', start: 1, end: 2.5 }),
    Word.make({
      id: 'word-2',
      text: 'keeps',
      start: 3,
      end: 4,
      speaker: 'Alex',
    }),
    Word.make({ id: 'word-3', text: 'state', start: 5, end: 6 }),
  ],
  audio: {
    url: '/recording-123/segment-range-456/audio.wav',
    duration: 20,
    mimeType: 'audio/wav',
  },
})

const loadedModel = () => {
  const [loading] = init(route)
  const [loaded] = update(
    loading,
    SucceededFetchWordsData.make({ route, data }),
  )
  const [mounted] = update(
    loaded,
    MountedAudioPlayer.make({ maybeDuration: Option.some(20) }),
  )
  return mounted
}

describe('Words update', () => {
  it('loads the route with one typed fetch Command', () => {
    const [model, commands] = init(route)

    expect(model.load._tag).toBe('LoadingWordsData')
    expect(commands).toMatchObject([
      { name: 'FetchWordsData', args: { route } },
    ])
  })

  it('ignores responses from a stale route', () => {
    const [initial] = init(route)
    const [next] = update(initial, OpenedRoute.make({ route: otherRoute }))
    const [afterStaleSuccess] = update(
      next,
      SucceededFetchWordsData.make({ route, data }),
    )

    expect(afterStaleSuccess).toBe(next)
    expect(next.route).toEqual(otherRoute)
  })

  it('selects words from time and seeks clicked words without changing play state', () => {
    const [playing] = update(loadedModel(), ObservedAudioPlaying.make({}))
    const [selected, commands] = update(
      playing,
      ClickedWord.make({ wordID: 'word-2' }),
    )
    const maybeActiveWord = activeWordAt(data.words, selected.currentTime)

    expect(playing.playback).toEqual(PlayingPlayback.make({}))
    expect(selected.playback).toEqual(playing.playback)
    expect(selected.currentTime).toBe(3)
    expect(Option.map(maybeActiveWord, word => word.id)).toEqual(
      Option.some('word-2'),
    )
    expect(commands).toMatchObject([
      { name: 'SeekAudio', args: { seconds: 3 } },
    ])

    const [observed] = update(
      selected,
      ObservedAudioTime.make({ seconds: 5.5 }),
    )
    expect(
      Option.map(
        activeWordAt(data.words, observed.currentTime),
        word => word.id,
      ),
    ).toEqual(Option.some('word-3'))
  })

  it('scrubs and jumps with duration clamping', () => {
    const [scrubbed, scrubCommands] = update(
      loadedModel(),
      ScrubbedPlayback.make({ seconds: 99 }),
    )
    const [rewound, rewindCommands] = update(
      modelAt(scrubbed, 4),
      ClickedJumpBackward.make({}),
    )
    const [advanced, advanceCommands] = update(
      modelAt(scrubbed, 15),
      ClickedJumpForward.make({}),
    )

    expect(scrubbed.currentTime).toBe(20)
    expect(scrubCommands).toMatchObject([
      { name: 'SeekAudio', args: { seconds: 20 } },
    ])
    expect(rewound.currentTime).toBe(0)
    expect(rewindCommands).toMatchObject([
      { name: 'SeekAudio', args: { seconds: 0 } },
    ])
    expect(advanced.currentTime).toBe(20)
    expect(advanceCommands).toMatchObject([
      { name: 'SeekAudio', args: { seconds: 20 } },
    ])
  })

  it('maps play and pause intent to imperative Commands', () => {
    const [playRequested, playCommands] = update(
      loadedModel(),
      ClickedPlayPause.make({}),
    )
    const [playing] = update(playRequested, ObservedAudioPlaying.make({}))
    const [pauseRequested, pauseCommands] = update(
      playing,
      ClickedPlayPause.make({}),
    )
    const [paused] = update(pauseRequested, ObservedAudioPaused.make({}))

    expect(playCommands).toMatchObject([{ name: 'PlayAudio' }])
    expect(pauseCommands).toMatchObject([{ name: 'PauseAudio' }])
    expect(paused.playback._tag).toBe('PausedPlayback')
  })

  it('models ended playback and typed audio failures', () => {
    const [ended] = update(
      loadedModel(),
      ObservedAudioEnded.make({ seconds: 19.9 }),
    )
    const failure = MediaAudioFailure.make({
      code: 3,
      reason: 'The browser could not decode the audio.',
    })
    const [failed] = update(ended, FailedAudioControl.make({ failure }))

    expect(ended.playback._tag).toBe('EndedPlayback')
    expect(ended.currentTime).toBe(20)
    expect(failed.playback).toMatchObject({
      _tag: 'FailedPlayback',
      failure,
    })
  })

  it('keeps active-word lookup total outside the transcript timeline', () => {
    expect(activeWordAt(data.words, 0)).toEqual(Option.none())
    expect(activeWordAt(data.words, 2.75)).toEqual(Option.none())
    expect(activeWordAt([], 4)).toEqual(Option.none())
  })
})

const modelAt = (model: ReturnType<typeof loadedModel>, seconds: number) =>
  Model.make({ ...model, currentTime: seconds })
