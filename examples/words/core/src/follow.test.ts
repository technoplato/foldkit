import { Array, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

import { PlaybackRoute, RecordingRoute, SectionRoute } from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedPlayheadVisibility,
  ClickedPlay,
  ClickedReturnToPlayhead,
  CompletedScrollToSection,
  HeardAudioPlaying,
  HeardAudioPosition,
  type Message,
  ObservedFileUrls,
  ObservedRecording,
  PressedShortcut,
  ScrolledTranscriptAway,
} from './message.js'
import type { Model, ReadyPlayback } from './model.js'
import { playbackClockOf } from './playbackClock.js'
import {
  type RecordingDetail,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import {
  followedSectionOf,
  isReturnShownOf,
  modelForRoute,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

// Made-up words: nothing here is from a real recording.
const section = (
  index: number,
  startSeconds: number,
  text: string,
): Section => ({
  id: `section-${index.toString()}`,
  index,
  startSeconds,
  endSeconds: startSeconds + 2,
  maybeSpeakerID: Option.none(),
  text,
  words: [
    {
      id: `section-${index.toString()}:0`,
      text,
      startSeconds: startSeconds + 0.2,
      endSeconds: startSeconds + 1,
    },
  ],
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const sectionA = section(0, 5, 'The keeper lit the lamp.')
const sectionB = section(1, 20, 'Far out a bell answered.')
const sectionC = section(2, 40, 'Gulls settled on the gallery.')
const sectionD = section(3, 44, 'A boat rounded the point.')

const finished = (sections: ReadonlyArray<Section>): RecordingDetail => ({
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
})

const recording = (sections: ReadonlyArray<Section>): RecordingDetail => ({
  ...finished(sections),
  summary: { ...finished(sections).summary, activity: 'Recording' },
  audio: UploadingAudio({ byteCount: 0 }),
})

const observed = (detail: RecordingDetail): Message =>
  ObservedRecording({
    recordingID,
    maybeDetail: Option.some(detail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  })

const readyOf = (model: Model): ReadyPlayback => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const folded = (model: Model, messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    messages,
    model,
    (current, message) => update(current, message)[0],
  )

type PageMove = Readonly<{ name: string; args: unknown }>

// NOTE: the one place these tests read how the Model asks the page to
// move: today as the Commands `ScrollToSection` and `ScrollToRecordingTitle`.
const told = (
  model: Model,
  message: Message,
): Readonly<{
  model: Model
  ready: ReadyPlayback
  moves: ReadonlyArray<PageMove>
}> => {
  const [next, commands] = update(model, message)
  return {
    model: next,
    ready: readyOf(next),
    moves: pipe(
      commands,
      Array.filter(command => command.name.startsWith('ScrollTo')),
      Array.map(command => ({ name: command.name, args: command.args })),
    ),
  }
}

const toTitle: PageMove = { name: 'ScrollToRecordingTitle', args: undefined }

const toMiddle = (followed: Section): PageMove => ({
  name: 'ScrollToSection',
  args: { sectionID: followed.id, placement: 'Center' },
})

const toBottomEdge = (followed: Section): PageMove => ({
  name: 'ScrollToSection',
  args: { sectionID: followed.id, placement: 'LiveEdge' },
})

const followedIDOf = (ready: ReadyPlayback): Option.Option<string> =>
  Option.map(followedSectionOf(ready), followed => followed.id)

const opening = modelForRoute(RecordingRoute({ recordingID }))

const playingAt = (seconds: number): Model =>
  folded(opening, [
    observed(finished([sectionA, sectionB, sectionC, sectionD])),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    AcquiredAudioPlayer(),
    ClickedPlay(),
    HeardAudioPlaying(),
    HeardAudioPosition({ seconds }),
  ])

const recordingWith = (sections: ReadonlyArray<Section>): Model =>
  folded(opening, [observed(recording(sections))])

const offScreen = (followed: Section): Message =>
  ChangedPlayheadVisibility({ sectionID: followed.id, visibility: 'OffScreen' })

const onScreen = (followed: Section): Message =>
  ChangedPlayheadVisibility({ sectionID: followed.id, visibility: 'OnScreen' })

describe('how the Words Model follows the voice (plan 14, slice 2)', () => {
  describe('where a recording opens is the Model’s to say', () => {
    it('a recording opened by its plain link starts at its title, following the voice', () => {
      const opened = told(
        opening,
        observed(finished([sectionA, sectionB, sectionC])),
      )
      expect(opened.moves).toEqual([toTitle])
      expect(opened.ready.follow).toBe('Following')
    })

    it('a recording opened at a linked section shows that section in the middle and does not follow the voice', () => {
      const opened = told(
        modelForRoute(
          SectionRoute({
            recordingID,
            sectionID: sectionC.id,
            t: Option.none(),
          }),
        ),
        observed(finished([sectionA, sectionB, sectionC])),
      )
      expect(opened.moves).toEqual([toMiddle(sectionC)])
      expect(opened.ready.follow).toBe('Detached')
    })

    it('a recording opened at a moment shows the section spoken then in the middle, following the voice', () => {
      const opened = told(
        modelForRoute(
          PlaybackRoute({
            recordingID,
            t: Option.some('21'),
            focus: Option.none(),
          }),
        ),
        observed(finished([sectionA, sectionB, sectionC])),
      )
      expect(opened.moves).toEqual([toMiddle(sectionB)])
      expect(opened.ready.follow).toBe('Following')
    })

    it('a recording in progress opens with its newest words at the bottom edge', () => {
      const opened = told(opening, observed(recording([sectionA, sectionB])))
      expect(opened.moves).toEqual([toBottomEdge(sectionB)])
      expect(opened.ready.follow).toBe('Following')
    })
  })

  describe('the view moves when the voice enters a new section, not on every word', () => {
    it('the place moving on inside a section asks for no move', () => {
      expect(
        told(playingAt(20.2), HeardAudioPosition({ seconds: 21.4 })).moves,
      ).toEqual([])
    })

    it('the place reaching the next section brings that section to the middle', () => {
      expect(
        told(playingAt(21.4), HeardAudioPosition({ seconds: 40.1 })).moves,
      ).toEqual([toMiddle(sectionC)])
    })
  })

  describe('while recording, the newest words sit at the bottom edge', () => {
    const following = recordingWith([sectionA, sectionB])

    it('a new section is brought to the bottom edge', () => {
      expect(
        told(following, observed(recording([sectionA, sectionB, sectionC])))
          .moves,
      ).toEqual([toBottomEdge(sectionC)])
    })

    it('the newest section growing brings it to the bottom edge again', () => {
      const grown = {
        ...sectionB,
        text: 'Far out a bell answered, slow and low.',
      }
      expect(
        told(following, observed(recording([sectionA, grown]))).moves,
      ).toEqual([toBottomEdge(sectionB)])
    })

    it('the same words arriving again move nothing', () => {
      expect(
        told(following, observed(recording([sectionA, sectionB]))).moves,
      ).toEqual([])
    })

    it('an earlier section changing moves nothing', () => {
      const corrected = { ...sectionA, text: 'The keeper lit the old lamp.' }
      expect(
        told(following, observed(recording([corrected, sectionB]))).moves,
      ).toEqual([])
    })

    it('no word sounds there: the followed section is the newest one and no word is marked', () => {
      const ready = readyOf(following)
      expect(followedIDOf(ready)).toEqual(Option.some(sectionB.id))
      expect(playbackClockOf(ready).isMarking).toBe(false)
    })

    it('once the listener has scrolled away, new words move nothing', () => {
      const away = folded(following, [ScrolledTranscriptAway()])
      expect(
        told(away, observed(recording([sectionA, sectionB, sectionC]))).moves,
      ).toEqual([])
    })
  })

  describe('a recording that just finished stays where the listener is', () => {
    const early = { ...sectionA, startSeconds: 0 }
    const following = recordingWith([early, sectionB, sectionC])

    it('finishing asks for no move, though the followed section is now the one at the place', () => {
      const done = told(
        following,
        observed(finished([early, sectionB, sectionC])),
      )
      expect(followedIDOf(readyOf(following))).toEqual(Option.some(sectionC.id))
      expect(followedIDOf(done.ready)).toEqual(Option.some(early.id))
      expect(done.moves).toEqual([])
      expect(done.ready.follow).toBe('Following')
    })

    it('finishing with one more section asks for no move either', () => {
      expect(
        told(
          following,
          observed(finished([early, sectionB, sectionC, sectionD])),
        ).moves,
      ).toEqual([])
    })

    it('once finished, the voice entering a section is followed as in any recording', () => {
      const done = folded(following, [
        observed(finished([early, sectionB, sectionC])),
      ])
      expect(told(done, HeardAudioPosition({ seconds: 20.5 })).moves).toEqual([
        toMiddle(sectionB),
      ])
    })
  })

  describe('only a wheel or a finger stops following', () => {
    it('the gesture stops following, and the voice entering the next section then moves nothing', () => {
      const away = told(playingAt(20.2), ScrolledTranscriptAway())
      expect(away.ready.follow).toBe('Detached')
      expect(away.moves).toEqual([])
      expect(
        told(away.model, HeardAudioPosition({ seconds: 40.1 })).moves,
      ).toEqual([])
    })

    it('a key that skips ahead keeps following and brings the new section to the middle', () => {
      const skipped = told(
        playingAt(6),
        PressedShortcut({ shortcut: 'SkipForward' }),
      )
      expect(skipped.ready.follow).toBe('Following')
      expect(skipped.moves).toEqual([toMiddle(sectionB)])
    })

    it('the followed section leaving the screen, as under the scrollbar or a key, does not stop following', () => {
      const left = told(playingAt(20.2), offScreen(sectionB))
      expect(left.ready.follow).toBe('Following')
      expect(left.ready.playheadVisibility).toBe('OffScreen')
    })

    it('a jump the page made itself changes nothing', () => {
      const playing = playingAt(20.2)
      const jumped = told(playing, CompletedScrollToSection())
      expect(jumped.model).toEqual(playing)
      expect(jumped.moves).toEqual([])
    })
  })

  describe('there is no quiet period', () => {
    it('the next section is brought to the middle right after a scroll that did not stop following', () => {
      const left = folded(playingAt(20.2), [offScreen(sectionB)])
      expect(told(left, HeardAudioPosition({ seconds: 40.1 })).moves).toEqual([
        toMiddle(sectionC),
      ])
    })

    it('and right after the page’s own jump', () => {
      const jumped = folded(playingAt(20.2), [CompletedScrollToSection()])
      expect(told(jumped, HeardAudioPosition({ seconds: 40.1 })).moves).toEqual(
        [toMiddle(sectionC)],
      )
    })
  })

  describe('following starts again by itself', () => {
    const away = folded(playingAt(20.2), [
      ScrolledTranscriptAway(),
      offScreen(sectionB),
    ])

    it('when the spoken section comes back on screen, with no move asked for', () => {
      const back = told(away, onScreen(sectionB))
      expect(back.ready.follow).toBe('Following')
      expect(back.moves).toEqual([])
      expect(
        told(back.model, HeardAudioPosition({ seconds: 40.1 })).moves,
      ).toEqual([toMiddle(sectionC)])
    })

    it('not when a section the voice is not in comes on screen', () => {
      expect(told(away, onScreen(sectionC)).ready.follow).toBe('Detached')
    })

    it('while recording, when the newest words come back on screen', () => {
      const scrolledUp = folded(recordingWith([sectionA, sectionB]), [
        ScrolledTranscriptAway(),
        offScreen(sectionB),
      ])
      expect(told(scrolledUp, onScreen(sectionB)).ready.follow).toBe(
        'Following',
      )
    })
  })

  describe('Back to Playhead shows only while detached with the playhead off screen', () => {
    const playing = playingAt(20.2)

    it('does not show while the page follows, on screen or off', () => {
      expect(isReturnShownOf(readyOf(playing))).toBe(false)
      expect(
        isReturnShownOf(readyOf(folded(playing, [offScreen(sectionB)]))),
      ).toBe(false)
    })

    it('does not show while detached with the spoken section still on screen', () => {
      expect(
        isReturnShownOf(readyOf(folded(playing, [ScrolledTranscriptAway()]))),
      ).toBe(false)
    })

    it('shows while detached with the spoken section off screen, whichever came first', () => {
      expect(
        isReturnShownOf(
          readyOf(
            folded(playing, [ScrolledTranscriptAway(), offScreen(sectionB)]),
          ),
        ),
      ).toBe(true)
      expect(
        isReturnShownOf(
          readyOf(
            folded(playing, [offScreen(sectionB), ScrolledTranscriptAway()]),
          ),
        ),
      ).toBe(true)
    })

    it('pressing it follows again and brings the spoken section to the middle', () => {
      const returned = told(
        folded(playing, [ScrolledTranscriptAway(), offScreen(sectionB)]),
        ClickedReturnToPlayhead(),
      )
      expect(returned.ready.follow).toBe('Following')
      expect(returned.moves).toEqual([toMiddle(sectionB)])
    })

    it('while recording, pressing it brings the newest words to the bottom edge', () => {
      const returned = told(
        folded(recordingWith([sectionA, sectionB]), [
          ScrolledTranscriptAway(),
          offScreen(sectionB),
        ]),
        ClickedReturnToPlayhead(),
      )
      expect(returned.ready.follow).toBe('Following')
      expect(returned.moves).toEqual([toBottomEdge(sectionB)])
    })
  })

  describe('the spoken word and its section are marked', () => {
    it('a word is marked while a finished recording is open, also after the listener scrolled away', () => {
      const playing = playingAt(20.2)
      expect(playbackClockOf(readyOf(playing)).isMarking).toBe(true)
      expect(
        playbackClockOf(readyOf(folded(playing, [ScrolledTranscriptAway()])))
          .isMarking,
      ).toBe(true)
    })

    it('the clock the page marks from is at the place the player last reported, and runs while it plays', () => {
      const clock = playbackClockOf(readyOf(playingAt(20.2)))
      expect([clock.placeSeconds, clock.rate]).toEqual([20.2, 1])
    })
  })
})
