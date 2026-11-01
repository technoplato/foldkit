import { Array, Option } from 'effect'

const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

const plural = (count: number, unit: string): string =>
  `${count.toString()} ${unit}${count === 1 ? '' : 's'}`

/**
 * How long ago a time was, the way a person says it: `just now`,
 * `5 min ago`, `3 h ago`, `1 day ago`, `3 months ago`. A time after `nowMs`
 * reads `in 5 min`.
 */
export const howLongAgo = (atMs: number, nowMs: number): string => {
  const elapsedMs = Math.abs(nowMs - atMs)
  const say = (amount: string): string =>
    atMs > nowMs ? `in ${amount}` : `${amount} ago`
  if (elapsedMs < MINUTE_MS) {
    return 'just now'
  } else if (elapsedMs < HOUR_MS) {
    return say(`${Math.floor(elapsedMs / MINUTE_MS).toString()} min`)
  } else if (elapsedMs < DAY_MS) {
    return say(`${Math.floor(elapsedMs / HOUR_MS).toString()} h`)
  } else if (elapsedMs < DAYS_PER_MONTH * DAY_MS) {
    return say(plural(Math.floor(elapsedMs / DAY_MS), 'day'))
  } else if (elapsedMs < DAYS_PER_YEAR * DAY_MS) {
    return say(
      plural(Math.floor(elapsedMs / (DAYS_PER_MONTH * DAY_MS)), 'month'),
    )
  }
  return say(plural(Math.floor(elapsedMs / (DAYS_PER_YEAR * DAY_MS)), 'year'))
}

const UTC = 'UTC'
const ISO_DATE_LENGTH = 10
const ISO_MINUTE_END = 16

/**
 * Offsets move only on whole quarter hours, so one reading of a zone's offset
 * holds for its whole quarter hour.
 */
const QUARTER_HOUR_MS = 15 * MINUTE_MS

const formats = new Map<string, Intl.DateTimeFormat>()

const formatIn = (timeZone: string): Intl.DateTimeFormat =>
  Option.getOrElse(Option.fromUndefinedOr(formats.get(timeZone)), () => {
    const format = Option.getOrElse(
      Option.liftThrowable(
        () =>
          new Intl.DateTimeFormat('en-US', {
            day: 'numeric',
            hour: 'numeric',
            hourCycle: 'h23',
            minute: 'numeric',
            month: 'numeric',
            timeZone,
            year: 'numeric',
          }),
      )(),
      () => formatIn(UTC),
    )
    formats.set(timeZone, format)
    return format
  })

const offsetsByZone = new Map<string, Map<number, number>>()

/**
 * The offset from UTC in minutes that `timeZone` had at `atMs`: -240 on
 * 2026-10-11 in `America/New_York`, -300 on 2026-11-02. Read once per quarter
 * hour of a zone, and kept.
 */
const offsetMinutesAt = (atMs: number, timeZone: string): number => {
  const quarterHour = Math.floor(atMs / QUARTER_HOUR_MS)
  const offsets = Option.getOrElse(
    Option.fromUndefinedOr(offsetsByZone.get(timeZone)),
    () => {
      const fresh = new Map<number, number>()
      offsetsByZone.set(timeZone, fresh)
      return fresh
    },
  )
  return Option.getOrElse(
    Option.fromUndefinedOr(offsets.get(quarterHour)),
    () => {
      const startMs = quarterHour * QUARTER_HOUR_MS
      const parts = formatIn(timeZone).formatToParts(startMs)
      const numberOf = (type: Intl.DateTimeFormatPartTypes): number =>
        Option.match(
          Array.findFirst(parts, part => part.type === type),
          { onNone: () => 0, onSome: part => Number(part.value) },
        )
      const asUtcMs = Date.UTC(
        numberOf('year'),
        numberOf('month') - 1,
        numberOf('day'),
        numberOf('hour'),
        numberOf('minute'),
      )
      const offset = Math.round((asUtcMs - startMs) / MINUTE_MS)
      offsets.set(quarterHour, offset)
      return offset
    },
  )
}

/**
 * A time on the reader's clock, `2026-10-11 10:10`, in the offset its own day
 * had in `timeZone`, such as `America/New_York`: the clocks move in March and
 * November, so a date before the change reads an hour apart from today's
 * offset. A zone the platform does not know reads UTC.
 */
export const localTimeLabel = (atMs: number, timeZone: string): string => {
  const iso = new Date(
    atMs + offsetMinutesAt(atMs, timeZone) * MINUTE_MS,
  ).toISOString()
  return `${iso.slice(0, ISO_DATE_LENGTH)} ${iso.slice(ISO_DATE_LENGTH + 1, ISO_MINUTE_END)}`
}

/** A time when the clock has not been read yet, else how long ago it was. */
export const whenLabel = (
  atMs: number,
  nowMs: number,
  timeZone: string,
): string =>
  nowMs === 0 ? localTimeLabel(atMs, timeZone) : howLongAgo(atMs, nowMs)

/**
 * How long something took, `1 h 27 min`, `3 days 2 h`, `40 s`: the two
 * largest units, for a step of an ask's timeline.
 */
export const durationLabel = (fromMs: number, toMs: number): string => {
  const elapsedMs = Math.max(0, toMs - fromMs)
  const days = Math.floor(elapsedMs / DAY_MS)
  const hours = Math.floor((elapsedMs % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((elapsedMs % HOUR_MS) / MINUTE_MS)
  const seconds = Math.floor((elapsedMs % MINUTE_MS) / SECOND_MS)
  if (days > 0) {
    return hours > 0
      ? `${plural(days, 'day')} ${hours.toString()} h`
      : plural(days, 'day')
  } else if (hours > 0) {
    return minutes > 0
      ? `${hours.toString()} h ${minutes.toString()} min`
      : `${hours.toString()} h`
  } else if (minutes > 0) {
    return `${minutes.toString()} min`
  }
  return `${seconds.toString()} s`
}

/** How long a number of milliseconds is: `1 h 27 min`, as {@link durationLabel}. */
export const millisecondsLabel = (milliseconds: number): string =>
  durationLabel(0, milliseconds)

/** `3:58:07` for a time 14,287 seconds into a Recording; `4:05` under an hour. */
export const recordingClockLabel = (atSeconds: number): string => {
  const whole = Math.floor(atSeconds)
  const hours = Math.floor(whole / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR))
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR
  const seconds = whole % SECONDS_PER_MINUTE
  const twoDigits = (value: number): string => value.toString().padStart(2, '0')
  return hours > 0
    ? `${hours.toString()}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${minutes.toString()}:${twoDigits(seconds)}`
}
