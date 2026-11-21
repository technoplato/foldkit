import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Input from '../behavior/input.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as InputFixture from '../test/inputFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Input Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Input-specific painter
// logic.

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

const stage = (overrides: Partial<Input.Props> = {}) => {
  const fixture = InputFixture.start(overrides)
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
    throw new Error(`the painted input fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Input Part on the HTML generic host', () => {
  it('projects textbox WAI-ARIA, handles typing, commit, cancel, and clear through generic slot attributes', () => {
    const staged = stage({ isRequired: true, isInvalid: true })

    const input = staged.elementWith('#fixture-input-input')
    expect(input.getAttribute('role')).toBe('textbox')
    expect(input.getAttribute('aria-labelledby')).toBe('fixture-input-label')
    expect(input.getAttribute('aria-describedby')).toBe(
      'fixture-input-description fixture-input-error',
    )
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('tabindex')).toBe('0')

    // Clear button hidden while empty
    expect(
      staged.elementWith('#fixture-input-clear').hasAttribute('hidden'),
    ).toBe(true)

    // Label click begins editing
    staged.elementWith('#fixture-input-label').click()
    staged.repaint()
    expect(Input.isEditing(staged.fixture.inputState())).toBe(true)

    // Typing dispatches ChangeInput through generic TextInput token
    const field = staged.elementWith('#fixture-input-input')
    if (field instanceof HTMLInputElement) {
      field.value = 'Ada Lovelace'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    staged.repaint()
    expect(Input.draftOf(staged.fixture.inputState())).toBe('Ada Lovelace')
    expect(Input.isDirty(staged.fixture.inputState())).toBe(true)
    expect(
      staged.elementWith('#fixture-input-clear').hasAttribute('hidden'),
    ).toBe(false)

    // Enter commits
    staged.fixture.send(Input.PressedInputKey({ key: 'Enter' }))
    staged.repaint()
    expect(Input.isIdle(staged.fixture.inputState())).toBe(true)
    expect(Input.valueOf(staged.fixture.inputState())).toBe('Ada Lovelace')

    // Clicking clear empties the field
    staged.elementWith('#fixture-input-clear').click()
    staged.repaint()
    expect(Input.valueOf(staged.fixture.inputState())).toBe('')
    expect(
      staged.elementWith('#fixture-input-clear').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('toggles password visibility via the VisibilityToggle slot', () => {
    const staged = stage({ type: 'password' })

    const toggle = staged.elementWith('#fixture-input-visibility')
    expect(toggle.hasAttribute('hidden')).toBe(false)
    expect(toggle.getAttribute('aria-controls')).toBe('fixture-input-input')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('Show password')

    toggle.click()
    staged.repaint()
    expect(Input.isPasswordVisible(staged.fixture.inputState())).toBe(true)
    expect(
      Input.effectiveInputTypeOf(staged.fixture.inputState(), {
        type: 'password',
      }),
    ).toBe('text')
    expect(
      staged
        .elementWith('#fixture-input-visibility')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-input-visibility')
        .getAttribute('aria-label'),
    ).toBe('Hide password')
  })

  it('projects disabled and readOnly ARIA and refuses edits', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'locked' })
    const disabledInput = disabled.elementWith('#fixture-input-input')
    expect(disabledInput.getAttribute('aria-disabled')).toBe('true')
    expect(disabledInput.getAttribute('tabindex')).toBe('-1')
    disabled.fixture.type(`${Input.ChangeInput.tag}:`, 'changed')
    disabled.repaint()
    expect(Input.draftOf(disabled.fixture.inputState())).toBe('locked')

    const readOnly = stage({ isReadOnly: true, defaultValue: 'readonly' })
    expect(
      readOnly
        .elementWith('#fixture-input-input')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    readOnly.fixture.type(`${Input.ChangeInput.tag}:`, 'changed')
    readOnly.repaint()
    expect(Input.draftOf(readOnly.fixture.inputState())).toBe('readonly')
  })
})
