import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import { List } from './elements.js'
import { filterListItems, groupedItemsOf, itemLinesOf } from './listRows.js'
import { renderScreen } from './render.js'
import type { ListItem } from './types.js'

const chapters: ReadonlyArray<ListItem> = [
  { key: '1', title: 'Opening Credits', columns: ['0:00', '0:28'] },
  { key: '2', title: 'The Tide Comes In', columns: ['0:28', '5:31'] },
  { key: '3', title: 'A Lamp Against the Tide', columns: ['5:59', '7:33'] },
  { key: '4', title: 'Café at the Jetty', columns: ['13:32', '7:04'] },
]

const keysOf = (items: ReadonlyArray<ListItem>): ReadonlyArray<string> =>
  Array.map(items, item => item.key)

describe('filterListItems', () => {
  it('keeps every row while nothing is typed', () => {
    expect(keysOf(filterListItems(chapters, ''))).toEqual(['1', '2', '3', '4'])
    expect(keysOf(filterListItems(chapters, '   '))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
  })

  it('keeps the rows whose title holds what is typed, whatever its case', () => {
    expect(keysOf(filterListItems(chapters, 'tide'))).toEqual(['2', '3'])
    expect(keysOf(filterListItems(chapters, 'TIDE'))).toEqual(['2', '3'])
  })

  it('keeps a row only when its title holds every word typed, in any order', () => {
    expect(keysOf(filterListItems(chapters, 'tide lamp'))).toEqual(['3'])
    expect(keysOf(filterListItems(chapters, 'lamp  tide'))).toEqual(['3'])
  })

  it('reads a letter with a mark as the plain letter', () => {
    expect(keysOf(filterListItems(chapters, 'cafe'))).toEqual(['4'])
  })

  it('keeps no row when no title holds what is typed', () => {
    expect(filterListItems(chapters, 'harbour')).toEqual([])
  })

  it('keeps the rows in their order and unchanged', () => {
    expect(filterListItems(chapters, 'the')).toEqual(Array.drop(chapters, 1))
  })
})

describe('itemLinesOf', () => {
  it('reads a row with columns as its lines, then its columns as one line', () => {
    expect(
      itemLinesOf({
        key: '2',
        title: 'The Tide Comes In',
        lines: ['2:10 left in this chapter'],
        columns: ['0:28', '5:31'],
      }),
    ).toEqual(['2:10 left in this chapter', '0:28 · 5:31'])
  })

  it('reads a row without columns as its lines', () => {
    expect(itemLinesOf({ key: 'a', title: 'A', lines: ['one'] })).toEqual([
      'one',
    ])
    expect(itemLinesOf({ key: 'a', title: 'A' })).toEqual([])
  })
})

describe('a List with columns in a terminal', () => {
  it('prints each row with its columns after its title', () => {
    const screen = renderScreen(
      List({
        label: 'Chapters',
        columns: ['Starts', 'Length'],
        items: Array.take(chapters, 2),
      }),
      60,
    )
    expect(screen).toContain('Opening Credits')
    expect(screen).toContain('0:00 · 0:28')
    expect(screen).toContain('0:28 · 5:31')
  })
})

const bookmarks: ReadonlyArray<ListItem> = [
  {
    key: 'b1',
    title: '…the old sheets were drawn by men who had never wintered there…',
    group: 'Prologue',
    columns: ['12:41'],
  },
  {
    key: 'b2',
    title: '…carry the paper dry and the instruments will forgive you…',
    lines: ['packing order'],
    group: 'The Long Portage',
    columns: ['1:05:10'],
  },
  {
    key: 'b3',
    title: '…she counted paces, not hours, because hours lie in snow…',
    group: 'The Long Portage',
    columns: ['1:09:52'],
  },
]

describe('a filter that also reads the rows’ lines', () => {
  it('finds a row by a word of a line under its title, such as a note', () => {
    expect(keysOf(filterListItems(bookmarks, 'packing'))).toEqual([])
    expect(keysOf(filterListItems(bookmarks, 'packing', true))).toEqual(['b2'])
  })

  it('finds a row whose title and lines hold the words between them', () => {
    expect(keysOf(filterListItems(bookmarks, 'paper order', true))).toEqual([
      'b2',
    ])
  })
})

describe('groupedItemsOf', () => {
  it('heads each run of rows that share a group once, with how many it holds', () => {
    expect(
      Array.map(groupedItemsOf(bookmarks), section => [
        section.group,
        keysOf(section.items),
      ]),
    ).toEqual([
      ['Prologue', ['b1']],
      ['The Long Portage', ['b2', 'b3']],
    ])
  })

  it('keeps rows with no group as one run with no heading', () => {
    expect(
      Array.map(groupedItemsOf(chapters), section => [
        section.group,
        section.items.length,
      ]),
    ).toEqual([[undefined, 4]])
    expect(groupedItemsOf([])).toEqual([])
  })
})

describe('itemLinesOf with a group and a badge', () => {
  it('reads the group and what the badge stands for as lines, before the columns', () => {
    expect(
      itemLinesOf({
        key: 'b2',
        title: '…carry the paper dry…',
        lines: ['packing order'],
        group: 'The Long Portage',
        badge: { text: '3', label: '3 bookmarks' },
        columns: ['1:05:10'],
      }),
    ).toEqual(['packing order', 'The Long Portage', '3 bookmarks', '1:05:10'])
  })
})
