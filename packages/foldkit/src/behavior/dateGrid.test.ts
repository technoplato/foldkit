import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import * as DateGrid from './dateGrid.js'
import { Device, Synced } from './pace.js'

const d = DateGrid.makeDate

const baseProps: DateGrid.Props = {
  today: d(2026, 4, 13),
}

const fold = (
  messages: ReadonlyArray<DateGrid.Message>,
  props: DateGrid.Props = baseProps,
  from: DateGrid.State = DateGrid.initial,
): DateGrid.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => DateGrid.chart.transition(state, message, props)[0],
  )

describe('reusable DateGrid block', () => {
  describe('chart integrity and schema serialization', () => {
    it('passes Block.problemsOf and serializes State via Effect Schema', () => {
      expect(
        Block.problemsOf({ name: 'DateGrid', chart: DateGrid.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'DateGridAt',
          chart: DateGrid.chartOf(DateGrid.initialAt(d(2026, 4, 13), 'Day')),
        }),
      ).toEqual([])
      expect(DateGrid.sync.FocusDate).toEqual(Synced())
      expect(DateGrid.deviceSync('OwnView').FocusDate).toEqual(
        Device({ because: 'OwnView' }),
      )
      expect(DateGrid.isMessage(DateGrid.JumpToToday())).toBe(true)

      const encoded = S.encodeSync(DateGrid.State)(
        DateGrid.initialAt(d(2026, 4, 13), 'Month'),
      )
      expect(S.decodeSync(DateGrid.State)(encoded)).toEqual(
        DateGrid.initialAt(d(2026, 4, 13), 'Month'),
      )
    })
  })

  describe('date arithmetic, comparison, ISO codec, and weekday headers', () => {
    it('handles days, weeks, months, years, leap years, and comparisons purely', () => {
      expect(DateGrid.daysInMonth(2024, 2)).toBe(29)
      expect(DateGrid.daysInMonth(2026, 2)).toBe(28)
      expect(DateGrid.isLeapYear(2000)).toBe(true)
      expect(DateGrid.isLeapYear(1900)).toBe(false)

      expect(DateGrid.addDays(d(2026, 4, 30), 1)).toEqual(d(2026, 5, 1))
      expect(DateGrid.addWeeks(d(2026, 4, 13), 2)).toEqual(d(2026, 4, 27))
      expect(DateGrid.addWeeks(d(2026, 4, 13), -1)).toEqual(d(2026, 4, 6))
      expect(DateGrid.addMonths(d(2026, 1, 31), 1)).toEqual(d(2026, 2, 28))
      expect(DateGrid.addYears(d(2024, 2, 29), 1)).toEqual(d(2025, 2, 28))

      // 2026-04-13 is Monday
      expect(DateGrid.dayOfWeek(d(2026, 4, 13))).toBe('Monday')
      expect(DateGrid.startOfWeek(d(2026, 4, 13), 'Sunday')).toEqual(
        d(2026, 4, 12),
      )
      expect(DateGrid.endOfWeek(d(2026, 4, 13), 'Sunday')).toEqual(
        d(2026, 4, 18),
      )
      expect(DateGrid.startOfWeek(d(2026, 4, 13), 'Monday')).toEqual(
        d(2026, 4, 13),
      )
      expect(DateGrid.endOfWeek(d(2026, 4, 13), 'Monday')).toEqual(
        d(2026, 4, 19),
      )

      expect(DateGrid.compareDates(d(2026, 4, 12), d(2026, 4, 13))).toBe(-1)
      expect(DateGrid.compareDates(d(2026, 4, 13), d(2026, 4, 13))).toBe(0)
      expect(DateGrid.compareDates(d(2026, 4, 14), d(2026, 4, 13))).toBe(1)
      expect(DateGrid.isSameDate(d(2026, 4, 13), d(2026, 4, 13))).toBe(true)
      expect(DateGrid.isSameMonth(d(2026, 4, 1), d(2026, 4, 30))).toBe(true)
      expect(DateGrid.isSameMonth(d(2026, 4, 30), d(2026, 5, 1))).toBe(false)

      expect(DateGrid.formatIso(d(2026, 4, 5))).toBe('2026-04-05')
      expect(DateGrid.parseIso('2026-04-05')).toEqual(
        Option.some(d(2026, 4, 5)),
      )
      expect(DateGrid.parseIso('2026-02-30')).toEqual(Option.none())
      expect(DateGrid.parseIso('not-a-date')).toEqual(Option.none())
    })

    it('rotates weekday headers for every firstDayOfWeek Sun..Sat', () => {
      expect(DateGrid.weekdayOrder('Sunday')).toEqual([
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ])
      expect(DateGrid.weekdayOrder('Monday')).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ])
      expect(DateGrid.weekdayOrder('Saturday')).toEqual([
        'Saturday',
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ])
    })
  })

  describe('month, month-picker, year-picker, and decade grid generation', () => {
    it('builds fixed 6-row (42-cell) and variable-week (4/5/6-row) month grids with outside-month and disabled flags', () => {
      // April 2026: Apr 1 is Wednesday, Apr 30 is Thursday
      const fixedApril = DateGrid.monthGrid({
        year: 2026,
        month: 4,
        firstDayOfWeek: 'Sunday',
        fixedWeeks: true,
        constraints: {
          disabledDates: [d(2026, 4, 15)],
          disabledDaysOfWeek: ['Sunday'],
        },
      })
      expect(fixedApril.weeks).toHaveLength(6)
      expect(fixedApril.gridStart).toEqual(d(2026, 3, 29))
      expect(fixedApril.gridEnd).toEqual(d(2026, 5, 9))
      expect(Array.flatMap(fixedApril.weeks, week => week.cells)).toHaveLength(
        42,
      )

      const firstCell = Option.getOrThrow(
        Option.flatMap(Array.head(fixedApril.weeks), week =>
          Array.head(week.cells),
        ),
      )
      expect(firstCell).toEqual({
        date: d(2026, 3, 29),
        iso: '2026-03-29',
        dayOfWeek: 'Sunday',
        isOutsideMonth: true,
        isDisabled: true,
        rowIndex: 0,
        columnIndex: 0,
      })

      // Variable weeks: February 2026 starts Sunday Feb 1 and ends Saturday Feb 28 -> exactly 4 weeks
      const variableFeb = DateGrid.monthGrid({
        year: 2026,
        month: 2,
        firstDayOfWeek: 'Sunday',
        fixedWeeks: false,
      })
      expect(variableFeb.weeks).toHaveLength(4)
      expect(variableFeb.gridStart).toEqual(d(2026, 2, 1))
      expect(variableFeb.gridEnd).toEqual(d(2026, 2, 28))

      // Monday firstDayOfWeek shifts April 2026 start to Monday March 30 (5 variable weeks)
      const mondayApril = DateGrid.monthGrid({
        year: 2026,
        month: 4,
        firstDayOfWeek: 'Monday',
        fixedWeeks: false,
      })
      expect(mondayApril.weeks).toHaveLength(5)
      expect(mondayApril.gridStart).toEqual(d(2026, 3, 30))
      expect(mondayApril.gridEnd).toEqual(d(2026, 5, 3))
    })

    it('builds months, paged years, and century-level decade grids with min/max constraints', () => {
      const constraints: DateGrid.Constraints = {
        minDate: d(2024, 3, 15),
        maxDate: d(2026, 8, 10),
      }

      const months2026 = DateGrid.monthsGrid({
        year: 2026,
        columns: 3,
        constraints,
      })
      expect(months2026.cells).toHaveLength(12)
      expect(months2026.rows).toHaveLength(4)
      expect(Option.getOrThrow(Array.get(months2026.cells, 7)).isDisabled).toBe(
        false,
      )
      expect(Option.getOrThrow(Array.get(months2026.cells, 8)).isDisabled).toBe(
        true,
      )

      const years = DateGrid.yearsGrid({
        year: 2026,
        pageSize: 12,
        columns: 3,
        constraints,
      })
      expect(years.startYear).toBe(2016)
      expect(years.endYear).toBe(2027)
      expect(years.cells).toHaveLength(12)
      expect(years.rows).toHaveLength(4)
      expect(
        Array.filter(years.cells, cell => !cell.isDisabled).map(
          cell => cell.year,
        ),
      ).toEqual([2024, 2025, 2026])

      expect(DateGrid.decadeRange(2026)).toEqual({
        startYear: 2020,
        endYear: 2029,
      })
      const decades = DateGrid.decadeGrid({
        year: 2026,
        count: 10,
        columns: 2,
        constraints,
      })
      expect(decades.startYear).toBe(2000)
      expect(decades.endYear).toBe(2099)
      expect(decades.cells).toHaveLength(10)
      expect(decades.rows).toHaveLength(5)
      expect(
        Array.filter(decades.cells, cell => !cell.isDisabled).map(
          cell => cell.startYear,
        ),
      ).toEqual([2020])
    })
  })

  describe('constraints, clamping, nearest enabled search, and 2D keyboard navigation', () => {
    it('evaluates constraints, clamps dates, and searches nearest enabled dates', () => {
      const constraints: DateGrid.Constraints = {
        minDate: d(2026, 4, 10),
        maxDate: d(2026, 4, 20),
        disabledDates: [d(2026, 4, 13), d(2026, 4, 14)],
        disabledDaysOfWeek: ['Sunday'],
      }

      expect(DateGrid.isDateDisabled(d(2026, 4, 9), constraints)).toBe(true)
      expect(DateGrid.isDateDisabled(d(2026, 4, 21), constraints)).toBe(true)
      expect(DateGrid.isDateDisabled(d(2026, 4, 12), constraints)).toBe(true)
      expect(DateGrid.isDateDisabled(d(2026, 4, 13), constraints)).toBe(true)
      expect(DateGrid.isDateDisabled(d(2026, 4, 15), constraints)).toBe(false)

      expect(DateGrid.clampDate(d(2026, 4, 1), constraints)).toEqual(
        d(2026, 4, 10),
      )
      expect(DateGrid.clampDate(d(2026, 4, 30), constraints)).toEqual(
        d(2026, 4, 20),
      )

      // Nearest to 2026-04-13: -1 is Sunday (disabled), +1 is 14 (disabled), -2 is 11 (enabled), +2 is 15 (enabled) -> tie breaks in preferredDirection
      expect(
        DateGrid.findNearestEnabledDate(d(2026, 4, 13), constraints, {
          preferredDirection: 1,
        }),
      ).toEqual(Option.some(d(2026, 4, 15)))
      expect(
        DateGrid.findNearestEnabledDate(d(2026, 4, 13), constraints, {
          preferredDirection: -1,
        }),
      ).toEqual(Option.some(d(2026, 4, 11)))
    })

    it('navigates 2D day grid with Arrow/Home/End/PageUp/PageDown/Shift+PageUp/Down, RTL polarity, and disabled skipping', () => {
      const constraints: DateGrid.Constraints = {
        disabledDates: [d(2026, 4, 14), d(2026, 4, 15)],
        disabledDaysOfWeek: ['Sunday'],
      }

      // ArrowRight from Monday Apr 13 skips Apr 14 & Apr 15 -> Apr 16
      expect(
        DateGrid.navigateDay({
          key: 'ArrowRight',
          focused: d(2026, 4, 13),
          constraints,
        }),
      ).toEqual(Option.some(d(2026, 4, 16)))

      // RTL flips ArrowLeft / ArrowRight: ArrowLeft moves forward (skipping 14, 15 -> 16)
      expect(
        DateGrid.navigateDay({
          key: 'ArrowLeft',
          focused: d(2026, 4, 13),
          direction: 'Rtl',
          constraints,
        }),
      ).toEqual(Option.some(d(2026, 4, 16)))

      // ArrowUp/Down ±7 days
      expect(
        DateGrid.navigateDay({
          key: 'ArrowDown',
          focused: d(2026, 4, 13),
          constraints,
        }),
      ).toEqual(Option.some(d(2026, 4, 20)))
      expect(
        DateGrid.navigateDay({
          key: 'ArrowUp',
          focused: d(2026, 4, 13),
          constraints,
        }),
      ).toEqual(Option.some(d(2026, 4, 6)))

      // Home in Sunday-start week where Sunday (Apr 12) is disabled lands on first enabled day of that week (Apr 13)
      expect(
        DateGrid.navigateDay({
          key: 'Home',
          focused: d(2026, 4, 16),
          firstDayOfWeek: 'Sunday',
          constraints: { disabledDaysOfWeek: ['Sunday'] },
        }),
      ).toEqual(Option.some(d(2026, 4, 13)))
      expect(
        DateGrid.navigateDay({
          key: 'End',
          focused: d(2026, 4, 13),
          firstDayOfWeek: 'Sunday',
          constraints,
        }),
      ).toEqual(Option.some(d(2026, 4, 18)))

      // PageUp/PageDown ±1 month; Shift+PageUp/PageDown ±1 year
      expect(
        DateGrid.navigateDay({ key: 'PageUp', focused: d(2026, 4, 13) }),
      ).toEqual(Option.some(d(2026, 3, 13)))
      expect(
        DateGrid.navigateDay({ key: 'PageDown', focused: d(2026, 4, 13) }),
      ).toEqual(Option.some(d(2026, 5, 13)))
      expect(
        DateGrid.navigateDay({
          key: 'PageUp',
          isShift: true,
          focused: d(2026, 4, 13),
        }),
      ).toEqual(Option.some(d(2025, 4, 13)))
      expect(
        DateGrid.navigateDay({
          key: 'PageDown',
          isShift: true,
          focused: d(2026, 4, 13),
        }),
      ).toEqual(Option.some(d(2027, 4, 13)))

      // Unknown key returns None
      expect(
        DateGrid.navigateDay({ key: 'x', focused: d(2026, 4, 13) }),
      ).toEqual(Option.none())
    })
  })

  describe('DateGrid Machine view switching and stepping', () => {
    it('steps months/years, zooms Day -> Month -> Year, drills back, jumps to today, and rests in Day view', () => {
      const stepped = fold([
        DateGrid.StepMonth({ delta: 1 }),
        DateGrid.StepYear({ delta: 1 }),
      ])
      expect(DateGrid.viewMonthOf(stepped, baseProps)).toEqual({
        year: 2027,
        month: 5,
      })
      expect(DateGrid.focusedDateOf(stepped, baseProps)).toEqual(d(2027, 5, 13))

      const zoomedToYears = fold(
        [
          DateGrid.ZoomOutView(),
          DateGrid.ZoomOutView(),
          DateGrid.PageYears({ direction: -1 }),
        ],
        baseProps,
        stepped,
      )
      expect(DateGrid.viewModeOf(zoomedToYears)).toBe('Year')
      expect(DateGrid.focusedDateOf(zoomedToYears, baseProps)).toEqual(
        d(2015, 5, 13),
      )

      const rested = DateGrid.atRest(zoomedToYears)
      expect(DateGrid.viewModeOf(rested)).toBe('Day')
      expect(DateGrid.focusedDateOf(rested, baseProps)).toEqual(d(2027, 5, 13))

      const drilled = fold(
        [
          DateGrid.DrillIntoYear({ year: 2020 }),
          DateGrid.DrillIntoMonth({ month: 3 }),
        ],
        baseProps,
        zoomedToYears,
      )
      expect(DateGrid.viewModeOf(drilled)).toBe('Day')
      expect(DateGrid.viewMonthOf(drilled, baseProps)).toEqual({
        year: 2020,
        month: 3,
      })

      const backToToday = fold([DateGrid.JumpToToday()], baseProps, drilled)
      expect(DateGrid.focusedDateOf(backToToday, baseProps)).toEqual(
        d(2026, 4, 13),
      )
    })
  })
})
