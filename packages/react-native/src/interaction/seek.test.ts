import { Option } from 'effect'
import type { TextInputNode } from 'foldkit/renderers'
import { describe, expect, it, vi } from 'vitest'

import { submitPressOf } from './field.js'
import { percentOf } from './look.js'
import { seekFractionOf, seekValueAt } from './seek.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)

describe('a seek bar', () => {
  it('reads a place along its width as a value on one of its steps', () => {
    const book = { max: 4_800_000, step: 1000 }
    expect(seekValueAt(book, 0.5)).toBe(2_400_000)
    expect(seekValueAt(book, 0.50004)).toBe(2_400_000)
    expect(seekValueAt(book, -0.2)).toBe(0)
    expect(seekValueAt(book, 1.4)).toBe(4_800_000)
  })

  it('starts a chapter bar at the chapter', () => {
    const chapter = { min: 1_200_000, max: 2_400_000, step: 1000 }
    expect(seekValueAt(chapter, 0)).toBe(1_200_000)
    expect(seekValueAt(chapter, 0.25)).toBe(1_500_000)
    expect(seekFractionOf(chapter, 1_500_000)).toBe(0.25)
    expect(seekFractionOf({ max: 0 }, 10)).toBe(0)
  })

  it('writes a share of the width as a percent, kept inside the bar', () => {
    expect(percentOf(0.25)).toBe('25%')
    expect(percentOf(3)).toBe('100%')
  })
})

describe('a field that is submitted', () => {
  const search: TextInputNode = {
    _tag: 'TextInput',
    value: 'lamp',
    action: 'Search',
    againAction: 'NextMatch',
    clearAction: 'ClearSearch',
    label: 'Search this book',
  }

  it('presses its Action with what was typed', () => {
    expect(
      Option.map(
        submitPressOf(search, 'stairs', 'Enter'),
        press => press.action,
      ),
    ).toEqual(Option.some('Search:stairs'))
  })

  it('presses its again Action when the text has not changed, such as the next match', () => {
    expect(
      Option.map(submitPressOf(search, 'lamp', 'Enter'), press => press.action),
    ).toEqual(Option.some('NextMatch'))
    expect(
      Option.map(submitPressOf(search, 'lamp', 'Leave'), press => press.action),
    ).not.toEqual(Option.some('NextMatch'))
  })

  it('presses its clear Action when it is emptied', () => {
    expect(
      Option.map(submitPressOf(search, '', 'Enter'), press => press.action),
    ).toEqual(Option.some('ClearSearch'))
  })
})
