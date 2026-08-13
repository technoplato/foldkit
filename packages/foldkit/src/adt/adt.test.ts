import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  FiniteNumber,
  NonEmptyArray,
  NonEmptyReadonlyArray,
  NonEmptyString,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
  UnitInterval,
} from './adt.js'

const isFailure = (schema: S.Top, value: unknown): boolean =>
  S.decodeUnknownExit(schema)(value)._tag === 'Failure'

const isSuccess = (schema: S.Top, value: unknown): boolean =>
  S.decodeUnknownExit(schema)(value)._tag === 'Success'

describe('NonEmptyString', () => {
  it('constructs a non-empty string', () => {
    expect(NonEmptyString.make('hello')).toBe('hello')
  })

  it('rejects an empty string', () => {
    expect(isFailure(NonEmptyString, '')).toBe(true)
    expect(isSuccess(NonEmptyString, 'x')).toBe(true)
  })
})

describe('TrimmedNonEmptyString', () => {
  it('constructs trimmed non-empty text', () => {
    expect(TrimmedNonEmptyString.make('hello')).toBe('hello')
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(isFailure(TrimmedNonEmptyString, '')).toBe(true)
    expect(isFailure(TrimmedNonEmptyString, '   ')).toBe(true)
    expect(isFailure(TrimmedNonEmptyString, ' hello')).toBe(true)
    expect(isSuccess(TrimmedNonEmptyString, 'hello')).toBe(true)
  })
})

describe('NonEmptyArray', () => {
  const Numbers = NonEmptyArray(S.Number)

  it('constructs a list with one or more members', () => {
    expect(Numbers.make([1])).toEqual([1])
  })

  it('rejects an empty list', () => {
    expect(isFailure(Numbers, [])).toBe(true)
    expect(isSuccess(Numbers, [1])).toBe(true)
  })
})

describe('NonEmptyReadonlyArray', () => {
  const Labels = NonEmptyReadonlyArray(S.String)

  it('rejects an empty list', () => {
    expect(isFailure(Labels, [])).toBe(true)
    expect(isSuccess(Labels, ['a'])).toBe(true)
  })
})

describe('PositiveInt', () => {
  it('constructs an integer greater than zero', () => {
    expect(PositiveInt.make(1)).toBe(1)
  })

  it('rejects zero, negatives, and non-integers', () => {
    expect(isFailure(PositiveInt, 0)).toBe(true)
    expect(isFailure(PositiveInt, -1)).toBe(true)
    expect(isFailure(PositiveInt, 1.5)).toBe(true)
    expect(isSuccess(PositiveInt, 1)).toBe(true)
  })
})

describe('NonNegativeInt', () => {
  it('accepts zero and rejects negatives', () => {
    expect(NonNegativeInt.make(0)).toBe(0)
    expect(isFailure(NonNegativeInt, -1)).toBe(true)
    expect(isSuccess(NonNegativeInt, 2)).toBe(true)
  })
})

describe('FiniteNumber', () => {
  it('rejects NaN and Infinity', () => {
    expect(isFailure(FiniteNumber, Number.NaN)).toBe(true)
    expect(isFailure(FiniteNumber, Number.POSITIVE_INFINITY)).toBe(true)
    expect(isFailure(FiniteNumber, Number.NEGATIVE_INFINITY)).toBe(true)
    expect(isSuccess(FiniteNumber, 1.25)).toBe(true)
  })
})

describe('UnitInterval', () => {
  it('accepts the closed unit interval and rejects outside it', () => {
    expect(UnitInterval.make(0)).toBe(0)
    expect(UnitInterval.make(1)).toBe(1)
    expect(isFailure(UnitInterval, -0.1)).toBe(true)
    expect(isFailure(UnitInterval, 1.1)).toBe(true)
    expect(isFailure(UnitInterval, Number.NaN)).toBe(true)
    expect(isSuccess(UnitInterval, 0.5)).toBe(true)
  })
})
