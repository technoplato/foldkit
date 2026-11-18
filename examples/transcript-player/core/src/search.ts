import { Array, Option, Order } from 'effect'
import { matchesIn } from 'foldkit/renderers'

import {
  type Match,
  type Passage,
  type Word,
  searchMatchesLimit,
} from './model.js'

// SEARCH

const contextWords = 8

type Placed = Readonly<{ word: Word; passageIndex: number }>

const textOf = (placed: ReadonlyArray<Placed>): string =>
  Array.join(
    Array.map(placed, each => each.word.text),
    ' ',
  )

const matchOf = (
  words: ReadonlyArray<Placed>,
  index: number,
  length: number,
): Option.Option<Match> => {
  const run = words.slice(index, index + length)
  return Option.map(
    Option.all({ first: Array.head(run), last: Array.last(run) }),
    ({ first, last }) => ({
      startMs: first.word.startMs,
      text: textOf(run),
      before: textOf(
        Array.filter(
          words.slice(Math.max(0, index - contextWords), index),
          each => each.passageIndex === first.passageIndex,
        ),
      ),
      after: textOf(
        Array.filter(
          words.slice(index + length, index + length + contextWords),
          each => each.passageIndex === last.passageIndex,
        ),
      ),
    }),
  )
}

/**
 * What a search for `query` finds in `passages`, the words of a whole
 * recording or any part of it: how many places the words are spoken, and
 * the first of them in order, at most {@link searchMatchesLimit}, each
 * with the time it starts and up to eight words either side from its own
 * passage. It matches as `matchesIn` of `foldkit/renderers` does: every
 * word whole but the last, which is the start of a word, across passages,
 * whatever the case or punctuation.
 *
 * @example
 * ```typescript
 * foundIn(passages, 'lamp')
 * // { total: 4, matches: [{ startMs: 11600, text: 'lamp', before: 'The keeper lit the', after: 'at dusk. Gulls settled on the lamp rail.' }, …] }
 * ```
 */
export const foundIn = (
  passages: ReadonlyArray<Passage>,
  query: string,
): Readonly<{ total: number; matches: ReadonlyArray<Match> }> => {
  const inOrder: ReadonlyArray<Passage> = Array.sortWith(
    passages,
    passage => passage.startMs,
    Order.Number,
  )
  const words = Array.flatMap(inOrder, (passage, passageIndex) =>
    Array.map(passage.words, word => ({ word, passageIndex })),
  )
  const found = matchesIn(
    Array.map(words, each => each.word.text),
    query,
  )
  return {
    total: found.length,
    matches: Array.flatMap(
      Array.take(found, searchMatchesLimit),
      ({ index, length }) => Array.fromOption(matchOf(words, index, length)),
    ),
  }
}
