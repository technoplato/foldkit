import { Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as DateGrid from './dateGrid.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core Calendar Part (Widget #19 of 54, Scribe #2655).
// It composes `DateGrid` and `RovingFocus` into one framework-free Machine and
// Part declaration covering single-date and date-range selection, Day/Month/
// Year view switching, prev/next month and year stepping, today jump, disabled/
// min/max constraints, and reference-stable SlotBinding projections (`Grid`,
// `GridCell`, `PreviousMonthButton`, `NextMonthButton`, `Heading`) rendered by
// HTML, React, and React Native generic hosts with zero Calendar-specific
// painter logic.

// SCHEMAS

/** Whether the calendar selects a single date (`Single`) or an inclusive date range (`Range`). */
export const SelectionMode = S.Literals(['Single', 'Range'])
/** Whether the calendar selects a single date or an inclusive date range. */
export type SelectionMode = typeof SelectionMode.Type

/** No calendar date is currently selected. */
export const NoneSelected = ts('NoneSelected', {})
/** No calendar date is currently selected. */
export type NoneSelected = typeof NoneSelected.Type

/** One single calendar date is selected. */
export const SingleDate = ts('SingleDate', { date: DateGrid.CalendarDate })
/** One single calendar date is selected. */
export type SingleDate = typeof SingleDate.Type

/** The first endpoint of a range selection has been picked; awaiting the second endpoint. */
export const RangeStart = ts('RangeStart', { start: DateGrid.CalendarDate })
/** The first endpoint of a range selection has been picked. */
export type RangeStart = typeof RangeStart.Type

/** A complete inclusive date range is selected (`start <= end`). */
export const DateRangeSelected = ts('DateRangeSelected', {
  start: DateGrid.CalendarDate,
  end: DateGrid.CalendarDate,
})
/** A complete inclusive date range is selected. */
export type DateRangeSelected = typeof DateRangeSelected.Type

/** Current selection held by the Calendar Part. */
export const Selection = S.Union([
  NoneSelected,
  SingleDate,
  RangeStart,
  DateRangeSelected,
])
/** Current selection held by the Calendar Part. */
export type Selection = typeof Selection.Type

/**
 * Read-only props supplied to the Calendar chart and projection from the
 * Program's Model. Today's date, constraints, and policies stay out of the
 * chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  today: DateGrid.CalendarDate,
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
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
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  defaultFocusedDate: S.optionalKey(DateGrid.CalendarDate),
  monthsGridColumns: S.optionalKey(S.Int),
  yearsGridColumns: S.optionalKey(S.Int),
  yearsPageSize: S.optionalKey(S.Int),
})
/** Read-only props supplied to the Calendar chart and projection. */
export type Props = typeof Props.Type

// STATE

const stateFields = {
  grid: DateGrid.State,
  selection: Selection,
  maybeHoveredDate: S.Option(DateGrid.CalendarDate),
}

/** Focus is outside the calendar grid while preserving visible month, focus cursor, and selection. */
export const Idle = ts('Idle', stateFields)
/** Focus is outside the calendar grid. */
export type Idle = typeof Idle.Type

/** Focus is inside the calendar grid, driving 2D roving navigation and keyboard selection. */
export const Focused = ts('Focused', stateFields)
/** Focus is inside the calendar grid. */
export type Focused = typeof Focused.Type

/** Where a Calendar Part stands: `Idle` or `Focused`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Focused])
/** Where a Calendar Part stands. */
export type State = typeof State.Type

/** Initial Calendar state: idle, `Day` view deferring to `props.today`, no date selected. */
export const initial: State = Idle({
  grid: DateGrid.initial,
  selection: NoneSelected(),
  maybeHoveredDate: Option.none(),
})

/** Creates an initial idle Calendar state with `date` pre-selected and focused. */
export const initialDate = (
  date: DateGrid.CalendarDate,
  viewMode: DateGrid.ViewMode = 'Day',
): State =>
  Idle({
    grid: DateGrid.initialAt(date, viewMode),
    selection: SingleDate({ date }),
    maybeHoveredDate: Option.none(),
  })

/** Creates an initial idle Calendar state with the normalized `[start, end]` range pre-selected. */
export const initialRange = (
  start: DateGrid.CalendarDate,
  end: DateGrid.CalendarDate,
  viewMode: DateGrid.ViewMode = 'Day',
): State => {
  const range = DateGrid.normalizeRange(start, end)
  return Idle({
    grid: DateGrid.initialAt(range.start, viewMode),
    selection: DateRangeSelected(range),
    maybeHoveredDate: Option.none(),
  })
}

// ACTIONS (Catalog Actions — what a person or agent does on purpose)

/** Selects an enabled calendar date (or starts/completes a range in `Range` mode). */
export const SelectCalendarDate = Catalog.action('SelectCalendarDate', {
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
  what: 'Selects the chosen calendar date',
  why: 'To pick a day or complete a date range',
  meta: { label: 'Select date', keys: [] },
})

/** Steps the visible calendar backward by one month. */
export const PreviousCalendarMonth = Catalog.action('PreviousCalendarMonth', {
  what: 'Moves the visible calendar backward by one month',
  why: 'To browse dates in the preceding month',
  meta: { label: 'Previous month', keys: [] },
})

/** Steps the visible calendar forward by one month. */
export const NextCalendarMonth = Catalog.action('NextCalendarMonth', {
  what: 'Moves the visible calendar forward by one month',
  why: 'To browse dates in the following month',
  meta: { label: 'Next month', keys: [] },
})

/** Steps the visible calendar backward by one year. */
export const PreviousCalendarYear = Catalog.action('PreviousCalendarYear', {
  what: 'Moves the visible calendar backward by one year',
  why: 'To jump to the same month in the preceding year',
  meta: { label: 'Previous year', keys: [] },
})

/** Steps the visible calendar forward by one year. */
export const NextCalendarYear = Catalog.action('NextCalendarYear', {
  what: 'Moves the visible calendar forward by one year',
  why: 'To jump to the same month in the following year',
  meta: { label: 'Next year', keys: [] },
})

/** Focuses today's date and shows its month in `Day` view. */
export const JumpToToday = Catalog.action('JumpToToday', {
  what: 'Focuses the current date and shows its month',
  why: 'To return quickly to today in the calendar',
  meta: { label: 'Today', keys: [] },
})

/** Switches the calendar heading view out one level (`Day -> Month`, `Month -> Year`). */
export const ZoomOutCalendarView = Catalog.action('ZoomOutCalendarView', {
  what: 'Switches the calendar to the next broader time scale',
  why: 'To pick a month or year quickly instead of stepping month by month',
  meta: { label: 'Switch calendar view', keys: [] },
})

/** Clears the current date or date-range selection. */
export const ClearCalendarSelection = Catalog.action('ClearCalendarSelection', {
  what: 'Clears the current calendar date selection',
  why: 'To leave the calendar with no date chosen',
  meta: { label: 'Clear selection', keys: [] },
})

/** The Catalog Actions a Calendar Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SelectCalendarDate,
  PreviousCalendarMonth,
  NextCalendarMonth,
  PreviousCalendarYear,
  NextCalendarYear,
  JumpToToday,
  ZoomOutCalendarView,
  ClearCalendarSelection,
]

// MESSAGES (Facts in addition to the Actions above)

/** Focus entered the calendar grid. */
export const FocusCalendarGrid = m('FocusCalendarGrid')

/** Focus left the calendar grid. */
export const BlurCalendarGrid = m('BlurCalendarGrid')

/** Moves the view and cursor to `date` without changing selection. */
export const FocusCalendarDate = m('FocusCalendarDate', {
  date: DateGrid.CalendarDate,
})

/** Pointer hovered `date`, updating range preview while in `RangeStart`. */
export const HoverCalendarDate = m('HoverCalendarDate', {
  date: DateGrid.CalendarDate,
})

/** Pointer left the calendar cells, clearing any range hover preview. */
export const LeaveCalendarDate = m('LeaveCalendarDate')

/** Picks a month (1..12) from `Month` view and drills back to `Day` view. */
export const SelectCalendarMonth = m('SelectCalendarMonth', {
  month: DateGrid.MonthNumber,
})

/** Picks a year from `Year` view and drills into `Month` view. */
export const SelectCalendarYear = m('SelectCalendarYear', { year: S.Int })

/** Pages the `Year` view window forward (`1`) or backward (`-1`). */
export const PageCalendarYears = m('PageCalendarYears', {
  direction: DateGrid.StepDirection,
})

/** Sets the active view mode (`'Day' | 'Month' | 'Year'`). */
export const SetCalendarViewMode = m('SetCalendarViewMode', {
  mode: DateGrid.ViewMode,
})

/** Drops directly back to `Day` view, reconciling focus into the visible month. */
export const DropCalendarToDayView = m('DropCalendarToDayView')

/** A key was pressed while interacting with the calendar grid. */
export const PressedCalendarKey = m('PressedCalendarKey', {
  key: S.String,
  isShift: S.optionalKey(S.Boolean),
})

/** Programmatically selects a normalized inclusive date range in `Range` mode. */
export const SetCalendarRange = m('SetCalendarRange', {
  start: DateGrid.CalendarDate,
  end: DateGrid.CalendarDate,
})

/** Every Message the Calendar chart handles. */
export const Message = S.Union([
  SelectCalendarDate,
  PreviousCalendarMonth,
  NextCalendarMonth,
  PreviousCalendarYear,
  NextCalendarYear,
  JumpToToday,
  ZoomOutCalendarView,
  ClearCalendarSelection,
  FocusCalendarGrid,
  BlurCalendarGrid,
  FocusCalendarDate,
  HoverCalendarDate,
  LeaveCalendarDate,
  SelectCalendarMonth,
  SelectCalendarYear,
  PageCalendarYears,
  SetCalendarViewMode,
  DropCalendarToDayView,
  PressedCalendarKey,
  SetCalendarRange,
])
/** Every Message the Calendar chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Calendar Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS (shared by chart and thin painters such as @foldkit/ui Calendar)

/** Derives the calendar grid element id (`role="grid"`) from a base `id`. */
export const gridId = (id: string): string => `${id}-grid`

/** Derives the calendar heading element id from a base `id`. */
export const headingId = (id: string): string => `${id}-heading`

/** Derives one day gridcell element id from a base `id` and `date`. */
export const dayCellId = (id: string, date: DateGrid.CalendarDate): string =>
  `${id}-cell-${date.year}-${date.month}-${date.day}`

/** Derives one month gridcell element id from a base `id` and `month` (1..12). */
export const monthCellId = (id: string, month: number): string =>
  `${id}-cell-month-${month}`

/** Derives one year gridcell element id from a base `id` and `year`. */
export const yearCellId = (id: string, year: number): string =>
  `${id}-cell-year-${year}`

/** Derives the previous-month button element id from a base `id`. */
export const previousMonthButtonId = (id: string): string => `${id}-prev-month`

/** Derives the next-month button element id from a base `id`. */
export const nextMonthButtonId = (id: string): string => `${id}-next-month`

/** Derives the previous-year button element id from a base `id`. */
export const previousYearButtonId = (id: string): string => `${id}-prev-year`

/** Derives the next-year button element id from a base `id`. */
export const nextYearButtonId = (id: string): string => `${id}-next-year`

/** Derives the jump-to-today button element id from a base `id`. */
export const todayButtonId = (id: string): string => `${id}-today`

// CONFIG READERS

/** Resolved selection mode (`'Single'` by default). */
export const selectionModeOf = (
  props: Pick<Props, 'selectionMode'> = {},
): SelectionMode => props.selectionMode ?? 'Single'

/** True when `props` selects a date range rather than a single date. */
export const isRangeMode = (
  props: Pick<Props, 'selectionMode'> = {},
): boolean => selectionModeOf(props) === 'Range'

/** True when the entire calendar is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the calendar is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when selecting the currently selected date clears it (`false` by default). */
export const isDeselectableOf = (
  props: Pick<Props, 'deselectable'> = {},
): boolean => props.deselectable === true

/** True when a selected range may span over disabled dates (`true` by default). */
export const allowDisabledInRangeOf = (
  props: Pick<Props, 'allowDisabledInRange'> = {},
): boolean => props.allowDisabledInRange ?? true

/** Extracts `DateGrid.Constraints` from `Calendar.Props`. */
export const constraintsOf = (props: Props): DateGrid.Constraints => ({
  ...(props.minDate === undefined ? {} : { minDate: props.minDate }),
  ...(props.maxDate === undefined ? {} : { maxDate: props.maxDate }),
  ...(props.disabledDates === undefined
    ? {}
    : { disabledDates: props.disabledDates }),
  ...(props.disabledDaysOfWeek === undefined
    ? {}
    : { disabledDaysOfWeek: props.disabledDaysOfWeek }),
})

/** Projects `Calendar.Props` onto `DateGrid.Props`. */
export const gridPropsOf = (props: Props): DateGrid.Props => ({
  today: props.today,
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

// READINGS

/** True when keyboard focus is tracked inside the calendar grid. */
export const isFocused = (state: State): boolean => state._tag === 'Focused'

/** Active granularity of the calendar grid (`'Day' | 'Month' | 'Year'`). */
export const viewModeOf = (state: State): DateGrid.ViewMode =>
  DateGrid.viewModeOf(state.grid)

/** The primary selected date (or range start when in `Range` mode), or none. */
export const selectedDateOf = (
  state: State,
): Option.Option<DateGrid.CalendarDate> =>
  M.value(state.selection).pipe(
    M.withReturnType<Option.Option<DateGrid.CalendarDate>>(),
    M.tagsExhaustive({
      NoneSelected: () => Option.none(),
      SingleDate: ({ date }) => Option.some(date),
      RangeStart: ({ start }) => Option.some(start),
      DateRangeSelected: ({ start }) => Option.some(start),
    }),
  )

/** The complete selected date range when `DateRangeSelected`, or none. */
export const selectedRangeOf = (
  state: State,
): Option.Option<DateGrid.DateRange> =>
  M.value(state.selection).pipe(
    M.withReturnType<Option.Option<DateGrid.DateRange>>(),
    M.tagsExhaustive({
      NoneSelected: () => Option.none(),
      SingleDate: () => Option.none(),
      RangeStart: () => Option.none(),
      DateRangeSelected: ({ start, end }) => Option.some({ start, end }),
    }),
  )

/** The start date of an active or completed range selection, or none. */
export const rangeStartOf = (
  state: State,
): Option.Option<DateGrid.CalendarDate> =>
  M.value(state.selection).pipe(
    M.withReturnType<Option.Option<DateGrid.CalendarDate>>(),
    M.tagsExhaustive({
      NoneSelected: () => Option.none(),
      SingleDate: () => Option.none(),
      RangeStart: ({ start }) => Option.some(start),
      DateRangeSelected: ({ start }) => Option.some(start),
    }),
  )

/** The end date of a completed range selection, or none. */
export const rangeEndOf = (
  state: State,
): Option.Option<DateGrid.CalendarDate> =>
  M.value(state.selection).pipe(
    M.withReturnType<Option.Option<DateGrid.CalendarDate>>(),
    M.tagsExhaustive({
      NoneSelected: () => Option.none(),
      SingleDate: () => Option.none(),
      RangeStart: () => Option.none(),
      DateRangeSelected: ({ end }) => Option.some(end),
    }),
  )

/**
 * The live preview range while hovering in `RangeStart`, or the committed
 * range when `DateRangeSelected`, or none.
 */
export const previewRangeOf = (
  state: State,
): Option.Option<DateGrid.DateRange> =>
  M.value(state.selection).pipe(
    M.withReturnType<Option.Option<DateGrid.DateRange>>(),
    M.tagsExhaustive({
      NoneSelected: () => Option.none(),
      SingleDate: () => Option.none(),
      RangeStart: ({ start }) =>
        Option.map(state.maybeHoveredDate, hovered =>
          DateGrid.normalizeRange(start, hovered),
        ),
      DateRangeSelected: ({ start, end }) => Option.some({ start, end }),
    }),
  )

/** True when `date` is selected (exact match in `Single` mode, start endpoint in `RangeStart`, or inclusive span in `DateRangeSelected`). */
export const isDateSelected = (
  state: State,
  date: DateGrid.CalendarDate,
): boolean =>
  M.value(state.selection).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      NoneSelected: () => false,
      SingleDate: ({ date: selected }) => DateGrid.isSameDate(selected, date),
      RangeStart: ({ start }) => DateGrid.isSameDate(start, date),
      DateRangeSelected: ({ start, end }) =>
        DateGrid.isDateInRange(date, { start, end }),
    }),
  )

