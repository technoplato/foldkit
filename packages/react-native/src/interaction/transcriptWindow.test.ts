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

describe('where a passage that is not on screen yet probably is', () => {
  it('is where it was measured, once it has been', () => {
    const measured = new Map([['c', { y: 900, height: 160 }]])
    expect(estimatedTopOf(entries, measured, 2, 100)).toBe(900)
  })

  it('is under the nearest measured passage before it, by the words between', () => {
    const measured = new Map([['a', { y: 100, height: 350 }]])
    // 350 pixels for 70 words: 5 a word. b is 70 words, c 35.
    expect(estimatedTopOf(entries, measured, 3, 100)).toBe(
      100 + 350 + 350 + 175,
    )
  })

  it('is counted from the top of the words when nothing before it was measured', () => {
    const measured = new Map<string, { y: number; height: number }>()
    const perWord = heightPerWordOf(entries, measured)
    expect(estimatedTopOf(entries, measured, 2, 40)).toBe(40 + 140 * perWord)
  })

  it('never loses its way on a passage it was not given', () => {
    expect(estimatedTopOf(entries, new Map(), 9, 40)).toBe(40)
  })
})

describe('how much of a long chapter a reader lays out', () => {
  it('is a few screens around what is in sight, not the chapter', () => {
    expect(readerWindow.windowSize).toBeLessThanOrEqual(7)
    expect(readerWindow.initialNumToRender).toBeLessThanOrEqual(10)
  })
})
