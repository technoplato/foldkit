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
import { MenuSheet } from './menuSheet.js'
import type { Paint } from './paint.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)

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

const shelf: ListNode = {
  _tag: 'List',
  label: 'No audio yet',
  items: [
    {
      key: 'salt-road',
      title: 'Salt Road',
      action: 'Open:salt-road',
      menuAction: 'ShowTitleMenu:salt-road',
    },
    { key: 'a-tin-comet', title: 'A Tin Comet', action: 'Open:a-tin-comet' },
  ],
}

describe('the menu on a row', () => {
  const rowNamed = (painted: ReturnType<typeof paintRows>, title: string) =>
    firstOf(
      hostsOf(painted, 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === title,
    )

  it('asks the Program for the menu on a long press, and only on a row that has one', () => {
    const pressed: Array<ButtonNode> = []
    const painted = paintRows(
      shelf,
      shelf.items,
      paintWith(pressed, []),
      () => [],
    )
    callProp(rowNamed(painted, 'Salt Road'), 'onLongPress')
    expect(Array.map(pressed, button => button.action)).toEqual([
      'ShowTitleMenu:salt-road',
    ])
    expect(
      propsOf(rowNamed(painted, 'A Tin Comet'))['onLongPress'],
    ).toBeUndefined()
  })

  it('offers what the Program holds, presses what is picked, and closes through the Program', () => {
    const pressed: Array<ButtonNode> = []
    const sheet = MenuSheet({
      heading: 'Salt Road',
      dismissAction: 'CloseTitleMenu',
      items: [
        { action: 'Open:salt-road', label: 'Open', icon: 'Library' },
        { action: 'ImportFromAudible', label: 'Get its audio from Audible' },
      ],
      paint: paintWith(pressed, []),
    })
    callProp(
      firstOf(
        hostsOf(sheet, 'Pressable'),
        element =>
          propsOf(element)['accessibilityLabel'] ===
          'Get its audio from Audible',
      ),
      'onPress',
    )
    callProp(
      firstOf(
        hostsOf(sheet, 'Pressable'),
        element => propsOf(element)['accessibilityLabel'] === 'Close',
      ),
      'onPress',
    )
    expect(Array.map(pressed, button => button.action)).toEqual([
      'ImportFromAudible',
      'CloseTitleMenu',
    ])
    expect(wordsOf(sheet)).toContain('Salt Road')
  })
})
