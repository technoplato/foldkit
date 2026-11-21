import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as RadioGroup from '../behavior/radioGroup.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as RadioGroupFixture from '../test/radioGroupFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core RadioGroup Part on the HTML painter through the
// existing generic `htmlHost` (`slotAttributesOf`), with zero RadioGroup-
// specific painter logic.

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

const stage = (overrides: Partial<RadioGroup.Props> = {}) => {
  const fixture = RadioGroupFixture.start(overrides)
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
    throw new Error(`the painted radio group fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core RadioGroup Part on the HTML generic host', () => {
  it('projects radiogroup/radio WAI-ARIA, roving tabindex, click/label selection, arrow skipping, and Space selection', () => {
    const staged = stage()

    const group = staged.elementWith('#fixture-radio-group')
    expect(group.getAttribute('role')).toBe('radiogroup')
    expect(group.getAttribute('aria-orientation')).toBe('vertical')
    expect(group.getAttribute('aria-label')).toBe('Drawing tool')

    const option0 = staged.elementWith('#fixture-radio-option-0')
    const option1 = staged.elementWith('#fixture-radio-option-1')
    const option2 = staged.elementWith('#fixture-radio-option-2')

    expect(option0.getAttribute('role')).toBe('radio')
    expect(option0.getAttribute('aria-checked')).toBe('false')
    expect(option0.getAttribute('aria-labelledby')).toBe(
      'fixture-radio-option-0-label',
    )
    expect(option0.getAttribute('aria-describedby')).toBe(
      'fixture-radio-option-0-description',
    )
    expect(option0.getAttribute('tabindex')).toBe('0')

    expect(option1.getAttribute('tabindex')).toBe('-1')
    expect(option2.getAttribute('aria-disabled')).toBe('true')
    expect(option2.getAttribute('tabindex')).toBe('-1')

    expect(staged.elementWith('#fixture-radio-option-0-label').id).toBe(
      'fixture-radio-option-0-label',
    )
    expect(staged.elementWith('#fixture-radio-option-0-description').id).toBe(
      'fixture-radio-option-0-description',
    )

    // Space selects the initially focused option (Brush)
    staged.fixture.send(RadioGroup.PressedRadioKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-radio-option-0')
        .getAttribute('aria-checked'),
    ).toBe('true')

    // Click option 1 label -> selects Fill and moves roving tabindex
    staged.elementWith('#fixture-radio-option-1-label').click()
    staged.repaint()
    expect(
      RadioGroup.selectedValueOf(
        staged.fixture.radioGroupState(),
        staged.fixture.props,
      ),
    ).toEqual(Option.some('fill'))
    expect(
      staged
        .elementWith('#fixture-radio-option-1')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-radio-option-1').getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged.elementWith('#fixture-radio-option-0').getAttribute('tabindex'),
    ).toBe('-1')

    // Pressing disabled option 2 (Eraser) is ignored
    staged.fixture.press('SelectRadioOption:eraser')
    staged.repaint()
    expect(
      RadioGroup.selectedValueOf(
        staged.fixture.radioGroupState(),
        staged.fixture.props,
      ),
    ).toEqual(Option.some('fill'))

    // ArrowDown skips disabled Eraser (index 2) -> selects Lasso (index 3)
    staged.fixture.send(RadioGroup.PressedRadioKey({ key: 'ArrowDown' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-radio-option-3')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-radio-option-3').getAttribute('tabindex'),
    ).toBe('0')
  })

  it('supports horizontal RTL arrows, disabled-selected tab-stop fallback, and readOnly navigation', () => {
    const rtl = stage({
      orientation: 'Horizontal',
      direction: 'Rtl',
      defaultValue: 'brush',
    })
    expect(
      rtl.elementWith('#fixture-radio-group').getAttribute('aria-orientation'),
    ).toBe('horizontal')
    rtl.fixture.send(RadioGroup.PressedRadioKey({ key: 'ArrowLeft' }))
    rtl.repaint()
    expect(
      rtl.elementWith('#fixture-radio-option-1').getAttribute('aria-checked'),
    ).toBe('true')

    // Crucial roving-tabindex invariant: disabled selected option does not hold tabindex=0
    const disabledSelected = stage({ defaultValue: 'eraser' })
    expect(
      disabledSelected
        .elementWith('#fixture-radio-option-2')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      disabledSelected
        .elementWith('#fixture-radio-option-2')
        .getAttribute('tabindex'),
    ).toBe('-1')
    expect(
      disabledSelected
        .elementWith('#fixture-radio-option-0')
        .getAttribute('tabindex'),
    ).toBe('0')

    // Read-only group navigates focus without changing selection
    const readOnly = stage({
      isReadOnly: true,
      isRequired: true,
      defaultValue: 'brush',
    })
    expect(
      readOnly
        .elementWith('#fixture-radio-group')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    expect(
      readOnly
        .elementWith('#fixture-radio-group')
        .getAttribute('aria-required'),
    ).toBe('true')
    readOnly.fixture.send(RadioGroup.PressedRadioKey({ key: 'ArrowDown' }))
    readOnly.repaint()
    expect(
      readOnly
        .elementWith('#fixture-radio-option-0')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      readOnly.elementWith('#fixture-radio-option-1').getAttribute('tabindex'),
    ).toBe('0')
  })
})
