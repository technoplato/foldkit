import { Array, Option } from 'effect'
import type {
  ButtonNode,
  TranscriptNode,
  TranscriptPassage,
} from 'foldkit/renderers'
import { bookmarksInPassage, transcriptAt } from 'foldkit/renderers'
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
import { lightLook, lookOf } from './look.js'
import type { Paint } from './paint.js'
import {
  WordMenuSheet,
  isNearMiddle,
  lineOfOffset,
  paintPassage,
  wordOffsetIn,
  wordStyleOf,
} from './transcript.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('react-native-svg', async () => (await import('../test/native.js')).svg)

const wordsAt = (
  prefix: string,
  startMs: number,
  texts: ReadonlyArray<string>,
): TranscriptPassage['words'] =>
  Array.map(texts, (text, index) => ({
    token: `${prefix}w${index.toString()}`,
    text,
    startMs: startMs + index * 500,
  }))

const first: TranscriptPassage = {
  key: 'p0',
  heading: 'The Tide',
  speaker: 'Speaker 2',
  label: '0:00',
  labelAction: 'SeekTo:0',
  words: wordsAt('p0', 0, ['The', 'keeper', 'climbed', 'the', 'stairs']),
}

const second: TranscriptPassage = {
  key: 'p1',
  label: '0:04',
  words: wordsAt('p1', 4000, ['He', 'trimmed', 'the', 'wick']),
}

const transcript: TranscriptNode = {
  _tag: 'Transcript',
  label: 'Transcript',
  action: 'SeekToWord',
  emptyText: 'There is no transcript for this part yet.',
  passages: [first, second],
  clock: { placeMs: 1000, atMs: 10_000, rate: 1 },
  wordMenuAction: 'ShowWordMenu',
  bookmarks: [
    {
      startMs: 1500,
      label: 'Bookmark at 0:01',
      note: 'the stairs again',
      action: 'OpenBookmark:b1',
    },
  ],
}

const paintWith = (pressed: Array<ButtonNode>, look = lightLook): Paint => ({
  look,
  styles: {},
  onPress: button => {
    pressed.push(button)
  },
  onInput: undefined,
  onLink: () => {},
  platformActions: [],
  maybePlatformTitle: undefined,
  isCentered: false,
  maybeFocusedAction: undefined,
})

const passageAt = (nowMs: number, key: string): TranscriptPassage =>
  Option.getOrThrow(
    Array.findFirst(
      transcriptAt(transcript, nowMs).passages,
      passage => passage.key === key,
    ),
  )

const wordElement = (painted: ReturnType<typeof paintPassage>, word: string) =>
  firstOf(
    hostsOf(painted, 'Text'),
    element =>
      wordsOf(element).endsWith(`${word} `) &&
      typeof propsOf(element)['onPress'] === 'function' &&
      propsOf(element)['suppressHighlighting'] === true,
  )