/** True when `date` is the start endpoint of a range selection. */
export const isDateRangeStart = (
  state: State,
  date: DateGrid.CalendarDate,
): boolean =>
  Option.exists(rangeStartOf(state), start => DateGrid.isSameDate(start, date))

/** True when `date` is the end endpoint of a completed range selection. */
export const isDateRangeEnd = (
  state: State,
  date: DateGrid.CalendarDate,
): boolean =>
  Option.exists(rangeEndOf(state), end => DateGrid.isSameDate(end, date))

/** True when `date` lies inside a completed range selection. */
export const isDateInRange = (
  state: State,
  date: DateGrid.CalendarDate,
): boolean =>
  Option.exists(selectedRangeOf(state), range =>
    DateGrid.isDateInRange(date, range),
  )

/** True when `date` lies inside the active hover preview range or committed range. */
export const isDateInPreviewRange = (
  state: State,
  date: DateGrid.CalendarDate,
): boolean =>
  Option.exists(previewRangeOf(state), range =>
    DateGrid.isDateInRange(date, range),
  )

/** True when `date` is disabled either by `props.isDisabled` or `DateGrid` constraints. */
export const isDateDisabled = (
  date: DateGrid.CalendarDate,
  props: Props,
): boolean =>
  isDisabledOf(props) || DateGrid.isDateDisabled(date, constraintsOf(props))

