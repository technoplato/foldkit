import { Array, Match as M, Option, Schema as S, pipe } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import type { BoxLayer } from '../renderers/types.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as Calendar from './calendar.js'
import * as DateGrid from './dateGrid.js'
import * as Layers from './layers.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as RovingFocus from './rovingFocus.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core DatePicker Part (Widget #20 of 54, Scribe #2660).
// It composes `Calendar`, `DateGrid`, `Placement`, and `Layers` into one
// framework-free Machine and Part declaration covering packages/ui DatePicker
// and Zag date-picker / date-input. Its state (`Closed` | `Open`) lives in the
// Model, synced by default (`Domain` category, `Pace.Synced`) with
// `DatePicker.make` and `DatePicker.deviceOnly()`, and projects reference-
// stable SlotBindings (`Trigger`, `Input`, `Content`, `Grid`, `GridCell`,
// `PreviousMonthButton`, `NextMonthButton`, `Heading`, `ClearButton`, `Label`,
// `Description`, `Error`, `Backdrop`) rendered by HTML, React, and React
// Native generic hosts with zero DatePicker-specific painter logic.

// CONSTANTS

/** Default separator between start and end dates in formatted range strings. */
export const defaultRangeSeparator = ' - '

/** Default placeholder shown for ISO single-date text inputs (`'YYYY-MM-DD'`). */
export const defaultIsoPlaceholder = 'YYYY-MM-DD'

/** Default placeholder shown for US month-day-year text inputs (`'MM/DD/YYYY'`). */
export const defaultMonthDayYearPlaceholder = 'MM/DD/YYYY'

/** Default placeholder shown for European day-month-year text inputs (`'DD/MM/YYYY'`). */
export const defaultDayMonthYearPlaceholder = 'DD/MM/YYYY'

const PAD_TWO = 2
const PAD_FOUR = 4
const RANGE_ENDPOINT_COUNT = 2
const ISO_FLEXIBLE_PATTERN = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/u
const SLASH_OR_DASH_PATTERN = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/u
const VALID_DATE_INPUT_CHARS_PATTERN = /[^\d\-/. ]/gu
const DEFAULT_RANGE_SEPARATORS: ReadonlyArray<string> = [
  defaultRangeSeparator,
  ' to ',
  '..',
]

// SCHEMAS

/** Whether the date picker selects a single date (`Single`) or an inclusive date range (`Range`). */
export const SelectionMode = Calendar.SelectionMode
/** Whether the date picker selects a single date or an inclusive date range. */
export type SelectionMode = Calendar.SelectionMode

/** Supported pure date text input formats (`'Iso'`, `'MonthDayYear'`, `'DayMonthYear'`). */
export const DateInputFormat = S.Literals([
  'Iso',
  'MonthDayYear',
  'DayMonthYear',
])
/** Supported pure date text input formats. */
export type DateInputFormat = typeof DateInputFormat.Type

/** Optional placement spacing overrides for the DatePicker popup content. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides. */
export type PlacementOptions = typeof PlacementOptions.Type

/** Trigger labeled directly via `aria-label`. */
export const TriggerAriaLabel = ts('AriaLabel', { value: S.String })
/** Trigger labeled directly via `aria-label`. */
export type TriggerAriaLabel = typeof TriggerAriaLabel.Type

/** Trigger labeled via `aria-labelledby`. */
export const TriggerAriaLabelledBy = ts('AriaLabelledBy', { value: S.String })
/** Trigger labeled via `aria-labelledby`. */
export type TriggerAriaLabelledBy = typeof TriggerAriaLabelledBy.Type

/** Resolved label attribute source for thin painters (`aria-label` wins over `aria-labelledby`). */
export const TriggerLabelSource = S.Union([
  TriggerAriaLabel,
  TriggerAriaLabelledBy,
])
/** Resolved label attribute source for thin painters. */
export type TriggerLabelSource = typeof TriggerLabelSource.Type

/**
 * Read-only props supplied to the DatePicker chart and projection from the
 * Program's Model. Today's date, constraints, layer stack, placement spacing,
 * and accessibility linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  today: DateGrid.CalendarDate,
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  hasDescription: S.optionalKey(S.Boolean),
  hasError: S.optionalKey(S.Boolean),
  placeholder: S.optionalKey(S.String),
  inputFormat: S.optionalKey(DateInputFormat),
  rangeSeparator: S.optionalKey(S.String),
  selectionMode: S.optionalKey(SelectionMode),
  firstDayOfWeek: S.optionalKey(DateGrid.DayOfWeek),
  direction: S.optionalKey(RovingFocus.Direction),
  fixedWeeks: S.optionalKey(S.Boolean),
  minDate: S.optionalKey(DateGrid.CalendarDate),
  maxDate: S.optionalKey(DateGrid.CalendarDate),
  disabledDates: S.optionalKey(S.Array(DateGrid.CalendarDate)),
  disabledDaysOfWeek: S.optionalKey(S.Array(DateGrid.DayOfWeek)),
  deselectable: S.optionalKey(S.Boolean),
  allowDisabledInRange: S.optionalKey(S.Boolean),
  closeOnSelect: S.optionalKey(S.Boolean),
  closeOnClear: S.optionalKey(S.Boolean),
  openOnInputClick: S.optionalKey(S.Boolean),
  fixOnBlur: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultFocusedDate: S.optionalKey(DateGrid.CalendarDate),
  monthsGridColumns: S.optionalKey(S.Int),
  yearsGridColumns: S.optionalKey(S.Int),
  yearsPageSize: S.optionalKey(S.Int),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
  layers: S.optionalKey(Layers.Stack),
  placement: S.optionalKey(PlacementOptions),
})
/** Read-only props supplied to the DatePicker chart and projection. */
export type Props = typeof Props.Type

// STATE

const stateFields = {
  calendar: Calendar.State,
  maybeInputDraft: S.Option(S.String),
}

/** The date picker popup is closed while retaining its embedded Calendar state and any pending input draft. */
export const Closed = ts('Closed', stateFields)
/** The date picker popup is closed. */
export type Closed = typeof Closed.Type

/** The date picker popup is open, coordinating the embedded Calendar and dismissable layer. */
export const Open = ts('Open', stateFields)
/** The date picker popup is open. */
export type Open = typeof Open.Type

/** Where a DatePicker Part stands: `Closed` or `Open`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Closed, Open])
/** Where a DatePicker Part stands. */
export type State = typeof State.Type

/** Initial DatePicker state: closed, empty Calendar selection, no text draft. */
export const initial: State = Closed({
  calendar: Calendar.initial,
  maybeInputDraft: Option.none(),
})

/** Creates an initial closed DatePicker state with `date` pre-selected and focused. */
export const initialDate = (
  date: DateGrid.CalendarDate,
  viewMode: DateGrid.ViewMode = 'Day',
): State =>
  Closed({
    calendar: Calendar.initialDate(date, viewMode),
    maybeInputDraft: Option.none(),
  })

/** Creates an initial closed DatePicker state with the normalized `[start, end]` range pre-selected. */
export const initialRange = (
  start: DateGrid.CalendarDate,
  end: DateGrid.CalendarDate,
  viewMode: DateGrid.ViewMode = 'Day',
): State =>
  Closed({
    calendar: Calendar.initialRange(start, end, viewMode),
    maybeInputDraft: Option.none(),
  })

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Opens the date picker calendar popup. */
export const OpenDatePicker = Catalog.action('OpenDatePicker', {
  what: 'Opens the date picker calendar',
  why: 'To browse and choose a day or range',
  meta: { label: 'Open date picker', keys: [] },
})

/** Closes the open date picker calendar popup unconditionally. */
export const CloseDatePicker = Catalog.action('CloseDatePicker', {
  what: 'Closes the open date picker calendar',
  why: 'To hide the schedule view and return to the field',
  meta: { label: 'Close date picker', keys: [] },
})

/** Opens the date picker popup when closed or closes it when open. */
export const ToggleDatePicker = Catalog.action('ToggleDatePicker', {
  what: 'Opens the date picker or closes it when open',
  why: 'To reveal or hide the calendar view',
  meta: { label: 'Toggle date picker', keys: [] },
})

/** Dismisses the open date picker popup when it is the topmost dismissable layer. */
export const DismissDatePicker = Catalog.action('DismissDatePicker', {
  what: 'Dismisses the open date picker when it is the topmost layer',
  why: 'To leave without altering the chosen value',
  meta: { label: 'Dismiss date picker', keys: [] },
})

/** Selects an enabled date (or starts/completes a range in `Range` mode). */
export const SelectDatePickerDate = Catalog.action('SelectDatePickerDate', {
  fields: { date: DateGrid.CalendarDate },
  choose: {
    field: 'date',
    noun: 'date',
    prompt: 'Select which date?',
    token: DateGrid.CalendarDateFromIsoString,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No date is available',
  },
  what: 'Selects the chosen date in the date picker',
  why: 'To commit a day or complete a range',
  meta: { label: 'Select date', keys: [] },
})

/** Clears the current date or range selection. */
export const ClearDatePicker = Catalog.action('ClearDatePicker', {
  what: 'Clears the current date picker value',
  why: 'To leave the field empty',
  meta: { label: 'Clear date', keys: [] },
})

/** Updates the date text draft as the user enters characters. */
export const ChangeDateInput = Catalog.action('ChangeDateInput', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'date text',
    prompt: 'Enter a date',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No date text to enter',
  },
  what: 'Updates the date text entry with the typed characters',
  why: 'To enter a date directly by keyboard',
  meta: { label: 'Change date input', keys: [] },
})

