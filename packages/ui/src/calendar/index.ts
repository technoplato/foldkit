import {
  Array,
  Effect,
  Function,
  Match as M,
  Number,
  Option,
  Schema as S,
  pipe,
} from 'effect'
import { Calendar as CoreCalendar, DateGrid } from 'foldkit/behavior'
import * as Calendar from 'foldkit/calendar'
import type { CalendarDate } from 'foldkit/calendar'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import {
  type ChildAttribute,
  type Html,
  childAttributes,
  html,
} from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'
import { type Reflect, defineView } from 'foldkit/submodel'

import * as OptionExt from '../internal/optionExtensions.js'
import { idSelector } from '../internal/selectors.js'

// MODEL

/** Which grid the calendar is currently displaying. `Days` is the standard
 * 6×7 day grid; `Months` is a 3×4 month-name grid for fast month jumps;
 * `Years` is a 3×4 year grid paged in 12-year windows for fast year jumps. */
export const ViewMode = S.Literals(['Days', 'Months', 'Years'])
export type ViewMode = typeof ViewMode.Type

/** Schema for the calendar component's state. Tracks the visible month/year,
 * the keyboard-focused and user-selected dates, the active view mode, and
 * the configuration that governs navigation (locale, min/max, disabled
 * days). */
export const Model = S.Struct({
  id: S.String,
  today: Calendar.CalendarDate,
  viewYear: S.Int,
  viewMonth: S.Int.check(S.isBetween({ minimum: 1, maximum: 12 })),
  viewMode: ViewMode,
  maybeFocusedDate: S.Option(Calendar.CalendarDate),
  isGridFocused: S.Boolean,
  locale: Calendar.LocaleConfig,
  maybeMinDate: S.Option(Calendar.CalendarDate),
  maybeMaxDate: S.Option(Calendar.CalendarDate),
  disabledDaysOfWeek: S.Array(Calendar.DayOfWeek),
  disabledDates: S.Array(Calendar.CalendarDate),
})

export type Model = typeof Model.Type

// MESSAGE

/** Sent when the user clicks a day cell in the grid. */
export const ClickedDay = m('ClickedDay', { date: Calendar.CalendarDate })
/** Sent when the user presses a key on the grid container. The update maps
 * the key to a navigation or selection action. */
export const PressedKeyOnGrid = m('PressedKeyOnGrid', {
  key: S.String,
  isShift: S.Boolean,
})
/** Sent when the user clicks the previous-month navigation button in Days
 * mode. (The Years mode prev/next-page buttons dispatch `PagedYears`.) */
export const ClickedPreviousMonthButton = m('ClickedPreviousMonthButton')
/** Sent when the user clicks the next-month navigation button in Days
 * mode. (The Years mode prev/next-page buttons dispatch `PagedYears`.) */
export const ClickedNextMonthButton = m('ClickedNextMonthButton')
/** Sent when the user clicks the calendar heading. Zooms out one mode
 * level: Days → Months, Months → Years. Terminal in Years mode. */
export const ClickedHeading = m('ClickedHeading')
/** Sent when the user picks a month from the months grid. Jumps the view
 * to that month and returns the calendar to Days mode. */
export const SelectedMonth = m('SelectedMonth', { month: S.Int })
/** Sent when the user picks a year from the years grid. Jumps the view to
 * that year and transitions the calendar to Months mode for further drilling. */
export const SelectedYear = m('SelectedYear', { year: S.Int })
/** Sent when the user pages the years grid forward or backward by one
 * window. Direction is `1` for next, `-1` for previous. */
export const PagedYears = m('PagedYears', {
  direction: S.Literals([1, -1]),
})
/** Sent when the grid container receives DOM focus. */
export const FocusedGrid = m('FocusedGrid')
/** Sent when the grid container loses DOM focus. */
export const BlurredGrid = m('BlurredGrid')
/** Sent when a long-lived session's "today" reference should be refreshed. */
export const RefreshedToday = m('RefreshedToday', {
  today: Calendar.CalendarDate,
})
/** Sent when a FocusGrid command completes. */
export const CompletedFocusGrid = m('CompletedFocusGrid')

/** Union of all messages the calendar component can produce. */
export const Message = S.Union([
  ClickedDay,
  PressedKeyOnGrid,
  ClickedPreviousMonthButton,
  ClickedNextMonthButton,
  ClickedHeading,
  SelectedMonth,
  SelectedYear,
  PagedYears,
  FocusedGrid,
  BlurredGrid,
  RefreshedToday,
  CompletedFocusGrid,
])
export type Message = typeof Message.Type

export type ClickedDay = typeof ClickedDay.Type
export type PressedKeyOnGrid = typeof PressedKeyOnGrid.Type
export type SelectedMonth = typeof SelectedMonth.Type
export type SelectedYear = typeof SelectedYear.Type

// OUT MESSAGE

/** Emitted when the visible month changes due to navigation. Consumers of an
 * inline calendar may use this to load month-scoped data (holidays, events).
 * A click that commits a date in a different month emits `SelectedDate`, not
 * `ChangedViewMonth`. The parent infers the month change from the date. */
export const ChangedViewMonth = m('ChangedViewMonth', {
  year: S.Int,
  month: S.Int,
})

/** Emitted when the user commits a date selection via click or keyboard. The
 * calendar's internal state already reflects the new selection by the time
 * this fires; consumers react by lifting the date into their domain state
 * (closing a popover, advancing a form step, etc.). */