/** True when `date` matches `props.today`. */
export const isToday = (date: DateGrid.CalendarDate, props: Props): boolean =>
  DateGrid.isSameDate(date, props.today)

/** Current focused date, falling back to `props.defaultFocusedDate`, primary selection, or `props.today`. */
export const focusedDateOf = (
  state: State,
  props: Props,
): DateGrid.CalendarDate =>
  Option.getOrElse(state.grid.maybeFocusedDate, () =>
    Option.getOrElse(
      Option.orElse(Option.fromNullishOr(props.defaultFocusedDate), () =>
        selectedDateOf(state),
      ),
      () => props.today,
    ),
  )

/** Current visible `(year, month)`, defaulting to the focused date's month. */
export const viewMonthOf = (state: State, props: Props): DateGrid.YearMonth =>
  Option.getOrElse(state.grid.maybeViewMonth, () => {
    const focus = focusedDateOf(state, props)
    return { year: focus.year, month: focus.month }
  })

/**
 * The date cell that holds roving `tabIndex: 0` in the visible month grid.
 * Uses the focused date when enabled; otherwise falls back to the first enabled
 * day in the visible month via `RovingFocus.firstEnabled`. Returns `None` when
 * the calendar or every day in the visible month is disabled.
 */
export const rovingTargetDateOf = (
  state: State,
  props: Props,
): Option.Option<DateGrid.CalendarDate> => {
  if (isDisabledOf(props)) {
    return Option.none()
  }
  const focused = focusedDateOf(state, props)
  if (!isDateDisabled(focused, props)) {
    return Option.some(focused)
  }
  const view = viewMonthOf(state, props)
  return DateGrid.firstEnabledDateInMonth(
    view.year,
    view.month,
    constraintsOf(props),
  )
}

