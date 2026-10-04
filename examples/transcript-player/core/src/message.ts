import { Array, Option, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import { m } from 'foldkit/message'

import {
  Milliseconds,
  PlaceToken,
  Speed,
  SpeedToken,
  WordId,
  clockOf,
} from './ids.js'
import {
  type Model,
  Passage,
  SeekScope,
  hasAudio,
  isSounding,
  nextSectionOf,
  passagesOf,
  previousSectionOf,
  wordOf,
} from './model.js'

// MESSAGE

const noAudio = 'its audio is not in the library yet'

/** Plays from the place. `p` presses it, and pauses while it plays. */
export const Play = Catalog.action('Play', {
  what: 'Plays from the place',
  why: 'The person wants to listen',
  enabled: (model: Model) => {
    if (isSounding(model)) {
      return Catalog.Disabled({ because: 'it is playing' })
    } else if (!hasAudio(model)) {
      return Catalog.Disabled({ because: noAudio })
    } else {
      return Catalog.Enabled()
    }
  },
  meta: { label: 'Play', keys: ['p'] },
})

/** Pauses where it is. `p` or `k` presses it. */
export const Pause = Catalog.action('Pause', {
  what: 'Pauses where it is',
  why: 'The person wants to stop listening for now',
  enabled: (model: Model) =>
    isSounding(model)
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'nothing is playing' }),
  meta: { label: 'Pause', keys: ['p', 'k'] },
})

/** Goes back 30 seconds. `[` presses it. */
export const SkipBack = Catalog.action('SkipBack', {
  what: 'Goes back 30 seconds',
  why: 'The person missed something',
  enabled: (model: Model) =>
    model.placeMs === 0
      ? Catalog.Disabled({ because: 'it is at the start' })
      : Catalog.Enabled(),
  meta: { label: '−30s', keys: ['['], title: 'Skip back' },
})

/** Goes forward 30 seconds. `]` presses it. */
export const SkipForward = Catalog.action('SkipForward', {
  what: 'Goes forward 30 seconds',
  why: 'The person wants to skip ahead',
  enabled: (model: Model) =>
    model.placeMs >= model.media.durationMs
      ? Catalog.Disabled({ because: 'it is at the end' })
      : Catalog.Enabled(),
  meta: { label: '+30s', keys: [']'], title: 'Skip forward' },
})

const passageTitleOf = (passage: Passage): string =>
  Array.join(
    Array.map(Array.take(passage.words, 6), word => word.text),
    ' ',
  )

/**
 * Moves to any place in the recording, as a seek bar does: `SeekTo:723000`
 * moves to 12:03, and a person can type the place, `seek-to 1h00m00s` or
 * `seek-to 12:03`. It offers the passage starts in a menu, and takes any
 * place from the start to the end.
 */
export const SeekTo = Catalog.action('SeekTo', {
  fields: { placeMs: Milliseconds },
  choose: {
    field: 'placeMs',
    prompt: 'Where to?',
    token: PlaceToken,
    choicesOf: (model: Model) =>
      Array.map(passagesOf(model), passage => ({
        value: passage.startMs,
        title: clockOf(passage.startMs),
        detail: passageTitleOf(passage),
      })),
    accepts: (model: Model, placeMs: Milliseconds) =>
      placeMs <= model.media.durationMs
        ? Catalog.Enabled()
        : Catalog.Disabled({ because: 'that is past the end' }),
    nothingToChoose: 'there is nowhere to go',
  },
  what: 'Moves to a place in the recording',
  why: 'The person wants to hear another part',
  meta: { label: 'Seek', keys: [], title: 'Seek to' },
})

/**
 * Plays from one word of the transcript, as pressing the word does:
 * `SeekToWord:w4012`. It takes any word near the place.
 */
