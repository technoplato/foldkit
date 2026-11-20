import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { RecordingRoute } from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedFindQuery,
  ClickedCopyWordLink,
  ClickedWord,
  ClosedWordMenu,
  HeardAudioPosition,
  type Message,
  ObservedFileUrls,
  ObservedRecording,
  OpenedFind,
  OpenedWordMenu,
  ScrolledTranscriptAway,
  SteppedFind,
} from './message.js'
import type { Model } from './model.js'
import type { ReadAlongPlayback } from './readAlong.js'
import { readerMessageOf, readerOf } from './reader.js'
import { type RecordingDetail, type Section, StoredAudio } from './recording.js'
import { modelForRoute, update } from './update.js'

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
    sectionOf(0, 2, ['The', 'keeper', 'lit', 'the', 'lamp', 'at', 'dusk.']),
    sectionOf(1, 10, ['Far', 'out', 'a', 'bell', 'answered', 'the', 'Lamp.']),
  ],
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const run = (model: Model, messages: ReadonlyArray<Message>): Model =>
  Array.reduce(messages, model, (state, message) => update(state, message)[0])

const opened: Model = run(modelForRoute(RecordingRoute({ recordingID })), [
  ObservedRecording({
    recordingID,
    maybeDetail: Option.some(detail),
    skippedCount: 0,
    maybeSkippedReason: Option.none(),
  }),
  ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
  AcquiredAudioPlayer(),
  HeardAudioPosition({ seconds: 2.6 }),
])

const readyOf = (model: Model) => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const paused: ReadAlongPlayback = {
  positionSeconds: 2.6,
  isPlaying: false,
  reportedAtMs: 0,
  rate: 1,
}

const readerAfter = (messages: ReadonlyArray<Message>) =>
  readerOf(readyOf(run(opened, messages)), paused)

const marksOf = (reader: ReturnType<typeof readerOf>) =>
  Array.flatMap(reader.passages, passage =>
    Array.flatMap(passage.words, word =>
      word.mark === undefined ? [] : [[word.token, word.mark]],
    ),
  )

describe('the reader every Client paints', () => {
  it('is the recording’s words, following the voice, each word pressable and with a menu', () => {
    const reader = readerAfter([])
    expect(Array.map(reader.passages, passage => passage.key)).toEqual([
      'section-0',
      'section-1',
    ])
    expect(reader.action).toBe('ClickedWord')
    expect(reader.isFollowing).toBe(true)
    expect(reader.leaveAction).toBe('ScrolledTranscriptAway')
    expect(reader.wordMenuAction).toBe('OpenedWordMenu')
    expect(reader.wordMenu).toBeUndefined()
    expect(reader.focusToken).toBeUndefined()
  })

  it('marks what the search found, and brings the match the listener is on into view', () => {
    const reader = readerAfter([
      OpenedFind(),
      ChangedFindQuery({ query: 'lamp' }),
      SteppedFind({ direction: 'Next' }),
    ])
    expect(marksOf(reader)).toEqual([
      ['section-0:4', 'Selected'],
      ['section-1:6', 'Found'],
    ])
    expect(reader.focusToken).toBe('section-0:4')
    expect(reader.isFollowing).toBe(false)
  })

  it('stops following once the listener scrolls away', () => {
    expect(readerAfter([ScrolledTranscriptAway()]).isFollowing).toBe(false)
  })

  it('holds the menu open on a word, offering to play from it and to copy a link to it', () => {
    const reader = readerAfter([OpenedWordMenu({ seconds: 4, x: 0, y: 0 })])
    expect(reader.wordMenu).toEqual({
      token: 'section-0:4',
      dismissAction: 'ClosedWordMenu',
      items: [
        {
          action: 'ClickedWord:section-0:4',
          label: 'Play from Here',
          icon: 'Play',
        },
        {
          action: 'ClickedCopyWordLink:section-0:4',
          label: 'Copy Link to This Word',
          icon: 'Link',
        },
      ],
    })
  })
})

describe('a press on the reader', () => {
  const ready = readyOf(opened)

  it('is the Message the web sends for the same thing', () => {
    expect(readerMessageOf(ready, 'ClickedWord:section-0:4')).toEqual(
      Option.some(ClickedWord({ seconds: 4 })),
    )
    expect(readerMessageOf(ready, 'OpenedWordMenu:section-1:3')).toEqual(
      Option.some(OpenedWordMenu({ seconds: 11.5, x: 0, y: 0 })),
    )
    expect(readerMessageOf(ready, 'ClickedCopyWordLink:section-0:1')).toEqual(
      Option.some(ClickedCopyWordLink({ wordID: 'section-0:1' })),
    )
    expect(readerMessageOf(ready, 'ClosedWordMenu')).toEqual(
      Option.some(ClosedWordMenu()),
    )
    expect(readerMessageOf(ready, 'ScrolledTranscriptAway')).toEqual(
      Option.some(ScrolledTranscriptAway()),
    )
  })

  it('is nothing for a word that is not in the recording, or a press it does not know', () => {
    expect(readerMessageOf(ready, 'ClickedWord:not-a-word')).toEqual(
      Option.none(),
    )
    expect(readerMessageOf(ready, 'Unknown:section-0:1')).toEqual(Option.none())
    expect(readerMessageOf(ready, 'Unknown')).toEqual(Option.none())
  })

  it('opens the menu the reader then holds, and closing it closes it', () => {
    const press = (model: Model, pressed: string): Model =>
      Option.match(readerMessageOf(readyOf(model), pressed), {
        onNone: () => model,
        onSome: message => run(model, [message]),
      })
    const withMenu = press(opened, 'OpenedWordMenu:section-0:4')
    expect(readerOf(readyOf(withMenu), paused).wordMenu?.token).toBe(
      'section-0:4',
    )
    expect(
      readerOf(readyOf(press(withMenu, 'ClosedWordMenu')), paused).wordMenu,
    ).toBeUndefined()
  })
})
