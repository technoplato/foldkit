import { Array, Option } from 'effect'
import { Reader } from 'foldkit/behavior'
import { transcriptAt } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { MediaSessionSeek, MediaSessionSkip } from './audioPlayer.js'
import { PlaybackRoute, RecordingRoute, SectionRoute } from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedFindQuery,
  ClickedEnterFullScreen,
  ClickedPause,
  ClickedPlay,
  ClickedReturnToPlayhead,
  ClickedSkip,
  ClickedWord,
  ClosedFind,
  ElapsedFocusHighlight,
  EndedScrub,
  HeardAudioPaused,
  HeardAudioPlaying,
  HeardAudioPosition,
  HeardMediaSessionAction,
  type Message,
  MovedScrub,
  ObservedFileUrls,
  ObservedRecording,
  PressedScrubberArrow,
  PressedShortcut,
  ScrolledTranscriptAway,
  SteppedFind,
} from './message.js'
import type { Model, ReadyPlayback } from './model.js'
import { newestSpokenSecondsOf, readAlongPlaybackOf } from './playbackClock.js'
import type { ReadAlongPlayback } from './readAlong.js'
import { readerMessageOf, readerOf } from './reader.js'
import {
  type RecordingDetail,
  type Section,
  StoredAudio,
  UploadingAudio,
} from './recording.js'
import {
  isReturnShownOf,
  modelForRoute,
  returnControlOf,
  shortcutContextOf,
  update,
} from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

const reportedAtMs = 1_795_200_000_000

