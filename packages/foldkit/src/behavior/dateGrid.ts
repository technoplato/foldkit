import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

import {
  addDays as calendarAddDays,
  addMonths as calendarAddMonths,
  addYears as calendarAddYears,
  daysSince as calendarDaysSince,
  daysUntil as calendarDaysUntil,
  subtractDays as calendarSubtractDays,
  subtractMonths as calendarSubtractMonths,
  subtractYears as calendarSubtractYears,
} from '../calendar/arithmetic.js'
import {
  CalendarDate,
  CalendarDateFromIsoString,
  daysInMonth as calendarDaysInMonth,
  isLeapYear as calendarIsLeapYear,
  isCalendarDate,
  make as makeCalendarDate,
  unsafeMake as unsafeMakeCalendarDate,
} from '../calendar/calendarDate.js'
import {
  Equivalence as CalendarDateEquivalence,
  Order as CalendarDateOrder,
  between as calendarBetween,
  isAfter as calendarIsAfter,
  isAfterOrEqual as calendarIsAfterOrEqual,
  isBefore as calendarIsBefore,
  isBeforeOrEqual as calendarIsBeforeOrEqual,
  isEqual as calendarIsEqual,
  max as calendarMax,
  min as calendarMin,
} from '../calendar/comparison.js'
import {
  DayOfWeek,
  dayOfWeek as calendarDayOfWeek,
  endOfWeek as calendarEndOfWeek,
  firstOfMonth as calendarFirstOfMonth,
  lastOfMonth as calendarLastOfMonth,
  startOfWeek as calendarStartOfWeek,
} from '../calendar/info.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as RovingFocus from './rovingFocus.js'

// NOTE: this is the reusable framework-free `dateGrid` block (Scribe #2655).
// It provides Schema-backed calendar date arithmetic, weekday header rotation,
// fixed 6-row and variable-week month grids, month/year/decade grids,
// min/max/disabled-date/disabled-weekday constraints, nearest enabled date
// search, 2D keyboard navigation, and a `Machine.define` view/focus chart
// without calling `new Date()` or `Date.now()` or touching any UI framework.
// Reused by Calendar (#19) and DatePicker (#20).

// RE-EXPORTS

export {
  CalendarDate,
  CalendarDateFromIsoString,
  CalendarDateEquivalence,
  CalendarDateOrder,
  DayOfWeek,
  isCalendarDate,
}

// CONSTANTS

/** Number of days in a week. */
export const DAYS_IN_WEEK = 7

/** Number of week rows in a fixed-height month grid (6 x 7 = 42 cells). */
export const FIXED_WEEKS_IN_GRID = 6

/** Number of months in a Gregorian year. */
export const MONTHS_IN_YEAR = 12

/** Default number of columns in a month-picker grid (3 x 4). */
export const MONTHS_GRID_COLUMNS = 3

/** Default number of columns in a year-picker grid (3 x 4). */
export const YEARS_GRID_COLUMNS = 3

/** Default number of years per paged year-picker window. */
export const YEARS_PAGE_SIZE = 12

/** Number of years in one calendar decade. */
export const DECADE_SIZE = 10

/** Default number of decades per century-level decade grid. */
export const DECADES_PER_GRID = 10

/** Default number of columns in a decade-picker grid. */
export const DECADES_GRID_COLUMNS = 2

/** Default maximum days to skip while searching for an enabled day via arrow keys. */
export const DAY_SKIP_CAP = 31

/** Default maximum days to skip while searching for an enabled day after a month/year page jump. */
export const MONTH_SKIP_CAP = 12

/** Default maximum outward radius (in days) when searching for the nearest enabled date. */
export const NEAREST_SEARCH_MAX_DAYS = 366

/** Canonical Sunday-first day-of-week order. */
export const DAYS_OF_WEEK_SUNDAY_FIRST: ReadonlyArray<DayOfWeek> = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const DAY_OF_WEEK_INDEX: Readonly<Record<DayOfWeek, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

const GRID_NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

// SCHEMAS

/** Month number 1..12. */
export const MonthNumber = S.Int.check(S.isBetween({ minimum: 1, maximum: 12 }))
/** Month number 1..12. */
export type MonthNumber = typeof MonthNumber.Type

/** Active granularity of a calendar grid: `Day`, `Month`, or `Year`. */
export const ViewMode = S.Literals(['Day', 'Month', 'Year'])
/** Active granularity of a calendar grid. */
export type ViewMode = typeof ViewMode.Type

/** Direction of a date or page step: `+1` forward, `-1` backward. */
export const StepDirection = S.Literals([1, -1])
/** Direction of a date or page step. */
export type StepDirection = typeof StepDirection.Type

/** A visible year and month pair (`month` is 1..12). */
export const YearMonth = S.Struct({
  year: S.Int,
  month: MonthNumber,
})
/** A visible year and month pair. */
export type YearMonth = typeof YearMonth.Type

/** An inclusive date range with `start <= end`. */
export const DateRange = S.Struct({
  start: CalendarDate,
  end: CalendarDate,
})
/** An inclusive date range. */
export type DateRange = typeof DateRange.Type

/**
 * Date availability constraints evaluated purely from data: optional inclusive
 * bounds (`minDate`, `maxDate`), individually disabled dates, and disabled days
 * of the week.
 */
export const Constraints = S.Struct({
  minDate: S.optionalKey(CalendarDate),
  maxDate: S.optionalKey(CalendarDate),
  disabledDates: S.optionalKey(S.Array(CalendarDate)),
  disabledDaysOfWeek: S.optionalKey(S.Array(DayOfWeek)),
})
/** Date availability constraints. */
export type Constraints = typeof Constraints.Type

/** One day cell in a generated month grid, as plain data. */
export const DayCell = S.Struct({
  date: CalendarDate,
  iso: S.String,
  dayOfWeek: DayOfWeek,
  isOutsideMonth: S.Boolean,
  isDisabled: S.Boolean,
  rowIndex: S.Int,
  columnIndex: S.Int,
})
/** One day cell in a generated month grid. */
export type DayCell = typeof DayCell.Type

/** One 7-day week row in a generated month grid. */
export const WeekRow = S.Struct({
  weekStart: CalendarDate,
  rowIndex: S.Int,
  cells: S.Array(DayCell),
})
/** One 7-day week row in a generated month grid. */
export type WeekRow = typeof WeekRow.Type

/** A generated 2D month grid with rotated weekday headers and week rows. */
export const MonthGrid = S.Struct({
  year: S.Int,
  month: MonthNumber,
  firstDayOfWeek: DayOfWeek,
  gridStart: CalendarDate,
  gridEnd: CalendarDate,
  weekdays: S.Array(DayOfWeek),
  weeks: S.Array(WeekRow),
})
/** A generated 2D month grid. */
export type MonthGrid = typeof MonthGrid.Type

/** One month cell in a generated 12-month grid. */
export const MonthCell = S.Struct({
  year: S.Int,
  month: MonthNumber,
  isDisabled: S.Boolean,
  rowIndex: S.Int,
  columnIndex: S.Int,
})
/** One month cell in a generated 12-month grid. */
export type MonthCell = typeof MonthCell.Type

/** A generated 12-month grid for a single year. */
export const MonthsGrid = S.Struct({
  year: S.Int,
  cells: S.Array(MonthCell),
  rows: S.Array(S.Array(MonthCell)),
})
/** A generated 12-month grid. */
export type MonthsGrid = typeof MonthsGrid.Type

/** One year cell in a generated year-picker grid. */
export const YearCell = S.Struct({
  year: S.Int,
  isDisabled: S.Boolean,
  rowIndex: S.Int,
  columnIndex: S.Int,
})
/** One year cell in a generated year-picker grid. */
export type YearCell = typeof YearCell.Type

/** A generated paged year-picker grid (default 12 years). */
export const YearsGrid = S.Struct({
  startYear: S.Int,
  endYear: S.Int,
  cells: S.Array(YearCell),
  rows: S.Array(S.Array(YearCell)),
})
/** A generated paged year-picker grid. */
export type YearsGrid = typeof YearsGrid.Type

/** One decade cell in a generated decade-picker grid. */
export const DecadeCell = S.Struct({
  startYear: S.Int,
  endYear: S.Int,
  isDisabled: S.Boolean,
  rowIndex: S.Int,
  columnIndex: S.Int,
})
/** One decade cell in a generated decade-picker grid. */
export type DecadeCell = typeof DecadeCell.Type