export const SelectedDate = m('SelectedDate', {
  date: Calendar.CalendarDate,
})

/** Union of the calendar's OutMessages. */
export const OutMessage = S.Union([ChangedViewMonth, SelectedDate])
export type OutMessage = typeof OutMessage.Type

export type ChangedViewMonth = typeof ChangedViewMonth.Type
export type SelectedDate = typeof SelectedDate.Type

// INIT

/** Configuration for creating a calendar model with `init`. */
export type InitConfig = Readonly<{
  id: string
  today: CalendarDate
  initialViewDate?: CalendarDate
  locale?: Calendar.LocaleConfig
  minDate?: CalendarDate
  maxDate?: CalendarDate
  disabledDaysOfWeek?: ReadonlyArray<Calendar.DayOfWeek>
  disabledDates?: ReadonlyArray<CalendarDate>
}>

/** Creates an initial calendar model. The selected date is owned by the
 * parent and passed in via `ViewInputs.maybeSelectedDate`. The view month
 * defaults to `initialViewDate` (pass the parent's selected date to open onto
 * it), or today when omitted. */
export const init = (config: InitConfig): Model => {
  const initialFocus = config.initialViewDate ?? config.today
  return {
    id: config.id,
    today: config.today,
    viewYear: initialFocus.year,
    viewMonth: initialFocus.month,
    viewMode: 'Days',
    maybeFocusedDate: Option.some(initialFocus),
    isGridFocused: false,
    locale: config.locale ?? Calendar.defaultEnglishLocale,
    maybeMinDate: Option.fromNullishOr(config.minDate),
    maybeMaxDate: Option.fromNullishOr(config.maxDate),
    disabledDaysOfWeek: config.disabledDaysOfWeek ?? [],
    disabledDates: config.disabledDates ?? [],
  }
}

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
  Option.Option<OutMessage>,
]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const gridId = CoreCalendar.gridId
const gridSelector = (modelId: string): string => idSelector(gridId(modelId))

/** Focuses the calendar grid container. Parent components like DatePicker
 * dispatch this after opening to hand focus to the grid's keyboard layer. */
export const FocusGrid = Command.define(
  'FocusGrid',
  { id: S.String },
  CompletedFocusGrid,
)(({ id }) =>
  Dom.focus(gridSelector(id)).pipe(
    Effect.ignore,
    Effect.as(CompletedFocusGrid()),
  ),
)

/** Programmatically selects a date on the calendar, committing it as the
 * chosen value and moving the cursor onto it. Use this in controlled-mode
 * handlers (when the view's `onSelectedDate` callback is provided) to write
 * the selection back to the calendar's internal state.
 *
 * Equivalent to dispatching `ClickedDay({ date })` through `update`. */
export const selectDate = (model: Model, date: CalendarDate): UpdateReturn =>
  update(model, ClickedDay({ date }))

/** Moves the calendar's view and cursor to a date without changing the
 *  selection (which the parent owns). Use it to navigate to a known date, for
 *  example when opening a date picker onto its current value so the selected
 *  month is visible. Returns the model directly because it produces no
 *  commands and no OutMessage. */
export const focusDate: Reflect<Model, CalendarDate> = Function.dual(
  2,
  (model: Model, date: CalendarDate): Model =>
    evo(model, {
      maybeFocusedDate: () => Option.some(date),
      viewYear: () => date.year,
      viewMonth: () => date.month,
    }),
)

/** Reflects the minimum selectable date onto the model. Pass `Option.none()`
 * to remove the minimum. Use this when the minimum derives from other Model
 * state (e.g. a start date field whose current selection constrains an end
 * date picker).
 *
 * Does NOT reconcile the current selection. If a previously-selected date
 * is now below the new minimum, it remains selected. Callers should clear or
 * reassign the selection explicitly if their domain requires it. */
export const reflectMinDate: Reflect<
  Model,
  Option.Option<CalendarDate>
> = Function.dual(
  2,
  (model: Model, maybeMinDate: Option.Option<CalendarDate>): Model =>
    evo(model, { maybeMinDate: () => maybeMinDate }),
)

/** Reflects the maximum selectable date onto the model. Pass `Option.none()`
 * to remove the maximum. Does NOT reconcile the current selection. */
export const reflectMaxDate: Reflect<
  Model,
  Option.Option<CalendarDate>
> = Function.dual(
  2,
  (model: Model, maybeMaxDate: Option.Option<CalendarDate>): Model =>
    evo(model, { maybeMaxDate: () => maybeMaxDate }),
)

/** Reflects the list of individually-disabled dates onto the model. Pass an
 * empty array to clear. Does NOT reconcile the current selection. */
export const reflectDisabledDates: Reflect<
  Model,
  ReadonlyArray<CalendarDate>
> = Function.dual(
  2,
  (model: Model, disabledDates: ReadonlyArray<CalendarDate>): Model =>
    evo(model, { disabledDates: () => disabledDates }),
)

/** Reflects the days of the week that are disabled (e.g. weekends) onto the
 * model. Pass an empty array to clear. Does NOT reconcile the current
 * selection. */
export const reflectDisabledDaysOfWeek: Reflect<
  Model,
  ReadonlyArray<Calendar.DayOfWeek>
> = Function.dual(
  2,
  (
    model: Model,
    disabledDaysOfWeek: ReadonlyArray<Calendar.DayOfWeek>,
  ): Model => evo(model, { disabledDaysOfWeek: () => disabledDaysOfWeek }),
)