/** Commits the current typed date input draft into the selection. */
export const CommitDateInput = Catalog.action('CommitDateInput', {
  what: 'Commits the entered date text as the chosen value',
  why: 'To apply a typed date or range',
  meta: { label: 'Commit date input', keys: [] },
})

/** Steps the embedded calendar backward by one month. */
export const PreviousDatePickerMonth = Catalog.action(
  'PreviousDatePickerMonth',
  {
    what: 'Moves the date picker calendar backward by one month',
    why: 'To browse days in the preceding month',
    meta: { label: 'Previous month', keys: [] },
  },
)

/** Steps the embedded calendar forward by one month. */
export const NextDatePickerMonth = Catalog.action('NextDatePickerMonth', {
  what: 'Moves the date picker calendar forward by one month',
  why: 'To browse days in the following month',
  meta: { label: 'Next month', keys: [] },
})

/** Steps the embedded calendar backward by one year. */
export const PreviousDatePickerYear = Catalog.action('PreviousDatePickerYear', {
  what: 'Moves the date picker calendar backward by one year',
  why: 'To jump to the same month in the preceding year',
  meta: { label: 'Previous year', keys: [] },
})

/** Steps the embedded calendar forward by one year. */
export const NextDatePickerYear = Catalog.action('NextDatePickerYear', {
  what: 'Moves the date picker calendar forward by one year',
  why: 'To jump to the same month in the following year',
  meta: { label: 'Next year', keys: [] },
})

/** Focuses today's date in the embedded calendar and shows its month in `Day` view. */
export const JumpDatePickerToToday = Catalog.action('JumpDatePickerToToday', {
  what: 'Focuses the current day and shows its month',
  why: 'To return quickly to today',
  meta: { label: 'Today', keys: [] },
})

/** Switches the embedded calendar heading view out one level (`Day -> Month`, `Month -> Year`). */
export const ZoomOutDatePickerView = Catalog.action('ZoomOutDatePickerView', {
  what: 'Switches the date picker calendar to the next broader time scale',
  why: 'To pick a month or year rapidly instead of stepping month by month',
  meta: { label: 'Switch calendar view', keys: [] },
})

/** The Catalog Actions a DatePicker Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenDatePicker,
  CloseDatePicker,
  ToggleDatePicker,
  DismissDatePicker,
  SelectDatePickerDate,
  ClearDatePicker,
  ChangeDateInput,
  CommitDateInput,
  PreviousDatePickerMonth,
  NextDatePickerMonth,
  PreviousDatePickerYear,
  NextDatePickerYear,
  JumpDatePickerToToday,
  ZoomOutDatePickerView,
]

// MESSAGES (Facts in addition to the Actions above)

/** A key was pressed while focus is on the date picker trigger button. */
export const PressedTriggerKey = m('PressedTriggerKey', {
  key: S.String,
})

/** A key was pressed while interacting with the open date picker calendar. */
export const PressedDatePickerKey = m('PressedDatePickerKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
})

/** A key was pressed while focus is in the date picker text input. */
export const PressedInputKey = m('PressedInputKey', {
  key: S.String,
})

/** The date picker text input was activated; opens the popup when `openOnInputClick` is enabled. */
export const ClickedDateInput = m('ClickedDateInput')

/** Focus left the date picker text input; commits valid drafts or reverts invalid ones when `fixOnBlur` is true. */
export const BlurredDateInput = m('BlurredDateInput')

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideDatePicker = m('PressedOutsideDatePicker', {
  insideIds: S.Array(S.String),
})

/** Moves the embedded calendar view and cursor to `date` without changing selection. */
export const FocusDatePickerDate = m('FocusDatePickerDate', {
  date: DateGrid.CalendarDate,
})

/** Pointer hovered `date` inside the open calendar, updating range preview while in `RangeStart`. */
export const HoverDatePickerDate = m('HoverDatePickerDate', {
  date: DateGrid.CalendarDate,
})

/** Pointer left the calendar cells, clearing any range hover preview. */
export const LeaveDatePickerDate = m('LeaveDatePickerDate')

/** Picks a month (1..12) from `Month` view and drills back to `Day` view. */
export const SelectDatePickerMonth = m('SelectDatePickerMonth', {
  month: DateGrid.MonthNumber,
})

/** Picks a year from `Year` view and drills into `Month` view. */
export const SelectDatePickerYear = m('SelectDatePickerYear', {
  year: S.Int,
})

/** Pages the `Year` view window forward (`1`) or backward (`-1`). */
export const PageDatePickerYears = m('PageDatePickerYears', {
  direction: DateGrid.StepDirection,
})

/** Sets the active embedded calendar view mode (`'Day' | 'Month' | 'Year'`). */
export const SetDatePickerViewMode = m('SetDatePickerViewMode', {
  mode: DateGrid.ViewMode,
})

/** Programmatically selects a normalized inclusive date range in `Range` mode. */
export const SetDatePickerRange = m('SetDatePickerRange', {
  start: DateGrid.CalendarDate,
  end: DateGrid.CalendarDate,
})

/** Resets selection and text draft, drops calendar to `Day` view, and closes the popup. */
export const ResetDatePicker = m('ResetDatePicker')

/** Every Message the DatePicker chart handles. */
export const Message = S.Union([
  OpenDatePicker,
  CloseDatePicker,
  ToggleDatePicker,
  DismissDatePicker,
  SelectDatePickerDate,
  ClearDatePicker,
  ChangeDateInput,
  CommitDateInput,
  PreviousDatePickerMonth,
  NextDatePickerMonth,
  PreviousDatePickerYear,
  NextDatePickerYear,
  JumpDatePickerToToday,
  ZoomOutDatePickerView,
  PressedTriggerKey,
  PressedDatePickerKey,
  PressedInputKey,
  ClickedDateInput,
  BlurredDateInput,
  PressedOutsideDatePicker,
  FocusDatePickerDate,
  HoverDatePickerDate,
  LeaveDatePickerDate,
  SelectDatePickerMonth,
  SelectDatePickerYear,
  PageDatePickerYears,
  SetDatePickerViewMode,
  SetDatePickerRange,
  ResetDatePicker,
])
/** Every Message the DatePicker chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the DatePicker Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui DatePicker)

/** Derives the root date picker element id from a base `id`. */
export const datePickerId = (id: string): string => `${id}-date-picker`

/** Derives the trigger button element id from a base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the text input element id from a base `id`. */
export const inputId = (id: string): string => `${id}-input`

/** Derives the popup dialog container element id (`role="dialog"`) from a base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives the clear button element id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

/** Derives the label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the description element id referenced by `aria-describedby` from a base `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** Derives the validation error element id from a base `id`. */
export const errorId = (id: string): string => `${id}-error`

/** Derives the embedded Calendar submodel id (`${id}-calendar`) for thin painters such as `@foldkit/ui`. */
export const calendarId = (id: string): string => `${id}-calendar`

/** Derives the embedded Popover submodel id (`${id}-popover`) for thin painters such as `@foldkit/ui`. */
export const popoverId = (id: string): string => `${id}-popover`

// PURE DATE-INPUT PARSING & FORMATTING HELPERS

const decodeCalendarDateOption = S.decodeUnknownOption(DateGrid.CalendarDate)

const padNumber = (value: number, width: number): string =>
  String(value).padStart(width, '0')

/**
 * Formats a {@link DateGrid.CalendarDate} according to `format` (`'Iso'` by
 * default, producing zero-padded `YYYY-MM-DD`).
 *
 * @example
 * ```typescript
 * formatDate(DateGrid.makeDate(2026, 4, 5)) // '2026-04-05'
 * formatDate(DateGrid.makeDate(2026, 4, 5), 'MonthDayYear') // '04/05/2026'
 * formatDate(DateGrid.makeDate(2026, 4, 5), 'DayMonthYear') // '05/04/2026'
 * ```
 */
export const formatDate = (
  date: DateGrid.CalendarDate,
  format: DateInputFormat = 'Iso',
): string =>
  M.value(format).pipe(
    M.withReturnType<string>(),
    M.when('Iso', () => DateGrid.formatIso(date)),
    M.when(
      'MonthDayYear',
      () =>
        `${padNumber(date.month, PAD_TWO)}/${padNumber(date.day, PAD_TWO)}/${padNumber(date.year, PAD_FOUR)}`,
    ),
    M.when(
      'DayMonthYear',
      () =>
        `${padNumber(date.day, PAD_TWO)}/${padNumber(date.month, PAD_TWO)}/${padNumber(date.year, PAD_FOUR)}`,
    ),
    M.exhaustive,
  )