/** The element id of the currently focused cell in the active view (`Day`, `Month`, or `Year`). */
export const activeDescendantIdOf = (state: State, props: Props): string => {
  const focused = focusedDateOf(state, props)
  return M.value(viewModeOf(state)).pipe(
    M.withReturnType<string>(),
    M.when('Day', () => dayCellId(props.id, focused)),
    M.when('Month', () => monthCellId(props.id, focused.month)),
    M.when('Year', () => yearCellId(props.id, focused.year)),
    M.exhaustive,
  )
}

/** True when navigating backward by one month is permitted under `props`. */
export const canNavigatePreviousMonth = (
  state: State,
  props: Props,
): boolean => {
  if (isDisabledOf(props)) {
    return false
  }
  const view = viewMonthOf(state, props)
  const previous = DateGrid.addMonths(
    DateGrid.makeDate(view.year, view.month, 1),
    -1,
  )
  return !DateGrid.isMonthDisabled(
    previous.year,
    previous.month,
    constraintsOf(props),
  )
}

/** True when navigating forward by one month is permitted under `props`. */
export const canNavigateNextMonth = (state: State, props: Props): boolean => {
  if (isDisabledOf(props)) {
    return false
  }
  const view = viewMonthOf(state, props)
  const next = DateGrid.addMonths(
    DateGrid.makeDate(view.year, view.month, 1),
    1,
  )
  return !DateGrid.isMonthDisabled(next.year, next.month, constraintsOf(props))
}

