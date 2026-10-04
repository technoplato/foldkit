import { Schema as S } from 'effect'

// IDS

/**
 * A title's name tag in every address and command: `the-lantern-keeper`
 * in `/books/the-lantern-keeper` and `books play the-lantern-keeper`.
 * Branded, so a plain string cannot pass for a title.
 */
export const TitleSlug = S.String.check(
  S.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
).pipe(S.brand('TitleSlug'))
/** A title's name tag. */
export type TitleSlug = typeof TitleSlug.Type

/**
 * A chapter's place in its title, `3` for Chapter 3. Branded, so a count
 * or a millisecond can never stand in for a chapter.
 */
export const ChapterNumber = S.Int.check(S.isGreaterThanOrEqualTo(1)).pipe(
  S.brand('ChapterNumber'),
)
/** A chapter's place in its title. */
export type ChapterNumber = typeof ChapterNumber.Type

/** A chapter number as one URI segment or CLI word, `3` in `/chapters/3`. */
export const ChapterNumberSegment = S.FiniteFromString.pipe(
  S.decodeTo(ChapterNumber),
)

/**
 * A place in a title, in milliseconds from its start. Branded, so a
 * chapter number or a speed never stands in for a place.
 */
export const Milliseconds = S.Int.check(S.isGreaterThanOrEqualTo(0)).pipe(
  S.brand('Milliseconds'),
)
/** A place in a title, in milliseconds from its start. */
export type Milliseconds = typeof Milliseconds.Type

/** A bookmark's id, as the library store names it. */
export const BookmarkId = S.String.check(S.isMinLength(1)).pipe(
  S.brand('BookmarkId'),
)
/** A bookmark's id. */
export type BookmarkId = typeof BookmarkId.Type

/**
 * The speeds a player offers, as a person picks them: `1.5` plays half
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