/** Returns the calendar to Days mode regardless of current depth. Useful for
 * standalone (non-popovered) consumers that want to wire their own back-out
 * gesture. Popovered consumers like `DatePicker` don't need this. Escape
 * closes the popover, and the calendar resets to Days on next open.
 *
 * Reconciles `maybeFocusedDate` to a date inside the visible (`viewYear`,
 * `viewMonth`). Months/Years navigation can leave the cursor on a date
 * outside the days grid (paged-away year, etc.), which would otherwise
 * cause `aria-activedescendant` to point at a non-rendered cell and the
 * next ArrowLeft to jump to the cursor's stale year. */
export const dropToDays = (model: Model): Model =>
  evo(model, {
    viewMode: () => 'Days',
    maybeFocusedDate: () =>
      Option.some(
        DateGrid.reconcileFocusInMonth(
          model.viewYear,
          model.viewMonth,
          model.maybeFocusedDate,
        ),
      ),
  })

const constraintsOf = (model: Model): DateGrid.Constraints => ({
  ...(Option.isSome(model.maybeMinDate)
    ? { minDate: model.maybeMinDate.value }
    : {}),
  ...(Option.isSome(model.maybeMaxDate)
    ? { maxDate: model.maybeMaxDate.value }
    : {}),
  disabledDates: model.disabledDates,
  disabledDaysOfWeek: model.disabledDaysOfWeek,
})

const isDateDisabled = (model: Model, date: CalendarDate): boolean =>
  DateGrid.isDateDisabled(date, constraintsOf(model))

const skipDisabled = (
  model: Model,
  start: CalendarDate,
  direction: 1 | -1,
  cap: number,
): CalendarDate =>
  DateGrid.skipDisabledDate(start, direction, constraintsOf(model), cap)

const clampToRange = (model: Model, candidate: CalendarDate): CalendarDate =>
  DateGrid.clampDate(candidate, constraintsOf(model))

const resolveNavigationKey = (
  key: string,
  isShift: boolean,
  focused: CalendarDate,
  firstDayOfWeek: Calendar.DayOfWeek,
): Option.Option<readonly [CalendarDate, 1 | -1, number]> =>
  Option.map(
    DateGrid.resolveDayKey({ key, isShift, focused, firstDayOfWeek }),
    ({ candidate, direction, skipCap }) => [candidate, direction, skipCap],
  )

const isCommitKey = DateGrid.isCommitKey

const currentOrFallbackFocus = (model: Model): CalendarDate =>
  Option.getOrElse(model.maybeFocusedDate, () =>
    Calendar.make(model.viewYear, model.viewMonth, 1),
  )

/** Applies a date selection to the model: commits the selection, moves the
 * cursor onto the date, and syncs the view month if the selection crosses a
 * month boundary. Always emits `SelectedDate` carrying the committed date;
 * the parent infers month transitions from the date itself rather than from
 * a separate `ChangedViewMonth` signal that would race with the selection. */
const commitSelection = (
  model: Model,
  date: CalendarDate,
): readonly [Model, Option.Option<OutMessage>] => {
  const nextModel = evo(model, {
    maybeFocusedDate: () => Option.some(date),
    viewYear: () => date.year,
    viewMonth: () => date.month,
  })
  return [nextModel, Option.some(SelectedDate({ date }))]
}

/** Applies a focus move to the model, clamping to the allowed range and
 * skipping disabled dates. Emits `ChangedViewMonth` if the move crossed a
 * month boundary. */
const applyFocusMove = (
  model: Model,
  candidate: CalendarDate,
  direction: 1 | -1,
  cap: number,
): readonly [Model, Option.Option<OutMessage>] => {
  const clamped = clampToRange(model, candidate)
  const nextFocus = skipDisabled(model, clamped, direction, cap)
  const crossedMonth =
    nextFocus.year !== model.viewYear || nextFocus.month !== model.viewMonth
  const nextModel = evo(model, {
    maybeFocusedDate: () => Option.some(nextFocus),
    viewYear: () => nextFocus.year,
    viewMonth: () => nextFocus.month,
  })
  const maybeOutMessage = OptionExt.when(
    crossedMonth,
    ChangedViewMonth({ year: nextFocus.year, month: nextFocus.month }),
  )
  return [nextModel, maybeOutMessage]
}

const moveFocusForViewChange = (
  model: Model,
  year: number,
  month: number,
  direction: 1 | -1,
): CalendarDate =>
  DateGrid.moveFocusForViewMonth({
    maybeFocusedDate: model.maybeFocusedDate,
    year,
    month,
    direction,
    constraints: constraintsOf(model),
  })

const applyViewMonthChange = (
  model: Model,
  year: number,
  month: number,
  direction: 1 | -1,
): UpdateReturn => {
  if (year === model.viewYear && month === model.viewMonth) {
    return [model, [], Option.none()]
  }
  const nextFocus = moveFocusForViewChange(model, year, month, direction)
  const nextModel = evo(model, {
    viewYear: () => year,
    viewMonth: () => month,
    maybeFocusedDate: () => Option.some(nextFocus),
  })
  return [nextModel, [], Option.some(ChangedViewMonth({ year, month }))]
}

const jumpDirection = (model: Model, year: number, month: number): 1 | -1 =>
  DateGrid.jumpDirection(model.viewYear, model.viewMonth, year, month)

