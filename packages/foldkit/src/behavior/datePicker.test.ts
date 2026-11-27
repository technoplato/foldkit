import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import * as Calendar from './calendar.js'
import * as DateGrid from './dateGrid.js'
import * as DatePicker from './datePicker.js'
import * as Layers from './layers.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const d = DateGrid.makeDate
const today = d(2026, 4, 13)

const singleProps: DatePicker.Props = {
  id: 'booking',
  today,
  hasLabel: true,
  hasDescription: true,
  hasError: true,
  name: 'bookingDate',
  minDate: d(2026, 3, 1),
  maxDate: d(2026, 6, 30),
  disabledDates: [d(2026, 4, 15)],
}

const rangeProps: DatePicker.Props = {
  ...singleProps,
  selectionMode: 'Range',
}

const fold = (
  messages: ReadonlyArray<DatePicker.Message>,
  props: DatePicker.Props = singleProps,
  from: DatePicker.State = DatePicker.initial,
): DatePicker.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => DatePicker.chart.transition(state, message, props)[0],
  )

describe('core DatePicker Part', () => {
  describe('declaration, chart integrity, and element IDs', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(DatePicker.part)).toEqual([])
      expect(Part.problemsOf(DatePicker.deviceOnly())).toEqual([])
      expect(Part.problemsOf(DatePicker.make({ sync: 'OwnView' }))).toEqual([])
      expect(Part.problemsOf(DatePicker.make({ defaultDate: today }))).toEqual(
        [],
      )
      expect(
        Part.problemsOf(
          DatePicker.make({
            defaultRange: { start: d(2026, 4, 10), end: d(2026, 4, 14) },
          }),
        ),
      ).toEqual([])
      expect(
        Part.problemsOf(DatePicker.make({ defaultViewMode: 'Month' })),
      ).toEqual([])
      expect(
        Part.problemsOf(DatePicker.make({ defaultViewMode: 'Year' })),
      ).toEqual([])
      expect(
        Block.problemsOf({ name: 'DatePicker', chart: DatePicker.chart }),
      ).toEqual([])
      expect(
        Block.problemsOf({
          name: 'DatePickerSelected',
          chart: DatePicker.chartOf(DatePicker.initialDate(today)),
        }),
      ).toEqual([])

      for (const action of DatePicker.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, trigger label resolution, and default config readings', () => {
      expect(DatePicker.datePickerId('booking')).toBe('booking-date-picker')
      expect(DatePicker.triggerId('booking')).toBe('booking-trigger')
      expect(DatePicker.inputId('booking')).toBe('booking-input')
      expect(DatePicker.contentId('booking')).toBe('booking-content')
      expect(DatePicker.clearButtonId('booking')).toBe('booking-clear')
      expect(DatePicker.labelId('booking')).toBe('booking-label')
      expect(DatePicker.descriptionId('booking')).toBe('booking-description')
      expect(DatePicker.errorId('booking')).toBe('booking-error')
      expect(DatePicker.calendarId('booking')).toBe('booking-calendar')
      expect(DatePicker.popoverId('booking')).toBe('booking-popover')

      expect(DatePicker.selectionModeOf({})).toBe('Single')
      expect(DatePicker.isRangeMode({})).toBe(false)
      expect(DatePicker.closeOnSelectOf({})).toBe(true)
      expect(DatePicker.closeOnClearOf({})).toBe(false)
      expect(DatePicker.openOnInputClickOf({})).toBe(false)
      expect(DatePicker.fixOnBlurOf({})).toBe(true)
      expect(DatePicker.isDisabledOf({})).toBe(false)
      expect(DatePicker.isReadOnlyOf({})).toBe(false)
      expect(DatePicker.isRequiredOf({})).toBe(false)
      expect(DatePicker.isInvalidOf({})).toBe(false)
      expect(DatePicker.isMessage(DatePicker.OpenDatePicker())).toBe(true)

      expect(DatePicker.resolveTriggerLabel({})).toEqual(Option.none())
      expect(DatePicker.resolveTriggerLabel({ ariaLabel: 'Due date' })).toEqual(
        Option.some(DatePicker.TriggerAriaLabel({ value: 'Due date' })),
      )
      expect(
        DatePicker.resolveTriggerLabel({ ariaLabelledBy: 'due-label' }),
      ).toEqual(
        Option.some(DatePicker.TriggerAriaLabelledBy({ value: 'due-label' })),
      )
      expect(
        DatePicker.resolveTriggerLabel({
          ariaLabel: 'Due date',
          ariaLabelledBy: 'due-label',
        }),
      ).toEqual(Option.some(DatePicker.TriggerAriaLabel({ value: 'Due date' })))
    })
  })

  describe('pure date-input parsing and formatting helpers', () => {
    it('formats and parses ISO, MonthDayYear, DayMonthYear, and range strings without new Date()', () => {
      const sample = d(2026, 4, 5)
      expect(DatePicker.formatDate(sample)).toBe('2026-04-05')
      expect(DatePicker.formatDate(sample, 'MonthDayYear')).toBe('04/05/2026')
      expect(DatePicker.formatDate(sample, 'DayMonthYear')).toBe('05/04/2026')

      expect(DatePicker.formatOptionalDate(Option.none())).toBe('')
      expect(DatePicker.formatOptionalDate(Option.some(sample))).toBe(
        '2026-04-05',
      )

      expect(DatePicker.parseDateInput('2026-04-05')).toEqual(
        Option.some(sample),
      )
      expect(DatePicker.parseDateInput('2026-4-5')).toEqual(Option.some(sample))
      expect(DatePicker.parseDateInput('2026/04/05')).toEqual(
        Option.some(sample),
      )
      expect(DatePicker.parseDateInput('04/05/2026', 'MonthDayYear')).toEqual(
        Option.some(sample),
      )
      expect(DatePicker.parseDateInput('05/04/2026', 'DayMonthYear')).toEqual(
        Option.some(sample),
      )
      expect(DatePicker.parseDateInput('2024-02-29')).toEqual(
        Option.some(d(2024, 2, 29)),
      )
      expect(DatePicker.parseDateInput('2026-02-29')).toEqual(Option.none())
      expect(DatePicker.parseDateInput('2026-02-30')).toEqual(Option.none())
      expect(DatePicker.parseDateInput('2026-13-01')).toEqual(Option.none())
      expect(DatePicker.parseDateInput('not-a-date')).toEqual(Option.none())
      expect(DatePicker.parseDateInput('   ')).toEqual(Option.none())

      // Range formatting and reverse-order normalization
      const range = { start: d(2026, 4, 10), end: d(2026, 4, 14) }
      expect(
        DatePicker.formatSelection(Calendar.DateRangeSelected(range)),
      ).toBe('2026-04-10 - 2026-04-14')
      expect(DatePicker.parseDateRangeInput('2026-04-14 - 2026-04-10')).toEqual(
        Option.some(range),
      )
      expect(
        DatePicker.parseDateRangeInput('2026-04-10 to 2026-04-14'),
      ).toEqual(Option.some(range))
      expect(DatePicker.parseDateRangeInput('2026-04-10..2026-04-14')).toEqual(
        Option.some(range),
      )
      expect(DatePicker.parseDateRangeInput('2026-04-10 - 2026-02-30')).toEqual(
        Option.none(),
      )

      expect(DatePicker.sanitizeDateInput('2026-04-13abc!')).toBe('2026-04-13')
      expect(DatePicker.placeholderOf({})).toBe('YYYY-MM-DD')
      expect(DatePicker.placeholderOf({ selectionMode: 'Range' })).toBe(
        'YYYY-MM-DD - YYYY-MM-DD',
      )
      expect(
        DatePicker.placeholderOf({
          inputFormat: 'MonthDayYear',
          selectionMode: 'Single',
        }),
      ).toBe('MM/DD/YYYY')
    })
  })

  describe('trigger open/close, Layers dismissal, and Placement geometry', () => {
    it('opens, toggles, closes, and respects Layers stacking on Escape and outside press', () => {
      const opened = fold([DatePicker.OpenDatePicker()])
      expect(DatePicker.isOpen(opened)).toBe(true)
      expect(Calendar.isFocused(DatePicker.calendarOf(opened))).toBe(true)

      const toggledClosed = fold(
        [DatePicker.ToggleDatePicker()],
        singleProps,
        opened,
      )
      expect(DatePicker.isClosed(toggledClosed)).toBe(true)

      // Trigger keyboard activation (ArrowDown opens; Escape closes)
      const openedByKey = fold([
        DatePicker.PressedTriggerKey({ key: 'ArrowDown' }),
      ])
      expect(DatePicker.isOpen(openedByKey)).toBe(true)

      const closedByEscape = fold(
        [DatePicker.PressedDatePickerKey({ key: 'Escape' })],
        singleProps,
        openedByKey,
      )
      expect(DatePicker.isClosed(closedByEscape)).toBe(true)

      // Escape backs out Year -> Month -> Day before closing popup
      const unboundedProps: DatePicker.Props = { id: 'booking', today }
      const inYear = fold(
        [
          DatePicker.OpenDatePicker(),
          DatePicker.ZoomOutDatePickerView(),
          DatePicker.ZoomOutDatePickerView(),
        ],
        unboundedProps,
      )
      expect(DatePicker.viewModeOf(inYear)).toBe('Year')

      const backMonth = fold(
        [DatePicker.PressedDatePickerKey({ key: 'Escape' })],
        unboundedProps,
        inYear,
      )
      expect(DatePicker.isOpen(backMonth)).toBe(true)
      expect(DatePicker.viewModeOf(backMonth)).toBe('Month')

      const backDay = fold(
        [DatePicker.PressedDatePickerKey({ key: 'Escape' })],
        unboundedProps,
        backMonth,
      )
      expect(DatePicker.isOpen(backDay)).toBe(true)
      expect(DatePicker.viewModeOf(backDay)).toBe('Day')

      const nowClosed = fold(
        [DatePicker.PressedDatePickerKey({ key: 'Escape' })],
        unboundedProps,
        backDay,
      )
      expect(DatePicker.isClosed(nowClosed)).toBe(true)

      // Layers: stacked layer above shields Escape, DismissDatePicker, and outside press
      const stackedProps: DatePicker.Props = {
        ...singleProps,
        layers: [DatePicker.layerOf(singleProps), Layers.layer('nested-menu')],
      }
      expect(
        DatePicker.chart.step(
          opened,
          DatePicker.PressedDatePickerKey({ key: 'Escape' }),
          stackedProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        DatePicker.chart.step(
          opened,
          DatePicker.DismissDatePicker(),
          stackedProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      expect(
        DatePicker.chart.step(
          opened,
          DatePicker.PressedOutsideDatePicker({ insideIds: [] }),
          stackedProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Outside press landing inside booking does not dismiss; outside does
      expect(
        DatePicker.chart.step(
          opened,
          DatePicker.PressedOutsideDatePicker({ insideIds: ['booking'] }),
          singleProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      const outsideClosed = fold(
        [DatePicker.PressedOutsideDatePicker({ insideIds: [] })],
        singleProps,
        opened,
      )
      expect(DatePicker.isClosed(outsideClosed)).toBe(true)

      // Modal layer blocks outside pointers while open
      const modalProps: DatePicker.Props = { ...singleProps, isModal: true }
      expect(DatePicker.isOutsidePointerBlocked(opened, modalProps)).toBe(true)
      expect(
        DatePicker.isOutsidePointerBlocked(DatePicker.initial, modalProps),
      ).toBe(false)
    })

    it('computes popup placement below or above the anchor via Placement.placeFor', () => {
      const below = DatePicker.placeFor(singleProps, {
        anchor: { left: 100, top: 80, width: 180, height: 36 },
        size: { width: 280, height: 300 },
        view: { width: 1000, height: 800 },
      })
      expect(below).toEqual({ left: 100, top: 124, side: 'Below' })

      const above = DatePicker.placeFor(
        { placement: { gapPx: 12, edgePx: 10 } },
        {
          anchor: { left: 100, top: 680, width: 180, height: 36 },
          size: { width: 280, height: 300 },
          view: { width: 1000, height: 800 },
        },
      )
      expect(above).toEqual({ left: 100, top: 368, side: 'Above' })
    })
  })

  describe('single-date, date-range, clear, and embedded Calendar navigation', () => {
    it('selects single dates with auto-close, respects closeOnSelect=false, and clears without closing unless closeOnClear=true', () => {
      const selected = fold([
        DatePicker.OpenDatePicker(),
        DatePicker.SelectDatePickerDate({ date: d(2026, 4, 20) }),
      ])
      expect(DatePicker.isClosed(selected)).toBe(true)
      expect(DatePicker.selectedDateOf(selected)).toEqual(
        Option.some(d(2026, 4, 20)),
      )
      expect(DatePicker.inputValueOf(selected, singleProps)).toBe('2026-04-20')
      expect(DatePicker.hiddenInputsOf(selected, singleProps)).toEqual([
        { name: 'bookingDate', value: '2026-04-20' },
      ])

      // Stay open when closeOnSelect=false
      const stayOpenProps: DatePicker.Props = {
        ...singleProps,
        closeOnSelect: false,
      }
      const stayedOpen = fold(
        [
          DatePicker.OpenDatePicker(),
          DatePicker.SelectDatePickerDate({ date: d(2026, 4, 20) }),
        ],
        stayOpenProps,
      )
      expect(DatePicker.isOpen(stayedOpen)).toBe(true)
      expect(DatePicker.selectedDateOf(stayedOpen)).toEqual(
        Option.some(d(2026, 4, 20)),
      )

      // Clear without closing by default
      const clearedOpen = fold(
        [DatePicker.ClearDatePicker()],
        stayOpenProps,
        stayedOpen,
      )
      expect(DatePicker.isOpen(clearedOpen)).toBe(true)
      expect(DatePicker.isSelectionEmpty(clearedOpen)).toBe(true)

      // Clear closes when closeOnClear=true
      const closeOnClearProps: DatePicker.Props = {
        ...stayOpenProps,
        closeOnClear: true,
      }
      const clearedClosed = fold(
        [DatePicker.ClearDatePicker()],
        closeOnClearProps,
        stayedOpen,
      )
      expect(DatePicker.isClosed(clearedClosed)).toBe(true)
      expect(DatePicker.isSelectionEmpty(clearedClosed)).toBe(true)

      // Disabled date is rejected
      const opened = fold([DatePicker.OpenDatePicker()])
      expect(
        DatePicker.chart.step(
          opened,
          DatePicker.SelectDatePickerDate({ date: d(2026, 4, 15) }),
          singleProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
    })

    it('supports Range picking, hover preview, auto-close on end date, and embedded Calendar 2D keyboard navigation', () => {
      // First click picks RangeStart and keeps popup open
      const started = fold(
        [
          DatePicker.OpenDatePicker(),
          DatePicker.SelectDatePickerDate({ date: d(2026, 4, 18) }),
        ],
        rangeProps,
      )
      expect(DatePicker.isOpen(started)).toBe(true)
      expect(DatePicker.rangeStartOf(started)).toEqual(
        Option.some(d(2026, 4, 18)),
      )

      // Hover preview normalizes start <= end
      const hovered = fold(
        [DatePicker.HoverDatePickerDate({ date: d(2026, 4, 12) })],
        rangeProps,
        started,
      )
      expect(DatePicker.previewRangeOf(hovered)).toEqual(
        Option.some({ start: d(2026, 4, 12), end: d(2026, 4, 18) }),
      )

      // Second click completes normalized range and auto-closes
      const completed = fold(
        [DatePicker.SelectDatePickerDate({ date: d(2026, 4, 12) })],
        rangeProps,
        hovered,
      )
      expect(DatePicker.isClosed(completed)).toBe(true)
      expect(DatePicker.selectedRangeOf(completed)).toEqual(
        Option.some({ start: d(2026, 4, 12), end: d(2026, 4, 18) }),
      )
      expect(DatePicker.inputValueOf(completed, rangeProps)).toBe(
        '2026-04-12 - 2026-04-18',
      )
      expect(DatePicker.hiddenInputsOf(completed, rangeProps)).toEqual([
        { name: 'bookingDate', value: '2026-04-12' },
        { name: 'bookingDate', value: '2026-04-18' },
      ])

      // Embedded 2D keyboard nav skips disabled Apr 15 -> Apr 16, Enter commits & closes
      const pickedByKeys = fold([
        DatePicker.OpenDatePicker(),
        DatePicker.PressedDatePickerKey({ key: 'ArrowRight' }),
        DatePicker.PressedDatePickerKey({ key: 'ArrowRight' }),
        DatePicker.PressedDatePickerKey({ key: 'Enter' }),
      ])
      expect(DatePicker.isClosed(pickedByKeys)).toBe(true)
      expect(DatePicker.selectedDateOf(pickedByKeys)).toEqual(
        Option.some(d(2026, 4, 16)),
      )

      // Month/year/decade navigation & drill back
      const unboundedProps: DatePicker.Props = { id: 'booking', today }
      const navigated = fold(
        [
          DatePicker.OpenDatePicker(),
          DatePicker.NextDatePickerMonth(),
          DatePicker.NextDatePickerYear(),
          DatePicker.PreviousDatePickerYear(),
          DatePicker.PreviousDatePickerMonth(),
          DatePicker.ZoomOutDatePickerView(),
          DatePicker.ZoomOutDatePickerView(),
          DatePicker.PageDatePickerYears({ direction: 1 }),
          DatePicker.SelectDatePickerYear({ year: 2036 }),
          DatePicker.SelectDatePickerMonth({ month: 8 }),
        ],
        unboundedProps,
      )
      expect(DatePicker.viewModeOf(navigated)).toBe('Day')
      expect(DatePicker.viewMonthOf(navigated, unboundedProps)).toEqual({
        year: 2036,
        month: 8,
      })

      // Jump to today returns to April 2026
      const backToday = fold(
        [DatePicker.JumpDatePickerToToday()],
        unboundedProps,
        navigated,
      )
      expect(DatePicker.focusedDateOf(backToday, unboundedProps)).toEqual(today)
    })
  })

  describe('text input typing, commit, blur, guards, and atRest', () => {
    it('syncs typed dates to focus, commits on Enter/CommitDateInput, handles invalid drafts on blur, and opens on input click when enabled', () => {
      const typed = fold([DatePicker.ChangeDateInput({ value: '2026-05-10' })])
      expect(DatePicker.isInputDirty(typed)).toBe(true)
      expect(DatePicker.inputValueOf(typed, singleProps)).toBe('2026-05-10')
      expect(DatePicker.isInputInvalid(typed, singleProps)).toBe(false)
      expect(DatePicker.focusedDateOf(typed, singleProps)).toEqual(
        d(2026, 5, 10),
      )

      // Commit applies selection and clears draft
      const committed = fold([DatePicker.CommitDateInput()], singleProps, typed)
      expect(DatePicker.isInputDirty(committed)).toBe(false)
      expect(DatePicker.selectedDateOf(committed)).toEqual(
        Option.some(d(2026, 5, 10)),
      )

      // Invalid or disabled text marks input invalid and refuses commit
      const badDraft = fold(
        [DatePicker.ChangeDateInput({ value: '2026-04-15' })],
        singleProps,
        committed,
      )
      expect(DatePicker.isInputInvalid(badDraft, singleProps)).toBe(true)
      expect(DatePicker.isEffectiveInvalid(badDraft, singleProps)).toBe(true)
      expect(
        DatePicker.chart.step(
          badDraft,
          DatePicker.CommitDateInput(),
          singleProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })

      // Blur with fixOnBlur=true (default) reverts invalid draft to committed selection
      const reverted = fold(
        [DatePicker.BlurredDateInput()],
        singleProps,
        badDraft,
      )
      expect(DatePicker.isInputDirty(reverted)).toBe(false)
      expect(DatePicker.isInputInvalid(reverted, singleProps)).toBe(false)
      expect(DatePicker.inputValueOf(reverted, singleProps)).toBe('2026-05-10')

      // Blur with fixOnBlur=false keeps invalid draft visible
      const noFixProps: DatePicker.Props = { ...singleProps, fixOnBlur: false }
      const keptInvalid = fold(
        [DatePicker.BlurredDateInput()],
        noFixProps,
        badDraft,
      )
      expect(DatePicker.isInputInvalid(keptInvalid, noFixProps)).toBe(true)

      // Range text input commit
      const rangeTyped = fold(
        [
          DatePicker.OpenDatePicker(),
          DatePicker.ChangeDateInput({ value: '2026-04-10 - 2026-04-14' }),
          DatePicker.PressedInputKey({ key: 'Enter' }),
        ],
        rangeProps,
      )
      expect(DatePicker.isClosed(rangeTyped)).toBe(true)
      expect(DatePicker.selectedRangeOf(rangeTyped)).toEqual(
        Option.some({ start: d(2026, 4, 10), end: d(2026, 4, 14) }),
      )

      // ClickedDateInput opens only when openOnInputClick is true
      expect(
        DatePicker.chart.step(
          DatePicker.initial,
          DatePicker.ClickedDateInput(),
          singleProps,
        ),
      ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      const openedOnClick = fold([DatePicker.ClickedDateInput()], {
        ...singleProps,
        openOnInputClick: true,
      })
      expect(DatePicker.isOpen(openedOnClick)).toBe(true)
    })

    it('enforces disabled/readOnly guards and atRest closes open popup while preserving selected date', () => {
      const disabledProps: DatePicker.Props = {
        ...singleProps,
        isDisabled: true,
      }
      const readOnlyProps: DatePicker.Props = {
        ...singleProps,
        isReadOnly: true,
      }
      for (const guardedProps of [disabledProps, readOnlyProps]) {
        expect(
          DatePicker.chart.step(
            DatePicker.initial,
            DatePicker.OpenDatePicker(),
            guardedProps,
          ),
        ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
        expect(
          DatePicker.chart.step(
            DatePicker.initial,
            DatePicker.SelectDatePickerDate({ date: d(2026, 4, 20) }),
            guardedProps,
          ),
        ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
        expect(
          DatePicker.chart.step(
            DatePicker.initial,
            DatePicker.ChangeDateInput({ value: '2026-04-20' }),
            guardedProps,
          ),
        ).toMatchObject({ _tag: 'Ignored', reason: 'ExplicitlyIgnored' })
      }

      // atRest closes open popup, drops calendar to Day view, clears draft, and keeps selection
      const openSelectedZoomed = fold(
        [
          DatePicker.SelectDatePickerDate({ date: d(2026, 4, 20) }),
          DatePicker.OpenDatePicker(),
          DatePicker.ZoomOutDatePickerView(),
          DatePicker.ChangeDateInput({ value: '2026-04' }),
        ],
        singleProps,
      )
      expect(DatePicker.isOpen(openSelectedZoomed)).toBe(true)
      expect(DatePicker.viewModeOf(openSelectedZoomed)).toBe('Month')

      const rested = DatePicker.atRest(openSelectedZoomed)
      expect(DatePicker.isClosed(rested)).toBe(true)
      expect(DatePicker.viewModeOf(rested)).toBe('Day')
      expect(DatePicker.isInputDirty(rested)).toBe(false)
      expect(DatePicker.selectedDateOf(rested)).toEqual(
        Option.some(d(2026, 4, 20)),
      )
    })
  })

  describe('reference-stable SlotBinding projection and Part.compose synchronization', () => {
    it('projects Trigger, Input, Content, Calendar Grid/GridCell, ClearButton, Label, Description, and Error with reference stability', () => {
      const part = DatePicker.make({ name: 'BookingDatePicker' })
      const closedState = DatePicker.initialDate(d(2026, 4, 13))
      const viewClosed = Part.view(part, closedState, {
        ...singleProps,
        isRequired: true,
        isInvalid: true,
      })
      expect(
        Part.view(part, closedState, {
          ...singleProps,
          isRequired: true,
          isInvalid: true,
        }),
      ).toBe(viewClosed)

      const triggerClosed = viewClosed.slot('Trigger')
      expect(Slot.ariaOf(triggerClosed)).toEqual({
        role: 'button',
        id: 'booking-trigger',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'aria-controls': 'booking-content',
        'aria-labelledby': 'booking-label',
        'aria-describedby': 'booking-description booking-error',
        'aria-required': 'true',
        'aria-invalid': 'true',
        tabindex: '0',
      })
      expect(triggerClosed.gestures).toEqual([
        { gesture: 'Pressed', press: 'ToggleDatePicker' },
      ])

      const inputClosed = viewClosed.slot('Input')
      expect(Slot.ariaOf(inputClosed)).toEqual({
        role: 'textbox',
        id: 'booking-input',
        'aria-controls': 'booking-content',
        'aria-expanded': 'false',
        'aria-labelledby': 'booking-label',
        'aria-describedby': 'booking-description booking-error',
        'aria-required': 'true',
        'aria-invalid': 'true',
        tabindex: '0',
      })

      const contentClosed = viewClosed.slot('Content')
      expect(Slot.ariaOf(contentClosed)).toEqual({
        role: 'dialog',
        id: 'booking-content',
        'aria-modal': 'false',
        'aria-labelledby': 'booking-label',
        'aria-describedby': 'booking-description booking-error',
        hidden: '',
      })

      const labelSlot = viewClosed.slot('Label')
      const descSlot = viewClosed.slot('Description')
      const errorSlot = viewClosed.slot('Error')
      const clearSlot = viewClosed.slot('ClearButton')
      expect(Slot.ariaOf(labelSlot)).toEqual({ id: 'booking-label' })
      expect(Slot.ariaOf(descSlot)).toEqual({ id: 'booking-description' })
      expect(Slot.ariaOf(errorSlot)).toEqual({ id: 'booking-error' })
      expect(Slot.ariaOf(clearSlot)).toEqual({
        role: 'button',
        id: 'booking-clear',
        'aria-controls': 'booking-input',
        'aria-label': 'Clear date',
        tabindex: '0',
      })

      // Open the popup and inspect delegated Calendar Grid & GridCell slots
      const openProps: DatePicker.Props = singleProps
      const openState1 = fold(
        [DatePicker.OpenDatePicker()],
        openProps,
        closedState,
      )
      const viewOpen1 = Part.view(part, openState1, openProps)
      expect(Slot.ariaOf(viewOpen1.slot('Trigger'))['aria-expanded']).toBe(
        'true',
      )
      expect(Slot.ariaOf(viewOpen1.slot('Content'))['hidden']).toBeUndefined()
      expect(Slot.ariaOf(viewOpen1.slot('Grid'))).toEqual({
        role: 'grid',
        id: 'booking-grid',
        'aria-labelledby': 'booking-heading',
        'aria-activedescendant': 'booking-cell-2026-4-13',
        tabindex: '0',
      })

      const cell13 = viewOpen1.slot('GridCell', '2026-04-13')
      const untouchedCell22 = viewOpen1.slot('GridCell', '2026-04-22')
      expect(Slot.ariaOf(cell13)).toEqual({
        role: 'gridcell',
        id: 'booking-cell-2026-4-13',
        'aria-selected': 'true',
        'aria-current': 'true',
        tabindex: '0',
      })
      expect(cell13.gestures).toEqual([
        { gesture: 'Pressed', press: 'SelectDatePickerDate:2026-04-13' },
      ])

      // Reference stability: moving focus via ArrowRight preserves untouched April 22 cell & Label references
      const labelRef = viewOpen1.slot('Label')
      const openState2 = fold(
        [DatePicker.PressedDatePickerKey({ key: 'ArrowRight' })],
        openProps,
        openState1,
      )
      const viewOpen2 = Part.view(part, openState2, openProps)
      expect(viewOpen2.slot('GridCell', '2026-04-22')).toBe(untouchedCell22)
      expect(viewOpen2.slot('Label')).toBe(labelRef)
      expect(viewOpen2.slot('GridCell', '2026-04-14').tabIndex).toBe(0)
      expect(viewOpen2.slot('GridCell', '2026-04-13').tabIndex).toBe(-1)
    })

    it('syncs under Domain by default and supports deviceOnly() omitting state from encoded Model', () => {
      const BaseModel = S.Struct({ count: S.Number })
      const BaseMessage = S.Union([
        Catalog.action('Bump', {
          what: 'Bumps',
          why: 'To bump',
          meta: { label: 'Bump', keys: [] },
        }),
      ])
      const Base = makeProgram({
        id: 'date-picker-sync-test',
        version: 1,
        Model: BaseModel,
        Message: BaseMessage,
        init: () => [{ count: 0 }, []],
        update: (model: typeof BaseModel.Type) => [model, []],
      })

      const syncedApp = Part.compose({
        of: Base,
        parts: [Part.given(DatePicker.make(), () => singleProps)],
      })
      expect(
        syncedApp.synchronization?.messageCategory(
          DatePicker.SelectDatePickerDate({ date: today }),
        ),
      ).toBe('Domain')
      expect(
        syncedApp.synchronization?.paceOf?.(
          DatePicker.SelectDatePickerDate({ date: today }),
        ),
      ).toEqual(Synced())

      // Catalog press decoding works end-to-end for ISO date & text input tokens
      const [syncedInit] = syncedApp.init()
      expect(
        syncedApp.interaction?.press(
          syncedInit,
          'SelectDatePickerDate:2026-04-20',
        ),
      ).toEqual([DatePicker.SelectDatePickerDate({ date: d(2026, 4, 20) })])
      expect(
        syncedApp.interaction?.press(syncedInit, 'ChangeDateInput:2026-04-22'),
      ).toEqual([DatePicker.ChangeDateInput({ value: '2026-04-22' })])

      const localApp = Part.compose({
        of: Base,
        parts: [Part.given(DatePicker.deviceOnly(), () => singleProps)],
      })
      expect(
        localApp.synchronization?.paceOf?.(
          DatePicker.SelectDatePickerDate({ date: today }),
        ),
      ).toEqual(Device({ because: 'OwnView' }))
      const [localInit] = localApp.init()
      expect(S.encodeSync(localApp.Model)(localInit)).toEqual({ count: 0 })
    })
  })
})
