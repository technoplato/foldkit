import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Combobox from '../behavior/combobox.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as ComboboxFixture from '../test/comboboxFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Combobox Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Combobox-specific painter
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

const stage = (overrides: Partial<Combobox.Props> = {}) => {
  const fixture = ComboboxFixture.start(overrides)
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
    throw new Error(`the painted combobox fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Combobox Part on the HTML generic host', () => {
  it('projects combobox/listbox/option WAI-ARIA, filters live via ListFilter on input, navigates keyboard, selects, and clears', () => {
    const staged = stage({ isRequired: true, isInvalid: true, nullable: true })

    const input = staged.elementWith('#fixture-combobox-input')
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-haspopup')).toBe('listbox')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-controls')).toBe('fixture-combobox-content')
    expect(input.getAttribute('aria-labelledby')).toBe('fixture-combobox-label')
    expect(input.getAttribute('aria-describedby')).toBe(
      'fixture-combobox-description fixture-combobox-error',
    )
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(input.getAttribute('aria-invalid')).toBe('true')

    const content = staged.elementWith('#fixture-combobox-content')
    expect(content.getAttribute('role')).toBe('listbox')
    expect(content.hasAttribute('hidden')).toBe(true)
    expect(content.getAttribute('aria-multiselectable')).toBeNull()

    // Clear button hidden while empty
    expect(
      staged.elementWith('#fixture-combobox-clear').hasAttribute('hidden'),
    ).toBe(true)

    // Typing 'creme' opens popup, filters via accent-folded ListFilter to Crème Brûlée (option-3), and sets aria-activedescendant
    if (input instanceof HTMLInputElement) {
      input.value = 'creme'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-combobox-option-3')
    expect(
      staged.elementWith('#fixture-combobox-content').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged.root.querySelectorAll('#fixture-combobox-content [role="option"]'),
    ).toHaveLength(1)
    expect(
      staged.elementWith('#fixture-combobox-clear').hasAttribute('hidden'),
    ).toBe(false)

    // Enter selects Crème Brûlée, closes popup, replaces input with label
    staged.fixture.send(Combobox.PressedComboboxKey({ key: 'Enter' }))
    staged.repaint()
    expect(Combobox.selectedValuesOf(staged.fixture.comboboxState())).toEqual([
      'creme',
    ])
    expect(Combobox.inputValueOf(staged.fixture.comboboxState())).toBe(
      'Crème Brûlée',
    )
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-expanded'),
    ).toBe('false')

    // Clear button clears both selection and input
    staged.elementWith('#fixture-combobox-clear').click()
    staged.repaint()
    expect(Combobox.isSelectionEmpty(staged.fixture.comboboxState())).toBe(true)
    expect(Combobox.inputValueOf(staged.fixture.comboboxState())).toBe('')
  })

  it('supports Multiple mode aria-multiselectable, staying open on selection, Backspace tag removal, and Escape dismissal', () => {
    const multi = stage({ selectionMode: 'Multiple' })

    expect(
      multi
        .elementWith('#fixture-combobox-content')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    // Click trigger opens full list
    multi.elementWith('#fixture-combobox-trigger').click()
    multi.repaint()
    expect(
      multi.root.querySelectorAll('#fixture-combobox-content [role="option"]'),
    ).toHaveLength(5)
    expect(
      multi
        .elementWith('#fixture-combobox-option-2')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Select Apple and Cherry; stays open in Multiple mode
    multi.elementWith('#fixture-combobox-option-0').click()
    multi.elementWith('#fixture-combobox-option-4').click()
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
      'cherry',
    ])

    // Backspace on empty input removes last selected value ('cherry')
    multi.fixture.send(Combobox.PressedComboboxKey({ key: 'Backspace' }))
    multi.repaint()
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
    ])

    // Escape closes popup while preserving 'apple'
    multi.fixture.send(Combobox.PressedComboboxKey({ key: 'Escape' }))
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
    ])
  })
})
