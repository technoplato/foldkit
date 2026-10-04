import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
  String,
  pipe,
} from 'effect'

// CALENDAR

/**
 * A day on the person's own calendar, `2026-10-04`. The clock reports
 * today in it, and a due date's day is read in it, so "Today" means the
 * same day the person sees on their wall.
 */
export const LocalDay = S.String.check(
  S.isPattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
).pipe(S.brand('LocalDay'))
/** A day on the person's own calendar. */
export type LocalDay = typeof LocalDay.Type

/** A time on the person's own clock, `09:00` or `14:30`. */
export const LocalTime = S.String.check(
  S.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/),
).pipe(S.brand('LocalTime'))
/** A time on the person's own clock. */
export type LocalTime = typeof LocalTime.Type

/**
 * When a reminder is due, on the person's own calendar and clock: the day
 * and the time, `2026-10-05` at `09:00`.
 */
export const DueAt = S.Struct({ day: LocalDay, time: LocalTime })
/** When a reminder is due, on the person's own calendar and clock. */
export type DueAt = typeof DueAt.Type

/** The time a due date takes when a person names only its day. */
export const defaultDueTime = LocalTime.make('09:00')

const dayMs = 86_400_000

const daysInWeek = 7

const saturday = 6

const monday = 1

type DayParts = Readonly<{ year: number; month: number; day: number }>

const numbersOf = (text: string, separator: string): ReadonlyArray<number> =>
  Array.map(String.split(text, separator), part => Number.parseInt(part, 10))

const partsOf = (day: LocalDay): DayParts => {
  const [year = 0, month = 1, date = 1] = numbersOf(day, '-')
  return { year, month, day: date }
}

const utcMsOf = (day: LocalDay): number => {
  const { year, month, day: date } = partsOf(day)
  return Date.UTC(year, month - 1, date)
}

const padded = (value: number): string => value.toString().padStart(2, '0')

const dayOfUtcMs = (utcMs: number): LocalDay => {
  const date = new Date(utcMs)
  return LocalDay.make(
    `${date.getUTCFullYear().toString()}-${padded(date.getUTCMonth() + 1)}-${padded(date.getUTCDate())}`,
  )
}

const isRealDay = (day: string): boolean =>
  S.is(LocalDay)(day) && dayOfUtcMs(utcMsOf(day)) === day

/**
 * The day `count` days after `day`, or before it for a negative count.
 *
 * @example
 * ```typescript
 * addDays(LocalDay.make('2026-10-31'), 1) // '2026-11-01'
 * ```
 */
export const addDays = (day: LocalDay, count: number): LocalDay =>
  dayOfUtcMs(utcMsOf(day) + count * dayMs)

/** How many days `later` comes after `earlier`; negative when it is before. */
export const daysBetween = (earlier: LocalDay, later: LocalDay): number =>
  Math.round((utcMsOf(later) - utcMsOf(earlier)) / dayMs)

/** The day of the week, 0 for Sunday through 6 for Saturday. */
export const weekdayOf = (day: LocalDay): number =>
  new Date(utcMsOf(day)).getUTCDay()

const weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const nameAt = (names: ReadonlyArray<string>, index: number): string =>
  Option.getOrElse(Array.get(names, index), () => '')

const shortWeekdayOf = (day: LocalDay): string =>
  nameAt(weekdayNames, weekdayOf(day)).slice(0, 3)

/**
 * A day as a person reads it next to today: `Today`, `Tomorrow`,
 * `Yesterday`, the weekday within the coming week, and the date otherwise.
 *
 * @example
 * ```typescript
 * dayLabel(LocalDay.make('2026-10-06'), LocalDay.make('2026-10-04')) // 'Tuesday'
 * dayLabel(LocalDay.make('2026-11-20'), LocalDay.make('2026-10-04')) // 'Fri, Nov 20'
 * dayLabel(LocalDay.make('2027-01-02'), LocalDay.make('2026-10-04')) // 'Sat, Jan 2, 2027'
 * ```
 */
export const dayLabel = (day: LocalDay, today: LocalDay): string => {
  const distance = daysBetween(today, day)
  const { year, month, day: date } = partsOf(day)
  const isSameYear = partsOf(today).year === year
  if (distance === 0) {
    return 'Today'
  } else if (distance === 1) {
    return 'Tomorrow'
  } else if (distance === -1) {
    return 'Yesterday'
  } else if (distance > 1 && distance < daysInWeek) {
    return nameAt(weekdayNames, weekdayOf(day))
  } else if (isSameYear) {
    return `${shortWeekdayOf(day)}, ${nameAt(monthNames, month - 1)} ${date.toString()}`
  } else {
    return `${shortWeekdayOf(day)}, ${nameAt(monthNames, month - 1)} ${date.toString()}, ${year.toString()}`
  }
}

const noonHour = 12

/**
 * A time as a person reads it on a twelve-hour clock: `9:00 AM`.
 *
 * @example
 * ```typescript
 * timeLabel(LocalTime.make('14:30')) // '2:30 PM'
 * ```
 */
export const timeLabel = (time: LocalTime): string => {
  const [hour = 0, minute = 0] = numbersOf(time, ':')
  const period = hour < noonHour ? 'AM' : 'PM'
  const twelveHour = hour % noonHour === 0 ? noonHour : hour % noonHour
  return `${twelveHour.toString()}:${padded(minute)} ${period}`
}

/**
 * When a reminder is due as a person reads it: `Today, 9:00 AM`.
 *
 * @example
 * ```typescript
 * dueLabel({ day: LocalDay.make('2026-10-05'), time: LocalTime.make('09:00') }, LocalDay.make('2026-10-04'))
 * // 'Tomorrow, 9:00 AM'
 * ```
 */
