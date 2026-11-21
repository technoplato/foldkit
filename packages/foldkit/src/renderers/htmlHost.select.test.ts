import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Select from '../behavior/select.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as SelectFixture from '../test/selectFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Select Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Select-specific painter
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

const stage = (overrides: Partial<Select.Props> = {}) => {
  const fixture = SelectFixture.start(overrides)
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
    throw new Error(`the painted select fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Select Part on the HTML generic host', () => {
  it('projects combobox/listbox/option WAI-ARIA, opens and selects via trigger and keyboard, skips disabled options, and supports closed/open typeahead', async () => {
    const staged = stage({ isInvalid: true })

    const trigger = staged.elementWith('#fixture-select-trigger')
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe('fixture-select-content')
    expect(trigger.getAttribute('aria-labelledby')).toBe('fixture-select-label')
    expect(trigger.getAttribute('aria-describedby')).toBe(
      'fixture-select-description fixture-select-error',
    )
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.textContent).toBe('Choose a fruit')

    const content = staged.elementWith('#fixture-select-content')
    expect(content.getAttribute('role')).toBe('listbox')
    expect(content.hasAttribute('hidden')).toBe(true)
    expect(content.getAttribute('aria-multiselectable')).toBeNull()

    const errorEl = staged.elementWith('#fixture-select-error')
    expect(errorEl.hasAttribute('hidden')).toBe(false)

    // Closed typeahead 'd' selects Date directly while remaining closed, and WaitToClearSelectSearch resets query after 350ms
    staged.fixture.send(Select.PressedTriggerKey({ key: 'd' }))
    expect(Select.searchQueryOf(staged.fixture.selectState())).toBe('d')
    await staged.fixture.elapse(350)
    expect(Select.searchQueryOf(staged.fixture.selectState())).toBe('')
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-select-trigger').textContent).toBe(
      'Date',
    )

    // Click trigger opens popup highlighting selected Date (index 4)
    staged.elementWith('#fixture-select-trigger').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-select-content').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      staged
        .elementWith('#fixture-select-content')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-select-option-4')

    // ArrowUp moves to Cherry (3), ArrowUp again skips disabled Banana (2) -> Apricot (1)
    staged.fixture.send(Select.PressedSelectKey({ key: 'ArrowUp' }))
    staged.fixture.send(Select.PressedSelectKey({ key: 'ArrowUp' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-select-content')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-select-option-1')
    expect(
      staged
        .elementWith('#fixture-select-option-2')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Click Cherry -> selects Cherry and closes popup in single mode
    staged.elementWith('#fixture-select-option-3').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-select-trigger').textContent).toBe(
      'Cherry',
    )
    expect(
      staged
        .elementWith('#fixture-select-option-3')
        .getAttribute('aria-selected'),
    ).toBe('true')
  })

  it('supports Multiple mode aria-multiselectable, staying open on option toggle, and Escape dismissal', () => {
    const multi = stage({ selectionMode: 'Multiple' })

    expect(
      multi
        .elementWith('#fixture-select-content')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    multi.elementWith('#fixture-select-trigger').click()
    multi.repaint()

    // Select Apple and Cherry; popup stays open in multiple mode
    multi.elementWith('#fixture-select-option-0').click()
    multi.elementWith('#fixture-select-option-3').click()
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(multi.elementWith('#fixture-select-trigger').textContent).toBe(
      'Apple, Cherry',
    )
    expect(
      multi
        .elementWith('#fixture-select-option-0')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-select-option-3')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // Escape closes the popup while keeping both selections
    multi.fixture.send(Select.PressedSelectKey({ key: 'Escape' }))
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(
      multi.elementWith('#fixture-select-content').hasAttribute('hidden'),
    ).toBe(true)
    expect(Select.selectedValuesOf(multi.fixture.selectState())).toEqual([
      'apple',
      'cherry',
    ])
  })
})