const resolveMonthsKey = (key: string): Option.Option<number> =>
  DateGrid.resolveMonthShift(key)

const resolveYearsKey = (key: string): Option.Option<number> =>
  DateGrid.resolveYearShift(key)

/** Applies a months-grid focus shift, updating `maybeFocusedDate` and
 * `viewYear` to reflect the new focused date. `viewMonth` is preserved.
 * Months mode keyboard navigation moves the cursor without committing. */
const applyMonthsFocusShift = (
  model: Model,
  monthShift: number,
): UpdateReturn => {
  const focused = currentOrFallbackFocus(model)
  const nextFocus = Calendar.addMonths(focused, monthShift)
  return [
    evo(model, {
      maybeFocusedDate: () => Option.some(nextFocus),
      viewYear: () => nextFocus.year,
    }),
    [],
    Option.none(),
  ]
}

/** Applies a years-grid focus shift, updating only `maybeFocusedDate`.
 * `viewYear` is preserved so the "selected" highlight (`year === viewYear`)
 * stays on the calendar's centered year while the cursor moves freely. The
 * visible 12-year page is derived from the cursor in the view layer. */
const applyYearsFocusShift = (
  model: Model,
  yearShift: number,
): UpdateReturn => {
  const focused = currentOrFallbackFocus(model)
  const nextFocus = Calendar.addYears(focused, yearShift)
  return [
    evo(model, {
      maybeFocusedDate: () => Option.some(nextFocus),
    }),
    [],
    Option.none(),
  ]
}

/** Processes a calendar message and returns the next model, commands, and
 * optional OutMessage. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedDay: ({ date }) => {
        if (isDateDisabled(model, date)) {
          return [model, [], Option.none()]
        } else {
          const [nextModel, maybeOutMessage] = commitSelection(model, date)
          return [nextModel, [], maybeOutMessage]
        }
      },

      PressedKeyOnGrid: ({ key, isShift }) =>
        M.value(model.viewMode).pipe(
          withUpdateReturn,
          M.when('Days', () => {
            const focused = currentOrFallbackFocus(model)

            if (isCommitKey(key)) {
              if (isDateDisabled(model, focused)) {
                return [model, [], Option.none()]
              } else {
                const [nextModel, maybeOutMessage] = commitSelection(
                  model,
                  focused,
                )
                return [nextModel, [], maybeOutMessage]
              }
            } else {
              return Option.match(
                resolveNavigationKey(
                  key,
                  isShift,
                  focused,
                  model.locale.firstDayOfWeek,
                ),
                {
                  onNone: () => [model, [], Option.none()],
                  onSome: ([candidate, direction, cap]) => {
                    const [nextModel, maybeOutMessage] = applyFocusMove(
                      model,
                      candidate,
                      direction,
                      cap,
                    )
                    return [nextModel, [], maybeOutMessage]
                  },
                },
              )
            }
          }),
          M.when('Months', () =>
            Option.match(resolveMonthsKey(key), {
              onNone: () => [model, [], Option.none()],
              onSome: shift => applyMonthsFocusShift(model, shift),
            }),
          ),
          M.when('Years', () =>
            Option.match(resolveYearsKey(key), {
              onNone: () => [model, [], Option.none()],
              onSome: shift => applyYearsFocusShift(model, shift),
            }),
          ),
          M.exhaustive,
        ),

      ClickedPreviousMonthButton: () => {
        const next = Calendar.subtractMonths(
          Calendar.make(model.viewYear, model.viewMonth, 1),
          1,
        )
        return applyViewMonthChange(model, next.year, next.month, -1)
      },

      ClickedNextMonthButton: () => {
        const next = Calendar.addMonths(
          Calendar.make(model.viewYear, model.viewMonth, 1),
          1,
        )
        return applyViewMonthChange(model, next.year, next.month, 1)
      },

      ClickedHeading: () =>
        M.value(model.viewMode).pipe(
          withUpdateReturn,
          M.when('Days', () => [
            evo(model, { viewMode: () => 'Months' }),
            [FocusGrid({ id: model.id })],
            Option.none(),
          ]),
          M.when('Months', () => [
            evo(model, { viewMode: () => 'Years' }),
            [FocusGrid({ id: model.id })],
            Option.none(),
          ]),
          M.when('Years', () => [model, [], Option.none()]),
          M.exhaustive,
        ),

      SelectedMonth: ({ month }) => {
        if (isMonthDisabled(model, model.viewYear, month)) {
          return [model, [], Option.none()]
        } else {
          const [nextModel, commands, maybeOutMessage] = applyViewMonthChange(
            model,
            model.viewYear,
            month,
            jumpDirection(model, model.viewYear, month),
          )
          return [
            evo(nextModel, { viewMode: () => 'Days' }),
            [...commands, FocusGrid({ id: model.id })],
            maybeOutMessage,
          ]
        }
      },

      SelectedYear: ({ year }) => {
        if (isYearDisabled(model, year)) {
          return [model, [], Option.none()]
        } else {
          const [nextModel, commands, maybeOutMessage] = applyViewMonthChange(
            model,
            year,
            model.viewMonth,
            jumpDirection(model, year, model.viewMonth),
          )
          return [
            evo(nextModel, { viewMode: () => 'Months' }),
            [...commands, FocusGrid({ id: model.id })],
            maybeOutMessage,
          ]
        }
      },

      PagedYears: ({ direction }) =>
        applyYearsFocusShift(model, direction * DateGrid.YEARS_PAGE_SIZE),

      FocusedGrid: () => [
        evo(model, { isGridFocused: () => true }),
        [],
        Option.none(),
      ],

      BlurredGrid: () => [
        evo(model, { isGridFocused: () => false }),
        [],
        Option.none(),
      ],

      RefreshedToday: ({ today }) => [
        evo(model, { today: () => today }),
        [],
        Option.none(),
      ],

      CompletedFocusGrid: () => [model, [], Option.none()],
    }),
  )

// VIEW

const headingId = CoreCalendar.headingId
const dayCellId = CoreCalendar.dayCellId
const monthCellId = CoreCalendar.monthCellId
const yearCellId = CoreCalendar.yearCellId

const buildGrid = (
  viewYear: number,
  viewMonth: number,
  firstDayOfWeek: Calendar.DayOfWeek,
): Readonly<{
  gridStart: CalendarDate
  weeks: ReadonlyArray<ReadonlyArray<CalendarDate>>
}> => {
  const generated = DateGrid.monthGrid({
    year: viewYear,
    month: viewMonth,
    firstDayOfWeek,
    fixedWeeks: true,
  })
  return {
    gridStart: generated.gridStart,
    weeks: Array.map(generated.weeks, week =>
      Array.map(week.cells, cell => cell.date),
    ),
  }
}

/** Information about a single day cell in the rendered calendar grid. */
export type DayCell = Readonly<{
  date: CalendarDate
  label: string
  cellAttributes: ReadonlyArray<ChildAttribute>
  buttonAttributes: ReadonlyArray<ChildAttribute>
  isSelected: boolean
  isFocused: boolean
  isToday: boolean
  isInViewMonth: boolean
  isDisabled: boolean
}>

