import { Array, Option, Order, Schema as S, String, pipe } from 'effect'

import type { PreviewLine, RecordingSummary } from './recording.js'

/** The element id of the recording search field. */
export const SEARCH_FIELD_ID = 'recording-search'

const WHITESPACE = /\s+/

const REGULAR_EXPRESSION_SYNTAX = /[.*+?^${}()|[\]\\]/g

/** A run of text, and whether it matches a word of the search. */
export const TextPart = S.Struct({ text: S.String, isMatch: S.Boolean })
/** A run of text, and whether it matches a word of the search. */
export type TextPart = typeof TextPart.Type

const byLengthDescending = Order.mapInput(
  Order.flip(Order.Number),
  (term: string) => term.length,
)

const literalPatternOf = (term: string): string =>
  term.replace(REGULAR_EXPRESSION_SYNTAX, '\\$&')

const searchTextOf = (recording: RecordingSummary): string =>
  String.toLowerCase(
    Array.join(
      [
        recording.title,
        ...Array.map(recording.previewLines, line => line.text),
      ],
      ' ',
    ),
  )

/**
 * The words of a search, lowercased; an empty or blank search has none.
 *
 * @example
 * ```ts
 * searchTermsOf('  Kitchen  Test ')
 * // ['kitchen', 'test']
 * ```
 */
export const searchTermsOf = (query: string): ReadonlyArray<string> =>
  pipe(
    query,
    String.trim,
    String.toLowerCase,
    String.split(WHITESPACE),
    Array.filter(String.isNonEmpty),
  )

/**
 * The preview line that holds every word of the search, so a search result
 * can open the recording at that line; `None` for a blank search or when the
 * words match only across the title and several lines.
 *
 * @example
 * ```ts
 * matchedPreviewLineOf(recording, 'rain barrel')
 * // Option.some({ sectionID: '...', startSeconds: 25.4, text: 'Mostly on seeds, tools, and the new rain barrel.' })
 * ```
 */
export const matchedPreviewLineOf = (
  recording: RecordingSummary,
  query: string,
): Option.Option<PreviewLine> =>
  Array.match(searchTermsOf(query), {
    onEmpty: () => Option.none(),
    onNonEmpty: terms =>
      Array.findFirst(recording.previewLines, line => {
        const text = String.toLowerCase(line.text)
        return Array.every(terms, term => String.includes(term)(text))
      }),
  })

/**
 * Splits text into the runs that match a word of the search and the runs
 * between them, so a result can highlight what matched; the whole text is one
 * unmatched run when the search is blank. Longer words win where two overlap.
 *
 * @example
 * ```ts
 * textPartsOf('The new rain barrel', 'rain barrel')
 * // [{ text: 'The new ', isMatch: false }, { text: 'rain', isMatch: true },
 * //  { text: ' ', isMatch: false }, { text: 'barrel', isMatch: true }]
 * ```
 */
export const textPartsOf = (
  text: string,
  query: string,
): ReadonlyArray<TextPart> =>
  Array.match(searchTermsOf(query), {
    onEmpty: () => [{ text, isMatch: false }],
    onNonEmpty: terms => {
      const pattern = new RegExp(
        `(${pipe(terms, Array.sort(byLengthDescending), Array.map(literalPatternOf), Array.join('|'))})`,
        'gi',
      )
      return pipe(
        text.split(pattern),
        Array.map((part, index) => ({ text: part, isMatch: index % 2 === 1 })),
        Array.filter(part => String.isNonEmpty(part.text)),
      )
    },
  })

/**
 * The recordings whose title or preview lines (the lines the list shows)
 * contain every word of the search, in their order; every recording when the
 * search is blank.
 *
 * @example
 * ```ts
 * recordingsMatching(recordings, 'kitchen phone')
 * // the recordings that mention both words
 * ```
 */
export const recordingsMatching = (
  recordings: ReadonlyArray<RecordingSummary>,
  query: string,
): ReadonlyArray<RecordingSummary> =>
  Array.match(searchTermsOf(query), {
    onEmpty: () => recordings,
    onNonEmpty: terms =>
      Array.filter(recordings, recording => {
        const text = searchTextOf(recording)
        return Array.every(terms, term => String.includes(term)(text))
      }),
  })
