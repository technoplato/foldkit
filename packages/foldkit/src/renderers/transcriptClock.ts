import { Array, Option } from 'effect'

import type {
  TranscriptClock,
  TranscriptNode,
  TranscriptPassage,
  TranscriptWord,
} from './types.js'

// CLOCK

const maxAheadMs = 1500

/**
 * The place a Transcript's clock has reached at the wall-clock time
 * `nowMs`: the reported place plus the time since the report at the
 * clock's rate. It stays at the reported place while paused and before
 * the report, and never runs more than a second and a half past it, so a
 * player that stopped reporting does not read on by itself.
 *
 * @example
 * ```typescript
 * transcriptPlaceAt({ placeMs: 10_000, atMs: 1_000_000, rate: 1 }, 1_000_400) // 10_400
 * transcriptPlaceAt({ placeMs: 10_000, atMs: 1_000_000, rate: 0 }, 1_000_400) // 10_000
 * ```
 */
export const transcriptPlaceAt = (
  clock: TranscriptClock,
  nowMs: number,
): number =>
  clock.placeMs +
  Math.min(maxAheadMs, Math.max(0, nowMs - clock.atMs) * clock.rate)

type Timed = Readonly<{ token: string; startMs: number }>

const timedWordsOf = (transcript: TranscriptNode): ReadonlyArray<Timed> =>
  Array.flatMap(transcript.passages, passage =>
    Array.flatMap(passage.words, word =>
      word.startMs === undefined
        ? []
        : [{ token: word.token, startMs: word.startMs }],
    ),
  )

/**
 * The token of the word being spoken at the wall-clock time `nowMs`: the
 * last word to start at or before the place the Transcript's clock has
 * reached. None for a Transcript with no clock or no word times, and
 * before its first word.
 *
 * @example
 * ```typescript
 * currentWordTokenAt(transcript, Date.now()) // Some('w4012')
 * ```
 */
export const currentWordTokenAt = (
  transcript: TranscriptNode,
  nowMs: number,
): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(transcript.clock), clock => {
    const placeMs = transcriptPlaceAt(clock, nowMs)
    return Option.map(
      Array.findLast(timedWordsOf(transcript), word => word.startMs <= placeMs),
      word => word.token,
    )
  })

const markedWord =
  (token: string) =>
  (word: TranscriptWord): TranscriptWord => {
    const { isCurrent: _isCurrent, ...unmarked } = word
    return word.token === token ? { ...unmarked, isCurrent: true } : unmarked
  }

const markedPassage =
  (token: string) =>
  (passage: TranscriptPassage): TranscriptPassage => {
    const hasWord = Array.some(passage.words, word => word.token === token)
    const isAlreadySo = Array.every(
      passage.words,
      word => (word.isCurrent === true) === (word.token === token),
    )
    // NOTE: A passage the word neither left nor entered is handed back as
    // the object it was, so a painter repaints only the passages that
    // changed.
    if (isAlreadySo && (passage.isCurrent === true) === hasWord) {
      return passage
    }
    const { isCurrent: _isCurrent, ...unmarked } = passage
    const words = Array.map(passage.words, markedWord(token))
    return hasWord
      ? { ...unmarked, isCurrent: true, words }
      : { ...unmarked, words }
  }

/**
 * A Transcript as it reads at the wall-clock time `nowMs`: the word being
 * spoken then, and its passage, marked current, and no other. A painter
 * calls it on its own clock, many times a second, and paints the word
 * when it changes, so the mark moves on the word while the Program hears
 * the place once a second. A Transcript with no clock or no word times
 * comes back as it is.
 *
 * @example
 * ```typescript
 * transcriptExcerptOf(transcriptAt(transcript, Date.now()))
 * ```
 */
export const transcriptAt = (
  transcript: TranscriptNode,
  nowMs: number,
): TranscriptNode =>
  Option.match(currentWordTokenAt(transcript, nowMs), {
    onNone: () => transcript,
    onSome: token => ({
      ...transcript,
      passages: Array.map(transcript.passages, markedPassage(token)),
    }),
  })