/** A generated century-scale decade-picker grid. */
export const DecadeGrid = S.Struct({
  startYear: S.Int,
  endYear: S.Int,
  cells: S.Array(DecadeCell),
  rows: S.Array(S.Array(DecadeCell)),
})
/** A generated century-scale decade-picker grid. */
export type DecadeGrid = typeof DecadeGrid.Type

/** Resolved 2D day navigation candidate before clamping and disabled-date skipping. */
export const DayKeyCandidate = S.Struct({
  candidate: CalendarDate,
  direction: StepDirection,
  skipCap: S.Int,
  isWeekBoundary: S.Boolean,
})
/** Resolved 2D day navigation candidate. */
export type DayKeyCandidate = typeof DayKeyCandidate.Type

/** Read-only configuration supplied to the `DateGrid` Machine chart as context. */
export const Props = S.Struct({
  today: CalendarDate,
  firstDayOfWeek: S.optionalKey(DayOfWeek),
  direction: S.optionalKey(RovingFocus.Direction),
  fixedWeeks: S.optionalKey(S.Boolean),
  minDate: S.optionalKey(CalendarDate),
  maxDate: S.optionalKey(CalendarDate),
  disabledDates: S.optionalKey(S.Array(CalendarDate)),
  disabledDaysOfWeek: S.optionalKey(S.Array(DayOfWeek)),
  monthsGridColumns: S.optionalKey(S.Int),
  yearsGridColumns: S.optionalKey(S.Int),
  yearsPageSize: S.optionalKey(S.Int),
})
/** Read-only configuration supplied to the `DateGrid` Machine chart. */
export type Props = typeof Props.Type

// DATE ARITHMETIC & CODECS

const encodeIsoDate = S.encodeSync(CalendarDateFromIsoString)
const decodeIsoDateOption = S.decodeUnknownOption(CalendarDateFromIsoString)

/** Constructs a validated `CalendarDate` from `year`, `month` (1..12), and `day`. */
export const makeDate = (
  year: number,
  month: number,
  day: number,
): CalendarDate => makeCalendarDate(year, month, day)

/** Constructs a `CalendarDate` without Schema validation for already-verified arithmetic results. */
export const unsafeDate = (
  year: number,
  month: number,
  day: number,
): CalendarDate => unsafeMakeCalendarDate(year, month, day)

/** Formats a `CalendarDate` as a zero-padded ISO 8601 date string (`YYYY-MM-DD`). */
export const formatIso = (date: CalendarDate): string => encodeIsoDate(date)

/** Parses an ISO 8601 date string (`YYYY-MM-DD`) into a validated `CalendarDate`, or `None`. */
export const parseIso = (iso: string): Option.Option<CalendarDate> =>
  decodeIsoDateOption(iso)

/** Returns `true` when `year` is a Gregorian leap year. */
export const isLeapYear = (year: number): boolean => calendarIsLeapYear(year)

/** Returns the number of days in `(year, month)` (leap-year aware). */
export const daysInMonth = (year: number, month: number): number =>
  calendarDaysInMonth(year, month)

/** Returns the day of the week for `date`. */
export const dayOfWeek = (date: CalendarDate): DayOfWeek =>
  calendarDayOfWeek(date)

/** Adds `days` (positive or negative) to `date`. */
export const addDays = (date: CalendarDate, days: number): CalendarDate =>
  calendarAddDays(date, days)

/** Subtracts `days` from `date`. */
export const subtractDays = (date: CalendarDate, days: number): CalendarDate =>
  calendarSubtractDays(date, days)

/** Adds `weeks` (positive or negative) to `date`. */
export const addWeeks = (date: CalendarDate, weeks: number): CalendarDate =>
  calendarAddDays(date, weeks * DAYS_IN_WEEK)

/** Adds `months` (positive or negative) to `date`, clamping day-of-month to the target month's length. */
export const addMonths = (date: CalendarDate, months: number): CalendarDate =>
  calendarAddMonths(date, months)

/** Subtracts `months` from `date`, clamping day-of-month to the target month's length. */
export const subtractMonths = (
  date: CalendarDate,
  months: number,
): CalendarDate => calendarSubtractMonths(date, months)

/** Adds `years` (positive or negative) to `date`, clamping Feb 29 to Feb 28 in non-leap years. */
export const addYears = (date: CalendarDate, years: number): CalendarDate =>
  calendarAddYears(date, years)

/** Subtracts `years` from `date`, clamping Feb 29 to Feb 28 in non-leap years. */
export const subtractYears = (
  date: CalendarDate,
  years: number,
): CalendarDate => calendarSubtractYears(date, years)

/** Returns the first day of the week containing `date` (`firstDayOfWeek` defaults to `'Sunday'`). */
export const startOfWeek = (
  date: CalendarDate,
  firstDayOfWeek: DayOfWeek = 'Sunday',
): CalendarDate => calendarStartOfWeek(date, firstDayOfWeek)

/** Returns the last day of the week containing `date` (`firstDayOfWeek` defaults to `'Sunday'`). */
export const endOfWeek = (
  date: CalendarDate,
  firstDayOfWeek: DayOfWeek = 'Sunday',
): CalendarDate => calendarEndOfWeek(date, firstDayOfWeek)

/** Returns the first day of the month containing `date`. */
export const firstOfMonth = (date: CalendarDate): CalendarDate =>
  calendarFirstOfMonth(date)

/** Returns the last day of the month containing `date`. */
export const lastOfMonth = (date: CalendarDate): CalendarDate =>
  calendarLastOfMonth(date)

/** Signed number of days from `start` until `end` (`> 0` when `end` is after `start`). */
export const daysUntil = (start: CalendarDate, end: CalendarDate): number =>
  calendarDaysUntil(start, end)

/** Signed number of days from `start` until `date`. */
export const daysSince = (date: CalendarDate, start: CalendarDate): number =>
  calendarDaysSince(date, start)

/** Lexicographic chronological ordering over calendar dates (`-1`, `0`, or `1`). */
export const compareDates = (
  left: CalendarDate,
  right: CalendarDate,
): -1 | 0 | 1 => CalendarDateOrder(left, right)

/** Returns `true` when `left` and `right` represent the exact same calendar date. */
export const isSameDate = (left: CalendarDate, right: CalendarDate): boolean =>
  calendarIsEqual(left, right)

/** Returns `true` when `left` and `right` fall in the same year and month. */
export const isSameMonth = (left: CalendarDate, right: CalendarDate): boolean =>
  left.year === right.year && left.month === right.month

/** Returns `true` when `left` and `right` fall in the same year. */
export const isSameYear = (left: CalendarDate, right: CalendarDate): boolean =>
  left.year === right.year

/** Returns `true` when `left` is strictly before `right`. */
export const isBefore = (left: CalendarDate, right: CalendarDate): boolean =>
  calendarIsBefore(left, right)

/** Returns `true` when `left` is strictly after `right`. */
export const isAfter = (left: CalendarDate, right: CalendarDate): boolean =>
  calendarIsAfter(left, right)

/** Returns `true` when `left` is before or equal to `right`. */
export const isBeforeOrEqual = (
  left: CalendarDate,
  right: CalendarDate,
): boolean => calendarIsBeforeOrEqual(left, right)

/** Returns `true` when `left` is after or equal to `right`. */
export const isAfterOrEqual = (
  left: CalendarDate,
  right: CalendarDate,
): boolean => calendarIsAfterOrEqual(left, right)

/** Returns the earlier of two calendar dates. */
export const minDateOf = (
  left: CalendarDate,
  right: CalendarDate,
): CalendarDate => calendarMin(left, right)

/** Returns the later of two calendar dates. */
export const maxDateOf = (
  left: CalendarDate,
  right: CalendarDate,
): CalendarDate => calendarMax(left, right)

/** Normalizes two dates into an inclusive `{ start, end }` range with `start <= end`. */
export const normalizeRange = (
  first: CalendarDate,
  second: CalendarDate,
): DateRange =>
  compareDates(first, second) <= 0
    ? { start: first, end: second }
    : { start: second, end: first }

