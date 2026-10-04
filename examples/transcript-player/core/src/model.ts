import { Array, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { MediaId, Milliseconds, Speed, WordId } from './ids.js'

// MODEL

/**
 * One named stretch of a recording, such as an audiobook's chapter: its
 * title and where it starts and ends.
 */
export const Section = S.Struct({
  title: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
})
/** One named stretch of a recording. */
export type Section = typeof Section.Type

/**
 * The recording the player holds: its id, how long it runs, where its
 * audio is, and its sections in order, such as chapters. A recording with
 * no audio file yet has no URL, and the player will not play it.
 */
export const Media = S.Struct({
  mediaId: MediaId,
  durationMs: Milliseconds,
  maybeAudioUrl: S.Option(S.String),
  sections: S.Array(Section),
})
/** The recording the player holds. */
export type Media = typeof Media.Type

/** One spoken word: its id, its text, and when it starts and ends. */
export const Word = S.Struct({
  wordId: WordId,
  text: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
})
/** One spoken word. */
export type Word = typeof Word.Type

/**
 * A passage of the transcript, a few minutes of words read as one
 * paragraph, such as one segment of an audiobook's transcript.
 */
export const Passage = S.Struct({
  passageId: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
  words: S.Array(Word),
})
/** A passage of the transcript. */
export type Passage = typeof Passage.Type

/** The words near the place are on their way. */
export const TranscriptLoading = ts('TranscriptLoading')
/** The words near the place, in order. Empty where nothing was transcribed. */
export const TranscriptLoaded = ts('TranscriptLoaded', {
  passages: S.Array(Passage),
})
/** The transcript could not be read, and why, safe to show. */
export const TranscriptUnavailable = ts('TranscriptUnavailable', {
  reason: S.String,
})
/** Where the words near the place stand. */
export const Transcript = S.Union([
  TranscriptLoading,
  TranscriptLoaded,
  TranscriptUnavailable,
])
/** Where the words near the place stand. */
export type Transcript = typeof Transcript.Type

/** The player is stopped where it is. */
export const Paused = ts('Paused')
/**
 * The player is sounding. `cue` changes whenever the place jumps, so the
 * audio restarts from the new place.
 */
export const Playing = ts('Playing', { cue: S.Int })
/**
 * The player tried to sound the recording and its audio would not play,
 * and why, safe to show. Play tries again.
 */
export const Unplayable = ts('Unplayable', { reason: S.String })
/** Whether the player is sounding. */
export const Transport = S.Union([Paused, Playing, Unplayable])
/** Whether the player is sounding. */
export type Transport = typeof Transport.Type

/**
 * What the seek bar spans: the section being heard, such as this chapter,
 * or the whole recording.
 */
export const SeekScope = S.Literals(['Section', 'Recording'])
/** What the seek bar spans. */
export type SeekScope = typeof SeekScope.Type

/**
 * The Transcript Player: one recording, where it is, whether it sounds,
 * how fast, what the seek bar spans, and the words near the place.
 */
export const Model = S.Struct({
  media: Media,
  placeMs: Milliseconds,
  transport: Transport,
  nextCue: S.Int,
  speed: Speed,
  seekScope: SeekScope,
  transcript: Transcript,
})
/** The Transcript Player. */
export type Model = typeof Model.Type

/**
 * A player holding `media`, paused at `placeMs` at `speed`, its words on
 * their way.
 *
 * @example
 * ```typescript
 * init(media, { placeMs: Milliseconds.make(723_000) })
 * ```
 */
export const init = (
  media: Media,
  options: Readonly<{
    placeMs?: Milliseconds
    speed?: Speed
    seekScope?: SeekScope
  }> = {},
): Model => ({
  media,
  placeMs: options.placeMs ?? Milliseconds.make(0),
  transport: Paused(),
  nextCue: 0,
  speed: options.speed ?? 1,
  seekScope:
    options.seekScope ??
    (Array.isReadonlyArrayEmpty(media.sections) ? 'Recording' : 'Section'),
  transcript: TranscriptLoading(),
})

/** True while the player is sounding. */
export const isSounding = (model: Model): boolean =>
  model.transport._tag === 'Playing'

/** True when the recording has an audio file to play. */
export const hasAudio = (model: Model): boolean =>
  Option.isSome(model.media.maybeAudioUrl)

/** The passages near the place, empty until they arrive. */
export const passagesOf = (model: Model): ReadonlyArray<Passage> =>
  model.transcript._tag === 'TranscriptLoaded' ? model.transcript.passages : []

/**
 * The word at a place: the last one to start at or before it, within its
 * passage, so the silence after a word still shows that word.
 *
 * @example
 * ```typescript
 * wordAt(passages, Milliseconds.make(19_400)) // Some({ wordId: 'w0', text: 'Evocation', ... })
 * ```
 */
export const wordAt = (
  passages: ReadonlyArray<Passage>,
  placeMs: Milliseconds,
): Option.Option<Word> =>
  Option.flatMap(
    Array.findFirst(
      passages,
      passage => passage.startMs <= placeMs && placeMs < passage.endMs,
    ),
    passage => Array.findLast(passage.words, word => word.startMs <= placeMs),
  )

/** The word sounding now, while the words near the place are here. */
export const currentWordOf = (model: Model): Option.Option<Word> =>
  wordAt(passagesOf(model), model.placeMs)

/** The section a place falls in: the last one starting at or before it. */
export const sectionAt = (
  media: Media,
  placeMs: Milliseconds,
): Option.Option<Section> =>
  Array.findLast(media.sections, section => section.startMs <= placeMs)

/**
 * The section to go back to: this one's start, once more than a few
 * seconds into it, else the one before.
 */
export const previousSectionOf = (model: Model): Option.Option<Section> => {
  const maybeCurrent = sectionAt(model.media, model.placeMs)
  const isWellInto = Option.exists(
    maybeCurrent,
    section => model.placeMs - section.startMs > restartSectionMs,
  )
  return isWellInto
    ? maybeCurrent
    : Array.findLast(
        model.media.sections,
        section => section.startMs < model.placeMs - restartSectionMs,
      )
}

/** The section after the one being heard. */
export const nextSectionOf = (model: Model): Option.Option<Section> =>
  Array.findFirst(
    model.media.sections,
    section => section.startMs > model.placeMs,
  )

const restartSectionMs = 3000

/** The word with this id, among the words near the place. */
export const wordOf = (model: Model, wordId: WordId): Option.Option<Word> =>
  Array.findFirst(
    Array.flatMap(passagesOf(model), passage => passage.words),
    word => word.wordId === wordId,
  )
