import { Schema as S } from 'effect'

// IDS

/**
 * A place in a recording, in milliseconds from its start. Branded, so a
 * count or a speed never stands in for a place.
 */
export const Milliseconds = S.Int.check(S.isGreaterThanOrEqualTo(0)).pipe(
  S.brand('Milliseconds'),
)
/** A place in a recording, in milliseconds from its start. */
export type Milliseconds = typeof Milliseconds.Type

/** A place as one word in a press tag or a CLI command, `723000`. */
export const MillisecondsSegment = S.FiniteFromString.pipe(
  S.decodeTo(Milliseconds),
)

/**
 * A recording's id as its source names it, such as the rendition id of an
 * audiobook. Branded, so a word id never stands in for it.
 */
export const MediaId = S.String.check(S.isMinLength(1)).pipe(S.brand('MediaId'))
/** A recording's id. */
export type MediaId = typeof MediaId.Type

/**
 * One word's id, stable across its whole recording, `w4012`, so a link to
 * a word keeps working. Only letters, digits, `.`, `_`, and `-`, so it
 * reads as one word in a press tag, a URI, and a CLI command.
 */
export const WordId = S.String.check(S.isPattern(/^[A-Za-z0-9._-]+$/)).pipe(
  S.brand('WordId'),
)
/** One word's id. */
export type WordId = typeof WordId.Type

/**
 * The speeds the player offers, as a person picks them: `1.5` plays half
 * again as fast.
 */
export const Speed = S.Literals([0.75, 1, 1.25, 1.5, 2])
/** A playback speed. */
export type Speed = typeof Speed.Type

/** A speed as a CLI word and a menu token, `1.5`. */
export const SpeedToken = S.FiniteFromString.pipe(S.decodeTo(Speed))

const millisecondsPerSecond = 1000
const secondsPerMinute = 60
const minutesPerHour = 60

const twoDigits = (value: number): string => value.toString().padStart(2, '0')

/**
 * A place as a person reads it: `12:03` under an hour, `1:02:03` past one.
 *
 * @example
 * ```typescript
 * clockOf(Milliseconds.make(723_000)) // '12:03'
 * clockOf(Milliseconds.make(3_723_000)) // '1:02:03'
 * ```
 */
export const clockOf = (place: Milliseconds): string => {
  const totalSeconds = Math.floor(place / millisecondsPerSecond)
  const seconds = totalSeconds % secondsPerMinute
  const totalMinutes = Math.floor(totalSeconds / secondsPerMinute)
  const minutes = totalMinutes % minutesPerHour
  const hours = Math.floor(totalMinutes / minutesPerHour)
  return hours > 0
    ? `${hours.toString()}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${minutes.toString()}:${twoDigits(seconds)}`
}