/**
 * Formats an optional {@link DateGrid.CalendarDate} as an ISO `YYYY-MM-DD`
 * string, or `''` when absent. Shared by hidden form inputs and thin painters.
 *
 * @example
 * ```typescript
 * formatOptionalDate(Option.none()) // ''
 * formatOptionalDate(Option.some(DateGrid.makeDate(2026, 4, 5))) // '2026-04-05'
 * ```
 */
export const formatOptionalDate = (
  maybeDate: Option.Option<DateGrid.CalendarDate>,
  format: DateInputFormat = 'Iso',
): string =>
  Option.match(maybeDate, {
    onNone: () => '',
    onSome: date => formatDate(date, format),
  })

/**
 * Formats a {@link Calendar.Selection} into display text using `format` and
 * `separator` (`' - '` by default).
 *
 * @example
 * ```typescript
 * formatSelection(Calendar.SingleDate({ date: DateGrid.makeDate(2026, 4, 13) })) // '2026-04-13'
 * formatSelection(Calendar.DateRangeSelected({ start: DateGrid.makeDate(2026, 4, 10), end: DateGrid.makeDate(2026, 4, 14) }))
 * // '2026-04-10 - 2026-04-14'
 * ```
 */
export const formatSelection = (
  selection: Calendar.Selection,
  format: DateInputFormat = 'Iso',
  separator: string = defaultRangeSeparator,
): string =>
  M.value(selection).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      NoneSelected: () => '',
      SingleDate: ({ date }) => formatDate(date, format),
      RangeStart: ({ start }) => formatDate(start, format),
      DateRangeSelected: ({ start, end }) =>
        `${formatDate(start, format)}${separator}${formatDate(end, format)}`,
    }),
  )

const decodeParts = (
  yearText: string | undefined,
  monthText: string | undefined,
  dayText: string | undefined,
): Option.Option<DateGrid.CalendarDate> => {
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined
  ) {
    return Option.none()
  }
  return decodeCalendarDateOption({
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  })
}

const parseFlexibleIso = (text: string): Option.Option<DateGrid.CalendarDate> =>
  Option.orElse(DateGrid.parseIso(text), () => {
    const match = ISO_FLEXIBLE_PATTERN.exec(text)
    if (match === null) {
      return Option.none()
    }
    const [, yearText, monthText, dayText] = match
    return decodeParts(yearText, monthText, dayText)
  })

/**
 * Purely parses text into a validated {@link DateGrid.CalendarDate} without
 * calling `new Date()`. Rejects impossible calendar dates such as `2026-02-30`
 * and validates leap years via `CalendarDate` Schema.
 *
 * - `'Iso'` (default): parses `YYYY-MM-DD`, `YYYY-M-D`, `YYYY/MM/DD`, `YYYY/M/D`.
 * - `'MonthDayYear'`: parses `MM/DD/YYYY`, `M/D/YYYY`, `MM-DD-YYYY` (and falls back to ISO).
 * - `'DayMonthYear'`: parses `DD/MM/YYYY`, `D/M/YYYY`, `DD.MM.YYYY` (and falls back to ISO).
 *
 * @example
 * ```typescript
 * parseDateInput('2026-04-13') // Some({ year: 2026, month: 4, day: 13 })
 * parseDateInput('2026-02-30') // None
 * parseDateInput('04/13/2026', 'MonthDayYear') // Some({ year: 2026, month: 4, day: 13 })
 * ```
 */
export const parseDateInput = (
  text: string,
  format: DateInputFormat = 'Iso',
): Option.Option<DateGrid.CalendarDate> => {
  const trimmed = text.trim()
  if (trimmed === '') {
    return Option.none()
  }
  return M.value(format).pipe(
    M.withReturnType<Option.Option<DateGrid.CalendarDate>>(),
    M.when('Iso', () => parseFlexibleIso(trimmed)),
    M.when('MonthDayYear', () => {
      const match = SLASH_OR_DASH_PATTERN.exec(trimmed)
      if (match !== null) {
        const [, monthText, dayText, yearText] = match
        return decodeParts(yearText, monthText, dayText)
      }
      return parseFlexibleIso(trimmed)
    }),
    M.when('DayMonthYear', () => {
      const match = SLASH_OR_DASH_PATTERN.exec(trimmed)
      if (match !== null) {
        const [, dayText, monthText, yearText] = match
        return decodeParts(yearText, monthText, dayText)
      }
      return parseFlexibleIso(trimmed)
    }),
    M.exhaustive,
  )
}

/**
 * Purely parses a range string such as `'2026-04-10 - 2026-04-14'` into a
 * normalized inclusive {@link DateGrid.DateRange} (`start <= end`), or `None`.
 *
 * @example
 * ```typescript
 * parseDateRangeInput('2026-04-14 - 2026-04-10')
 * // Some({ start: { year: 2026, month: 4, day: 10 }, end: { year: 2026, month: 4, day: 14 } })
 * ```
 */
export const parseDateRangeInput = (
  text: string,
  options: Readonly<{
    format?: DateInputFormat
    separator?: string
  }> = {},
): Option.Option<DateGrid.DateRange> => {
  const format = options.format ?? 'Iso'
  const separators: ReadonlyArray<string> =
    options.separator !== undefined &&
    options.separator !== defaultRangeSeparator
      ? [options.separator]
      : DEFAULT_RANGE_SEPARATORS
  const trimmed = text.trim()
  if (trimmed === '') {
    return Option.none()
  }
  return pipe(
    separators,
    Array.findFirst(separator => trimmed.includes(separator)),
    Option.flatMap(separator => {
      const parts = trimmed.split(separator)
      if (parts.length !== RANGE_ENDPOINT_COUNT) {
        return Option.none()
      }
      return Option.flatMap(
        Option.all([Array.get(parts, 0), Array.get(parts, 1)]),
        ([leftText, rightText]) =>
          Option.map(
            Option.all([
              parseDateInput(leftText, format),
              parseDateInput(rightText, format),
            ]),
            ([first, second]) => DateGrid.normalizeRange(first, second),
          ),
      )
    }),
  )
}

/**
 * Strips characters that cannot appear in a date or date-range text input
 * (retaining digits, `-`, `/`, `.`, and spaces).
 */
export const sanitizeDateInput = (text: string): string =>
  text.replace(VALID_DATE_INPUT_CHARS_PATTERN, '')

/** Default format-aware placeholder for a single date or date range. */
export const defaultPlaceholderFor = (
  format: DateInputFormat = 'Iso',
  selectionMode: SelectionMode = 'Single',
  separator: string = defaultRangeSeparator,
): string => {
  const single = M.value(format).pipe(
    M.withReturnType<string>(),
    M.when('Iso', () => defaultIsoPlaceholder),
    M.when('MonthDayYear', () => defaultMonthDayYearPlaceholder),
    M.when('DayMonthYear', () => defaultDayMonthYearPlaceholder),
    M.exhaustive,
  )
  return selectionMode === 'Range' ? `${single}${separator}${single}` : single
}

// PURE RULES & CONFIG READERS

/** Resolved selection mode (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => Calendar.selectionModeOf(props)

/** True when `props` selects a date range rather than a single date. */
export const isRangeMode = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => Calendar.isRangeMode(props)

/** Resolved text input format (`'Iso'` by default). */
export const inputFormatOf = (
  props: Pick<Props, 'inputFormat'> = {},
): DateInputFormat => props.inputFormat ?? 'Iso'

/** Resolved range separator (`' - '` by default). */
export const rangeSeparatorOf = (
  props: Pick<Props, 'rangeSeparator'> = {},
): string => props.rangeSeparator ?? defaultRangeSeparator

/** Resolved input/trigger placeholder text. */
export const placeholderOf = (
  props: Pick<
    Props,
    'placeholder' | 'inputFormat' | 'selectionMode' | 'rangeSeparator'
  > = {},
): string =>
  props.placeholder ??
  defaultPlaceholderFor(
    inputFormatOf(props),
    selectionModeOf(props),
    rangeSeparatorOf(props),
  )

/** True when the date picker is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  Calendar.isDisabledOf(props)

/** True when the date picker is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  Calendar.isReadOnlyOf(props)

/** True when the date picker is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the date picker is explicitly marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when selecting a complete value automatically closes the popup (`true` by default). */
export const closeOnSelectOf = (
  props: Pick<Props, 'closeOnSelect'> = {},
): boolean => props.closeOnSelect ?? true

/** True when clearing the selection also closes an open popup (`false` by default). */
export const closeOnClearOf = (
  props: Pick<Props, 'closeOnClear'> = {},
): boolean => props.closeOnClear === true

/** True when activating the text input opens the calendar popup (`false` by default). */
export const openOnInputClickOf = (
  props: Pick<Props, 'openOnInputClick'> = {},
): boolean => props.openOnInputClick === true