/** Returns `true` when `date` lies inside the inclusive `[range.start, range.end]` span. */
export const isDateInRange = (
  date: CalendarDate,
  range: DateRange,
): boolean => {
  const normalized = normalizeRange(range.start, range.end)
  return calendarBetween(date, {
    minimum: normalized.start,
    maximum: normalized.end,
  })
}

// WEEKDAY HEADERS

/** Returns the Sunday-based index (`0..6`) of `day`. */
export const dayOfWeekIndex = (day: DayOfWeek): number => DAY_OF_WEEK_INDEX[day]

/**
 * Rotates a Sunday-first 7-item array so the entry at `firstDayOfWeek` comes
 * first.
 *
 * @example
 * ```typescript
 * rotateWeekItems(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 'Monday')
 * // ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
 * ```
 */
export const rotateWeekItems = <A>(
  items: ReadonlyArray<A>,
  firstDayOfWeek: DayOfWeek = 'Sunday',
): ReadonlyArray<A> => {
  const [front, back] = Array.splitAt(items, dayOfWeekIndex(firstDayOfWeek))
  return [...back, ...front]
}

/**
 * Returns the 7 {@link DayOfWeek} headers ordered starting on `firstDayOfWeek`
 * (`'Sunday'` by default).
 *
 * @example
 * ```typescript
 * weekdayOrder('Monday')
 * // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
 * ```
 */
export const weekdayOrder = (
  firstDayOfWeek: DayOfWeek = 'Sunday',
): ReadonlyArray<DayOfWeek> =>
  rotateWeekItems(DAYS_OF_WEEK_SUNDAY_FIRST, firstDayOfWeek)

// CONSTRAINTS & ENABLED-DATE SEARCH

/**
 * Returns `true` when `date` is disallowed by `constraints` (before `minDate`,
 * after `maxDate`, on a disabled weekday, or listed in `disabledDates`).
 */
export const isDateDisabled = (
  date: CalendarDate,
  constraints: Constraints = {},
): boolean =>
  (constraints.minDate !== undefined && isBefore(date, constraints.minDate)) ||
  (constraints.maxDate !== undefined && isAfter(date, constraints.maxDate)) ||
  (constraints.disabledDaysOfWeek !== undefined &&
    Array.contains(constraints.disabledDaysOfWeek, dayOfWeek(date))) ||
  (constraints.disabledDates !== undefined &&
    Array.some(constraints.disabledDates, disabled =>
      isSameDate(disabled, date),
    ))

/**
 * Returns `true` when every day in `(year, month)` lies strictly before
 * `minDate` or strictly after `maxDate`.
 */
export const isMonthDisabled = (
  year: number,
  month: number,
  constraints: Pick<Constraints, 'minDate' | 'maxDate'> = {},
): boolean => {
  const monthStart = makeDate(year, month, 1)
  const monthEnd = makeDate(year, month, daysInMonth(year, month))
  return (
    (constraints.minDate !== undefined &&
      isBefore(monthEnd, constraints.minDate)) ||
    (constraints.maxDate !== undefined &&
      isAfter(monthStart, constraints.maxDate))
  )
}

/**
 * Returns `true` when `year` lies completely below `minDate.year` or completely
 * above `maxDate.year`.
 */
export const isYearDisabled = (
  year: number,
  constraints: Pick<Constraints, 'minDate' | 'maxDate'> = {},
): boolean =>
  (constraints.minDate !== undefined && year < constraints.minDate.year) ||
  (constraints.maxDate !== undefined && year > constraints.maxDate.year)

/**
 * Returns `true` when a decade `[startYear, endYear]` lies completely outside
 * `[minDate.year, maxDate.year]`.
 */
export const isDecadeDisabled = (
  startYear: number,
  endYear: number,
  constraints: Pick<Constraints, 'minDate' | 'maxDate'> = {},
): boolean =>
  (constraints.minDate !== undefined && endYear < constraints.minDate.year) ||
  (constraints.maxDate !== undefined && startYear > constraints.maxDate.year)

/**
 * Returns `true` when any date in the inclusive span between `first` and
 * `second` is disabled under `constraints`.
 */
export const hasDisabledDateInRange = (
  first: CalendarDate,
  second: CalendarDate,
  constraints: Constraints = {},
): boolean => {
  const normalized = normalizeRange(first, second)
  const totalDays = daysUntil(normalized.start, normalized.end) + 1
  return pipe(
    totalDays,
    Array.makeBy(offset => addDays(normalized.start, offset)),
    Array.some(date => isDateDisabled(date, constraints)),
  )
}

/**
 * Clamps `date` into the optional inclusive `[minDate, maxDate]` bounds.
 * Works when neither, either, or both bounds are supplied.
 */
export const clampDate = (
  date: CalendarDate,
  constraints: Pick<Constraints, 'minDate' | 'maxDate'> = {},
): CalendarDate => {
  const afterMin =
    constraints.minDate === undefined
      ? date
      : maxDateOf(date, constraints.minDate)
  return constraints.maxDate === undefined
    ? afterMin
    : minDateOf(afterMin, constraints.maxDate)
}

/**
 * Walks up to `maxSteps` days from `start` in `direction` (`1` forward, `-1`
 * backward) and returns the first enabled date, or `None` when every checked
 * date is disabled.
 */
export const findEnabledInDirection = (
  start: CalendarDate,
  direction: StepDirection,
  constraints: Constraints = {},
  maxSteps: number = DAY_SKIP_CAP,
): Option.Option<CalendarDate> =>
  maxSteps <= 0
    ? Option.none()
    : pipe(
        maxSteps,
        Array.makeBy(step => addDays(start, step * direction)),
        Array.findFirst(date => !isDateDisabled(date, constraints)),
      )

/**
 * Walks up to `cap` days from `start` in `direction` and returns the first
 * enabled date, falling back to `start` when every checked date is disabled.
 */
export const skipDisabledDate = (
  start: CalendarDate,
  direction: StepDirection,
  constraints: Constraints = {},
  cap: number = DAY_SKIP_CAP,
): CalendarDate =>
  Option.getOrElse(
    findEnabledInDirection(start, direction, constraints, cap),
    () => start,
  )

/**
 * Finds the nearest enabled date to `target` (first clamping `target` into
 * `[minDate, maxDate]`), expanding outward up to `maxSteps` days and breaking
 * ties in `preferredDirection` (`1` forward by default). Returns `None` if no
 * enabled date exists within `maxSteps`.
 */
export const findNearestEnabledDate = (
  target: CalendarDate,
  constraints: Constraints = {},
  options: Readonly<{
    preferredDirection?: StepDirection
    maxSteps?: number
  }> = {},
): Option.Option<CalendarDate> => {
  const preferredDirection: StepDirection = options.preferredDirection ?? 1
  const oppositeDirection: StepDirection = preferredDirection === 1 ? -1 : 1
  const maxSteps = options.maxSteps ?? NEAREST_SEARCH_MAX_DAYS
  const clamped = clampDate(target, constraints)

  if (!isDateDisabled(clamped, constraints)) {
    return Option.some(clamped)
  }

  const candidates = Array.flatMap(
    Array.makeBy(maxSteps, index => index + 1),
    distance => [
      addDays(clamped, distance * preferredDirection),
      addDays(clamped, distance * oppositeDirection),
    ],
  )
  return Array.findFirst(candidates, date => !isDateDisabled(date, constraints))
}

/**
 * Finds the first enabled date within `(year, month)` using
 * `RovingFocus.firstEnabled`, or `None` when every day in the month is disabled.
 */
export const firstEnabledDateInMonth = (
  year: number,
  month: number,
  constraints: Constraints = {},
): Option.Option<CalendarDate> => {
  const count = daysInMonth(year, month)
  return Option.map(
    RovingFocus.firstEnabled(count, index =>
      isDateDisabled(makeDate(year, month, index + 1), constraints),
    ),
    index => makeDate(year, month, index + 1),
  )
}

/**
 * Finds the last enabled date within `(year, month)` using
 * `RovingFocus.lastEnabled`, or `None` when every day in the month is disabled.
 */
export const lastEnabledDateInMonth = (
  year: number,
  month: number,
  constraints: Constraints = {},
): Option.Option<CalendarDate> => {
  const count = daysInMonth(year, month)
  return Option.map(
    RovingFocus.lastEnabled(count, index =>
      isDateDisabled(makeDate(year, month, index + 1), constraints),
    ),
    index => makeDate(year, month, index + 1),
  )
}

