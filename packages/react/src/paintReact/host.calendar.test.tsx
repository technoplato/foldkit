import { Option } from 'effect'
import { Calendar, DateGrid } from 'foldkit/behavior'
import { CalendarFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Calendar Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Calendar-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Calendar.Props> = {}) => {
  const fixture = CalendarFixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
    })
  const view = render(painted())
  const repaint = (): void => {
    act(() => {
      view.rerender(painted())
    })
  }
  const elementWith = (selector: string): HTMLElement => {
    const found = view.container.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted calendar fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Calendar Part on the React generic host', () => {
  it('projects grid/gridcell ARIA, roving tabIndex, click selection, keyboard nav, and month stepping', () => {
    const staged = stage()

    const grid = staged.elementWith('#fixture-calendar-grid')
    expect(grid.getAttribute('role')).toBe('grid')
    expect(grid.getAttribute('aria-labelledby')).toBe(
      'fixture-calendar-heading',
    )
    expect(grid.getAttribute('aria-activedescendant')).toBe(
      'fixture-calendar-cell-2026-4-13',
    )

    const todayCell = staged.elementWith('#fixture-calendar-cell-2026-4-13')
    expect(todayCell.getAttribute('role')).toBe('gridcell')
    expect(todayCell.getAttribute('aria-current')).toBe('true')
    expect(todayCell.tabIndex).toBe(0)
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-15')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Click April 14 -> selected and roving tabIndex = 0
    fireEvent.click(staged.elementWith('#fixture-calendar-cell-2026-4-14'))
    staged.repaint()
    expect(Calendar.selectedDateOf(staged.fixture.calendarState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 4, 14)),
    )
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-14')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-calendar-cell-2026-4-14').tabIndex,
    ).toBe(0)
    expect(
      staged.elementWith('#fixture-calendar-cell-2026-4-13').tabIndex,
    ).toBe(-1)

    // ArrowRight skips disabled April 15 -> April 16; Enter selects April 16
    staged.fixture.send(Calendar.PressedCalendarKey({ key: 'ArrowRight' }))
    staged.fixture.send(Calendar.PressedCalendarKey({ key: 'Enter' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-16')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // Click NextMonthButton -> May 2026
    fireEvent.click(staged.elementWith('#fixture-calendar-next-month'))
    staged.repaint()
    expect(staged.elementWith('#fixture-calendar-heading').textContent).toBe(
      '2026-05',
    )

    // Click Heading -> zooms to Month view
    fireEvent.click(staged.elementWith('#fixture-calendar-heading'))
    staged.repaint()
    expect(Calendar.viewModeOf(staged.fixture.calendarState())).toBe('Month')
    expect(staged.elementWith('#fixture-calendar-heading').textContent).toBe(
      '2026',
    )
  })

  it('supports Range selection mode with aria-multiselectable on the React generic host', () => {
    const ranged = stage({ selectionMode: 'Range' })

    expect(
      ranged
        .elementWith('#fixture-calendar-grid')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    fireEvent.click(ranged.elementWith('#fixture-calendar-cell-2026-4-10'))
    ranged.repaint()
    fireEvent.click(ranged.elementWith('#fixture-calendar-cell-2026-4-14'))
    ranged.repaint()

    expect(Calendar.selectedRangeOf(ranged.fixture.calendarState())).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 10),
        end: DateGrid.makeDate(2026, 4, 14),
      }),
    )
    expect(
      ranged
        .elementWith('#fixture-calendar-cell-2026-4-12')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      ranged
        .elementWith('#fixture-calendar-cell-2026-4-16')
        .getAttribute('aria-selected'),
    ).toBe('false')
  })
})
