import { describe, expect, test } from 'vitest'

import { bufferedRangesOf } from './copyAudio.js'

const timeRanges = (
  stretches: ReadonlyArray<readonly [number, number]>,
): Pick<TimeRanges, 'length' | 'start' | 'end'> => {
  const at = (index: number, side: 0 | 1): number => {
    const stretch = stretches.at(index)
    if (stretch === undefined) {
      throw new DOMException(
        `The index provided (${index}) is greater than or equal to the maximum bound (${stretches.length}).`,
        'IndexSizeError',
      )
    } else {
      return stretch[side]
    }
  }
  return {
    length: stretches.length,
    start: index => at(index, 0),
    end: index => at(index, 1),
  }
}

describe("the live copy's buffered stretches (#1299)", () => {
  test('an empty buffer is no stretch, never a read of stretch 0', () => {
    expect(bufferedRangesOf(timeRanges([]))).toEqual([])
  })

  test('reads every stretch the browser holds, in order', () => {
    expect(
      bufferedRangesOf(
        timeRanges([
          [18.01, 150.02],
          [300, 306.02],
        ]),
      ),
    ).toEqual([
      { startSeconds: 18.01, endSeconds: 150.02 },
      { startSeconds: 300, endSeconds: 306.02 },
    ])
  })
})