/**
 * Finds the first enabled date within the 7-day week containing `date` using
 * `RovingFocus.firstEnabled`, or `None` when every day in that week is disabled.
 */
export const firstEnabledDateInWeek = (
  date: CalendarDate,
  firstDayOfWeek: DayOfWeek = 'Sunday',
  constraints: Constraints = {},
): Option.Option<CalendarDate> => {
  const weekStart = startOfWeek(date, firstDayOfWeek)
  return Option.map(
    RovingFocus.firstEnabled(DAYS_IN_WEEK, index =>
      isDateDisabled(addDays(weekStart, index), constraints),
    ),
    index => addDays(weekStart, index),
  )
}

/**
 * Finds the last enabled date within the 7-day week containing `date` using
 * `RovingFocus.lastEnabled`, or `None` when every day in that week is disabled.
 */
export const lastEnabledDateInWeek = (
  date: CalendarDate,
  firstDayOfWeek: DayOfWeek = 'Sunday',
  constraints: Constraints = {},
): Option.Option<CalendarDate> => {
  const weekStart = startOfWeek(date, firstDayOfWeek)
  return Option.map(
    RovingFocus.lastEnabled(DAYS_IN_WEEK, index =>
      isDateDisabled(addDays(weekStart, index), constraints),
    ),
    index => addDays(weekStart, index),
  )
}

// GRID GENERATION

const chunkRows = <A>(
  cells: ReadonlyArray<A>,
  columns: number,
): ReadonlyArray<ReadonlyArray<A>> => {
  const safeColumns = Math.max(1, columns)
  const rowCount = Math.ceil(cells.length / safeColumns)
  return Array.makeBy(rowCount, rowIndex =>
    cells.slice(rowIndex * safeColumns, (rowIndex + 1) * safeColumns),
  )
}

/**
 * Generates the 2D day grid for `(year, month)`.
 *
 * - `fixedWeeks: true` (default) always generates 6 rows (42 cells) so calendar
 *   height never jumps between months.
 * - `fixedWeeks: false` generates only the 4, 5, or 6 week rows required to
 *   cover the month from the start-of-week of day 1 through the end-of-week of
 *   the last day of the month.
 */
export const monthGrid = (
  input: Readonly<{
    year: number
    month: number
    firstDayOfWeek?: DayOfWeek
    fixedWeeks?: boolean
    constraints?: Constraints
  }>,
): MonthGrid => {
  const firstDayOfWeek = input.firstDayOfWeek ?? 'Sunday'
  const fixedWeeks = input.fixedWeeks ?? true
  const constraints = input.constraints ?? {}
  const monthStart = makeDate(input.year, input.month, 1)
  const monthEnd = lastOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, firstDayOfWeek)
  const weekCount = fixedWeeks
    ? FIXED_WEEKS_IN_GRID
    : Math.floor(
        daysUntil(gridStart, endOfWeek(monthEnd, firstDayOfWeek)) /
          DAYS_IN_WEEK,
      ) + 1
  const gridEnd = addDays(gridStart, weekCount * DAYS_IN_WEEK - 1)
  const weekdays = weekdayOrder(firstDayOfWeek)

  const weeks: ReadonlyArray<WeekRow> = Array.makeBy(weekCount, rowIndex => {
    const weekStart = addDays(gridStart, rowIndex * DAYS_IN_WEEK)
    const cells: ReadonlyArray<DayCell> = Array.makeBy(
      DAYS_IN_WEEK,
      columnIndex => {
        const date = addDays(weekStart, columnIndex)
        return {
          date,
          iso: formatIso(date),
          dayOfWeek: dayOfWeek(date),
          isOutsideMonth:
            date.year !== input.year || date.month !== input.month,
          isDisabled: isDateDisabled(date, constraints),
          rowIndex,
          columnIndex,
        }
      },
    )
    return { weekStart, rowIndex, cells }
  })

  return {
    year: input.year,
    month: input.month,
    firstDayOfWeek,
    gridStart,
    gridEnd,
    weekdays,
    weeks,
  }
}

/** Generates the 12-month grid for `year`, chunked into `columns` per row (default `3`). */
export const monthsGrid = (
  input: Readonly<{
    year: number
    columns?: number
    constraints?: Pick<Constraints, 'minDate' | 'maxDate'>
  }>,
): MonthsGrid => {
  const columns = Math.max(1, input.columns ?? MONTHS_GRID_COLUMNS)
  const constraints = input.constraints ?? {}
  const cells: ReadonlyArray<MonthCell> = Array.makeBy(
    MONTHS_IN_YEAR,
    index => {
      const month = index + 1
      return {
        year: input.year,
        month,
        isDisabled: isMonthDisabled(input.year, month, constraints),
        rowIndex: Math.floor(index / columns),
        columnIndex: index % columns,
      }
    },
  )
  return {
    year: input.year,
    cells,
    rows: chunkRows(cells, columns),
  }
}

/** Returns the start year of the aligned year-picker window containing `year`. */
export const yearsPageStart = (
  year: number,
  pageSize: number = YEARS_PAGE_SIZE,
): number => {
  const safeSize = Math.max(1, pageSize)
  return Math.floor(year / safeSize) * safeSize
}

/** Returns the start year of the calendar decade containing `year` (for example `2026 -> 2020`). */
export const decadeStart = (year: number): number =>
  Math.floor(year / DECADE_SIZE) * DECADE_SIZE

/** Returns the inclusive `{ startYear, endYear }` decade span containing `year` (for example `2026 -> 2020..2029`). */
export const decadeRange = (
  year: number,
): Readonly<{ startYear: number; endYear: number }> => {
  const startYear = decadeStart(year)
  return { startYear, endYear: startYear + DECADE_SIZE - 1 }
}

/** Generates one paged year grid containing `year` (default 12 years in 3 columns). */
export const yearsGrid = (
  input: Readonly<{
    year: number
    pageSize?: number
    columns?: number
    constraints?: Pick<Constraints, 'minDate' | 'maxDate'>
  }>,
): YearsGrid => {
  const pageSize = Math.max(1, input.pageSize ?? YEARS_PAGE_SIZE)
  const columns = Math.max(1, input.columns ?? YEARS_GRID_COLUMNS)
  const constraints = input.constraints ?? {}
  const startYear = yearsPageStart(input.year, pageSize)
  const endYear = startYear + pageSize - 1
  const cells: ReadonlyArray<YearCell> = Array.makeBy(pageSize, index => {
    const cellYear = startYear + index
    return {
      year: cellYear,
      isDisabled: isYearDisabled(cellYear, constraints),
      rowIndex: Math.floor(index / columns),
      columnIndex: index % columns,
    }
  })
  return {
    startYear,
    endYear,
    cells,
    rows: chunkRows(cells, columns),
  }
}

/**
 * Generates a decade-level grid containing `year` (default 10 decades aligned
 * to the century, for example `2000..2099` in 2 columns).
 */
export const decadeGrid = (
  input: Readonly<{
    year: number
    count?: number
    columns?: number
    constraints?: Pick<Constraints, 'minDate' | 'maxDate'>
  }>,
): DecadeGrid => {
  const count = Math.max(1, input.count ?? DECADES_PER_GRID)
  const columns = Math.max(1, input.columns ?? DECADES_GRID_COLUMNS)
  const constraints = input.constraints ?? {}
  const spanYears = count * DECADE_SIZE
  const startYear = Math.floor(input.year / spanYears) * spanYears
  const endYear = startYear + spanYears - 1
  const cells: ReadonlyArray<DecadeCell> = Array.makeBy(count, index => {
    const cellStart = startYear + index * DECADE_SIZE
    const cellEnd = cellStart + DECADE_SIZE - 1
    return {
      startYear: cellStart,
      endYear: cellEnd,
      isDisabled: isDecadeDisabled(cellStart, cellEnd, constraints),
      rowIndex: Math.floor(index / columns),
      columnIndex: index % columns,
    }
  })
  return {
    startYear,
    endYear,
    cells,
    rows: chunkRows(cells, columns),
  }
}

// 2D KEYBOARD NAVIGATION & VIEW-MONTH HELPERS

/** Returns `true` when `key` commits the focused cell (`Enter` or Space). */
export const isCommitKey = (key: string): boolean =>
  key === 'Enter' || key === ' '

