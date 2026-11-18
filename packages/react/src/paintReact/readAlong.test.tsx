import {
  type ButtonNode,
  List,
  Seek,
  TextInput,
  Transcript,
  type TranscriptNode,
} from 'foldkit/renderers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { paintTree } from './paintReact.js'

const wordsOf = (
  prefix: string,
  texts: ReadonlyArray<string>,
  firstStartMs: number,
) =>
  texts.map((text, index) => ({
    token: `${prefix}${index.toString()}`,
    text,
    startMs: firstStartMs + index * 300,
  }))

const lighthouse = (
  extra: Partial<TranscriptNode> = {},
  currentToken = 'a1',
): TranscriptNode => ({
  ...Transcript({
    label: 'Transcript',
    action: 'SeekToWord',
    emptyText: 'No words yet.',
    clock: { placeMs: 9_700, atMs: 0, rate: 0 },
    leaveAction: 'LeavePlayhead',
    wordMenuAction: 'ShowWordMenu',
    passages: [
      {
        key: 'a',
        label: '0:09',
        isCurrent: true,
        words: wordsOf('a', ['The', 'lamp', 'was', 'lit'], 9_400).map(word =>
          word.token === currentToken ? { ...word, isCurrent: true } : word,
        ),
      },
      {
        key: 'b',
        label: '0:10',
        words: wordsOf('b', ['Gulls', 'settled', 'lamp'], 10_600),
      },
    ],
  }),
  ...extra,
})

const pressed = () => vi.fn<(button: ButtonNode) => void>()

const pressesOf = (
  onPress: ReturnType<typeof pressed>,
): ReadonlyArray<string> =>
  onPress.mock.calls.map(([button]) => button.action ?? '')

const scrolledInto: Array<string> = []