/** A column header for the day grid's first row (day-of-week labels). */
export type ColumnHeader = Readonly<{
  name: string
  attributes: ReadonlyArray<ChildAttribute>
}>

/** A single week row in the day grid, carrying its own row attributes (role,
 * aria-rowindex) alongside its 7 day cells. */
export type Week = Readonly<{
  attributes: ReadonlyArray<ChildAttribute>
  cells: ReadonlyArray<DayCell>
}>

/** Information about a single month cell in the rendered months grid.
 * `label` is the locale-aware full month name (e.g. "September"); `shortLabel`
 * is the locale-aware abbreviation (e.g. "Sep"). Render whichever fits the
 * cell. Never substring `label` to abbreviate, since that's not safe across
 * locales. */
export type MonthCell = Readonly<{
  month: number
  label: string
  shortLabel: string
  cellAttributes: ReadonlyArray<ChildAttribute>
  buttonAttributes: ReadonlyArray<ChildAttribute>
  isSelected: boolean
  isFocused: boolean
  isCurrentMonth: boolean
  isDisabled: boolean
}>

/** Information about a single year cell in the rendered years grid. */
export type YearCell = Readonly<{
  year: number
  label: string
  cellAttributes: ReadonlyArray<ChildAttribute>
  buttonAttributes: ReadonlyArray<ChildAttribute>
  isSelected: boolean
  isFocused: boolean
  isCurrentYear: boolean
  isDisabled: boolean
}>

/** Attributes provided to the consumer when rendering the day grid. */
export type DaysModeAttributes = Readonly<{
  _tag: 'Days'
  root: ReadonlyArray<ChildAttribute>
  previousMonthButton: ReadonlyArray<ChildAttribute>
  nextMonthButton: ReadonlyArray<ChildAttribute>
  headingButton: ReadonlyArray<ChildAttribute>
  heading: Readonly<{ id: string; text: string }>
  grid: ReadonlyArray<ChildAttribute>
  headerRow: ReadonlyArray<ChildAttribute>
  columnHeaders: ReadonlyArray<ColumnHeader>
  weeks: ReadonlyArray<Week>
}>

/** Attributes provided to the consumer when rendering the months grid. The
 * 12 cells are pre-built in calendar (locale-ordered). The consumer arranges
 * them in whatever grid layout they prefer (3×4 is the typical choice). */
export type MonthsModeAttributes = Readonly<{
  _tag: 'Months'
  root: ReadonlyArray<ChildAttribute>
  headingButton: ReadonlyArray<ChildAttribute>
  heading: Readonly<{ id: string; text: string }>
  grid: ReadonlyArray<ChildAttribute>
  cells: ReadonlyArray<MonthCell>
}>

/** Attributes provided to the consumer when rendering the years grid. The
 * 12 cells span one paged window; prev/next buttons page by 12 years. */
export type YearsModeAttributes = Readonly<{
  _tag: 'Years'
  root: ReadonlyArray<ChildAttribute>
  previousPageButton: ReadonlyArray<ChildAttribute>
  nextPageButton: ReadonlyArray<ChildAttribute>
  heading: Readonly<{ id: string; text: string }>
  grid: ReadonlyArray<ChildAttribute>
  cells: ReadonlyArray<YearCell>
}>

/** Discriminated union of attribute groups and derived data the calendar
 * component provides to the consumer's `toView` callback. The variant
 * matches `model.viewMode`. Pattern-match on `_tag` with `M.tagsExhaustive`
 * to render each mode. */
export type CalendarAttributes =
  | DaysModeAttributes
  | MonthsModeAttributes
  | YearsModeAttributes