/** True when blurring an invalid text draft reverts it to the last valid selection (`true` by default). */
export const fixOnBlurOf = (props: Pick<Props, 'fixOnBlur'> = {}): boolean =>
  props.fixOnBlur ?? true

/** True when the date picker popup is modal (`false` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal === true

/** True when pressing Escape is allowed to dismiss this date picker (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside is allowed to dismiss this date picker (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? true

/** True when selecting a date or typing into the input is permitted (neither disabled nor read-only). */
export const canPickDate = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/**
 * True when committing `selection` should automatically close an open popup:
 * `SingleDate` and completed `DateRangeSelected` close when `closeOnSelect` is
 * true; `RangeStart` and `NoneSelected` keep the popup open.
 */
export const shouldCloseAfterSelect = (
  selection: Calendar.Selection,
  props: Pick<Props, 'closeOnSelect'> = {},
): boolean => {
  if (!closeOnSelectOf(props)) {
    return false
  }
  return M.value(selection).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      NoneSelected: () => false,
      SingleDate: () => true,
      RangeStart: () => false,
      DateRangeSelected: () => true,
    }),
  )
}

/**
 * Resolves trigger accessible-name precedence for thin painters such as
 * `@foldkit/ui` `DatePicker`: `ariaLabel` wins over `ariaLabelledBy`, or
 * `None` when neither is provided.
 */
export const resolveTriggerLabel = (
  input: Readonly<{ ariaLabel?: string; ariaLabelledBy?: string }>,
): Option.Option<TriggerLabelSource> => {
  if (input.ariaLabel !== undefined) {
    return Option.some(TriggerAriaLabel({ value: input.ariaLabel }))
  } else if (input.ariaLabelledBy !== undefined) {
    return Option.some(TriggerAriaLabelledBy({ value: input.ariaLabelledBy }))
  } else {
    return Option.none()
  }
}

/** Projects `DatePicker.Props` onto the embedded {@link Calendar.Props}. */
export const calendarPropsOf = (props: Props): Calendar.Props => ({
  id: props.id,
  today: props.today,
  ...(props.selectionMode === undefined
    ? {}
    : { selectionMode: props.selectionMode }),
  ...(props.firstDayOfWeek === undefined
    ? {}
    : { firstDayOfWeek: props.firstDayOfWeek }),
  ...(props.direction === undefined ? {} : { direction: props.direction }),
  ...(props.fixedWeeks === undefined ? {} : { fixedWeeks: props.fixedWeeks }),
  ...(props.minDate === undefined ? {} : { minDate: props.minDate }),
  ...(props.maxDate === undefined ? {} : { maxDate: props.maxDate }),
  ...(props.disabledDates === undefined
    ? {}
    : { disabledDates: props.disabledDates }),
  ...(props.disabledDaysOfWeek === undefined
    ? {}
    : { disabledDaysOfWeek: props.disabledDaysOfWeek }),
  ...(props.deselectable === undefined
    ? {}
    : { deselectable: props.deselectable }),
  ...(props.allowDisabledInRange === undefined
    ? {}
    : { allowDisabledInRange: props.allowDisabledInRange }),
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.defaultFocusedDate === undefined
    ? {}
    : { defaultFocusedDate: props.defaultFocusedDate }),
  ...(props.monthsGridColumns === undefined
    ? {}
    : { monthsGridColumns: props.monthsGridColumns }),
  ...(props.yearsGridColumns === undefined
    ? {}
    : { yearsGridColumns: props.yearsGridColumns }),
  ...(props.yearsPageSize === undefined
    ? {}
    : { yearsPageSize: props.yearsPageSize }),
})

/** Extracts {@link DateGrid.Constraints} from `DatePicker.Props`. */
export const constraintsOf = (props: Props): DateGrid.Constraints =>
  Calendar.constraintsOf(calendarPropsOf(props))

/** Builds the {@link Layers.Layer} entry representing this DatePicker popup. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this DatePicker popup. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/**
 * Places a DatePicker popup panel by its trigger/input anchor using
 * `Placement.place`, applying any `gapPx` and `edgePx` configured in
 * `props.placement`.
 *
 * @example
 * ```typescript
 * placeFor(props, { anchor, size, view }) // { left, top, side }
 * ```
 */
export const placeFor = (
  props: Pick<Props, 'placement'>,
  geometry: Readonly<{
    anchor: Placement.Rect
    size: Placement.Size
    view: Placement.Size
  }>,
): Placement.Placed =>
  Placement.place({
    ...geometry,
    ...(props.placement?.gapPx === undefined
      ? {}
      : { gapPx: props.placement.gapPx }),
    ...(props.placement?.edgePx === undefined
      ? {}
      : { edgePx: props.placement.edgePx }),
  })

// READINGS

/** True when the date picker popup is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True when the date picker popup is closed. */
export const isClosed = (state: State): boolean => state._tag === 'Closed'

/** The embedded Calendar state held by `state`. */
export const calendarOf = (state: State): Calendar.State => state.calendar

/** Active granularity of the embedded calendar (`'Day' | 'Month' | 'Year'`). */
export const viewModeOf = (state: State): DateGrid.ViewMode =>
  Calendar.viewModeOf(state.calendar)

/** The primary selected date (or range start when in `Range` mode), or none. */
export const selectedDateOf = (
  state: State,
): Option.Option<DateGrid.CalendarDate> =>
  Calendar.selectedDateOf(state.calendar)

/** The complete selected date range when `DateRangeSelected`, or none. */
export const selectedRangeOf = (
  state: State,
): Option.Option<DateGrid.DateRange> => Calendar.selectedRangeOf(state.calendar)

/** The start date of an active or completed range selection, or none. */
export const rangeStartOf = (
  state: State,
): Option.Option<DateGrid.CalendarDate> => Calendar.rangeStartOf(state.calendar)

/** The end date of a completed range selection, or none. */
export const rangeEndOf = (
  state: State,
): Option.Option<DateGrid.CalendarDate> => Calendar.rangeEndOf(state.calendar)

/** The live preview range while hovering in `RangeStart`, or the committed range, or none. */
export const previewRangeOf = (
  state: State,
): Option.Option<DateGrid.DateRange> => Calendar.previewRangeOf(state.calendar)

/** True when no date or range is currently selected. */
export const isSelectionEmpty = (state: State): boolean =>
  state.calendar.selection._tag === 'NoneSelected'

/** True when `date` is selected in the embedded calendar. */
export const isDateSelected = (
  state: State,
  date: DateGrid.CalendarDate,
): boolean => Calendar.isDateSelected(state.calendar, date)

/** True when `date` is disabled either by `props.isDisabled` or `DateGrid` constraints. */
export const isDateDisabled = (
  date: DateGrid.CalendarDate,
  props: Props,
): boolean => Calendar.isDateDisabled(date, calendarPropsOf(props))

/** Current focused date in the embedded calendar. */
export const focusedDateOf = (
  state: State,
  props: Props,
): DateGrid.CalendarDate =>
  Calendar.focusedDateOf(state.calendar, calendarPropsOf(props))

/** Current visible `(year, month)` of the embedded calendar. */
export const viewMonthOf = (state: State, props: Props): DateGrid.YearMonth =>
  Calendar.viewMonthOf(state.calendar, calendarPropsOf(props))

/** The date cell holding roving `tabIndex: 0` in the embedded calendar grid, or none. */
export const rovingTargetDateOf = (
  state: State,
  props: Props,
): Option.Option<DateGrid.CalendarDate> =>
  Calendar.rovingTargetDateOf(state.calendar, calendarPropsOf(props))

/** The element id of the currently focused cell in the embedded calendar view. */
export const activeDescendantIdOf = (state: State, props: Props): string =>
  Calendar.activeDescendantIdOf(state.calendar, calendarPropsOf(props))

/** True when navigating backward by one month is permitted under `props`. */
export const canNavigatePreviousMonth = (state: State, props: Props): boolean =>
  Calendar.canNavigatePreviousMonth(state.calendar, calendarPropsOf(props))

/** True when navigating forward by one month is permitted under `props`. */
export const canNavigateNextMonth = (state: State, props: Props): boolean =>
  Calendar.canNavigateNextMonth(state.calendar, calendarPropsOf(props))

/** True when navigating backward by one year is permitted under `props`. */
export const canNavigatePreviousYear = (state: State, props: Props): boolean =>
  Calendar.canNavigatePreviousYear(state.calendar, calendarPropsOf(props))

/** True when navigating forward by one year is permitted under `props`. */
export const canNavigateNextYear = (state: State, props: Props): boolean =>
  Calendar.canNavigateNextYear(state.calendar, calendarPropsOf(props))

/** Generates the currently visible 2D `MonthGrid` for `state` and `props`. */
export const visibleMonthGridOf = (
  state: State,
  props: Props,
): DateGrid.MonthGrid =>
  Calendar.visibleMonthGridOf(state.calendar, calendarPropsOf(props))