beforeEach(() => {
  scrolledInto.length = 0
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolledInto.push(this.getAttribute('data-token') ?? '')
  }
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('what a search found, in the words', () => {
  it('marks each word found and the match a person is on, and repaints when the marks change', () => {
    const onPress = pressed()
    const marked = (mark: 'Found' | 'Selected') =>
      lighthouse({
        passages: lighthouse().passages.map(passage =>
          passage.key === 'b'
            ? {
                ...passage,
                words: passage.words.map(word =>
                  word.token === 'b2' ? { ...word, mark } : word,
                ),
              }
            : passage,
        ),
      })
    const { container, rerender } = render(paintTree(lighthouse(), { onPress }))
    expect(container.querySelectorAll('.fk-word[data-mark]').length).toBe(0)
    rerender(paintTree(marked('Found'), { onPress }))
    expect(
      Array.from(container.querySelectorAll('.fk-word[data-mark]'), word => [
        word.getAttribute('data-token'),
        word.getAttribute('data-mark'),
      ]),
    ).toEqual([['b2', 'Found']])
    rerender(paintTree(marked('Selected'), { onPress }))
    expect(
      container.querySelector('[data-token="b2"]')?.getAttribute('data-mark'),
    ).toBe('Selected')
  })
})

describe('the view and the word sounding', () => {
  it('keeps the word sounding in view while the words follow it', () => {
    const onPress = pressed()
    const { rerender } = render(paintTree(lighthouse(), { onPress }))
    rerender(paintTree(lighthouse({}, 'a3'), { onPress }))
    expect(scrolledInto).toContain('a3')
  })

  it('leaves the view where it is while a person reads elsewhere, and comes back when they return', () => {
    const onPress = pressed()
    const { rerender } = render(
      paintTree(lighthouse({ isFollowing: false }), { onPress }),
    )
    rerender(paintTree(lighthouse({ isFollowing: false }, 'a3'), { onPress }))
    expect(scrolledInto).toEqual([])
    rerender(paintTree(lighthouse({ isFollowing: true }, 'a3'), { onPress }))
    expect(scrolledInto).toEqual(['a3'])
  })

  it('brings the word a person stepped to into view, once, without following the word sounding', () => {
    const onPress = pressed()
    const atMatch = (currentToken: string) =>
      lighthouse({ isFollowing: false, focusToken: 'b2' }, currentToken)
    const { rerender } = render(paintTree(atMatch('a1'), { onPress }))
    expect(scrolledInto).toEqual(['b2'])
    rerender(paintTree(atMatch('a2'), { onPress }))
    rerender(paintTree(atMatch('a3'), { onPress }))
    expect(scrolledInto).toEqual(['b2'])
  })

  it('tells the Program when a person scrolls the word sounding out of the middle, and not while it stays there', () => {
    vi.useFakeTimers()
    const onPress = pressed()
    const { container } = render(paintTree(lighthouse(), { onPress }))
    const word = container.querySelector('[data-token="a1"]')
    const place = (top: number): void => {
      if (word !== null) {
        word.getBoundingClientRect = () => new DOMRect(0, top, 60, 20)
      }
    }
    place(380)
    fireEvent.wheel(window)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(pressesOf(onPress)).toEqual([])
    place(-900)
    fireEvent.wheel(window)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(pressesOf(onPress)).toEqual(['LeavePlayhead'])
  })

  it('does not tell a Program that named no leave action, as before', () => {
    vi.useFakeTimers()
    const onPress = pressed()
    const { leaveAction: _leaveAction, ...plain } = lighthouse()
    render(paintTree(plain, { onPress }))
    fireEvent.wheel(window)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(pressesOf(onPress)).toEqual([])
  })
})

describe('a word’s menu', () => {
  it('asks the Program for a word’s menu on a secondary click, in place of the browser’s own', () => {
    const onPress = pressed()
    const { container } = render(paintTree(lighthouse(), { onPress }))
    const lamp = container.querySelector('[data-token="a1"]')
    expect(lamp).not.toBeNull()
    const wasNotPrevented = lamp === null ? true : fireEvent.contextMenu(lamp)
    expect(wasNotPrevented).toBe(false)
    expect(pressesOf(onPress)).toEqual(['ShowWordMenu:a1'])
  })

  it('asks for it on a long press with a finger, and does not play the word under the finger', () => {
    vi.useFakeTimers()
    const onPress = pressed()
    const { container } = render(paintTree(lighthouse(), { onPress }))
    const lamp = container.querySelector('[data-token="a1"]')
    if (lamp === null) {
      throw new Error('no word')
    }
    fireEvent.pointerDown(lamp, {
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(lamp, { pointerType: 'touch' })
    fireEvent.click(lamp)
    expect(pressesOf(onPress)).toEqual(['ShowWordMenu:a1'])
    fireEvent.click(lamp)
    expect(pressesOf(onPress)).toEqual(['ShowWordMenu:a1', 'SeekToWord:a1'])
  })

  it('draws the menu the Program holds, presses what a person picks, and closes on Escape or a press outside', () => {
    const onPress = pressed()
    render(
      paintTree(
        lighthouse({
          wordMenu: {
            token: 'a1',
            dismissAction: 'CloseWordMenu',
            items: [
              {
                action: 'SeekToWord:a1',
                label: 'Play from here',
                icon: 'Play',
              },
              {
                action: 'CopyWordLink:a1',
                label: 'Copy link to this word',
                icon: 'Link',
              },
            ],
          },
        }),
        { onPress },
      ),
    )
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('aria-label')).toBe('lamp')
    expect(
      screen.getAllByRole('menuitem').map(item => item.textContent),
    ).toEqual(['Play from here', 'Copy link to this word'])
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy link/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    const outside = document.querySelector('.fk-word-menu-backdrop')
    if (outside !== null) {
      fireEvent.click(outside)
    }
    expect(pressesOf(onPress)).toEqual([
      'CopyWordLink:a1',
      'CloseWordMenu',
      'CloseWordMenu',
    ])
  })

  it('draws no menu while the Program holds none', () => {
    render(paintTree(lighthouse(), { onPress: vi.fn() }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('dragging the seek bar', () => {
  const bar = Seek({
    value: 0,
    max: 60_000,
    step: 1000,
    action: 'SeekTo',
    label: 'Place in the recording',
    valueText: '0:00 of 1:00',
    landings: [
      { value: 0, text: '0:00 · The lamp was lit at dusk.' },
      { value: 12_000, text: '0:12 · Gulls settled on the lamp rail.' },
    ],
  })

  it('names the paragraph the drag will land on, until it is let go', () => {
    const onPress = pressed()
    const { container } = render(paintTree(bar, { onPress }))
    const input = screen.getByRole('slider')
    expect(container.querySelector('.fk-seek-landing')).toBeNull()
    fireEvent.input(input, { target: { value: '20000' } })
    expect(container.querySelector('.fk-seek-landing')?.textContent).toBe(
      '0:12 · Gulls settled on the lamp rail.',
    )
    expect(pressesOf(onPress)).toEqual([])
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pressesOf(onPress)).toEqual(['SeekTo:20000'])
    expect(container.querySelector('.fk-seek-landing')).toBeNull()
  })

  it('shows nothing for a bar that names no landings', () => {
    const { container } = render(
      paintTree(
        Seek({
          value: 0,
          max: 60_000,
          action: 'SeekTo',
          label: 'Place',
          valueText: '0:00 of 1:00',
        }),
        { onPress: vi.fn() },
      ),
    )
    fireEvent.input(screen.getByRole('slider'), { target: { value: '20000' } })
    expect(container.querySelector('.fk-seek-landing')).toBeNull()
  })
})

describe('a match in a list', () => {
  it('sets the words found apart inside the row’s title', () => {
    const { container } = render(
      paintTree(
        List({
          label: 'Matches',
          items: [
            {
              key: '11600',
              title: 'The keeper lit the lamp at dusk.',
              titleMark: { start: 19, end: 23 },
              lines: ['0:11 · The Light'],
              action: 'ShowMatch:11600',
            },
          ],
        }),
        { onPress: pressed() },
      ),
    )
    const title = container.querySelector('.fk-item-title')
    expect(title?.textContent).toBe('The keeper lit the lamp at dusk.')
    expect(container.querySelector('.fk-item-mark')?.textContent).toBe('lamp')
  })
})

describe('a search field', () => {
  it('presses the again action when Enter is pressed on words already searched for', () => {
    const onPress = pressed()
    render(
      paintTree(
        TextInput({
          value: 'lamp',
          label: 'Search the words',
          action: 'SearchFor',
          clearAction: 'ClearSearch',
          againAction: 'NextMatch',
        }),
        { onPress },
      ),
    )
    const field = screen.getByLabelText('Search the words')
    fireEvent.submit(field)
    fireEvent.submit(field)
    expect(pressesOf(onPress)).toEqual(['NextMatch', 'NextMatch'])
    fireEvent.change(field, { target: { value: 'lamp rail' } })
    fireEvent.submit(field)
    expect(pressesOf(onPress)).toEqual([
      'NextMatch',
      'NextMatch',
      'SearchFor:lamp rail',
    ])
  })
})
