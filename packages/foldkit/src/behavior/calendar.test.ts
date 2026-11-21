import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Calendar from './calendar.js'
import * as DateGrid from './dateGrid.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const d = DateGrid.makeDate
const today = d(2026, 4, 13)

const singleProps: Calendar.Props = {
  id: 'booking',
  today,
  minDate: d(2026, 3, 1),
  maxDate: d(2026, 6, 30),
  disabledDates: [d(2026, 4, 15)],
}

const rangeProps: Calendar.Props = {
  ...singleProps,
  selectionMode: 'Range',
}

const fold = (
  messages: ReadonlyArray<Calendar.Message>,
  props: Calendar.Props = singleProps,
  from: Calendar.State = Calendar.initial,
): Calendar.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Calendar.chart.transition(state, message, props)[0],
  )

describe('core Calendar Part', () => {
  describe('declaration, chart integrity, and element IDs', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Calendar.part)).toEqual([])
      expect(Part.problemsOf(Calendar.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Calendar.make({ sync: 'OwnView' }))).toEqual([])
      expect(Part.problemsOf(Calendar.make({ defaultDate: today }))).toEqual([])
      expect(
        Part.problemsOf(
          Calendar.make({
            defaultRange: { start: d(2026, 4, 10), end: d(2026, 4, 14) },
          }),
        ),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'Calendar', chart: Calendar.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'CalendarSelected',
          chart: Calendar.chartOf(Calendar.initialDate(today)),
        }),
      ).toEqual([])

      for (const action of Calendar.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs and default config readings', () => {
      expect(Calendar.gridId('booking')).toBe('booking-grid')
      expect(Calendar.headingId('booking')).toBe('booking-heading')
      expect(Calendar.dayCellId('booking', d(2026, 4, 13))).toBe(
        'booking-cell-2026-4-13',
      )
      expect(Calendar.monthCellId('booking', 4)).toBe('booking-cell-month-4')
      expect(Calendar.yearCellId('booking', 2026)).toBe(
        'booking-cell-year-2026',
      )
      expect(Calendar.previousMonthButtonId('booking')).toBe(
        'booking-prev-month',
      )
      expect(Calendar.nextMonthButtonId('booking')).toBe('booking-next-month')
      expect(Calendar.previousYearButtonId('booking')).toBe('booking-prev-year')
      expect(Calendar.nextYearButtonId('booking')).toBe('booking-next-year')
      expect(Calendar.todayButtonId('booking')).toBe('booking-today')

      expect(Calendar.selectionModeOf({})).toBe('Single')
      expect(Calendar.isRangeMode({})).toBe(false)
      expect(Calendar.isDisabledOf({})).toBe(false)
      expect(Calendar.isReadOnlyOf({})).toBe(false)
      expect(Calendar.isDeselectableOf({})).toBe(false)
      expect(Calendar.isMessage(Calendar.JumpToToday())).toBe(true)
    })
  })

  describe('single date selection, keyboard navigation, stepping, and view switching', () => {
    it('selects enabled dates, ignores disabled dates, supports deselectable toggle, and clears selection', () => {
      const selected = fold([
        Calendar.SelectCalendarDate({ date: d(2026, 4, 20) }),
      ])
      expect(Calendar.isFocused(selected)).toBe(true)
      expect(Calendar.selectedDateOf(selected)).toEqual(
        Option.some(d(2026, 4, 20)),
      )
      expect(Calendar.isDateSelected(selected, d(2026, 4, 20))).toBe(true)
      expect(Calendar.isDateSelected(selected, today)).toBe(false)

      // Disabled date is ignored
      const ignored = Calendar.chart.step(
        selected,
        Calendar.SelectCalendarDate({ date: d(2026, 4, 15) }),
        singleProps,
      )
      expect(ignored).toMatchObject({
        _tag: 'Ignored',
        reason: 'ExplicitlyIgnored',
      })

      // Deselectable single calendar toggles off when re-selected
      const deselectableProps: Calendar.Props = {
        ...singleProps,
        deselectable: true,
      }
      const deselected = fold(
        [Calendar.SelectCalendarDate({ date: d(2026, 4, 20) })],
        deselectableProps,
        selected,
      )
      expect(Calendar.selectedDateOf(deselected)).toEqual(Option.none())

      // ClearCalendarSelection clears selection
      const cleared = fold(
        [Calendar.ClearCalendarSelection()],
        singleProps,
        selected,
      )
      expect(Calendar.selectedDateOf(cleared)).toEqual(Option.none())
    })

    it('navigates 2D grid via keyboard, skips disabled dates, steps months/years, jumps to today, and switches Day/Month/Year views', () => {
      const focused = fold([Calendar.FocusCalendarGrid()])
      expect(Calendar.focusedDateOf(focused, singleProps)).toEqual(today)

      // ArrowRight twice from Apr 13 -> Apr 14, then skips disabled Apr 15 -> Apr 16
      const at16 = fold(
        [
          Calendar.PressedCalendarKey({ key: 'ArrowRight' }),
          Calendar.PressedCalendarKey({ key: 'ArrowRight' }),
        ],
        singleProps,
        focused,
      )
      expect(Calendar.focusedDateOf(at16, singleProps)).toEqual(d(2026, 4, 16))

      // Space selects focused date (Apr 16)
      const selected16 = fold(
        [Calendar.PressedCalendarKey({ key: ' ' })],
        singleProps,
        at16,
      )
      expect(Calendar.selectedDateOf(selected16)).toEqual(
        Option.some(d(2026, 4, 16)),
      )

      // NextCalendarMonth advances to May 2026; PreviousCalendarMonth returns to April
      const inMay = fold(
        [Calendar.NextCalendarMonth()],
        singleProps,
        selected16,
      )
      expect(Calendar.viewMonthOf(inMay, singleProps)).toEqual({
        year: 2026,
        month: 5,
      })

      // Stepping past maxDate (June 2026 -> July 2026) is ignored
      const inJune = fold([Calendar.NextCalendarMonth()], singleProps, inMay)
      expect(Calendar.canNavigateNextMonth(inJune, singleProps)).toBe(false)
      expect(
        Calendar.chart.step(inJune, Calendar.NextCalendarMonth(), singleProps),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // JumpToToday returns to April 13, 2026
      const backToday = fold([Calendar.JumpToToday()], singleProps, inJune)
      expect(Calendar.focusedDateOf(backToday, singleProps)).toEqual(today)
      expect(Calendar.viewMonthOf(backToday, singleProps)).toEqual({
        year: 2026,
        month: 4,
      })

      // Zoom Day -> Month -> Year, navigate years, drill back to Month -> Day
      const unboundedProps: Calendar.Props = { id: 'booking', today }
      const fullTrip = fold(
        [
          Calendar.ZoomOutCalendarView(),
          Calendar.ZoomOutCalendarView(),
          Calendar.PressedCalendarKey({ key: 'ArrowLeft' }),
          Calendar.PressedCalendarKey({ key: 'Enter' }),
          Calendar.PressedCalendarKey({ key: 'ArrowRight' }),
          Calendar.PressedCalendarKey({ key: 'Enter' }),
        ],
        unboundedProps,
        backToday,
      )
      expect(Calendar.viewModeOf(fullTrip)).toBe('Day')
      expect(Calendar.viewMonthOf(fullTrip, unboundedProps)).toEqual({
        year: 2025,
        month: 5,
      })

      // Year stepping forward/backward works on unbounded calendar
      const nextYear = fold(
        [Calendar.NextCalendarYear()],
        unboundedProps,
        fullTrip,
      )
      expect(Calendar.viewMonthOf(nextYear, unboundedProps)).toEqual({
        year: 2026,
        month: 5,
      })
      const prevYear = fold(
        [Calendar.PreviousCalendarYear()],
        unboundedProps,
        nextYear,
      )
      expect(Calendar.viewMonthOf(prevYear, unboundedProps)).toEqual({
        year: 2025,
        month: 5,
      })

      // Escape backs out Year -> Month -> Day
      const zoomedAndEscaped = fold(
        [
          Calendar.ZoomOutCalendarView(),
          Calendar.ZoomOutCalendarView(),
          Calendar.PressedCalendarKey({ key: 'Escape' }),
        ],
        unboundedProps,
        backToday,
      )
      expect(Calendar.viewModeOf(zoomedAndEscaped)).toBe('Month')
      const escapedToDay = fold(
        [Calendar.PressedCalendarKey({ key: 'Escape' })],
        unboundedProps,
        zoomedAndEscaped,
      )
      expect(Calendar.viewModeOf(escapedToDay)).toBe('Day')

      // Blur returns to Idle; atRest returns Idle + Day view preserving selection
      const blurred = fold(
        [Calendar.BlurCalendarGrid()],
        singleProps,
        selected16,
      )
      expect(Calendar.isFocused(blurred)).toBe(false)
      const zoomedSelected = fold(
        [Calendar.ZoomOutCalendarView()],
        singleProps,
        selected16,
      )
      const rested = Calendar.atRest(zoomedSelected)
      expect(Calendar.isFocused(rested)).toBe(false)
      expect(Calendar.viewModeOf(rested)).toBe('Day')
      expect(Calendar.selectedDateOf(rested)).toEqual(
        Option.some(d(2026, 4, 16)),
      )
    })

    it('uses RovingFocus fallback so rovingTargetDateOf stays enabled even when today is disabled', () => {
      const todayDisabledProps: Calendar.Props = {
        id: 'booking',
        today: d(2026, 4, 13),
        minDate: d(2026, 4, 16),
      }
      expect(
        Calendar.rovingTargetDateOf(Calendar.initial, todayDisabledProps),
      ).toEqual(Option.some(d(2026, 4, 16)))

      const focused = fold([Calendar.FocusCalendarGrid()], todayDisabledProps)
      expect(Calendar.focusedDateOf(focused, todayDisabledProps)).toEqual(
        d(2026, 4, 16),
      )
    })
  })

  describe('date-range selection mode', () => {
    it('picks start, previews hover range, normalizes reverse order, cancels with Escape, and honors allowDisabledInRange=false', () => {
      // First select sets RangeStart
      const started = fold(
        [Calendar.SelectCalendarDate({ date: d(2026, 4, 18) })],
        rangeProps,
      )
      expect(Calendar.rangeStartOf(started)).toEqual(
        Option.some(d(2026, 4, 18)),
      )
      expect(Calendar.rangeEndOf(started)).toEqual(Option.none())
      expect(Calendar.selectedRangeOf(started)).toEqual(Option.none())

      // Hover preview while in RangeStart (reverse direction normalizes start <= end)
      const hovered = fold(
        [Calendar.HoverCalendarDate({ date: d(2026, 4, 12) })],
        rangeProps,
        started,
      )
      expect(Calendar.previewRangeOf(hovered)).toEqual(
        Option.some({ start: d(2026, 4, 12), end: d(2026, 4, 18) }),
      )
      expect(Calendar.isDateInPreviewRange(hovered, d(2026, 4, 14))).toBe(true)

      // Escape cancels in-progress RangeStart
      const cancelled = fold(
        [Calendar.PressedCalendarKey({ key: 'Escape' })],
        rangeProps,
        hovered,
      )
      expect(Calendar.rangeStartOf(cancelled)).toEqual(Option.none())

      // Second select in reverse order completes normalized range [Apr 12 .. Apr 18]
      const completed = fold(
        [Calendar.SelectCalendarDate({ date: d(2026, 4, 12) })],
        rangeProps,
        started,
      )
      expect(Calendar.selectedRangeOf(completed)).toEqual(
        Option.some({ start: d(2026, 4, 12), end: d(2026, 4, 18) }),
      )
      expect(Calendar.isDateRangeStart(completed, d(2026, 4, 12))).toBe(true)
      expect(Calendar.isDateRangeEnd(completed, d(2026, 4, 18))).toBe(true)
      expect(Calendar.isDateInRange(completed, d(2026, 4, 16))).toBe(true)
      expect(Calendar.isDateSelected(completed, d(2026, 4, 16))).toBe(true)
      expect(Calendar.isDateSelected(completed, d(2026, 4, 19))).toBe(false)

      // Third select starts a fresh range
      const restarted = fold(
        [Calendar.SelectCalendarDate({ date: d(2026, 4, 22) })],
        rangeProps,
        completed,
      )
      expect(Calendar.rangeStartOf(restarted)).toEqual(
        Option.some(d(2026, 4, 22)),
      )
      expect(Calendar.rangeEndOf(restarted)).toEqual(Option.none())

      // When allowDisabledInRange is false, spanning across disabled Apr 15 restarts at the new date
      const strictRangeProps: Calendar.Props = {
        ...rangeProps,
        allowDisabledInRange: false,
      }
      const blockedSpan = fold(
        [
          Calendar.SelectCalendarDate({ date: d(2026, 4, 13) }),
          Calendar.SelectCalendarDate({ date: d(2026, 4, 17) }),
        ],
        strictRangeProps,
      )
      expect(Calendar.selectedRangeOf(blockedSpan)).toEqual(Option.none())
      expect(Calendar.rangeStartOf(blockedSpan)).toEqual(
        Option.some(d(2026, 4, 17)),
      )
    })
  })

  describe('reference-stable SlotBinding projection and Part.compose synchronization', () => {
    it('projects Grid, GridCell, PreviousMonthButton, NextMonthButton, and Heading slots with generic ARIA and reference stability', () => {
      const part = Calendar.make({ name: 'BookingCalendar' })
      const state1 = fold(
        [Calendar.SelectCalendarDate({ date: d(2026, 4, 13) })],
        singleProps,
      )

      const view1 = Part.view(part, state1, singleProps)
      expect(Part.view(part, state1, singleProps)).toBe(view1)

      const gridSlot = view1.slot('Grid')
      expect(Slot.ariaOf(gridSlot)).toEqual({
        role: 'grid',
        id: 'booking-grid',
        'aria-labelledby': 'booking-heading',
        'aria-activedescendant': 'booking-cell-2026-4-13',
        tabindex: '0',
      })

      const todayCell = view1.slot('GridCell', '2026-04-13')
      const disabledCell = view1.slot('GridCell', '2026-04-15')
      const untouchedCell = view1.slot('GridCell', '2026-04-22')
      const prevSlot = view1.slot('PreviousMonthButton')
      const nextSlot = view1.slot('NextMonthButton')
      const headingSlot = view1.slot('Heading')

      expect(Slot.ariaOf(todayCell)).toEqual({
        role: 'gridcell',
        id: 'booking-cell-2026-4-13',
        'aria-selected': 'true',
        'aria-current': 'true',
        tabindex: '0',
      })
      expect(todayCell.gestures).toEqual([
        { gesture: 'Pressed', press: 'SelectCalendarDate:2026-04-13' },
      ])

      expect(Slot.ariaOf(disabledCell)).toEqual({
        role: 'gridcell',
        id: 'booking-cell-2026-4-15',
        'aria-selected': 'false',
        'aria-current': 'false',
        'aria-disabled': 'true',
        tabindex: '-1',
      })

      expect(Slot.ariaOf(prevSlot)).toEqual({
        role: 'button',
        id: 'booking-prev-month',
        'aria-controls': 'booking-grid',
        'aria-label': 'Previous month',
        tabindex: '0',
      })
      expect(prevSlot.gestures).toEqual([
        { gesture: 'Pressed', press: 'PreviousCalendarMonth' },
      ])

      expect(Slot.ariaOf(nextSlot)).toEqual({
        role: 'button',
        id: 'booking-next-month',
        'aria-controls': 'booking-grid',
        'aria-label': 'Next month',
        tabindex: '0',
      })
      expect(nextSlot.gestures).toEqual([
        { gesture: 'Pressed', press: 'NextCalendarMonth' },
      ])

      expect(Slot.ariaOf(headingSlot)).toEqual({
        role: 'button',
        id: 'booking-heading',
        'aria-controls': 'booking-grid',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        tabindex: '0',
      })
      expect(headingSlot.gestures).toEqual([
        { gesture: 'Pressed', press: 'ZoomOutCalendarView' },
      ])

      // Range mode adds aria-multiselectable="true" on Grid
      const rangeView = Part.view(Calendar.part, state1, rangeProps)
      expect(Slot.ariaOf(rangeView.slot('Grid'))['aria-multiselectable']).toBe(
        'true',
      )

      // Reference stability: selecting April 20 leaves April 22's GridCell binding reference identical
      const state2 = fold(
        [Calendar.SelectCalendarDate({ date: d(2026, 4, 20) })],
        singleProps,
        state1,
      )
      const view2 = Part.view(part, state2, singleProps)
      expect(view2.slot('GridCell', '2026-04-22')).toBe(untouchedCell)
      expect(view2.slot('GridCell', '2026-04-13')).not.toBe(todayCell)
      expect(view2.slot('GridCell', '2026-04-20').tabIndex).toBe(0)
      expect(view2.slot('GridCell', '2026-04-13').tabIndex).toBe(-1)
    })

    it('syncs under Domain by default and supports deviceOnly() omitting state from encoded Model', () => {
      const BaseModel = S.Struct({ count: S.Number })
      const BaseMessage = S.Union([])
      const Base = makeProgram({
        id: 'calendar-sync-test',
        version: 1,
        Model: BaseModel,
        Message: BaseMessage,
        init: () => [{ count: 0 }, []],
        update: (model: typeof BaseModel.Type) => [model, []],
      })

      const syncedApp = Part.compose({
        of: Base,
        parts: [Part.given(Calendar.make(), () => singleProps)],
      })
      expect(
        syncedApp.synchronization?.messageCategory(
          Calendar.SelectCalendarDate({ date: today }),
        ),
      ).toBe('Domain')
      expect(
        syncedApp.synchronization?.paceOf?.(
          Calendar.SelectCalendarDate({ date: today }),
        ),
      ).toEqual(Synced())

      // Catalog press decoding works end-to-end with ISO date token
      const [syncedInit] = syncedApp.init()
      expect(
        syncedApp.interaction?.press(
          syncedInit,
          'SelectCalendarDate:2026-04-20',
        ),
      ).toEqual([Calendar.SelectCalendarDate({ date: d(2026, 4, 20) })])

      const localApp = Part.compose({
        of: Base,
        parts: [Part.given(Calendar.deviceOnly(), () => singleProps)],
      })
      expect(
        localApp.synchronization?.paceOf?.(
          Calendar.SelectCalendarDate({ date: today }),
        ),
      ).toEqual(Device({ because: 'OwnView' }))
      const [localInit] = localApp.init()
      expect(S.encodeSync(localApp.Model)(localInit)).toEqual({ count: 0 })
    })
  })
})