/** Per-render view inputs passed to `view` via `h.submodel`'s `viewInputs` field.
 *
 *  The Calendar dispatches its own `ClickedDay` message on date commit
 *  and emits a `SelectedDate` OutMessage. Consumers handle date
 *  selection by pattern-matching the OutMessage in their
 *  `GotCalendarMessage` handler. */
export type ViewInputs = Readonly<{
  /** The selected date, read straight from the parent Model. The selected-day
   *  marker derives from it. */
  maybeSelectedDate: Option.Option<CalendarDate>
  toView: (attributes: CalendarAttributes) => Html
  previousMonthLabel?: string
  nextMonthLabel?: string
  previousYearsPageLabel?: string
  nextYearsPageLabel?: string
  daysHeadingButtonLabel?: string
  monthsHeadingButtonLabel?: string
}>

const isMonthDisabled = (model: Model, year: number, month: number): boolean =>
  DateGrid.isMonthDisabled(year, month, constraintsOf(model))

const isYearDisabled = (model: Model, year: number): boolean =>
  DateGrid.isYearDisabled(year, constraintsOf(model))

const buildDaysAttributes = (
  model: Model,
  viewInputs: ViewInputs,
): DaysModeAttributes => {
  const h = html<Message>()

  const {
    id,
    viewYear,
    viewMonth,
    maybeFocusedDate,
    today,
    locale,
    isGridFocused,
  } = model

  const { maybeSelectedDate } = viewInputs

  const previousMonthLabel = viewInputs.previousMonthLabel ?? 'Previous month'
  const nextMonthLabel = viewInputs.nextMonthLabel ?? 'Next month'
  const headingButtonLabel =
    viewInputs.daysHeadingButtonLabel ?? 'Switch to month picker'

  const headingText = `${locale.monthNames[viewMonth - 1]} ${viewYear}`

  const rotatedDayNames = DateGrid.weekdayOrder(locale.firstDayOfWeek)
  const rotatedShortDayNames = DateGrid.rotateWeekItems(
    locale.shortDayNames,
    locale.firstDayOfWeek,
  )

  const { gridStart, weeks: weeksDates } = buildGrid(
    viewYear,
    viewMonth,
    locale.firstDayOfWeek,
  )

  const rootAttributes = [h.Id(id)]

  const previousMonthButton = [
    h.Type('button'),
    h.AriaLabel(previousMonthLabel),
    h.OnClick(ClickedPreviousMonthButton()),
  ]

  const nextMonthButton = [
    h.Type('button'),
    h.AriaLabel(nextMonthLabel),
    h.OnClick(ClickedNextMonthButton()),
  ]

  const headingButton = [
    h.Type('button'),
    h.AriaLabel(headingButtonLabel),
    h.OnClick(ClickedHeading()),
  ]

  const handleKeyDown = (
    key: string,
    modifiers: { readonly shiftKey: boolean },
  ): Option.Option<ClickedDay | PressedKeyOnGrid> => {
    if (!DateGrid.isGridKey(key)) {
      return Option.none()
    }
    if (isCommitKey(key)) {
      const maybeCommit = pipe(
        maybeFocusedDate,
        Option.filter(date => !isDateDisabled(model, date)),
        Option.map(date => ClickedDay({ date })),
      )
      if (Option.isSome(maybeCommit)) {
        return maybeCommit
      }
    }
    return Option.some(PressedKeyOnGrid({ key, isShift: modifiers.shiftKey }))
  }

  const activeDescendantAttributes = pipe(
    maybeFocusedDate,
    Option.map(date => h.AriaActiveDescendant(dayCellId(id, date))),
    Option.toArray,
  )

  const gridAttributes = [
    h.Id(gridId(id)),
    h.Role('grid'),
    h.AriaLabel(`Calendar, ${headingText}`),
    h.AriaRowcount(Number.increment(DateGrid.FIXED_WEEKS_IN_GRID)),
    h.AriaColcount(DateGrid.DAYS_IN_WEEK),
    h.Tabindex(0),
    h.OnFocus(FocusedGrid()),
    h.OnBlur(BlurredGrid()),
    h.OnKeyDownPreventDefault(handleKeyDown),
    ...activeDescendantAttributes,
  ]

  const headerRowAttributes = [h.Role('row'), h.AriaRowindex(1)]

  const buildDayCell = (date: CalendarDate, columnIndex: number): DayCell => {
    const isSelected = Option.exists(maybeSelectedDate, Calendar.isEqual(date))
    const isFocused = Option.exists(maybeFocusedDate, Calendar.isEqual(date))
    const isToday = Calendar.isEqual(today, date)
    const isInViewMonth = date.month === viewMonth && date.year === viewYear
    const isDisabled = isDateDisabled(model, date)

    const stateDataAttributes = Array.getSomes([
      OptionExt.when(isToday, h.DataAttribute('today', '')),
      OptionExt.when(isSelected, h.DataAttribute('selected', '')),
      OptionExt.when(
        isFocused && isGridFocused,
        h.DataAttribute('focused', ''),
      ),
      OptionExt.when(!isInViewMonth, h.DataAttribute('outside-month', '')),
      OptionExt.when(isDisabled, h.DataAttribute('disabled', '')),
    ])

    const cellAttributes = [
      h.Id(dayCellId(id, date)),
      h.Role('gridcell'),
      h.AriaSelected(isSelected),
      h.AriaColindex(Number.increment(columnIndex)),
      ...stateDataAttributes,
    ]

    const buttonAttributes = [
      h.Type('button'),
      h.Tabindex(-1),
      h.AriaLabel(Calendar.formatAriaLabel(date, locale)),
      h.AriaDisabled(isDisabled),
      ...(isDisabled ? [] : [h.OnClick(ClickedDay({ date }))]),
    ]

    return {
      date,
      label: String(date.day),
      cellAttributes: childAttributes(cellAttributes),
      buttonAttributes: childAttributes(buttonAttributes),
      isSelected,
      isFocused: isFocused && isGridFocused,
      isToday,
      isInViewMonth,
      isDisabled,
    }
  }

  const weeks: ReadonlyArray<Week> = weeksDates.map((weekDates, weekIndex) => {
    const weekStart = Calendar.addDays(
      gridStart,
      weekIndex * DateGrid.DAYS_IN_WEEK,
    )
    return {
      attributes: childAttributes([
        h.Role('row'),
        h.AriaRowindex(weekIndex + 2),
        h.AriaLabel(`Week of ${Calendar.formatLong(weekStart, locale)}`),
      ]),
      cells: weekDates.map(buildDayCell),
    }
  })

  const wrappedColumnHeaders: ReadonlyArray<ColumnHeader> = Array.zipWith(
    rotatedShortDayNames,
    rotatedDayNames,
    (name, fullName) => ({ name, fullName }),
  ).map(({ name, fullName }, columnIndex) => ({
    name,
    attributes: childAttributes([
      h.Role('columnheader'),
      h.AriaLabel(fullName),
      h.AriaColindex(Number.increment(columnIndex)),
    ]),
  }))

  return {
    _tag: 'Days',
    root: childAttributes(rootAttributes),
    previousMonthButton: childAttributes(previousMonthButton),
    nextMonthButton: childAttributes(nextMonthButton),
    headingButton: childAttributes(headingButton),
    heading: { id: headingId(id), text: headingText },
    grid: childAttributes(gridAttributes),
    headerRow: childAttributes(headerRowAttributes),
    columnHeaders: wrappedColumnHeaders,
    weeks,
  }
}

