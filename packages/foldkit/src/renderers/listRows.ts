import { Array, String, pipe } from 'effect'

import type { ListItem } from './types.js'

// FILTER

const columnSeparator = ' · '

const markPattern = /\p{Mark}/gu

const wordGapPattern = /\s+/u

/**
 * Text as a filter compares it: lower case, and each letter with a mark
 * read as the plain letter, so `Café` and `cafe` are the same.
 */
const comparable = (text: string): string =>
  String.toLowerCase(text.normalize('NFD').replace(markPattern, ''))

const wordsOf = (typed: string): ReadonlyArray<string> =>
  pipe(comparable(typed).split(wordGapPattern), Array.filter(String.isNonEmpty))

/**
 * The rows of a List a filter keeps for what a person typed: the ones
 * whose title holds every word typed, in any order, whatever the case,
 * and with a marked letter read as the plain one. Nothing typed keeps
 * every row. The rows keep their order and are not changed, so a row a
 * painter already drew is the same row.
 *
 * @example
 * ```typescript
 * filterListItems(chapters, 'tide lamp') // [{ key: '3', title: 'A Lamp Against the Tide', … }]
 * filterListItems(chapters, '') // every chapter
 * ```
 */
export const filterListItems = (
  items: ReadonlyArray<ListItem>,
  typed: string,
): ReadonlyArray<ListItem> => {
  const words = wordsOf(typed)
  return Array.match(words, {
    onEmpty: () => items,
    onNonEmpty: typedWords =>
      Array.filter(items, item => {
        const title = comparable(item.title)
        return Array.every(typedWords, word => String.includes(word)(title))
      }),
  })
}

// LINES

/**
 * A row's lines as a painter that cannot line up columns shows them: its
 * `lines`, then its `columns` joined into one more line, so a chapter's
 * start and length still read `20:00 · 7:33` in a terminal.
 *
 * @example
 * ```typescript
 * itemLinesOf({ key: '3', title: 'The Light', columns: ['20:00', '7:33'] }) // ['20:00 · 7:33']
 * ```
 */
export const itemLinesOf = (item: ListItem): ReadonlyArray<string> =>
  Array.match(item.columns ?? [], {
    onEmpty: () => item.lines ?? [],
    onNonEmpty: columns => [
      ...(item.lines ?? []),
      Array.join(columns, columnSeparator),
    ],
  })
