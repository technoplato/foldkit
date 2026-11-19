import { describe, expect, it } from 'vitest'

import {
  estimatedTopOf,
  heightPerWordOf,
  readerWindow,
} from './transcriptWindow.js'

const entries = [
  { key: 'a', wordCount: 70 },
  { key: 'b', wordCount: 70 },
  { key: 'c', wordCount: 35 },
  { key: 'd', wordCount: 70 },
]

// 350 pixels for 70 words: 5 a word.
const heights = new Map([['a', 350]])

describe('where a passage that is not laid out probably is', () => {
  it('is under a laid-out passage before it, by the heights and words between', () => {
    expect(estimatedTopOf(entries, heights, { index: 0, y: 100 }, 3, 40)).toBe(
      100 + 350 + 350 + 175,
    )
  })

  it('is above a laid-out passage after it, the same way', () => {
    expect(
      estimatedTopOf(entries, heights, { index: 3, y: 2_000 }, 1, 40),
    ).toBe(2_000 - 175 - 350)
  })

  it('uses a height it has seen before over a guess from the words', () => {
    const seen = new Map([
      ['a', 350],
      ['b', 500],
    ])
    expect(estimatedTopOf(entries, seen, { index: 0, y: 0 }, 2, 40)).toBe(850)
  })

  it('is counted from the top of the words when no passage is laid out', () => {
    const perWord = heightPerWordOf(entries, new Map())
    expect(estimatedTopOf(entries, new Map(), undefined, 2, 40)).toBe(
      40 + 140 * perWord,
    )
  })

  it('is the laid-out passage’s own place when that is the one asked for', () => {
    expect(estimatedTopOf(entries, heights, { index: 2, y: 900 }, 2, 40)).toBe(
      900,
    )
  })

  it('never loses its way on a passage it was not given', () => {
    expect(estimatedTopOf(entries, new Map(), undefined, 9, 40)).toBe(40)
  })
})

describe('how much of a long chapter a reader lays out', () => {
  it('is a few screens around what is in sight, not the chapter', () => {
    expect(readerWindow.windowSize).toBeLessThanOrEqual(7)
    expect(readerWindow.initialNumToRender).toBeLessThanOrEqual(10)
  })
})