/** Returns `true` when `key` is a 2D calendar grid navigation key. */
export const isGridNavigationKey = (key: string): boolean =>
  GRID_NAVIGATION_KEYS.has(key)

/** Returns `true` when `key` is handled by a calendar grid (navigation or commit). */
export const isGridKey = (key: string): boolean =>
  isGridNavigationKey(key) || isCommitKey(key)

/**
 * Maps a keyboard event on a day grid to its target candidate date, search
 * direction, and disabled-skip cap. Uses `RovingFocus.moveOfKey` so horizontal
 * arrows respect `Ltr` / `Rtl` reading direction.
 */
export const resolveDayKey = (
  input: Readonly<{
    key: string
    isShift?: boolean
    focused: CalendarDate
    firstDayOfWeek?: DayOfWeek
    direction?: RovingFocus.Direction
  }>,
): Option.Option<DayKeyCandidate> => {
  const firstDayOfWeek = input.firstDayOfWeek ?? 'Sunday'
  const direction = input.direction ?? 'Ltr'
  const isShift = input.isShift === true

  if (input.key === 'Home') {
    return Option.some({
      candidate: startOfWeek(input.focused, firstDayOfWeek),
      direction: -1,
      skipCap: DAY_SKIP_CAP,
      isWeekBoundary: true,
    })
  } else if (input.key === 'End') {
    return Option.some({
      candidate: endOfWeek(input.focused, firstDayOfWeek),
      direction: 1,
      skipCap: DAY_SKIP_CAP,
      isWeekBoundary: true,
    })
  } else if (input.key === 'PageUp') {
    return Option.some({
      candidate: isShift
        ? addYears(input.focused, -1)
        : addMonths(input.focused, -1),
      direction: -1,
      skipCap: MONTH_SKIP_CAP,
      isWeekBoundary: false,
    })
  } else if (input.key === 'PageDown') {
    return Option.some({
      candidate: isShift
        ? addYears(input.focused, 1)
        : addMonths(input.focused, 1),
      direction: 1,
      skipCap: MONTH_SKIP_CAP,
      isWeekBoundary: false,
    })
  }

  const maybeHorizontal = RovingFocus.moveOfKey(input.key, {
    orientation: 'Horizontal',
    direction,
    pageKeys: false,
  })
  if (Option.isSome(maybeHorizontal)) {
    if (maybeHorizontal.value === 'Next') {
      return Option.some({
        candidate: addDays(input.focused, 1),
        direction: 1,
        skipCap: DAY_SKIP_CAP,
        isWeekBoundary: false,
      })
    } else if (maybeHorizontal.value === 'Previous') {
      return Option.some({
        candidate: addDays(input.focused, -1),
        direction: -1,
        skipCap: DAY_SKIP_CAP,
        isWeekBoundary: false,
      })
    }
  }

  const maybeVertical = RovingFocus.moveOfKey(input.key, {
    orientation: 'Vertical',
    direction,
    pageKeys: false,
  })
  if (Option.isSome(maybeVertical)) {
    if (maybeVertical.value === 'Next') {
      return Option.some({
        candidate: addWeeks(input.focused, 1),
        direction: 1,
        skipCap: DAY_SKIP_CAP,
        isWeekBoundary: false,
      })
    } else if (maybeVertical.value === 'Previous') {
      return Option.some({
        candidate: addWeeks(input.focused, -1),
        direction: -1,
        skipCap: DAY_SKIP_CAP,
        isWeekBoundary: false,
      })
    }
  }

  return Option.none()
}

/**
 * Resolves a 2D day-grid key press into the next enabled focused date,
 * clamping to `[minDate, maxDate]` and skipping disabled dates.
 *
 * For `Home`/`End`, uses `RovingFocus.firstEnabled`/`lastEnabled` within the
 * focused date's week first so a disabled week edge lands on the first/last
 * enabled day of that week rather than jumping out of the week.
 */
export const navigateDay = (
  input: Readonly<{
    key: string
    isShift?: boolean
    focused: CalendarDate
    firstDayOfWeek?: DayOfWeek
    direction?: RovingFocus.Direction
    constraints?: Constraints
  }>,
): Option.Option<CalendarDate> => {
  const constraints = input.constraints ?? {}
  const firstDayOfWeek = input.firstDayOfWeek ?? 'Sunday'
  return Option.map(
    resolveDayKey({
      key: input.key,
      ...(input.isShift === undefined ? {} : { isShift: input.isShift }),
      focused: input.focused,
      firstDayOfWeek,
      ...(input.direction === undefined ? {} : { direction: input.direction }),
    }),
    resolved => {
      if (resolved.isWeekBoundary) {
        const maybeInWeek =
          resolved.direction === -1
            ? firstEnabledDateInWeek(input.focused, firstDayOfWeek, constraints)
            : lastEnabledDateInWeek(input.focused, firstDayOfWeek, constraints)
        if (Option.isSome(maybeInWeek)) {
          return maybeInWeek.value
        }
      }

      const clamped = clampDate(resolved.candidate, constraints)
      const opposite: StepDirection = resolved.direction === 1 ? -1 : 1
      return Option.getOrElse(
        Option.orElse(
          findEnabledInDirection(
            clamped,
            resolved.direction,
            constraints,
            resolved.skipCap,
          ),
          () =>
            findEnabledInDirection(
              clamped,
              opposite,
              constraints,
              resolved.skipCap,
            ),
        ),
        () =>
          isDateDisabled(input.focused, constraints) ? clamped : input.focused,
      )
    },
  )
}

/**
 * Maps a keyboard key on a month-picker grid to a signed month offset. Uses
 * `RovingFocus.moveOfKey` so horizontal arrows respect `Ltr` / `Rtl`.
 */
export const resolveMonthShift = (
  key: string,
  options: Readonly<{
    columns?: number
    direction?: RovingFocus.Direction
  }> = {},
): Option.Option<number> => {
  const columns = Math.max(1, options.columns ?? MONTHS_GRID_COLUMNS)
  const direction = options.direction ?? 'Ltr'

  if (key === 'PageUp') {
    return Option.some(-MONTHS_IN_YEAR)
  } else if (key === 'PageDown') {
    return Option.some(MONTHS_IN_YEAR)
  }

  const maybeHorizontal = RovingFocus.moveOfKey(key, {
    orientation: 'Horizontal',
    direction,
    pageKeys: false,
  })
  if (Option.isSome(maybeHorizontal)) {
    if (maybeHorizontal.value === 'Next') {
      return Option.some(1)
    } else if (maybeHorizontal.value === 'Previous') {
      return Option.some(-1)
    }
  }

  const maybeVertical = RovingFocus.moveOfKey(key, {
    orientation: 'Vertical',
    direction,
    pageKeys: false,
  })
  if (Option.isSome(maybeVertical)) {
    if (maybeVertical.value === 'Next') {
      return Option.some(columns)
    } else if (maybeVertical.value === 'Previous') {
      return Option.some(-columns)
    }
  }

  return Option.none()
}

/**
 * Resolves a key press in `Month` view into the next focused `CalendarDate`.
 * Supports `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`/`PageUp`/`PageDown`
 * plus `Home`/`End` (first/last enabled month of the current year via
 * `RovingFocus`).
 */
export const navigateMonth = (
  input: Readonly<{
    key: string
    focused: CalendarDate
    columns?: number
    direction?: RovingFocus.Direction
    constraints?: Pick<Constraints, 'minDate' | 'maxDate'>
  }>,
): Option.Option<CalendarDate> => {
  const constraints = input.constraints ?? {}
  if (input.key === 'Home') {
    return Option.map(
      RovingFocus.firstEnabled(MONTHS_IN_YEAR, index =>
        isMonthDisabled(input.focused.year, index + 1, constraints),
      ),
      index => {
        const month = index + 1
        return makeDate(
          input.focused.year,
          month,
          Math.min(input.focused.day, daysInMonth(input.focused.year, month)),
        )
      },
    )
  } else if (input.key === 'End') {
    return Option.map(
      RovingFocus.lastEnabled(MONTHS_IN_YEAR, index =>
        isMonthDisabled(input.focused.year, index + 1, constraints),
      ),
      index => {
        const month = index + 1
        return makeDate(
          input.focused.year,
          month,
          Math.min(input.focused.day, daysInMonth(input.focused.year, month)),
        )
      },
    )
  }

  return Option.map(
    resolveMonthShift(input.key, {
      ...(input.columns === undefined ? {} : { columns: input.columns }),
      ...(input.direction === undefined ? {} : { direction: input.direction }),
    }),
    shift => addMonths(input.focused, shift),
  )
}

