import { Array } from 'effect'
import type { ButtonNode, ListNode } from 'foldkit/renderers'
import { defaultTheme } from 'foldkit/theme'
import { describe, expect, it, vi } from 'vitest'

import {
  allOf,
  callProp,
  firstOf,
  hostsOf,
  propsOf,
  styleOf,
  wordsOf,
} from '../test/elements.js'
import { paintRows } from './list.js'
import { lightLook } from './look.js'
import type { Paint } from './paint.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)

const paintWith = (
  pressed: Array<ButtonNode>,
  followed: Array<string>,
): Paint => ({
  look: lightLook,
  styles: {},
  onPress: button => {
    pressed.push(button)
  },
  onInput: undefined,
  onLink: href => {
    followed.push(href)
  },
  platformActions: [],
  maybePlatformTitle: undefined,
  isCentered: false,
})

const contents: ListNode = {
  _tag: 'List',
  label: 'Contents',
  columns: ['Starts', 'Length'],
  items: [
    {
      key: 'c1',
      title: 'The Tide',
      group: 'Part One',
      columns: ['0:00', '20:00'],
      action: 'SeekTo:0',
      isCurrent: true,
      badge: { text: '3', label: '3 bookmarks' },
    },
    {
      key: 'c2',
      title: 'The Lamp at Dusk',
      titleMark: { start: 4, end: 8 },
      group: 'Part One',
      lines: ['12:03 · The keeper climbed the stairs'],
      href: '/books/the-lantern-keeper/listen/20m',
    },
    { key: 'c3', title: 'Fog', group: 'Part Two', action: 'SeekTo:2400000' },
  ],
}

describe('the rows of a list', () => {
  it('heads each group once, with how many rows it has', () => {
    const painted = paintRows(
      contents,
      contents.items,
      paintWith([], []),
      () => [],
    )
    const headers = Array.filter(
      allOf(painted),
      element => propsOf(element)['accessibilityRole'] === 'header',
    )
    expect(Array.map(headers, wordsOf)).toEqual(['Part One2', 'Part Two1'])
  })

  it('presses a row with an Action and follows a row that is a link', () => {
    const pressed: Array<ButtonNode> = []
    const followed: Array<string> = []
    const painted = paintRows(
      contents,
      contents.items,
      paintWith(pressed, followed),
      () => [],
    )
    const rowNamed = (title: string) =>
      firstOf(
        hostsOf(painted, 'Pressable'),
        element => propsOf(element)['accessibilityLabel'] === title,
      )
    callProp(rowNamed('The Tide'), 'onPress')
    callProp(rowNamed('The Lamp at Dusk'), 'onPress')
    expect(Array.map(pressed, button => button.action)).toEqual(['SeekTo:0'])
    expect(followed).toEqual(['/books/the-lantern-keeper/listen/20m'])
    expect(propsOf(rowNamed('The Lamp at Dusk'))['accessibilityRole']).toBe(
      'link',
    )
    expect(propsOf(rowNamed('The Tide'))['accessibilityState']).toEqual({
      selected: true,
    })
  })

  it('draws the row columns, the badge with what it stands for, and the marked part of a title', () => {
    const painted = paintRows(
      contents,
      contents.items,
      paintWith([], []),
      () => [],
    )
    expect(wordsOf(painted)).toContain('0:00')
    expect(wordsOf(painted)).toContain('20:00')
    const badge = firstOf(
      allOf(painted),
      element => propsOf(element)['accessibilityLabel'] === '3 bookmarks',
    )
    expect(wordsOf(badge).trim()).toBe('3')
    const mark = firstOf(
      hostsOf(painted, 'Text'),
      element =>
        styleOf(element)['backgroundColor'] === defaultTheme.MarkSoft.light,
    )
    expect(wordsOf(mark)).toBe('Lamp')
  })

  it('inks the current row with the accent', () => {
    const painted = paintRows(
      contents,
      contents.items,
      paintWith([], []),
      () => [],
    )
    const title = firstOf(hostsOf(painted, 'Text'), element =>
      wordsOf(element).startsWith('The Tide'),
    )
    expect(styleOf(title)['color']).toBe(defaultTheme.Accent.light)
  })
})