/** True when navigating backward by one year is permitted under `props`. */
export const canNavigatePreviousYear = (
  state: State,
  props: Props,
): boolean => {
  if (isDisabledOf(props)) {
    return false
  }
  const view = viewMonthOf(state, props)
  return !DateGrid.isYearDisabled(view.year - 1, constraintsOf(props))
}

/** True when navigating forward by one year is permitted under `props`. */
export const canNavigateNextYear = (state: State, props: Props): boolean => {
  if (isDisabledOf(props)) {
    return false
  }
  const view = viewMonthOf(state, props)
  return !DateGrid.isYearDisabled(view.year + 1, constraintsOf(props))
}

/** Generates the currently visible 2D `MonthGrid` for `state` and `props`. */
export const visibleMonthGridOf = (
  state: State,
  props: Props,
): DateGrid.MonthGrid => {
  const view = viewMonthOf(state, props)
  return DateGrid.monthGrid({
    year: view.year,
    month: view.month,
    firstDayOfWeek: DateGrid.firstDayOfWeekOf(props),
    fixedWeeks: DateGrid.fixedWeeksOf(props),
    constraints: constraintsOf(props),
  })
}

/** Generates the currently visible 12-month `MonthsGrid` for `state` and `props`. */
export const visibleMonthsGridOf = (
  state: State,
  props: Props,
): DateGrid.MonthsGrid => {
  const view = viewMonthOf(state, props)
  return DateGrid.monthsGrid({
    year: view.year,
    columns: DateGrid.monthsGridColumnsOf(props),
    constraints: constraintsOf(props),
  })
}

/** Generates the currently visible paged `YearsGrid` for `state` and `props`. */
export const visibleYearsGridOf = (
  state: State,
  props: Props,
): DateGrid.YearsGrid => {
  const focus = focusedDateOf(state, props)
  return DateGrid.yearsGrid({
    year: focus.year,
    pageSize: DateGrid.yearsPageSizeOf(props),
    columns: DateGrid.yearsGridColumnsOf(props),
    constraints: constraintsOf(props),
  })
}

// INTERNAL HELPERS

type StateUpdates = Partial<
  Readonly<{
    grid: DateGrid.State
    selection: Selection
    maybeHoveredDate: Option.Option<DateGrid.CalendarDate>
  }>
>

const focusedFrom = (state: State, updates: StateUpdates = {}): Focused =>
  Focused({
    grid: updates.grid ?? state.grid,
    selection: updates.selection ?? state.selection,
    maybeHoveredDate: updates.maybeHoveredDate ?? state.maybeHoveredDate,
  })

const idleFrom = (state: State, updates: StateUpdates = {}): Idle =>
  Idle({
    grid: updates.grid ?? state.grid,
    selection: updates.selection ?? state.selection,
    maybeHoveredDate: updates.maybeHoveredDate ?? state.maybeHoveredDate,
  })

const resolveGridProps = (state: State, props: Props): DateGrid.Props => {
  const effectiveToday = focusedDateOf(state, props)
  return {
    ...gridPropsOf(props),
    today: effectiveToday,
  }
}

const stepGrid = (
  state: State,
  props: Props,
  gridMessage: DateGrid.Message,
): Option.Option<DateGrid.State> => {
  const effectiveProps =
    gridMessage._tag === 'JumpToToday'
      ? gridPropsOf(props)
      : resolveGridProps(state, props)
  const result = DateGrid.chart.step(state.grid, gridMessage, effectiveProps)
  return result._tag === 'Transitioned'
    ? Option.some(result.state)
    : Option.none()
}

const nextSelectionForDate = (
  selection: Selection,
  date: DateGrid.CalendarDate,
  props: Props,
): Selection => {
  if (!isRangeMode(props)) {
    if (
      isDeselectableOf(props) &&
      selection._tag === 'SingleDate' &&
      DateGrid.isSameDate(selection.date, date)
    ) {
      return NoneSelected()
    } else {
      return SingleDate({ date })
    }
  } else {
    return M.value(selection).pipe(
      M.withReturnType<Selection>(),
      M.tagsExhaustive({
        NoneSelected: () => RangeStart({ start: date }),
        SingleDate: () => RangeStart({ start: date }),
        DateRangeSelected: () => RangeStart({ start: date }),
        RangeStart: ({ start }) => {
          if (
            !allowDisabledInRangeOf(props) &&
            DateGrid.hasDisabledDateInRange(start, date, constraintsOf(props))
          ) {
            return RangeStart({ start: date })
          } else {
            return DateRangeSelected(DateGrid.normalizeRange(start, date))
          }
        },
      }),
    )
  }
}

const commitDate = (
  state: State,
  date: DateGrid.CalendarDate,
  props: Props,
): Focused =>
  focusedFrom(state, {
    grid: DateGrid.Day({
      maybeViewMonth: Option.some({ year: date.year, month: date.month }),
      maybeFocusedDate: Option.some(date),
    }),
    selection: nextSelectionForDate(state.selection, date, props),
    maybeHoveredDate: Option.none(),
  })

const focusEntryGrid = (state: State, props: Props): DateGrid.State => {
  const target = Option.getOrElse(rovingTargetDateOf(state, props), () =>
    focusedDateOf(state, props),
  )
  const view = viewMonthOf(state, props)
  const fields = {
    maybeViewMonth: Option.some(view),
    maybeFocusedDate: Option.some(target),
  }
  return M.value(viewModeOf(state)).pipe(
    M.withReturnType<DateGrid.State>(),
    M.when('Day', () => DateGrid.Day(fields)),
    M.when('Month', () => DateGrid.Month(fields)),
    M.when('Year', () => DateGrid.Year(fields)),
    M.exhaustive,
  )
}

