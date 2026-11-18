import { describe, expect, it } from 'vitest'

import { holdsTyped, namedByTyped } from './typed.js'

// Made-up titles: nothing here is a real book.
const titles = [
  {
    name: 'The Lantern Keeper: A Tide Story, Book One',
    word: 'the-lantern-keeper',
  },
  { name: 'Small Hours', word: 'small-hours' },
  { name: 'Café Lantern', word: 'cafe-lantern' },
  { name: 'Lantern', word: 'lantern-alone' },
]

const found = (typed: string): ReadonlyArray<string> =>
  namedByTyped(titles, typed, title => [title.name, title.word]).map(
    title => title.word,
  )

describe('what a person typed, read against names', () => {
  it('holds when the name has every word typed, in any order and any case', () => {
    expect(holdsTyped('The Lantern Keeper', 'keeper LANTERN')).toBe(true)
    expect(holdsTyped('The Lantern Keeper', 'lantern tide')).toBe(false)
  })

  it('reads a marked letter as the plain one and lets punctuation go', () => {
    expect(holdsTyped('Café Lantern', 'cafe')).toBe(true)
    expect(
      holdsTyped('The Lantern Keeper: A Tide Story', 'keeper, a tide'),
    ).toBe(true)
    expect(holdsTyped('Small Hours', '"small hours"')).toBe(true)
  })

  it('holds nothing for nothing typed', () => {
    expect(holdsTyped('Small Hours', '  ')).toBe(false)
  })

  it('finds the ones named: every one that holds the words', () => {
    expect(found('lantern keeper')).toEqual(['the-lantern-keeper'])
    expect(found('hours')).toEqual(['small-hours'])
    expect(found('cafe')).toEqual(['cafe-lantern'])
    expect(found('weather')).toEqual([])
  })

  it('finds the one named exactly even when longer names hold the same words', () => {
    expect(found('lantern')).toEqual(['lantern-alone'])
    expect(found('LANTERN alone')).toEqual(['lantern-alone'])
    expect(found('the lantern')).toEqual(['the-lantern-keeper'])
  })

  it('finds one by its word as well as its name', () => {
    expect(found('small-hours')).toEqual(['small-hours'])
  })
})
