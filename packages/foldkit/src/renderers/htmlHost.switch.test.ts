import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Switch from '../behavior/switch.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as SwitchFixture from '../test/switchFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Switch Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Switch-specific painter logic.

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

const stage = (overrides: Partial<Switch.Props> = {}) => {
  const fixture = SwitchFixture.start(overrides)
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
    throw new Error(`the painted switch fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Switch Part on the HTML generic host', () => {
  it('projects role=switch and WAI-ARIA, toggles on control/label click and keyboard, and handles explicit SetSwitchChecked', () => {
    const staged = stage()

    const control = staged.elementWith('#fixture-switch-control')
    expect(control.getAttribute('role')).toBe('switch')
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(control.getAttribute('aria-labelledby')).toBe('fixture-switch-label')
    expect(control.getAttribute('aria-describedby')).toBe(
      'fixture-switch-description',
    )
    expect(control.getAttribute('tabindex')).toBe('0')

    expect(staged.elementWith('#fixture-switch-label').id).toBe(
      'fixture-switch-label',
    )
    expect(staged.elementWith('#fixture-switch-description').id).toBe(
      'fixture-switch-description',
    )

    // Click control -> turns On
    control.click()
    staged.repaint()
    expect(Switch.isChecked(staged.fixture.switchState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    // Click label -> turns Off
    staged.elementWith('#fixture-switch-label').click()
    staged.repaint()
    expect(Switch.isChecked(staged.fixture.switchState())).toBe(false)
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('false')

    // Keyboard Space toggles On; SetSwitchChecked sets Off
    staged.fixture.send(Switch.PressedSwitchKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    staged.fixture.send(Switch.SetSwitchChecked({ isChecked: false }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('projects disabled and required ARIA and blocks toggles when disabled', () => {
    const disabled = stage({ isDisabled: true, isRequired: true })
    const disabledControl = disabled.elementWith('#fixture-switch-control')
    expect(disabledControl.getAttribute('aria-disabled')).toBe('true')
    expect(disabledControl.getAttribute('aria-required')).toBe('true')
    disabledControl.click()
    disabled.repaint()
    expect(Switch.isChecked(disabled.fixture.switchState())).toBe(false)
  })

  it('projects readOnly ARIA and blocks toggles when readOnly', () => {
    const readOnly = stage({ isReadOnly: true })
    const readOnlyControl = readOnly.elementWith('#fixture-switch-control')
    expect(readOnlyControl.getAttribute('aria-readonly')).toBe('true')
    readOnlyControl.click()
    readOnly.repaint()
    expect(Switch.isChecked(readOnly.fixture.switchState())).toBe(false)
  })
})