// CHART TRANSITION HELPERS

type StateVariant<Tag extends State['_tag']> = Extract<
  State,
  { readonly _tag: Tag }
>

const selectDateEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof SelectCalendarDate.Type, never, Props>
> => [
  when(
    (_state: S, message: typeof SelectCalendarDate.Type, context: Props) =>
      !isDisabledOf(context) &&
      !isReadOnlyOf(context) &&
      !isDateDisabled(message.date, context),
    'Focused',
    ({ state, message, context }) => commitDate(state, message.date, context),
  ),
  ignore(),
]

const gridStepEdges = <
  Target extends State['_tag'],
  TriggerMessage extends Message,
>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
  toGridMessage: (message: TriggerMessage) => DateGrid.Message,
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
      isDisabledOf(context)
        ? Option.none()
        : stepGrid(state, context, toGridMessage(message)),
    target,
    ({ state, guardValue }) => build(state, { grid: guardValue }),
  ),
  ignore(),
]

const clearSelectionEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof ClearCalendarSelection.Type,
    never,
    Props
  >
> => [
  when(
    (
      state: StateVariant<Target>,
      _message: typeof ClearCalendarSelection.Type,
      context: Props,
    ) =>
      !isDisabledOf(context) &&
      !isReadOnlyOf(context) &&
      state.selection._tag !== 'NoneSelected',
    target,
    ({ state }) =>
      build(state, {
        selection: NoneSelected(),
        maybeHoveredDate: Option.none(),
      }),
  ),
  ignore(),
]

const setRangeEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof SetCalendarRange.Type,
    never,
    Props
  >
> => [
  when(
    (
      _state: StateVariant<Target>,
      message: typeof SetCalendarRange.Type,
      context: Props,
    ) => {
      if (
        isDisabledOf(context) ||
        isReadOnlyOf(context) ||
        !isRangeMode(context)
      ) {
        return Option.none()
      }
      const constraints = constraintsOf(context)
      if (
        isDateDisabled(message.start, context) ||
        isDateDisabled(message.end, context)
      ) {
        return Option.none()
      }
      if (
        !allowDisabledInRangeOf(context) &&
        DateGrid.hasDisabledDateInRange(message.start, message.end, constraints)
      ) {
        return Option.none()
      }
      return Option.some(DateGrid.normalizeRange(message.start, message.end))
    },
    target,
    ({ state, guardValue }) =>
      build(state, {
        grid: DateGrid.Day({
          maybeViewMonth: Option.some({
            year: guardValue.start.year,
            month: guardValue.start.month,
          }),
          maybeFocusedDate: Option.some(guardValue.start),
        }),
        selection: DateRangeSelected(guardValue),
        maybeHoveredDate: Option.none(),
      }),
  ),
  ignore(),
]

const hoverDateEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof HoverCalendarDate.Type,
    never,
    Props
  >
> => [
  when(
    (
      _state: StateVariant<Target>,
      message: typeof HoverCalendarDate.Type,
      context: Props,
    ) => !isDateDisabled(message.date, context),
    target,
    ({ state, message }) =>
      build(state, { maybeHoveredDate: Option.some(message.date) }),
  ),
  ignore(),
]

const leaveDateEdges = <Target extends State['_tag']>(
  target: Target,
  build: (
    state: StateVariant<Target>,
    updates: StateUpdates,
  ) => StateVariant<Target>,
): ReadonlyArray<
  GuardedEdge<
    State,
    Message,
    StateVariant<Target>,
    typeof LeaveCalendarDate.Type,
    never,
    Props
  >
> => [
  when(
    (state: StateVariant<Target>) => Option.isSome(state.maybeHoveredDate),
    target,
    ({ state }) => build(state, { maybeHoveredDate: Option.none() }),
  ),
  ignore(),
]

const pressedKeyEdges = <S extends State>(): ReadonlyArray<
  GuardedEdge<State, Message, S, typeof PressedCalendarKey.Type, never, Props>
> => [
  when(
    (state: S, message: typeof PressedCalendarKey.Type, context: Props) => {
      if (isDisabledOf(context) || message.key !== 'Escape') {
        return Option.none()
      }
      const mode = viewModeOf(state)
      if (mode === 'Year') {
        return Option.map(
          stepGrid(state, context, DateGrid.SetViewMode({ mode: 'Month' })),
          grid => focusedFrom(state, { grid }),
        )
      } else if (mode === 'Month') {
        return Option.map(
          stepGrid(state, context, DateGrid.DropToDayView()),
          grid => focusedFrom(state, { grid }),
        )
      } else if (state.selection._tag === 'RangeStart') {
        return Option.some(
          focusedFrom(state, {
            selection: NoneSelected(),
            maybeHoveredDate: Option.none(),
          }),
        )
      } else {
        return Option.none()
      }
    },
    'Focused',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state: S, message: typeof PressedCalendarKey.Type, context: Props) => {
      if (isDisabledOf(context) || !DateGrid.isCommitKey(message.key)) {
        return Option.none()
      }
      const focused = focusedDateOf(state, context)
      const mode = viewModeOf(state)
      if (mode === 'Day') {
        if (isReadOnlyOf(context) || isDateDisabled(focused, context)) {
          return Option.none()
        }
        return Option.some(commitDate(state, focused, context))
      } else if (mode === 'Month') {
        return Option.map(
          stepGrid(
            state,
            context,
            DateGrid.DrillIntoMonth({ month: focused.month }),
          ),
          grid => focusedFrom(state, { grid }),
        )
      } else {
        return Option.map(
          stepGrid(
            state,
            context,
            DateGrid.DrillIntoYear({ year: focused.year }),
          ),
          grid => focusedFrom(state, { grid }),
        )
      }
    },
    'Focused',
    ({ guardValue }) => guardValue,
  ),
  when(
    (state: S, message: typeof PressedCalendarKey.Type, context: Props) =>
      isDisabledOf(context)
        ? Option.none()
        : stepGrid(
            state,
            context,
            DateGrid.PressedGridKey({
              key: message.key,
              ...(message.isShift === undefined
                ? {}
                : { isShift: message.isShift }),
            }),
          ),
    'Focused',
    ({ state, guardValue }) => focusedFrom(state, { grid: guardValue }),
  ),
  ignore(),
]

