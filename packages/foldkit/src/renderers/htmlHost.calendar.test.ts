import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Calendar from '../behavior/calendar.js'
import * as DateGrid from '../behavior/dateGrid.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as CalendarFixture from '../test/calendarFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Calendar Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Calendar-specific painter
// logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
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

const stage = (overrides: Partial<Calendar.Props> = {}) => {
  const fixture = CalendarFixture.start(overrides)
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
    throw new Error(`the painted calendar fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Calendar Part on the HTML generic host', () => {
  it('projects grid/gridcell WAI-ARIA, roving tabindex, click selection, disabled skipping, month stepping, and view zoom', () => {
    const staged = stage()

    const heading = staged.elementWith('#fixture-calendar-heading')
    expect(heading.textContent).toBe('2026-04')
    expect(heading.getAttribute('aria-live')).toBe('polite')
    expect(heading.getAttribute('aria-atomic')).toBe('true')

    const grid = staged.elementWith('#fixture-calendar-grid')
    expect(grid.getAttribute('role')).toBe('grid')
    expect(grid.getAttribute('aria-labelledby')).toBe(
      'fixture-calendar-heading',
    )
    expect(grid.getAttribute('aria-activedescendant')).toBe(
      'fixture-calendar-cell-2026-4-13',
    )
    expect(grid.getAttribute('aria-multiselectable')).toBeNull()

    const todayCell = staged.elementWith('#fixture-calendar-cell-2026-4-13')
    const disabledCell = staged.elementWith('#fixture-calendar-cell-2026-4-15')
    expect(todayCell.getAttribute('role')).toBe('gridcell')
    expect(todayCell.getAttribute('aria-current')).toBe('true')
    expect(todayCell.getAttribute('aria-selected')).toBe('false')
    expect(todayCell.getAttribute('tabindex')).toBe('0')
    expect(disabledCell.getAttribute('aria-disabled')).toBe('true')
    expect(disabledCell.getAttribute('tabindex')).toBe('-1')

    // Click April 14 -> selected, roving tabindex moves to April 14
    staged.elementWith('#fixture-calendar-cell-2026-4-14').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-14')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-14')
        .getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-13')
        .getAttribute('tabindex'),
    ).toBe('-1')

    // ArrowRight skips disabled April 15 -> April 16; Enter selects April 16
    staged.fixture.send(Calendar.PressedCalendarKey({ key: 'ArrowRight' }))
    staged.fixture.send(Calendar.PressedCalendarKey({ key: 'Enter' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-calendar-grid')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-calendar-cell-2026-4-16')
    expect(
      staged
        .elementWith('#fixture-calendar-cell-2026-4-16')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // Click NextMonthButton -> heading becomes 2026-05
    staged.elementWith('#fixture-calendar-next-month').click()
    staged.repaint()
    expect(staged.elementWith('#fixture-calendar-heading').textContent).toBe(
      '2026-05',
    )

    // Click PreviousMonthButton -> heading returns to 2026-04
    staged.elementWith('#fixture-calendar-prev-month').click()
    staged.repaint()
    expect(staged.elementWith('#fixture-calendar-heading').textContent).toBe(
      '2026-04',
    )

    // Click Heading -> zooms out to Month view (heading shows 2026)
    staged.elementWith('#fixture-calendar-heading').click()
    staged.repaint()
    expect(Calendar.viewModeOf(staged.fixture.calendarState())).toBe('Month')
    expect(staged.elementWith('#fixture-calendar-heading').textContent).toBe(
      '2026',
    )
  })

  it('projects aria-multiselectable and selects inclusive normalized date ranges in Range mode', () => {
    const ranged = stage({ selectionMode: 'Range' })

    expect(
      ranged
        .elementWith('#fixture-calendar-grid')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    // Select April 18 then April 12 -> normalizes to [2026-04-12 .. 2026-04-18]
    ranged.elementWith('#fixture-calendar-cell-2026-4-18').click()
    ranged.repaint()
    ranged.elementWith('#fixture-calendar-cell-2026-4-12').click()
    ranged.repaint()

    expect(Calendar.selectedRangeOf(ranged.fixture.calendarState())).toEqual(
      Option.some({
        start: DateGrid.makeDate(2026, 4, 12),
        end: DateGrid.makeDate(2026, 4, 18),
      }),
    )
    expect(
      ranged
        .elementWith('#fixture-calendar-cell-2026-4-12')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      ranged
        .elementWith('#fixture-calendar-cell-2026-4-14')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      ranged
        .elementWith('#fixture-calendar-cell-2026-4-18')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      ranged
        .elementWith('#fixture-calendar-cell-2026-4-19')
        .getAttribute('aria-selected'),
    ).toBe('false')
  })
})