/** Generates the currently visible 12-month `MonthsGrid` for `state` and `props`. */
export const visibleMonthsGridOf = (
  state: State,
  props: Props,
): DateGrid.MonthsGrid =>
  Calendar.visibleMonthsGridOf(state.calendar, calendarPropsOf(props))

/** Generates the currently visible paged `YearsGrid` for `state` and `props`. */
export const visibleYearsGridOf = (
  state: State,
  props: Props,
): DateGrid.YearsGrid =>
  Calendar.visibleYearsGridOf(state.calendar, calendarPropsOf(props))

/** True when the text input holds an uncommitted draft. */
export const isInputDirty = (state: State): boolean =>
  Option.isSome(state.maybeInputDraft)

/** The displayed text value for the `Input` slot (live draft while typing, else formatted selection). */
export const inputValueOf = (state: State, props: Props): string =>
  Option.getOrElse(state.maybeInputDraft, () =>
    formatSelection(
      state.calendar.selection,
      inputFormatOf(props),
      rangeSeparatorOf(props),
    ),
  )

/** Human-readable trigger display label (formatted selection, or `placeholderOf(props)` when empty). */
export const displayLabelOf = (state: State, props: Props): string => {
  const formatted = formatSelection(
    state.calendar.selection,
    inputFormatOf(props),
    rangeSeparatorOf(props),
  )
  return formatted === '' ? placeholderOf(props) : formatted
}

type ParsedInputCommit =
  | Readonly<{ _tag: 'Single'; date: DateGrid.CalendarDate }>
  | Readonly<{ _tag: 'Range'; range: DateGrid.DateRange }>

const parseCommitCandidate = (
  text: string,
  props: Props,
): Option.Option<ParsedInputCommit> => {
  const format = inputFormatOf(props)
  const calProps = calendarPropsOf(props)
  if (!isRangeMode(props)) {
    return pipe(
      parseDateInput(text, format),
      Option.filter(date => !Calendar.isDateDisabled(date, calProps)),
      Option.map((date): ParsedInputCommit => ({ _tag: 'Single', date })),
    )
  } else {
    const maybeRange = pipe(
      parseDateRangeInput(text, {
        format,
        separator: rangeSeparatorOf(props),
      }),
      Option.filter(
        range =>
          !Calendar.isDateDisabled(range.start, calProps) &&
          !Calendar.isDateDisabled(range.end, calProps) &&
          (Calendar.allowDisabledInRangeOf(calProps) ||
            !DateGrid.hasDisabledDateInRange(
              range.start,
              range.end,
              constraintsOf(props),
            )),
      ),
      Option.map((range): ParsedInputCommit => ({ _tag: 'Range', range })),
    )
    return Option.orElse(maybeRange, () =>
      pipe(
        parseDateInput(text, format),
        Option.filter(date => !Calendar.isDateDisabled(date, calProps)),
        Option.map((date): ParsedInputCommit => ({ _tag: 'Single', date })),
      ),
    )
  }
}

/** True when `text` parses to an enabled date (or range in `Range` mode) satisfying `props` constraints. */
export const isValidDateInput = (text: string, props: Props): boolean =>
  Option.isSome(parseCommitCandidate(text, props))

/** True when `state` holds a non-empty text draft that does not parse to a valid enabled date or range. */
export const isInputInvalid = (state: State, props: Props): boolean =>
  Option.exists(
    state.maybeInputDraft,
    draft => draft.trim() !== '' && !isValidDateInput(draft, props),
  )

/** True when either `props.isInvalid` is set or the user's pending text draft is invalid. */
export const isEffectiveInvalid = (state: State, props: Props): boolean =>
  isInvalidOf(props) || isInputInvalid(state, props)

/** True when pointer interaction outside the DatePicker layer stack is blocked. */
export const isOutsidePointerBlocked = (state: State, props: Props): boolean =>
  isOpen(state) && Layers.isOutsidePointerBlocked(layersOf(props))

/** Form submission hidden input descriptors when `props.name` is provided. */
export const hiddenInputsOf = (
  state: State,
  props: Props,
): ReadonlyArray<Readonly<{ name: string; value: string; form?: string }>> =>
  Option.match(Option.fromNullishOr(props.name), {
    onNone: () => [],
    onSome: name => {
      const formField = props.form === undefined ? {} : { form: props.form }
      return M.value(state.calendar.selection).pipe(
        M.withReturnType<
          ReadonlyArray<
            Readonly<{ name: string; value: string; form?: string }>
          >
        >(),
        M.tagsExhaustive({
          NoneSelected: () => [{ name, value: '', ...formField }],
          SingleDate: ({ date }) => [
            { name, value: DateGrid.formatIso(date), ...formField },
          ],
          RangeStart: ({ start }) => [
            { name, value: DateGrid.formatIso(start), ...formField },
          ],
          DateRangeSelected: ({ start, end }) => [
            { name, value: DateGrid.formatIso(start), ...formField },
            { name, value: DateGrid.formatIso(end), ...formField },
          ],
        }),
      )
    },
  })

/**
 * Projects an open DatePicker into the `BoxLayer` field a `Box` node reads on
 * HTML, React, and React Native, or `{}` while closed.
 */
export const boxLayerOf = (
  view: Part.View<State>,
  props: Props,
): Readonly<{ layer?: BoxLayer }> =>
  M.value(view.state).pipe(
    M.withReturnType<Readonly<{ layer?: BoxLayer }>>(),
    M.tagsExhaustive({
      Closed: () => ({}),
      Open: () => ({
        layer: {
          kind: isModalOf(props) ? 'Dialog' : 'Panel',
          label: props.label ?? props.id,
          ...(dismissesOnOutsidePressOf(props)
            ? { dismissToken: DismissDatePicker.tag }
            : {}),
        },
      }),
    }),
  )

// INTERNAL CHART HELPERS

const canDismissEscape = (props: Props): boolean =>
  Layers.canDismissOnEscape(layersOf(props), props.id)

const canDismissOutside = (
  props: Props,
  insideIds: ReadonlyArray<string>,
): boolean =>
  Layers.canDismissOnOutsidePress(layersOf(props), props.id, insideIds)

const idleCalendar = (calendar: Calendar.State): Calendar.Idle =>
  Calendar.Idle({
    grid: calendar.grid,
    selection: calendar.selection,
    maybeHoveredDate: Option.none(),
  })

const stepCalendar = (
  calendar: Calendar.State,
  message: Calendar.Message,
  props: Props,
): Option.Option<Calendar.State> => {
  const result = Calendar.chart.step(calendar, message, calendarPropsOf(props))
  return result._tag === 'Transitioned'
    ? Option.some(result.state)
    : Option.none()
}

const openCalendarFor = (
  calendar: Calendar.State,
  props: Props,
): Calendar.State => {
  const dayCalendar =
    Calendar.viewModeOf(calendar) === 'Day'
      ? calendar
      : Option.getOrElse(
          stepCalendar(calendar, Calendar.DropCalendarToDayView(), props),
          () => Calendar.atRest(calendar),
        )
  return Option.getOrElse(
    stepCalendar(dayCalendar, Calendar.FocusCalendarGrid(), props),
    () => dayCalendar,
  )
}

const closedRestFrom = (
  state: State,
  calendar: Calendar.State = state.calendar,
  maybeInputDraft: Option.Option<string> = state.maybeInputDraft,
): Closed =>
  Closed({
    calendar: Calendar.atRest(calendar),
    maybeInputDraft,
  })

const closedKeepCalendar = (
  calendar: Calendar.State,
  maybeInputDraft: Option.Option<string>,
): Closed =>
  Closed({
    calendar: idleCalendar(calendar),
    maybeInputDraft,
  })

const applyChangeDateInput = (
  state: State,
  value: string,
  props: Props,
): Readonly<{
  calendar: Calendar.State
  maybeInputDraft: Option.Option<string>
}> => {
  const trimmed = value.trim()
  if (trimmed === '') {
    const clearedCalendar = Option.getOrElse(
      stepCalendar(state.calendar, Calendar.ClearCalendarSelection(), props),
      () => state.calendar,
    )
    return {
      calendar:
        state._tag === 'Closed'
          ? idleCalendar(clearedCalendar)
          : clearedCalendar,
      maybeInputDraft: value === '' ? Option.none() : Option.some(value),
    }
  }
  const maybePreviewDate = Option.map(
    parseCommitCandidate(trimmed, props),
    parsed => (parsed._tag === 'Single' ? parsed.date : parsed.range.start),
  )
  const nextCalendar = Option.match(maybePreviewDate, {
    onNone: () => state.calendar,
    onSome: date => {
      const focused = Option.getOrElse(
        stepCalendar(
          state.calendar,
          Calendar.FocusCalendarDate({ date }),
          props,
        ),
        () => state.calendar,
      )
      return state._tag === 'Closed' ? idleCalendar(focused) : focused
    },
  })
  return {
    calendar: nextCalendar,
    maybeInputDraft: Option.some(value),
  }
}