/**
 * Maps a keyboard key on a year-picker grid to a signed year offset. Uses
 * `RovingFocus.moveOfKey` so horizontal arrows respect `Ltr` / `Rtl`.
 */
export const resolveYearShift = (
  key: string,
  options: Readonly<{
    columns?: number
    pageSize?: number
    direction?: RovingFocus.Direction
  }> = {},
): Option.Option<number> => {
  const columns = Math.max(1, options.columns ?? YEARS_GRID_COLUMNS)
  const pageSize = Math.max(1, options.pageSize ?? YEARS_PAGE_SIZE)
  const direction = options.direction ?? 'Ltr'

  if (key === 'PageUp') {
    return Option.some(-pageSize)
  } else if (key === 'PageDown') {
    return Option.some(pageSize)
  }

  const maybeHorizontal = RovingFocus.moveOfKey(key, {
    orientation: 'Horizontal',
    direction,
    pageKeys: false,
  })
  if (Option.isSome(maybeHorizontal)) {
    if (maybeHorizontal.value === 'Next') {
      return Option.some(1)
    } else if (maybeHorizontal.value === 'Previous') {
      return Option.some(-1)
    }
  }

  const maybeVertical = RovingFocus.moveOfKey(key, {
    orientation: 'Vertical',
    direction,
    pageKeys: false,
  })
  if (Option.isSome(maybeVertical)) {
    if (maybeVertical.value === 'Next') {
      return Option.some(columns)
    } else if (maybeVertical.value === 'Previous') {
      return Option.some(-columns)
    }
  }

  return Option.none()
}

/**
 * Resolves a key press in `Year` view into the next focused `CalendarDate`.
 * Supports `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`/`PageUp`/`PageDown`
 * plus `Home`/`End` (first/last enabled year on the current page via
 * `RovingFocus`).
 */
export const navigateYear = (
  input: Readonly<{
    key: string
    focused: CalendarDate
    columns?: number
    pageSize?: number
    direction?: RovingFocus.Direction
    constraints?: Pick<Constraints, 'minDate' | 'maxDate'>
  }>,
): Option.Option<CalendarDate> => {
  const pageSize = Math.max(1, input.pageSize ?? YEARS_PAGE_SIZE)
  const constraints = input.constraints ?? {}
  if (input.key === 'Home') {
    const startYear = yearsPageStart(input.focused.year, pageSize)
    return Option.map(
      RovingFocus.firstEnabled(pageSize, index =>
        isYearDisabled(startYear + index, constraints),
      ),
      index => {
        const year = startYear + index
        return makeDate(
          year,
          input.focused.month,
          Math.min(input.focused.day, daysInMonth(year, input.focused.month)),
        )
      },
    )
  } else if (input.key === 'End') {
    const startYear = yearsPageStart(input.focused.year, pageSize)
    return Option.map(
      RovingFocus.lastEnabled(pageSize, index =>
        isYearDisabled(startYear + index, constraints),
      ),
      index => {
        const year = startYear + index
        return makeDate(
          year,
          input.focused.month,
          Math.min(input.focused.day, daysInMonth(year, input.focused.month)),
        )
      },
    )
  }

  return Option.map(
    resolveYearShift(input.key, {
      ...(input.columns === undefined ? {} : { columns: input.columns }),
      pageSize,
      ...(input.direction === undefined ? {} : { direction: input.direction }),
    }),
    shift => addYears(input.focused, shift),
  )
}

/**
 * Computes the focused date after switching the visible month to `(year, month)`:
 * preserves the current day-of-month (clamped to the new month's length),
 * clamps into `[minDate, maxDate]`, and skips disabled dates in `direction`.
 */
export const moveFocusForViewMonth = (
  input: Readonly<{
    maybeFocusedDate: Option.Option<CalendarDate>
    year: number
    month: number
    direction: StepDirection
    constraints?: Constraints
    skipCap?: number
  }>,
): CalendarDate => {
  const currentDay = Option.match(input.maybeFocusedDate, {
    onNone: () => 1,
    onSome: focused => focused.day,
  })
  const dayInNewMonth = Math.min(
    currentDay,
    daysInMonth(input.year, input.month),
  )
  const candidate = makeDate(input.year, input.month, dayInNewMonth)
  const constraints = input.constraints ?? {}
  const clamped = clampDate(candidate, constraints)
  return skipDisabledDate(
    clamped,
    input.direction,
    constraints,
    input.skipCap ?? DAY_SKIP_CAP,
  )
}

/**
 * Reconciles `maybeFocusedDate` into the visible `(viewYear, viewMonth)` while
 * preserving day-of-month (clamped to the month's length). Used when dropping
 * back from Month/Year view to Day view.
 */
export const reconcileFocusInMonth = (
  viewYear: number,
  viewMonth: number,
  maybeFocusedDate: Option.Option<CalendarDate>,
): CalendarDate => {
  const focusedDay = Option.match(maybeFocusedDate, {
    onNone: () => 1,
    onSome: date => Math.min(date.day, daysInMonth(viewYear, viewMonth)),
  })
  return makeDate(viewYear, viewMonth, focusedDay)
}

/** Returns `1` when `(toYear, toMonth)` is after `(fromYear, fromMonth)`, otherwise `-1`. */
export const jumpDirection = (
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
): StepDirection =>
  isAfter(makeDate(toYear, toMonth, 1), makeDate(fromYear, fromMonth, 1))
    ? 1
    : -1

// BLOCK STATE

const stateFields = {
  maybeViewMonth: S.Option(YearMonth),
  maybeFocusedDate: S.Option(CalendarDate),
}

/** Day-granularity month grid view (`6x7` or variable weeks). */
export const Day = ts('Day', stateFields)
/** Day-granularity month grid view. */
export type Day = typeof Day.Type

/** Month-granularity picker grid (`12` months for one year). */
export const Month = ts('Month', stateFields)
/** Month-granularity picker grid. */
export type Month = typeof Month.Type

/** Year-granularity picker grid (paged window of years). */
export const Year = ts('Year', stateFields)
/** Year-granularity picker grid. */
export type Year = typeof Year.Type

/** Where a `DateGrid` stands: `Day`, `Month`, or `Year`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Day, Month, Year])
/** Where a `DateGrid` stands. */
export type State = typeof State.Type

/** Initial `DateGrid` state: `Day` view deferring visible month and focus to `props.today`. */
export const initial: State = Day({
  maybeViewMonth: Option.none(),
  maybeFocusedDate: Option.none(),
})

/** Creates an initial `DateGrid` state opened on `date` in `mode` (`'Day'` by default). */
export const initialAt = (
  date: CalendarDate,
  mode: ViewMode = 'Day',
): State => {
  const fields = {
    maybeViewMonth: Option.some({ year: date.year, month: date.month }),
    maybeFocusedDate: Option.some(date),
  }
  return M.value(mode).pipe(
    M.withReturnType<State>(),
    M.when('Day', () => Day(fields)),
    M.when('Month', () => Month(fields)),
    M.when('Year', () => Year(fields)),
    M.exhaustive,
  )
}

// BLOCK MESSAGES

/** Moves focus and visible month to `date`. */
export const FocusDate = m('FocusDate', { date: CalendarDate })

/** Steps the visible month forward or backward by `delta` months. */
export const StepMonth = m('StepMonth', { delta: S.Int })

/** Steps the visible year forward or backward by `delta` years. */
export const StepYear = m('StepYear', { delta: S.Int })

/** Pages the year-picker cursor forward (`1`) or backward (`-1`) by one page. */
export const PageYears = m('PageYears', { direction: StepDirection })

/** Jumps focus and visible month to `props.today` in `Day` view. */
export const JumpToToday = m('JumpToToday')

/** Switches directly to `mode` (`'Day' | 'Month' | 'Year'`). */
export const SetViewMode = m('SetViewMode', { mode: ViewMode })

/** Zooms out one level (`Day -> Month`, `Month -> Year`). */
export const ZoomOutView = m('ZoomOutView')

/** Drills from `Month` view into `month` (1..12) and returns to `Day` view. */
export const DrillIntoMonth = m('DrillIntoMonth', { month: MonthNumber })