export const SeekToWord = Catalog.action('SeekToWord', {
  fields: { wordId: WordId },
  choose: {
    field: 'wordId',
    prompt: 'Which word?',
    token: WordId,
    choicesOf: () => [],
    accepts: (model: Model, wordId: WordId) => {
      if (!hasAudio(model)) {
        return Catalog.Disabled({ because: noAudio })
      } else if (Option.isSome(wordOf(model, wordId))) {
        return Catalog.Enabled()
      } else {
        return Catalog.Disabled({ because: 'that word is not near the place' })
      }
    },
    nothingToChoose: 'there are no words yet',
  },
  what: 'Plays from a word of the transcript',
  why: 'The person wants to hear that part',
  meta: { label: 'Play from here', keys: [], title: 'Play from word' },
})

/** Goes to the start of this chapter, or the one before it. */
export const PreviousSection = Catalog.action('PreviousSection', {
  what: 'Goes to the start of this chapter, or the one before',
  why: 'The person wants to hear the chapter again, or the last one',
  enabled: (model: Model) =>
    Option.isSome(previousSectionOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'there is no chapter before' }),
  meta: { label: 'Previous chapter', keys: [',', '<'] },
})

/** Goes to the start of the next chapter. */
export const NextSection = Catalog.action('NextSection', {
  what: 'Goes to the start of the next chapter',
  why: 'The person wants to skip to what comes next',
  enabled: (model: Model) =>
    Option.isSome(nextSectionOf(model))
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'this is the last chapter' }),
  meta: { label: 'Next chapter', keys: ['.', '>'] },
})

/** Makes the seek bar span this chapter or the whole recording. */
export const SetSeekScope = Catalog.action('SetSeekScope', {
  fields: { scope: SeekScope },
  choose: {
    field: 'scope',
    prompt: 'What should the bar span?',
    token: SeekScope,
    choicesOf: (model: Model) =>
      Array.map(SeekScope.literals, scope => ({
        value: scope,
        title: scope === 'Section' ? 'Chapter' : 'Whole book',
        availability:
          scope === model.seekScope
            ? Catalog.Disabled({ because: 'the bar spans it now' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there is nothing to span',
  },
  what: 'Makes the seek bar span this chapter or the whole recording',
  why: 'The person wants fine control in a chapter, or to move far',
  meta: { label: 'Bar spans', keys: [], title: 'Set what the bar spans' },
})

/** Plays at one speed. */
export const SetSpeed = Catalog.action('SetSpeed', {
  fields: { speed: Speed },
  choose: {
    field: 'speed',
    prompt: 'Which speed?',
    token: SpeedToken,
    choicesOf: (model: Model) =>
      Array.map(Speed.literals, speed => ({
        value: speed,
        title: `${speed.toString()}×`,
        availability:
          speed === model.speed
            ? Catalog.Disabled({ because: 'it is the speed' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no speeds',
  },
  what: 'Plays faster or slower',
  why: 'The person wants it faster or slower',
  meta: { label: 'Speed', keys: [], title: 'Set speed' },
})

/** Every Action the Transcript Player offers, in the order surfaces list them. */
export const catalog = Catalog.make([
  Play,
  Pause,
  SkipBack,
  SkipForward,
  PreviousSection,
  NextSection,
  SeekTo,
  SeekToWord,
  SetSeekScope,
  SetSpeed,
])

/** The audio reached a place. */
export const ReachedPlace = m('ReachedPlace', { placeMs: Milliseconds })
/** The audio reached the end of the recording. */
export const ReachedEnd = m('ReachedEnd')
/** The audio would not play, and why, safe to show. */
export const FailedPlayAudio = m('FailedPlayAudio', { reason: S.String })
/** The words near the place arrived. */
export const ReceivedPassages = m('ReceivedPassages', {
  passages: S.Array(Passage),
})
/** The words near the place could not be read, and why, safe to show. */
export const FailedLoadTranscript = m('FailedLoadTranscript', {
  reason: S.String,
})

/** Every Message the Transcript Player accepts. */
export const Message = S.Union([
  ...catalog.Message.members,
  ReachedPlace,
  ReachedEnd,
  FailedPlayAudio,
  ReceivedPassages,
  FailedLoadTranscript,
])
/** A Transcript Player Message. */
export type Message = typeof Message.Type

/** True for a Transcript Player Message, so a parent can hand it down. */
export const isMessage = S.is(Message)
