import { Array, Option, String, pipe } from 'effect'

import type {
  TranscriptNode,
  TranscriptPassage,
  TranscriptWord,
} from './types.js'

// READ ALONG

/**
 * Read Along is the name for words that follow a voice: a Transcript with
 * a clock and a start for each word, from any media with a timed
 * transcript, an audiobook, a recording, a video. These are its readings,
 * the same for every Client: the word being spoken (`transcriptAt`), the
 * paragraph and those around it (`transcriptExcerptOf`), and here search,
 * scrubbing by word or paragraph, and the address of a word. They work
 * on the word's own time and never fall back to a sentence or a passage:
 * a Transcript stored without word times is a defect to fix where it was
 * ingested, and {@link transcriptDefectOf} says so.
 */

type TimedWord = Readonly<{
  word: TranscriptWord
  startMs: number
  passage: TranscriptPassage
  indexInPassage: number
}>

const timedWordsOf = (transcript: TranscriptNode): ReadonlyArray<TimedWord> =>
  Array.flatMap(transcript.passages, passage =>
    Array.flatMap(passage.words, (word, indexInPassage) =>
      word.startMs === undefined
        ? []
        : [{ word, startMs: word.startMs, passage, indexInPassage }],
    ),
  )

const bareOf = (text: string): string =>
  pipe(text, String.toLowerCase, String.replace(/[^\p{L}\p{N}]+/gu, ''))

/**
 * One place a search found: the first word of the match, with its token,
 * the time it starts, the paragraph it is in, and the words that matched.
 */
export type TranscriptMatch = Readonly<{
  token: string
  startMs: number
  passageKey: string
  label: string
  text: string
}>

/**
 * Every place the words of `query` are spoken in a Transcript, in order,
 * whatever their case or punctuation: `lamp` finds `Lamp` and `lamp,`,
 * and `lit at dusk` finds those three words in a row. Each match carries
 * the first word's token, to play from it, and its time, to link to it.
 * An empty query finds nothing.
 *
 * @example
 * ```typescript
 * searchTranscript(transcript, 'lamp') // [{ token: 'a1', startMs: 400, label: '0:00', text: 'lamp' }, …]
 * ```
 */
export const searchTranscript = (
  transcript: TranscriptNode,
  query: string,
): ReadonlyArray<TranscriptMatch> => {
  const wanted = Array.filter(
    Array.map(query.split(/\s+/u), bareOf),
    word => word !== '',
  )
  const words = timedWordsOf(transcript)
  return Array.isReadonlyArrayEmpty(wanted)
    ? []
    : Array.flatMap(words, (first, index) => {
        const run = words.slice(index, index + wanted.length)
        const isMatch =
          run.length === wanted.length &&
          Array.every(run, (timed, offset) =>
            Option.contains(Array.get(wanted, offset), bareOf(timed.word.text)),
          )
        return isMatch
          ? [
              {
                token: first.word.token,
                startMs: first.startMs,
                passageKey: first.passage.key,
                label: first.passage.label,
                text: Array.join(
                  Array.map(run, timed => timed.word.text),
                  ' ',
                ),
              },
            ]
          : []
      })
}

/** What a scrub steps by: one word, or one paragraph. */
export type ScrubUnit = 'Word' | 'Paragraph'

/** Which way a scrub steps. */
export type ScrubDirection = 'Next' | 'Previous'

/**
 * The word a scrub lands on from the word with `token`: the next or the
 * previous word, across paragraphs; or, by paragraph, the first word of
 * the next paragraph, and going back, the first word of this paragraph,
 * or of the one before when already on it. None past either end. A
 * Program plays from the word it gets, such as `SeekToWord:<token>`.
 *
 * @example
 * ```typescript
 * wordStepOf(transcript, 'b3', 'Paragraph', 'Previous') // Some(word 'b0')
 * ```
 */
export const wordStepOf = (
  transcript: TranscriptNode,
  token: string,
  unit: ScrubUnit,
  direction: ScrubDirection,
): Option.Option<TranscriptWord> => {
  const words = timedWordsOf(transcript)
  return Option.flatMap(
    Array.findFirstIndex(words, timed => timed.word.token === token),
    index => {
      const here = Array.get(words, index)
      const landed =
        unit === 'Word'
          ? Array.get(words, direction === 'Next' ? index + 1 : index - 1)
          : Option.flatMap(here, current => {
              if (direction === 'Next') {
                return Array.findFirst(
                  words.slice(index + 1),
                  timed => timed.indexInPassage === 0,
                )
              } else if (current.indexInPassage > 0) {
                return Array.get(words, index - current.indexInPassage)
              } else {
                return Array.findLast(
                  words.slice(0, index),
                  timed => timed.indexInPassage === 0,
                )
              }
            })
      return Option.map(landed, timed => timed.word)
    },
  )
}

/**
 * The address of a word: the time it starts, in milliseconds of its
 * media. A time is what identifies a word across sessions, Clients, and a
 * transcript made again, where an id or a position in a passage would
 * change; and a Program already addresses places by time, so a link to a
 * word is the media's own link at that time. None for a word stored
 * without a time.
 *
 * @example
 * ```typescript
 * wordAddressOf(word) // Some(31_800), linked as /books/the-lantern-keeper/listen/31.8s
 * ```
 */
export const wordAddressOf = (word: TranscriptWord): Option.Option<number> =>
  Option.fromNullishOr(word.startMs)

/**
 * The word an address opens on: the last word to start at or before
 * `addressMs`. None before the first word, and for a Transcript with no
 * word times.
 *
 * @example
 * ```typescript
 * wordAtAddress(transcript, 31_800) // Some(word 'rounded')
 * ```
 */
export const wordAtAddress = (
  transcript: TranscriptNode,
  addressMs: number,
): Option.Option<TranscriptWord> =>
  Option.map(
    Array.findLast(
      timedWordsOf(transcript),
      timed => timed.startMs <= addressMs,
    ),
    timed => timed.word,
  )

const untimedDefect =
  'These words were stored without a time for each word, so they cannot follow the voice. The transcript has to be made again with word times.'

/**
 * Why a Transcript cannot follow the voice, when it cannot: it has words
 * and at least one has no time. There is no coarser reading to fall back
 * to, by sentence or by passage; the fix is where the transcript was
 * ingested, and a painter shows this sentence instead of a wrong mark.
 * None for a Transcript whose every word has a time, and for an empty one.
 */
export const transcriptDefectOf = (
  transcript: TranscriptNode,
): Option.Option<string> =>
  Array.some(
    Array.flatMap(transcript.passages, passage => passage.words),
    word => word.startMs === undefined,
  )
    ? Option.some(untimedDefect)
    : Option.none()