const applyCommitDraft = (
  state: State,
  props: Props,
): Option.Option<Calendar.State> =>
  Option.flatMap(state.maybeInputDraft, draft => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      const cleared = Option.getOrElse(
        stepCalendar(state.calendar, Calendar.ClearCalendarSelection(), props),
        () => state.calendar,
      )
      return Option.some(cleared)
    }
    return Option.flatMap(parseCommitCandidate(trimmed, props), parsed =>
      parsed._tag === 'Single'
        ? stepCalendar(
            state.calendar,
            Calendar.SelectCalendarDate({ date: parsed.date }),
            props,
          )
        : stepCalendar(
            state.calendar,
            Calendar.SetCalendarRange({
              start: parsed.range.start,
              end: parsed.range.end,
            }),
            props,
          ),
    )
  })

type StateVariant<Tag extends State['_tag']> = Extract<
  State,
  { readonly _tag: Tag }
>

const closedFromCalendar = (
  calendar: Calendar.State,
  maybeInputDraft: Option.Option<string>,
): Closed => closedKeepCalendar(calendar, maybeInputDraft)

const openFromCalendar = (
  calendar: Calendar.State,
  maybeInputDraft: Option.Option<string>,
): Open =>
  Open({
    calendar,
    maybeInputDraft,
  })

const calendarStepEdges = <
  Target extends State['_tag'],
  TriggerMessage extends Message,
>(
  target: Target,
  build: (
    calendar: Calendar.State,
    maybeInputDraft: Option.Option<string>,
  ) => StateVariant<Target>,
  toCalendarMessage: (message: TriggerMessage) => Calendar.Message,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    TriggerMessage,
    never,
    Props
  >
> => [
  when(
    (state: StateVariant<Target>, message: TriggerMessage, context: Props) =>
      stepCalendar(state.calendar, toCalendarMessage(message), context),
    target,
    ({ state, guardValue }) => build(guardValue, state.maybeInputDraft),
  ),
  ignore(),
]

const blurInputEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    calendar: Calendar.State,
    maybeInputDraft: Option.Option<string>,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof BlurredDateInput.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      _message: typeof BlurredDateInput.Type,
      context: Props,
    ) =>
      canPickDate(context) ? applyCommitDraft(state, context) : Option.none(),
    target,
    ({ guardValue }) => build(guardValue, Option.none()),
  ),
  when(
    (
      state: StateVariant<Target>,
      _message: typeof BlurredDateInput.Type,
      context: Props,
    ) =>
      Option.isSome(state.maybeInputDraft) &&
      (!canPickDate(context) || fixOnBlurOf(context)),
    target,
    ({ state }) => build(state.calendar, Option.none()),
  ),
  ignore(),
]

// CHART