export const dueLabel = (due: DueAt, today: LocalDay): string =>
  `${dayLabel(due.day, today)}, ${timeLabel(due.time)}`

const sunday = 0

const daysUntil = (today: LocalDay, weekday: number): number =>
  (weekday - weekdayOf(today) + daysInWeek) % daysInWeek

const weekendChoiceOf = (
  today: LocalDay,
): ReadonlyArray<Readonly<{ name: string; day: LocalDay }>> =>
  M.value(weekdayOf(today)).pipe(
    M.withReturnType<
      ReadonlyArray<Readonly<{ name: string; day: LocalDay }>>
    >(),
    M.when(saturday, () => []),
    M.when(sunday, () => [
      { name: 'Next weekend', day: addDays(today, daysUntil(today, saturday)) },
    ]),
    M.orElse(() => [
      { name: 'This weekend', day: addDays(today, daysUntil(today, saturday)) },
    ]),
  )

const nextWeekFrom = (today: LocalDay): LocalDay => {
  const tomorrow = addDays(today, 1)
  const untilMonday = daysUntil(tomorrow, monday)
  if (untilMonday === 0) {
    return addDays(tomorrow, daysInWeek)
  } else {
    return addDays(tomorrow, untilMonday)
  }
}

/**
 * The quick due dates a person picks from, by name, from today, each at
 * 9:00 AM and each on its own day: today, tomorrow, the coming Saturday
 * (none on a Saturday, and called next weekend on a Sunday), and next
 * week, the Monday after tomorrow.
 *
 * @example
 * ```typescript
 * quickDueDates(LocalDay.make('2026-10-07'))
 * // [{ name: 'Today', due: 2026-10-07 09:00 }, { name: 'Tomorrow', due: 2026-10-08 09:00 },
 * //  { name: 'This weekend', due: 2026-10-10 09:00 }, { name: 'Next week', due: 2026-10-12 09:00 }]
 * ```
 */
export const quickDueDates = (
  today: LocalDay,
): ReadonlyArray<Readonly<{ name: string; due: DueAt }>> =>
  pipe(
    [
      { name: 'Today', day: today },
      { name: 'Tomorrow', day: addDays(today, 1) },
      ...weekendChoiceOf(today),
      { name: 'Next week', day: nextWeekFrom(today) },
    ],
    Array.dedupeWith((self, that) => self.day === that.day),
    Array.map(({ name, day }) => ({
      name,
      due: { day, time: defaultDueTime },
    })),
  )

const dueTokenPattern = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/

const dueOfToken = (token: string): Option.Option<DueAt> =>
  pipe(
    Option.fromNullishOr(dueTokenPattern.exec(token.trim())),
    Option.flatMap(([, day = '', hour, minute]) => {
      const time =
        hour === undefined || minute === undefined
          ? defaultDueTime
          : `${hour.padStart(2, '0')}:${minute}`
      return isRealDay(day) && S.is(LocalTime)(time)
        ? Option.some({ day: LocalDay.make(day), time: LocalTime.make(time) })
        : Option.none()
    }),
  )

/**
 * A due date as one word, for a press, a CLI command, and a typed date:
 * `2026-10-05T09:00`. Decoding also takes a day alone, `2026-10-05`, at
 * 9:00 AM, and a space for the `T`, `2026-10-05 14:30`; a day the calendar
 * does not have, such as `2026-02-30`, does not decode.
 */
export const DueToken = S.String.pipe(
  S.decodeTo(
    DueAt,
    SchemaTransformation.transformOrFail({
      decode: (token: string) =>
        Option.match(dueOfToken(token), {
          onNone: () =>
            Effect.fail(
              new SchemaIssue.InvalidValue(Option.some(token), {
                message: 'Expected a day like 2026-10-05 or 2026-10-05 14:30',
              }),
            ),
          onSome: Effect.succeed,
        }),
      encode: (due: typeof DueAt.Encoded) =>
        Effect.succeed(`${due.day}T${due.time}`),
    }),
  ),
)

/** The token a due date prints as, `2026-10-05T09:00`. */
export const dueTokenOf = (due: DueAt): string => S.encodeSync(DueToken)(due)

// DEVICE

/**
 * How a device reads a moment on its person's own calendar: now, an
 * instant as their day and time, and their day and time as an instant.
 * The device's clock and time zone when live; a fixed zone in tests.
 */
export type DeviceCalendar = Readonly<{
  nowMs: () => number
  localOf: (atMs: number) => DueAt
  instantOf: (due: DueAt) => number
}>

/**
 * The calendar of the device Reminders runs on: its clock, and its time
 * zone for days and times.
 */
export const hostCalendar: DeviceCalendar = {
  nowMs: () => Date.now(),
  localOf: atMs => {
    const date = new Date(atMs)
    return {
      day: LocalDay.make(
        `${date.getFullYear().toString()}-${padded(date.getMonth() + 1)}-${padded(date.getDate())}`,
      ),
      time: LocalTime.make(
        `${padded(date.getHours())}:${padded(date.getMinutes())}`,
      ),
    }
  },
  instantOf: due => {
    const { year, month, day } = partsOf(due.day)
    const [hour = 0, minute = 0] = numbersOf(due.time, ':')
    return new Date(year, month - 1, day, hour, minute).getTime()
  },
}

/** A calendar in UTC with a fixed clock, so tests read the same days anywhere. */
export const utcCalendar = (nowMs: number): DeviceCalendar => ({
  nowMs: () => nowMs,
  localOf: atMs => {
    const iso = new Date(atMs).toISOString()
    return {
      day: LocalDay.make(iso.slice(0, 10)),
      time: LocalTime.make(iso.slice(11, 16)),
    }
  },
  instantOf: due => Date.parse(`${due.day}T${due.time}:00.000Z`),
})