// CHART

/**
 * Builds the Calendar Machine chart starting in `initialState`: single and
 * date-range selection modes, `Day` / `Month` / `Year` views, 2D keyboard
 * navigation with disabled-date skipping via `DateGrid` and `RovingFocus`,
 * previous/next month and year stepping, today jump, hover range preview, and
 * min/max/disabled constraints.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          SelectCalendarDate: selectDateEdges<Idle>(),
          PreviousCalendarMonth: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.StepMonth({ delta: -1 }),
          ),
          NextCalendarMonth: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.StepMonth({ delta: 1 }),
          ),
          PreviousCalendarYear: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.StepYear({ delta: -1 }),
          ),
          NextCalendarYear: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.StepYear({ delta: 1 }),
          ),
          JumpToToday: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.JumpToToday(),
          ),
          ZoomOutCalendarView: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.ZoomOutView(),
          ),
          ClearCalendarSelection: clearSelectionEdges('Idle', idleFrom),
          FocusCalendarGrid: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Focused',
              ({ state, context }) =>
                focusedFrom(state, { grid: focusEntryGrid(state, context) }),
            ),
            ignore(),
          ],
          FocusCalendarDate: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Focused',
              ({ state, message, context }) =>
                Option.match(
                  stepGrid(
                    state,
                    context,
                    DateGrid.FocusDate({ date: message.date }),
                  ),
                  {
                    onNone: () => focusedFrom(state),
                    onSome: grid => focusedFrom(state, { grid }),
                  },
                ),
            ),
            ignore(),
          ],
          HoverCalendarDate: hoverDateEdges('Idle', idleFrom),
          LeaveCalendarDate: leaveDateEdges('Idle', idleFrom),
          SelectCalendarMonth: gridStepEdges(
            'Idle',
            idleFrom,
            (message: typeof SelectCalendarMonth.Type) =>
              DateGrid.DrillIntoMonth({ month: message.month }),
          ),
          SelectCalendarYear: gridStepEdges(
            'Idle',
            idleFrom,
            (message: typeof SelectCalendarYear.Type) =>
              DateGrid.DrillIntoYear({ year: message.year }),
          ),
          PageCalendarYears: gridStepEdges(
            'Idle',
            idleFrom,
            (message: typeof PageCalendarYears.Type) =>
              DateGrid.PageYears({ direction: message.direction }),
          ),
          SetCalendarViewMode: gridStepEdges(
            'Idle',
            idleFrom,
            (message: typeof SetCalendarViewMode.Type) =>
              DateGrid.SetViewMode({ mode: message.mode }),
          ),
          DropCalendarToDayView: gridStepEdges('Idle', idleFrom, () =>
            DateGrid.DropToDayView(),
          ),
          PressedCalendarKey: pressedKeyEdges<Idle>(),
          SetCalendarRange: setRangeEdges('Idle', idleFrom),
        },
      },
      Focused: {
        on: {
          SelectCalendarDate: selectDateEdges<Focused>(),
          PreviousCalendarMonth: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.StepMonth({ delta: -1 }),
          ),
          NextCalendarMonth: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.StepMonth({ delta: 1 }),
          ),
          PreviousCalendarYear: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.StepYear({ delta: -1 }),
          ),
          NextCalendarYear: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.StepYear({ delta: 1 }),
          ),
          JumpToToday: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.JumpToToday(),
          ),
          ZoomOutCalendarView: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.ZoomOutView(),
          ),
          ClearCalendarSelection: clearSelectionEdges('Focused', focusedFrom),
          BlurCalendarGrid: to('Idle', ({ state }) =>
            idleFrom(state, { maybeHoveredDate: Option.none() }),
          ),
          FocusCalendarDate: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Focused',
              ({ state, message, context }) =>
                Option.match(
                  stepGrid(
                    state,
                    context,
                    DateGrid.FocusDate({ date: message.date }),
                  ),
                  {
                    onNone: () => focusedFrom(state),
                    onSome: grid => focusedFrom(state, { grid }),
                  },
                ),
            ),
            ignore(),
          ],
          HoverCalendarDate: hoverDateEdges('Focused', focusedFrom),
          LeaveCalendarDate: leaveDateEdges('Focused', focusedFrom),
          SelectCalendarMonth: gridStepEdges(
            'Focused',
            focusedFrom,
            (message: typeof SelectCalendarMonth.Type) =>
              DateGrid.DrillIntoMonth({ month: message.month }),
          ),
          SelectCalendarYear: gridStepEdges(
            'Focused',
            focusedFrom,
            (message: typeof SelectCalendarYear.Type) =>
              DateGrid.DrillIntoYear({ year: message.year }),
          ),
          PageCalendarYears: gridStepEdges(
            'Focused',
            focusedFrom,
            (message: typeof PageCalendarYears.Type) =>
              DateGrid.PageYears({ direction: message.direction }),
          ),
          SetCalendarViewMode: gridStepEdges(
            'Focused',
            focusedFrom,
            (message: typeof SetCalendarViewMode.Type) =>
              DateGrid.SetViewMode({ mode: message.mode }),
          ),
          DropCalendarToDayView: gridStepEdges('Focused', focusedFrom, () =>
            DateGrid.DropToDayView(),
          ),
          PressedCalendarKey: pressedKeyEdges<Focused>(),
          SetCalendarRange: setRangeEdges('Focused', focusedFrom),
        },
      },
    },
  })

/** The default Calendar Machine chart starting in `Idle` with no date selected. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  SelectCalendarDate: pace,
  PreviousCalendarMonth: pace,
  NextCalendarMonth: pace,
  PreviousCalendarYear: pace,
  NextCalendarYear: pace,
  JumpToToday: pace,
  ZoomOutCalendarView: pace,
  ClearCalendarSelection: pace,
  FocusCalendarGrid: pace,
  BlurCalendarGrid: pace,
  FocusCalendarDate: pace,
  HoverCalendarDate: pace,
  LeaveCalendarDate: pace,
  SelectCalendarMonth: pace,
  SelectCalendarYear: pace,
  PageCalendarYears: pace,
  SetCalendarViewMode: pace,
  DropCalendarToDayView: pace,
  PressedCalendarKey: pace,
  SetCalendarRange: pace,
})

/** Default synchronization: every Calendar Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a Calendar kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The five painted slots of a Calendar Part: `Grid`, `GridCell`,
 * `PreviousMonthButton`, `NextMonthButton`, and `Heading`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Grid: {
    role: 'Grid',
    focus: 'Container',
    gestures: [],
  },
  GridCell: {
    role: 'GridCell',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectCalendarDate' }],
  },
  PreviousMonthButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'PreviousCalendarMonth' }],
  },
  NextMonthButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'NextCalendarMonth' }],
  },
  Heading: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ZoomOutCalendarView' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  if (slot === 'Grid') {
    return {
      id: gridId(props.id),
      labelledBy: props.labelledBy ?? headingId(props.id),
      activeId: activeDescendantIdOf(state, props),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(isRangeMode(props) ? { isMultiselectable: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'GridCell') {
    return Option.match(Option.flatMap(maybeChoice, DateGrid.parseIso), {
      onNone: () => ({}),
      onSome: date => {
        const isDisabled = isDateDisabled(date, props)
        const isSelected = isDateSelected(state, date)
        const isCurrent = isToday(date, props)
        const isRovingTarget = Option.exists(
          rovingTargetDateOf(state, props),
          target => DateGrid.isSameDate(target, date),
        )
        return {
          id: dayCellId(props.id, date),
          isSelected,
          isCurrent,
          tabIndex: isRovingTarget ? 0 : -1,
          ...(isDisabled ? { isDisabled: true } : {}),
          ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
        }
      },
    })
  } else if (slot === 'PreviousMonthButton') {
    return {
      id: previousMonthButtonId(props.id),
      controls: gridId(props.id),
      label: 'Previous month',
      tabIndex: 0,
      ...(!canNavigatePreviousMonth(state, props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'NextMonthButton') {
    return {
      id: nextMonthButtonId(props.id),
      controls: gridId(props.id),
      label: 'Next month',
      tabIndex: 0,
      ...(!canNavigateNextMonth(state, props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Heading') {
    return {
      id: headingId(props.id),
      controls: gridId(props.id),
      live: 'Polite',
      isAtomic: true,
      tabIndex: 0,
      ...(isDisabledOf(props) || viewModeOf(state) === 'Year'
        ? { isDisabled: true }
        : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a Calendar on: returns to `Idle` and `Day` view while
 * keeping the visible month and selection and clearing transient hover state.
 */
export const atRest = (state: State): State =>
  Idle({
    grid: DateGrid.atRest(state.grid),
    selection: state.selection,
    maybeHoveredDate: Option.none(),
  })

// PART FACTORY

/** Options for customizing a Calendar Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'` or `'OwnChoice'`) to keep this Calendar device-only. */
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
    return Idle({
      grid,
      selection: NoneSelected(),
      maybeHoveredDate: Option.none(),
    })
  }
}

/**
 * Creates a Calendar {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * Calendar local to one device.
 *
 * @example
 * ```typescript
 * const BookingCalendar = Calendar.make({ name: 'BookingCalendar' })
 * const LocalCalendar = Calendar.make({ name: 'LocalCalendar', sync: 'OwnView' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const initialState = initialStateOf(options)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'Calendar',
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
 * Shorthand for a Calendar Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 *
 * @example
 * ```typescript
 * const LocalCalendar = Calendar.deviceOnly({ name: 'LocalCalendar' })
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

/** The default synced Calendar Part (`name: 'Calendar'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
