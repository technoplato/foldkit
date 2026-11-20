import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { type KeyPress, type ShortcutContext, shortcutFor } from './keyboard.js'
import { RecordingRoute } from './link.js'
import {
  AcquiredAudioPlayer,
  HeardAudioPosition,
  type Message,
  ObservedFileUrls,
  ObservedRecording,
  PressedShortcut,
} from './message.js'
import type { Model } from './model.js'
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
  endSeconds: startSeconds + texts.length * 0.34,
  maybeSpeakerID: Option.none(),
  text: texts.join(' '),
  words: Array.map(texts, (text, at) => ({
    id: `section-${index.toString()}:${at.toString()}`,
    text,
    startSeconds: startSeconds + at * 0.34,
    endSeconds: startSeconds + at * 0.34 + 0.3,
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
    sectionOf(0, 2, ['The', 'keeper', 'lit', 'the', 'lamp.']),
    sectionOf(1, 7, ['Far', 'out', 'a', 'bell', 'answered.']),
    sectionOf(2, 13, ['Then', 'the', 'fog', 'came', 'in.']),
  ],
  retiredLines: [],
  speakers: [],
  clipboard: [],
  images: [],
  audio: StoredAudio({ fileID: 'audio-file', byteCount: 10 }),
}

const at = (seconds: number): Model =>
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
      HeardAudioPosition({ seconds, wallClockMs: 0 }),
    ],
    modelForRoute(RecordingRoute({ recordingID })),
    (model: Model, message: Message) => update(model, message)[0],
  )

/** A step lands a millisecond into its word. */
const into = (wordStartSeconds: number): number => wordStartSeconds + 0.001

const stepped = (
  model: Model,
  shortcut: 'PreviousWord' | 'NextWord' | 'PreviousParagraph' | 'NextParagraph',
) => {
  const [next, commands] = update(model, PressedShortcut({ shortcut }))
  return {
    seconds:
      next.playback._tag === 'ReadyPlayback'
        ? next.playback.positionSeconds
        : Number.NaN,
    commands: Array.map(commands, command => command.name),
  }
}

const context: ShortcutContext = {
  isPlaybackReady: true,
  isRecordAvailable: false,
  isCapturing: false,
  isAwayFromFollowed: false,
  isRecordingOpen: true,
  isFullScreen: false,
  isSearchAvailable: true,
  isDialogOpen: false,
}

const press = (key: string): KeyPress => ({
  key,
  code: '',
  target: 'Page',
  isModified: false,
  isShiftHeld: key === '{' || key === '}',
  isCommandHeld: false,
  isRepeat: false,
})

describe('stepping through a recording by word and by paragraph', () => {
  it('plays from the next word, and from the word before', () => {
    // 7.4 s is inside "out", the second word of the second section.
    expect(stepped(at(7.4), 'NextWord')).toEqual({
      seconds: into(7 + 2 * 0.34),
      commands: ['SeekAudio'],
    })
    expect(stepped(at(7.4), 'PreviousWord').seconds).toBe(into(7))
  })

  it('steps across sections', () => {
    // 3.4 s is inside "lamp.", the last word of the first section.
    expect(stepped(at(3.4), 'NextWord').seconds).toBe(into(7))
    expect(stepped(at(7.1), 'PreviousWord').seconds).toBe(into(2 + 4 * 0.34))
  })

  it('goes to the start of the next paragraph, and back to the start of this one, then of the one before', () => {
    expect(stepped(at(7.4), 'NextParagraph').seconds).toBe(into(13))
    expect(stepped(at(7.4), 'PreviousParagraph').seconds).toBe(into(7))
    expect(stepped(at(7.1), 'PreviousParagraph').seconds).toBe(into(2))
  })

  it('starts at the first word from before it, and does nothing past either end', () => {
    expect(stepped(at(0.5), 'NextWord').seconds).toBe(into(2))
    expect(stepped(at(0.5), 'PreviousWord')).toEqual({
      seconds: 0.5,
      commands: [],
    })
    expect(stepped(at(14.5), 'NextWord')).toEqual({
      seconds: 14.5,
      commands: [],
    })
  })

  it('answers the square brackets for words, and with Shift the braces for paragraphs, as Books does', () => {
    expect(shortcutFor(context, press('['))).toEqual(
      Option.some('PreviousWord'),
    )
    expect(shortcutFor(context, press(']'))).toEqual(Option.some('NextWord'))
    expect(shortcutFor(context, press('{'))).toEqual(
      Option.some('PreviousParagraph'),
    )
    expect(shortcutFor(context, press('}'))).toEqual(
      Option.some('NextParagraph'),
    )
    expect(
      shortcutFor({ ...context, isPlaybackReady: false }, press(']')),
    ).toEqual(Option.none())
  })
})

describe('a step, then another', () => {
  it('goes on from the word a step landed on, not from the one before', () => {
    const first = update(
      at(7.4),
      PressedShortcut({ shortcut: 'NextParagraph' }),
    )[0]
    expect(stepped(first, 'NextWord').seconds).toBe(into(13 + 0.34))
    expect(stepped(first, 'PreviousParagraph').seconds).toBe(into(7))
  })
})
