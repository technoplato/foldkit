import { Schema as S } from 'effect'

// NUMBER

/**
 * A counter's identity: the number it was added with, `3` for Counter 3.
 * Branded, so a count can never stand in for a counter: passing `5` where
 * a CounterId goes does not compile.
 */
export const CounterId = S.Int.check(S.isGreaterThanOrEqualTo(1)).pipe(
  S.brand('CounterId'),
)
/** A counter's identity. */
export type CounterId = typeof CounterId.Type

/** The number the first counter gets. */
export const firstCounterId = CounterId.make(1)

/** A counter's number as one URI segment, `3` in `/counters/3`. */
export const CounterIdSegment = S.FiniteFromString.pipe(S.decodeTo(CounterId))

/** How a counter is named in titles and sentences, `Counter 3`. */
export const counterName = (counterId: CounterId): string =>
  `Counter ${counterId.toString()}`
