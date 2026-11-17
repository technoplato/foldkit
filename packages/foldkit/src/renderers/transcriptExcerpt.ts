import { Array, Option, Schema as S } from 'effect'

import type { TranscriptNode, TranscriptPassage } from './types.js'

// EXCERPT

/**
 * Where a paragraph of an excerpt sits: before the one being read, the
 * one being read, or after it.
 */
export const ExcerptPosition = S.Literals(['Leading', 'Current', 'Trailing'])
/** Where a paragraph of an excerpt sits. */
export type ExcerptPosition = typeof ExcerptPosition.Type

/**
 * One paragraph of an excerpt: its stable key, where it sits, the label
 * it starts at, such as `12:03`, the heading of the section it opens,
 * such as `Chapter 8: Religion`, and its words as one line of text.
 */
export const TranscriptExcerptParagraph = S.Struct({
  key: S.String,
  position: ExcerptPosition,
  label: S.String,
  maybeHeading: S.OptionFromOptionalKey(S.String),
  text: S.String,
})
/** One paragraph of an excerpt. */
export type TranscriptExcerptParagraph = typeof TranscriptExcerptParagraph.Type

/**
 * The paragraph of a Transcript being read now, with the paragraphs
 * before and after it, the word sounding, and which word of the current
 * paragraph that is, counting from 0. It is what a surface with
 * no room for the whole transcript shows, and what a program that only
 * reads lines follows: a terminal's `books words --follow`, a caption, a
 * status bar.
 */
export const TranscriptExcerpt = S.Struct({
  paragraphs: S.Array(TranscriptExcerptParagraph),
  maybeCurrentWord: S.OptionFromOptionalKey(S.String),
  maybeCurrentWordIndex: S.OptionFromOptionalKey(S.Int),
})
/** The paragraph being read now, with those around it. */
export type TranscriptExcerpt = typeof TranscriptExcerpt.Type

/**
 * An excerpt as one line of JSON, with no `maybe` in its keys:
 * `{"paragraphs":[{"key":"w12","position":"Current","label":"12:03","text":"…"}],"currentWord":"lamp","currentWordIndex":4}`.
 * A paragraph that opens a section also has `heading`.
 */
export const TranscriptExcerptJson = S.fromJsonString(
  S.toCodecJson(
    S.Struct({
      paragraphs: S.Array(
        TranscriptExcerptParagraph.pipe(
          S.encodeKeys({ maybeHeading: 'heading' }),
        ),
      ),
      maybeCurrentWord: S.OptionFromOptionalKey(S.String),
      maybeCurrentWordIndex: S.OptionFromOptionalKey(S.Int),
    }).pipe(
      S.encodeKeys({
        maybeCurrentWord: 'currentWord',
        maybeCurrentWordIndex: 'currentWordIndex',
      }),
    ),
  ),
)

/**
 * How many paragraphs an excerpt takes before and after the one being
 * read. One of each unless told otherwise.
 */
export type TranscriptExcerptOptions = Readonly<{
  leading?: number
  trailing?: number
}>

const defaultAround = 1

const textOfWords = (passage: TranscriptPassage): string =>
  Array.join(
    Array.map(passage.words, word => word.text),
    ' ',
  )

const paragraphOf =
  (currentIndex: number, firstIndex: number) =>
  (passage: TranscriptPassage, offset: number): TranscriptExcerptParagraph => {
    const index = firstIndex + offset
    const position: ExcerptPosition =
      index < currentIndex
        ? 'Leading'
        : index === currentIndex
          ? 'Current'
          : 'Trailing'
    return {
      key: passage.key,
      position,
      label: passage.label,
      maybeHeading: Option.fromNullishOr(passage.heading),
      text: textOfWords(passage),
    }
  }

/**
 * The paragraph a Transcript marks current, with `leading` paragraphs
 * before it and `trailing` after, fewer at either end of what the
 * Transcript holds. None while no paragraph is being read, such as before
 * the words arrive.
 *
 * @example
 * ```typescript
 * transcriptExcerptOf(transcript, { leading: 1, trailing: 2 })
 * // Some({ paragraphs: [Leading 0:12, Current 0:31, Trailing 0:48, Trailing 1:05], maybeCurrentWord: Some('rounded') })
 * ```
 */
export const transcriptExcerptOf = (
  transcript: TranscriptNode,
  options: TranscriptExcerptOptions = {},
): Option.Option<TranscriptExcerpt> =>
  Option.map(
    Array.findFirstIndex(
      transcript.passages,
      passage => passage.isCurrent === true,
    ),
    currentIndex => {
      const firstIndex = Math.max(
        0,
        currentIndex - Math.max(0, options.leading ?? defaultAround),
      )
      const endIndex =
        currentIndex + Math.max(0, options.trailing ?? defaultAround) + 1
      const maybeCurrentWordIndex = Option.flatMap(
        Array.get(transcript.passages, currentIndex),
        current =>
          Array.findFirstIndex(current.words, word => word.isCurrent === true),
      )
      return {
        paragraphs: Array.map(
          transcript.passages.slice(firstIndex, endIndex),
          paragraphOf(currentIndex, firstIndex),
        ),
        maybeCurrentWord: Option.flatMap(maybeCurrentWordIndex, wordIndex =>
          Option.flatMap(
            Array.get(transcript.passages, currentIndex),
            current =>
              Option.map(
                Array.get(current.words, wordIndex),
                word => word.text,
              ),
          ),
        ),
        maybeCurrentWordIndex,
      }
    },
  )

const markOf = (position: ExcerptPosition): string => {
  if (position === 'Leading') {
    return '-'
  } else if (position === 'Current') {
    return '>'
  } else {
    return '+'
  }
}

const bracketedAt = (text: string, wordIndex: number): string =>
  Array.join(
    Array.map(text.split(' '), (word, index) =>
      index === wordIndex ? `[${word}]` : word,
    ),
    ' ',
  )

/**
 * An excerpt as lines for a pipe, one per paragraph: `-` before a leading
 * paragraph, `>` before the one being read, `+` before a trailing one,
 * then its label and its text, the word sounding in brackets. A heading
 * comes on its own line, `## Chapter 2: Landfall`, above the paragraph
 * that opens the section.
 *
 * @example
 * ```typescript
 * transcriptExcerptLines(excerpt)
 * // ['- 0:12 Gulls settled on the rail.',
 * //  '> 0:31 A boat [rounded] the point slowly.',
 * //  '+ 0:48 Nobody waved from the deck.']
 * ```
 */
export const transcriptExcerptLines = (
  excerpt: TranscriptExcerpt,
): ReadonlyArray<string> =>
  Array.flatMap(excerpt.paragraphs, paragraph => {
    const text =
      paragraph.position === 'Current'
        ? Option.match(excerpt.maybeCurrentWordIndex, {
            onNone: () => paragraph.text,
            onSome: wordIndex => bracketedAt(paragraph.text, wordIndex),
          })
        : paragraph.text
    return [
      ...Array.fromOption(
        Option.map(paragraph.maybeHeading, heading => `## ${heading}`),
      ),
      `${markOf(paragraph.position)} ${paragraph.label} ${text}`,
    ]
  })
