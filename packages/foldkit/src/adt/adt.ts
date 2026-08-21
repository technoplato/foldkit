import { Schema as S } from 'effect'

/**
 * A string with at least one character. `""` is not a value.
 */
export const NonEmptyString = S.NonEmptyString

/**
 * A string with no leading or trailing whitespace and at least one
 * character. Whitespace-only text is not a value.
 */
export const TrimmedNonEmptyString = S.NonEmptyString.check(S.isTrimmed())

/**
 * An integer greater than zero. `0` is not a value.
 */
export const PositiveInt = S.Int.check(S.isGreaterThan(0))

/**
 * An integer greater than or equal to zero.
 */
export const NonNegativeInt = S.Int.check(S.isGreaterThanOrEqualTo(0))

/**
 * A finite number. `NaN` and `Infinity` are not values.
 */
export const FiniteNumber = S.Finite

/**
 * A finite number in the closed interval `[0, 1]`.
 */
export const UnitInterval = S.Finite.check(
  S.isGreaterThanOrEqualTo(0),
  S.isLessThanOrEqualTo(1),
)