const buildMonthsAttributes = (
  model: Model,
  viewInputs: ViewInputs,
): MonthsModeAttributes => {
  const h = html<Message>()

  const {
    id,
    viewYear,
    viewMonth,
    maybeFocusedDate,
    today,
    locale,
    isGridFocused,
  } = model

  const headingButtonLabel =
    viewInputs.monthsHeadingButtonLabel ?? 'Switch to year picker'

  const headingText = `${viewYear}`

  const rootAttributes = [h.Id(id)]

  const headingButton = [
    h.Type('button'),
    h.AriaLabel(headingButtonLabel),
    h.OnClick(ClickedHeading()),
  ]

  const focusedMonth = Option.match(maybeFocusedDate, {
    onNone: () => viewMonth,
    onSome: date => (date.year === viewYear ? date.month : viewMonth),
  })

  const handleKeyDown = (
    key: string,
    modifiers: { readonly shiftKey: boolean },
  ): Option.Option<SelectedMonth | PressedKeyOnGrid> => {
    if (!DateGrid.isGridKey(key)) {
      return Option.none()
    } else if (isCommitKey(key)) {
      return OptionExt.when(
        !isMonthDisabled(model, viewYear, focusedMonth),
        SelectedMonth({ month: focusedMonth }),
      )
    } else {
      return Option.some(PressedKeyOnGrid({ key, isShift: modifiers.shiftKey }))
    }
  }

  const activeDescendantAttributes = [
    h.AriaActiveDescendant(monthCellId(id, focusedMonth)),
  ]

  const gridAttributes = [
    h.Id(gridId(id)),
    h.Role('grid'),
    h.AriaLabel(`Month picker, ${headingText}`),
    h.Tabindex(0),
    h.OnFocus(FocusedGrid()),
    h.OnBlur(BlurredGrid()),
    h.OnKeyDownPreventDefault(handleKeyDown),
    ...activeDescendantAttributes,
  ]

  const buildMonthCell = (month: number): MonthCell => {
    const label = locale.monthNames[month - 1] ?? String(month)
    const shortLabel = locale.shortMonthNames[month - 1] ?? label
    const isSelected = month === viewMonth
    const isFocused = month === focusedMonth
    const isCurrentMonth = today.year === viewYear && today.month === month
    const isDisabled = isMonthDisabled(model, viewYear, month)

    const stateDataAttributes = Array.getSomes([
      OptionExt.when(isCurrentMonth, h.DataAttribute('today', '')),
      OptionExt.when(isSelected, h.DataAttribute('selected', '')),
      OptionExt.when(
        isFocused && isGridFocused,
        h.DataAttribute('focused', ''),
      ),
      OptionExt.when(isDisabled, h.DataAttribute('disabled', '')),
    ])

    const cellAttributes = [
      h.Id(monthCellId(id, month)),
      h.Role('gridcell'),
      h.AriaSelected(isSelected),
      ...stateDataAttributes,
    ]

    const buttonAttributes = [
      h.Type('button'),
      h.Tabindex(-1),
      h.AriaLabel(`${label} ${viewYear}`),
      h.AriaDisabled(isDisabled),
      ...(isDisabled ? [] : [h.OnClick(SelectedMonth({ month }))]),
    ]

    return {
      month,
      label,
      shortLabel,
      cellAttributes: childAttributes(cellAttributes),
      buttonAttributes: childAttributes(buttonAttributes),
      isSelected,
      isFocused: isFocused && isGridFocused,
      isCurrentMonth,
      isDisabled,
    }
  }

  const cells = Array.makeBy(DateGrid.MONTHS_IN_YEAR, monthIndex =>
    buildMonthCell(Number.increment(monthIndex)),
  )

  return {
    _tag: 'Months',
    root: childAttributes(rootAttributes),
    headingButton: childAttributes(headingButton),
    heading: { id: headingId(id), text: headingText },
    grid: childAttributes(gridAttributes),
    cells,
  }
}

