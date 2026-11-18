import { Array, Option, String, pipe } from 'effect'

import type {
  SeekLanding,
  SeekNode,
  TranscriptNode,
  TranscriptPassage,
  TranscriptWord,
  TranscriptWordMark,
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

const wantedOf = (query: string): ReadonlyArray<string> =>
  Array.filter(Array.map(query.split(/\s+/u), bareOf), word => word !== '')

/**
 * One place a search found among words in order: the position of its
 * first word and how many words it spans, counting any word between them
 * that is only punctuation.
 */
export type SpokenMatch = Readonly<{ index: number; length: number }>

type Spoken = Readonly<{ bare: string; index: number }>

const spokenOf = (texts: ReadonlyArray<string>): ReadonlyArray<Spoken> =>
  Array.flatMap(texts, (text, index) => {
    const bare = bareOf(text)
    return bare === '' ? [] : [{ bare, index }]
  })

const isRunOf = (
  run: ReadonlyArray<Spoken>,
  wanted: Array.NonEmptyReadonlyArray<string>,
): boolean =>
  run.length === wanted.length &&
  Array.every(run, (spoken, offset) =>
    offset === wanted.length - 1
      ? spoken.bare.startsWith(Array.lastNonEmpty(wanted))
      : Option.contains(Array.get(wanted, offset), spoken.bare),
  )

/**
 * Every place the words of `query` are spoken among `texts`, the words of
 * a recording in order, whatever their case or punctuation. Every word of
 * the query but the last is a whole word; the last is the start of one,
 * so a search answers while it is typed: `the la` finds `The lamp` and
 * `the lantern`. A word that is only punctuation, such as a dash, is read
 * over. An empty query finds nothing.
 *
 * It reads each word once, so it stays quick on a whole book: 150,000
 * words, sixteen hours of speech, take a few tens of milliseconds.
 *
 * @example
 * ```typescript
 * matchesIn(['The', 'lamp', 'was', 'lit'], 'the la') // [{ index: 0, length: 2 }]
 * ```
 */
export const matchesIn = (
  texts: ReadonlyArray<string>,
  query: string,
): ReadonlyArray<SpokenMatch> =>
  Array.match(wantedOf(query), {
    onEmpty: () => [],
    onNonEmpty: wanted => {
      const spoken = spokenOf(texts)
      const head = Array.headNonEmpty(wanted)
      const isOneWord = wanted.length === 1
      return Array.flatMap(spoken, (first, position) => {
        const isCandidate = isOneWord
          ? first.bare.startsWith(head)
          : first.bare === head
        if (!isCandidate) {
          return []
        }
        const run = spoken.slice(position, position + wanted.length)
        return isRunOf(run, wanted)
          ? Array.fromOption(
              Option.map(Array.last(run), last => ({
                index: first.index,
                length: last.index - first.index + 1,
              })),
            )
          : []
      })
    },
  })

/**
 * One place a search found: the first word of the match, with its token,
 * the time it starts, the paragraph it is in, the words that matched, a
 * few words before and after them to show where it is, and the token of
 * each word found, to mark them.
 */
export type TranscriptMatch = Readonly<{
  token: string
  startMs: number
  passageKey: string
  label: string
  text: string
  before: string
  after: string
  tokens: ReadonlyArray<string>
}>

const defaultContextWords = 8

const textOf = (words: ReadonlyArray<TimedWord>): string =>
  Array.join(
    Array.map(words, timed => timed.word.text),
    ' ',
  )

/**
 * Every place the words of `query` are spoken in a Transcript, in order,
 * whatever their case or punctuation, as {@link matchesIn} finds them:
 * `lamp` finds `Lamp` and `lamp,` and `lamps`, and `lit at dusk` finds
 * those three words in a row. Each match carries the first word's token,
 * to play from it, its time, to link to it, and `contextWords` words
 * either side, eight unless told otherwise, to show where it is. An empty
 * query finds nothing.
 *
 * @example
 * ```typescript
 * searchTranscript(transcript, 'lamp') // [{ token: 'a1', startMs: 400, label: '0:00', text: 'lamp', before: 'The', after: 'was lit at dusk.', tokens: ['a1'] }, …]
 * ```
 */
export const searchTranscript = (
  transcript: TranscriptNode,
  query: string,
  options: Readonly<{ contextWords?: number }> = {},
): ReadonlyArray<TranscriptMatch> => {
  const words = timedWordsOf(transcript)
  const contextWords = options.contextWords ?? defaultContextWords
  return Array.flatMap(
    matchesIn(
      Array.map(words, timed => timed.word.text),
      query,
    ),
    ({ index, length }) => {
      const run = words.slice(index, index + length)
      return Array.fromOption(
        Option.map(Array.head(run), first => ({
          token: first.word.token,
          startMs: first.startMs,
          passageKey: first.passage.key,
          label: first.passage.label,
          text: textOf(run),
          before: textOf(words.slice(Math.max(0, index - contextWords), index)),
          after: textOf(
            words.slice(index + length, index + length + contextWords),
          ),
          tokens: Array.map(run, timed => timed.word.token),
        })),
      )
    },
  )
}

const markOf =
  (mark: TranscriptWordMark) =>
  (token: string): readonly [string, TranscriptWordMark] => [token, mark]

/**
 * A Transcript with what a search for `query` found in it marked: each
 * word found is `Found`, and the words of the match that starts at
 * `selectedStartMs`, the one a person is on, are `Selected`. A painter
 * sets them apart from the word sounding. A Transcript in which nothing
 * is found comes back as it is.
 *
 * @example
 * ```typescript
 * transcriptWithMatches(transcript, 'lamp', 13_600) // 'lamp' at 0:00 Found, 'Lamp' at 0:13 Selected
 * ```
 */
export const transcriptWithMatches = (
  transcript: TranscriptNode,
  query: string,
  selectedStartMs?: number,
): TranscriptNode => {
  const marks = new Map(
    Array.flatMap(
      searchTranscript(transcript, query, { contextWords: 0 }),
      match =>
        Array.map(
          match.tokens,
          markOf(match.startMs === selectedStartMs ? 'Selected' : 'Found'),
        ),
    ),
  )
  return marks.size === 0
    ? transcript
    : {
        ...transcript,
        passages: Array.map(transcript.passages, passage =>
          Array.some(passage.words, word => marks.has(word.token))
            ? {
                ...passage,
                words: Array.map(passage.words, word =>
                  Option.match(Option.fromNullishOr(marks.get(word.token)), {
                    onNone: () => word,
                    onSome: mark => ({ ...word, mark }),
                  }),
                ),
              }
            : passage,
        ),
      }
}

/**
 * The match a step lands on from the place `fromMs`: going on, the first
 * that starts after it, and past the last, the first again; going back,
 * the last that starts before it, and before the first, the last. None
 * when there are no matches.
 *
 * @example
 * ```typescript
 * matchStepOf(matches, selected.startMs, 'Next') // Some(the match after the selected one)
 * ```
 */
export const matchStepOf = <Match extends Readonly<{ startMs: number }>>(
  matches: ReadonlyArray<Match>,
  fromMs: number,
  direction: ScrubDirection,
): Option.Option<Match> =>
  direction === 'Next'
    ? Option.orElse(
        Array.findFirst(matches, match => match.startMs > fromMs),
        () => Array.head(matches),
      )
    : Option.orElse(
        Array.findLast(matches, match => match.startMs < fromMs),
        () => Array.last(matches),
      )

/**
 * What a seek bar will land on at `value`, the place under a drag: the
 * last of its landings that starts at or before it, such as the paragraph
 * there. None for a bar that names no landings, and before the first.
 *
 * @example
 * ```typescript
 * seekLandingAt(seek, 730_000) // Some({ value: 723_000, text: '12:03 · The keeper climbed the stairs' })
 * ```
 */
export const seekLandingAt = (
  seek: SeekNode,
  value: number,
): Option.Option<SeekLanding> =>
  Array.findLast(seek.landings ?? [], landing => landing.value <= value)

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