/**
 * Builds the DatePicker Machine chart starting in `initialState`: `Closed` and
 * `Open` popup states composing `Calendar`, `DateGrid`, `Placement`, and
 * `Layers`, with trigger and input open/close, Escape and outside-press layer
 * dismissal, single-date and date-range selection with `closeOnSelect`, clear
 * selection with `closeOnClear`, pure text date input parsing/commit/blur,
 * embedded calendar 2D keyboard navigation and view switching, and disabled /
 * readOnly guards.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          OpenDatePicker: [
            when(
              (_state, _message, context) => canPickDate(context),
              'Open',
              ({ state, context }) =>
                Open({
                  calendar: openCalendarFor(state.calendar, context),
                  maybeInputDraft: state.maybeInputDraft,
                }),
            ),
            ignore(),
          ],
          ToggleDatePicker: [
            when(
              (_state, _message, context) => canPickDate(context),
              'Open',
              ({ state, context }) =>
                Open({
                  calendar: openCalendarFor(state.calendar, context),
                  maybeInputDraft: state.maybeInputDraft,
                }),
            ),
            ignore(),
          ],
          SelectDatePickerDate: [
            when(
              (state, message, context) =>
                canPickDate(context)
                  ? stepCalendar(
                      state.calendar,
                      Calendar.SelectCalendarDate({ date: message.date }),
                      context,
                    )
                  : Option.none(),
              'Closed',
              ({ guardValue }) => closedKeepCalendar(guardValue, Option.none()),
            ),
            ignore(),
          ],
          SetDatePickerRange: [
            when(
              (state, message, context) =>
                canPickDate(context)
                  ? stepCalendar(
                      state.calendar,
                      Calendar.SetCalendarRange({
                        start: message.start,
                        end: message.end,
                      }),
                      context,
                    )
                  : Option.none(),
              'Closed',
              ({ guardValue }) => closedKeepCalendar(guardValue, Option.none()),
            ),
            ignore(),
          ],
          ClearDatePicker: [
            when(
              (state, _message, context) =>
                canPickDate(context) &&
                (!isSelectionEmpty(state) ||
                  Option.isSome(state.maybeInputDraft)),
              'Closed',
              ({ state, context }) => {
                const cleared = Option.getOrElse(
                  stepCalendar(
                    state.calendar,
                    Calendar.ClearCalendarSelection(),
                    context,
                  ),
                  () => state.calendar,
                )
                return closedKeepCalendar(cleared, Option.none())
              },
            ),
            ignore(),
          ],
          ChangeDateInput: [
            when(
              (_state, _message, context) => canPickDate(context),
              'Closed',
              ({ state, message, context }) =>
                Closed(applyChangeDateInput(state, message.value, context)),
            ),
            ignore(),
          ],
          CommitDateInput: [
            when(
              (state, _message, context) =>
                canPickDate(context)
                  ? applyCommitDraft(state, context)
                  : Option.none(),
              'Closed',
              ({ guardValue }) => closedKeepCalendar(guardValue, Option.none()),
            ),
            ignore(),
          ],
          BlurredDateInput: blurInputEdges('Closed', closedFromCalendar),
          ClickedDateInput: [
            when(
              (_state, _message, context) =>
                canPickDate(context) && openOnInputClickOf(context),
              'Open',
              ({ state, context }) =>
                Open({
                  calendar: openCalendarFor(state.calendar, context),
                  maybeInputDraft: state.maybeInputDraft,
                }),
            ),
            ignore(),
          ],
          PressedTriggerKey: [
            when(
              (_state, message, context) =>
                canPickDate(context) &&
                (message.key === 'Enter' ||
                  message.key === ' ' ||
                  message.key === 'ArrowDown'),
              'Open',
              ({ state, context }) =>
                Open({
                  calendar: openCalendarFor(state.calendar, context),
                  maybeInputDraft: state.maybeInputDraft,
                }),
            ),
            ignore(),
          ],
          PressedInputKey: [
            when(
              (_state, message, context) =>
                canPickDate(context) && message.key === 'ArrowDown',
              'Open',
              ({ state, context }) =>
                Open({
                  calendar: openCalendarFor(state.calendar, context),
                  maybeInputDraft: state.maybeInputDraft,
                }),
            ),
            when(
              (state, message, context) =>
                canPickDate(context) && message.key === 'Enter'
                  ? applyCommitDraft(state, context)
                  : Option.none(),
              'Closed',
              ({ guardValue }) => closedKeepCalendar(guardValue, Option.none()),
            ),
            when(
              (state, message) =>
                message.key === 'Escape' &&
                Option.isSome(state.maybeInputDraft),
              'Closed',
              ({ state }) =>
                Closed({
                  calendar: state.calendar,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
          PreviousDatePickerMonth: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            () => Calendar.PreviousCalendarMonth(),
          ),
          NextDatePickerMonth: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            () => Calendar.NextCalendarMonth(),
          ),
          PreviousDatePickerYear: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            () => Calendar.PreviousCalendarYear(),
          ),
          NextDatePickerYear: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            () => Calendar.NextCalendarYear(),
          ),
          JumpDatePickerToToday: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            () => Calendar.JumpToToday(),
          ),
          ZoomOutDatePickerView: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            () => Calendar.ZoomOutCalendarView(),
          ),
          FocusDatePickerDate: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            (message: typeof FocusDatePickerDate.Type) =>
              Calendar.FocusCalendarDate({ date: message.date }),
          ),
          SelectDatePickerMonth: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            (message: typeof SelectDatePickerMonth.Type) =>
              Calendar.SelectCalendarMonth({ month: message.month }),
          ),
          SelectDatePickerYear: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            (message: typeof SelectDatePickerYear.Type) =>
              Calendar.SelectCalendarYear({ year: message.year }),
          ),
          PageDatePickerYears: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            (message: typeof PageDatePickerYears.Type) =>
              Calendar.PageCalendarYears({ direction: message.direction }),
          ),
          SetDatePickerViewMode: calendarStepEdges(
            'Closed',
            closedFromCalendar,
            (message: typeof SetDatePickerViewMode.Type) =>
              Calendar.SetCalendarViewMode({ mode: message.mode }),
          ),
          ResetDatePicker: to('Closed', () => initial),
        },
      },
      Open: {
        on: {
          CloseDatePicker: to('Closed', ({ state }) => closedRestFrom(state)),
          ToggleDatePicker: to('Closed', ({ state }) => closedRestFrom(state)),
          DismissDatePicker: [
            when(
              (_state, _message, context) => canDismissOutside(context, []),
              'Closed',
              ({ state }) => closedRestFrom(state),
            ),
            ignore(),
          ],
          PressedOutsideDatePicker: [
            when(
              (_state, message, context) =>
                canDismissOutside(context, message.insideIds),
              'Closed',
              ({ state }) => closedRestFrom(state),
            ),
            ignore(),
          ],
          SelectDatePickerDate: [
            when(
              (state, message, context) => {
                if (!canPickDate(context)) {
                  return Option.none()
                }
                return Option.filter(
                  stepCalendar(
                    state.calendar,
                    Calendar.SelectCalendarDate({ date: message.date }),
                    context,
                  ),
                  next => shouldCloseAfterSelect(next.selection, context),
                )
              },
              'Closed',
              ({ guardValue }) =>
                Closed({
                  calendar: Calendar.atRest(guardValue),
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, message, context) => {
                if (!canPickDate(context)) {
                  return Option.none()
                }
                return Option.filter(
                  stepCalendar(
                    state.calendar,
                    Calendar.SelectCalendarDate({ date: message.date }),
                    context,
                  ),
                  next => !shouldCloseAfterSelect(next.selection, context),
                )
              },
              'Open',
              ({ guardValue }) =>
                Open({
                  calendar: guardValue,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
          SetDatePickerRange: [
            when(
              (state, message, context) => {
                if (!canPickDate(context)) {
                  return Option.none()
                }
                return Option.filter(
                  stepCalendar(
                    state.calendar,
                    Calendar.SetCalendarRange({
                      start: message.start,
                      end: message.end,
                    }),
                    context,
                  ),
                  next => shouldCloseAfterSelect(next.selection, context),
                )
              },
              'Closed',
              ({ guardValue }) =>
                Closed({
                  calendar: Calendar.atRest(guardValue),
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, message, context) => {
                if (!canPickDate(context)) {
                  return Option.none()
                }
                return Option.filter(
                  stepCalendar(
                    state.calendar,
                    Calendar.SetCalendarRange({
                      start: message.start,
                      end: message.end,
                    }),
                    context,
                  ),
                  next => !shouldCloseAfterSelect(next.selection, context),
                )
              },
              'Open',
              ({ guardValue }) =>
                Open({
                  calendar: guardValue,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
          ClearDatePicker: [
            when(
              (state, _message, context) =>
                canPickDate(context) &&
                closeOnClearOf(context) &&
                (!isSelectionEmpty(state) ||
                  Option.isSome(state.maybeInputDraft)),
              'Closed',
              ({ state, context }) => {
                const cleared = Option.getOrElse(
                  stepCalendar(
                    state.calendar,
                    Calendar.ClearCalendarSelection(),
                    context,
                  ),
                  () => state.calendar,
                )
                return Closed({
                  calendar: Calendar.atRest(cleared),
                  maybeInputDraft: Option.none(),
                })
              },
            ),
            when(
              (state, _message, context) =>
                canPickDate(context) &&
                !closeOnClearOf(context) &&
                (!isSelectionEmpty(state) ||
                  Option.isSome(state.maybeInputDraft)),
              'Open',
              ({ state, context }) => {
                const cleared = Option.getOrElse(
                  stepCalendar(
                    state.calendar,
                    Calendar.ClearCalendarSelection(),
                    context,
                  ),
                  () => state.calendar,
                )
                return Open({
                  calendar: cleared,
                  maybeInputDraft: Option.none(),
                })
              },
            ),
            ignore(),
          ],
          ChangeDateInput: [
            when(
              (_state, _message, context) => canPickDate(context),
              'Open',
              ({ state, message, context }) =>
                Open(applyChangeDateInput(state, message.value, context)),
            ),
            ignore(),
          ],
          CommitDateInput: [
            when(
              (state, _message, context) =>
                canPickDate(context)
                  ? Option.filter(applyCommitDraft(state, context), next =>
                      shouldCloseAfterSelect(next.selection, context),
                    )
                  : Option.none(),
              'Closed',
              ({ guardValue }) =>
                Closed({
                  calendar: Calendar.atRest(guardValue),
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, _message, context) =>
                canPickDate(context)
                  ? Option.filter(
                      applyCommitDraft(state, context),
                      next => !shouldCloseAfterSelect(next.selection, context),
                    )
                  : Option.none(),
              'Open',
              ({ guardValue }) =>
                Open({
                  calendar: guardValue,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
          BlurredDateInput: blurInputEdges('Open', openFromCalendar),
          PressedTriggerKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
              'Closed',
              ({ state }) => closedRestFrom(state),
            ),
            when(
              (_state, message) =>
                message.key === 'Enter' || message.key === ' ',
              'Closed',
              ({ state }) => closedRestFrom(state),
            ),
            ignore(),
          ],
          PressedInputKey: [
            when(
              (_state, message, context) =>
                message.key === 'Escape' && canDismissEscape(context),
              'Closed',
              ({ state }) =>
                Closed({
                  calendar: Calendar.atRest(state.calendar),
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, message) =>
                message.key === 'Escape' &&
                Option.isSome(state.maybeInputDraft),
              'Open',
              ({ state }) =>
                Open({
                  calendar: state.calendar,
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, message, context) =>
                canPickDate(context) && message.key === 'Enter'
                  ? Option.filter(applyCommitDraft(state, context), next =>
                      shouldCloseAfterSelect(next.selection, context),
                    )
                  : Option.none(),
              'Closed',
              ({ guardValue }) =>
                Closed({
                  calendar: Calendar.atRest(guardValue),
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, message, context) =>
                canPickDate(context) && message.key === 'Enter'
                  ? Option.filter(
                      applyCommitDraft(state, context),
                      next => !shouldCloseAfterSelect(next.selection, context),
                    )
                  : Option.none(),
              'Open',
              ({ guardValue }) =>
                Open({
                  calendar: guardValue,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
          PressedDatePickerKey: [
            when(
              (state, message, context) =>
                message.key === 'Escape' &&
                viewModeOf(state) === 'Day' &&
                canDismissEscape(context),
              'Closed',
              ({ state }) => closedRestFrom(state),
            ),
            when(
              (state, message, context) => {
                if (
                  !DateGrid.isCommitKey(message.key) ||
                  viewModeOf(state) !== 'Day'
                ) {
                  return Option.none()
                }
                return Option.filter(
                  stepCalendar(
                    state.calendar,
                    Calendar.PressedCalendarKey({
                      key: message.key,
                      ...(message.isShift === undefined
                        ? {}
                        : { isShift: message.isShift }),
                    }),
                    context,
                  ),
                  next => shouldCloseAfterSelect(next.selection, context),
                )
              },
              'Closed',
              ({ guardValue }) =>
                Closed({
                  calendar: Calendar.atRest(guardValue),
                  maybeInputDraft: Option.none(),
                }),
            ),
            when(
              (state, message, context) =>
                stepCalendar(
                  state.calendar,
                  Calendar.PressedCalendarKey({
                    key: message.key,
                    ...(message.isShift === undefined
                      ? {}
                      : { isShift: message.isShift }),
                  }),
                  context,
                ),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  calendar: guardValue,
                  maybeInputDraft:
                    guardValue.selection === state.calendar.selection
                      ? state.maybeInputDraft
                      : Option.none(),
                }),
            ),
            ignore(),
          ],
          PreviousDatePickerMonth: calendarStepEdges(
            'Open',
            openFromCalendar,
            () => Calendar.PreviousCalendarMonth(),
          ),
          NextDatePickerMonth: calendarStepEdges('Open', openFromCalendar, () =>
            Calendar.NextCalendarMonth(),
          ),
          PreviousDatePickerYear: calendarStepEdges(
            'Open',
            openFromCalendar,
            () => Calendar.PreviousCalendarYear(),
          ),
          NextDatePickerYear: calendarStepEdges('Open', openFromCalendar, () =>
            Calendar.NextCalendarYear(),
          ),
          JumpDatePickerToToday: calendarStepEdges(
            'Open',
            openFromCalendar,
            () => Calendar.JumpToToday(),
          ),
          ZoomOutDatePickerView: calendarStepEdges(
            'Open',
            openFromCalendar,
            () => Calendar.ZoomOutCalendarView(),
          ),
          FocusDatePickerDate: calendarStepEdges(
            'Open',
            openFromCalendar,
            (message: typeof FocusDatePickerDate.Type) =>
              Calendar.FocusCalendarDate({ date: message.date }),
          ),
          HoverDatePickerDate: calendarStepEdges(
            'Open',
            openFromCalendar,
            (message: typeof HoverDatePickerDate.Type) =>
              Calendar.HoverCalendarDate({ date: message.date }),
          ),
          LeaveDatePickerDate: calendarStepEdges('Open', openFromCalendar, () =>
            Calendar.LeaveCalendarDate(),
          ),
          SelectDatePickerMonth: calendarStepEdges(
            'Open',
            openFromCalendar,
            (message: typeof SelectDatePickerMonth.Type) =>
              Calendar.SelectCalendarMonth({ month: message.month }),
          ),
          SelectDatePickerYear: calendarStepEdges(
            'Open',
            openFromCalendar,
            (message: typeof SelectDatePickerYear.Type) =>
              Calendar.SelectCalendarYear({ year: message.year }),
          ),
          PageDatePickerYears: calendarStepEdges(
            'Open',
            openFromCalendar,
            (message: typeof PageDatePickerYears.Type) =>
              Calendar.PageCalendarYears({ direction: message.direction }),
          ),
          SetDatePickerViewMode: calendarStepEdges(
            'Open',
            openFromCalendar,
            (message: typeof SetDatePickerViewMode.Type) =>
              Calendar.SetCalendarViewMode({ mode: message.mode }),
          ),
          ResetDatePicker: to('Closed', () => initial),
        },
      },
    },
  })

/** The default DatePicker Machine chart starting in `Closed` with no date selected. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenDatePicker: pace,
  CloseDatePicker: pace,
  ToggleDatePicker: pace,
  DismissDatePicker: pace,
  SelectDatePickerDate: pace,
  ClearDatePicker: pace,
  ChangeDateInput: pace,
  CommitDateInput: pace,
  PreviousDatePickerMonth: pace,
  NextDatePickerMonth: pace,
  PreviousDatePickerYear: pace,
  NextDatePickerYear: pace,
  JumpDatePickerToToday: pace,
  ZoomOutDatePickerView: pace,
  PressedTriggerKey: pace,
  PressedDatePickerKey: pace,
  PressedInputKey: pace,
  ClickedDateInput: pace,
  BlurredDateInput: pace,
  PressedOutsideDatePicker: pace,
  FocusDatePickerDate: pace,
  HoverDatePickerDate: pace,
  LeaveDatePickerDate: pace,
  SelectDatePickerMonth: pace,
  SelectDatePickerYear: pace,
  PageDatePickerYears: pace,
  SetDatePickerViewMode: pace,
  SetDatePickerRange: pace,
  ResetDatePicker: pace,
})

/** Default synchronization: every DatePicker Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a DatePicker kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The painted slots of a DatePicker Part:
 * - `Trigger`: button opening/toggling the calendar dialog (`hasPopup: 'dialog'`, `isExpanded`, `controls: contentId`).
 * - `Input`: editable date text field (`role="textbox"`, `controls: contentId`, `isExpanded`, validation ARIA).
 * - `Content`: popup dialog container (`role="dialog"`, `id: contentId`, `isHidden` when closed, `isModal`).
 * - `Grid`, `GridCell`, `PreviousMonthButton`, `NextMonthButton`, `Heading`: delegated from the embedded `Calendar` Part.
 * - `ClearButton`: button clearing the selected date or range (`ClearDatePicker`).
 * - `Label`: field label (`id: labelId(id)`).
 * - `Description`: helper text linked via `aria-describedby` (`id: descriptionId(id)`).
 * - `Error`: validation message linked via `aria-describedby` when invalid (`id: errorId(id)`).
 * - `Backdrop`: outside-dismiss surface (`DismissDatePicker`, hidden while closed).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleDatePicker' }],
  },
  Input: {
    role: 'TextBox',
    focus: 'None',
    gestures: [],
  },
  Content: {
    role: 'Dialog',
    focus: 'Container',
    gestures: [],
  },
  Grid: {
    role: 'Grid',
    focus: 'Container',
    gestures: [],
  },
  GridCell: {
    role: 'GridCell',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectDatePickerDate' }],
  },
  PreviousMonthButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'PreviousDatePickerMonth' }],
  },
  NextMonthButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'NextDatePickerMonth' }],
  },
  Heading: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ZoomOutDatePickerView' }],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearDatePicker' }],
  },
  Label: {
    focus: 'None',
    gestures: [],
  },
  Description: {
    focus: 'None',
    gestures: [],
  },
  Error: {
    focus: 'None',
    gestures: [],
  },
  Backdrop: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'DismissDatePicker' }],
  },
}

const labelSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const descriptionSlotPropsOf = (
  state: State,
  props: Props,
): Pick<SlotProps, 'describedBy'> => {
  if (props.describedBy !== undefined) {
    return { describedBy: props.describedBy }
  }
  const ids: ReadonlyArray<string> = [
    ...(props.hasDescription === false ? [] : [descriptionId(props.id)]),
    ...(isEffectiveInvalid(state, props) && props.hasError === true
      ? [errorId(props.id)]
      : []),
  ]
  return Array.isReadonlyArrayEmpty(ids)
    ? {}
    : { describedBy: Array.join(ids, ' ') }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      hasPopup: 'dialog',
      isExpanded: isOpen(state),
      controls: contentId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(state, props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isEffectiveInvalid(state, props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Input') {
    return {
      id: inputId(props.id),
      controls: contentId(props.id),
      isExpanded: isOpen(state),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(state, props),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isEffectiveInvalid(state, props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Content') {
    return {
      role: 'Dialog',
      id: contentId(props.id),
      isModal: isModalOf(props),
      ...labelSlotPropsOf(props),
      ...descriptionSlotPropsOf(state, props),
      ...(isOpen(state) ? { tabIndex: -1 } : { isHidden: true }),
    }
  } else if (
    slot === 'Grid' ||
    slot === 'GridCell' ||
    slot === 'PreviousMonthButton' ||
    slot === 'NextMonthButton' ||
    slot === 'Heading'
  ) {
    return Calendar.part.project(
      state.calendar,
      calendarPropsOf(props),
      slot,
      maybeChoice,
    )
  } else if (slot === 'ClearButton') {
    return {
      id: clearButtonId(props.id),
      controls: inputId(props.id),
      label: 'Clear date',
      tabIndex: 0,
      ...((isSelectionEmpty(state) && Option.isNone(state.maybeInputDraft)) ||
      !canPickDate(props)
        ? { isHidden: true }
        : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Description') {
    return {
      id: descriptionId(props.id),
    }
  } else if (slot === 'Error') {
    return {
      id: errorId(props.id),
      ...(!isEffectiveInvalid(state, props) ? { isHidden: true } : {}),
    }
  } else if (slot === 'Backdrop') {
    return {
      ...(!isOpen(state) ? { isHidden: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a DatePicker on: closes any open popup, returns the
 * embedded Calendar to rest (`Idle` and `Day` view) while preserving the
 * selected date or range, and clears any uncommitted text draft.
 */
