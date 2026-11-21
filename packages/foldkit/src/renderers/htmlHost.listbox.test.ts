import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Listbox from '../behavior/listbox.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as ListboxFixture from '../test/listboxFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Listbox Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Listbox-specific painter
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

const stage = (overrides: Partial<Listbox.Props> = {}) => {
  const fixture = ListboxFixture.start(overrides)
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
    throw new Error(`the painted listbox fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Listbox Part on the HTML generic host', () => {
  it('projects listbox/option WAI-ARIA, active-descendant, click selection, disabled skipping, and typeahead', () => {
    const staged = stage()

    const label = staged.elementWith('#fixture-listbox-label')
    expect(label.id).toBe('fixture-listbox-label')

    const listbox = staged.elementWith('#fixture-listbox-items')
    expect(listbox.getAttribute('role')).toBe('listbox')
    expect(listbox.getAttribute('aria-orientation')).toBe('vertical')
    expect(listbox.getAttribute('aria-labelledby')).toBe(
      'fixture-listbox-label',
    )
    expect(listbox.getAttribute('aria-multiselectable')).toBeNull()
    expect(listbox.getAttribute('tabindex')).toBe('0')

    const option0 = staged.elementWith('#fixture-listbox-item-0')
    const option2 = staged.elementWith('#fixture-listbox-item-2')
    expect(option0.getAttribute('role')).toBe('option')
    expect(option0.getAttribute('aria-selected')).toBe('false')
    expect(option2.getAttribute('aria-disabled')).toBe('true')

    // Click option 1 (Apricot) -> selects Apricot and updates aria-activedescendant
    staged.elementWith('#fixture-listbox-item-1').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-listbox-item-1')
    expect(
      staged
        .elementWith('#fixture-listbox-item-1')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // ArrowDown skips disabled Banana (index 2) -> highlights Cherry (index 3)
    staged.fixture.send(Listbox.PressedListboxKey({ key: 'ArrowDown' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-listbox-item-3')
    expect(
      staged
        .elementWith('#fixture-listbox-item-3')
        .getAttribute('aria-current'),
    ).toBe('true')

    // Space selects Cherry; Apricot is deselected in single mode
    staged.fixture.send(Listbox.PressedListboxKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-listbox-item-3')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-listbox-item-1')
        .getAttribute('aria-selected'),
    ).toBe('false')

    // Typeahead 'd' jumps to Date (index 4)
    staged.fixture.send(Listbox.PressedListboxKey({ key: 'd' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-listbox-item-4')
  })

  it('projects aria-multiselectable, Shift+Arrow range selection, Mod+A select all, and horizontal orientation', () => {
    const multi = stage({
      selectionMode: 'Multiple',
      orientation: 'Horizontal',
    })

    const listbox = multi.elementWith('#fixture-listbox-items')
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true')
    expect(listbox.getAttribute('aria-orientation')).toBe('horizontal')

    // Click Apple, then Shift+ArrowRight twice -> Apple, Apricot, Cherry (skips Banana)
    multi.elementWith('#fixture-listbox-item-0').click()
    multi.fixture.send(
      Listbox.PressedListboxKey({ key: 'ArrowRight', isShift: true }),
    )
    multi.fixture.send(
      Listbox.PressedListboxKey({ key: 'ArrowRight', isShift: true }),
    )
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-listbox-item-0')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-listbox-item-1')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-listbox-item-2')
        .getAttribute('aria-selected'),
    ).toBe('false')
    expect(
      multi
        .elementWith('#fixture-listbox-item-3')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // Mod+A selects Date as well
    multi.fixture.send(Listbox.PressedListboxKey({ key: 'a', isMeta: true }))
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-listbox-item-4')
        .getAttribute('aria-selected'),
    ).toBe('true')
  })
})
