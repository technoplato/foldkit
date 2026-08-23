import { Duration, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Exhausted,
  Quota,
  Read,
  Remaining,
  decodeRemaining,
  sampleRead,
} from './model.js'

describe('Quota', () => {
  it('inhabits Remaining when left is at least 1 and does not exceed capacity', () => {
    const remaining = Remaining({
      left: 1,
      capacity: 1,
      resets: Duration.millis(1_000),
    })
    expect(remaining._tag).toBe('Remaining')
    expect(remaining.left).toBe(1)
    expect(remaining.capacity).toBe(1)
  })

  it('rejects Remaining when left is 0', () => {
    expect(
      Option.isNone(
        decodeRemaining({
          _tag: 'Remaining',
          left: 0,
          capacity: 10,
          resets: 1_000,
        }),
      ),
    ).toBe(true)
  })

  it('rejects Remaining when left exceeds capacity', () => {
    expect(
      Option.isNone(
        decodeRemaining({
          _tag: 'Remaining',
          left: 11,
          capacity: 10,
          resets: 1_000,
        }),
      ),
    ).toBe(true)
  })

  it('inhabits Exhausted without a left field', () => {
    const exhausted = Exhausted({
      capacity: 20,
      resets: Duration.millis(2_000),
    })
    expect(exhausted._tag).toBe('Exhausted')
    expect(exhausted.capacity).toBe(20)
    expect('left' in exhausted).toBe(false)
    const encoded = S.encodeUnknownSync(Quota)(exhausted)
    expect(S.decodeUnknownSync(Quota)(encoded)).toEqual(exhausted)
  })

  it('round-trips sample Read through Schema encode and decode', () => {
    const encoded = S.encodeUnknownSync(Read)(sampleRead)
    expect(S.decodeUnknownSync(Read)(encoded)).toEqual(sampleRead)
  })
})