export const atRest = (state: State): State =>
  Closed({
    calendar: Calendar.atRest(state.calendar),
    maybeInputDraft: Option.none(),
  })

// PART FACTORY

/** Options for customizing a DatePicker Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this DatePicker device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial selected date for `Single` mode. */
  defaultDate?: DateGrid.CalendarDate
  /** Initial selected date range for `Range` mode. */
  defaultRange?: DateGrid.DateRange
  /** Initial granularity view mode (`'Day'` by default). */
  defaultViewMode?: DateGrid.ViewMode
  configuration?: Part.Configuration<Part.PartSettings>
}>

const initialStateOf = (options: MakeOptions): State => {
  const mode = options.defaultViewMode ?? 'Day'
  if (options.defaultRange !== undefined) {
    return initialRange(
      options.defaultRange.start,
      options.defaultRange.end,
      mode,
    )
  } else if (options.defaultDate !== undefined) {
    return initialDate(options.defaultDate, mode)
  } else if (mode === 'Day') {
    return initial
  } else {
    const emptyFields = {
      maybeViewMonth: Option.none<DateGrid.YearMonth>(),
      maybeFocusedDate: Option.none<DateGrid.CalendarDate>(),
    }
    const grid =
      mode === 'Month'
        ? DateGrid.Month(emptyFields)
        : DateGrid.Year(emptyFields)
    return Closed({
      calendar: Calendar.Idle({
        grid,
        selection: Calendar.NoneSelected(),
        maybeHoveredDate: Option.none(),
      }),
      maybeInputDraft: Option.none(),
    })
  }
}

/**
 * Creates a DatePicker {@link Part.Part}. Synced by default
 * (`category: 'Domain'`); pass `sync: 'OwnView'` (or use {@link deviceOnly})
 * to keep a Program's DatePicker local to one device.
 *
 * @example
 * ```typescript
 * const BookingDatePicker = DatePicker.make({ name: 'BookingDatePicker' })
 * const LocalDatePicker = DatePicker.make({ name: 'LocalDatePicker', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const initialState = initialStateOf(options)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'DatePicker',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })
}

/**
 * Shorthand for a DatePicker Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalDatePicker = DatePicker.deviceOnly({ name: 'LocalDatePicker' })
 * ```
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultDate === undefined
      ? {}
      : { defaultDate: options.defaultDate }),
    ...(options.defaultRange === undefined
      ? {}
      : { defaultRange: options.defaultRange }),
    ...(options.defaultViewMode === undefined
      ? {}
      : { defaultViewMode: options.defaultViewMode }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced DatePicker Part (`name: 'DatePicker'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
