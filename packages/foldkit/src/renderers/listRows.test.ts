import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import { List } from './elements.js'
import { filterListItems, itemLinesOf } from './listRows.js'
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
