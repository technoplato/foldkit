import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as DateGrid from '../behavior/dateGrid.js'
import * as DatePicker from '../behavior/datePicker.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as DatePickerFixture from '../test/datePickerFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core DatePicker Part on the HTML painter through the
// existing generic `htmlHost` (`slotAttributesOf`), with zero DatePicker-
// specific painter logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    props?: Readonly<Record<string, unknown>>
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const paintedOf = (tree: UiNode, onAction: (tag: string) => void): Vnode => {
  setHtmlRuntime(message => {
    if (typeof message === 'string') {
      onAction(message)
    }
  }, Context.empty())
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return paintHtml(tree, tag => tag) as unknown as Vnode
  } finally {
    clearHtmlRuntime()
  }
}

const elementOf = (node: Vnode): HTMLElement => {
  const tag = Option.getOrElse(
    Array.head((node.sel ?? 'div').split(/[.#]/u)),
    () => 'div',
  )
  const element = document.createElement(tag === '' ? 'div' : tag)
  Object.entries(node.data?.attrs ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, String(value))
  })
  if (
    element instanceof HTMLInputElement &&
    typeof node.data?.props?.['value'] === 'string'
  ) {
    element.value = node.data.props['value']
  }
  Object.entries(node.data?.class ?? {}).forEach(([name, isOn]) => {
    if (isOn) {
      element.classList.add(name)
    }
  })
  const clickHandler = node.data?.on?.['click']
  if (typeof clickHandler === 'function') {
    element.addEventListener('click', event => {
      clickHandler(event)
    })
  }
  const inputHandler = node.data?.on?.['input']
  if (typeof inputHandler === 'function') {
    element.addEventListener('input', event => {
      inputHandler(event)
    })
  }
  ;(node.children ?? []).forEach(child => {
    element.append(typeof child === 'string' ? child : elementOf(child))
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const roots: Array<HTMLElement> = []

afterEach(() => {
  roots.splice(0).forEach(root => root.remove())
})

const stage = (overrides: Partial<DatePicker.Props> = {}) => {
  const fixture = DatePickerFixture.start(overrides)
  const root = document.createElement('div')
  document.body.append(root)
  roots.push(root)

  const repaint = (): void => {
    root.replaceChildren(elementOf(paintedOf(fixture.tree(), fixture.press)))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted date picker fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core DatePicker Part on the HTML generic host', () => {
  it('projects dialog/trigger/textbox/grid WAI-ARIA, opens via trigger, selects and auto-closes, types ISO dates, and clears', () => {
    const staged = stage({ isRequired: true, isInvalid: true })

    const trigger = staged.elementWith('#fixture-date-picker-trigger')
    expect(trigger.getAttribute('role')).toBe('button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe(
      'fixture-date-picker-content',
    )
    expect(trigger.getAttribute('aria-labelledby')).toBe(
      'fixture-date-picker-label',
    )
    expect(trigger.getAttribute('aria-describedby')).toBe(
      'fixture-date-picker-description fixture-date-picker-error',
    )
    expect(trigger.getAttribute('aria-required')).toBe('true')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.textContent).toBe('Pick a date')

    const input = staged.elementWith('#fixture-date-picker-input')
    expect(input.getAttribute('role')).toBe('textbox')
    expect(input.getAttribute('aria-controls')).toBe(
      'fixture-date-picker-content',
    )
    expect(input.getAttribute('aria-expanded')).toBe('false')

    const content = staged.elementWith('#fixture-date-picker-content')
    expect(content.getAttribute('role')).toBe('dialog')
    expect(content.hasAttribute('hidden')).toBe(true)

    const clearBtn = staged.elementWith('#fixture-date-picker-clear')
    expect(clearBtn.hasAttribute('hidden')).toBe(true)
    expect(
      staged.elementWith('#fixture-date-picker-error').hasAttribute('hidden'),
    ).toBe(false)

    // Click trigger -> opens dialog exposing Calendar grid
    trigger.click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-date-picker-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-date-picker-content').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.elementWith('#fixture-date-picker-grid').getAttribute('role'),
    ).toBe('grid')
    expect(
      staged
        .elementWith('#fixture-date-picker-cell-2026-4-15')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Click April 14 -> selects date, auto-closes dialog, updates trigger/input, reveals clear button
    staged.elementWith('#fixture-date-picker-cell-2026-4-14').click()
    staged.repaint()
    expect(DatePicker.isClosed(staged.fixture.datePickerState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-date-picker-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-date-picker-trigger').textContent).toBe(
      '2026-04-14',
    )
    expect(
      staged.elementWith('#fixture-date-picker-clear').hasAttribute('hidden'),
    ).toBe(false)

    // Typing ISO date into generic TextInput updates draft and Enter commits
    const field = staged.elementWith('#fixture-date-picker-input')
    if (field instanceof HTMLInputElement) {
      field.value = '2026-05-08'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    staged.fixture.send(DatePicker.CommitDateInput())
    staged.repaint()
    expect(DatePicker.selectedDateOf(staged.fixture.datePickerState())).toEqual(
      Option.some(DateGrid.makeDate(2026, 5, 8)),
    )
    expect(staged.elementWith('#fixture-date-picker-trigger').textContent).toBe(
      '2026-05-08',
    )

    // Clicking ClearButton clears selection and hides ClearButton again
    staged.elementWith('#fixture-date-picker-clear').click()
    staged.repaint()
    expect(DatePicker.isSelectionEmpty(staged.fixture.datePickerState())).toBe(
      true,
    )
    expect(
      staged.elementWith('#fixture-date-picker-clear').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('supports Range mode with aria-multiselectable, staying open on start date, closing on end date, and Escape dismissal', () => {
    const ranged = stage({ selectionMode: 'Range' })

    expect(
      ranged
        .elementWith('#fixture-date-picker-grid')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    ranged.elementWith('#fixture-date-picker-trigger').click()
    ranged.repaint()

    // First click picks start date and keeps dialog open
    ranged.elementWith('#fixture-date-picker-cell-2026-4-18').click()
    ranged.repaint()
    expect(DatePicker.isOpen(ranged.fixture.datePickerState())).toBe(true)

    // Second click in reverse order completes normalized range and auto-closes
    ranged.elementWith('#fixture-date-picker-cell-2026-4-12').click()
    ranged.repaint()
    expect(DatePicker.isClosed(ranged.fixture.datePickerState())).toBe(true)
    expect(
      DatePicker.selectedRangeOf(ranged.fixture.datePickerState()),
    ).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 12),
        end: DateGrid.makeDate(2026, 4, 18),
      }),
    )
    expect(ranged.elementWith('#fixture-date-picker-trigger').textContent).toBe(
      '2026-04-12 - 2026-04-18',
    )

    // Reopen, step next month, then Escape closes preserving range
    ranged.elementWith('#fixture-date-picker-trigger').click()
    ranged.repaint()
    ranged.elementWith('#fixture-date-picker-next-month').click()
    ranged.repaint()
    expect(ranged.elementWith('#fixture-date-picker-heading').textContent).toBe(
      '2026-05',
    )

    ranged.fixture.send(DatePicker.PressedDatePickerKey({ key: 'Escape' }))
    ranged.repaint()
    expect(DatePicker.isClosed(ranged.fixture.datePickerState())).toBe(true)
    expect(
      DatePicker.selectedRangeOf(ranged.fixture.datePickerState()),
    ).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 12),
        end: DateGrid.makeDate(2026, 4, 18),
      }),
    )
  })
})
