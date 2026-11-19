import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { sharedWith } from './shared.js'

const passage = (key: string, words: ReadonlyArray<string>) => ({
  key,
  words: words.map(text => ({ token: `${key}-${text}`, text })),
})

describe('a view tree that keeps what did not change', () => {
  it('hands back the very tree it had when the next one is equal', () => {
    const previous = { passages: [passage('a', ['The', 'lamp'])] }
    const next = { passages: [passage('a', ['The', 'lamp'])] }
    expect(sharedWith(previous, next)).toBe(previous)
  })

  it('keeps each part that is equal and takes only the parts that changed', () => {
    const previous = {
      place: 1000,
      passages: [passage('a', ['The', 'lamp']), passage('b', ['was', 'lit'])],
    }
    const next = {
      place: 2000,
      passages: [passage('a', ['The', 'lamp']), passage('b', ['was', 'out'])],
    }

    const shared = sharedWith(previous, next)

    expect(shared).toEqual(next)
    expect(shared).not.toBe(previous)
    expect(shared.passages[0]).toBe(previous.passages[0])
    expect(shared.passages[1]).not.toBe(previous.passages[1])
    expect(shared.passages[1]?.words[0]).toBe(previous.passages[1]?.words[0])
  })

  it('keeps the parts in front when more are added behind them', () => {
    const previous = [passage('a', ['The']), passage('b', ['lamp'])]
    const next = [
      passage('a', ['The']),
      passage('b', ['lamp']),
      passage('c', []),
    ]
    const shared = sharedWith(previous, next)
    expect(shared).toHaveLength(3)
    expect(shared[0]).toBe(previous[0])
    expect(shared[1]).toBe(previous[1])
  })

  it('keeps a value that is equal by its own rule, such as an Option', () => {
    const previous = { maybeCover: Option.some('cover-1') }
    const next = { maybeCover: Option.some('cover-1') }
    expect(sharedWith(previous, next)).toBe(previous)
    expect(
      sharedWith(previous, { maybeCover: Option.some('cover-2') }),
    ).not.toBe(previous)
  })

  it('takes the next tree whole when there was none before, or it is of another kind', () => {
    const next = { passages: [] }
    expect(sharedWith(undefined, next)).toBe(next)
    expect(sharedWith([1, 2], next)).toBe(next)
    expect(sharedWith({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
  })
})