/** Drills from `Year` view into `year` and returns to `Month` view. */
export const DrillIntoYear = m('DrillIntoYear', { year: S.Int })

/** Drops directly back to `Day` view, reconciling focus into the visible month. */
export const DropToDayView = m('DropToDayView')

/** Handles a 2D keyboard navigation key press in the active view mode. */
export const PressedGridKey = m('PressedGridKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
})

/** Every Message the `DateGrid` Machine handles. */
export const Message = S.Union([
  FocusDate,
  StepMonth,
  StepYear,
  PageYears,
  JumpToToday,
  SetViewMode,
  ZoomOutView,
  DrillIntoMonth,
  DrillIntoYear,
  DropToDayView,
  PressedGridKey,
])
/** Every Message the `DateGrid` Machine handles. */
export type Message = typeof Message.Type

/** True for a Message of the `DateGrid` block. */
export const isMessage = S.is(Message)

// CONFIG & STATE READERS

/** Extracts `Constraints` from `DateGrid.Props`. */
export const constraintsOf = (props: Props): Constraints => ({
  ...(props.minDate === undefined ? {} : { minDate: props.minDate }),
  ...(props.maxDate === undefined ? {} : { maxDate: props.maxDate }),
  ...(props.disabledDates === undefined
    ? {}
    : { disabledDates: props.disabledDates }),
  ...(props.disabledDaysOfWeek === undefined
    ? {}
    : { disabledDaysOfWeek: props.disabledDaysOfWeek }),
})

/** Resolved `firstDayOfWeek` (`'Sunday'` by default). */
export const firstDayOfWeekOf = (
  props: Pick<Props, 'firstDayOfWeek'> = {},
): DayOfWeek => props.firstDayOfWeek ?? 'Sunday'

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** Resolved fixed-weeks policy (`true` by default). */
export const fixedWeeksOf = (props: Pick<Props, 'fixedWeeks'> = {}): boolean =>
  props.fixedWeeks ?? true

/** Resolved month-picker column count (`3` by default). */
export const monthsGridColumnsOf = (
  props: Pick<Props, 'monthsGridColumns'> = {},
): number => Math.max(1, props.monthsGridColumns ?? MONTHS_GRID_COLUMNS)

/** Resolved year-picker column count (`3` by default). */
export const yearsGridColumnsOf = (
  props: Pick<Props, 'yearsGridColumns'> = {},
): number => Math.max(1, props.yearsGridColumns ?? YEARS_GRID_COLUMNS)

/** Resolved year-picker page size (`12` by default). */
export const yearsPageSizeOf = (
  props: Pick<Props, 'yearsPageSize'> = {},
): number => Math.max(1, props.yearsPageSize ?? YEARS_PAGE_SIZE)

/** Current active view mode (`'Day' | 'Month' | 'Year'`). */
export const viewModeOf = (state: State): ViewMode => state._tag

/** Current focused date, defaulting to `props.today`. */
export const focusedDateOf = (state: State, props: Props): CalendarDate =>
  Option.getOrElse(state.maybeFocusedDate, () => props.today)

/** Current visible `(year, month)`, defaulting to the focused date's month. */
export const viewMonthOf = (state: State, props: Props): YearMonth =>
  Option.getOrElse(state.maybeViewMonth, () => {
    const focus = focusedDateOf(state, props)
    return { year: focus.year, month: focus.month }
  })

/** Generates the currently visible `MonthGrid` for `state` and `props`. */
export const visibleMonthGridOf = (state: State, props: Props): MonthGrid => {
  const viewMonth = viewMonthOf(state, props)
  return monthGrid({
    year: viewMonth.year,
    month: viewMonth.month,
    firstDayOfWeek: firstDayOfWeekOf(props),
    fixedWeeks: fixedWeeksOf(props),
    constraints: constraintsOf(props),
  })
}

/** Generates the currently visible `MonthsGrid` for `state` and `props`. */
export const visibleMonthsGridOf = (state: State, props: Props): MonthsGrid => {
  const viewMonth = viewMonthOf(state, props)
  return monthsGrid({
    year: viewMonth.year,
    columns: monthsGridColumnsOf(props),
    constraints: constraintsOf(props),
  })
}

/** Generates the currently visible `YearsGrid` centered on the focused cursor year. */
export const visibleYearsGridOf = (state: State, props: Props): YearsGrid => {
  const focus = focusedDateOf(state, props)
  return yearsGrid({
    year: focus.year,
    pageSize: yearsPageSizeOf(props),
    columns: yearsGridColumnsOf(props),
    constraints: constraintsOf(props),
  })
}

// CHART HELPERS

type StateVariant<Tag extends ViewMode> = Extract<State, { readonly _tag: Tag }>

const makeDay = (
  viewYear: number,
  viewMonth: number,
  focusedDate: CalendarDate,
): Day =>
  Day({
    maybeViewMonth: Option.some({ year: viewYear, month: viewMonth }),
    maybeFocusedDate: Option.some(focusedDate),
  })

const makeMonth = (
  viewYear: number,
  viewMonth: number,
  focusedDate: CalendarDate,
): Month =>
  Month({
    maybeViewMonth: Option.some({ year: viewYear, month: viewMonth }),
    maybeFocusedDate: Option.some(focusedDate),
  })

const makeYear = (
  viewYear: number,
  viewMonth: number,
  focusedDate: CalendarDate,
): Year =>
  Year({
    maybeViewMonth: Option.some({ year: viewYear, month: viewMonth }),
    maybeFocusedDate: Option.some(focusedDate),
  })

const stepMonthState = <Tag extends ViewMode>(
  state: StateVariant<Tag>,
  delta: number,
  context: Props,
  makeTarget: (
    viewYear: number,
    viewMonth: number,
    focusedDate: CalendarDate,
  ) => StateVariant<Tag>,
): Option.Option<StateVariant<Tag>> => {
  if (delta === 0) {
    return Option.none()
  }
  const current = viewMonthOf(state, context)
  const targetFirst = addMonths(makeDate(current.year, current.month, 1), delta)
  const constraints = constraintsOf(context)
  if (isMonthDisabled(targetFirst.year, targetFirst.month, constraints)) {
    return Option.none()
  }
  const direction: StepDirection = delta > 0 ? 1 : -1
  const nextFocus = moveFocusForViewMonth({
    maybeFocusedDate: Option.some(focusedDateOf(state, context)),
    year: targetFirst.year,
    month: targetFirst.month,
    direction,
    constraints,
  })
  return Option.some(makeTarget(targetFirst.year, targetFirst.month, nextFocus))
}

const stepYearState = <Tag extends ViewMode>(
  state: StateVariant<Tag>,
  delta: number,
  context: Props,
  makeTarget: (
    viewYear: number,
    viewMonth: number,
    focusedDate: CalendarDate,
  ) => StateVariant<Tag>,
): Option.Option<StateVariant<Tag>> => {
  if (delta === 0) {
    return Option.none()
  }
  const current = viewMonthOf(state, context)
  const targetYear = current.year + delta
  const constraints = constraintsOf(context)
  if (isYearDisabled(targetYear, constraints)) {
    return Option.none()
  }
  const direction: StepDirection = delta > 0 ? 1 : -1
  const nextFocus = moveFocusForViewMonth({
    maybeFocusedDate: Option.some(focusedDateOf(state, context)),
    year: targetYear,
    month: current.month,
    direction,
    constraints,
  })
  const nextViewMonth = isMonthDisabled(targetYear, current.month, constraints)
    ? nextFocus.month
    : current.month
  return Option.some(makeTarget(nextFocus.year, nextViewMonth, nextFocus))
}

const setViewModeEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SetViewMode.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof SetViewMode.Type) => message.mode === 'Day',
    'Day',
    ({ state, context }) => {
      const view = viewMonthOf(state, context)
      const reconciled = reconcileFocusInMonth(
        view.year,
        view.month,
        Option.some(focusedDateOf(state, context)),
      )
      return makeDay(view.year, view.month, reconciled)
    },
  ),
  when(
    (_state: S, message: typeof SetViewMode.Type) => message.mode === 'Month',
    'Month',
    ({ state }) =>
      Month({
        maybeViewMonth: state.maybeViewMonth,
        maybeFocusedDate: state.maybeFocusedDate,
      }),
  ),
  when(
    (_state: S, message: typeof SetViewMode.Type) => message.mode === 'Year',
    'Year',
    ({ state }) =>
      Year({
        maybeViewMonth: state.maybeViewMonth,
        maybeFocusedDate: state.maybeFocusedDate,
      }),
  ),
  ignore(),
]

