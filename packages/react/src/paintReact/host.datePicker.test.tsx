import { Option } from 'effect'
import { DateGrid, DatePicker } from 'foldkit/behavior'
import { DatePickerFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core DatePicker Part on the React painter through the
// existing generic React host (`paintReact/host.tsx`), with zero DatePicker-
// specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<DatePicker.Props> = {}) => {
  const fixture = DatePickerFixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
      onInput: (token, value) => {
        fixture.type(token, value)
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
    throw new Error(`the painted date picker fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core DatePicker Part on the React generic host', () => {
  it('projects trigger/input/dialog/grid ARIA, opens, selects via click and keyboard, types ISO input, and clears', () => {
    const staged = stage({ isRequired: true })

    const trigger = staged.elementWith('#fixture-date-picker-trigger')
    expect(trigger.getAttribute('role')).toBe('button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe(
      'fixture-date-picker-content',
    )
    expect(trigger.getAttribute('aria-required')).toBe('true')
    expect(trigger.textContent).toBe('Pick a date')

    const content = staged.elementWith('#fixture-date-picker-content')
    expect(content.getAttribute('role')).toBe('dialog')
    expect(content.hasAttribute('hidden')).toBe(true)

    const input = staged.elementWith('#fixture-date-picker-input')
    expect(input.getAttribute('role')).toBe('textbox')
    expect(input.getAttribute('aria-labelledby')).toBe(
      'fixture-date-picker-label',
    )
    expect(input.getAttribute('aria-describedby')).toBe(
      'fixture-date-picker-description',
    )

    // Open via trigger click
    fireEvent.click(trigger)
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-date-picker-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-date-picker-content').hasAttribute('hidden'),
    ).toBe(false)

    // ArrowRight skips disabled April 15 -> April 16; Enter commits and closes
    staged.fixture.send(DatePicker.PressedDatePickerKey({ key: 'ArrowRight' }))
    staged.fixture.send(DatePicker.PressedDatePickerKey({ key: 'ArrowRight' }))
    staged.fixture.send(DatePicker.PressedDatePickerKey({ key: 'Enter' }))
    staged.repaint()
    expect(DatePicker.isClosed(staged.fixture.datePickerState())).toBe(true)
    expect(DatePicker.selectedDateOf(staged.fixture.datePickerState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 4, 16)),
    )
    expect(staged.elementWith('#fixture-date-picker-trigger').textContent).toBe(
      '2026-04-16',
    )

    // Type a date into TextInput and commit
    fireEvent.change(staged.elementWith('#fixture-date-picker-input'), {
      target: { value: '2026-05-12' },
    })
    staged.fixture.send(DatePicker.CommitDateInput())
    staged.repaint()
    expect(DatePicker.selectedDateOf(staged.fixture.datePickerState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 5, 12)),
    )

    // Click ClearButton
    fireEvent.click(staged.elementWith('#fixture-date-picker-clear'))
    staged.repaint()
    expect(DatePicker.isSelectionEmpty(staged.fixture.datePickerState())).toBe(
      true,
    )
  })

  it('supports Range mode with aria-multiselectable, month stepping, and Escape dismissal on React generic host', () => {
    const ranged = stage({ selectionMode: 'Range', isInvalid: true })

    expect(
      ranged
        .elementWith('#fixture-date-picker-trigger')
        .getAttribute('aria-invalid'),
    ).toBe('true')
    expect(
      ranged
        .elementWith('#fixture-date-picker-grid')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    fireEvent.click(ranged.elementWith('#fixture-date-picker-trigger'))
    ranged.repaint()

    fireEvent.click(ranged.elementWith('#fixture-date-picker-cell-2026-4-10'))
    ranged.repaint()
    expect(DatePicker.isOpen(ranged.fixture.datePickerState())).toBe(true)

    fireEvent.click(ranged.elementWith('#fixture-date-picker-cell-2026-4-14'))
    ranged.repaint()
    expect(DatePicker.isClosed(ranged.fixture.datePickerState())).toBe(true)
    expect(
      DatePicker.selectedRangeOf(ranged.fixture.datePickerState()),
    ).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 10),
        end: DateGrid.makeDate(2026, 4, 14),
      }),
    )

    // Reopen, click NextMonthButton, then Escape closes keeping range
    fireEvent.click(ranged.elementWith('#fixture-date-picker-trigger'))
    ranged.repaint()
    fireEvent.click(ranged.elementWith('#fixture-date-picker-next-month'))
    ranged.repaint()
    expect(ranged.elementWith('#fixture-date-picker-heading').textContent).toBe(
      '2026-05',
    )

    ranged.fixture.send(DatePicker.PressedDatePickerKey({ key: 'Escape' }))
    ranged.repaint()
    expect(DatePicker.isClosed(ranged.fixture.datePickerState())).toBe(true)
  })
})
