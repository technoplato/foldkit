import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Checkbox from '../behavior/checkbox.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as CheckboxFixture from '../test/checkboxFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Checkbox Part on the HTML painter through the existing
// generic slot attributes, with zero Checkbox-specific painter logic.

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

const vnodesOf = (node: Vnode | string): ReadonlyArray<Vnode> =>
  typeof node === 'string'
    ? []
    : [node, ...(node.children ?? []).flatMap(vnodesOf)]

const stageRunning = (fixture: CheckboxFixture.Running) => {
  const root = document.createElement('div')
  document.body.append(root)

  let latestVnode = paintedOf(fixture.tree(), fixture.press)
  const repaint = (): void => {
    latestVnode = paintedOf(fixture.tree(), fixture.press)
    root.replaceChildren(elementOf(latestVnode))
  }
  repaint()

  const vnodeWithId = (id: string): Vnode =>
    Option.getOrThrow(
      Array.findFirst(
        vnodesOf(latestVnode),
        node => node.data?.attrs?.['id'] === id,
      ),
    )

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted checkbox fixture has no ${selector}`)
  }

  return {
    fixture,
    repaint,
    vnodeWithId,
    elementWith,
    strike: () => {
      root.remove()
    },
  }
}

const struck: Array<() => void> = []

afterEach(() => {
  struck.splice(0).forEach(strike => {
    strike()
  })
})

const staged = (
  overrides: Partial<Checkbox.Props> = {},
  options: Readonly<{ initial?: Checkbox.State }> = {},
) => {
  const made = stageRunning(CheckboxFixture.start(overrides, options))
  struck.push(made.strike)
  return made
}

describe('core Checkbox Part on the HTML generic host', () => {
  it('paints WAI-ARIA role, checked/mixed states, label/description linkage, and toggles via control click, label click, and Space key', () => {
    const made = staged()

    const control = made.elementWith('#fixture-checkbox-control')
    const label = made.elementWith('#fixture-checkbox-label')
    const description = made.elementWith('#fixture-checkbox-description')

    expect(control.getAttribute('role')).toBe('checkbox')
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(control.getAttribute('aria-labelledby')).toBe(
      'fixture-checkbox-label',
    )
    expect(control.getAttribute('aria-describedby')).toBe(
      'fixture-checkbox-description',
    )
    expect(control.getAttribute('tabindex')).toBe('0')
    expect(label.id).toBe('fixture-checkbox-label')
    expect(description.id).toBe('fixture-checkbox-description')

    // Click control -> Checked
    control.click()
    made.repaint()
    expect(made.fixture.checkboxState()).toEqual(Checkbox.Checked())
    expect(
      made
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    // Click label -> Unchecked
    made.elementWith('#fixture-checkbox-label').click()
    made.repaint()
    expect(made.fixture.checkboxState()).toEqual(Checkbox.Unchecked())
    expect(
      made
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('false')

    // Space toggles, Enter does not toggle per WAI-ARIA
    made.fixture.send(Checkbox.PressedCheckboxKey({ key: ' ' }))
    made.repaint()
    expect(
      made
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    made.fixture.send(Checkbox.PressedCheckboxKey({ key: 'Enter' }))
    made.repaint()
    expect(
      made
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    // SetCheckboxIndeterminate -> aria-checked="mixed", next toggle -> Checked
    made.fixture.send(Checkbox.SetCheckboxIndeterminate())
    made.repaint()
    expect(
      made
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('mixed')

    made.elementWith('#fixture-checkbox-control').click()
    made.repaint()
    expect(made.fixture.checkboxState()).toEqual(Checkbox.Checked())
    expect(
      made
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('paints disabled, readOnly, required, and invalid ARIA attributes and blocks toggling when disabled or readOnly', () => {
    const disabled = staged(
      {
        id: 'disabled-box',
        isDisabled: true,
        isRequired: true,
        isInvalid: true,
      },
      { initial: Checkbox.Indeterminate() },
    )
    const disabledControl = disabled.elementWith('#disabled-box-control')
    expect(disabledControl.getAttribute('aria-checked')).toBe('mixed')
    expect(disabledControl.getAttribute('aria-disabled')).toBe('true')
    expect(disabledControl.getAttribute('aria-required')).toBe('true')
    expect(disabledControl.getAttribute('aria-invalid')).toBe('true')
    expect(
      disabled.vnodeWithId('disabled-box-control').data?.on?.['click'],
    ).toBeUndefined()

    disabled.fixture.press(Checkbox.ToggleCheckbox.tag)
    disabled.repaint()
    expect(disabled.fixture.checkboxState()).toEqual(Checkbox.Indeterminate())

    const readOnly = staged(
      { id: 'readonly-box', isReadOnly: true },
      { initial: Checkbox.Checked() },
    )
    const readOnlyControl = readOnly.elementWith('#readonly-box-control')
    expect(readOnlyControl.getAttribute('aria-checked')).toBe('true')
    expect(readOnlyControl.getAttribute('aria-readonly')).toBe('true')
    expect(
      readOnly.vnodeWithId('readonly-box-control').data?.on?.['click'],
    ).toBeUndefined()

    readOnly.fixture.send(Checkbox.PressedCheckboxKey({ key: ' ' }))
    readOnly.repaint()
    expect(readOnly.fixture.checkboxState()).toEqual(Checkbox.Checked())
  })
})
