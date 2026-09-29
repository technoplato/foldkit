import { Array, String, pipe } from 'effect'

import type { RecordingSummary } from './recording.js'

/** The element id of the recording search field. */
export const SEARCH_FIELD_ID = 'recording-search'

const WHITESPACE = /\s+/

const searchTextOf = (recording: RecordingSummary): string =>
  String.toLowerCase(
    Array.join([recording.title, ...recording.previewLines], ' '),
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