// NOTE: made-up words. Nothing here is from a real recording.
const section = (
  index: number,
  startSeconds: number,
  texts: ReadonlyArray<string>,
): Section => ({
  id: `section-${index.toString()}`,
  index,
  startSeconds,
  endSeconds: startSeconds + 0.2 + texts.length * 0.5,
  maybeSpeakerID: Option.none(),
  text: texts.join(' '),
  words: Array.map(texts, (text, at) => ({
    id: `section-${index.toString()}:${at.toString()}`,
    text,
    startSeconds: startSeconds + 0.2 + at * 0.5,
    endSeconds: startSeconds + 0.6 + at * 0.5,
  })),
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const sectionA = section(0, 5, ['The', 'keeper', 'lit', 'the', 'lamp.'])
const sectionB = section(1, 20, ['Far', 'out', 'a', 'bell', 'answered.'])
const sectionC = section(2, 40, ['Gulls', 'settled', 'on', 'the', 'gallery.'])
const sectionD = section(3, 44, ['A', 'boat', 'rounded', 'the', 'point.'])

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

const told = (
  model: Model,
  message: Message,
): Readonly<{
  model: Model
  ready: ReadyPlayback
  commandNames: ReadonlyArray<string>
}> => {
  const [next, commands] = update(model, message)
  return {
    model: next,
    ready: readyOf(next),
    commandNames: Array.map(commands, command => command.name),
  }
}

const heardAt = (seconds: number): Message =>
  HeardAudioPosition({ seconds, wallClockMs: reportedAtMs })

const standingAt = (positionSeconds: number): ReadAlongPlayback => ({
  positionSeconds,
  isPlaying: false,
  reportedAtMs: 0,
  rate: 1,
})

const runningFrom = (positionSeconds: number): ReadAlongPlayback => ({
  positionSeconds,
  isPlaying: true,
  reportedAtMs,
  rate: 1,
})

const clockOf = (model: Model): ReadAlongPlayback =>
  readAlongPlaybackOf(readyOf(model))

const readerOfModel = (model: Model) => readerOf(readyOf(model), clockOf(model))

const currentOf = (
  model: Model,
): ReadonlyArray<readonly [string, ReadonlyArray<string>]> =>
  Array.map(
    Array.filter(
      transcriptAt(readerOfModel(model), reportedAtMs).passages,
      passage => passage.isCurrent === true,
    ),
    passage => [
      passage.key,
      Array.map(
        Array.filter(passage.words, word => word.isCurrent === true),
        word => word.token,
      ),
    ],
  )

const opening = modelForRoute(RecordingRoute({ recordingID }))

const pausedAt = (seconds: number): Model =>
  folded(opening, [
    observed(finished([sectionA, sectionB, sectionC, sectionD])),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    AcquiredAudioPlayer(),
    heardAt(seconds),
  ])

const playingAt = (seconds: number): Model =>
  folded(pausedAt(seconds), [
    ClickedPlay(),
    HeardAudioPlaying(),
    heardAt(seconds),
  ])

const recordingWith = (sections: ReadonlyArray<Section>): Model =>
  folded(opening, [observed(recording(sections))])

describe('how the Words Model follows the voice (plan 14, slice 2)', () => {
  describe('where a recording opens', () => {
    it('a recording opened by its plain link starts at its title, following the voice', () => {
      const opened = told(
        opening,
        observed(finished([sectionA, sectionB, sectionC])),
      )
      expect(opened.commandNames).toEqual(['ScrollToRecordingTitle'])
      expect(opened.ready.reader._tag).toBe('Following')
    })

    it('a recording opened at a linked section asks for that section in the middle, does not follow the voice, and shows the way back', () => {
      const [next, commands] = update(
        modelForRoute(
          SectionRoute({
            recordingID,
            sectionID: sectionC.id,
            t: Option.none(),
          }),
        ),
        observed(finished([sectionA, sectionB, sectionC])),
      )
      expect(
        Array.map(
          Array.filter(commands, command => command.name === 'ScrollToSection'),
          command => command.args,
        ),
      ).toEqual([{ sectionID: sectionC.id }])
      expect(readyOf(next).reader._tag).toBe('Detached')
      expect(isReturnShownOf(readyOf(next))).toBe(true)
    })

    it('a recording opened at a moment asks for no scroll: the reader’s clock stands there, and the words follow', () => {
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
      expect(opened.commandNames).toEqual([])
      expect(clockOf(opened.model)).toEqual(standingAt(21))
      expect(readerOfModel(opened.model).isFollowing).toBe(true)
    })

    it('a recording in progress asks for no scroll: the reader’s clock stands at its newest word, and the words follow', () => {
      const opened = told(opening, observed(recording([sectionA, sectionB])))
      expect(opened.commandNames).toEqual([])
      expect(clockOf(opened.model)).toEqual(standingAt(22.2))
      expect(readerOfModel(opened.model).isFollowing).toBe(true)
    })
  })

  describe('the clock the painters follow word by word', () => {
    it('runs from the place and the wall-clock time the player last reported, while audio plays', () => {
      expect(clockOf(playingAt(20.2))).toEqual(runningFrom(20.2))
    })

    it('the player reporting a new place moves the clock and asks for no scroll', () => {
      const moved = told(playingAt(20.2), heardAt(40.3))
      expect(moved.commandNames).toEqual([])
      expect(clockOf(moved.model)).toEqual(runningFrom(40.3))
    })

    it('stands at the place while paused', () => {
      expect(clockOf(pausedAt(20.2))).toEqual(standingAt(20.2))
      expect(clockOf(folded(playingAt(20.2), [HeardAudioPaused()]))).toEqual(
        standingAt(20.2),
      )
    })

    it('stands at the new place after a skip, until the player reports from there', () => {
      const skipped = told(playingAt(6), ClickedSkip({ deltaSeconds: 15 }))
      expect(skipped.commandNames).toEqual(['SeekAudio'])
      expect(clockOf(skipped.model)).toEqual(standingAt(21))
      expect(clockOf(folded(skipped.model, [heardAt(21.1)]))).toEqual(
        runningFrom(21.1),
      )
    })

    it('stands at the place when Play is pressed, until the player says it plays and where', () => {
      const pressed = folded(pausedAt(20.2), [ClickedPlay()])
      expect(readyOf(pressed).transport).toBe('Playing')
      expect(clockOf(pressed)).toEqual(standingAt(20.2))
      expect(
        clockOf(folded(pressed, [HeardAudioPlaying(), heardAt(20.3)])),
      ).toEqual(runningFrom(20.3))
    })

    it('stands at the scrubber’s place while the listener drags it', () => {
      expect(
        clockOf(folded(playingAt(20.2), [MovedScrub({ seconds: 41 })])),
      ).toEqual(standingAt(41))
    })
  })

  describe('while recording, the newest word is the one followed', () => {
    const following = recordingWith([sectionA, sectionB])

    it('the newest thing said starts with the last word of the last section', () => {
      expect(newestSpokenSecondsOf(readyOf(following))).toEqual(
        Option.some(22.2),
      )
    })

    it('a new section moves the clock to its last word, and asks for no scroll', () => {
      const grown = told(
        following,
        observed(recording([sectionA, sectionB, sectionC])),
      )
      expect(
        Array.filter(grown.commandNames, name => name.startsWith('ScrollTo')),
      ).toEqual([])
      expect(clockOf(grown.model)).toEqual(standingAt(42.2))
    })

    it('a word added to the newest section moves the clock to that word', () => {
      const longer = section(1, 20, [
        'Far',
        'out',
        'a',
        'bell',
        'answered,',
        'slow',
      ])
      expect(
        clockOf(folded(following, [observed(recording([sectionA, longer]))])),
      ).toEqual(standingAt(22.7))
    })

    it('a newest section whose words are sealed is itself the one followed: the clock stands at its start and the reader marks it', () => {
      const sealed: Section = {
        ...sectionC,
        words: [],
        maybeWordsSeal: Option.some('Voice'),
      }
      const grown = folded(following, [
        observed(recording([sectionA, sectionB, sealed])),
      ])
      expect(clockOf(grown)).toEqual(standingAt(40))
      expect(currentOf(grown)).toEqual([['section-2', []]])
    })

    it('a newest section with text and no word times is followed the same way', () => {
      const textOnly: Section = { ...sectionC, words: [] }
      const grown = folded(following, [
        observed(recording([sectionA, sectionB, textOnly])),
      ])
      expect(clockOf(grown)).toEqual(standingAt(40))
      expect(currentOf(grown)).toEqual([['section-2', []]])
    })

    it('a recording in progress with no words yet has a clock at its start', () => {
      expect(clockOf(recordingWith([]))).toEqual(standingAt(0))
    })
  })

  describe('a section with no word times, in a finished recording', () => {
    const textOnly: Section = { ...sectionB, words: [] }
    const playingInText = folded(opening, [
      observed(finished([sectionA, textOnly, sectionC])),
      ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
      AcquiredAudioPlayer(),
      heardAt(25),
    ])

    it('is marked as one unit while the place is in it, with no word', () => {
      expect(currentOf(playingInText)).toEqual([['section-1', []]])
    })

    it('hands the mark to the next word when the voice reaches it', () => {
      expect(currentOf(folded(playingInText, [heardAt(40.3)]))).toEqual([
        ['section-2', ['section-2:0']],
      ])
    })
  })

  describe('leaving the voice', () => {
    it('the reader names the leave press, and the press is the listener scrolling away', () => {
      const playing = playingAt(20.2)
      const reader = readerOfModel(playing)
      expect(reader.leaveAction).toBe('ScrolledTranscriptAway')
      expect(
        readerMessageOf(readyOf(playing), 'ScrolledTranscriptAway'),
      ).toEqual(Option.some(ScrolledTranscriptAway()))
    })

    it('the listener scrolling away stops the words following, and shows the way back', () => {
      const away = told(playingAt(20.2), ScrolledTranscriptAway())
      expect(away.ready.reader._tag).toBe('Detached')
      expect(readerOfModel(away.model).isFollowing).toBe(false)
      expect(isReturnShownOf(away.ready)).toBe(true)
      expect(away.commandNames).toEqual([])
    })

    it('the words stay detached while the voice moves on by itself, pauses, plays and goes Full Screen', () => {
      const away = folded(playingAt(6), [ScrolledTranscriptAway()])
      expect(
        Array.map(
          [
            heardAt(40.3),
            ClickedPause(),
            ClickedPlay(),
            ClickedEnterFullScreen(),
          ],
          message => told(away, message).ready.reader._tag,
        ),
      ).toEqual(['Detached', 'Detached', 'Detached', 'Detached'])
    })

    it('while recording, the words stay detached as new words arrive', () => {
      const away = folded(recordingWith([sectionA, sectionB]), [
        ScrolledTranscriptAway(),
      ])
      const grown = told(
        away,
        observed(recording([sectionA, sectionB, sectionC])),
      )
      expect(grown.ready.reader._tag).toBe('Detached')
      expect(isReturnShownOf(grown.ready)).toBe(true)
    })
  })

  describe('following again', () => {
    const away = folded(playingAt(20.2), [ScrolledTranscriptAway()])

    it('the way back is the shared reader’s: none while the words follow, Back to Playhead once they do not, Back to Live while recording', () => {
      expect(returnControlOf(readyOf(playingAt(20.2)))).toEqual(Option.none())
      expect(returnControlOf(readyOf(recordingWith([sectionA])))).toEqual(
        Option.none(),
      )
      expect(returnControlOf(readyOf(away))).toEqual(
        Option.some({ target: 'Playhead', label: 'Back to Playhead' }),
      )
      expect(
        returnControlOf(
          readyOf(
            folded(recordingWith([sectionA, sectionB]), [
              ScrolledTranscriptAway(),
            ]),
          ),
        ),
      ).toEqual(Option.some({ target: 'Live', label: 'Back to Live' }))
      expect(isReturnShownOf(readyOf(away))).toBe(true)
    })

    it('pressing Back to Playhead follows again and asks for no scroll: the painter brings the spoken word to the middle', () => {
      const returned = told(away, ClickedReturnToPlayhead())
      expect(returned.ready.reader._tag).toBe('Following')
      expect(readerOfModel(returned.model).isFollowing).toBe(true)
      expect(returned.commandNames).toEqual([])
    })

    it('pressing Back to Live while recording follows the newest word again', () => {
      const returned = told(
        folded(recordingWith([sectionA, sectionB]), [ScrolledTranscriptAway()]),
        ClickedReturnToPlayhead(),
      )
      expect(returned.ready.reader._tag).toBe('Following')
      expect(clockOf(returned.model)).toEqual(standingAt(22.2))
      expect(returned.commandNames).toEqual([])
    })

    it('the L key returns only while the words do not follow', () => {
      expect(shortcutContextOf(away).isAwayFromFollowed).toBe(true)
      expect(shortcutContextOf(playingAt(20.2)).isAwayFromFollowed).toBe(false)
      expect(
        told(away, PressedShortcut({ shortcut: 'ReturnToFollowed' })).ready
          .reader._tag,
      ).toBe('Following')
    })

    it('picking a word follows again from that word', () => {
      const picked = told(away, ClickedWord({ seconds: 40.2 }))
      expect(picked.ready.reader._tag).toBe('Following')
      expect(clockOf(picked.model)).toEqual(standingAt(40.2))
    })

    it('letting go of the scrubber follows again from there', () => {
      const released = told(
        folded(away, [MovedScrub({ seconds: 41 })]),
        EndedScrub({ seconds: 41 }),
      )
      expect(released.ready.reader._tag).toBe('Following')
      expect(released.commandNames).toEqual(['SeekAudio'])
    })

    it('every other move of the voice follows again too, as in Books: a skip, the skip key, the scrubber’s arrows, a step by word or paragraph, and the system’s media controls', () => {
      expect(
        Array.map(
          [
            ClickedSkip({ deltaSeconds: 15 }),
            PressedShortcut({ shortcut: 'SkipForward' }),
            PressedScrubberArrow({ arrow: 'Right' }),
            PressedShortcut({ shortcut: 'NextWord' }),
            PressedShortcut({ shortcut: 'PreviousParagraph' }),
            HeardMediaSessionAction({
              action: MediaSessionSkip({ deltaSeconds: -15 }),
            }),
            HeardMediaSessionAction({
              action: MediaSessionSeek({ seconds: 41 }),
            }),
          ],
          message => told(away, message).ready.reader._tag,
        ),
      ).toEqual([
        'Following',
        'Following',
        'Following',
        'Following',
        'Following',
        'Following',
        'Following',
      ])
    })

    it('a step that lands on no word moves nothing, so the words stay detached', () => {
      const atTheStart = folded(pausedAt(0), [ScrolledTranscriptAway()])
      const stepped = told(
        atTheStart,
        PressedShortcut({ shortcut: 'PreviousWord' }),
      )
      expect(stepped.commandNames).toEqual([])
      expect(stepped.ready.reader._tag).toBe('Detached')
    })
  })

  describe('a match the search found', () => {
    it('stepping to a match stops following, asks for no scroll, and the reader names the match’s first word to show', () => {
      const searching = folded(pausedAt(6), [
        ChangedFindQuery({ query: 'bell' }),
      ])
      const stepped = told(searching, SteppedFind({ direction: 'Next' }))
      expect(stepped.ready.reader._tag).toBe('Detached')
      expect(stepped.commandNames).toEqual([])
      expect(readerOfModel(stepped.model).focusToken).toBe('section-1:3')
    })

    it('names the match by the time it starts, so the word is found again when the recording’s words are made again', () => {
      const stepped = folded(pausedAt(6), [
        ChangedFindQuery({ query: 'bell' }),
        SteppedFind({ direction: 'Next' }),
      ])
      expect(
        Option.map(
          Reader.placeOf(readyOf(stepped).reader),
          place => place._tag,
        ),
      ).toEqual(Option.some('Word'))
      const remade: Section = {
        ...sectionB,
        id: 'section-9',
        words: Array.map(sectionB.words, (word, at) => ({
          ...word,
          id: `section-9:${at.toString()}`,
        })),
      }
      const again = told(
        stepped,
        observed(finished([sectionA, remade, sectionC, sectionD])),
      )
      expect(readerOfModel(again.model).focusToken).toBe('section-9:3')
    })

    it('names no word once the search closes or its words change, and the words stay detached', () => {
      const stepped = folded(pausedAt(6), [
        ChangedFindQuery({ query: 'bell' }),
        SteppedFind({ direction: 'Next' }),
      ])
      expect(
        Array.map(
          [ClosedFind(), ChangedFindQuery({ query: 'lamp' })],
          message => {
            const after = told(stepped, message)
            return [
              after.ready.reader._tag,
              readerOfModel(after.model).focusToken,
            ]
          },
        ),
      ).toEqual([
        ['Detached', undefined],
        ['Detached', undefined],
      ])
    })

    it('names no word once the words follow again, though the match stays selected', () => {
      const stepped = folded(pausedAt(6), [
        ChangedFindQuery({ query: 'bell' }),
        SteppedFind({ direction: 'Next' }),
      ])
      const picked = told(stepped, ClickedWord({ seconds: 40.2 }))
      expect(picked.ready.reader._tag).toBe('Following')
      expect(readerOfModel(picked.model).focusToken).toBeUndefined()
      const again = told(picked.model, SteppedFind({ direction: 'Next' }))
      expect(readerOfModel(again.model).focusToken).toBe('section-1:3')
    })
  })

  describe('a section a link opened on', () => {
    const linked = folded(
      modelForRoute(
        SectionRoute({ recordingID, sectionID: sectionC.id, t: Option.none() }),
      ),
      [
        observed(finished([sectionA, sectionB, sectionC, sectionD])),
        ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
        AcquiredAudioPlayer(),
      ],
    )

    const markedOf = (model: Model): ReadonlyArray<string> =>
      Array.map(
        Array.filter(
          readerOfModel(model).passages,
          passage => passage.isFocused === true,
        ),
        passage => passage.key,
      )

    it('is the one place the reader shows, marked until its four seconds are up', () => {
      expect(Reader.placeOf(readyOf(linked).reader)).toEqual(
        Option.some(Reader.Passage({ key: sectionC.id })),
      )
      expect(markedOf(linked)).toEqual([sectionC.id])
      const elapsed = told(
        linked,
        ElapsedFocusHighlight({ revision: readyOf(linked).focusRevision }),
      )
      expect(markedOf(elapsed.model)).toEqual([])
      expect(elapsed.ready.reader._tag).toBe('Detached')
    })

    it('keeps its mark when an older link’s four seconds run out', () => {
      const stale = told(
        linked,
        ElapsedFocusHighlight({
          revision: readyOf(linked).focusRevision - 1,
        }),
      )
      expect(markedOf(stale.model)).toEqual([sectionC.id])
    })

    it('gives way to a match the listener steps to: one place at a time, and the mark’s timer leaves the match named', () => {
      const stepped = folded(linked, [
        ChangedFindQuery({ query: 'bell' }),
        SteppedFind({ direction: 'Next' }),
      ])
      expect(markedOf(stepped)).toEqual([])
      expect(readerOfModel(stepped).focusToken).toBe('section-1:3')
      const elapsed = told(
        stepped,
        ElapsedFocusHighlight({ revision: readyOf(stepped).focusRevision }),
      )
      expect(readerOfModel(elapsed.model).focusToken).toBe('section-1:3')
    })

    it('loses its mark when the listener moves the voice', () => {
      expect(
        markedOf(told(linked, ClickedSkip({ deltaSeconds: 15 })).model),
      ).toEqual([])
      expect(
        markedOf(
          told(
            folded(linked, [MovedScrub({ seconds: 41 })]),
            EndedScrub({ seconds: 41 }),
          ).model,
        ),
      ).toEqual([])
    })
  })

  describe('a recording that just finished stays where the listener is', () => {
    const early = section(0, 0, ['The', 'keeper', 'lit', 'the', 'lamp.'])
    const openedAtTwoSeconds = folded(
      modelForRoute(
        PlaybackRoute({
          recordingID,
          t: Option.some('2'),
          focus: Option.none(),
        }),
      ),
      [observed(recording([early, sectionB, sectionC]))],
    )

    it('with its place before the first word the words keep following, and nothing is asked', () => {
      const following = recordingWith([sectionA, sectionB, sectionC])
      const done = told(
        following,
        observed(finished([sectionA, sectionB, sectionC])),
      )
      expect(done.ready.reader._tag).toBe('Following')
      expect(done.commandNames).toEqual([])
      expect(clockOf(done.model)).toEqual(standingAt(0))
    })

    it('with its place on a word the words stop following, so the newest words stay in view, and Back to Playhead shows', () => {
      expect(clockOf(openedAtTwoSeconds)).toEqual(standingAt(42.2))

      const done = told(
        openedAtTwoSeconds,
        observed(finished([early, sectionB, sectionC])),
      )
      expect(done.ready.reader._tag).toBe('Detached')
      expect(isReturnShownOf(done.ready)).toBe(true)
      expect(done.commandNames).toEqual([])
      expect(clockOf(done.model)).toEqual(standingAt(2))
    })

    it('with its place in a first section that has no words, the words stop following too', () => {
      const sealedFirst: Section = {
        ...section(0, 0, []),
        maybeWordsSeal: Option.some('Voice'),
      }
      const done = told(
        recordingWith([sealedFirst, sectionB]),
        observed(finished([sealedFirst, sectionB])),
      )
      expect(done.ready.reader._tag).toBe('Detached')
    })

    it('tells nothing for a recording that was already finished', () => {
      const following = pausedAt(6)
      const again = told(
        following,
        observed(finished([sectionA, sectionB, sectionC, sectionD])),
      )
      expect(again.ready.reader._tag).toBe('Following')
    })
  })
})
