import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { RecordingRoute } from './link.js'
import {
  AcquiredAudioPlayer,
  ChangedFindQuery,
  ClosedFind,
  HeardAudioPosition,
  type Message,
  ObservedFileUrls,
  ObservedRecording,
  OpenedFind,
  SteppedFind,
} from './message.js'
import type { Model } from './model.js'
import { type RecordingDetail, type Section, StoredAudio } from './recording.js'
import { findOf, modelForRoute, update } from './update.js'

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
    sectionOf(2, 20, ['The', 'lamps', 'along', 'the', 'shore', 'answered.']),
  ],
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const run = (model: Model, messages: ReadonlyArray<Message>) =>
  Array.reduce(
    messages,
    { model, commands: Array.empty<string>() },
    (state, message) => {
      const [next, commands] = update(state.model, message)
      return {
        model: next,
        commands: [...state.commands, ...commands.map(command => command.name)],
      }
    },
  )

const at = (seconds: number): Model =>
  run(modelForRoute(RecordingRoute({ recordingID })), [
    ObservedRecording({
      recordingID,
      maybeDetail: Option.some(detail),
      skippedCount: 0,
      maybeSkippedReason: Option.none(),
    }),
    ObservedFileUrls({ fileUrls: { 'audio-file': 'https://files/audio' } }),
    AcquiredAudioPlayer(),
    HeardAudioPosition({ seconds }),
  ]).model

const readyOf = (model: Model) => {
  if (model.playback._tag === 'ReadyPlayback') {
    return model.playback
  } else {
    throw new Error(`Expected ReadyPlayback, got ${model.playback._tag}`)
  }
}

const find = (model: Model) => findOf(readyOf(model))

const searching = (seconds: number, query: string): Model =>
  run(at(seconds), [OpenedFind(), ChangedFindQuery({ query })]).model

describe('finding words inside one recording', () => {
  it('is closed until opened, and opens with nothing found', () => {
    expect(find(at(0))).toEqual(Option.none())
    expect(find(run(at(0), [OpenedFind()]).model)).toEqual(
      Option.some({
        query: '',
        matches: [],
        maybeSelectedIndex: Option.none(),
      }),
    )
  })

  it('finds the words whatever their case or punctuation, with the section and the words of each match', () => {
    const found = Option.getOrThrow(find(searching(0, 'lamp')))
    expect(
      Array.map(found.matches, match => [
        match.sectionID,
        match.wordIDs,
        match.startSeconds,
      ]),
    ).toEqual([
      ['section-0', ['section-0:4'], 4],
      ['section-1', ['section-1:6'], 13],
      ['section-2', ['section-2:1'], 20.5],
    ])
    expect(found.maybeSelectedIndex).toEqual(Option.none())
    expect(
      Option.getOrThrow(find(searching(0, 'answered the lamp'))).matches,
    ).toHaveLength(1)
  })

  it('steps to the first match after the place, shows it without moving the audio, and stops following the voice', () => {
    const stepped = run(searching(11, 'lamp'), [
      SteppedFind({ direction: 'Next' }),
    ])
    expect(Option.getOrThrow(find(stepped.model)).maybeSelectedIndex).toEqual(
      Option.some(1),
    )
    expect(stepped.commands).toEqual(['ScrollToSection'])
    expect(readyOf(stepped.model).positionSeconds).toBe(11)
    expect(readyOf(stepped.model).follow).toBe('Detached')
  })

  it('steps on and back through the matches, and around the ends', () => {
    const selectedAfter = (messages: ReadonlyArray<Message>) =>
      Option.getOrThrow(find(run(searching(11, 'lamp'), messages).model))
        .maybeSelectedIndex
    const next = SteppedFind({ direction: 'Next' })
    const previous = SteppedFind({ direction: 'Previous' })
    expect(selectedAfter([next, next])).toEqual(Option.some(2))
    expect(selectedAfter([next, next, next])).toEqual(Option.some(0))
    expect(selectedAfter([next, previous])).toEqual(Option.some(0))
    expect(selectedAfter([previous])).toEqual(Option.some(0))
  })

  it('forgets the match it was on when the words searched for change, and everything when closed', () => {
    const stepped = run(searching(11, 'lamp'), [
      SteppedFind({ direction: 'Next' }),
    ]).model
    expect(
      Option.getOrThrow(
        find(run(stepped, [ChangedFindQuery({ query: 'bell' })]).model),
      ).maybeSelectedIndex,
    ).toEqual(Option.none())
    expect(find(run(stepped, [ClosedFind()]).model)).toEqual(Option.none())
  })

  it('does nothing on a step with nothing found', () => {
    const stepped = run(searching(0, 'harbour'), [
      SteppedFind({ direction: 'Next' }),
    ])
    expect(stepped.commands).toEqual([])
  })
})
