import {
  Effect,
  Option,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
} from 'effect'

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

const clockPattern = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/u

const unitsPattern = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u

const millisecondsPerClockSecond = 1000

const secondsPerClockMinute = 60

const secondsPerClockHour = 3600

const placeOfParts = (
  hours: string,
  minutes: string,
  seconds: string,
): number =>
  (Number(hours) * secondsPerClockHour +
    Number(minutes) * secondsPerClockMinute +
    Number(seconds)) *
  millisecondsPerClockSecond

const placeOfSegment = (input: string): Option.Option<number> => {
  const clock = clockPattern.exec(input)
  const units = unitsPattern.exec(input)
  if (clock !== null) {
    const [, hours = '0', minutes = '0', seconds = '0'] = clock
    return Option.some(placeOfParts(hours, minutes, seconds))
  } else if (units !== null && input !== '') {
    const [, hours = '0', minutes = '0', seconds = '0'] = units
    return Option.some(placeOfParts(hours, minutes, seconds))
  } else {
    return Option.none()
  }
}

/**
 * A place as one URI segment or CLI word, in hours, minutes, and seconds:
 * `4h54m06s` is 4 hours 54 minutes 6 seconds in, `12m03s` is 12 minutes 3
 * seconds, `7s` is 7 seconds. It reads a clock too, `4:54:06`. It keeps
 * whole seconds, so a link names the second someone was listening to.
 *
 * @example
 * ```typescript
 * S.decodeUnknownSync(PlaceSegment)('4h54m06s') // 17646000
 * S.decodeUnknownSync(PlaceSegment)('12:03') // 723000
 * S.encodeSync(PlaceSegment)(Milliseconds.make(723_400)) // '12m03s'
 * ```
 */
export const PlaceSegment = S.String.pipe(
  S.decodeTo(
    Milliseconds,
    SchemaTransformation.transformOrFail({
      decode: input =>
        Option.match(placeOfSegment(input), {
          onNone: () =>
            Effect.fail(
              new SchemaIssue.InvalidValue(Option.some(input), {
                description: `Expected a place such as 12m03s or 4h54m06s, got ${JSON.stringify(input)}`,
              }),
            ),
          onSome: placeMs => Effect.succeed(placeMs),
        }),
      encode: placeMs => Effect.succeed(segmentOfPlace(placeMs)),
    }),
  ),
)

const segmentOfPlace = (placeMs: number): string => {
  const totalSeconds = Math.floor(placeMs / millisecondsPerClockSecond)
  const seconds = totalSeconds % secondsPerClockMinute
  const totalMinutes = Math.floor(totalSeconds / secondsPerClockMinute)
  const minutes = totalMinutes % secondsPerClockMinute
  const hours = Math.floor(totalMinutes / secondsPerClockMinute)
  if (hours > 0) {
    return `${hours.toString()}h${twoDigits(minutes)}m${twoDigits(seconds)}s`
  } else if (minutes > 0) {
    return `${minutes.toString()}m${twoDigits(seconds)}s`
  } else {
    return `${seconds.toString()}s`
  }
}