describe('a passage read along with', () => {
  it('inks the word the clock has reached, the words spoken before it, and the words to come', () => {
    const dark = lookOf('Dark')
    const painted = paintPassage(
      passageAt(10_600, 'p0'),
      transcript,
      [],
      paintWith([], dark),
    )
    expect(styleOf(wordElement(painted, 'the'))['color']).toBe(
      defaultTheme.ReadingCurrentWord.dark,
    )
    expect(styleOf(wordElement(painted, 'climbed'))['color']).toBe(
      defaultTheme.ReadingSpoken.dark,
    )
    expect(styleOf(wordElement(painted, 'stairs'))['color']).toBe(
      defaultTheme.ReadingToCome.dark,
    )
  })

  it('moves the mark with the clock, with no new Transcript from the Program', () => {
    const at = (nowMs: number): string =>
      Option.getOrThrow(
        Array.findFirst(
          passageAt(nowMs, 'p0').words,
          word => word.isCurrent === true,
        ),
      ).text
    expect(at(10_000)).toBe('climbed')
    expect(at(10_600)).toBe('the')
    expect(at(11_100)).toBe('stairs')
  })

  it('rests a passage the voice is not in, and rules the one it is in', () => {
    const paint = paintWith([])
    const current = paintPassage(passageAt(10_000, 'p0'), transcript, [], paint)
    const resting = paintPassage(passageAt(10_000, 'p1'), transcript, [], paint)
    expect(styleOf(current)['borderLeftColor']).toBe(
      defaultTheme.ReadingRule.light,
    )
    expect(styleOf(current)['backgroundColor']).toBe(
      defaultTheme.ReadingCurrentGround.light,
    )
    expect(styleOf(resting)['borderLeftColor']).toBe('transparent')
    expect(styleOf(wordElement(resting, 'wick'))['color']).toBe(
      defaultTheme.ReadingToCome.light,
    )
  })

  it('heads a passage with its section and its speaker, and seeks from its time', () => {
    const pressed: Array<ButtonNode> = []
    const painted = paintPassage(first, transcript, [], paintWith(pressed))
    expect(wordsOf(painted)).toContain('The Tide')
    expect(wordsOf(painted)).toContain('Speaker 2')
    const time = firstOf(
      hostsOf(painted, 'Text'),
      element =>
        wordsOf(element).startsWith('0:00') &&
        typeof propsOf(element)['onPress'] === 'function' &&
        propsOf(element)['suppressHighlighting'] !== true,
    )
    callProp(time, 'onPress')
    expect(Array.map(pressed, button => button.action)).toEqual(['SeekTo:0'])
  })

  it('presses a word to play from it, and a long press asks the Program for its menu', () => {
    const pressed: Array<ButtonNode> = []
    const painted = paintPassage(first, transcript, [], paintWith(pressed))
    callProp(wordElement(painted, 'keeper'), 'onPress')
    callProp(wordElement(painted, 'keeper'), 'onLongPress')
    expect(Array.map(pressed, button => button.action)).toEqual([
      'SeekToWord:p0w1',
      'ShowWordMenu:p0w1',
    ])
  })

  it('marks a word a search found, the match a person is on, and the word whose menu is open', () => {
    const paint = paintWith([])
    const style = (mark: 'Found' | 'Selected' | 'Picked') =>
      wordStyleOf({ token: 't', text: 'lamp', mark }, 'Resting', paint)
    expect(style('Found').backgroundColor).toBe(defaultTheme.MarkSoft.light)
    expect(style('Selected').backgroundColor).toBe(defaultTheme.Mark.light)
    expect(style('Picked').backgroundColor).toBe(defaultTheme.Selected.light)
  })

  it('draws a ribbon on a bookmarked word and its note beneath, each opening the bookmark', () => {
    const pressed: Array<ButtonNode> = []
    const painted = paintPassage(
      first,
      transcript,
      bookmarksInPassage(first, transcript.bookmarks ?? []),
      paintWith(pressed),
    )
    const ribbon = firstOf(
      allOf(painted),
      element =>
        propsOf(element)['accessibilityLabel'] === 'Bookmark at 0:01' &&
        element.type === 'Text',
    )
    expect(wordsOf(wordElement(painted, 'the'))).toBe(`${wordsOf(ribbon)}the `)
    const note = firstOf(hostsOf(painted, 'Pressable'), element =>
      wordsOf(element).includes('the stairs again'),
    )
    callProp(note, 'onPress')
    expect(Array.map(pressed, button => button.action)).toEqual([
      'OpenBookmark:b1',
    ])
  })
})

describe('where the word being read is', () => {
  it('counts how far into a passage a word starts, after its time', () => {
    expect(wordOffsetIn(first.words, 'p0w0', 6)).toEqual(Option.some(6))
    expect(wordOffsetIn(first.words, 'p0w2', 6)).toEqual(
      Option.some(6 + 'The '.length + 'keeper '.length),
    )
    expect(wordOffsetIn(first.words, 'nope', 6)).toEqual(Option.none())
  })

  it('finds the line of laid-out text a word falls on', () => {
    const lines = [
      { text: '0:00  The keeper ' },
      { text: 'climbed the ' },
      { text: 'stairs' },
    ]
    expect(lineOfOffset(lines, 6)).toBe(0)
    expect(lineOfOffset(lines, 17)).toBe(1)
    expect(lineOfOffset(lines, 29)).toBe(2)
    expect(lineOfOffset(lines, 400)).toBe(2)
    expect(lineOfOffset([], 3)).toBe(0)
  })

  it('leaves a word alone while it is in the middle half of the view', () => {
    expect(isNearMiddle({ place: 500, offset: 200, viewport: 600 })).toBe(true)
    expect(isNearMiddle({ place: 250, offset: 200, viewport: 600 })).toBe(false)
    expect(isNearMiddle({ place: 760, offset: 200, viewport: 600 })).toBe(false)
  })
})

describe('the menu on a word', () => {
  it('offers what the Program holds, presses what is picked, and closes through the Program', () => {
    const pressed: Array<ButtonNode> = []
    const sheet = WordMenuSheet({
      wordText: 'lamp',
      paint: paintWith(pressed),
      menu: {
        token: 'p0w1',
        dismissAction: 'CloseWordMenu',
        items: [
          {
            action: 'PlayFromWord:p0w1',
            label: 'Play from here',
            icon: 'Play',
          },
          {
            action: 'CopyWordLink:p0w1',
            label: 'Copy link to this word',
            icon: 'Link',
          },
        ],
      },
    })
    const item = firstOf(
      hostsOf(sheet, 'Pressable'),
      element =>
        propsOf(element)['accessibilityLabel'] === 'Copy link to this word',
    )
    callProp(item, 'onPress')
    const outside = firstOf(
      hostsOf(sheet, 'Pressable'),
      element => propsOf(element)['accessibilityLabel'] === 'Close',
    )
    callProp(outside, 'onPress')
    expect(Array.map(pressed, button => button.action)).toEqual([
      'CopyWordLink:p0w1',
      'CloseWordMenu',
    ])
    expect(wordsOf(sheet)).toContain('“lamp”')
  })
})