const jumpToTodayTarget = (context: Props): Day => {
  const constraints = constraintsOf(context)
  const target = Option.getOrElse(
    findNearestEnabledDate(context.today, constraints),
    () => clampDate(context.today, constraints),
  )
  return makeDay(target.year, target.month, target)
}

// CHART

/**
 * Builds the `DateGrid` Machine chart starting in `initialState`: `Day`,
 * `Month`, and `Year` view switching, 2D keyboard navigation with disabled-date
 * skipping, month/year/decade stepping, today jump, and focus reconciliation.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Day: {
        on: {
          FocusDate: to('Day', ({ message }) =>
            makeDay(message.date.year, message.date.month, message.date),
          ),
          StepMonth: [
            when(
              (state, message, context) =>
                stepMonthState(state, message.delta, context, makeDay),
              'Day',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          StepYear: [
            when(
              (state, message, context) =>
                stepYearState(state, message.delta, context, makeDay),
              'Day',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          JumpToToday: to('Day', ({ context }) => jumpToTodayTarget(context)),
          SetViewMode: setViewModeEdges<Day>(),
          ZoomOutView: to('Month', ({ state }) =>
            Month({
              maybeViewMonth: state.maybeViewMonth,
              maybeFocusedDate: state.maybeFocusedDate,
            }),
          ),
          DropToDayView: to('Day', ({ state, context }) => {
            const view = viewMonthOf(state, context)
            const reconciled = reconcileFocusInMonth(
              view.year,
              view.month,
              Option.some(focusedDateOf(state, context)),
            )
            return makeDay(view.year, view.month, reconciled)
          }),
          PressedGridKey: [
            when(
              (state, message, context) =>
                navigateDay({
                  key: message.key,
                  ...(message.isShift === undefined
                    ? {}
                    : { isShift: message.isShift }),
                  focused: focusedDateOf(state, context),
                  firstDayOfWeek: firstDayOfWeekOf(context),
                  direction: directionOf(context),
                  constraints: constraintsOf(context),
                }),
              'Day',
              ({ guardValue }) =>
                makeDay(guardValue.year, guardValue.month, guardValue),
            ),
            ignore(),
          ],
        },
      },
      Month: {
        on: {
          FocusDate: to('Month', ({ message }) =>
            makeMonth(message.date.year, message.date.month, message.date),
          ),
          StepMonth: [
            when(
              (state, message, context) =>
                stepMonthState(state, message.delta, context, makeMonth),
              'Month',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          StepYear: [
            when(
              (state, message, context) =>
                stepYearState(state, message.delta, context, makeMonth),
              'Month',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          JumpToToday: to('Day', ({ context }) => jumpToTodayTarget(context)),
          SetViewMode: setViewModeEdges<Month>(),
          ZoomOutView: to('Year', ({ state }) =>
            Year({
              maybeViewMonth: state.maybeViewMonth,
              maybeFocusedDate: state.maybeFocusedDate,
            }),
          ),
          DrillIntoMonth: [
            when(
              (state, message, context) => {
                const view = viewMonthOf(state, context)
                const constraints = constraintsOf(context)
                if (isMonthDisabled(view.year, message.month, constraints)) {
                  return Option.none()
                }
                const direction = jumpDirection(
                  view.year,
                  view.month,
                  view.year,
                  message.month,
                )
                const nextFocus = moveFocusForViewMonth({
                  maybeFocusedDate: Option.some(focusedDateOf(state, context)),
                  year: view.year,
                  month: message.month,
                  direction,
                  constraints,
                })
                return Option.some(makeDay(view.year, message.month, nextFocus))
              },
              'Day',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          DropToDayView: to('Day', ({ state, context }) => {
            const view = viewMonthOf(state, context)
            const reconciled = reconcileFocusInMonth(
              view.year,
              view.month,
              Option.some(focusedDateOf(state, context)),
            )
            return makeDay(view.year, view.month, reconciled)
          }),
          PressedGridKey: [
            when(
              (state, message, context) =>
                navigateMonth({
                  key: message.key,
                  focused: focusedDateOf(state, context),
                  columns: monthsGridColumnsOf(context),
                  direction: directionOf(context),
                  constraints: constraintsOf(context),
                }),
              'Month',
              ({ state, guardValue, context }) => {
                const view = viewMonthOf(state, context)
                return makeMonth(guardValue.year, view.month, guardValue)
              },
            ),
            ignore(),
          ],
        },
      },
      Year: {
        on: {
          FocusDate: to('Year', ({ message }) =>
            makeYear(message.date.year, message.date.month, message.date),
          ),
          StepMonth: [
            when(
              (state, message, context) =>
                stepMonthState(state, message.delta, context, makeYear),
              'Year',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          StepYear: [
            when(
              (state, message, context) =>
                stepYearState(state, message.delta, context, makeYear),
              'Year',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          PageYears: to('Year', ({ state, message, context }) => {
            const focus = focusedDateOf(state, context)
            const view = viewMonthOf(state, context)
            const nextFocus = addYears(
              focus,
              message.direction * yearsPageSizeOf(context),
            )
            return makeYear(view.year, view.month, nextFocus)
          }),
          JumpToToday: to('Day', ({ context }) => jumpToTodayTarget(context)),
          SetViewMode: setViewModeEdges<Year>(),
          DrillIntoYear: [
            when(
              (state, message, context) => {
                const view = viewMonthOf(state, context)
                const constraints = constraintsOf(context)
                if (isYearDisabled(message.year, constraints)) {
                  return Option.none()
                }
                const direction = jumpDirection(
                  view.year,
                  view.month,
                  message.year,
                  view.month,
                )
                const nextFocus = moveFocusForViewMonth({
                  maybeFocusedDate: Option.some(focusedDateOf(state, context)),
                  year: message.year,
                  month: view.month,
                  direction,
                  constraints,
                })
                return Option.some(
                  makeMonth(message.year, view.month, nextFocus),
                )
              },
              'Month',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          DropToDayView: to('Day', ({ state, context }) => {
            const view = viewMonthOf(state, context)
            const reconciled = reconcileFocusInMonth(
              view.year,
              view.month,
              Option.some(focusedDateOf(state, context)),
            )
            return makeDay(view.year, view.month, reconciled)
          }),
          PressedGridKey: [
            when(
              (state, message, context) =>
                navigateYear({
                  key: message.key,
                  focused: focusedDateOf(state, context),
                  columns: yearsGridColumnsOf(context),
                  pageSize: yearsPageSizeOf(context),
                  direction: directionOf(context),
                  constraints: constraintsOf(context),
                }),
              'Year',
              ({ state, guardValue, context }) => {
                const view = viewMonthOf(state, context)
                return makeYear(view.year, view.month, guardValue)
              },
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default `DateGrid` Machine chart starting in `Day` view. */
export const chart = chartOf(initial)

// SYNC & REST

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  FocusDate: pace,
  StepMonth: pace,
  StepYear: pace,
  PageYears: pace,
  JumpToToday: pace,
  SetViewMode: pace,
  ZoomOutView: pace,
  DrillIntoMonth: pace,
  DrillIntoYear: pace,
  DropToDayView: pace,
  PressedGridKey: pace,
})

/** Default synchronization: every `DateGrid` Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a `DateGrid` kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

/** Default sync table when used as a standalone block. */
export const sync: Readonly<Record<Message['_tag'], Sync>> = synced

/**
 * What a restart opens `DateGrid` on: returns to `Day` view while keeping the
 * visible month and reconciling any focused date into that visible month.
 */
export const atRest = (state: State): State =>
  Option.match(state.maybeViewMonth, {
    onNone: () =>
      Day({
        maybeViewMonth: Option.none(),
        maybeFocusedDate: state.maybeFocusedDate,
      }),
    onSome: view =>
      Day({
        maybeViewMonth: Option.some(view),
        maybeFocusedDate: Option.map(state.maybeFocusedDate, focused =>
          reconcileFocusInMonth(view.year, view.month, Option.some(focused)),
        ),
      }),
  })
