import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Toggle from '../behavior/toggle.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as ToggleFixture from '../test/toggleFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Toggle Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Toggle- or Button-specific
// painter logic.

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

const stage = (overrides: Partial<Toggle.Props> = {}) => {
  const fixture = ToggleFixture.start(overrides)
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
    throw new Error(`the painted toggle fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Toggle Part on the HTML generic host', () => {
  it('projects role=button and WAI-ARIA aria-pressed, toggles on button/label click and keyboard, and handles SetButtonPressed', () => {
    const staged = stage()

    const button = staged.elementWith('#fixture-toggle-button')
    expect(button.getAttribute('role')).toBe('button')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-labelledby')).toBe('fixture-toggle-label')
    expect(button.getAttribute('aria-describedby')).toBe(
      'fixture-toggle-description',
    )
    expect(button.getAttribute('tabindex')).toBe('0')

    expect(staged.elementWith('#fixture-toggle-label').id).toBe(
      'fixture-toggle-label',
    )
    expect(staged.elementWith('#fixture-toggle-description').id).toBe(
      'fixture-toggle-description',
    )

    button.click()
    staged.repaint()
    expect(Toggle.isPressed(staged.fixture.toggleState())).toBe(true)
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('true')

    staged.elementWith('#fixture-toggle-label').click()
    staged.repaint()
    expect(Toggle.isPressed(staged.fixture.toggleState())).toBe(false)
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('false')

    staged.fixture.send(Toggle.PressedButtonKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('true')

    staged.fixture.send(Toggle.PressedButtonKey({ key: 'Enter' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('false')

    staged.fixture.send(Toggle.SetButtonPressed({ isPressed: true }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('true')

    staged.fixture.send(Toggle.ResetToggle())
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('projects disabled ARIA and blocks toggles when disabled', () => {
    const disabled = stage({ isDisabled: true })
    const disabledButton = disabled.elementWith('#fixture-toggle-button')
    expect(disabledButton.getAttribute('aria-disabled')).toBe('true')
    expect(disabledButton.getAttribute('aria-pressed')).toBe('false')
    disabledButton.click()
    disabled.repaint()
    expect(Toggle.isPressed(disabled.fixture.toggleState())).toBe(false)
    disabled.fixture.press(Toggle.ToggleButton.tag)
    disabled.repaint()
    expect(Toggle.isPressed(disabled.fixture.toggleState())).toBe(false)
  })

  it('projects readOnly ARIA and blocks toggles when readOnly', () => {
    const readOnly = stage({ isReadOnly: true, defaultPressed: true })
    const readOnlyButton = readOnly.elementWith('#fixture-toggle-button')
    expect(readOnlyButton.getAttribute('aria-readonly')).toBe('true')
    expect(readOnlyButton.getAttribute('aria-pressed')).toBe('true')
    readOnlyButton.click()
    readOnly.repaint()
    expect(Toggle.isPressed(readOnly.fixture.toggleState())).toBe(true)
    readOnly.fixture.send(Toggle.PressedButtonKey({ key: ' ' }))
    readOnly.repaint()
    expect(Toggle.isPressed(readOnly.fixture.toggleState())).toBe(true)
  })
})
