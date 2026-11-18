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

const readOf = (item: ListItem, isOverLines: boolean): string =>
  comparable(
    isOverLines
      ? Array.join([item.title, ...(item.lines ?? [])], ' ')
      : item.title,
  )

/**
 * The rows of a List a filter keeps for what a person typed: the ones
 * whose title holds every word typed, in any order, whatever the case,
 * and with a marked letter read as the plain one. With `isOverLines` the
 * lines under the title are read too, so a bookmark is found by its note.
 * Nothing typed keeps every row. The rows keep their order and are not
 * changed, so a row a painter already drew is the same row.
 *
 * @example
 * ```typescript
 * filterListItems(chapters, 'tide lamp') // [{ key: '3', title: 'A Lamp Against the Tide', … }]
 * filterListItems(chapters, '') // every chapter
 * filterListItems(bookmarks, 'packing', true) // the bookmark whose note says 'packing order'
 * ```
 */
export const filterListItems = (
  items: ReadonlyArray<ListItem>,
  typed: string,
  isOverLines = false,
): ReadonlyArray<ListItem> => {
  const words = wordsOf(typed)
  return Array.match(words, {
    onEmpty: () => items,
    onNonEmpty: typedWords =>
      Array.filter(items, item => {
        const read = readOf(item, isOverLines)
        return Array.every(typedWords, word => String.includes(word)(read))
      }),
  })
}

// GROUPS

/** A run of rows next to each other that share a group, and its name. */
export type ItemGroup = Readonly<{
  group: string | undefined
  items: Array.NonEmptyReadonlyArray<ListItem>
}>

/**
 * The rows of a List as the runs a painter heads: rows next to each other
 * with the same `group` make one run, headed by the group once, and its
 * length is how many it holds. Rows with no group make a run with no
 * heading, so a List without groups is one run.
 *
 * @example
 * ```typescript
 * groupedItemsOf(bookmarks)
 * // [{ group: 'Prologue', items: [b1] }, { group: 'The Long Portage', items: [b2, b3] }]
 * ```
 */
export const groupedItemsOf = (
  items: ReadonlyArray<ListItem>,
): ReadonlyArray<ItemGroup> =>
  Array.match(items, {
    onEmpty: () => [],
    onNonEmpty: rows =>
      Array.map(
        Array.groupWith(rows, (self, that) => self.group === that.group),
        run => ({ group: Array.headNonEmpty(run).group, items: run }),
      ),
  })

// LINES

/**
 * A row's lines as a painter that draws no columns, group headings or
 * badges shows them: its `lines`, then its `group`, then what its `badge`
 * stands for, then its `columns` joined into one more line, so a chapter's
 * start and length still read `20:00 · 7:33` in a terminal and a bookmark
 * still names its chapter.
 *
 * @example
 * ```typescript
 * itemLinesOf({ key: '3', title: 'The Light', columns: ['20:00', '7:33'] }) // ['20:00 · 7:33']
 * itemLinesOf({ key: '3', title: 'The Light', badge: { text: '2', label: '2 bookmarks' } }) // ['2 bookmarks']
 * ```
 */
export const itemLinesOf = (item: ListItem): ReadonlyArray<string> => [
  ...(item.lines ?? []),
  ...Array.fromNullishOr(item.group),
  ...Array.fromNullishOr(item.badge?.label),
  ...Array.match(item.columns ?? [], {
    onEmpty: () => [],
    onNonEmpty: columns => [Array.join(columns, columnSeparator)],
  }),
]
