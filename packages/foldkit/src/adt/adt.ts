import { Schema as S } from 'effect'

/**
 * A string with at least one character. `""` is not a value.
 */
export const NonEmptyString = S.NonEmptyString

/**
 * A string with at least one character. `""` is not a value.
 */
export type NonEmptyString = typeof NonEmptyString.Type

/**
 * A string with no leading or trailing whitespace and at least one
 * character. Whitespace-only text is not a value.
 */
export const TrimmedNonEmptyString = S.Trimmed.check(S.isNonEmpty())

/**
 * A string with no leading or trailing whitespace and at least one
 * character. Whitespace-only text is not a value.
 */
export type TrimmedNonEmptyString = typeof TrimmedNonEmptyString.Type

/**
 * An array that must contain at least one member.
 */
export const NonEmptyArray = S.NonEmptyArray

/**
 * An array that must contain at least one member.
 */
export type NonEmptyArray<A> = readonly [A, ...Array<A>]

/**
 * A readonly array that must contain at least one member.
 */
export const NonEmptyReadonlyArray = S.NonEmptyArray

/**
 * A readonly array that must contain at least one member.
 */
export type NonEmptyReadonlyArray<A> = readonly [A, ...ReadonlyArray<A>]

/**
 * An integer greater than zero. `0` is not a value.
 */
export const PositiveInt = S.Int.check(S.isGreaterThan(0))

/**
 * An integer greater than zero. `0` is not a value.
 */
export type PositiveInt = typeof PositiveInt.Type

/**
 * An integer greater than or equal to zero.
 */
export const NonNegativeInt = S.Int.check(S.isGreaterThanOrEqualTo(0))

/**
 * An integer greater than or equal to zero.
 */
export type NonNegativeInt = typeof NonNegativeInt.Type

/**
 * A finite number. `NaN` and `Infinity` are not values.
 */
export const FiniteNumber = S.Finite

/**
 * A finite number. `NaN` and `Infinity` are not values.
 */
export type FiniteNumber = typeof FiniteNumber.Type

/**
 * A finite number in the closed interval `[0, 1]`.
 */
export const UnitInterval = S.Finite.check(
  S.isGreaterThanOrEqualTo(0),
  S.isLessThanOrEqualTo(1),
)

/**
 * A finite number in the closed interval `[0, 1]`.
 */
export type UnitInterval = typeof UnitInterval.Type