const buildYearsAttributes = (
  model: Model,
  viewInputs: ViewInputs,
): YearsModeAttributes => {
  const h = html<Message>()

  const { id, viewYear, maybeFocusedDate, today, isGridFocused } = model

  const previousYearsPageLabel =
    viewInputs.previousYearsPageLabel ?? 'Previous 12 years'
  const nextYearsPageLabel = viewInputs.nextYearsPageLabel ?? 'Next 12 years'

  const cursorYear = Option.match(maybeFocusedDate, {
    onNone: () => viewYear,
    onSome: date => date.year,
  })
  const pageStart = DateGrid.yearsPageStart(cursorYear)
  const pageEnd = pageStart + DateGrid.YEARS_PAGE_SIZE - 1
  const headingText = `${pageStart}–${pageEnd}`

  const rootAttributes = [h.Id(id)]

  const previousPageButton = [
    h.Type('button'),
    h.AriaLabel(previousYearsPageLabel),
    h.OnClick(PagedYears({ direction: -1 })),
  ]

  const nextPageButton = [
    h.Type('button'),
    h.AriaLabel(nextYearsPageLabel),
    h.OnClick(PagedYears({ direction: 1 })),
  ]

  const focusedYear = cursorYear

  const handleKeyDown = (
    key: string,
    modifiers: { readonly shiftKey: boolean },
  ): Option.Option<SelectedYear | PressedKeyOnGrid> => {
    if (!DateGrid.isGridKey(key)) {
      return Option.none()
    } else if (isCommitKey(key)) {
      return OptionExt.when(
        !isYearDisabled(model, focusedYear),
        SelectedYear({ year: focusedYear }),
      )
    } else {
      return Option.some(PressedKeyOnGrid({ key, isShift: modifiers.shiftKey }))
    }
  }

  const activeDescendantAttributes = [
    h.AriaActiveDescendant(yearCellId(id, focusedYear)),
  ]

  const gridAttributes = [
    h.Id(gridId(id)),
    h.Role('grid'),
    h.AriaLabel(`Year picker, ${headingText}`),
    h.Tabindex(0),
    h.OnFocus(FocusedGrid()),
    h.OnBlur(BlurredGrid()),
    h.OnKeyDownPreventDefault(handleKeyDown),
    ...activeDescendantAttributes,
  ]

  const buildYearCell = (year: number): YearCell => {
    const label = String(year)
    const isSelected = year === viewYear
    const isFocused = year === focusedYear
    const isCurrentYear = today.year === year
    const isDisabled = isYearDisabled(model, year)

    const stateDataAttributes = Array.getSomes([
      OptionExt.when(isCurrentYear, h.DataAttribute('today', '')),
      OptionExt.when(isSelected, h.DataAttribute('selected', '')),
      OptionExt.when(
        isFocused && isGridFocused,
        h.DataAttribute('focused', ''),
      ),
      OptionExt.when(isDisabled, h.DataAttribute('disabled', '')),
    ])

    const cellAttributes = [
      h.Id(yearCellId(id, year)),
      h.Role('gridcell'),
      h.AriaSelected(isSelected),
      ...stateDataAttributes,
    ]

    const buttonAttributes = [
      h.Type('button'),
      h.Tabindex(-1),
      h.AriaLabel(label),
      h.AriaDisabled(isDisabled),
      ...(isDisabled ? [] : [h.OnClick(SelectedYear({ year }))]),
    ]

    return {
      year,
      label,
      cellAttributes: childAttributes(cellAttributes),
      buttonAttributes: childAttributes(buttonAttributes),
      isSelected,
      isFocused: isFocused && isGridFocused,
      isCurrentYear,
      isDisabled,
    }
  }

  const cells = Array.makeBy(DateGrid.YEARS_PAGE_SIZE, offset =>
    buildYearCell(pageStart + offset),
  )

  return {
    _tag: 'Years',
    root: childAttributes(rootAttributes),
    previousPageButton: childAttributes(previousPageButton),
    nextPageButton: childAttributes(nextPageButton),
    heading: { id: headingId(id), text: headingText },
    grid: childAttributes(gridAttributes),
    cells,
  }
}

/** Renders an accessible calendar. Publishes mode-specific ARIA attribute
 *  bundles + derived cell data, then delegates layout to the consumer's
 *  `toView` callback. The variant of `CalendarAttributes` passed to
 *  `toView` matches `model.viewMode`. */
export const view = defineView<Model, Message, ViewInputs>(
  (model, viewInputs): Html =>
    viewInputs.toView(
      M.value(model.viewMode).pipe(
        M.withReturnType<CalendarAttributes>(),
        M.when('Days', () => buildDaysAttributes(model, viewInputs)),
        M.when('Months', () => buildMonthsAttributes(model, viewInputs)),
        M.when('Years', () => buildYearsAttributes(model, viewInputs)),
        M.exhaustive,
      ),
    ),
)
