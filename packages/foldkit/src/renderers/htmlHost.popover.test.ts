import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Popover from '../behavior/popover.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as PopoverFixture from '../test/popoverFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Popover Part on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero Popover-specific painter logic.

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

const stage = (mode: 'non-modal' | 'modal' = 'non-modal') => {
  const fixture =
    mode === 'modal' ? PopoverFixture.startModal() : PopoverFixture.start()
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
    throw new Error(`the painted popover fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('core Popover Part on the HTML generic host', () => {
  it('opens non-modal popover, projects WAI-ARIA, dismisses on blur/Escape/backdrop, and restores return focus appropriately', () => {
    const staged = stage('non-modal')

    const trigger = staged.elementWith('#fixture-popover-button')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-controls')).toBe('fixture-popover-panel')

    // Click trigger -> opens Popover and projects non-modal ARIA on Panel + CloseButton
    trigger.click()
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-popover-button')
        .getAttribute('aria-expanded'),
    ).toBe('true')

    const panel = staged.elementWith('#fixture-popover-panel')
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('false')
    expect(panel.getAttribute('aria-activedescendant')).toBe(
      'fixture-popover-close',
    )
    expect(
      staged.elementWith('#fixture-popover-close').getAttribute('aria-current'),
    ).toBe('true')

    // Panel blur closes without returning focus to trigger button
    staged.fixture.send(Popover.BlurredPopoverPanel())
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.none(),
    )

    // Reopen and dismiss via backdrop -> restores focus to trigger button
    staged.elementWith('#fixture-popover-button').click()
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    staged.elementWith('#fixture-popover-backdrop').click()
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-popover-button'),
    )

    // Reopen and dismiss via Escape
    staged.elementWith('#fixture-popover-button').click()
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    staged.fixture.send(Popover.PressedPopoverKey({ key: 'Escape' }))
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
  })

  it('projects modal popover aria-modal true, traps Tab focus, and closes via CloseButton', () => {
    const staged = stage('modal')

    staged.elementWith('#fixture-modal-popover-button').click()
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)

    const panel = staged.elementWith('#fixture-modal-popover-panel')
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('aria-activedescendant')).toBe(
      'fixture-modal-popover-close',
    )

    // Tab wraps focus inside modal popover
    staged.fixture.send(Popover.PressedPopoverKey({ key: 'Tab' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-modal-popover-panel')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-modal-popover-apply')
    expect(
      staged
        .elementWith('#fixture-modal-popover-close')
        .getAttribute('aria-current'),
    ).toBe('false')

    // Close button closes modal popover and restores focus
    staged.elementWith('#fixture-modal-popover-close').click()
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-modal-popover-button'),
    )
  })
})
