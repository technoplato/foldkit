import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Milliseconds, PlaceSegment, WordSegment } from './ids.js'

const placeOf = S.decodeUnknownSync(PlaceSegment)

const wordSegmentOf = (placeMs: number): string =>
  S.encodeSync(WordSegment)(Milliseconds.make(placeMs))

describe('a place in an address', () => {
  it('reads the whole-second links there have always been', () => {
    expect(placeOf('12m03s')).toBe(723_000)
    expect(placeOf('4h54m06s')).toBe(17_646_000)
    expect(placeOf('7s')).toBe(7_000)
    expect(placeOf('12:03')).toBe(723_000)
  })

  it('reads a place to the millisecond, so a link can open on one word', () => {
    expect(placeOf('12m03.45s')).toBe(723_450)
    expect(placeOf('7.5s')).toBe(7_500)
    expect(placeOf('1h00m00.001s')).toBe(3_600_001)
  })

  it('prints the second someone is listening to, as before', () => {
    expect(S.encodeSync(PlaceSegment)(Milliseconds.make(723_450))).toBe(
      '12m03s',
    )
  })
})

describe('the address of a word', () => {
  it('prints the time the word starts to the millisecond, and a whole second plainly', () => {
    expect(wordSegmentOf(723_450)).toBe('12m03.45s')
    expect(wordSegmentOf(7_500)).toBe('7.5s')
    expect(wordSegmentOf(3_600_001)).toBe('1h00m00.001s')
    expect(wordSegmentOf(723_000)).toBe('12m03s')
  })

  it('reads back to the same millisecond, and reads every whole-second link', () => {
    for (const placeMs of [0, 1, 999, 7_500, 723_450, 3_600_001, 59_017_882]) {
      expect(S.decodeUnknownSync(WordSegment)(wordSegmentOf(placeMs))).toBe(
        placeMs,
      )
    }
    expect(S.decodeUnknownSync(WordSegment)('12m03s')).toBe(723_000)
  })
})
